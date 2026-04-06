# ManMove Server — Deployment Guide

## Local Development

### Prerequisites
- Node.js v18+
- MongoDB running locally (`sudo systemctl start mongod`)

### Setup
```bash
npm install
node server.js
```
Server runs at `http://localhost:3010`

---

## Railway Deployment

### Step 1 — MongoDB Atlas (Free)
1. Go to https://cloud.mongodb.com and create a free cluster
2. Create a database user with a password
3. Whitelist all IPs: `0.0.0.0/0` under Network Access
4. Copy the connection string: `mongodb+srv://<user>:<pass>@cluster.mongodb.net/manmove`

### Step 2 — Cloudinary (Free)
1. Go to https://cloudinary.com and sign up
2. From the dashboard copy: Cloud Name, API Key, API Secret

### Step 3 — Deploy to Railway
1. Go to https://railway.app and create a new project
2. Connect your GitHub repo
3. Set these environment variables in the Railway dashboard:

| Variable | Value |
|---|---|
| `MONGO_URL` | MongoDB Atlas connection string |
| `JWT_SECRET` | Your JWT secret key |
| `SERVER_URL` | Your Railway app URL |
| `ALLOWED_ORIGINS` | Your frontend production URL |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_USER` | Email address |
| `EMAIL_PASS` | Email password |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging key |

> Do NOT set `PORT` — Railway injects it automatically.

---

## Local vs Railway

| Variable | Local `.env` | Railway Dashboard |
|---|---|---|
| `MONGO_URL` | `mongodb://127.0.0.1/manmove` | Atlas connection string |
| `SERVER_URL` | `http://localhost:3010` | Railway app URL |
| `ALLOWED_ORIGINS` | `http://localhost:4200` | Frontend production URL |
| `CLOUDINARY_*` | Your Cloudinary credentials | Same credentials |

---

## What Was Changed for Railway Compatibility

- **File uploads** — migrated from local disk to Cloudinary (works on both local and Railway)
- **MongoDB** — local uses local MongoDB, Railway uses Atlas
- **PORT** — already uses `process.env.PORT` (Railway compatible)
- **Deprecated options** — removed `useNewUrlParser` and `useUnifiedTopology`
- **Mongoose** — pinned to v6 for callback-style query compatibility
