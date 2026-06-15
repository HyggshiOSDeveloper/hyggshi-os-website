/* ============ WALLPAPER ENGINE ============ */
const wallpaperEnginePresets = {
    nature: {
        label: 'Nature',
        wallpaper: 'Resources/background.png',
        previewClass: 'nature'
    },
    space: {
        label: 'Space',
        wallpaper: 'gradient1',
        previewClass: 'space'
    },
    abstract: {
        label: 'Abstract',
        wallpaper: 'gradient3',
        previewClass: 'abstract'
    },
    ocean: {
        label: 'Ocean',
        wallpaper: 'gradient2',
        previewClass: 'ocean'
    },
};

/* ---- Image URL extensions ---- */
const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif|bmp|svg|tiff?)(\?.*)?$/i;
const VIDEO_EXTS = /\.(mp4|webm|ogg|ogv|mov|mkv|avi|m4v|ts|flv)(\?.*)?$/i;

let wallpaperEngineState = {
    currentPreset: 'nature',
    currentSource: wallpaperEnginePresets.nature.wallpaper,
    currentLabel: wallpaperEnginePresets.nature.label,
    currentKind: 'preset',
    videoSrc: '',
    imageSrc: ''
};

/* ─────────────────────────────────────────────────
   HQ VIDEO HELPERS
───────────────────────────────────────────────── */
/**
 * Apply high-quality rendering attributes to a <video> element.
 * Adds hardware-decode hints, disables pip, sets high buffer.
 */
function wpApplyHQVideo(videoEl, src) {
    if (!videoEl) return;

    // Stop & reset first
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();

    // HQ attributes
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('muted', '');
    videoEl.setAttribute('preload', 'auto');          // buffer eagerly
    videoEl.setAttribute('disablepictureinpicture', '');
    videoEl.setAttribute('disableremoteplayback', '');
    videoEl.style.imageRendering = 'high-quality';    // CSS hint
    videoEl.style.willChange = 'transform';           // GPU layer
    videoEl.defaultMuted = true;

    // Loop flag
    videoEl.loop = localStorage.getItem('webos-wallpaper-loop') !== 'false';

    // Set source via <source> for better MIME sniffing
    // (direct .src assignment works but some browsers buffer less)
    videoEl.innerHTML = '';
    const sourceEl = document.createElement('source');
    sourceEl.src = src;
    // Try to infer type
    if (/\.webm/i.test(src)) sourceEl.type = 'video/webm';
    else if (/\.ogg|\.ogv/i.test(src)) sourceEl.type = 'video/ogg';
    else if (/\.mov/i.test(src)) sourceEl.type = 'video/quicktime';
    else sourceEl.type = 'video/mp4'; // safest default
    videoEl.appendChild(sourceEl);

    // After metadata: try full-res decode
    videoEl.addEventListener('loadedmetadata', () => {
        try { videoEl.requestVideoFrameCallback?.(() => {}); } catch (_) {}
    }, { once: true });

    videoEl.load();
    videoEl.play().catch(() => {});
}

/**
 * Apply HQ video to the desktop <video> element.
 */
function wpApplyHQVideoToDesktop(src) {
    const desktopVideo = document.getElementById('desktop-wallpaper-video');
    if (!desktopVideo) return;
    wpApplyHQVideo(desktopVideo, src);
}

/* ─────────────────────────────────────────────────
   IMAGE URL SUPPORT
───────────────────────────────────────────────── */
/**
 * Detect whether a URL is an image or video, then route accordingly.
 */
function wpDetectAndLoadURL(url) {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;

    // YouTube check first
    if (trimmed.includes('youtube.com/watch?v=') ||
        trimmed.includes('youtu.be/') ||
        trimmed.length === 11) {
        wpLoadVideoFromUrl(trimmed);
        return;
    }

    // Image extension
    if (IMAGE_EXTS.test(trimmed)) {
        wpLoadImageFromUrl(trimmed);
        return;
    }

    // Video extension
    if (VIDEO_EXTS.test(trimmed)) {
        wpLoadVideoFromUrl(trimmed);
        return;
    }

    // Ambiguous — try HEAD request for Content-Type
    fetch(trimmed, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
            // no-cors hides headers; fall back to extension heuristic
            // If still unknown, treat as video (most common wallpaper use-case)
            wpLoadVideoFromUrl(trimmed);
        })
        .catch(() => {
            // Network error or CORS block — try as image first
            wpLoadImageFromUrl(trimmed);
        });
}

/**
 * Load a remote image URL as wallpaper.
 */
function wpLoadImageFromUrl(url) {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;

    // Validate URL
    try { new URL(trimmed); } catch (_) {
        showNotification('Wallpaper Engine', 'Please enter a valid image URL.', 'error');
        return;
    }

    // Show preview overlay before applying
    wpShowUrlImagePreview(trimmed);
}

/**
 * Actually apply an image URL as wallpaper (called after user confirms preview).
 */
function wpApplyImageUrl(url, label) {
    const src = `image-url:${url}`;
    wallpaperEngineState.currentPreset = 'image-url';
    wallpaperEngineState.currentKind = 'image-url';
    wallpaperEngineState.currentLabel = label || 'Remote Image';
    wallpaperEngineState.currentSource = src;
    wallpaperEngineState.videoSrc = '';
    wallpaperEngineState.imageSrc = url;

    setWallpaper(src, false);
    wpUpdateWindowUI();
    showNotification('Wallpaper Engine', 'Remote image applied as wallpaper.');
}

/**
 * Show a preview overlay for a remote image URL.
 */
function wpShowUrlImagePreview(url) {
    const existing = document.querySelector('.wp-url-img-preview-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'wp-url-img-preview-overlay';

    const shortLabel = url.length > 48 ? url.slice(0, 48) + '…' : url;

    overlay.innerHTML = `
        <div class="wp-img-preview-card">
            <div class="wp-img-preview-header">
                <div class="wp-img-preview-title">
                    <span class="material-icons-round">link</span>
                    <span>Image URL Preview</span>
                </div>
                <button class="wp-img-preview-close" title="Close">
                    <span class="material-icons-round" style="font-size:18px">close</span>
                </button>
            </div>
            <div class="wp-img-preview-body" id="wp-url-img-body">
                <div class="wp-url-img-loading">
                    <span class="material-icons-round wp-url-spin">autorenew</span>
                    <span>Loading image…</span>
                </div>
                <img id="wp-url-preview-img" src="${url}" alt="Wallpaper preview"
                     style="display:none; max-width:100%; max-height:100%; object-fit:contain; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            </div>
            <div class="wp-img-preview-url-tag">${shortLabel}</div>
            <div class="wp-img-preview-footer">
                <button class="wp-img-preview-cancel">Cancel</button>
                <button class="wp-img-preview-confirm" disabled>Set as Wallpaper</button>
            </div>
        </div>
    `;

    function close() {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => overlay.remove(), 150);
    }

    overlay.querySelector('.wp-img-preview-close').addEventListener('click', close);
    overlay.querySelector('.wp-img-preview-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const img = overlay.querySelector('#wp-url-preview-img');
    const loadingEl = overlay.querySelector('.wp-url-img-loading');
    const confirmBtn = overlay.querySelector('.wp-img-preview-confirm');

    img.addEventListener('load', () => {
        loadingEl.style.display = 'none';
        img.style.display = '';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    });

    img.addEventListener('error', () => {
        loadingEl.innerHTML = `
            <span class="material-icons-round" style="color:#e17055">broken_image</span>
            <span style="color:#e17055">Could not load image from this URL.</span>
        `;
    });

    confirmBtn.addEventListener('click', () => {
        wpApplyImageUrl(url, 'Remote Image');
        close();
    });

    document.body.appendChild(overlay);
}

/* ─────────────────────────────────────────────────
   INIT & SYNC
───────────────────────────────────────────────── */
function initWallpaperEngine(win) {
    syncWallpaperEngineStateFromSavedWallpaper();
    wpUpdateWindowUI(win);

    const scalingSelect = win?.querySelector('#wp-scaling-mode');
    if (scalingSelect) {
        scalingSelect.value = localStorage.getItem('webos-wallpaper-scaling') || 'cover';
    }

    const loopToggle = win?.querySelector('#wp-loop-toggle');
    if (loopToggle) {
        loopToggle.checked = localStorage.getItem('webos-wallpaper-loop') !== 'false';
    }

    // Sync YouTube interactive toggle
    const ytInteractiveToggle = win?.querySelector('#wp-yt-interactive');
    if (ytInteractiveToggle) {
        ytInteractiveToggle.checked = localStorage.getItem('webos-wallpaper-yt-interactive') === 'true';
    }

    wpUpdateScreenInfo(win);

    const onResize = () => wpUpdateScreenInfo(win);
    window.addEventListener('resize', onResize);

    const wid = win?.closest('.window')?.id;
    if (wid && windows[wid]) {
        const originalDestroy = windows[wid].onDestroy;
        windows[wid].onDestroy = () => {
            window.removeEventListener('resize', onResize);
            if (typeof originalDestroy === 'function') originalDestroy();
        };
    }

    const display = win?.querySelector('#wp-display');
    if (display && display.dataset.bound !== '1') {
        display.dataset.bound = '1';
        display.querySelectorAll('.wp-bg').forEach(layer => {
            layer.addEventListener('click', () => {
                const preset = layer.classList.contains('nature') ? 'nature'
                    : layer.classList.contains('space') ? 'space'
                    : layer.classList.contains('abstract') ? 'abstract'
                    : layer.classList.contains('ocean') ? 'ocean'
                    : 'city';
                wpChange(preset);
            });
        });
    }

    // Wire up the unified URL input Smart Load button
    const smartBtn = win?.querySelector('#wp-smart-load-btn');
    const urlInput = win?.querySelector('#wp-url-input');
    if (smartBtn && urlInput) {
        smartBtn.addEventListener('click', () => wpDetectAndLoadURL(urlInput.value));
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') wpDetectAndLoadURL(urlInput.value);
        });
    }
}

function syncWallpaperEngineStateFromSavedWallpaper() {
    const saved = localStorage.getItem('webos-wallpaper') || sessionStorage.getItem('webos-wallpaper') || '';
    const preset = wpPresetFromSource(saved);
    if (preset) {
        wallpaperEngineState.currentPreset = preset;
        wallpaperEngineState.currentSource = wallpaperEnginePresets[preset].wallpaper;
        wallpaperEngineState.currentLabel = wallpaperEnginePresets[preset].label;
        wallpaperEngineState.currentKind = 'preset';
        wallpaperEngineState.videoSrc = '';
        wallpaperEngineState.imageSrc = '';
        return;
    }

    if (saved.startsWith('image-url:')) {
        const imgUrl = saved.slice(10);
        wallpaperEngineState.currentPreset = 'image-url';
        wallpaperEngineState.currentSource = saved;
        wallpaperEngineState.currentLabel = 'Remote Image';
        wallpaperEngineState.currentKind = 'image-url';
        wallpaperEngineState.videoSrc = '';
        wallpaperEngineState.imageSrc = imgUrl;
        return;
    }

    if (saved.startsWith('video:')) {
        wallpaperEngineState.currentPreset = 'video';
        wallpaperEngineState.currentSource = saved;
        wallpaperEngineState.currentLabel = 'Video';
        wallpaperEngineState.currentKind = 'video';
        wallpaperEngineState.videoSrc = saved.slice(6);
        wallpaperEngineState.imageSrc = '';
        return;
    }

    if (saved.startsWith('youtube:')) {
        wallpaperEngineState.currentPreset = 'youtube';
        wallpaperEngineState.currentSource = saved;
        wallpaperEngineState.currentLabel = 'YouTube Video';
        wallpaperEngineState.currentKind = 'youtube';
        wallpaperEngineState.videoSrc = saved.slice(8);
        wallpaperEngineState.imageSrc = '';
        return;
    }

    // Default
    wallpaperEngineState.currentPreset = 'nature';
    wallpaperEngineState.currentSource = wallpaperEnginePresets.nature.wallpaper;
    wallpaperEngineState.currentLabel = wallpaperEnginePresets.nature.label;
    wallpaperEngineState.currentKind = 'preset';
    wallpaperEngineState.videoSrc = '';
    wallpaperEngineState.imageSrc = '';
}

function wpPresetFromSource(source = '') {
    const normalized = String(source || '');
    for (const [preset, config] of Object.entries(wallpaperEnginePresets)) {
        if (normalized === config.wallpaper) return preset;
    }
    return '';
}

function wpGetWindow() {
    for (const [, w] of Object.entries(windows || {})) {
        if (w.appId === 'wallpaper-engine') return w.el;
    }
    return null;
}

/* ─────────────────────────────────────────────────
   UI UPDATE
───────────────────────────────────────────────── */
function wpUpdateWindowUI(win = wpGetWindow()) {
    if (!win) return;
    const title = win.querySelector('#wp-active-name');
    const previewVideo = win.querySelector('#wp-preview-video');
    const previewYoutube = win.querySelector('#wp-preview-youtube');
    const previewImgUrl = win.querySelector('#wp-preview-img-url');
    const activePreset = wallpaperEngineState.currentKind === 'preset'
        ? wallpaperEngineState.currentPreset : '';

    if (title) title.textContent = wallpaperEngineState.currentLabel;

    win.querySelectorAll('.wp-toolbar button').forEach(button => {
        button.classList.toggle('active', button.dataset.wp === activePreset);
    });

    win.querySelectorAll('.wp-bg').forEach(layer => {
        layer.classList.toggle('active',
            wallpaperEngineState.currentKind === 'preset' &&
            layer.classList.contains(wallpaperEnginePresets[wallpaperEngineState.currentPreset]?.previewClass)
        );
    });

    // --- Video preview ---
    if (previewVideo) {
        if (wallpaperEngineState.currentKind === 'video' && wallpaperEngineState.videoSrc) {
            wpApplyHQVideo(previewVideo, wallpaperEngineState.videoSrc);
            previewVideo.classList.add('active');
        } else {
            previewVideo.pause();
            previewVideo.innerHTML = '';
            previewVideo.removeAttribute('src');
            previewVideo.load();
            previewVideo.classList.remove('active');
        }
    }

    // --- YouTube preview ---
    if (previewYoutube) {
        if (wallpaperEngineState.currentKind === 'youtube' && wallpaperEngineState.videoSrc) {
            const youtubeUrl = `https://www.youtube-nocookie.com/embed/${wallpaperEngineState.videoSrc}?autoplay=1&mute=1&loop=1&playlist=${wallpaperEngineState.videoSrc}&controls=0&modestbranding=1&rel=0&vq=hd1080`;
            if (previewYoutube.src !== youtubeUrl) previewYoutube.src = youtubeUrl;
            previewYoutube.classList.add('active');
        } else {
            previewYoutube.classList.remove('active');
            previewYoutube.removeAttribute('src');
        }
    }

    // --- Image URL preview ---
    if (previewImgUrl) {
        if (wallpaperEngineState.currentKind === 'image-url' && wallpaperEngineState.imageSrc) {
            if (previewImgUrl.src !== wallpaperEngineState.imageSrc) {
                previewImgUrl.src = wallpaperEngineState.imageSrc;
            }
            previewImgUrl.classList.add('active');
        } else {
            previewImgUrl.classList.remove('active');
            previewImgUrl.removeAttribute('src');
        }
    }
}

/* ─────────────────────────────────────────────────
   SAVE / APPLY
───────────────────────────────────────────────── */
function wpSaveWallpaper(source, silent = false) {
    try {
        localStorage.setItem('webos-wallpaper', source);
    } catch (_) {
        try {
            sessionStorage.setItem('webos-wallpaper', source);
        } catch (err) {
            if (!silent) showNotification('Appearance', 'Wallpaper applied, but could not be saved.');
        }
    }
    if (!silent) showNotification('Appearance', 'Wallpaper updated.');
}

function wpChange(preset, silent = false) {
    const config = wallpaperEnginePresets[preset] || wallpaperEnginePresets.nature;
    wallpaperEngineState.currentPreset = preset in wallpaperEnginePresets ? preset : 'nature';
    wallpaperEngineState.currentSource = config.wallpaper;
    wallpaperEngineState.currentLabel = config.label;
    wallpaperEngineState.currentKind = 'preset';
    wallpaperEngineState.videoSrc = '';
    wallpaperEngineState.imageSrc = '';

    setWallpaper(config.wallpaper, silent);
    wpUpdateWindowUI();
}

function wpApplyToDesktop() {
    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();
}

/* ─────────────────────────────────────────────────
   IMAGE UPLOAD
───────────────────────────────────────────────── */
function wpUploadImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) { document.body.removeChild(input); return; }
        if (!file.type.startsWith('image/')) {
            showNotification('Wallpaper Engine', 'Please select an image file.', 'error');
            document.body.removeChild(input);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl.startsWith('data:image/')) {
                showNotification('Wallpaper Engine', 'Could not read this image file.', 'error');
                document.body.removeChild(input);
                return;
            }
            wpShowImagePreview(dataUrl, file.name, input);
        };
        reader.onerror = () => {
            showNotification('Wallpaper Engine', 'Image upload failed.', 'error');
            document.body.removeChild(input);
        };
        reader.readAsDataURL(file);
    });

    input.click();
}

function wpShowImagePreview(dataUrl, fileName, fileInput) {
    const existing = document.querySelector('.wp-img-preview-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'wp-img-preview-overlay';
    const label = fileName ? `Image: ${fileName}` : 'Custom Image';

    overlay.innerHTML = `
        <div class="wp-img-preview-card">
            <div class="wp-img-preview-header">
                <div class="wp-img-preview-title">
                    <span class="material-icons-round">image</span>
                    <span>${label}</span>
                </div>
                <button class="wp-img-preview-close" title="Close">
                    <span class="material-icons-round" style="font-size:18px">close</span>
                </button>
            </div>
            <div class="wp-img-preview-body">
                <img src="${dataUrl}" alt="Wallpaper preview">
            </div>
            <div class="wp-img-preview-footer">
                <button class="wp-img-preview-cancel">Cancel</button>
                <button class="wp-img-preview-confirm">Set as Wallpaper</button>
            </div>
        </div>
    `;

    function close() {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => overlay.remove(), 150);
    }

    overlay.querySelector('.wp-img-preview-close').addEventListener('click', close);
    overlay.querySelector('.wp-img-preview-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('.wp-img-preview-confirm').addEventListener('click', () => {
        wallpaperEngineState.currentPreset = 'custom';
        wallpaperEngineState.currentKind = 'preset';
        wallpaperEngineState.currentLabel = label;
        wallpaperEngineState.currentSource = dataUrl;
        wallpaperEngineState.videoSrc = '';
        wallpaperEngineState.imageSrc = '';

        setWallpaper(dataUrl, false);
        wpUpdateWindowUI();
        try { localStorage.setItem('webos-wallpaper-engine-preset', 'custom'); }
        catch (_) { sessionStorage.setItem('webos-wallpaper-engine-preset', 'custom'); }
        showNotification('Wallpaper Engine', 'Wallpaper updated.');
        close();
    });

    document.body.appendChild(overlay);
}

/* ─────────────────────────────────────────────────
   VIDEO URL
───────────────────────────────────────────────── */
function wpRandomize() {
    const keys = Object.keys(wallpaperEnginePresets);
    wpChange(keys[Math.floor(Math.random() * keys.length)]);
}

function wpLoadVideoFromUrl(url) {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;

    let videoId = '';

    if (trimmed.includes('youtube.com/watch?v=')) {
        videoId = new URL(trimmed).searchParams.get('v');
    } else if (trimmed.includes('youtu.be/')) {
        videoId = trimmed.split('youtu.be/')[1].split('?')[0];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        videoId = trimmed;
    }

    if (videoId) {
        wallpaperEngineState.currentPreset = 'youtube';
        wallpaperEngineState.currentKind = 'youtube';
        wallpaperEngineState.currentLabel = 'YouTube Video';
        wallpaperEngineState.currentSource = `youtube:${videoId}`;
        wallpaperEngineState.videoSrc = videoId;
        wallpaperEngineState.imageSrc = '';

        setWallpaper(wallpaperEngineState.currentSource, false);
        wpUpdateWindowUI();
        showNotification('Wallpaper Engine', 'Loading YouTube video (1080p)…');
        return;
    }

    try { new URL(trimmed); } catch (_) {
        showNotification('Wallpaper Engine', 'Please enter a valid URL.', 'error');
        return;
    }

    wallpaperEngineState.currentPreset = 'video';
    wallpaperEngineState.currentKind = 'video';
    wallpaperEngineState.currentLabel = 'Remote Video';
    wallpaperEngineState.currentSource = `video:${trimmed}`;
    wallpaperEngineState.videoSrc = trimmed;
    wallpaperEngineState.imageSrc = '';

    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();

    // Apply HQ to desktop video immediately
    wpApplyHQVideoToDesktop(trimmed);

    showNotification('Wallpaper Engine', 'Loading HQ video from URL…');
}

/* ─────────────────────────────────────────────────
   VIDEO UPLOAD  (HQ optimized)
───────────────────────────────────────────────── */
function wpUploadVideo(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showNotification('Wallpaper Engine', 'Please select a video file.', 'error');
        input.value = '';
        return;
    }

    // Show size warning for very large files
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    if (file.size > 300 * 1024 * 1024) { // > 300 MB
        showNotification('Wallpaper Engine', `Large file (${sizeMB} MB) — loading may take a moment.`);
    }

    const objectUrl = URL.createObjectURL(file);

    wallpaperEngineState.currentPreset = 'video';
    wallpaperEngineState.currentKind = 'video';
    wallpaperEngineState.currentLabel = file.name ? `Video: ${file.name}` : 'Video';
    wallpaperEngineState.currentSource = `video:${objectUrl}`;
    wallpaperEngineState.videoSrc = objectUrl;
    wallpaperEngineState.imageSrc = '';

    // Use Object URL for desktop video (avoids base64 memory explosion on large files)
    const desktopVideo = document.getElementById('desktop-wallpaper-video');
    if (desktopVideo) {
        wpApplyHQVideo(desktopVideo, objectUrl);
    }

    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();

    // Persist path hint only (object URLs don't survive reload)
    try { localStorage.setItem('webos-wallpaper-engine-preset', 'video'); }
    catch (_) { sessionStorage.setItem('webos-wallpaper-engine-preset', 'video'); }
    input.value = '';

    showNotification('Wallpaper Engine', `HQ video loaded (${sizeMB} MB).`);
}

/* ─────────────────────────────────────────────────
   SCREEN INFO / DETAILS
───────────────────────────────────────────────── */
function wpUpdateScreenInfo(win = wpGetWindow()) {
    if (!win) return;
    const resEl = win.querySelector('#wp-screen-res');
    if (resEl) {
        const w = window.innerWidth, h = window.innerHeight;
        resEl.textContent = `${w} × ${h} (${(w / h).toFixed(2)}:1)`;

        const panel = win.querySelector('#wp-details-panel');
        if (panel && !panel.classList.contains('hidden')) {
            const orientEl = win.querySelector('#wp-detail-orient');
            const ratioEl  = win.querySelector('#wp-detail-ratio');
            const dprEl    = win.querySelector('#wp-detail-dpr');
            const depthEl  = win.querySelector('#wp-detail-depth');
            if (orientEl) orientEl.textContent = w > h ? 'Landscape' : 'Portrait';
            if (ratioEl) {
                const gcd = (a, b) => b ? gcd(b, a % b) : a;
                const r = gcd(w, h);
                ratioEl.textContent = `${w/r}:${h/r}`;
            }
            if (dprEl) dprEl.textContent = window.devicePixelRatio.toFixed(1) + 'x';
            if (depthEl) depthEl.textContent = window.screen.colorDepth + '-bit';
        }
    }
}

function wpToggleDetails() {
    const win = wpGetWindow();
    if (!win) return;
    const panel = win.querySelector('#wp-details-panel');
    const icon  = win.querySelector('#wp-expand-icon');
    if (panel && icon) {
        const isHidden = panel.classList.toggle('hidden');
        icon.textContent = isHidden ? 'expand_more' : 'expand_less';
        if (!isHidden) wpUpdateScreenInfo(win);
    }
}

function wpSetScalingMode(mode) {
    localStorage.setItem('webos-wallpaper-scaling', mode);
    // Propagate to desktop wallpaper image element
    const imgEl = document.getElementById('desktop-wallpaper-image');
    if (imgEl) {
        imgEl.style.backgroundSize = mode === 'stretch' ? '100% 100%'
            : mode === 'contain' ? 'contain' : 'cover';
    }
    showNotification('Wallpaper Engine', `Scaling mode: ${mode}.`);
}

function wpSetLoop(checked) {
    localStorage.setItem('webos-wallpaper-loop', checked ? 'true' : 'false');
    const desktopVideo = document.getElementById('desktop-wallpaper-video');
    const previewVideo = wpGetWindow()?.querySelector('#wp-preview-video');
    if (desktopVideo) desktopVideo.loop = checked;
    if (previewVideo) previewVideo.loop = checked;
}

/* ─────────────────────────────────────────────────
   YOUTUBE INTERACTIVE MODE
───────────────────────────────────────────────── */
/**
 * Toggle YouTube interactive mode.
 * When enabled, the YouTube wallpaper iframe becomes clickable/interactive
 * (user can play/pause, seek, etc.). When disabled, it plays silently in background.
 */
function wpSetYoutubeInteractive(checked) {
    localStorage.setItem('webos-wallpaper-yt-interactive', checked ? 'true' : 'false');
    _wpApplyYoutubeInteractive();

    // Re-apply YouTube wallpaper to rebuild srcdoc with updated controls param
    const saved = localStorage.getItem('webos-wallpaper') || sessionStorage.getItem('webos-wallpaper') || '';
    if (saved.startsWith('youtube:')) {
        setWallpaper(saved, true);
    }

    showNotification('Wallpaper Engine',
        checked ? 'YouTube interactive mode ON — you can click the wallpaper.'
                : 'YouTube interactive mode OFF — wallpaper plays silently.');
}

/**
 * Internal: apply the interactive state to the desktop YouTube iframe.
 */
function _wpApplyYoutubeInteractive() {
    const interactive = localStorage.getItem('webos-wallpaper-yt-interactive') === 'true';
    const ytIframe = document.getElementById('desktop-wallpaper-youtube');
    if (!ytIframe) return;

    if (interactive) {
        ytIframe.classList.add('yt-interactive');
    } else {
        ytIframe.classList.remove('yt-interactive');
    }
}

/**
 * Get whether YouTube interactive mode is enabled.
 */
function wpIsYoutubeInteractive() {
    return localStorage.getItem('webos-wallpaper-yt-interactive') === 'true';
}

function wpDestroyWindow(wid) {
    const win = windows?.[wid]?.el;
    if (!win) return;
    const previewVideo = win.querySelector('#wp-preview-video');
    if (previewVideo) {
        previewVideo.pause();
        previewVideo.innerHTML = '';
        previewVideo.removeAttribute('src');
        previewVideo.load();
        previewVideo.classList.remove('active');
    }
    win.querySelectorAll('.wp-bg').forEach(layer => layer.classList.remove('active'));
}