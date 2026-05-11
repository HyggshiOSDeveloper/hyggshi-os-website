export async function onRequestGet({ env }) {
    return Response.json({
        siteKey: env.GC_TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY || ''
    }, {
        headers: {
            'Cache-Control': 'no-store'
        }
    });
}
