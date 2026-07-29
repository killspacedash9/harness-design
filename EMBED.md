# Embedding Harness Design

This repository includes a self-contained Harness Design editor that can be embedded in another HTML page. It loads native harness JSON from a separate file, supports the application's native **Schematic / Layout** selector, and keeps all edits in browser memory.

## Live routes

- Documentation sample: <https://killspacedash9.github.io/harness-design/docs/>
- Dedicated embed route: <https://killspacedash9.github.io/harness-design/embed/>
- Standalone editor: <https://killspacedash9.github.io/harness-design/2vD1/>
- Native JSON example: <https://killspacedash9.github.io/harness-design/data/2vD1.json>

## Recommended architecture

Use an `iframe` rather than mounting the compiled editor directly into another application's DOM. The editor owns global CSS, keyboard shortcuts, React Flow portals, viewport sizing, and Zustand stores; an iframe prevents those concerns from leaking into the host page.

```text
Host documentation page
└── iframe
    └── static Harness Design editor
        └── fetch same-origin native JSON
```

## Quick start

```html
<div class="harness-frame">
  <iframe
    src="/harness-design/embed/?src=/harness-design/data/2vD1.json"
    title="Interactive harness viewer"
    loading="lazy"
  ></iframe>
</div>

<style>
  .harness-frame {
    width: 100%;
    height: min(62vh, 620px);
    min-height: 520px;
    overflow: hidden;
    border: 1px solid #dfe5e2;
    border-radius: 12px;
  }

  .harness-frame iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
```

The dedicated `/embed/` route starts with one **Layout** pane. Use the pane selector in its upper-right corner to change that pane to **Schematic** or add another pane. The editor changes the existing pane in place, so in-memory edits survive view switching.

## Source URL contract

Pass the native JSON path through the editor's `src` query parameter:

```text
/harness-design/embed/?src=/harness-design/data/example-harness.json
```

The loader resolves `src` relative to the iframe URL and accepts either format below.

### Database-row envelope

```json
{
  "id": 6435,
  "short_id": "2vD1",
  "document": {
    "version": 0.5,
    "connectors": [],
    "wires": [],
    "bundles": [],
    "frames": []
  }
}
```

### Bare native document

```json
{
  "version": 0.5,
  "connectors": [],
  "wires": [],
  "bundles": [],
  "frames": []
}
```

Internally, the loader uses:

```js
const payload = await response.json();
const document = payload.document ?? payload;
```

If `src` is omitted, the route falls back to its committed embedded document snapshot.

## Runtime behavior

The page initializes these values before React hydration:

```js
window.__EMBEDDED_DOCUMENT__ = embeddedFallback;
window.__HARNESS_SOURCE__ = new URLSearchParams(location.search).get('src');
window.__HARNESS_STATIC__ = true;
```

The patched asynchronous document loader then:

1. Resolves the supplied URL against the editor URL.
2. Rejects the request if its origin differs from the editor origin.
3. Fetches and parses the JSON.
4. Uses `payload.document ?? payload` as the native document.
5. Falls back to `window.__EMBEDDED_DOCUMENT__` when no source is supplied.

These values must be established before hydration. Do not initialize the editor first and inject document data afterward.

## Schematic and Layout configuration

The static route is configured with both native views:

```js
{
  views: ["Schematic", "Layout"],
  allowSwitch: true,
  allowEdit: true
}
```

The compiled app's pane store exposes the native action used by its selector:

```js
const state = paneStore.getState();
const pane = state.panes[0];
state.changeViewType(pane.id, "Layout");
```

The deployed build currently exposes the application's own selector rather than a public parent-page API. Prefer that selector unless you deliberately add a `postMessage` bridge.

## Optional parent-page toggle

To put Schematic/Layout buttons outside the iframe, add a bridge inside the editor where the pane store is available:

```js
window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  if (event.data?.type !== "harness:set-view") return;

  const view = event.data.view;
  if (view !== "Schematic" && view !== "Layout") return;

  const state = paneStore.getState();
  const pane = state.panes[0];
  if (pane) state.changeViewType(pane.id, view);
});
```

Parent page:

```html
<button type="button" data-view="Schematic">Schematic</button>
<button type="button" data-view="Layout">Layout</button>
<iframe id="harness-editor" src="/harness-design/embed/?src=/harness-design/data/example-harness.json"></iframe>

<script>
  const editor = document.querySelector("#harness-editor");

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      editor.contentWindow.postMessage(
        { type: "harness:set-view", view: button.dataset.view },
        location.origin
      );
    });
  });
</script>
```

Do not use DOM-click automation to operate the native selector. It depends on generated markup and will break when the application UI changes.

## Same-origin and cross-origin rules

The host page and iframe may be on the same origin or different origins. The JSON request, however, is made by the iframe and is restricted to the **editor's origin**.

This works:

```text
Host page:  https://example.com/docs
Editor:     https://killspacedash9.github.io/harness-design/2vD1/
JSON:       https://killspacedash9.github.io/harness-design/data/example.json
```

This is rejected by the current loader and CSP:

```text
Editor: https://killspacedash9.github.io/harness-design/embed/
JSON:   https://example.com/example.json
```

Keeping JSON beside the editor avoids CORS configuration and keeps `connect-src 'self'` intact. If you intentionally support remote data, update all three layers:

1. The editor's origin check.
2. Its `connect-src` CSP directive.
3. The JSON server's CORS headers.

For a cross-origin `postMessage` bridge, use exact origins rather than `*`:

```js
editor.contentWindow.postMessage(message, "https://killspacedash9.github.io");
```

And validate the parent inside the iframe:

```js
if (event.origin !== "https://example.com") return;
```

## Expand and restore

Keep the embedded control inside the article width by default, then use the browser Fullscreen API for detailed inspection. The toolbar button remains inside the fullscreen element, so it can restore the control without relying on the Escape key.

```html
<div class="harness-shell" id="harness-shell">
  <div class="harness-toolbar">
    <span>Interactive harness</span>
    <button id="harness-fullscreen" type="button" aria-pressed="false">
      Expand
    </button>
  </div>
  <iframe
    src="/harness-design/embed/?src=/harness-design/data/2vD1.json"
    title="Interactive harness viewer"
  ></iframe>
</div>
```

```css
.harness-shell {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.harness-shell iframe {
  width: 100%;
  height: min(62vh, 620px);
  min-height: 520px;
  border: 0;
}

.harness-shell:fullscreen {
  width: 100vw;
  height: 100vh;
  background: #131716;
}

.harness-shell:fullscreen iframe {
  flex: 1;
  height: auto;
  min-height: 0;
}
```

```js
const shell = document.querySelector("#harness-shell");
const button = document.querySelector("#harness-fullscreen");

function syncFullscreenButton() {
  const expanded = document.fullscreenElement === shell;
  button.textContent = expanded ? "Restore" : "Expand";
  button.setAttribute("aria-pressed", String(expanded));
}

button.addEventListener("click", async () => {
  if (document.fullscreenElement === shell) {
    await document.exitFullscreen();
  } else {
    await shell.requestFullscreen();
  }
});

document.addEventListener("fullscreenchange", syncFullscreenButton);
```

The deployed sample includes a fixed-viewport fallback for browsers or embedding policies that deny native fullscreen.

## Responsive sizing

React Flow requires a non-zero viewport. Give the iframe an explicit height or minimum height.

```css
.harness-frame {
  width: 100%;
  max-width: 100%;
  height: clamp(520px, 62vh, 620px);
}

@media (max-width: 640px) {
  .harness-frame {
    height: 560px;
    border-radius: 0;
  }
}
```

Typical useful minimums:

| Context | Recommended height |
|---|---:|
| Read-only desktop docs | 600–750px |
| In-memory desktop editing | 700–900px |
| Mobile inspection | 520–600px |

## Static security and persistence

The deployed editor uses normal application chrome with an explicit offline guard:

```js
if (
  window.__HARNESS_STATIC__ ||
  isDemo ||
  isRevisionView
) {
  return;
}
```

This preserves editor controls while preventing remote saves. The static build also disables:

- Supabase document queries
- Authentication and account sessions
- Realtime channels
- Sentry
- Vercel Analytics
- Userback and feedback transports
- Remote persistence

Edits are browser-memory-only and reset when the iframe reloads. Add an explicit local export/download or persistence layer if permanent edits are required.

## Deployment under GitHub Pages

The project is hosted at the project-site base path:

```text
/harness-design/
```

All iframe, JSON, script, stylesheet, and Turbopack paths must retain that prefix. The repository also includes `.nojekyll`; without it GitHub Pages may omit `_next/` assets.

Before publishing, run:

```bash
node scripts/build-2vD1.mjs
node scripts/verify-build.mjs
git diff --check
```

The verifier checks the external JSON loader, same-origin restriction, offline save guard, application assets, project base path, and absence of production backend credentials.
