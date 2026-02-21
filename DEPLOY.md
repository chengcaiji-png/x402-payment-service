# Deployment Guide

## 🚀 Railway (Recommended)

### 1. Install Railway CLI

```bash
npm i -g @railway/cli
```

### 2. Login

```bash
railway login
```

### 3. Deploy

```bash
cd /Users/chengcaiji/clawd/x402-service
railway init
railway up
```

Railway will automatically:
- Detect Node.js project
- Install dependencies (including native modules)
- Start the service
- Provide a public URL

### 4. Get Your URL

```bash
railway domain
```

Your service will be at: `https://x402-service-production.up.railway.app`

---

## 🔧 Fly.io (Alternative)

### 1. Install Flyctl

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Login

```bash
fly auth login
```

### 3. Launch

```bash
cd /Users/chengcaiji/clawd/x402-service
fly launch --name x402-payment-service
```

Answer prompts:
- **Copy config?** → Yes
- **Tweak settings?** → No
- **Deploy now?** → Yes

### 4. Access

Your service: `https://x402-payment-service.fly.dev`

---

## 🧪 Test Deployed Service

```bash
# Stats (free)
curl https://YOUR-DOMAIN.railway.app/api/stats

# Request service (gets 402)
curl https://YOUR-DOMAIN.railway.app/api/japanese-news

# With payment
curl -H "Payment-Tx: 0xYOUR_TX_HASH" \
  https://YOUR-DOMAIN.railway.app/api/japanese-news
```

---

## 📊 Monitor

### Railway Dashboard
- https://railway.app/dashboard
- View logs, metrics, environment

### Check Health
```bash
curl https://YOUR-DOMAIN/api/stats
```

---

## 🔐 Important Notes

1. **Database Persistence**
   - Railway: Automatic volume mount
   - Fly.io: Add persistent volume

2. **Environment Variables**
   - Set `PORT` (Railway auto-sets)
   - Optional: Custom `DB_PATH`

3. **Scaling**
   - Railway: Auto-scale on usage
   - Fly.io: `fly scale count 2`

4. **Logs**
   - Railway: `railway logs`
   - Fly.io: `fly logs`

---

## 🐛 Troubleshooting

### Build Fails (better-sqlite3)

Railway/Fly automatically install native dependencies. If it fails:

```bash
# Railway
railway run npm rebuild better-sqlite3

# Fly
fly ssh console
npm rebuild better-sqlite3
```

### Database Issues

Check if volume is mounted:
```bash
# Railway
railway run ls -la payments.db

# Fly
fly ssh console -C "ls -la payments.db"
```

---

## 🎯 Next Steps

1. Deploy service
2. Get public URL
3. Update `soulink.md` with URL
4. Test with real payment
5. Share URL with other agents!
