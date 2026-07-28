import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const USER_AGENT = 'Mozilla/5.0 local static mirror';
const INITIAL_URLS = [
  'https://www.harness.design/',
  'https://app.harness.design/zY/demo?allowEdit=true&allowControls=false&highlightNets=true&views=Schematic%2CLayout&theme=dark',
];
const ALLOWED_HOSTS = new Set([
  'www.harness.design',
  'harness.design',
  'app.harness.design',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);
const STATIC_EXT = /\.(?:html|js|css|mjs|json|map|png|jpe?g|svg|webp|gif|ico|avif|woff2?|ttf|otf|wasm|txt)$/i;
const TEXT_EXT = /\.(?:html|js|css|mjs|json|map|txt|svg)$/i;
const downloaded = new Map();
const queue = [];
const mapCandidates = new Set();

function isAssetLike(u, force = false) {
  if (force) return true;
  if (u.pathname.startsWith('/_vercel/insights') || u.pathname.includes('/insights/script')) return false;
  if (u.hostname === 'fonts.googleapis.com') return u.pathname.startsWith('/css');
  if (u.hostname === 'fonts.gstatic.com') return u.pathname !== '/';
  if (u.hostname === 'app.harness.design') return u.pathname.startsWith('/harness-design/_next/static/') || u.pathname === '/harness-design/icon.svg';
  if (u.hostname === 'www.harness.design' || u.hostname === 'harness.design') {
    return u.pathname === '/' || u.pathname.startsWith('/harness-design/assets/') || STATIC_EXT.test(u.pathname);
  }
  return STATIC_EXT.test(u.pathname);
}

function enqueue(url, from, force = false) {
  try {
    const u = new URL(url, from || undefined);
    if (!['http:', 'https:'].includes(u.protocol)) return;
    if (!ALLOWED_HOSTS.has(u.hostname)) return;
    if (!isAssetLike(u, force)) return;
    const key = u.href;
    if (!downloaded.has(key)) {
      downloaded.set(key, { status: 'queued', from });
      queue.push(u);
    }
  } catch {}
}

function sha(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 10);
}

function safeSegment(s) {
  return decodeURIComponent(s).replace(/[<>:"\\|?*]/g, '_');
}

function localPathFor(u, contentType = '') {
  let p = u.pathname;
  if (u.hostname === 'harness.design') p = u.pathname;

  // Main marketing page and app demo route.
  if ((u.hostname === 'www.harness.design' || u.hostname === 'harness.design') && p === '/') {
    return 'index.html';
  }
  if (u.hostname === 'app.harness.design' && p === '/harness-design/zY/demo') {
    return 'zY/demo/index.html';
  }

  // Third-party files are namespaced to avoid path collisions.
  if (u.hostname === 'fonts.googleapis.com') {
    return `vendor/fonts.googleapis.com/${safeSegment(p.replace(/^\//, '').replace(/\//g, '_') || 'index')}-${sha(u.search)}.css`;
  }
  if (u.hostname === 'fonts.gstatic.com') {
    return `vendor/fonts.gstatic.com/${safeSegment(p.replace(/^\//, ''))}`;
  }

  let rel = safeSegment(p.replace(/^\//, ''));
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (!path.extname(rel) && contentType.includes('text/html')) rel = path.join(rel, 'index.html');
  return rel;
}

function localUrlFor(u, contentType = '') {
  return '/' + localPathFor(u, contentType).replaceAll(path.sep, '/');
}

function shouldTryMap(u, contentType) {
  return /\.(?:js|css)(?:$|\?)/i.test(u.pathname) || /javascript|css/.test(contentType);
}

function extractUrls(text, baseUrl, contentType) {
  const found = new Set();
  const add = (s) => {
    if (!s) return;
    let v = s.trim().replaceAll('\\/', '/').replaceAll('&amp;', '&');
    if (v.startsWith('//')) v = 'https:' + v;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) found.add(v);
  };

  // HTML/CSS attributes and CSS url(...)
  for (const re of [
    /(?:src|href|poster|content)=["']([^"']+)["']/gi,
    /url\(["']?([^"')]+)["']?\)/gi,
    /@import\s+["']([^"']+)["']/gi,
    /sourceMappingURL=([^\s*]+)/gi,
    /["'`]((?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com\/[^"'`\\\s)]+)["'`]/gi,
  ]) {
    for (const m of text.matchAll(re)) add(m[1]);
  }

  // String literals containing static local/allowed absolute asset URLs.
  for (const m of text.matchAll(/["'`]((?:https?:)?\/\/[^"'`\\\s)]+|\/[^"'`\\\s)]+)["'`]/g)) {
    const s = m[1];
    if (s.startsWith('/')) {
      let pathname = '';
      try { pathname = new URL(s, baseUrl).pathname; } catch { continue; }
      if (!STATIC_EXT.test(pathname) && !s.startsWith('/harness-design/_next/static/')) continue;
    }
    add(s);
  }

  // Escaped Next flight data often contains \"/harness-design/_next/static/...\".
  for (const m of text.matchAll(/\\?"(\/_next\/static\/[^\\"]+)/g)) add(m[1]);

  // Turbopack dynamic imports use e.l("static/chunks/...") relative to /_next/.
  for (const m of text.matchAll(/["'`](static\/chunks\/[^"'`]+\.(?:js|css))["'`]/g)) {
    add('/harness-design/_next/' + m[1]);
  }

  for (const raw of found) enqueue(raw, baseUrl);
}

function rewriteText(text, baseUrl) {
  let out = text;

  // Make the landing-page embedded app use the local mirrored demo.
  out = out.replaceAll(
    'https://app.harness.design/zY/demo?allowEdit=true&allowControls=false&highlightNets=true&views=Schematic%2CLayout&theme=dark',
    '/harness-design/zY/demo?allowEdit=true&allowControls=false&highlightNets=true&views=Schematic%2CLayout&theme=dark'
  );

  // Mirror the absolute logo URL used by the marketing bundle.
  out = out.replaceAll('https://www.harness.design/harness-design-logo.svg', '/harness-design/harness-design-logo.svg');

  // Point the bundled Supabase browser client at the local compatibility shim in server.mjs.
  out = out.replaceAll(
    '"https://bhvgkfojbsyjpajmzdmw.supabase.co","sb_publishable_3LdJYcd61XM_IpFYtyslZA_pPTu1Gx_"',
    '"http://localhost:4173/supabase","local-dev-anon-key"'
  );

  // Rewrite mirrored Google font CSS and font URLs to local paths.
  out = out.replace(/https:\/\/fonts\.googleapis\.com\/[^"'`)<>\s]+/g, (s) => {
    try {
      const u = new URL(s.replaceAll('&amp;', '&'));
      return localUrlFor(u, 'text/css');
    } catch { return s; }
  });
  out = out.replace(/https:\/\/fonts\.gstatic\.com\/[^"'`)<>\s]+/g, (s) => {
    try {
      const u = new URL(s.replaceAll('&amp;', '&'));
      return localUrlFor(u);
    } catch { return s; }
  });

  return out;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function download(u) {
  const key = u.href;
  const info = downloaded.get(key);
  try {
    const res = await fetch(u, { headers: { 'user-agent': USER_AGENT } });
    if (!res.ok) {
      info.status = `HTTP ${res.status}`;
      return;
    }
    const contentType = res.headers.get('content-type') || '';
    let rel = localPathFor(u, contentType);
    let abs = path.join(ROOT, rel);
    await mkdir(path.dirname(abs), { recursive: true });

    const isText = TEXT_EXT.test(u.pathname) || /text|javascript|json|xml|svg|css/.test(contentType);
    if (isText) {
      let text = await res.text();
      extractUrls(text, u.href, contentType);
      if (shouldTryMap(u, contentType) && u.hostname !== 'fonts.googleapis.com' && u.hostname !== 'fonts.gstatic.com') {
        const mu = new URL(u.href);
        mu.pathname += '.map';
        mapCandidates.add(mu.href);
      }
      text = rewriteText(text, u.href);
      await writeFile(abs, text, 'utf8');
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(abs, buf);
    }
    info.status = 'ok';
    info.file = rel;
  } catch (e) {
    info.status = 'ERROR ' + (e && e.message ? e.message : e);
  }
}

for (const url of INITIAL_URLS) enqueue(url, undefined, true);
// Known root assets referenced by the marketing bundle and app shell.
for (const asset of [
  '/harness-design/icon.png','/harness-design/favicon.ico','/harness-design/icon.svg','/harness-design/harness-design-logo.svg','/harness-design/try-arrow.svg',
  '/harness-design/bottom-secondary-feature.png','/harness-design/cut-list.png','/harness-design/export.png','/harness-design/layout.png','/harness-design/online.png','/harness-design/parts.png','/harness-design/top-secondary-feature.png','/harness-design/validation.png','/harness-design/video-thumbnail.png'
]) {
  enqueue(new URL(asset, 'https://www.harness.design/').href);
}
for (const asset of ['/harness-design/icon.svg']) enqueue(new URL(asset, 'https://app.harness.design/').href);

while (queue.length) {
  const u = queue.shift();
  console.log('GET', u.href);
  await download(u);
}

// Try source maps even when the bundle did not expose a sourceMappingURL comment.
for (const href of [...mapCandidates]) enqueue(href);
while (queue.length) {
  const u = queue.shift();
  console.log('MAP?', u.href);
  await download(u);
}

const rows = [...downloaded.entries()].map(([url, v]) => ({ url, status: v.status, file: v.file || '' }));
await writeFile(path.join(ROOT, 'mirror-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: rows }, null, 2));
console.log(`Done. ${rows.filter(r => r.status === 'ok').length} downloaded, ${rows.filter(r => r.status !== 'ok').length} skipped/failed.`);
