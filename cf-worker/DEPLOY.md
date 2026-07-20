# Quick Deployment Guide

## Step 1: Install Prerequisites

### Install Node.js
Download from https://nodejs.org/ (LTS version recommended)

### Install Wrangler CLI
```bash
npm install -g wrangler
```

## Step 2: Deploy the Proxy

### Option A: Using the deployment script (Linux/Mac)
```bash
cd cf-worker
chmod +x deploy.sh
./deploy.sh
```

### Option B: Manual deployment
```bash
cd cf-worker

# Login to Cloudflare (opens browser)
wrangler login

# Deploy the worker
wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

## Step 3: Copy Your Worker URL

After deployment, you'll see output like:
```
✨ Success! Deployed to https://hyggshi-web-proxy.<your-subdomain>.workers.dev
```

**Copy this URL** - you'll need it in the next step.

## Step 4: Update the Browser App

Open `js/apps-core.js` and find this line (around line 883):

```javascript
const proxyUrl = `https://hyggshi-web-proxy.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

Replace it with your actual URL:

```javascript
const proxyUrl = `https://hyggshi-web-proxy.<your-subdomain>.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

## Step 5: Test It

1. Open `OSmain.html` in your browser
2. Open the Browser app
3. Navigate to: `https://game.chronodivide.com`
4. The site should load without the X-Frame-Options error!

## Troubleshooting

### "wrangler: command not found"
```bash
npm install -g wrangler
```

### "Not authenticated"
```bash
wrangler login
```

### Worker deploys but site still shows error
1. Check that you updated `js/apps-core.js` with the correct URL
2. Verify the worker is running: `wrangler tail`
3. Check browser console for any CORS errors

### Want to see worker logs?
```bash
cd cf-worker
wrangler tail
```

## Quick Test

Test the proxy directly in your browser:
```
https://hyggshi-web-proxy.<your-subdomain>.workers.dev/?url=https://game.chronodivide.com
```

If this loads the site, the proxy is working!

## Need Help?

- Check `README.md` for detailed documentation
- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/