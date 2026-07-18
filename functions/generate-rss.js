// Chạy lúc build (Cloudflare Pages) để generate rss.xml từ posts/*.md
const fs = require("fs");
const path = require("path");

const ROOT       = path.join(__dirname, "..");
const POSTS_DIR  = path.join(ROOT, "posts");
const INDEX_FILE = path.join(POSTS_DIR, "index.json");
const OUT_FILE   = path.join(ROOT, "rss.xml");
const SITE_URL   = "https://hyggshi-os-website.pages.dev";

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const data = {};
  match[1].split(/\r?\n/).forEach(line => {
    const sep = line.indexOf(":");
    if (sep < 1) return;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });

  return { data, content: match[2] };
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function main() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error("❌ Không tìm thấy posts/index.json");
    process.exit(1);
  }

  const files = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));

  const posts = files.map(file => {
    const slug = file.replace(/\.md$/i, "");
    const raw  = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data } = parseFrontmatter(raw);
    return {
      title:   data.title || slug,
      date:    data.date || "",
      excerpt: data.excerpt || "",
      slug
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const items = posts.map(p => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="false">${escapeXml(p.slug)}</guid>
      <pubDate>${toRfc822(p.date)}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
    </item>`).join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hyggshi OS News</title>
    <link>${SITE_URL}/news.html</link>
    <description>Hyggshi OS latest updates</description>${items}
  </channel>
</rss>
`;

  fs.writeFileSync(OUT_FILE, rss, "utf8");
  console.log(`✅ Đã tạo rss.xml (${posts.length} bài)`);
}

main();
