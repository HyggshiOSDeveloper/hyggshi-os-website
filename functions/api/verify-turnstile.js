const corsHeaders = (origin) => ({
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
});

export async function onRequestOptions({ request }) {
    const origin = request.headers.get('Origin') || '';
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || origin || '*';

    // Origin check
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
        return Response.json(
            { success: false, error: 'origin_not_allowed' },
            { status: 403, headers: corsHeaders(allowedOrigin) }
        );
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    const action = String(body.action || '').trim();

    if (!token || !['login', 'register'].includes(action)) {
        return Response.json(
            { success: false, error: 'bad_request' },
            { status: 400, headers: corsHeaders(allowedOrigin) }
        );
    }

    // Verify với Cloudflare Turnstile
    const secretKey = env.TURNSTILE_SECRET_KEY || env.GC_TURNSTILE_SECRET_KEY;
    if (!secretKey) {
        return Response.json(
            { success: false, error: 'missing_secret_key' },
            { status: 500, headers: corsHeaders(allowedOrigin) }
        );
    }

    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    formData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

    const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body: formData }
    );
    const result = await verifyResponse.json().catch(() => ({ success: false }));

    return Response.json(
        { success: !!result.success, action },
        { status: result.success ? 200 : 403, headers: corsHeaders(allowedOrigin) }
    );
}
