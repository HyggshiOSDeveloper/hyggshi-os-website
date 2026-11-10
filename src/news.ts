import type { Post, FrontmatterResult } from './types';

const POSTS_INDEX_URL = '/posts/index.json';

/** Parse the small YAML-like frontmatter used by the static news posts. */
export function parseFrontmatter(raw: string): FrontmatterResult {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const data: Record<string, string> = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) return;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });

  return { data, content: match[2] };
}

export function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug);
}

export async function loadPosts(): Promise<Post[]> {
  const response = await fetch(POSTS_INDEX_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load the posts index.');

  const files: unknown = await response.json();
  if (!Array.isArray(files)) throw new Error('The posts index has an invalid format.');

  const posts: Post[] = await Promise.all(
    files.map(async (file: unknown): Promise<Post> => {
      if (typeof file !== 'string' || !/^[a-z0-9][a-z0-9-]*\.md$/i.test(file)) {
        throw new Error('The posts index contains an invalid filename.');
      }

      const postResponse = await fetch(`/posts/${file}`, { cache: 'no-store' });
      if (!postResponse.ok) throw new Error(`Unable to load ${file}.`);
      const { data, content } = parseFrontmatter(await postResponse.text());
      return {
        ...data,
        cover: data.cover || data.image,
        content,
        slug: slugFromFilename(file),
      };
    })
  );

  return posts.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
}

export async function loadPost(slug: string): Promise<Post> {
  if (!isValidSlug(slug)) throw new Error('Invalid post address.');
  const response = await fetch(`/posts/${slug}.md`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Post not found.');

  const { data, content } = parseFrontmatter(await response.text());
  return {
    ...data,
    cover: data.cover || data.image,
    content,
    slug,
  };
}

export function formatPostDate(date?: string): string {
  if (!date) return '';
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
}
