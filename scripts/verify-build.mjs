#!/usr/bin/env node
/**
 * verify-build.mjs
 *
 * Scans generated HTML/JS/CSS for:
 *  1. Active external endpoints (http/https to non-local domains)
 *  2. Confirms all referenced assets exist locally
 *  3. Verifies CSP is present
 *  4. Verifies no Sentry/Userback/Vercel Analytics endpoints are reachable
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_PATH = '/harness-design';

// Patterns that look like external endpoints
const EXTERNAL_URL_RE = /https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9][^\s"'`<>]*/gi;

// Patterns that look like local asset references
const ASSET_REF_RE = new RegExp(
  `(?:"|'|\`)(${BASE_PATH.replace(/\//g, '\\/')}/[^"'\`\\s>)]+)(?:"|'|\`)`,
  'gi'
);

// Allowed external domains (docs, harmless references in comments/strings)
const ALLOWED_EXTERNAL = new Set([
  'https://fonts.googleapis.com',   // Font CSS (local copy)
  'https://fonts.gstatic.com',      // Font files (local copies)
  'https://nextjs.org',
  'https://react.dev',
  'https://mantine.dev',
  'https://supabase.com',
  'https://github.com',
  'https://discord.gg',
  'https://docs.harness.design',
  'https://harness.design',
  'https://www.harness.design',
  'https://app.harness.design',
  'https://www.instagram.com',
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://reactflow.dev',
  'https://pro.reactflow.dev',
  'https://chatgpt.com',
  'https://claude.ai',
  'https://developer.mozilla.org',
  'https://schema.org',
  'https://www.w3.org',
  'http://www.w3.org',
  'http://purl.org',
  'http://fb.me',
  'http://schemas.microsoft.com',
  'http://example.com',
  'http://n',  // Variable placeholder
  'https://x',
  'https://a',
  'https://a@b',
  'https://a/c%20d?a=1&c=3',
  'https://a#б',
  'https://тест',
  // XML namespace URIs (not network requests)
  'http://schemas.openxmlformats.org',
  // Documentation links (not active endpoints)
  'https://stuk.github.io',
  'https://docs.sentry.io',
  'https://vercel.com/docs',
  // Our disabled/patched URLs
  'https://userback-disabled.local',
  'https://localhost/no-sentry-disabled',
]);

// Domains that MUST NOT appear in active code
const BLOCKED_DOMAINS = [
  'sentry.io',
  'va.vercel-scripts.com',
  'userback.io',
  'google-analytics.com',
  'googletagmanager.com',
  'bhvgkfojbsyjpajmzdmw.supabase.co',
];

const SUPABASE_KEY_RE = /sb_publishable_[A-Za-z0-9_-]{20,}/;

function isAllowedExternal(url) {
  for (const allowed of ALLOWED_EXTERNAL) {
    if (url.startsWith(allowed)) return true;
  }
  return false;
}

function findFiles(startDir, exts) {
  const results = [];
  const extsSet = new Set(exts.map(e => e.toLowerCase()));
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(full);
      } else if (extsSet.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(startDir);
  return results;
}

async function scanExternalEndpoints() {
  console.log('\n── Scanning for external endpoints ──');
  const files = [
    path.join(ROOT, '2vD1', 'index.html'),
    path.join(ROOT, 'embed', 'index.html'),
    path.join(ROOT, 'docs', 'index.html'),
    path.join(ROOT, 'index.html'),
    ...findFiles(path.join(ROOT, '_next'), ['.js', '.css']),
    ...findFiles(path.join(ROOT, 'assets'), ['.js', '.css']),
  ];

  let totalIssues = 0;
  const activeEndpoints = new Map();

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = await readFile(file, 'utf8');
    const matches = content.matchAll(EXTERNAL_URL_RE);
    for (const match of matches) {
      const url = match[0].replace(/[\s,;)}\]]+$/, '');
      if (!isAllowedExternal(url)) {
        if (!activeEndpoints.has(url)) activeEndpoints.set(url, []);
        activeEndpoints.get(url).push(path.relative(ROOT, file));
      }
    }
  }

  if (activeEndpoints.size > 0) {
    console.log('  ⚠ Found unexpected external URLs:');
    for (const [url, files] of activeEndpoints) {
      console.log(`    ${url}`);
      for (const f of files.slice(0, 3)) {
        console.log(`      in: ${f}`);
      }
      totalIssues++;
    }
  } else {
    console.log('  ✓ No unexpected external endpoints found');
  }

  // Check for blocked domains specifically
  console.log('\n── Checking for blocked domains ──');
  let blockedFound = false;
  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = await readFile(file, 'utf8');
    for (const domain of BLOCKED_DOMAINS) {
      if (content.includes(domain)) {
        // Check context - is it in a URL string or just a comment?
        const idx = content.indexOf(domain);
        const context = content.substring(Math.max(0, idx - 30), idx + domain.length + 30);
        // If it looks like a URL, flag it
        if ((context.includes('https://') || context.includes('http://')) &&
            // Skip documentation links
            !context.includes('docs.sentry.io') &&
            !context.includes('docs.') &&
            !context.includes('vercel.com/docs')) {
          console.log(`  ⚠ Blocked domain "${domain}" found in ${path.relative(ROOT, file)}`);
          console.log(`    context: ...${context.trim()}...`);
          blockedFound = true;
          totalIssues++;
        }
      }
    }
  }
  if (!blockedFound) {
    console.log('  ✓ No blocked domains found in active code');
  }

  return totalIssues;
}

async function verifyAssetReferences() {
  console.log('\n── Verifying asset references ──');
  const files = [
    path.join(ROOT, '2vD1', 'index.html'),
    path.join(ROOT, 'embed', 'index.html'),
    path.join(ROOT, 'docs', 'index.html'),
    path.join(ROOT, 'index.html'),
  ];

  let missingCount = 0;
  const missing = new Set();

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = await readFile(file, 'utf8');
    const matches = content.matchAll(ASSET_REF_RE);
    for (const match of matches) {
      let ref = match[1]; // /harness-design/...
      // Strip trailing escape backslashes from RSC payload encoding
      ref = ref.replace(/\\+$/, '');
      const relPath = ref.replace(BASE_PATH + '/', '');
      const absPath = path.join(ROOT, relPath.split('?')[0]);
      if (!existsSync(absPath)) {
        if (!missing.has(ref)) {
          missing.add(ref);
          console.log(`  ✗ Missing: ${ref} -> ${relPath.split('?')[0]}`);
          missingCount++;
        }
      }
    }
  }

  if (missingCount === 0) {
    console.log('  ✓ All referenced assets exist locally');
  }

  return missingCount;
}

async function verifyCSP() {
  console.log('\n── Verifying Content Security Policy ──');
  const htmlPath = path.join(ROOT, '2vD1', 'index.html');
  if (!existsSync(htmlPath)) {
    console.log('  ✗ 2vD1/index.html not found');
    return 1;
  }
  const content = await readFile(htmlPath, 'utf8');

  if (content.includes('Content-Security-Policy')) {
    // Extract CSP for inspection
    const cspMatch = content.match(/content="([^"]*Content-Security-Policy[^"]*)"/i) ||
                     content.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
    if (cspMatch) {
      console.log('  ✓ CSP header found');
      console.log(`  Policy: ${cspMatch[1].substring(0, 200)}...`);

      // Verify key directives
      const csp = cspMatch[1];
      if (csp.includes("connect-src 'self'") && !csp.includes('connect-src *')) {
        console.log("  ✓ connect-src: 'self' only");
      } else {
        console.log("  ✗ connect-src is not restricted to 'self'");
        return 1;
      }
      if (csp.includes('frame-src') && csp.includes("'none'")) {
        console.log('  ✓ frame-src: none');
      } else {
        console.log('  ⚠ frame-src may not be restricted to none');
      }
    }
    return 0;
  } else {
    console.log('  ✗ No CSP meta tag found');
    return 1;
  }
}

async function verifyNoSentryMetadata() {
  console.log('\n── Verifying no Sentry metadata ──');
  const htmlPath = path.join(ROOT, '2vD1', 'index.html');
  if (!existsSync(htmlPath)) return 1;
  const content = await readFile(htmlPath, 'utf8');

  let issues = 0;
  if (content.includes('sentry-trace')) {
    console.log('  ✗ Sentry trace meta tag found');
    issues++;
  }
  if (content.includes('sentry-environment') || content.includes('sentry-release')) {
    console.log('  ✗ Sentry baggage meta tag found');
    issues++;
  }
  if (issues === 0) {
    console.log('  ✓ No Sentry metadata found');
  }
  return issues;
}

async function verifyEditorMeta() {
  console.log('\n── Verifying editor metadata ──');
  const htmlPath = path.join(ROOT, '2vD1', 'index.html');
  if (!existsSync(htmlPath)) return 1;
  const content = await readFile(htmlPath, 'utf8');

  let issues = 0;
  if (!content.includes('readOnly":false') && !content.includes('readOnly\\":false')) {
    console.log('  ⚠ readOnly not explicitly set to false');
    issues++;
  }
  if (!content.includes('demo":false') && !content.includes('demo\\":false')) {
    console.log('  ⚠ normal editor mode not enabled');
    issues++;
  }
  if (!content.includes('allowEdit":true') && !content.includes('allowEdit\\":true')) {
    console.log('  ⚠ allowEdit not enabled');
    issues++;
  }
  if (!content.includes('window.__EMBEDDED_DOCUMENT__')) {
    console.log('  ✗ Embedded document JSON not found');
    issues++;
  } else {
    console.log('  ✓ Embedded document JSON found');
  }
  if (issues === 0) {
    console.log('  ✓ Editor metadata correctly configured');
  }
  return issues;
}

async function verifyStaticRuntimePatches() {
  console.log('\n── Verifying static runtime patches ──');
  const html = await readFile(path.join(ROOT, '2vD1', 'index.html'), 'utf8');
  const jsFiles = findFiles(path.join(ROOT, '_next', 'static', 'chunks'), ['.js']);
  const chunks = await Promise.all(jsFiles.map(file => readFile(file, 'utf8')));
  const runtime = chunks.join('\n');
  let issues = 0;

  const checks = [
    [html.includes('window.__EMBEDDED_DOCUMENT__'), 'document JSON is embedded'],
    [html.includes('window.__HARNESS_SOURCE__=new URLSearchParams'), 'external JSON source parameter is initialized before hydration'],
    [html.includes('window.__HARNESS_STATIC__=true'), 'offline runtime flag is enabled'],
    [html.includes('demo\\":false'), 'normal editor UI is enabled'],
    [html.includes('\\"views\\":[\\"Schematic\\"]'), 'standalone route starts with a single Schematic pane'],
    [runtime.includes('_hsPayload.document??_hsPayload'), 'editor loader accepts native JSON or a document envelope'],
    [runtime.includes('_hsUrl.origin!==location.origin'), 'editor loader rejects cross-origin JSON sources'],
    [runtime.includes('if(window.__HARNESS_STATIC__||cz.getState().isDemo||cR.getState().isRevisionView)return'), 'remote autosave is guarded in static mode'],
    [runtime.includes('(r||window.__HARNESS_STATIC__)?(h(e.theme),et.default.getState().setPanes(e.views)'), 'static routes apply their configured initial panes'],
    [runtime.includes('__harnessStatic:!0'), 'Supabase/auth client is replaced by the static stub'],
    [runtime.includes('let t="/harness-design/_next/"'), 'Turbopack uses the GitHub Pages base path'],
    [!runtime.includes('bhvgkfojbsyjpajmzdmw.supabase.co'), 'production Supabase host is absent from runtime chunks'],
    [!SUPABASE_KEY_RE.test(runtime), 'Supabase publishable keys are absent from runtime chunks'],
  ];

  const docsPath = path.join(ROOT, 'docs', 'index.html');
  const docs = existsSync(docsPath) ? await readFile(docsPath, 'utf8') : '';
  const embedPath = path.join(ROOT, 'embed', 'index.html');
  const embed = existsSync(embedPath) ? await readFile(embedPath, 'utf8') : '';
  checks.push(
    [Boolean(docs), 'sample documentation page exists'],
    [Boolean(embed), 'dedicated embed route exists'],
    [embed.includes('\\"views\\":[\\"Layout\\"]'), 'embed route starts with a single Layout pane'],
    [docs.includes('/harness-design/embed/?src=/harness-design/data/2vD1.json'), 'sample embeds the Layout-first route with a separate native JSON source'],
    [docs.includes('id="embed-fullscreen"') && docs.includes('requestFullscreen'), 'sample includes expand and restore controls'],
    [docs.includes('max-width: 100%') && !docs.includes('calc(min(0px'), 'sample embed is constrained to the article width'],
    [existsSync(path.join(ROOT, 'EMBED.md')), 'EMBED.md exists'],
    [existsSync(path.join(ROOT, 'CUSTOM-NODES.md')), 'CUSTOM-NODES.md exists'],
  );

  for (const [ok, label] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) issues++;
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Verification: harness-design static build ===\n');

  let totalIssues = 0;

  totalIssues += await scanExternalEndpoints();
  totalIssues += await verifyAssetReferences();
  totalIssues += await verifyCSP();
  totalIssues += await verifyNoSentryMetadata();
  totalIssues += await verifyEditorMeta();
  totalIssues += await verifyStaticRuntimePatches();

  console.log('\n═══════════════════════════════════════');
  if (totalIssues === 0) {
    console.log('  ✓ ALL CHECKS PASSED');
  } else {
    console.log(`  ✗ ${totalIssues} issue(s) found`);
  }
  console.log('═══════════════════════════════════════\n');

  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
