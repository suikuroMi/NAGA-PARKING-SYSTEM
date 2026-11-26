# Deploying Naga Smart Park on Render

This repository includes a ready-to-deploy [`render.yaml`](../render.yaml) Blueprint configured for the **Singapore** region (lowest latency to the Philippines) with automatic PostgreSQL schema initialization and HTTPS camera support.

---

## Option A: 1-Click Blueprint Deploy (Recommended)

1. Sign in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Blueprint**.
3. Connect and select your GitHub repository (`suikuroMi/NAGA-PARKING-SYSTEM`).
4. Render will read `render.yaml` and prompt you to enter your secret **4-digit PINs** (never stored in Git):
   - `INITIAL_ADMIN_PIN` — 4-digit Administrator PIN (e.g. avoid `1111` or `1234`)
   - `INITIAL_PIN_ATT_001` — Maria Santos (4-digit PIN)
   - `INITIAL_PIN_ATT_002` — Joel Reyes (4-digit PIN)
   - `INITIAL_PIN_ATT_003` — Ana Cruz (4-digit PIN)
   - `INITIAL_PIN_ATT_004` — Mark Dela Cruz (4-digit PIN)
5. *(Optional)* If you want pre-populated presentation sample records on first boot instead of an empty 60-slot facility, change `SEED_DEMO` to `true` in the Web Service **Environment** tab before first startup.
6. Click **Apply**. Render will provision:
   - **`naga-parking-db`** (PostgreSQL)
   - **`naga-smart-parking`** (Next.js Web Service)

On startup, `npm run render:start` automatically runs `npm run db:setup` (creating tables on first boot and preserving existing data on all subsequent deploys) and starts Next.js.

---

## Option B: Manual Web Service + Render PostgreSQL

1. **Create PostgreSQL**:
   - **New +** → **Postgres** → Name: `naga-parking-db`, Region: **Singapore**, Plan: **Free** (or Starter).
   - Copy its **Internal Database URL** (if Web Service is in Singapore) or **External Database URL**.
2. **Create Web Service**:
   - **New +** → **Web Service** → Connect `suikuroMi/NAGA-PARKING-SYSTEM`.
   - **Region**: Singapore
   - **Runtime**: Node
   - **Build Command**: `npm run render:build`
   - **Start Command**: `npm run render:start`
   - **Health Check Path**: `/api/health`
3. **Environment Variables**:
   - `NODE_VERSION` = `22.16.0`
   - `DATABASE_URL` = *(paste your Render Postgres URL)*
   - `SEED_DEMO` = `false` *(or `true` for demo fixtures)*
   - `INITIAL_ADMIN_PIN` = *(4-digit PIN)*
   - `INITIAL_PIN_ATT_001` = *(4-digit PIN)*
   - `INITIAL_PIN_ATT_002` = *(4-digit PIN)*
   - `INITIAL_PIN_ATT_003` = *(4-digit PIN)*
   - `INITIAL_PIN_ATT_004` = *(4-digit PIN)*

---

## Using the Deployed App

Once live at `https://<your-service>.onrender.com`:
- **Overview Hub**: `https://<your-service>.onrender.com/`
- **Entrance Kiosk**: `https://<your-service>.onrender.com/kiosk`
- **Exit Terminal (Phone / Tablet / PC)**: `https://<your-service>.onrender.com/exit`
- **Admin Console**: `https://<your-service>.onrender.com/admin`
- **Health Check**: `https://<your-service>.onrender.com/api/health`

Because Render automatically provisions a public trusted HTTPS certificate, **Android Chrome and iPhone Safari camera QR scanning work immediately** at `/exit` with no manual CA certificate installation required.

> **Free Tier Notes:** Render Free Web Services spin down after 15 minutes of inactivity (taking ~30–50 seconds to wake on the next visit), and Render Free Postgres instances expire after 30 days unless upgraded to a paid plan or backed up via `pg_dump`.
