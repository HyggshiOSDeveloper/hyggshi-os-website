import { formatPostDate, loadPost } from '../news';

declare const marked: {
  parse: (src: string) => string;
};

const container = document.getElementById('post-content');
const escapeHtml = (value = ''): string =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[char] || char
  );

async function initPost(): Promise<void> {
  if (!container) return;
  try {
    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) throw new Error('Missing slug');

    const post = await loadPost(slug);
    const image = post.cover || post.image;
    document.title = `${post.title || 'Post'} – Hyggshi OS`;

    const htmlContent = typeof marked !== 'undefined' ? marked.parse(post.content) : post.content;

    container.innerHTML = `
      <header class="post-header">
        <div class="news-meta">
          <span>${escapeHtml(post.category || 'News')}</span>
          <time datetime="${escapeHtml(post.date || '')}">${escapeHtml(
            formatPostDate(post.date)
          )}</time>
        </div>
        <h1>${escapeHtml(post.title || post.slug)}</h1>
        ${post.excerpt ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>` : ''}
      </header>
      ${
        image
          ? `<img class="post-cover" src="${escapeHtml(
              image
            )}" alt="${escapeHtml(post.title || '')}" loading="eager">`
          : ''
      }
      <div class="markdown-body">${htmlContent}</div>
    `;

  } catch {
    document.title = 'Post not found – Hyggshi OS';
    container.innerHTML = `
      <h1>Article not found</h1>
      <p>The article you are looking for does not exist or the link is invalid.</p>
      <a class="btn btn-primary" href="news.html">Back to News</a>
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPost);
} else {
  initPost();
}
