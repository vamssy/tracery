# Deploying Tracery — Neon + Railway + Vercel

Three pieces: a **database** (Neon), the **backend API** (Railway), and the **static frontend** (Vercel).

```
[ Vercel: React frontend ]  →  [ Railway: FastAPI backend ]  →  [ Neon: Postgres + pgvector ]
```

Do them in this order.

---

## 1) Database — Neon

1. Create an account at **neon.tech** → **New Project**.
2. In the project's **SQL Editor**, run once:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Go to **Connection Details** and copy the **direct** connection string (NOT the `-pooler` one — the direct endpoint avoids prepared-statement issues with asyncpg). It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/DBNAME?sslmode=require
   ```
   Keep it — it's your `DATABASE_URL`. (The app auto-strips `sslmode`/`channel_binding` and connects over TLS, so paste it as-is.)

---

## 2) Backend — Railway

1. At **railway.com** → **New Project → Deploy from GitHub repo** → pick your `tracery` repo.
2. Open the service → **Settings → Root Directory** = `backend`. (Railway then uses `backend/Dockerfile` and `backend/railway.json`.)
3. **Variables** → add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon direct string from step 1 |
   | `LLM_PROVIDER` | `mock` &nbsp;(safe/free for a public link — see the ⚠️ note) |
   | `DEFAULT_MODEL` | `anthropic/claude-haiku-4-5-20251001` |
   | `PUBLIC_BASE_URL` | your Railway URL (set after step 5, then redeploy) |
   | `CORS_ORIGINS` | your Vercel URL (set after part 3, then redeploy) |

   *(If you set `LLM_PROVIDER=hybrid` for real answers, also add `ANTHROPIC_API_KEY`.)*
4. **Deploy.** The container runs `alembic upgrade head` (creates the tables) then starts uvicorn.
5. **Settings → Networking → Generate Domain.** Copy the URL (e.g. `https://tracery-api.up.railway.app`). Put it in `PUBLIC_BASE_URL` and redeploy.
6. Verify: open `https://YOUR-RAILWAY-URL/health` → `{"status":"ok","provider":"mock"}`.

---

## 3) Frontend — Vercel

1. At **vercel.com** → **Add New → Project** → import your `tracery` repo.
2. Configure:
   - **Root Directory** = `frontend`
   - Framework preset: **Vite** (auto-detected)
   - Build command: `npm run build` · Output dir: `dist`
3. **Environment Variables** → add:
   | Variable | Value |
   |---|---|
   | `VITE_API_BASE` | your Railway URL (from part 2, step 5) |
4. **Deploy.** Copy the resulting URL (e.g. `https://tracery.vercel.app`).
5. **Go back to Railway** → set `CORS_ORIGINS` to that Vercel URL → redeploy.

Open the Vercel URL — Tracery is live. 🎉

---

## ⚠️ Cost safety (important for a public portfolio link)

A public URL means strangers can trigger runs. **Deploy with `LLM_PROVIDER=mock`** so no one can burn your API credits — the whole app (canvas, tracing, executions, tests, deploy) still works; only the model *wording* is a deterministic placeholder. Keep **real Claude answers for your local, screen-recorded demo.**

If you want live real answers on the public link anyway:
- Set a **hard monthly spend limit** in the Anthropic console.
- Use the cheapest model and set `API_KEY` (bearer gate) so only you can run it.

---

## Gotchas checklist

- **pgvector** — only Neon/Supabase-class Postgres works; the migration does `CREATE EXTENSION vector`.
- **Migrations run on deploy** — the Railway start command handles `alembic upgrade head`.
- **Neon + asyncpg** — use the **direct** (non-pooler) connection string; the app strips libpq-only params and enables TLS automatically.
- **`VITE_API_BASE` is baked at build time** — if the backend URL changes, **redeploy the frontend**.
- **CORS** — `CORS_ORIGINS` on the backend must equal the exact Vercel origin.
- **`PUBLIC_BASE_URL`** — set it to the backend URL so the in-app **Deploy** feature generates correct `curl` endpoints.

---

## Redeploys
Both Railway and Vercel auto-deploy on every push to `main`. Push code → both rebuild.
