# Swarna

A private period & pill tracker for two. Installable web app (PWA): Vite + React + TypeScript, Supabase, Vercel.

## Run it on your computer

```sh
npm install
cp .env.example .env.local   # then fill in the two values (see below)
npm run dev                  # opens on http://localhost:5173
```

`.env.local` needs, from **Supabase → Project Settings → API Keys**:

- `VITE_SUPABASE_URL`: the project URL, e.g. `https://abcd1234.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: the **anon** / **publishable** key. Never use the `service_role` / secret key here.
- VITE_VAPID_PUBLIC_KEY: the web push public key

## Database

SQL migrations live in [supabase/migrations/](supabase/migrations/). Apply each new file once, in order:

- **Easy way:** Supabase dashboard → **SQL Editor** → paste the file → **Run**.
- **CLI way:** `npx supabase login`, then `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

## Deploy

Vercel builds every push to `main`. Its environment variables must include the same two `VITE_…` values as `.env.local`.

## Useful commands

| Command           | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| `npm run dev`     | Local dev server                                           |
| `npm run build`   | Type-check + production build into `dist/`                 |
| `npm run preview` | Serve the production build locally (service worker active) |
| `npm run icons`   | Regenerate app icons from `public/logo.svg`                |
