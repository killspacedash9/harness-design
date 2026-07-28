# harness.design local mirror

Static local mirror of `harness.design` plus the public embedded demo from `app.harness.design/zY/demo`.

## Run

```bash
npm start
```

Open:

- Landing page: <http://localhost:4173/>
- App demo directly: <http://localhost:4173/zY/demo?allowEdit=true&allowControls=false&highlightNets=true&views=Schematic%2CLayout&theme=dark>

## Refresh the downloaded files

```bash
npm run refresh
```

Downloaded files are listed in `mirror-manifest.json`. Source maps were checked, but the deployed site returned 404 for the `.map` files at the time this mirror was created.

## Local backend shim

The app bundle used Supabase. The mirrored bundle is patched to call `http://localhost:4173/supabase`, and `server.mjs` provides a small PostgREST-like JSON backend backed by `data/db.json`.

See `docs/backend-dependencies.md` for extracted tables/RPCs and `supabase/schema.sql` for a draft real Supabase schema.

Still stubbed: auth/login, realtime collaboration, billing, email delivery, and PDF generation.
