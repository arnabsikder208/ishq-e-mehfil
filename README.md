# Ishq e Mehfil – Ticket Verification Portal

Node.js + Express + MongoDB backend (TypeScript), vanilla HTML/CSS/JS frontend. Express serves the frontend, so **one deployment = one URL** for both gate staff.

## Local setup
1. Install Node 18+ and run `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` (see Atlas below).
3. Put the real ticket list in `data/tickets.csv` (replace the 3 sample rows).
4. `npm run import` then `npm run dev`, open http://localhost:3000.

## MongoDB Atlas
1. Create a free cluster at cloud.mongodb.com.
2. Database Access: create a user with a password (read/write).
3. Network Access: allow `0.0.0.0/0` (or your host's IPs).
4. Connect > Drivers: copy the connection string into `MONGODB_URI`.

## Importing tickets
Accepts CSV (`serialNo,name,phone`, header optional) or plain text (`1   Arnab   01533030453`).
`npm run import -- path/to/file.csv`
- Insert-only: existing tickets and their verification status are never changed, so re-importing an updated list is safe.
- Duplicate serials in the file and invalid lines are skipped and reported.
- Phone numbers are stored as strings (leading zeros kept). Serials are stored as strings; leading zeros are ignored ("007" = "7").

## Deployment (Render, Railway, Fly, any Node host)
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `MONGODB_URI`, `DB_NAME`, optionally `GATE_PASSCODE`. `PORT` is set by the host.
- Run the import once: `npm run import:prod` (after build) or `npm run import` from your machine pointing at the same Atlas URI.
- Both staff open the same URL, pick Gate 1 or Gate 2 on first visit.
- Split hosting (static frontend elsewhere): set `window.API_BASE="https://your-api"` in a script tag before `script.js` and set `CORS_ORIGIN` on the API to the frontend's origin.

## How the guarantees work
- **Atomic verification:** a single `findOneAndUpdate({serialNo, isVerified:false})`. Only one concurrent request can match; the other falls through and gets "already verified" with the original time and staff untouched.
- **History:** `verification_history` has a unique index on `serialNo`, written only on a first-time win.
- **No false success:** the UI shows success only after the server confirms the DB write. Network failure or timeout shows an error, never a success.
- **Live stats:** computed from MongoDB, pushed to all devices via Server-Sent Events (plus an 8 s polling fallback).
- **Times:** displayed in Asia/Dhaka.
- `GATE_PASSCODE` (optional) adds a shared passcode to the staff screen.

## Test checklist (run against your Atlas DB)
1. Verify a valid serial: green modal, verified +1, remaining -1.
2. Same serial again: orange warning, original time/staff, counters unchanged.
3. Unknown serial: red invalid modal.
4. Two devices: verify on A, search on B shows warning; counters match without refresh.
5. Simultaneous: `curl` two POSTs at once to `/api/verify` with different `x-staff-id`; exactly one returns `verified`.
6. Refresh both devices: counts persist.
7. Re-run the import: nothing resets, duplicates reported.
