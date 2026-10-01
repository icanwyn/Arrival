# Arrival

Arrival checks kids in and out of practice.

## Install

```bash
npm install
```

## Run the tests

```bash
npm test
```

## Start the app

```bash
npm run dev
```

Open http://localhost:3000. The practice code is `practice`. Set `COACH_CODE` to change it.

## Try a practice

1. Create a team.
2. Click **Use sample roster**.
3. Click **Open practice**.
4. Open the parent URL under the QR code.
5. Enter a PIN from the roster.
6. Open **Board** and watch the row change.
7. Enter the same PIN again to check out.

## Deploy on Vercel

Run `supabase/schema.sql` in the Supabase SQL editor. Then set these on the Vercel project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both are server-only. Row level security is enabled and there are no anon policies, so the anon key cannot read PINs. Leave the service role key out of the browser and out of git.

`COACH_CODE` is optional. It defaults to `practice`.

On your machine, if those two variables are unset, `npm run dev` uses `file:data/arrival.db`. On Vercel a request fails until they are set. Turso is not used.
