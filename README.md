# harness.design mirror

Reverse-engineered documentation and a self-contained static mirror of the harness.design editor.

## Static editor

The GitHub Pages root redirects to:

- Project path: `/harness-design/2vD1/`
- Public URL: `https://killspacedash9.github.io/harness-design/2vD1/`

The `/2vD1` document and all required application assets are embedded locally. The editor uses the normal application chrome with an explicit offline runtime guard: editor controls and in-memory edits work, but refreshing resets the document.

It can also load a separate same-origin native JSON file before hydration:

```text
/harness-design/embed/?src=/harness-design/data/2vD1.json
```

The dedicated `/embed/` route starts with one Layout pane and retains the native pane switch/add controls. The documentation sample constrains it to the article width and adds expand/restore fullscreen controls.

See the [live documentation sample](https://killspacedash9.github.io/harness-design/docs/), [`EMBED.md`](EMBED.md), and [`CUSTOM-NODES.md`](CUSTOM-NODES.md).

Runtime services removed or neutralized:

- Supabase database, auth, and realtime
- Sentry
- Vercel Analytics and Toolbar
- Userback
- External frames, forms, images, and connections via CSP

Rebuild and verify:

```bash
node scripts/build-2vD1.mjs
node scripts/verify-build.mjs
```

The builder contacts the public production route at build time to refresh application assets. It uses the committed `data/2vD1.json` snapshot by default, recursively mirrors Turbopack assets, rewrites the GitHub Pages base path, embeds the harness JSON, and applies the static runtime patches.

To deliberately refresh the public document snapshot, supply its current public key explicitly:

```bash
HARNESS_REFRESH_DOCUMENT=1 HARNESS_SUPABASE_KEY='…' node scripts/build-2vD1.mjs
```

## Local verification server

Serve the repository at the same project path used by GitHub Pages:

```bash
mkdir -p /tmp/harness-pages
ln -s "$PWD" /tmp/harness-pages/harness-design
python3 -m http.server 4174 --directory /tmp/harness-pages
```

Open `http://127.0.0.1:4174/harness-design/2vD1/`.

`server.mjs` remains available for legacy mirror/API-shim development on `http://127.0.0.1:4173`.

## Repository layout

- `2vD1/` — static editor route with embedded fallback and `?src=` JSON loading
- `embed/` — Layout-first single-pane route for iframe use
- `_next/` — mirrored and sanitized application chunks/assets
- `assets/` — legacy marketing-site assets
- `docs/index.html` — Mintlify/Starlight-style embedding sample
- `EMBED.md` — iframe, native JSON, sizing, and security guide
- `CUSTOM-NODES.md` — Frames and reusable multi-connector device templates
- `src/` — independent editable reconstruction
- `scripts/build-2vD1.mjs` — live-route mirroring/static conversion
- `scripts/verify-build.mjs` — endpoint, asset, CSP, and runtime-patch checks
