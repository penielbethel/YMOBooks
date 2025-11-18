# Deployment: Vercel (Production Backend)

This project’s production backend runs on Vercel. The mobile app calls this backend via the base URL:

- API Base URL: `https://ymobooks.vercel.app`
- Mobile config: `app.json` → `expo.extra.apiBaseUrl` is set to `https://ymobooks.vercel.app`

## Repo Structure
- Mobile app (Expo/React Native): root files (`App.js`, `screens/`, `utils/`, etc.)
- Backend (Node/Express): `server/` directory (`server/index.js`, static pages under `server/public/`)

## Environment Variables (Vercel)
Set these in Vercel Project Settings → Environment Variables (Production):
- `MONGO_URI` (MongoDB Atlas connection string)
- Optional file-backed fallbacks:
  - `GENERATED_ROOT` (e.g., `/tmp/generated` or leave unset to default inside repo)
  - `COMPANIES_FILE` (e.g., `/tmp/companies.json` or leave unset to use repo path)

Notes:
- The server reads `process.env.PORT` when applicable; Vercel manages port allocation automatically for Serverless functions.

## Deploying to Vercel
You already have `https://ymobooks.vercel.app` live. If you need to redeploy or set up from scratch:

1. Connect your GitHub repo (`penielbethel/YMOBooks`) to Vercel.
2. Framework preset: “Other”.
3. Root directory: repo root.
4. Configure build/output:
   - For a Serverless setup, use Vercel’s Node function builder (`@vercel/node`) targeted at the backend entry.
   - Example `vercel.json` (optional):
     ```json
     {
       "builds": [{ "src": "server/index.js", "use": "@vercel/node" }],
       "routes": [
         { "src": "/api/(.*)", "dest": "server/index.js" },
         { "src": "/(.*)", "dest": "server/public/index.html" }
       ]
     }
     ```
   - Adjust routes depending on how `server/index.js` mounts the API and static files.
5. Set the environment variables listed above.
6. Deploy. The production URL should be `https://ymobooks.vercel.app`.

## API Endpoints (used by the mobile app)
The app calls these endpoints via `utils/api.js` (prefixed with `Config.API_BASE_URL`):
- Health: `GET /api/health`
- Companies:
  - `POST /api/register-company`
  - `POST /api/login`
  - `GET /api/company/:companyId`
  - `POST /api/update-company` (company details)
- Invoices:
  - `POST /api/invoice/create`
  - `GET /api/invoices` (list)
  - `GET /api/invoices/:invoiceNumber`
- Receipts:
  - `POST /api/receipt/create`
  - `GET /api/receipts` (list)
  - `GET /api/receipts/:receiptNumber`
  - `GET /api/receipts/by-invoice/:invoiceNumber`
- Expenses:
  - `POST /api/expenses/create`
  - `GET /api/expenses`
- Finance:
  - `GET /api/finance/summary`
  - `GET /api/finance/revenue-daily`
  - `GET /api/finance/expenses-daily`
- Admin:
  - `GET /api/admin/companies`
  - `GET /api/admin/company/:companyId`
  - `GET /api/admin/stats`
  - `POST /api/admin/migrate-files-to-db`
  - `GET /api/admin/duplicates`
  - `POST /api/admin/backfill-currency`

## CORS
If the backend is configured with CORS, ensure requests from the mobile app are allowed. For typical React Native and server-to-server use, a permissive CORS policy for required routes may be acceptable.

## Verification
1. Confirm the mobile bundle reads the correct base URL:
   - `app.json` → `expo.extra.apiBaseUrl` = `https://ymobooks.vercel.app`.
2. Run the app (`npx expo start`) and watch logs on the Login screen:
   - It should print `Runtime API_BASE_URL: https://ymobooks.vercel.app`.
3. Exercise an endpoint (e.g., login or create invoice) and check that the requests hit Vercel.

## Troubleshooting
- If you see “network error”, verify that your Vercel project routes `/api/*` to the server handler and that `MONGO_URI` is correct.
- If PDFs or generated files are not accessible, ensure file paths point to writeable temporary directories on Vercel (e.g., `/tmp`) or use persistent storage solutions.

## Mobile Build Notes
- Cloud builds (EAS) bake the base URL into the bundle. Rebuild if you change the API base.
- You can override at build time via `EXPO_PUBLIC_API_BASE_URL`, but `app.json` is already set for production.