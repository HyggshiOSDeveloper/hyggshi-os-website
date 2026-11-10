import { formatPostDate, loadPosts } from '../news';

const container = document.getElementById('news-list');
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

async function initNews(): Promise<void> {
  if (!container) return;
  try {
    const posts = await loadPosts();
    container.innerHTML = posts.length
      ? posts
          .map(
            (post) => `
        <article class="news-item">
          ${
            post.cover
              ? `<a class="news-item-cover" href="post.html?slug=${encodeURIComponent(
                  post.slug
                )}"><img src="${escapeHtml(post.cover)}" alt="" loading="lazy"></a>`
              : ''
          }
          <div class="news-item-body">
            <div class="news-meta">
              <span>${escapeHtml(post.category || 'News')}</span>
              <time datetime="${escapeHtml(post.date || '')}">${escapeHtml(
                formatPostDate(post.date)
              )}</time>
            </div>
            <h2><a href="post.html?slug=${encodeURIComponent(
              post.slug
            )}">${escapeHtml(post.title || post.slug)}</a></h2>
            <p>${escapeHtml(post.excerpt || '')}</p>
            <a class="news-read-more" href="post.html?slug=${encodeURIComponent(
              post.slug
            )}">Read more <span aria-hidden="true">→</span></a>
          </div>
        </article>
      `
          )
          .join('')
      : '<p class="news-status">No articles available.</p>';
  } catch {
    container.innerHTML =
      '<p class="news-status">The article cannot be loaded at this time. Please try again later.</p>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNews);
} else {
  initNews();
}
