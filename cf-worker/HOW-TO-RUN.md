# How to Run/Deploy the Proxy

## Quick Start (3 Steps)

### 1. Install Wrangler (No sudo needed!)

**Option A: Use npx (Recommended - No installation needed)**
```bash
# Just use npx when running wrangler commands
npx wrangler login
npx wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

**Option B: Install locally in project**
```bash
cd cf-worker
npm init -y
npm install wrangler
```

Then use:
```bash
cd cf-worker
npx wrangler login
npx wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

**Option C: If you must install globally**
```bash
sudo npm install -g wrangler
```

### 2. Deploy the Worker
```bash
cd cf-worker
npx wrangler login
npx wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

### 3. Update the URL in Browser App
After deployment, you'll get a URL like `https://hyggshi-web-proxy.xxx.workers.dev`

Edit `js/apps-core.js` line ~883 and replace:
```javascript
const proxyUrl = `https://hyggshi-web-proxy.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

With your actual URL:
```javascript
const proxyUrl = `https://hyggshi-web-proxy.xxx.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

## Alternative: Use the Deployment Script

```bash
cd cf-worker
chmod +x deploy.sh
./deploy.sh
```

## Test It

1. Open `OSmain.html` in your browser
2. Open the **Browser** app
3. Type: `https://game.chronodivide.com`
4. Press Enter - it should load without errors!

## What You Need

- **Node.js** - https://nodejs.org/
- **Cloudflare Account** (free) - https://dash.cloudflare.com/sign-up

## Troubleshooting

**"EACCES: permission denied" error**
- **Don't use** `sudo npm install -g wrangler`
- **Use npx instead** (see Option A above) - no sudo needed!
- Or install locally: `cd cf-worker && npm install wrangler`

**"wrangler: command not found"**
```bash
# Use npx instead
npx wrangler login
npx wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

**"Not authenticated"**
```bash
npx wrangler login
```

**Site still shows X-Frame-Options error**
- Make sure you updated `js/apps-core.js` with your actual worker URL
- Check worker logs: `npx wrangler tail`

## Files Overview

```
cf-worker/
├── web-proxy.js              # The proxy worker code
├── wrangler-web-proxy.toml   # Configuration
├── deploy.sh                 # Automated deployment script
├── README.md                 # Full documentation
├── DEPLOY.md                 # Detailed deployment guide
└── HOW-TO-RUN.md            # This file
```

## Need More Help?

See `DEPLOY.md` for detailed step-by-step instructions.