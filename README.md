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

Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. If `TURSO_DATABASE_URL` is unset, Arrival uses `file:data/arrival.db`.
