import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const DB_FILE = path.join(ROOT, 'data', 'db.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function db() {
  return JSON.parse(readFileSync(DB_FILE, 'utf8'));
}

function saveDb(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toISOString();
}

function shortId() {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function applyFilters(rows, url) {
  const ignored = new Set(['select', 'order', 'limit', 'offset']);
  for (const [key, value] of url.searchParams.entries()) {
    if (ignored.has(key)) continue;
    const [op, ...rest] = value.split('.');
    const expected = rest.join('.');
    if (op === 'eq') rows = rows.filter((r) => String(r[key]) === expected);
    if (op === 'is') rows = rows.filter((r) => (expected === 'null' ? r[key] == null : String(r[key]) === expected));
  }
  const order = url.searchParams.get('order');
  if (order) {
    const [field, direction] = order.split('.');
    rows = [...rows].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
    if (direction === 'desc') rows.reverse();
  }
  const limit = url.searchParams.get('limit');
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

function project(row, select) {
  if (!select || select === '*') return row;
  // Good enough for the app's simple Supabase selects. Nested join selects fall back to full row.
  if (select.includes('!') || select.includes('(')) return row;
  const out = {};
  for (const col of select.split(',').map((s) => s.trim()).filter(Boolean)) out[col] = row[col];
  return out;
}

async function handleSupabaseRest(req, res, url) {
  const table = decodeURIComponent(url.pathname.replace('/supabase/rest/v1/', '').split('/')[0]);
  const data = db();
  if (!Object.hasOwn(data, table)) return json(res, 404, { message: `Unknown local table: ${table}` });
  const wantsObject = (req.headers.accept || '').includes('application/vnd.pgrst.object+json');

  if (req.method === 'GET') {
    let rows = applyFilters(data[table], url).map((r) => project(r, url.searchParams.get('select')));
    return json(res, 200, wantsObject ? (rows[0] ?? null) : rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  }

  if (req.method === 'PATCH') {
    const patch = await readBody(req);
    let changed = [];
    data[table] = data[table].map((row) => {
      if (applyFilters([row], url).length) {
        const next = { ...row, ...patch, updated_at: now() };
        changed.push(next);
        return next;
      }
      return row;
    });
    saveDb(data);
    changed = changed.map((r) => project(r, url.searchParams.get('select')));
    return json(res, 200, wantsObject ? (changed[0] ?? null) : changed);
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    let idBase = Math.max(0, ...data[table].map((r) => Number(r.id) || 0));
    const inserted = rows.map((r) => ({ id: ++idBase, created_at: now(), updated_at: now(), ...r }));
    data[table].push(...inserted);
    saveDb(data);
    const out = inserted.map((r) => project(r, url.searchParams.get('select')));
    return json(res, 201, wantsObject ? out[0] : out);
  }

  if (req.method === 'DELETE') {
    const removed = applyFilters(data[table], url);
    data[table] = data[table].filter((row) => !removed.includes(row));
    saveDb(data);
    return json(res, 200, removed);
  }

  return json(res, 405, { message: 'Method not allowed' });
}

async function handleRpc(req, res, url) {
  const fn = decodeURIComponent(url.pathname.replace('/supabase/rest/v1/rpc/', ''));
  const body = req.method === 'POST' ? await readBody(req) : {};
  const data = db();
  switch (fn) {
    case 'get_effective_plan': return json(res, 200, 'free');
    case 'is_team_active': return json(res, 200, false);
    case 'get_my_invites': return json(res, 200, []);
    case 'get_team_members': return json(res, 200, []);
    case 'get_revision_authors': return json(res, 200, []);
    case 'create_document_revision': {
      const doc = data.documents.find((d) => String(d.id) === String(body.doc_id));
      if (!doc) return json(res, 404, { message: 'Document not found' });
      const revs = data.document_revisions.filter((r) => String(r.document_id) === String(doc.id));
      const rev = { id: Math.max(0, ...data.document_revisions.map((r) => Number(r.id) || 0)) + 1, document_id: doc.id, revision_number: revs.length + 1, message: body.msg || null, author_id: null, snapshot: doc.document, created_at: now() };
      data.document_revisions.push(rev); saveDb(data); return json(res, 200, rev);
    }
    case 'restore_document_revision': {
      const rev = data.document_revisions.find((r) => String(r.id) === String(body.rev_id));
      if (!rev) return json(res, 404, { message: 'Revision not found' });
      const doc = data.documents.find((d) => String(d.id) === String(rev.document_id));
      doc.document = rev.snapshot; doc.updated_at = now(); saveDb(data); return json(res, 200, { ...rev, updated_at: doc.updated_at });
    }
    case 'set_document_team':
    case 'remove_document_team': return json(res, 200, now());
    case 'create_team':
    case 'accept_team_invite': return json(res, 200, null);
    default: return json(res, 200, null);
  }
}

async function handleLocalApi(req, res, url) {
  if (url.pathname === '/new' && req.method === 'POST') {
    const body = await readBody(req);
    const data = db();
    let sid = shortId();
    while (data.documents.some((d) => d.short_id === sid)) sid = shortId();
    const doc = { id: Math.max(0, ...data.documents.map((d) => Number(d.id) || 0)) + 1, short_id: sid, title: body.title || 'Untitled Harness', public: false, team_id: null, user_id: 'local-user', document: body.document || null, updated_at: now(), created_at: now() };
    data.documents.push(doc); saveDb(data);
    return json(res, 200, { id: doc.id, short_id: doc.short_id, title: doc.title });
  }
  if (url.pathname === '/stripe/subscription') return json(res, 200, { ownSubscription: 'free', details: 'Local free plan' });
  if (url.pathname.startsWith('/api/pdf/')) return text(res, 501, 'PDF export is not implemented in the local replacement yet.');
  return null;
}

function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';

  let file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) return null;

  if (existsSync(file) && statSync(file).isFile()) return file;
  if (existsSync(file) && statSync(file).isDirectory()) {
    const idx = path.join(file, 'index.html');
    if (existsSync(idx)) return idx;
  }

  const idx = path.join(ROOT, pathname, 'index.html');
  if (existsSync(idx)) return idx;

  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') return json(res, 204, null);

    if (url.pathname.startsWith('/supabase/auth/v1')) {
      if (url.pathname.endsWith('/user')) return json(res, 401, { message: 'Local auth is not configured' });
      if (url.pathname.endsWith('/logout')) return json(res, 204, null);
      return json(res, 200, { user: null, session: null });
    }
    if (url.pathname.startsWith('/supabase/rest/v1/rpc/')) return await handleRpc(req, res, url);
    if (url.pathname.startsWith('/supabase/rest/v1/')) return await handleSupabaseRest(req, res, url);
    if (url.pathname.startsWith('/supabase/realtime/v1')) return json(res, 200, {});

    const handled = await handleLocalApi(req, res, url);
    if (handled !== null) return;

    // Local no-op stubs for analytics endpoints so the mirror does not phone home.
    if (url.pathname.startsWith('/_vercel/insights')) {
      if (url.pathname.endsWith('.js')) return text(res, 200, 'export default {};', 'text/javascript; charset=utf-8');
      res.writeHead(204); res.end(); return;
    }

    const file = resolveFile(url.pathname);
    if (!file) return text(res, 404, 'Not found');

    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'cross-origin-opener-policy': 'same-origin-allow-popups',
    });
    createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    json(res, 500, { message: e?.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`Local mirror running at http://localhost:${PORT}`);
  console.log(`App demo route: http://localhost:${PORT}/zY/demo?allowEdit=true&allowControls=false&highlightNets=true&views=Schematic%2CLayout&theme=dark`);
});
