/**
 * Hyggshi OS Web Edition
 * Cloudflare Worker — Generic Web Proxy
 * Bypasses X-Frame-Options and CORS restrictions
 * 
 * Deploy: wrangler deploy web-proxy.js --name hyggshi-web-proxy
 * Usage: https://hyggshi-web-proxy.<your-subdomain>.workers.dev/?url=https://game.chronodivide.com
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Sites that need proxy bypass
const PROXY_DOMAINS = [
  'game.chronodivide.com',
  'chronodivide.com',
  'youtube.com',
];

export default {
  async fetch(request) {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url');
      
      if (!targetUrl) {
        return new Response('Missing url parameter. Usage: ?url=https://example.com', {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
        });
      }

      // Validate URL
      let parsedTarget;
      try {
        parsedTarget = new URL(targetUrl);
      } catch {
        return new Response('Invalid URL', {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
        });
      }

      // Check if this domain needs proxying
      const needsProxy = PROXY_DOMAINS.some(domain => 
        parsedTarget.hostname === domain || parsedTarget.hostname.endsWith('.' + domain)
      );

      if (!needsProxy) {
        // For non-proxy domains, just redirect
        return Response.redirect(targetUrl, 302);
      }

      // Fetch the target content
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
      });

      // Get the response body
      const body = await response.text();

      // Remove security headers that prevent framing
      const filteredHeaders = {};
      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        // Skip headers that prevent embedding
        if (!['x-frame-options', 'frame-options', 'content-security-policy', 'x-content-type-options'].includes(lowerKey)) {
          filteredHeaders[key] = value;
        }
      }

      // Add CORS headers
      const finalHeaders = {
        ...CORS_HEADERS,
        ...filteredHeaders,
        'X-Proxy-By': 'Hyggshi-OS',
      };

      // If it's HTML, rewrite URLs to go through proxy
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const modifiedHtml = rewriteHtmlUrls(body, parsedTarget);
        return new Response(modifiedHtml, {
          status: response.status,
          headers: { ...finalHeaders, 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return new Response(body, {
        status: response.status,
        headers: finalHeaders
      });

    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
      });
    }
  }
};

function rewriteHtmlUrls(html, baseUrl) {
  const proxyBase = `https://hyggshi-web-proxy.workers.dev`;
  
  // Rewrite src attributes
  html = html.replace(
    /(src|href|action)=["']([^"']+)["']/gi,
    (match, attr, url) => {
      if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) {
        return match;
      }
      
      const absoluteUrl = new URL(url, baseUrl);
      const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(absoluteUrl.href)}`;
      return `${attr}="${proxiedUrl}"`;
    }
  );

  // Rewrite srcset attributes
  html = html.replace(
    /srcset=["']([^"']+)["']/gi,
    (match, urls) => {
      const rewritten = urls.split(',').map(item => {
        const [url, descriptor] = item.trim().split(/\s+/);
        if (!url || url.startsWith('data:')) return item;
        
        const absoluteUrl = new URL(url, baseUrl);
        const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(absoluteUrl.href)}`;
        return descriptor ? `${proxiedUrl} ${descriptor}` : proxiedUrl;
      }).join(', ');
      return `srcset="${rewritten}"`;
    }
  );

  // Rewrite inline style URLs
  html = html.replace(
    /url\(["']?([^"')]+)["']?\)/gi,
    (match, url) => {
      if (url.startsWith('data:') || url.startsWith('#')) return match;
      
      const absoluteUrl = new URL(url, baseUrl);
      const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(absoluteUrl.href)}`;
      return `url("${proxiedUrl}")`;
    }
  );

  return html;
}