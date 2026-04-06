# ManMove Server — Railway Deployment Guide

## Pre-flight Checklist

### ✅ Already Ready
- `railway.toml` — configured (`node server.js`, always restart)
- `package.json` — `start` script is `node server.js`
- `PORT` — reads from `process.env.PORT` (Railway sets this automatically)
- `MONGO_URL` — reads from env (just needs Atlas URL)
- Redis — optional, gracefully skipped if `REDIS_URL` not set
- File uploads — uses `multer.memoryStorage()` → streams to Cloudinary (no local disk needed ✅)
- CORS — reads `ALLOWED_ORIGINS` from env

### ⚠️ Must Do Before Push
- [ ] MongoDB Atlas connection string (current `.env` has `localhost`)
- [ ] Cloudinary account (current `.env` has placeholder values)
- [ ] `.env` must NOT be committed (already in `.gitignore`)
- [ ] Remove `Server.zip` and `._.DS_Store` from commit

---

## Step 1 — Update `.gitignore`

```bash
cat > .gitignore << 'EOF'
node_modules/
.env
uploads/
*.log
*.zip
.DS_Store
._.DS_Store
seed-*.js
EOF
```

---

## Step 2 — MongoDB Atlas Setup

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create free M0 cluster
2. **Database Access** → Add user → username + password
3. **Network Access** → Add IP → `0.0.0.0/0` (allow all — required for Railway)
4. **Connect** → Drivers → Copy connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/manmove?retryWrites=true&w=majority
   ```

---

## Step 3 — Cloudinary Setup (for photo uploads)

1. Go to [cloudinary.com](https://cloudinary.com) → Free account
2. Dashboard → copy **Cloud Name**, **API Key**, **API Secret**

---

## Step 4 — Push to GitHub

```bash
cd "dev manmove_server"

git add .
git commit -m "feat: railway deployment ready"
git push origin master
```

> If not yet on GitHub:
> ```bash
> git remote add origin https://github.com/YOUR_USERNAME/manmove-server.git
> git push -u origin master
> ```

---

## Step 5 — Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → select `manmove-server`
3. Railway detects `railway.toml` → auto-deploys with `node server.js`

---

## Step 6 — Set Environment Variables on Railway

Railway → your project → **Variables** tab:

| Variable | Value | Notes |
|---|---|---|
| `MONGO_URL` | `mongodb+srv://user:pass@cluster.mongodb.net/manmove` | From Atlas |
| `JWT_SECRET` | *(copy from your .env)* | Keep same as local |
| `JWT_REFRESH_SECRET` | *(copy from your .env)* | Keep same as local |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` | Angular deploy URL |
| `SERVER_URL` | `https://your-app.up.railway.app` | Railway URL |
| `EMAIL_HOST` | `md-in-64.webhostbox.net` | Same as local |
| `EMAIL_USER` | `noreply@serans.co.in` | Same as local |
| `EMAIL_PASS` | `serans@12345` | Same as local |
| `ALERT_EMAIL` | `noreply@serans.co.in` | Same as local |
| `CLOUDINARY_CLOUD_NAME` | *(from Cloudinary dashboard)* | |
| `CLOUDINARY_API_KEY` | *(from Cloudinary dashboard)* | |
| `CLOUDINARY_API_SECRET` | *(from Cloudinary dashboard)* | |
| `LOG_LEVEL` | `info` | |
| `NODE_ENV` | `production` | |

> `PORT` is set automatically by Railway — do NOT add it manually.

> `REDIS_URL` — optional. Skip unless you add a Redis service in Railway.

---

## Step 7 — Get Railway URL & Update Angular

After deploy, Railway → your service → **Settings** → copy public URL.

Update Angular frontend `src/environments/environment.prod.ts`:
```ts
export const environment = {
  production: true,
  apiUrl: 'https://manmove-server-production.up.railway.app'
};
```

---

## Step 8 — Verify

```bash
# Should return 401 (server running, auth required)
curl https://your-app.up.railway.app/rest/api/latest/projects
# Expected: {"status":401,"message":"No token"}
```

---

## Future Deployments

```bash
git add .
git commit -m "your update"
git push origin master
# Railway auto-redeploys in ~60 seconds
```

---

## Known Issues / Notes

| Item | Status | Action |
|---|---|---|
| `seed-*.js` files | Contain hardcoded `localhost` MongoDB | Excluded via `.gitignore` — do NOT run on Railway |
| `check-dashboard.js` | Hardcoded `localhost:3010` | Dev tool only — excluded |
| `uploads/` folder | Empty — multer uses memory storage | No action needed |
| Redis | Optional — app works without it | Add Railway Redis plugin if needed for rate limiting |
| Socket.io | Works on Railway | No extra config needed |
