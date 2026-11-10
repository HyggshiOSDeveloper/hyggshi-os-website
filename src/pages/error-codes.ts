import { getAllErrors } from '../data/errors';
import type { ErrorCategory, ErrorSeverity } from '../types/error';

let currentCategory: string = 'all';
let searchQuery: string = '';

const allErrors = getAllErrors();

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

function getSeverityBadgeStyle(severity: ErrorSeverity): { bg: string; color: string; border: string } {
  switch (severity) {
    case 'critical':
      return {
        bg: 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
        border: 'rgba(239, 68, 68, 0.3)'
      };
    case 'error':
      return {
        bg: 'rgba(244, 63, 94, 0.1)',
        color: '#f43f5e',
        border: 'rgba(244, 63, 94, 0.3)'
      };
    case 'warning':
      return {
        bg: 'rgba(245, 158, 11, 0.1)',
        color: '#f59e0b',
        border: 'rgba(245, 158, 11, 0.3)'
      };
    case 'info':
    default:
      return {
        bg: 'rgba(59, 130, 246, 0.1)',
        color: '#3b82f6',
        border: 'rgba(59, 130, 246, 0.3)'
      };
  }
}

function getCategoryLabel(category: ErrorCategory): string {
  switch (category) {
    case 'http':
      return 'HTTP / Web';
    case 'os':
    case 'system':
      return 'Operating System';
    case 'network':
      return 'Network & API';
    case 'runtime':
      return 'Runtime / IDE';
    default:
      return category;
  }
}

function renderErrorList(): void {
  const grid = document.getElementById('errorGrid');
  const countBadge = document.getElementById('errorCountBadge');
  if (!grid) return;

  const q = searchQuery.trim().toLowerCase();

  const filtered = allErrors.filter((item) => {
    // Category check
    if (currentCategory !== 'all' && item.category !== currentCategory) {
      return false;
    }

    // Query check
    if (!q) return true;

    const haystack = [
      item.code,
      item.title,
      item.titleEn,
      item.subtitle,
      item.description,
      ...item.causes,
      ...item.solutions,
      ...item.tags
    ].join(' ').toLowerCase();

    return haystack.includes(q);
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} / ${allErrors.length} error codes`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-3xl) var(--space-md); background: var(--c-surface); border: 1px dashed var(--c-border); border-radius: var(--radius-xl);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; color: var(--c-text-muted); margin-bottom: var(--space-md);">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3 style="font-size: var(--text-lg); margin-bottom: 8px;">No matching error codes found</h3>
        <p style="color: var(--c-text-muted); font-size: var(--text-sm); max-width: 420px; margin: 0 auto var(--space-lg) auto;">
          No error records matched the query "<strong>${escapeHtml(searchQuery)}</strong>". You can try different keywords or inspect this code directly in the error simulator.
        </p>
        <a href="404.html?code=${encodeURIComponent(searchQuery)}" class="btn btn-primary btn-small">
          Inspect "${escapeHtml(searchQuery)}" in Simulator
        </a>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((item) => {
      const style = getSeverityBadgeStyle(item.severity);
      return `
        <article class="feature-card error-item" data-code="${escapeHtml(item.code)}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-md); gap: 8px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span class="news-badge" style="border-color: ${style.border}; color: ${style.color}; background: ${style.bg}; font-family: var(--font-mono); font-weight: 700;">
                ${escapeHtml(item.code)}
              </span>
              <span class="news-badge" style="font-size: 11px; opacity: 0.85;">
                ${escapeHtml(getCategoryLabel(item.category))}
              </span>
            </div>

            <button type="button" class="btn-copy-code" data-code="${escapeHtml(item.code)}" title="Copy Error Code" style="background: none; border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 4px 8px; color: var(--c-text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 11px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>

          <h3 style="font-size: var(--text-lg); margin-bottom: 4px; color: var(--c-text);">
            ${escapeHtml(item.title)}
          </h3>
          <p style="color: var(--c-text-muted); margin-bottom: var(--space-md); font-size: var(--text-xs); font-family: var(--font-mono);">
            ${escapeHtml(item.subtitle)}
          </p>

          <p style="color: var(--c-text-secondary); font-size: var(--text-sm); line-height: 1.5; margin-bottom: var(--space-md);">
            ${escapeHtml(item.description)}
          </p>

          <div class="error-notice" style="margin-bottom: var(--space-md);">
            <p style="font-size: var(--text-xs); margin-bottom: 6px;">
              <strong>Root Cause:</strong> ${escapeHtml(item.causes[0] || 'Unknown')}
            </p>
            <p style="font-size: var(--text-xs); color: var(--c-primary-light);">
              <strong>Resolution:</strong> ${escapeHtml(item.solutions[0] || 'Consult system administrator')}
            </p>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--c-border); padding-top: var(--space-sm); margin-top: auto;">
            <span style="font-size: 11px; color: var(--c-text-muted); text-transform: uppercase;">
              Severity: <strong style="color: ${style.color}">${item.severity}</strong>
            </span>
            <a href="404.html?code=${encodeURIComponent(item.code)}" class="btn btn-secondary btn-small" style="font-size: 12px; padding: 4px 10px;">
              <span>Simulate</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </a>
          </div>
        </article>
      `;
    })
    .join('');
}

function showToast(message: string): void {
  let toast = document.getElementById('error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'error-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; color: var(--c-success);">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  toast.classList.add('show');

  setTimeout(() => {
    toast?.classList.remove('show');
  }, 2500);
}

export function initErrorCodesPage(): void {
  const searchInput = document.getElementById('errorSearch') as HTMLInputElement | null;
  const categoryContainer = document.getElementById('categoryFilters');
  const grid = document.getElementById('errorGrid');

  // Bind Search Input
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderErrorList();
    });
  }

  // Bind Category Filters
  if (categoryContainer) {
    categoryContainer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.category-tab-btn') as HTMLButtonElement | null;
      if (!btn) return;

      const cat = btn.getAttribute('data-cat') || 'all';
      currentCategory = cat;

      categoryContainer.querySelectorAll('.category-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      renderErrorList();
    });
  }

  // Bind copy button on items
  if (grid) {
    grid.addEventListener('click', async (e) => {
      const copyBtn = (e.target as HTMLElement).closest('.btn-copy-code') as HTMLButtonElement | null;
      if (!copyBtn) return;

      const code = copyBtn.getAttribute('data-code');
      if (code) {
        try {
          await navigator.clipboard.writeText(code);
          showToast(`Copied code "${code}" to clipboard!`);
        } catch {
          showToast(`Error code: ${code}`);
        }
      }
    });
  }

  // Initial render
  renderErrorList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initErrorCodesPage);
} else {
  initErrorCodesPage();
}
