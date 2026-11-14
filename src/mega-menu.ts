/**
 * Hyggshi OS - Navigation Mega Menu Component
 * Inspired by Google Antigravity navigation system.
 */

export function initMegaMenu(): void {
  const header = document.querySelector<HTMLElement>('.flat-header');
  const dropdowns = document.querySelectorAll<HTMLElement>('.flat-nav-dropdown');

  if (!dropdowns.length) return;

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector<HTMLButtonElement>('.flat-nav-dropdown-toggle');
    const menu = dropdown.querySelector<HTMLElement>('.flat-mega-menu');

    if (!toggle || !menu) return;

    let closeTimeout: number | undefined;

    const openMenu = () => {
      if (closeTimeout) {
        window.clearTimeout(closeTimeout);
        closeTimeout = undefined;
      }
      dropdown.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      header?.classList.add('has-mega-menu-open');
    };

    const closeMenu = (immediate = false) => {
      if (immediate) {
        if (closeTimeout) {
          window.clearTimeout(closeTimeout);
          closeTimeout = undefined;
        }
        dropdown.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        header?.classList.remove('has-mega-menu-open');
        return;
      }

      closeTimeout = window.setTimeout(() => {
        dropdown.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        header?.classList.remove('has-mega-menu-open');
      }, 150);
    };

    // Toggle on click (for mobile and mouse interaction)
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('is-open');
      if (isOpen) {
        closeMenu(true);
      } else {
        // Close other dropdowns first
        dropdowns.forEach((d) => {
          if (d !== dropdown) {
            d.classList.remove('is-open');
            d.querySelector('.flat-nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
          }
        });
        openMenu();
      }
    });

    // Hover interactions with debounce
    dropdown.addEventListener('mouseenter', () => {
      openMenu();
    });

    dropdown.addEventListener('mouseleave', () => {
      closeMenu(false);
    });

    // Keyboard accessibility
    dropdown.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu(true);
        toggle.focus();
      }
    });
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    dropdowns.forEach((dropdown) => {
      if (!dropdown.contains(target)) {
        dropdown.classList.remove('is-open');
        dropdown.querySelector('.flat-nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        header?.classList.remove('has-mega-menu-open');
      }
    });
  });
}

// Auto initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMegaMenu);
} else {
  initMegaMenu();
}
