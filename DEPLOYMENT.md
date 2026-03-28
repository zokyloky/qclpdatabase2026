# Phase 5 — Deployment Guide

## Overview

The app is a single service: FastAPI serves both the API (`/api/*`) and the React SPA (everything else).
It deploys to **Render** (free tier) and connects to **Supabase** for the database.

---

## Step 1 — Migrate the database (run once from your laptop)

Before deploying the app, push the SQLite data to Supabase:

```bash
# 1. Install the Postgres driver
pip install psycopg2-binary

# 2. Get your Supabase DB password:
#    Supabase dashboard → Settings → Database → Connection string
#    Copy the password from the URI (it's between postgres: and @db.)

# 3. Edit migrate_to_supabase.py — replace YOUR_PASSWORD
#    (the file is in this same directory)

# 4. Run the migration (takes ~1-2 minutes)
python migrate_to_supabase.py
```

Expected output:
```
[1/3] Migrating lp_firms ...      3,664 rows inserted.
[2/3] Migrating lp_contacts ...  31,330 rows inserted.
[3/3] Migrating sync_log ...          1 rows inserted.
Migration complete.
```

---

## Step 2 — Push to GitHub

1. Create a new GitHub repository (e.g. `quadria-lp-intelligence`).
2. Copy the contents of this `Phase 5 - Web Application/` folder into the repo root.
3. Add a `.gitignore`:

```
__pycache__/
*.pyc
.env
node_modules/
static/
frontend/node_modules/
```

4. Commit and push:
```bash
git init
git add .
git commit -m "Initial Phase 5 web application"
git remote add origin https://github.com/YOUR_USERNAME/quadria-lp-intelligence.git
git push -u origin main
```

---

## Step 3 — Deploy to Render

1. Go to https://render.com and sign up / log in.
2. Click **New → Web Service**.
3. Connect your GitHub repository.
4. Configure:
   - **Name:** `lp-intelligence` (or any name you like)
   - **Runtime:** Python 3
   - **Build command:**
     ```
     pip install -r requirements.txt && cd frontend && npm install && npm run build
     ```
   - **Start command:**
     ```
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance type:** Free

5. Set environment variables (in the Render dashboard → Environment):

   | Variable       | Value                                                                    |
   |----------------|--------------------------------------------------------------------------|
   | `APP_PASSWORD` | A strong password only the IR team knows                                 |
   | `SECRET_KEY`   | A random 64-char hex string (run: `python3 -c "import secrets; print(secrets.token_hex(32))"`) |
   | `DATABASE_URL` | `postgresql://postgres:YOUR_DB_PASSWORD@db.wbyuqjvdlavvxpzspygc.supabase.co:5432/postgres` |
   | `OVERDUE_DAYS` | `180`                                                                    |

6. Click **Create Web Service**. Render will build and deploy automatically.

7. Your app will be live at: `https://lp-intelligence.onrender.com` (or similar URL).

---

## Step 4 — Share with the IR team

Send the team:
- The URL (e.g. `https://lp-intelligence.onrender.com`)
- The `APP_PASSWORD` you set

That's it. No accounts to create — just the shared password.

---

## Running locally (for development)

```bash
# Terminal 1 — Backend
pip install -r requirements.txt
cp .env.example .env        # Fill in your values
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend (hot-reload)
cd frontend
npm install
npm run dev                 # Vite proxies /api to localhost:8000
```

Then open http://localhost:5173

---

## Quarterly Preqin sync

Each quarter when you receive a new Preqin contacts export:

1. Log into the app → **Sync** tab
2. Drag & drop the new Preqin contacts file (xlsx or csv)
3. Review the diff summary (new contacts, changes, deactivations)
4. Click **Commit sync**

The filter engine runs automatically on all new contacts.

---

## Maintenance notes

- **Database backups:** Supabase free tier retains 7 days of point-in-time backups.
- **App restarts on Render:** The free tier sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake up. A paid Render plan ($7/month) eliminates this.
- **Adding the Filter Settings screen:** The filter rules are stored in `filter_config.yaml` in the repo. Edit it and redeploy to change any rule. A UI for editing them (Phase 5, Screen 4) can be added in a future iteration.
- **Handing over:** The `DATABASE_URL` and `APP_PASSWORD` should be stored somewhere secure (e.g. Notion page, password manager) before you leave, so the next person can maintain it.
