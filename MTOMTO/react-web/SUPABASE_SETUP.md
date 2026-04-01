# Supabase Setup (Manual Handoff Points)

This project is already wired to persist runtime data to Supabase when env keys are present.

## What is already implemented

- Supabase SDK installed (`@supabase/supabase-js`)
- Frontend Supabase client setup in `src/backend/supabaseClient.ts`
- Full runtime snapshot store in `src/backend/runtimeStore.ts`
- Controller sync wiring (templates, schedules, inbox, calendar history, week state, supplies rows)
- SQL schema prepared in `supabase/schema.sql`
- Local fallback still active if Supabase keys are not set

## Manual step 1: Run SQL in Supabase

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Paste and run the contents of:
   - `supabase/schema.sql`

## Manual step 2: Provide frontend env keys

Create `.env.local` in the project root (or use your deployment env vars):

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_WORKSPACE_ID=default
```

Then restart the dev server.

If you have a dashboard URL like:
`https://supabase.com/dashboard/project/<project-ref>`
then your API URL is typically:
`https://<project-ref>.supabase.co`

## Notes

- Current RLS policies in `schema.sql` are intentionally open for prototyping (`anon/authenticated` can read/write).
- Tighten policies before production.
- Data model is stored as structured JSON domains in `app_backend_state`, which is already sufficient to power a future dashboard API/query layer.
- Never place `sb_secret_...` (service role) into `VITE_` env vars. Service keys belong only on server-side runtimes.
