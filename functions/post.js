const BOT_UA_REGEX = /(discordbot|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot|skypeuripreview|vkshare|w3c_validator|redditbot|pinterest|embedly)/i;

const SITE_ORIGIN = "https://hyggshi-os-website.pages.dev";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const userAgent = request.headers.get("user-agent") || "";

  const isBot = BOT_UA_REGEX.test(userAgent);

  if (!isBot || !slug) {
    return context.next();
  }

  try {
    const post = await fetchPostMeta(slug, env, context);

    if (!post) {
      return context.next();
    }

    const html = renderMetaHTML(post, slug);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (err) {
    return context.next();
  }
}

async function fetchPostMeta(slug, env, context) {

  const mdRes = await fetch(`${SITE_ORIGIN}/posts/${slug}.md`);
  if (!mdRes.ok) return null;

  const raw = await mdRes.text();
  const frontmatter = parseFrontmatter(raw);
  if (!frontmatter) return null;

  return {
    title: frontmatter.title || "Hyggshi OS Blog",
    description: frontmatter.excerpt || frontmatter.description || "",
    image: toAbsoluteUrl(frontmatter.cover || frontmatter.image, SITE_ORIGIN),
    date: frontmatter.date || "",
    category: frontmatter.category || "",
  };
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*([\s\S]*?)\s*---/);
  if (!match) return null;

  const block = match[1];
  const data = {};
  block.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    data[key] = value;
  });
  return data;
}

function toAbsoluteUrl(path, origin) {
  if (!path) return `${origin}/default-cover.png`;
  if (path.startsWith("http")) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMetaHTML(post, slug) {
  const pageUrl = `${SITE_ORIGIN}/post?slug=${encodeURIComponent(slug)}`;
  const title = escapeHtml(post.title);
  const description = escapeHtml(post.description);
  const image = escapeHtml(post.image);
  const category = escapeHtml(post.category);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>

<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Hyggshi OS Blog" />
${category ? `<meta property="article:section" content="${category}" />` : ""}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />

<meta http-equiv="refresh" content="0; url=${pageUrl}" />
</head>
<body>
<p>Redirecting to <a href="${pageUrl}">${title}</a>...</p>
</body>
</html>`;
}
