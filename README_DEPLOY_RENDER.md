Render deployment (backend) — Deprecated

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
4) Confirm the service named `ymobooks` and create it.
5) Alternative (if not using Blueprint): Create a Web Service from the repo root and set:
   - Build Command: `npm --prefix server install`
   - Start Command: `node server-start.js`
   - Root Directory: leave as repo root
6) Set environment variables (Render -> Service -> Environment):
   - `NODE_VERSION=20`
   - `MONGO_URI` (set to your MongoDB Atlas connection string)
   - `GENERATED_ROOT=/opt/render/project/src/server`
   - `COMPANIES_FILE=/opt/render/project/src/server/companies.json`

Current production backend: Vercel
- The project now uses Vercel for production backend.
- Mobile app base URL: `https://ymobooks.vercel.app` (set in `app.json` -> `expo.extra.apiBaseUrl`).
  - You can still override at build time with `EXPO_PUBLIC_API_BASE_URL`.

Building the APK for production
1) Ensure `app.json` -> `expo.extra.apiBaseUrl` points to `https://ymobooks.vercel.app`.
2) Build a release APK: `cd android && ./gradlew.bat assembleRelease`.
3) The APK appears at `android/app/build/outputs/apk/release/app-release.apk`.
4) Copy it into `release/YmoBooks-release.apk`.

Notes
- The server listens on `process.env.PORT` (Render sets this automatically) and falls back to 4000 locally.
- If Mongo is unavailable, registration and updates are persisted to `server/companies.json` and invoices to `server/generated/invoices/`.