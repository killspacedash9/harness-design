# Backend dependencies extracted from the mirrored app

The downloaded app uses Supabase from the browser bundle.

## Supabase client

Found in `_next/static/chunks/6e42f5af53dff23a.js`:

- Original URL: `https://bhvgkfojbsyjpajmzdmw.supabase.co`
- Original publishable key: `sb_publishable_3LdJYcd61XM_IpFYtyslZA_pPTu1Gx_`

The local mirror patches this bundle to use:

- Local URL: `http://localhost:4173/supabase`
- Local key: `local-dev-anon-key`

`server.mjs` implements a small Supabase/PostgREST-compatible shim backed by `data/db.json`.

## Tables referenced by the client

- `documents`
  - Read: `document`, `updated_at`, `team_id`, document list metadata
  - Write: `document`, `title`, `public`; delete documents
- `document_revisions`
  - Read revision metadata and `snapshot`
- `document_shares`
  - Insert invites by email, list/revoke shares
- `part_libraries`
  - Read/insert/update `part_library`, optimistic conflict via `updated_at`
- `profiles`
  - Read/upsert `name`
- `customers`
  - Read `subscription`, `seat_count`, `status`
- `teams`
  - Read/create/delete team records
- `team_members`
  - Read/update/delete memberships and seats
- `team_invites`
  - Read/insert/update/delete team invitations
- `editor_state`
  - Upsert heartbeat for active editors

## RPC/functions referenced

- `get_effective_plan()`
- `get_my_invites()`
- `get_team_members(team)`
- `is_team_active(team)`
- `accept_team_invite(invite_id)`
- `create_team(team_name)`
- `set_document_team(doc_id)`
- `remove_document_team(doc_id)`
- `get_revision_authors(doc_id)`
- `create_document_revision(doc_id, msg)`
- `restore_document_revision(rev_id)`

## Other HTTP endpoints referenced

- `POST /new` creates a document from uploaded JSON; implemented locally.
- `GET /stripe/subscription` returns subscription summary; stubbed locally as free.
- `GET /stripe/manage` is linked from UI; not implemented.
- `GET /api/pdf/:view` and `/api/pdf/formboard-panels` are PDF export endpoints; currently return 501 locally.
- Supabase Realtime channels are referenced for collaboration/presence/invites/team updates. The local shim does not implement WebSockets yet.

## Current local replacement status

Implemented enough for the public demo document to load from local JSON without calling production Supabase. `data/db.json` is seeded with the public `zY` demo document.

Not yet fully implemented: auth/login, realtime collaboration, billing, email delivery, and PDF generation.
