const POSTS_INDEX_URL = '/posts/index.json';

/** Parse the small YAML-like frontmatter used by the static news posts. */
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) return;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });

  return { data, content: match[2] };
}

export function slugFromFilename(filename) {
  return filename.replace(/\.md$/i, '');
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug);
}

export async function loadPosts() {
  const response = await fetch(POSTS_INDEX_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load the posts index.');

  const files = await response.json();
  if (!Array.isArray(files)) throw new Error('The posts index has an invalid format.');

  const posts = await Promise.all(files.map(async (file) => {
    if (typeof file !== 'string' || !/^[a-z0-9][a-z0-9-]*\.md$/i.test(file)) {
      throw new Error('The posts index contains an invalid filename.');
    }

    const postResponse = await fetch(`/posts/${file}`, { cache: 'no-store' });
    if (!postResponse.ok) throw new Error(`Unable to load ${file}.`);
    const { data, content } = parseFrontmatter(await postResponse.text());
    return { ...data, cover: data.cover || data.image, content, slug: slugFromFilename(file) };
  }));

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function loadPost(slug) {
  if (!isValidSlug(slug)) throw new Error('Invalid post address.');
  const response = await fetch(`/posts/${slug}.md`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Post not found.');

  const { data, content } = parseFrontmatter(await response.text());
  return { ...data, cover: data.cover || data.image, content, slug };
}

export function formatPostDate(date) {
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}
