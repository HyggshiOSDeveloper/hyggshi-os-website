const colors = ['#5227ff', '#7cff67', '#5227ff'].map(parseHex);
const amplitude = 1;
const blend = 0.5;
const auroraHeight = 0.45;
const speed = 1;
const glow = 0.6;
const brightness = 1;
const opacity = 1;
const FRAME_INTERVAL = 1000 / 30;

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function colorAt(position: number): [number, number, number] {
  const scaled = clamp(position) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const amount = scaled - index;
  return colors[index].map((channel, part) => Math.round(channel + (colors[index + 1][part] - channel) * amount)) as [number, number, number];
}

function mountAurora(container: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) return () => undefined;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0.5, y: 0.4, targetX: 0.5, targetY: 0.4 };
  let reducedMotion = motionQuery.matches;
  let inView = true;
  let disposed = false;
  let raf = 0;
  let timer = 0;
  let elapsed = 0;
  let previousTime = 0;
  let intro = reducedMotion ? 1 : 0;
  let stageWidth = 1;
  let stageHeight = 1;
  let image: ImageData | null = null;

  const render = () => {
    const width = canvas.width;
    const height = canvas.height;
    if (!image) image = context.createImageData(width, height);
    const data = image.data;
    const mousePull = Math.hypot(pointer.x - 0.5, pointer.y - 0.4);
    const time = elapsed * speed;

    for (let y = 0; y < height; y += 1) {
      const v = y / Math.max(1, height - 1);
      for (let x = 0; x < width; x += 1) {
        const u = x / Math.max(1, width - 1);
        const waveA = Math.sin(u * 7.4 + time * 0.42) * 0.055;
        const waveB = Math.sin(u * 15.5 - time * 0.28 + pointer.x * 1.7) * 0.025;
        const mouseBend = Math.sin((u - pointer.x) * 4.2) * Math.exp(-Math.abs(u - pointer.x) * 2.5) * mousePull * 0.06;
        const front = auroraHeight * 0.68 + (waveA + waveB + mouseBend) * amplitude;
        const fade = 1 - smoothstep(front, front + 0.2 + blend * 0.12, v);
        const veil = Math.exp(-Math.pow((v - front) / (0.095 + blend * 0.025), 2));
        const verticalShape = clamp(fade * 0.74 + veil * glow * 0.38);
        const colorPosition = clamp(u + waveA * 0.55 + (pointer.x - 0.5) * 0.08);
        const [red, green, blue] = colorAt(colorPosition);
        const shimmer = 0.88 + 0.12 * Math.sin(u * 18 + time * 0.55 + v * 4);
        const alpha = Math.round(255 * verticalShape * intro * opacity * brightness * shimmer);
        const offset = (y * width + x) * 4;

        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
        data[offset + 3] = alpha;
      }
    }

    context.putImageData(image, 0, 0);
  };

  const resize = () => {
    const bounds = container.getBoundingClientRect();
    stageWidth = Math.max(1, bounds.width);
    stageHeight = Math.max(1, bounds.height);
    canvas.width = Math.min(480, Math.max(260, Math.round(stageWidth * 0.36)));
    canvas.height = Math.min(360, Math.max(160, Math.round(stageHeight * 0.26)));
    image = context.createImageData(canvas.width, canvas.height);
    render();
    wake();
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    if (timer) window.clearTimeout(timer);
    raf = 0;
    timer = 0;
  };

  const schedule = () => {
    if (raf || timer || disposed || !inView || document.hidden || reducedMotion) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!disposed && inView && !document.hidden && !reducedMotion) raf = requestAnimationFrame(frame);
    }, FRAME_INTERVAL);
  };

  const frame = (now: number) => {
    raf = 0;
    if (disposed || !inView || document.hidden || reducedMotion) return;
    const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : FRAME_INTERVAL / 1000;
    previousTime = now;
    elapsed += dt;
    intro = Math.min(1, intro + dt / 1.8);
    pointer.x += (pointer.targetX - pointer.x) * 0.055;
    pointer.y += (pointer.targetY - pointer.y) * 0.055;
    render();
    schedule();
  };

  function wake() {
    if (!raf && !timer && !disposed && inView && !document.hidden && !reducedMotion) {
      raf = requestAnimationFrame(frame);
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const bounds = container.getBoundingClientRect();
    if (event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    pointer.targetX = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width));
    pointer.targetY = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height));
  };

  const onVisibilityChange = () => {
    previousTime = 0;
    if (document.hidden) stop();
    else wake();
  };

  const onMotionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      intro = 1;
      previousTime = 0;
      stop();
      render();
    } else wake();
  };

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    previousTime = 0;
    if (inView) wake();
    else stop();
  });

  resizeObserver.observe(container);
  intersectionObserver.observe(container);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery.addEventListener('change', onMotionChange);
  resize();
  if (!reducedMotion) wake();

  return () => {
    disposed = true;
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    motionQuery.removeEventListener('change', onMotionChange);
  };
}

const container = document.querySelector<HTMLElement>('[data-projects-aurora]');
if (container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'projects-aurora-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const cleanup = mountAurora(container, canvas);
  window.addEventListener('pagehide', () => cleanup(), { once: true });
}
