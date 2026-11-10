import { findError } from '../data/errors';
import type { ErrorSeverity } from '../types/error';

/**
 * Detect the original URL the user tried to access.
 * On static hosting (like GitHub Pages, Netlify, Cloudflare),
 * when a page is not found, the server delivers 404.html while
 * keeping the original requested pathname in the browser location.
 */
function getOriginalRequestedPath(): string {
  const path = window.location.pathname.replace(/^\//, '');

  if (path === '404.html' || path === '404') {
    return '';
  }

  return path || '';
}

function isActual404(): boolean {
  const path = window.location.pathname.replace(/^\//, '');
  return path !== '404.html' && path !== '404' && path !== '';
}

function escapeHtml(value = ''): string {
  return String(value).replace(
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
}

function getSeverityBadgeStyle(severity: ErrorSeverity): { bg: string; color: string; border: string; dot: string } {
  switch (severity) {
    case 'critical':
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        color: '#ef4444',
        border: 'rgba(239, 68, 68, 0.35)',
        dot: '#ef4444',
      };
    case 'error':
      return {
        bg: 'rgba(244, 63, 94, 0.12)',
        color: '#f43f5e',
        border: 'rgba(244, 63, 94, 0.35)',
        dot: '#f43f5e',
      };
    case 'warning':
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#f59e0b',
        border: 'rgba(245, 158, 11, 0.35)',
        dot: '#f59e0b',
      };
    case 'info':
    default:
      return {
        bg: 'rgba(59, 130, 246, 0.12)',
        color: '#3b82f6',
        border: 'rgba(59, 130, 246, 0.35)',
        dot: '#3b82f6',
      };
  }
}

export function renderError(code: string, updateUrl = false): void {
  const error = findError(code);
  const style = getSeverityBadgeStyle(error.severity);

  // Update Page Title
  document.title = `${error.code} - ${error.title} | Hyggshi OS`;

  // Update URL if requested
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (error.code === '404') {
      url.searchParams.delete('code');
    } else {
      url.searchParams.set('code', error.code);
    }
    window.history.pushState({ code: error.code }, '', url.toString());
  }

  // Large Error Code Display
  const codeEl = document.getElementById('error-display-code');
  if (codeEl) {
    codeEl.textContent = error.code;
    codeEl.style.textShadow = `0 0 35px ${style.border}`;
  }

  // Address Bar URL text in mock browser
  const addressUrl = document.getElementById('mock-browser-url');
  if (addressUrl) {
    const originalPath = getOriginalRequestedPath();
    addressUrl.textContent = `hyggshi://${originalPath || 'system'} [HTTP/${error.code}]`;
  }

  // Show the exact URL that was not found
  const requestedUrlEl = document.getElementById('error-requested-url');
  if (requestedUrlEl) {
    const originalPath = getOriginalRequestedPath();
    if (originalPath && originalPath !== '404.html' && error.code === '404') {
      requestedUrlEl.style.display = 'block';
      requestedUrlEl.innerHTML = `
        <span style="display: block; font-size: var(--text-xs); color: var(--c-text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
          Requested Path Not Found:
        </span>
        <code style="font-family: var(--font-mono); background: var(--c-bg-secondary); border: 1px solid var(--c-border); padding: 6px 14px; border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--c-error); word-break: break-all;">
          /${escapeHtml(originalPath)}
        </code>
      `;
    } else {
      requestedUrlEl.style.display = 'none';
    }
  }

  // Badge Category & Severity
  const badgeEl = document.getElementById('error-status-badge');
  if (badgeEl) {
    badgeEl.style.backgroundColor = style.bg;
    badgeEl.style.borderColor = style.border;
    badgeEl.style.color = style.color;
    badgeEl.innerHTML = `
      <span class="status-dot" style="background-color: ${style.dot}; box-shadow: 0 0 8px ${style.dot};"></span>
      <span>${escapeHtml(error.subtitle)}</span>
    `;
  }

  // Titles
  const titleEl = document.getElementById('error-title');
  if (titleEl) {
    titleEl.textContent = error.title;
  }

  const titleEnEl = document.getElementById('error-title-en');
  if (titleEnEl) {
    titleEnEl.textContent = error.titleEn;
  }

  const descEl = document.getElementById('error-description');
  if (descEl) {
    descEl.textContent = error.description;
  }

  // Suggested Action Button
  const actionBtn = document.getElementById('error-primary-action') as HTMLAnchorElement | null;
  if (actionBtn) {
    if (error.suggestedAction) {
      actionBtn.textContent = error.suggestedAction.label;
      actionBtn.href = error.suggestedAction.href;
      actionBtn.style.display = 'inline-flex';
    } else {
      actionBtn.textContent = 'Back to Hyggshi OS Home';
      actionBtn.href = 'index.html';
      actionBtn.style.display = 'inline-flex';
    }
  }
}

function setupHistoryAndShortcuts(): void {
  // Listen for back/forward navigation
  window.addEventListener('popstate', (e) => {
    const code = e.state?.code || new URLSearchParams(window.location.search).get('code') || '404';
    renderError(code, false);
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'Escape') {
      window.location.href = 'index.html';
    }
  });

  // Back button
  const backBtn = document.getElementById('error-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'index.html';
      }
    });
  }
}

export function initErrorPage(): void {
  setupHistoryAndShortcuts();

  const queryCode = new URLSearchParams(window.location.search).get('code');
  let initialCode: string;

  if (queryCode) {
    initialCode = queryCode;
  } else if (isActual404()) {
    initialCode = '404';
  } else {
    initialCode = '404';
  }

  renderError(initialCode, false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initErrorPage);
} else {
  initErrorPage();
}
