#!/usr/bin/env node
/**
 * Build a self-contained GitHub Pages copy of app.harness.design/2vD1.
 * Production services are used only while building. The generated editor has
 * an embedded document, a no-op local data client, and a CSP that forbids all
 * runtime connections and frames.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ORIGIN = 'https://app.harness.design';
const APP_ROUTE = '/2vD1';
const BASE_PATH = '/harness-design';
const DOC_ID = 6435;
const SHORT_ID = '2vD1';
const SUPABASE_ORIGIN = 'https://bhvgkfojbsyjpajmzdmw.supabase.co';
const SUPABASE_KEY = process.env.HARNESS_SUPABASE_KEY;
const DOCUMENT_CACHE = path.join(ROOT, 'data', '2vD1.json');

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

function safeJSON(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

async function fetchDocument() {
  if (process.env.HARNESS_REFRESH_DOCUMENT !== '1') {
    const cached = JSON.parse(await readFile(DOCUMENT_CACHE, 'utf8'));
    if (!cached?.document) throw new Error(`Invalid cached document: ${DOCUMENT_CACHE}`);
    return cached;
  }
  if (!SUPABASE_KEY) {
    throw new Error('HARNESS_SUPABASE_KEY is required when HARNESS_REFRESH_DOCUMENT=1');
  }
  const url = `${SUPABASE_ORIGIN}/rest/v1/documents?id=eq.${DOC_ID}&select=id,short_id,title,public,team_id,document,updated_at,created_at`;
  const rows = await (await fetchChecked(url, {
    headers: { apikey: SUPABASE_KEY, accept: 'application/json' },
  })).json();
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].document) {
    throw new Error(`Public document ${SHORT_ID} was not returned`);
  }
  await writeFile(DOCUMENT_CACHE, `${JSON.stringify(rows[0], null, 2)}\n`);
  return rows[0];
}

function initialAssetPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1].replaceAll('&amp;', '&');
    if (value.startsWith('/_next/') || value === '/icon.svg' || value === '/favicon.ico') {
      paths.add(value.split('?')[0]);
    }
  }
  for (const match of html.matchAll(/\/_next\/static\/(?:chunks|media)\/[A-Za-z0-9._~/-]+/g)) {
    paths.add(match[0]);
  }
  return paths;
}

function dependentAssetPaths(text, parentPath) {
  const paths = new Set();
  for (const match of text.matchAll(/\/_next\/static\/(?:chunks|media)\/[A-Za-z0-9._~/-]+/g)) {
    paths.add(match[0]);
  }
  // Turbopack manifests store lazy chunk names without the /_next/ prefix.
  for (const match of text.matchAll(/(?:static\/chunks|static\/media)\/[A-Za-z0-9._~/-]+/g)) {
    paths.add(`/_next/${match[0]}`);
  }
  for (const match of text.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)) {
    const ref = match[1];
    if (ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('#')) continue;
    try {
      const resolved = new URL(ref, APP_ORIGIN + parentPath).pathname;
      if (resolved.startsWith('/_next/')) paths.add(resolved);
    } catch {}
  }
  return paths;
}

async function mirrorApplicationAssets(html) {
  const queue = [...initialAssetPaths(html)];
  const visited = new Set();
  let downloaded = 0;

  while (queue.length) {
    const assetPath = queue.shift();
    if (visited.has(assetPath)) continue;
    visited.add(assetPath);

    const response = await fetchChecked(APP_ORIGIN + assetPath);
    const bytes = Buffer.from(await response.arrayBuffer());
    const output = path.join(ROOT, assetPath.replace(/^\//, ''));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
    downloaded++;

    if (/\.(?:js|css)$/.test(assetPath)) {
      const text = bytes.toString('utf8');
      for (const dependency of dependentAssetPaths(text, assetPath)) {
        if (!visited.has(dependency)) queue.push(dependency);
      }
    }
  }

  console.log(`Mirrored ${downloaded} live application assets.`);
}

const embedSettings = {
  allowEdit: true,
  allowInteract: true,
  views: ['Schematic', 'Layout'],
  allowSwitch: true,
  allowSearch: true,
  showBar: true,
  allowControls: true,
  captureScroll: false,
  showZoomControls: true,
  theme: 'dark',
  showWarnings: false,
  showParts: false,
  showIds: false,
  highlightNets: true,
  dashRoutes: false,
  dashBundles: false,
  showDestinations: false,
  showCoverings: false,
};

function privacyMarkup(documentRow) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' data:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');

  const meta = {
    id: DOC_ID,
    shortId: SHORT_ID,
    title: documentRow.title,
    readOnly: false,
    public: true,
    updated_at: documentRow.updated_at,
  };

  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}"/>`;
  const bootstrap = `
window.__EMBEDDED_DOCUMENT__=${safeJSON(documentRow.document)};
window.__EMBEDDED_DOCUMENT_META__=${safeJSON(meta)};
window.__HARNESS_STATIC__=true;
window.__HARNESS_SOURCE__=new URLSearchParams(location.search).get('src');
// Belt and suspenders: CSP blocks connections; these stop queued telemetry APIs too.
try { navigator.sendBeacon = function () { return false; }; } catch (_) {}
try { window.WebSocket = function () { throw new Error('Network disabled in static build'); }; } catch (_) {}
window.dataLayer=[];
window.gtag=function(){};`;
  return { cspMeta, bootstrap };
}

function transformLiveHTML(liveHTML, documentRow) {
  let html = liveHTML;

  // Reuse existing head nodes so React sees the same server DOM structure.
  const { cspMeta, bootstrap } = privacyMarkup(documentRow);
  const sentryMeta = /<meta name="sentry-trace"[^>]*\/>/;
  const baggageMeta = /<meta name="baggage"[^>]*\/>/;
  if (!sentryMeta.test(html) || !baggageMeta.test(html)) {
    throw new Error('Expected Sentry propagation metadata was not found');
  }
  html = html.replace(sentryMeta, cspMeta);
  html = html.replace(baggageMeta, '<meta name="harness-static" content="offline"/>');

  // Use GitHub Pages project-site paths everywhere, including escaped RSC strings.
  html = html.replaceAll('/_next/', `${BASE_PATH}/_next/`);
  html = html.replaceAll('/icon.svg', `${BASE_PATH}/icon.svg`);
  html = html.replaceAll('/favicon.ico', `${BASE_PATH}/favicon.ico`);

  const readOnlyNeedle = '\\"readOnly\\":true';
  if (!html.includes(readOnlyNeedle)) throw new Error('Could not find readOnly route metadata');
  html = html.replace(readOnlyNeedle, '\\"readOnly\\":false');

  const propsEnd = '\\"userName\\":\\"$undefined\\"}]';
  if (!html.includes(propsEnd)) throw new Error('Could not find EditorClient props boundary');
  const escapedSettings = JSON.stringify(embedSettings).replaceAll('"', '\\"');
  const staticPropsEnd = `\\"userName\\":\\"$undefined\\",\\"demo\\":false,\\"embedSettings\\":${escapedSettings}}]`;
  html = html.replace(propsEnd, staticPropsEnd);

  const mantineScript = '<script data-mantine-script="true">';
  if (!html.includes(mantineScript)) throw new Error('Mantine bootstrap script was not found');
  html = html.replace(mantineScript, `${mantineScript}${bootstrap}`);

  if (html.includes('sentry-trace') || html.includes('sentry-environment=')) {
    throw new Error('Sentry metadata remained after HTML transformation');
  }
  return html;
}

const STATIC_SUPABASE_FACTORY = `function rx(){function q(d=null){let p={data:d,error:null,count:Array.isArray(d)?d.length:null,status:200,statusText:"OK"},b={};for(let m of["select","eq","neq","gt","gte","lt","lte","like","ilike","is","in","contains","containedBy","range","order","limit","match","filter","not","or","textSearch","insert","upsert","update","delete"])b[m]=()=>b;b.single=async()=>({...p,data:Array.isArray(p.data)?p.data[0]??null:p.data});b.maybeSingle=b.single;b.then=(r,j)=>Promise.resolve(p).then(r,j);return b}function h(){let c={on:()=>c,subscribe:f=>(queueMicrotask(()=>f&&f("SUBSCRIBED")),c),send:async()=>"ok",track:async()=>"ok",untrack:async()=>"ok",unsubscribe:async()=>"ok",presenceState:()=>({})};return c}return{__harnessStatic:!0,from:()=>q([]),rpc:async()=>({data:null,error:null}),auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),updateUser:async()=>({data:{user:null},error:null})},realtime:{setAuth(){}},channel:h,removeChannel:async()=>"ok",storage:{from:()=>({upload:async()=>({data:null,error:null}),download:async()=>({data:null,error:null}),getPublicUrl:()=>({data:{publicUrl:""}})})}}}`;

async function javascriptFiles() {
  const directory = path.join(ROOT, '_next', 'static', 'chunks');
  return (await readdir(directory))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(directory, name));
}

async function patchApplicationChunks() {
  const files = await javascriptFiles();
  const assetsDir = path.join(ROOT, 'assets');
  if (existsSync(assetsDir)) {
    for (const name of await readdir(assetsDir)) {
      if (name.endsWith('.js')) files.push(path.join(assetsDir, name));
    }
  }
  let loaderPatched = false;
  let supabasePatched = false;
  let sentryPatched = false;
  let offlineSavePatched = false;

  const loaderQuery = 'let{data:t,error:n}=await cB.from("documents").select("document, updated_at, team_id").eq("id",e).single();';
  const staticLoader = 'let _hsDocument=window.__EMBEDDED_DOCUMENT__,_hsSource=window.__HARNESS_SOURCE__;if(_hsSource){let _hsUrl=new URL(_hsSource,location.href);if(_hsUrl.origin!==location.origin)throw Error("Harness JSON must be served from the editor origin");let _hsResponse=await fetch(_hsUrl,{credentials:"same-origin"});if(!_hsResponse.ok)throw Error(`Could not load harness JSON: ${_hsResponse.status} ${_hsResponse.statusText}`);let _hsPayload=await _hsResponse.json();_hsDocument=_hsPayload.document??_hsPayload;if(!_hsDocument||"object"!=typeof _hsDocument||Array.isArray(_hsDocument))throw Error("Harness JSON must contain a native document object")}let t={document:_hsDocument,updated_at:window.__EMBEDDED_DOCUMENT_META__.updated_at,team_id:null},n=null;';
  const saveGuard = 'if(cz.getState().isDemo||cR.getState().isRevisionView)return';
  const offlineSaveGuard = 'if(window.__HARNESS_STATIC__||cz.getState().isDemo||cR.getState().isRevisionView)return';

  for (const file of files) {
    let text = await readFile(file, 'utf8');

    if (text.includes(staticLoader)) loaderPatched = true;
    if (text.includes('dsn:void 0,enabled:!1')) sentryPatched = true;
    if (text.includes(offlineSaveGuard)) offlineSavePatched = true;

    if (text.includes('supabase-ssr/0.8.0 createBrowserClient') && text.includes('e.s(["createClient"')) {
      const start = text.indexOf('function rx(){');
      const end = text.indexOf('e.s(["createClient",()=>rx]', start);
      if (start < 0 || end < 0) throw new Error(`Could not isolate createClient factory in ${path.basename(file)}`);
      text = text.slice(0, start) + STATIC_SUPABASE_FACTORY + text.slice(end);
      await writeFile(file, text);
      supabasePatched = true;
      continue;
    }
    if (text.includes('__harnessStatic:!0') && text.includes('e.s(["createClient",()=>rx]')) {
      supabasePatched = true;
      continue;
    }

    if (text.includes(loaderQuery)) {
      text = text.replace(loaderQuery, staticLoader);
      loaderPatched = true;
    }
    if (text.includes(saveGuard)) {
      text = text.replaceAll(saveGuard, offlineSaveGuard);
      offlineSavePatched = true;
    }

    const sentryDsn = /dsn:"https:\/\/[^\"]+\.sentry\.io\/[^\"]+"/;
    if (sentryDsn.test(text)) {
      text = text.replace(sentryDsn, 'dsn:void 0,enabled:!1');
      text = text.replaceAll('tracesSampleRate:1', 'tracesSampleRate:0');
      text = text.replaceAll('enableLogs:!0', 'enableLogs:!1');
      text = text.replaceAll('sendDefaultPii:!0', 'sendDefaultPii:!1');
      sentryPatched = true;
    }

    // Turbopack must identify already-loaded chunks under the Pages project path.
    text = text.replaceAll('let t="/_next/"', `let t="${BASE_PATH}/_next/"`);

    // Analytics/feedback transports become inert data URLs.
    text = text.replaceAll('https://va.vercel-scripts.com/v1/script.debug.js', 'data:,');
    text = text.replaceAll('/_vercel/insights/script.js', 'data:,');
    text = text.replaceAll('https://vercel.live/_next-live/feedback/feedback.js', 'data:,');
    text = text.replaceAll('https://static.${s}/widget/v1.js', 'data:,');
    text = text.replaceAll('https://userback.io', 'https://userback-disabled.local');

    await writeFile(file, text);
  }

  if (!loaderPatched) throw new Error('Document loader patch was not applied');
  if (!supabasePatched) throw new Error('Supabase client patch was not applied');
  if (!sentryPatched) throw new Error('Sentry initialization patch was not applied');
  if (!offlineSavePatched) throw new Error('Offline save guard patch was not applied');
  console.log('Disabled document backend, remote saves, Supabase/auth/realtime, Sentry, analytics, feedback, and toolbar transports.');
}

async function writeRootRedirect() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${BASE_PATH}/${SHORT_ID}/"><title>harness.design Static Editor</title><script>location.replace('${BASE_PATH}/${SHORT_ID}/')</script></head><body><a href="${BASE_PATH}/${SHORT_ID}/">Open the static editor</a></body></html>`;
  await writeFile(path.join(ROOT, 'index.html'), html);
}

async function main() {
  console.log(`Fetching ${APP_ORIGIN}${APP_ROUTE} and its public document...`);
  const [liveHTML, documentRow] = await Promise.all([
    (await fetchChecked(APP_ORIGIN + APP_ROUTE)).text(),
    fetchDocument(),
  ]);

  await mirrorApplicationAssets(liveHTML);
  const html = transformLiveHTML(liveHTML, documentRow);
  await mkdir(path.join(ROOT, SHORT_ID), { recursive: true });
  await writeFile(path.join(ROOT, SHORT_ID, 'index.html'), html);
  await patchApplicationChunks();
  await writeRootRedirect();

  console.log(`Built ${BASE_PATH}/${SHORT_ID}/ with ${Object.keys(documentRow.document).length} document sections.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
