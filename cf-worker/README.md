# Cloudflare Worker Web Proxy

This proxy bypasses `X-Frame-Options` and CORS restrictions for specific domains, allowing them to be embedded in iframes within the Hyggshi OS Browser app.

## Problem Solved

The error `Refused to display 'https://game.chronodivide.com/' in a frame because it set 'X-Frame-Options' to 'sameorigin'` occurs when websites prevent embedding in iframes on different origins. This proxy removes those restrictive headers.

## Files

- `web-proxy.js` - The Cloudflare Worker script
- `wrangler-web-proxy.toml` - Wrangler configuration
- `README.md` - This file

## Deployment Steps

### Prerequisites
- Node.js installed
- Cloudflare account (free tier works)
- Wrangler CLI installed: `npm install -g wrangler`

### 1. Authenticate with Cloudflare

```bash
wrangler login
```

### 2. Deploy the Worker

```bash
cd cf-worker
wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

Or if you want to use a different config file name:

```bash
wrangler deploy web-proxy.js --name hyggshi-web-proxy
```

### 3. Note Your Worker URL

After deployment, you'll get a URL like:
```
https://hyggshi-web-proxy.<your-subdomain>.workers.dev
```

### 4. Update the Browser App (Already Done ✅)

The browser app in `js/apps-core.js` has already been updated to automatically use the proxy for:
- `game.chronodivide.com`
- `chronodivide.com`

When users navigate to these domains in the Browser app, it will automatically route through the proxy.

## Usage

### Automatic (Recommended)
Just use the Browser app in Hyggshi OS. When you navigate to `https://game.chronodivide.com`, it will automatically use the proxy.

### Manual
You can also use the proxy directly:
```
https://hyggshi-web-proxy.<your-subdomain>.workers.dev/?url=https://game.chronodivide.com
```

## How It Works

1. **Header Stripping**: Removes `X-Frame-Options`, `Content-Security-Policy`, and other headers that prevent embedding
2. **URL Rewriting**: Rewrites all URLs in HTML to go through the proxy, ensuring all resources load correctly
3. **CORS Headers**: Adds permissive CORS headers to allow cross-origin requests
4. **User-Agent Spoofing**: Uses a standard browser User-Agent to avoid bot detection

## Adding More Domains

To proxy additional domains, edit `cf-worker/web-proxy.js` and add domains to the `PROXY_DOMAINS` array:

```javascript
const PROXY_DOMAINS = [
    'game.chronodivide.com',
    'chronodivide.com',
    'another-domain.com',  // Add more here
];
```

Then redeploy:
```bash
wrangler deploy web-proxy.js --config wrangler-web-proxy.toml
```

## Limitations

- **Performance**: Proxy adds slight latency (usually <100ms with Cloudflare)
- **Bandwidth**: Cloudflare free tier has 100,000 requests/day limit
- **Complex Sites**: Some sites with heavy JavaScript or WebSockets may not work perfectly
- **Login/Sessions**: Sites requiring authentication may have issues with session persistence

## Troubleshooting

### Site Still Not Loading
1. Check Cloudflare Worker logs: `wrangler tail`
2. Verify the domain is in the `PROXY_DOMAINS` list
3. Check if the site uses additional security measures (CAPTCHA, bot detection)

### Resources Not Loading
The proxy rewrites URLs, but some sites may use:
- JavaScript-generated URLs (harder to rewrite)
- Blob URLs
- Service Workers

These may require additional handling.

## Security Considerations

- This proxy strips security headers - only use for trusted sites
- The proxy is public - anyone can use it
- Consider adding rate limiting or authentication for production use
- Monitor usage in Cloudflare dashboard

## Cost

- **Cloudflare Workers Free Tier**: 100,000 requests/day
- **Paid Tier**: $5/month for 10 million requests

For personal use in Hyggshi OS, the free tier is usually sufficient.

## Alternative Solutions

If the proxy doesn't work for a specific site, consider:
1. **Browser Extensions**: Some extensions can bypass frame restrictions
2. **Native Apps**: For games, consider creating a native app wrapper
3. **API Integration**: If available, use the site's API directly

## Support

For issues with:
- **Cloudflare Worker**: Check [Cloudflare Docs](https://developers.cloudflare.com/workers/)
- **Hyggshi OS**: Check the main project repository