const gallery = document.querySelector<HTMLElement>('#editions .editions-grid');

if (gallery) {
  const panels = [...gallery.querySelectorAll<HTMLElement>('.linux-edition-card')];
  const defaultIndex = Math.min(2, panels.length - 1);
  let activeIndex = -1;

  gallery.classList.replace('editions-grid', 'de-accordion-gallery');
  gallery.setAttribute('aria-label', 'Choose a Hyggshi OS Linux desktop environment');

  const setActive = (index: number) => {
    activeIndex = index;
    panels.forEach((panel, panelIndex) => {
      const active = panelIndex === activeIndex;
      panel.dataset.active = String(active);
      panel.setAttribute('aria-current', active ? 'true' : 'false');
      const caption = panel.querySelector<HTMLElement>('.de-gallery-caption');
      if (caption) {
        caption.inert = !active;
        caption.setAttribute('aria-hidden', String(!active));
      }
    });
  };

  panels.forEach((panel, index) => {
    const frame = panel.querySelector<HTMLElement>('.window-frame');
    const caption = panel.querySelector<HTMLElement>('.edition-card-body');
    const image = panel.querySelector<HTMLImageElement>('.window-frame img');

    panel.classList.add('de-accordion-panel');
    panel.tabIndex = 0;
    panel.setAttribute('aria-label', panel.querySelector('.edition-card-title')?.textContent?.trim() ?? `Desktop environment ${index + 1}`);
    panel.setAttribute('aria-current', 'false');

    if (frame) {
      frame.classList.add('de-gallery-media');
      frame.removeAttribute('onclick');
      frame.querySelector('.window-bar')?.remove();
      frame.querySelector('.zoom-hint')?.remove();
    }

    if (caption) caption.classList.add('de-gallery-caption');
    if (image) {
      image.draggable = false;
      image.loading = 'eager';
    }

    panel.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') setActive(index);
    });

    panel.addEventListener('focus', () => setActive(index));
    panel.addEventListener('click', () => setActive(index));

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        panels[(index + 1) % panels.length].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        panels[(index - 1 + panels.length) % panels.length].focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActive(index);
      }
    });

    panel.addEventListener('pointermove', (event) => {
      if (index !== activeIndex || event.pointerType !== 'mouse') return;
      const bounds = panel.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      panel.style.setProperty('--de-tilt', `${x * -8}deg`);
      panel.style.setProperty('--de-image-x', `${x * -14}px`);
      panel.style.setProperty('--de-image-y', `${y * -10}px`);
    });

    panel.addEventListener('pointerleave', () => {
      panel.style.setProperty('--de-tilt', '0deg');
      panel.style.setProperty('--de-image-x', '0px');
      panel.style.setProperty('--de-image-y', '0px');
    });
  });

  setActive(defaultIndex);
}
