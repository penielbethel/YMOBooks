Render deployment (backend)

Overview
- This repo contains a frontend (React Native) and a backend (Node/Express) under `server/`.
- Deploy only the backend to Render; the mobile app will call it using a public URL.

Prerequisites
- A GitHub repository containing this project.
- A Render account (https://render.com/).
- Optional: a MongoDB connection string if you want Atlas persistence; otherwise the app uses file fallback.

Steps
1) Push this repo to GitHub.
2) Preferred: In Render, click “New” -> “Blueprint” and point it to your GitHub repo.
3) Render will detect `render.yaml` at the repo root.
4) Confirm the service named `ymobooks-server` and create it.
5) Alternative (if not using Blueprint): Create a Web Service from the repo root and set:
   - Build Command: `npm --prefix server install`
   - Start Command: `node server-start.js`
   - Root Directory: leave as repo root
6) Set environment variables (Render -> Service -> Environment):
   - `NODE_VERSION=20`
   - `MONGO_URI` (leave empty to rely on file fallback, or set to your Mongo URI)
   - `GENERATED_ROOT=/opt/render/project/src/server`
   - `COMPANIES_FILE=/opt/render/project/src/server/companies.json`

After deployment
- Render will assign a public URL like `https://ymobooks.onrender.com`.
- Update the mobile app base URL to point to this domain.
  Options:
  - For permanent config: update `app.json` -> `expo.extra.apiBaseUrl`.
  - For build-time override: set `EXPO_PUBLIC_API_BASE_URL` in your build environment.

Building the APK for production
1) Update `app.json` -> `expo.extra.apiBaseUrl` to your final Render URL.
2) Build a release APK: `cd android && ./gradlew.bat assembleRelease`.
3) The APK appears at `android/app/build/outputs/apk/release/app-release.apk`.
4) Copy it into `release/YmoBooks-release.apk`.

Notes
- The server listens on `process.env.PORT` (Render sets this automatically) and falls back to 4000 locally.
- If Mongo is unavailable, registration and updates are persisted to `server/companies.json` and invoices to `server/generated/invoices/`.