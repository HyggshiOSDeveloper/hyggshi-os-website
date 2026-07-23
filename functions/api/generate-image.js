// functions/api/generate-image.js
//
// Cloudflare Pages Function — proxy tới Cloudflare Workers AI để generate ảnh.
// Đặt file này tại: /functions/api/generate-image.js trong repo web OS (Cloudflare Pages)
//
// Hỗ trợ 2 phương thức kết nối Workers AI:
// 1. Workers AI Binding (env.AI) - Cấu hình Pages binding: AI = Workers AI
// 2. REST API với secrets - Settings → Environment variables → Add secret:
//    - CF_ACCOUNT_ID = Cloudflare Account ID
//    - CF_API_TOKEN  = Cloudflare API Token (quyền "Workers AI: Read/Edit")
//
// API Endpoints:
//   GET  /api/generate-image  -> Kiểm tra trạng thái endpoint & các model hỗ trợ
//   POST /api/generate-image  -> Generate ảnh từ prompt
//
// Request Body (JSON):
//   {
//     "prompt": "a cyberpunk cat wearing futuristic glasses",
//     "model": "flux",            // optional: "flux", "sdxl", "fast", "dreamshaper", "sd15", "openjourney", "portrait"
//     "width": 1024,              // optional
//     "height": 1024,             // optional
//     "seed": 42                  // optional
//   }

const MODELS = {
    flux: "@cf/black-forest-labs/flux-1-schnell",
    "flux-1-schnell": "@cf/black-forest-labs/flux-1-schnell",
    sdxl: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "stable-diffusion-xl": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    fast: "@cf/bytedance/stable-diffusion-xl-lightning",
    lightning: "@cf/bytedance/stable-diffusion-xl-lightning",
    dreamshaper: "@cf/lykon/dreamshaper-8-lcm",
    sd15: "@cf/runwayml/stable-diffusion-v1-5",
    "stable-diffusion-v1-5": "@cf/runwayml/stable-diffusion-v1-5",
    openjourney: "@cf/prompthero/openjourney",
    portrait: "@cf/segmind/portrait-plus",
};

const DEFAULT_MODEL = "flux";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json().catch(() => ({}));
        const prompt = (body.prompt || "").trim();

        if (!prompt) {
            return jsonError("Thiếu prompt (prompt parameter is required)", 400);
        }
        if (prompt.length > 2000) {
            return jsonError("Prompt quá dài (tối đa 2000 ký tự)", 400);
        }

        const modelKey = body.model && MODELS[body.model.toLowerCase()] ? body.model.toLowerCase() : DEFAULT_MODEL;
        const model = MODELS[modelKey] || MODELS[DEFAULT_MODEL];

        const aiInputs = { prompt };
        if (body.width && !isNaN(body.width)) aiInputs.width = parseInt(body.width, 10);
        if (body.height && !isNaN(body.height)) aiInputs.height = parseInt(body.height, 10);
        if (body.seed && !isNaN(body.seed)) aiInputs.seed = parseInt(body.seed, 10);
        if (body.num_steps && !isNaN(body.num_steps)) aiInputs.num_steps = parseInt(body.num_steps, 10);

        // 1. Thử dùng Workers AI binding (env.AI) nếu có sẵn
        if (env.AI && typeof env.AI.run === "function") {
            try {
                const aiResult = await env.AI.run(model, aiInputs);

                if (aiResult instanceof Response) {
                    const resHeaders = new Headers(aiResult.headers);
                    Object.entries(corsHeaders).forEach(([k, v]) => resHeaders.set(k, v));
                    return new Response(aiResult.body, { status: aiResult.status, headers: resHeaders });
                }

                if (aiResult instanceof ReadableStream || aiResult instanceof Uint8Array || aiResult instanceof ArrayBuffer) {
                    const headers = new Headers(corsHeaders);
                    headers.set("Content-Type", "image/png");
                    headers.set("Cache-Control", "no-store");
                    return new Response(aiResult, { headers });
                }

                if (aiResult && aiResult.image) {
                    const headers = new Headers(corsHeaders);
                    headers.set("Content-Type", "application/json");
                    return new Response(
                        JSON.stringify({
                            success: true,
                            model: modelKey,
                            image: `data:image/png;base64,${aiResult.image}`,
                        }),
                        { headers }
                    );
                }
            } catch (bindingErr) {
                console.warn("Workers AI Binding failed, falling back to REST API:", bindingErr.message);
            }
        }

        // 2. Dùng Cloudflare REST API với env.CF_ACCOUNT_ID và env.CF_API_TOKEN
        const accountId = env.CF_ACCOUNT_ID;
        const apiToken = env.CF_API_TOKEN;

        if (!accountId || !apiToken) {
            return jsonError(
                "Server chưa cấu hình Workers AI binding (env.AI) hoặc CF_ACCOUNT_ID / CF_API_TOKEN secrets",
                500
            );
        }

        const aiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

        const aiResponse = await fetch(aiUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(aiInputs),
        });

        if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            console.error("Workers AI REST API error:", errText);
            return jsonError(`Lỗi khi gọi Workers AI (${aiResponse.status}): ${errText}`, 502);
        }

        const contentType = aiResponse.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            const data = await aiResponse.json();
            const base64 = data?.result?.image;

            if (!base64) {
                return jsonError("Không nhận được dữ liệu ảnh từ Workers AI response", 502);
            }

            const headers = new Headers(corsHeaders);
            headers.set("Content-Type", "application/json");
            return new Response(
                JSON.stringify({
                    success: true,
                    model: modelKey,
                    image: `data:image/png;base64,${base64}`,
                }),
                { headers }
            );
        }

        // Trả về binary image (image/png)
        const imageBuffer = await aiResponse.arrayBuffer();
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "image/png");
        headers.set("Cache-Control", "no-store");

        return new Response(imageBuffer, { headers });
    } catch (err) {
        console.error("generate-image function error:", err);
        return jsonError(`Lỗi server nội bộ: ${err.message}`, 500);
    }
}

export async function onRequestGet() {
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/json");
    return new Response(
        JSON.stringify({
            ok: true,
            message: "POST { prompt, model?, width?, height?, seed? } tới endpoint này để generate ảnh.",
            availableModels: Object.keys(MODELS),
            defaultModel: DEFAULT_MODEL,
        }),
        { headers }
    );
}

function jsonError(message, status = 400) {
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/json");
    return new Response(
        JSON.stringify({ success: false, error: message }),
        { status, headers }
    );
}