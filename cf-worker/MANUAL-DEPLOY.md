# Manual Deployment (No npm/wrangler needed!)

If you're getting npm permission errors, deploy directly through the Cloudflare web interface.

## Step 1: Create a Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up for a free account
3. Verify your email

## Step 2: Create a Worker

1. Log into https://dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create Application**
4. Click **Create Worker**
5. Name it: `hyggshi-web-proxy`
6. Click **Deploy**

## Step 3: Edit the Worker Code

1. After deployment, click **Edit code** or go to the **Code** tab
2. **Delete all the default code** in the editor
3. **Copy and paste** the contents of `web-proxy.js` from this project
4. Click **Deploy** (top right)

## Step 4: Get Your Worker URL

Your worker URL will be:
```
https://hyggshi-web-proxy.<your-account>.workers.dev
```

**Copy this URL!**

## Step 5: Update the Browser App

Edit `js/apps-core.js` around line 883. Find:
```javascript
const proxyUrl = `https://hyggshi-web-proxy.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

Replace with your actual URL:
```javascript
const proxyUrl = `https://hyggshi-web-proxy.<your-account>.workers.dev/?url=${encodeURIComponent(fullUrl)}`;
```

## Step 6: Test It

1. Open `OSmain.html` in your browser
2. Open the **Browser** app
3. Navigate to: `https://game.chronodivide.com`
4. It should load without errors!

## Visual Guide

```
Cloudflare Dashboard
├── Workers & Pages
│   ├── Create Application
│   │   └── Create Worker
│   │       └── Name: hyggshi-web-proxy
│   │           └── Deploy
│   └── hyggshi-web-proxy (your worker)
│       ├── Code tab → Paste web-proxy.js content → Deploy
│       └── Settings tab → Copy your worker URL
```

## Troubleshooting

**"Can't find Workers & Pages"**
- Make sure you're logged into Cloudflare
- Workers might be under "Workers" only in older dashboards

**Worker not responding**
- Check the **Logs** tab in the worker dashboard
- Make sure you copied all of `web-proxy.js` correctly
- Redeploy the worker

**Site still shows X-Frame-Options error**
- Verify you updated `js/apps-core.js` with the correct URL
- Make sure the worker is deployed (check Cloudflare dashboard)
- Try accessing the proxy directly in your browser to test

## Advantages of Manual Deployment

- ✅ No npm/wrangler installation needed
- ✅ No permission errors
- ✅ Works on any operating system
- ✅ Easy to update code through web interface
- ✅ See logs directly in dashboard

## Updating the Worker Later

If you need to update the proxy code later:
1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages
3. Click on `hyggshi-web-proxy`
4. Go to **Code** tab
5. Make changes and click **Deploy**

## Need Help?

The Cloudflare web interface is very intuitive. If you can deploy this through the web UI, you'll never need to use wrangler CLI again!