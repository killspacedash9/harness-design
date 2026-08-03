# Reverse Engineering Plan

Goal: recover a pragmatic, modifiable `/src`-style codebase from the mirrored/minified app bundles. This will not recover the original source exactly, because deployed source maps are unavailable, but it can produce a readable working codebase over time.

## Constraints

- Source maps for deployed JS/CSS returned 404.
- Original filenames, comments, local variable names, and exact folder structure are not recoverable directly.
- We can recover behavior, module boundaries, dependencies, routes, data contracts, and gradually rename/refactor into maintainable code.

## High-level approach

1. Extract Turbopack bundle modules.
2. Beautify and split modules into individual files.
3. Identify and remove bundled vendor libraries.
4. Reconstruct app entrypoints/routes.
5. Rename and reorganize domain code incrementally.
6. Replace backend calls with local Supabase or a compatible local backend.
7. Rebuild as a clean React/Next/Vite project.

## Step 1: Extract bundle modules

Parse each bundle containing:

```js
globalThis.TURBOPACK.push(...)
```

Split numeric module IDs into separate recovered files, for example:

```text
recovered/modules/929363.js
recovered/modules/920755.js
recovered/modules/12202.js
```

Preserve dependency references such as:

```js
e.i(...)
e.r(...)
e.A(...)
e.l(...)
```

Output a module manifest:

```text
recovered/module-map.json
```

## Step 2: Beautify modules

Run Prettier or equivalent formatting over each extracted module.

Expected output:

```text
recovered/pretty-modules/
  929363.js
  920755.js
  ...
```

## Step 3: Identify vendor code

Identify bundled third-party libraries and replace them with normal npm imports where possible.

Likely vendors found so far:

- React
- React DOM
- Next.js runtime
- Mantine
- Supabase JS / Supabase SSR
- React Flow
- Zustand
- Tabler icons
- Sentry
- Vercel analytics

This step should dramatically reduce bundle noise and make app-owned code easier to isolate.

## Step 4: Recover app entrypoints and routes

Known routes from the bundle:

```text
/[id]
/[id]/demo
/[id]/revision/[revisionNumber]
/auth/login
/auth/sign-up
/auth/forgot-password
```

Important discovered entrypoint:

```text
EditorClient
```

The largest client/app chunk appears to be:

```text
_next/static/chunks/f29c2c2f8ccd16c3.js
```

This chunk contains most domain/editor logic.

## Step 5: Reconstruct domain modules

Use string literals, UI labels, Supabase calls, Zustand stores, and component structure to separate app code into semantic modules.

Likely target structure:

```text
src/
  app/
  editor/
  document/
  document-sync/
  parts-library/
  schematic/
  layout/
  revisions/
  sharing/
  teams/
  billing/
  auth/
  supabase/
  components/
  icons/
  utils/
```

## Step 6: Rename semantically

Original variable/function names are minified, so rename based on behavior.

Examples of behavior already identified:

- document load/save
- optimistic document conflict handling
- parts library load/save
- revision create/restore
- document sharing
- team invitations
- team membership and seats
- subscription checks
- PDF export
- local JSON import/export
- realtime presence/editing notifications

Rename in small, tested passes rather than trying to rename the whole bundle at once.

## Step 7: Backend replacement

The app uses Supabase. Extracted backend details are documented in:

```text
docs/backend-dependencies.md
supabase/schema.sql
```

Tables referenced by client:

- `documents`
- `document_revisions`
- `document_shares`
- `part_libraries`
- `profiles`
- `customers`
- `teams`
- `team_members`
- `team_invites`
- `editor_state`

RPCs referenced by client:

- `get_effective_plan`
- `get_my_invites`
- `get_team_members`
- `is_team_active`
- `accept_team_invite`
- `create_team`
- `set_document_team`
- `remove_document_team`
- `get_revision_authors`
- `create_document_revision`
- `restore_document_revision`

Two possible backend paths:

### Option A: Keep local compatibility shim

Continue expanding `server.mjs`, backed by `data/db.json`.

Pros:

- Fastest iteration.
- Easy to inspect and modify.
- No Docker/Supabase dependency.

Cons:

- Realtime/auth/billing/PDF must be custom-stubbed.
- Less faithful to production.

### Option B: Run local Supabase

Use `supabase/schema.sql` as a starting schema.

Pros:

- Closer to production behavior.
- Native PostgREST/Auth/Realtime.
- Easier to satisfy existing Supabase client calls.

Cons:

- Requires more setup.
- RLS/policies/functions still need refinement.
- Auth flows need local configuration.

## Step 8: Rebuild target app

Most pragmatic frontend target options:

### Vite + React

Good if the app is mostly client-side editor logic.

Pros:

- Simpler build system.
- Easier to iterate.
- Less Next.js runtime reconstruction.

### Next.js

Good if preserving exact route/app behavior matters.

Pros:

- Closer to deployed app architecture.
- Easier to mimic existing routes.

Cons:

- More complex to reconstruct from deployed bundles.

## Suggested milestone plan

### Milestone 1: Bundle extraction

Deliver:

```text
recovered/modules/
recovered/module-map.json
```

### Milestone 2: Vendor separation

Deliver:

```text
recovered/vendor-map.json
recovered/app-modules/
```

### Milestone 3: Minimal rebuilt shell

Deliver a new app that can mount the recovered editor component and load the seeded demo document.

### Milestone 4: Document editing/local save

Recover enough document sync logic to edit and persist to local backend.

### Milestone 5: Parts library + import/export

Recover parts library stores and JSON import/export flows.

### Milestone 6: Collaboration/billing/auth decisions

Choose which production features to truly implement and which to stub/remove.

## Expected outcome

- Exact original repo: not realistically recoverable.
- Usable, readable, modifiable clone: feasible.
- Best strategy: automated extraction first, then iterative semantic refactoring.
