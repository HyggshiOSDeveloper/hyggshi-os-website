/**
Hyggshi OS Web Edition
Cloudflare Worker — HuggingFace CORS Proxy
Deploy: wrangler deploy hf-proxy.js --name hyggshi-hf-proxy
Usage:  POST https://hyggshi-hf-proxy.<your-subdomain>.workers.dev/
    Body: { inputs: "...", parameters: { ... } }
    Header: Authorization: Bearer <hf_token>
*/
const HF_URL = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request) {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing HuggingFace token." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 🎲 Extract seed from parameters if exists
    const seed = body.parameters?.seed;
    
    // Forward to HuggingFace
    const hfResponse = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        provider: 'hf-inference', 
        ...body,
        // Only include seed if it exists
        ...(seed !== undefined && { parameters: { ...body.parameters, seed } })
      }),
    });

    // Stream the response back (image is binary)
    const responseHeaders = {
      ...CORS_HEADERS,
      "Content-Type": hfResponse.headers.get("Content-Type") || "application/octet-stream",
      "X-HF-Status": String(hfResponse.status),
      "X-Seed-Used": seed !== undefined ? String(seed) : "random",
    };

    return new Response(hfResponse.body, {
      status: hfResponse.status,
      headers: responseHeaders,
    });
  },
  // === Global bridge functions (add this at the end) ===
  chatExpandMoreModels: function(btn) { 
    if (window.ChatAI?.chatExpandMoreModels) {
      ChatAI.chatExpandMoreModels(btn); 
    }
  }
};