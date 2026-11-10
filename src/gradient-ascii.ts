// Original Hyggshi OS canvas effect; built independently without importing React Bits code.
type ClickWave = { x: number; y: number; age: number };

const palette = ['#2f49e8', '#f5f7ff', '#a5d8ff', '#37b8ff'];
const glyphs = [...' =+xX0S8#@'];
const cellSize = 18;
const density = 0.8;
const horizonHeight = 0.45;
const horizonReferenceHeight = 600;
const glyphOpacity = 0.85;
const gradientOpacity = 0.9;
const flicker = 0.2;
const speed = 1;
const introEnabled = true;
const mouseInteraction = true;
const scrambleRadius = 0.1;
const clickWaveEnabled = true;
const FRAME_INTERVAL_MS = 1000 / 30;
const INTRO_DURATION = 2.4;
const WAVE_DURATION = 0.9;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function parseHex(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
  const value = Number.parseInt(expanded, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const rgbPalette = palette.map(parseHex);

function samplePalette(amount: number): string {
  const position = clamp(amount) * (rgbPalette.length - 1);
  const index = Math.min(rgbPalette.length - 2, Math.floor(position));
  const mix = position - index;
  const left = rgbPalette[index];
  const right = rgbPalette[index + 1];
  const channel = (part: number) => Math.round(left[part] + (right[part] - left[part]) * mix);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function paletteColor(index: number, alpha: number): string {
  const [red, green, blue] = rgbPalette[index];
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hash(x: number, y: number, frame: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + frame * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function mountGradientASCII(container: HTMLElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) return () => undefined;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const waves: ClickWave[] = [];
  const pointer = { x: 0, y: 0, inside: false };
  const size = { width: 1, height: 1, ratio: 1 };
  let reducedMotion = motionQuery.matches;
  let inView = true;
  let disposed = false;
  let raf = 0;
  let frameTimer = 0;
  let previousTime = 0;
  let elapsed = 0;
  let introProgress = reducedMotion || !introEnabled ? 1 : 0;

  const render = () => {
    const { width, height } = size;
    const cellWidth = cellSize * 0.62;
    const cellHeight = cellSize * 1.12;
    const columns = Math.ceil(width / cellWidth);
    const rows = Math.ceil(height / cellHeight);
    const offsetX = (width - columns * cellWidth) / 2;
    const offsetY = (height - rows * cellHeight) / 2;
    const aspect = width / Math.max(1, height);
    const frame = Math.floor(elapsed * 9);
    const phase = elapsed * speed;
    const fadeStart = horizonReferenceHeight * horizonHeight;
    const fadeEnd = horizonReferenceHeight;

    context.clearRect(0, 0, width, height);
    const fourColorWash = context.createLinearGradient(0, 0, width, 0);
    fourColorWash.addColorStop(0, paletteColor(0, 0.24));
    fourColorWash.addColorStop(0.34, paletteColor(1, 0.18));
    fourColorWash.addColorStop(0.68, paletteColor(2, 0.2));
    fourColorWash.addColorStop(1, paletteColor(3, 0.23));
    context.globalAlpha = gradientOpacity;
    context.fillStyle = fourColorWash;
    context.fillRect(0, 0, width, height);

    const verticalFade = context.createLinearGradient(0, 0, 0, Math.min(height, fadeEnd));
    verticalFade.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    verticalFade.addColorStop(0.22, 'rgba(255, 255, 255, 0.82)');
    verticalFade.addColorStop(0.5, 'rgba(255, 255, 255, 0.54)');
    verticalFade.addColorStop(0.8, 'rgba(255, 255, 255, 0.12)');
    verticalFade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.globalCompositeOperation = 'destination-in';
    context.globalAlpha = 1;
    context.fillStyle = verticalFade;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${Math.round(cellHeight * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

    for (let row = 0; row < rows; row += 1) {
      const y = (row + 0.5) / rows;
      for (let column = 0; column < columns; column += 1) {
        const x = (column + 0.5) / columns;
        const jitter = hash(column, row, Math.floor(frame * flicker));
        const bend = Math.pow((x - 0.5) * 2, 2) * 120;
        const horizonY = fadeStart + 90 + bend + Math.sin(phase * 0.28) * 8;
        const horizon = horizonY / height;
        const distanceToHorizon = y - horizon;
        const ridge = Math.exp(-(distanceToHorizon * distanceToHorizon) * 24);
        const glowX = (x - (0.5 + Math.sin(phase * 0.17) * 0.035)) * 1.65;
        const glowY = (y * height - (fadeStart + 120)) / 260;
        const ambient = Math.exp(-(glowX * glowX + glowY * glowY) * 1.35);
        const horizonFade = 1 - smoothstep(fadeStart, fadeEnd, y * height);
        const skyLight = 1 - smoothstep(-0.38, 0.24, distanceToHorizon);
        let energy = clamp(0.08 + skyLight * 0.24 + ridge * 0.42 + ambient * 0.3 + Math.max(0, distanceToHorizon) * 0.12);
        let scramble = 0;

        if (mouseInteraction && pointer.inside && !reducedMotion) {
          const distance = Math.hypot((x - pointer.x) * aspect, y - pointer.y);
          scramble = 1 - smoothstep(scrambleRadius * 0.2, scrambleRadius, distance);
          energy = clamp(energy + scramble * 0.22);
        }

        for (const wave of waves) {
          const distance = Math.hypot((x - wave.x) * aspect, y - wave.y);
          const ring = Math.abs(distance - wave.age * 0.72);
          energy = clamp(energy + Math.exp(-ring * 36) * (1 - wave.age / WAVE_DURATION) * 0.42);
        }

        const visibility = introEnabled ? smoothstep(0, 1, introProgress * 1.35 - x * 0.22 - y * 0.08) : 1;
        if (visibility <= 0.01 || jitter > density * horizonFade) continue;

        const glyphIndex = scramble > 0.15
          ? Math.floor(Math.random() * glyphs.length)
          : Math.min(glyphs.length - 1, Math.floor(Math.sqrt(energy) * (glyphs.length - 1) + jitter * 0.75));
        const alpha = clamp((0.34 + energy * 0.7 + scramble * 0.12) * glyphOpacity * gradientOpacity * visibility * horizonFade);
        context.globalAlpha = alpha;
        const paletteTone = clamp(energy * 1.35 - 0.2 + (jitter - 0.5) * 0.18);
        context.fillStyle = samplePalette(paletteTone);
        context.fillText(glyphs[glyphIndex], offsetX + (column + 0.5) * cellWidth, offsetY + (row + 0.5) * cellHeight);
      }
    }

    context.globalAlpha = 1;
  };

  const resize = () => {
    size.width = Math.max(1, container.clientWidth);
    size.height = Math.max(1, container.clientHeight);
    size.ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(size.width * size.ratio);
    canvas.height = Math.round(size.height * size.ratio);
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    render();
    wake();
  };

  const stopFrames = () => {
    if (raf) cancelAnimationFrame(raf);
    if (frameTimer) window.clearTimeout(frameTimer);
    raf = 0;
    frameTimer = 0;
  };

  const scheduleFrame = () => {
    if (raf || frameTimer || disposed || !inView || document.hidden) return;
    frameTimer = window.setTimeout(() => {
      frameTimer = 0;
      if (!disposed && inView && !document.hidden) raf = requestAnimationFrame(frame);
    }, FRAME_INTERVAL_MS);
  };

  const frame = (now: number) => {
    raf = 0;
    if (disposed || !inView || document.hidden) return;
    const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : FRAME_INTERVAL_MS / 1000;
    previousTime = now;

    if (!reducedMotion) elapsed += dt;
    if (introProgress < 1) introProgress = Math.min(1, introProgress + dt / INTRO_DURATION);
    waves.forEach((wave) => { wave.age += dt; });
    while (waves.length && waves[0].age >= WAVE_DURATION) waves.shift();
    render();

    if (!reducedMotion || introProgress < 1 || waves.length > 0) scheduleFrame();
    else previousTime = 0;
  };

  function wake() {
    if (!raf && !frameTimer && !disposed && inView && !document.hidden) {
      raf = requestAnimationFrame(frame);
    }
  }

  const locatePointer = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    pointer.x = clamp((event.clientX - rect.left) / Math.max(1, rect.width));
    pointer.y = clamp((event.clientY - rect.top) / Math.max(1, rect.height));
    pointer.inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };

  const onPointerMove = (event: PointerEvent) => {
    locatePointer(event);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (reducedMotion || !clickWaveEnabled) return;
    locatePointer(event);
    if (!pointer.inside) return;
    waves.unshift({ x: pointer.x, y: pointer.y, age: 0 });
    waves.length = Math.min(waves.length, 3);
    wake();
  };

  const onVisibilityChange = () => {
    previousTime = 0;
    if (document.hidden) stopFrames();
    else wake();
  };

  const onMotionPreferenceChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      introProgress = 1;
      waves.length = 0;
    }
    previousTime = 0;
    wake();
  };

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    previousTime = 0;
    if (inView) wake();
    else stopFrames();
  });

  resizeObserver.observe(container);
  intersectionObserver.observe(container);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery.addEventListener('change', onMotionPreferenceChange);
  resize();
  wake();

  return () => {
    disposed = true;
    stopFrames();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    motionQuery.removeEventListener('change', onMotionPreferenceChange);
  };
}

const container = document.querySelector<HTMLElement>('[data-gradient-ascii]');
if (container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gradient-ascii-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const cleanup = mountGradientASCII(container, canvas);
  window.addEventListener('pagehide', () => cleanup?.(), { once: true });
}
