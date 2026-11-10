import type { ToastType } from './types';

// Enhanced TypeScript with modern features
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  addSmoothScrolling();
  addScrollAnimations();
  addMobileMenu();
  enableRemakeMode();
});

export function initApp(): void {
  console.log('🚀 Modern Web Interface initialized!');

  // Add loading animation
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.5s ease-in';
    document.body.style.opacity = '1';
  }, 100);

  setupGlobalThemeToggle();
}

export function displayMessage(event?: MouseEvent): void {
  showToast('🎉 Welcome to the Hyggshi-OS-project-center', 'success');

  const button = event ? (event.target as HTMLElement | null) : null;
  if (button) {
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 150);
  }
}

export function showFeatures(): void {
  const featuresSection = document.querySelector('.features');
  if (featuresSection) {
    featuresSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  showToast('✨ Discover our amazing features below!', 'info');
}

export function addSmoothScrolling(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-link');

  navLinks.forEach((link) => {
    link.addEventListener('click', function (e: MouseEvent) {
      const href = this.getAttribute('href');
      if (!href) return;

      if (href.includes('.html') || href.startsWith('http')) {
        return;
      }

      e.preventDefault();

      const targetId = href.substring(1);
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        targetSection.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }

      navLinks.forEach((l) => l.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

export function addScrollAnimations(): void {
  const observerOptions: IntersectionObserverInit = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target as HTMLElement;
        target.style.opacity = '1';
        target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  const featureCards = document.querySelectorAll<HTMLElement>('.feature-card');
  featureCards.forEach((card) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
  });
}

export function addMobileMenu(): void {
  try {
    const nav = document.querySelector<HTMLElement>('.nav');
    if (!nav) return;

    if (document.querySelector('.mobile-menu-btn')) return;

    const mobileMenuBtn = document.createElement('button');
    mobileMenuBtn.className = 'mobile-menu-btn';
    mobileMenuBtn.innerHTML = '☰';
    mobileMenuBtn.style.display = 'none';

    if (!document.querySelector('#mobile-menu-styles')) {
      const style = document.createElement('style');
      style.id = 'mobile-menu-styles';
      style.textContent = `
        .mobile-menu-btn {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 8px;
          transition: all 0.3s ease;
        }
        
        .mobile-menu-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block !important;
          }
          
          .nav-menu {
            position: fixed;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(20px);
            flex-direction: column;
            padding: 2rem;
            transform: translateY(-100%);
            transition: transform 0.3s ease;
            z-index: 99;
          }
          
          .nav-menu.active {
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }

    nav.appendChild(mobileMenuBtn);

    mobileMenuBtn.addEventListener('click', function () {
      const navMenu = document.querySelector<HTMLElement>('.nav-menu');
      if (navMenu) {
        navMenu.classList.toggle('active');
        this.innerHTML = navMenu.classList.contains('active') ? '✕' : '☰';
      }
    });
  } catch {
    // Ignore errors
  }
}

export function setupGlobalThemeToggle(): void {
  try {
    const body = document.body;
    const nav =
      document.querySelector<HTMLElement>('.nav') ||
      document.querySelector<HTMLElement>('.nav-container') ||
      document.querySelector<HTMLElement>('.navbar');
    if (!nav) return;

    let toggle = document.getElementById('global-theme-toggle') as HTMLButtonElement | null;
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'global-theme-toggle';
      toggle.className = 'theme-toggle';
      toggle.title = 'Toggle light / dark';
      const menu = nav.querySelector<HTMLElement>('.nav-menu, .nav-links');
      (menu || nav).appendChild(toggle);
    }

    const applyThemeFromStorage = (): void => {
      const saved = localStorage.getItem('hyggshi_theme');
      const prefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'light') {
        body.classList.add('light-mode');
        if (toggle) toggle.textContent = '☀️';
      } else if (saved === 'dark') {
        body.classList.remove('light-mode');
        if (toggle) toggle.textContent = '🌙';
      } else {
        if (prefersDark) {
          body.classList.remove('light-mode');
          if (toggle) toggle.textContent = '🌙';
        } else {
          body.classList.add('light-mode');
          if (toggle) toggle.textContent = '☀️';
        }
      }
    };

    applyThemeFromStorage();

    toggle.addEventListener('click', () => {
      const isLight = body.classList.toggle('light-mode');
      localStorage.setItem('hyggshi_theme', isLight ? 'light' : 'dark');
      if (toggle) toggle.textContent = isLight ? '☀️' : '🌙';
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('hyggshi_theme')) {
          if (e.matches) {
            body.classList.remove('light-mode');
            if (toggle) toggle.textContent = '🌙';
          } else {
            body.classList.add('light-mode');
            if (toggle) toggle.textContent = '☀️';
          }
        }
      });
    }
  } catch {
    // no-op
  }
}

export function showToast(message: string, type: ToastType = 'info'): void {
  const existingToasts = document.querySelectorAll('.toast');
  existingToasts.forEach((toast) => toast.remove());

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-message">${message}</span>
      <button class="toast-close" type="button">✕</button>
    </div>
  `;

  if (!document.querySelector('#toast-styles')) {
    const toastStyles = document.createElement('style');
    toastStyles.id = 'toast-styles';
    toastStyles.textContent = `
      .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 1rem 1.5rem;
        color: #333;
        font-weight: 500;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
      }
      .toast.show {
        transform: translateX(0);
      }
      .toast-content {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .toast-close {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.3s ease;
      }
      .toast-close:hover {
        background: rgba(0, 0, 0, 0.1);
        color: #333;
      }
      .toast-success { border-left: 4px solid #4CAF50; }
      .toast-info { border-left: 4px solid #2196F3; }
      .toast-warning { border-left: 4px solid #FF9800; }
      .toast-error { border-left: 4px solid #F44336; }
    `;
    document.head.appendChild(toastStyles);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  const timer = setTimeout(() => {
    hideToast(toast);
  }, 5000);

  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      clearTimeout(timer);
      hideToast(toast);
    });
  }
}

export function hideToast(toast: HTMLElement): void {
  toast.classList.remove('show');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const hero = document.querySelector<HTMLElement>('.hero');
  const floatingCard = document.querySelector<HTMLElement>('.floating-card');

  if (hero && floatingCard) {
    const rate = scrolled * -0.5;
    floatingCard.style.transform = `translateY(${rate}px)`;
  }
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const navMenu = document.querySelector<HTMLElement>('.nav-menu');
    if (navMenu && navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
      const mobileBtn = document.querySelector<HTMLElement>('.mobile-menu-btn');
      if (mobileBtn) mobileBtn.innerHTML = '☰';
    }
  }
});

export function enableRemakeMode(): void {
  try {
    const url = new URL(window.location.href);
    const queryWantsRemake = url.searchParams.get('remake') === '1';
    const hashWantsRemake = (url.hash || '').toLowerCase().includes('remake');

    if (!(queryWantsRemake || hashWantsRemake)) {
      const persisted = localStorage.getItem('hyggshi_remake') === '1';
      if (!persisted) return;
    }

    document.body.classList.add('remake');
    localStorage.setItem('hyggshi_remake', '1');

    if (!document.querySelector('.remake-badge')) {
      const badge = document.createElement('div');
      badge.className = 'remake-badge';
      badge.textContent = 'Remake Preview ON';
      document.body.appendChild(badge);
    }

    const navMenu = document.querySelector<HTMLElement>('.nav-menu');
    if (navMenu && !navMenu.querySelector('.remake-toggle')) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'nav-link remake-toggle';
      a.textContent = 'Remake: ON';
      a.title = 'Toggle Remake theme';
      a.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        const isOn = document.body.classList.toggle('remake');
        localStorage.setItem('hyggshi_remake', isOn ? '1' : '0');
        a.textContent = isOn ? 'Remake: ON' : 'Remake: OFF';
        const badge = document.querySelector('.remake-badge');
        if (isOn) {
          if (!badge) {
            const b = document.createElement('div');
            b.className = 'remake-badge';
            b.textContent = 'Remake Preview ON';
            document.body.appendChild(b);
          }
        } else if (badge) {
          badge.remove();
        }
      });
      li.appendChild(a);
      navMenu.appendChild(li);
    }
  } catch {
    // no-op
  }
}

// Attach utilities to window for any inline handlers
declare global {
  interface Window {
    displayMessage?: typeof displayMessage;
    showFeatures?: typeof showFeatures;
    showToast?: typeof showToast;
  }
}
window.displayMessage = displayMessage;
window.showFeatures = showFeatures;
window.showToast = showToast;
