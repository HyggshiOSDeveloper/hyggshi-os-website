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

    wpHideYoutubeControls();
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

    // --- YouTube preview (srcdoc proxy — no file:// origin error) ---
    if (previewYoutube) {
        if (wallpaperEngineState.currentKind === 'youtube' && wallpaperEngineState.videoSrc) {
            const vid = wallpaperEngineState.videoSrc;
            const embedUrl = `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&loop=1&playlist=${vid}&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&vq=hd1080`;
            const srcdocHtml = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;overflow:hidden;background:#000}iframe{width:100vw;height:100vh;border:none;pointer-events:none}</style></head><body><iframe src="${embedUrl}" allow="autoplay;encrypted-media" allowfullscreen></iframe></body></html>`;
            if ((previewYoutube.dataset.ytId || '') !== vid) {
                previewYoutube.dataset.ytId = vid;
                previewYoutube.removeAttribute('src');
                previewYoutube.srcdoc = srcdocHtml;
            }
            previewYoutube.classList.add('active');
        } else {
            previewYoutube.classList.remove('active');
            previewYoutube.srcdoc = '';
            previewYoutube.removeAttribute('src');
            delete previewYoutube.dataset.ytId;
        }
    }

    // --- Image URL preview ---
    if (previewImgUrl) {
        const showImg = (wallpaperEngineState.currentKind === 'image-url' || wallpaperEngineState.currentKind === 'object-url')
                        && wallpaperEngineState.imageSrc;
        if (showImg) {
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

    wpHideYoutubeControls();
    setWallpaper(config.wallpaper, silent);
    wpUpdateWindowUI();
}

function wpApplyToDesktop() {
    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();
}

/* ─────────────────────────────────────────────────
   IMAGE UPLOAD  (Object URL — no base64, HQ)
───────────────────────────────────────────────── */

// Track current image Object URL so we can revoke it when replaced
let _wpCurrentImageObjectUrl = null;

function wpUploadImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showNotification('Wallpaper Engine', 'Please select an image file.', 'error');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        wpShowImagePreview(objectUrl, file.name, sizeMB);
    });

    input.click();
}

function wpShowImagePreview(objectUrl, fileName, sizeMB) {
    const existing = document.querySelector('.wp-img-preview-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'wp-img-preview-overlay';
    const label = fileName || 'Custom Image';
    const sizeLabel = sizeMB ? ` · ${sizeMB} MB` : '';

    overlay.innerHTML = `
        <div class="wp-img-preview-card">
            <div class="wp-img-preview-header">
                <div class="wp-img-preview-title">
                    <span class="material-icons-round">image</span>
                    <span>${label}${sizeLabel}</span>
                </div>
                <button class="wp-img-preview-close" title="Close">
                    <span class="material-icons-round" style="font-size:18px">close</span>
                </button>
            </div>
            <div class="wp-img-preview-body">
                <img src="${objectUrl}" alt="Wallpaper preview"
                     style="max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            </div>
            <div class="wp-img-preview-footer">
                <button class="wp-img-preview-cancel">Cancel</button>
                <button class="wp-img-preview-confirm">Set as Wallpaper</button>
            </div>
        </div>
    `;

    function close(revokeUrl = false) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => {
            overlay.remove();
            if (revokeUrl) URL.revokeObjectURL(objectUrl);
        }, 150);
    }

    overlay.querySelector('.wp-img-preview-close').addEventListener('click', () => close(true));
    overlay.querySelector('.wp-img-preview-cancel').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(true); });

    overlay.querySelector('.wp-img-preview-confirm').addEventListener('click', () => {
        if (_wpCurrentImageObjectUrl && _wpCurrentImageObjectUrl !== objectUrl) {
            URL.revokeObjectURL(_wpCurrentImageObjectUrl);
        }
        _wpCurrentImageObjectUrl = objectUrl;

        wallpaperEngineState.currentPreset = 'custom';
        wallpaperEngineState.currentKind   = 'object-url';
        wallpaperEngineState.currentLabel  = label;
        wallpaperEngineState.currentSource = `object-url:${objectUrl}`;
        wallpaperEngineState.videoSrc      = '';
        wallpaperEngineState.imageSrc      = objectUrl;

        wpApplyObjectUrlToDesktop(objectUrl);
        wpUpdateWindowUI();
        showNotification('Wallpaper Engine', `Image applied (${sizeMB || '?'} MB) — HQ.`);
        close(false);
    });

    document.body.appendChild(overlay);
}

/**
 * Apply a local Object URL image directly to the desktop wallpaper layer.
 * Does NOT write to localStorage (Object URLs don't persist across reloads).
 */
function wpApplyObjectUrlToDesktop(objectUrl) {
    const wallpaperImage   = document.getElementById('desktop-wallpaper-image');
    const wallpaperVideo   = document.getElementById('desktop-wallpaper-video');
    const wallpaperYoutube = document.getElementById('desktop-wallpaper-youtube');
    const desktop          = document.getElementById('desktop');

    if (wallpaperVideo) {
        wallpaperVideo.pause();
        wallpaperVideo.removeAttribute('src');
        wallpaperVideo.load();
        wallpaperVideo.classList.remove('active');
    }
    if (wallpaperYoutube) {
        wallpaperYoutube.classList.remove('active');
        wallpaperYoutube.removeAttribute('src');
    }

    const scalingMode = localStorage.getItem('webos-wallpaper-scaling') || 'cover';
    const sizeValue   = scalingMode === 'stretch' ? '100% 100%'
                      : scalingMode === 'contain'  ? 'contain'
                      : 'cover';

    if (wallpaperImage) {
        wallpaperImage.style.imageRendering     = 'high-quality';
        wallpaperImage.style.backgroundImage    = `url("${objectUrl}")`;
        wallpaperImage.style.backgroundSize     = sizeValue;
        wallpaperImage.style.backgroundPosition = 'center';
        wallpaperImage.style.backgroundRepeat   = 'no-repeat';
    }

    if (desktop) {
        desktop.dataset.wallpaperType = 'object-url';
        desktop.dataset.wallpaper     = 'local-image'; // never write objectUrl here
    }
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

        // Upgrade desktop iframe with enablejsapi & show interactive controls
        wpUpgradeDesktopYtIframe(videoId);
        wpShowYoutubeControls(videoId);
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
   VIDEO UPLOAD  (Object URL — HQ, no base64)
───────────────────────────────────────────────── */

let _wpCurrentVideoObjectUrl = null;

function wpUploadVideo(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showNotification('Wallpaper Engine', 'Please select a video file.', 'error');
        input.value = '';
        return;
    }

    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    // Revoke previous video Object URL
    if (_wpCurrentVideoObjectUrl) {
        URL.revokeObjectURL(_wpCurrentVideoObjectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    _wpCurrentVideoObjectUrl = objectUrl;

    const label = file.name ? `Video: ${file.name}` : 'Video';

    wallpaperEngineState.currentPreset = 'video';
    wallpaperEngineState.currentKind   = 'video';
    wallpaperEngineState.currentLabel  = label;
    wallpaperEngineState.currentSource = `video:${objectUrl}`;
    wallpaperEngineState.videoSrc      = objectUrl;
    wallpaperEngineState.imageSrc      = '';

    // Apply HQ to desktop video directly — bypass setWallpaper (no localStorage bloat)
    const desktopVideo = document.getElementById('desktop-wallpaper-video');
    if (desktopVideo) {
        wpApplyHQVideo(desktopVideo, objectUrl);
        desktopVideo.classList.add('active');
    }

    // Hide image/youtube layers
    const wallpaperImage   = document.getElementById('desktop-wallpaper-image');
    const wallpaperYoutube = document.getElementById('desktop-wallpaper-youtube');
    if (wallpaperImage) wallpaperImage.style.backgroundImage = 'none';
    if (wallpaperYoutube) {
        wallpaperYoutube.classList.remove('active');
        wallpaperYoutube.removeAttribute('src');
    }

    wpHideYoutubeControls();

    // Update desktop dataset (without writing objectUrl into it)
    const desktop = document.getElementById('desktop');
    if (desktop) {
        desktop.dataset.wallpaperType = 'video';
        desktop.dataset.wallpaper     = 'local-video';
    }

    wpUpdateWindowUI();
    input.value = '';

    showNotification('Wallpaper Engine', `HQ video loaded — ${sizeMB} MB.`);
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

/* ═══════════════════════════════════════════════════════════════
   YOUTUBE WALLPAPER — INTERACTIVE CONTROLS
   Floating control bar hiện ra khi YouTube wallpaper đang active.
   Dùng postMessage (IFrame API) để điều khiển mà không cần
   pointer-events trên iframe.
════════════════════════════════════════════════════════════════ */

/* --- State --- */
let _ytWpMuted    = true;
let _ytWpPlaying  = true;
let _ytInteractive = false;
let _ytWpVolume   = 50;
let _ytCurrentVid = '';
let _ytUpgradeTimer = null;

/* --- CSS (injected once) --- */
function _wpInjectYtCtrlCSS() {
    if (document.getElementById('yt-wp-ctrl-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-wp-ctrl-style';
    style.textContent = `
/* Floating YouTube control bar */
#yt-wallpaper-controls {
    position: fixed;
    bottom: 68px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
}
#yt-wallpaper-controls.visible {
    opacity: 1;
    pointer-events: auto;
}
#yt-wallpaper-controls:hover {
    opacity: 1 !important;
}
.yt-wp-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(15,15,20,0.82);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 40px;
    padding: 6px 10px 6px 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,68,68,0.15);
    user-select: none;
    min-width: 0;
    white-space: nowrap;
}
.yt-wp-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255,255,255,0.65);
    letter-spacing: 0.3px;
    padding-right: 4px;
}
.yt-wp-label .yt-dot {
    width: 6px; height: 6px;
    background: #ff4444;
    border-radius: 50%;
    animation: yt-pulse 2s ease-in-out infinite;
    flex-shrink: 0;
}
@keyframes yt-pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.75); }
}
.yt-wp-divider {
    width: 1px; height: 20px;
    background: rgba(255,255,255,0.12);
    flex-shrink: 0;
    margin: 0 2px;
}
.yt-wp-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: transparent;
    border: none; border-radius: 50%;
    color: rgba(255,255,255,0.75);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.1s;
    flex-shrink: 0;
    outline: none;
}
.yt-wp-btn:hover {
    background: rgba(255,255,255,0.12);
    color: #fff;
}
.yt-wp-btn:active { transform: scale(0.88); }
.yt-wp-btn.active {
    background: rgba(255,68,68,0.22);
    color: #ff6b6b;
}
.yt-wp-btn .material-icons-round { font-size: 18px; }

/* Volume group */
.yt-wp-vol-wrap {
    display: flex; align-items: center; gap: 4px;
    overflow: hidden; max-width: 0;
    transition: max-width 0.3s ease, opacity 0.25s;
    opacity: 0;
}
.yt-wp-vol-wrap.open { max-width: 100px; opacity: 1; }
.yt-wp-vol-slider {
    -webkit-appearance: none; appearance: none;
    width: 80px; height: 3px;
    border-radius: 2px;
    background: linear-gradient(to right, #ff4444 0%, #ff4444 var(--fill,50%), rgba(255,255,255,0.2) var(--fill,50%));
    outline: none; cursor: pointer;
}
.yt-wp-vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 4px rgba(0,0,0,0.4);
    cursor: pointer;
}
.yt-wp-vol-slider::-moz-range-thumb {
    width: 12px; height: 12px;
    border-radius: 50%; border: none;
    background: #fff;
}

/* Interactive mode badge */
.yt-wp-interactive-badge {
    position: fixed;
    bottom: 108px; left: 50%;
    transform: translateX(-50%);
    background: rgba(255,68,68,0.18);
    border: 1px solid rgba(255,68,68,0.35);
    color: #ff8080;
    font-size: 11px; font-weight: 600;
    padding: 4px 12px;
    border-radius: 20px;
    z-index: 8999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
    letter-spacing: 0.5px;
}
.yt-wp-interactive-badge.show { opacity: 1; }

/* Auto-hide: fade when not hovered (after 3s) */
#yt-wallpaper-controls.autohide {
    opacity: 0.08;
}
#yt-wallpaper-controls.autohide:hover {
    opacity: 1;
}
`;
    document.head.appendChild(style);
}

/* --- Build embed URL with IFrame API enabled --- */
function wpYtBuildEmbedUrl(videoId, interactive = false) {
    const origin = encodeURIComponent(
        (location.origin && location.origin !== 'null')
            ? location.origin
            : location.href.split('/').slice(0, 3).join('/')
    );
    return `https://www.youtube-nocookie.com/embed/${videoId}`
        + `?autoplay=1&mute=1&loop=1&playlist=${videoId}`
        + `&controls=${interactive ? 1 : 0}`
        + `&modestbranding=1&rel=0&playsinline=1`
        + `&iv_load_policy=3&vq=hd1080`
        + `&enablejsapi=1&origin=${origin}`;
}

/* --- Upgrade desktop iframe to include enablejsapi --- */
function wpUpgradeDesktopYtIframe(videoId) {
    if (_ytUpgradeTimer) { clearTimeout(_ytUpgradeTimer); _ytUpgradeTimer = null; }
    // YouTube needs ~300-600ms to mount the iframe after setWallpaper
    _ytUpgradeTimer = setTimeout(() => {
        const iframe = document.getElementById('desktop-wallpaper-youtube');
        if (!iframe) return;
        const newSrc = wpYtBuildEmbedUrl(videoId, false);
        // Only reload if src doesn't already have enablejsapi
        if (!iframe.src.includes('enablejsapi=1') || iframe.dataset.ytId !== videoId) {
            iframe.dataset.ytId = videoId;
            iframe.src = newSrc;
        }
    }, 600);
}

/* --- Send IFrame API command --- */
function wpYtPostMessage(func, args = []) {
    const iframe = document.getElementById('desktop-wallpaper-youtube');
    if (!iframe || !iframe.contentWindow) return;
    try {
        iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func, args }),
            '*'
        );
    } catch (_) {}
}

/* --- Playback controls --- */
function _wpYtSetPlayIcon(playing) {
    const icon = document.querySelector('#yt-wp-play-btn .material-icons-round');
    if (icon) icon.textContent = playing ? 'pause' : 'play_arrow';
}

function wpYtTogglePlay() {
    _ytWpPlaying = !_ytWpPlaying;
    wpYtPostMessage(_ytWpPlaying ? 'playVideo' : 'pauseVideo');
    _wpYtSetPlayIcon(_ytWpPlaying);
}

/* --- Mute / Volume --- */
function _wpYtSetMuteIcon(muted) {
    const icon = document.querySelector('#yt-wp-mute-btn .material-icons-round');
    if (icon) icon.textContent = muted ? 'volume_off' : (_ytWpVolume === 0 ? 'volume_mute' : _ytWpVolume < 50 ? 'volume_down' : 'volume_up');
}

function _wpYtUpdateSliderFill(el, val) {
    if (el) el.style.setProperty('--fill', val + '%');
}

function wpYtToggleMute() {
    _ytWpMuted = !_ytWpMuted;
    if (_ytWpMuted) {
        wpYtPostMessage('mute');
    } else {
        wpYtPostMessage('unMute');
        wpYtPostMessage('setVolume', [_ytWpVolume]);
    }
    _wpYtSetMuteIcon(_ytWpMuted);

    // Toggle volume slider visibility
    const volWrap = document.querySelector('.yt-wp-vol-wrap');
    if (volWrap) volWrap.classList.toggle('open', !_ytWpMuted);
}

function wpYtSetVolume(val) {
    _ytWpVolume = parseInt(val);
    _wpYtUpdateSliderFill(document.getElementById('yt-wp-vol-slider'), _ytWpVolume);
    wpYtPostMessage('setVolume', [_ytWpVolume]);
    if (_ytWpVolume > 0 && _ytWpMuted) {
        _ytWpMuted = false;
        wpYtPostMessage('unMute');
        _wpYtSetMuteIcon(false);
    }
    if (_ytWpVolume === 0 && !_ytWpMuted) {
        _ytWpMuted = true;
        wpYtPostMessage('mute');
        _wpYtSetMuteIcon(true);
    }
}

/* --- Interactive Mode (pointer-events toggle) --- */
function wpYtToggleInteractive() {
    _ytInteractive = !_ytInteractive;
    const iframe = document.getElementById('desktop-wallpaper-youtube');
    if (iframe) iframe.style.pointerEvents = _ytInteractive ? 'auto' : 'none';

    const btn = document.getElementById('yt-wp-interact-btn');
    if (btn) {
        btn.classList.toggle('active', _ytInteractive);
        btn.title = _ytInteractive ? 'Thoát chế độ tương tác' : 'Chế độ tương tác (click vào video)';
        const icon = btn.querySelector('.material-icons-round');
        if (icon) icon.textContent = _ytInteractive ? 'touch_app' : 'do_not_touch';
    }

    // Show / hide badge
    let badge = document.getElementById('yt-wp-interactive-badge');
    if (_ytInteractive) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'yt-wp-interactive-badge';
            badge.className = 'yt-wp-interactive-badge';
            badge.textContent = '⚡ Interactive Mode';
            document.body.appendChild(badge);
        }
        requestAnimationFrame(() => badge.classList.add('show'));
    } else {
        if (badge) { badge.classList.remove('show'); setTimeout(() => badge.remove(), 300); }
    }
}

/* --- Auto-hide logic --- */
let _ytAutoHideTimer = null;
function _wpYtResetAutoHide() {
    const bar = document.getElementById('yt-wallpaper-controls');
    if (!bar) return;
    bar.classList.remove('autohide');
    if (_ytAutoHideTimer) clearTimeout(_ytAutoHideTimer);
    _ytAutoHideTimer = setTimeout(() => {
        if (document.getElementById('yt-wallpaper-controls')) {
            bar.classList.add('autohide');
        }
    }, 3500);
}

/* --- Show controls --- */
function wpShowYoutubeControls(videoId) {
    _wpInjectYtCtrlCSS();
    wpHideYoutubeControls(); // clear previous

    _ytCurrentVid   = videoId || '';
    _ytWpMuted      = true;
    _ytWpPlaying    = true;
    _ytInteractive  = false;
    _ytWpVolume     = 50;

    const bar = document.createElement('div');
    bar.id = 'yt-wallpaper-controls';

    bar.innerHTML = `
        <div class="yt-wp-bar">
            <div class="yt-wp-label">
                <span class="yt-dot"></span>
                YouTube Wallpaper
            </div>
            <div class="yt-wp-divider"></div>

            <!-- Play / Pause -->
            <button id="yt-wp-play-btn" class="yt-wp-btn" onclick="wpYtTogglePlay()" title="Play / Pause">
                <span class="material-icons-round">pause</span>
            </button>

            <!-- Mute -->
            <button id="yt-wp-mute-btn" class="yt-wp-btn" onclick="wpYtToggleMute()" title="Unmute / Mute">
                <span class="material-icons-round">volume_off</span>
            </button>

            <!-- Volume slider (shown when unmuted) -->
            <div class="yt-wp-vol-wrap" id="yt-wp-vol-wrap">
                <input type="range" id="yt-wp-vol-slider" class="yt-wp-vol-slider"
                       min="0" max="100" value="50"
                       oninput="wpYtSetVolume(this.value)"
                       onmousedown="event.stopPropagation()"
                       title="Volume">
            </div>

            <div class="yt-wp-divider"></div>

            <!-- Interactive mode -->
            <button id="yt-wp-interact-btn" class="yt-wp-btn" onclick="wpYtToggleInteractive()" title="Chế độ tương tác (click vào video)">
                <span class="material-icons-round">do_not_touch</span>
            </button>

            <!-- Open in YouTube -->
            <button class="yt-wp-btn" onclick="window.open('https://www.youtube.com/watch?v=${videoId}','_blank')" title="Mở trên YouTube">
                <span class="material-icons-round">open_in_new</span>
            </button>

            <!-- Change video -->
            <button class="yt-wp-btn" onclick="wpYtPromptChangeVideo()" title="Đổi video">
                <span class="material-icons-round">swap_horiz</span>
            </button>
        </div>
    `;

    // Desktop hover → reset auto-hide timer
    bar.addEventListener('mousemove', _wpYtResetAutoHide);

    document.body.appendChild(bar);
    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => bar.classList.add('visible'));
    });
    _wpYtResetAutoHide();
}

/* --- Hide controls --- */
function wpHideYoutubeControls() {
    if (_ytUpgradeTimer) { clearTimeout(_ytUpgradeTimer); _ytUpgradeTimer = null; }
    if (_ytAutoHideTimer) { clearTimeout(_ytAutoHideTimer); _ytAutoHideTimer = null; }

    const bar = document.getElementById('yt-wallpaper-controls');
    if (bar) bar.remove();

    const badge = document.getElementById('yt-wp-interactive-badge');
    if (badge) badge.remove();

    // Reset iframe pointer-events
    const iframe = document.getElementById('desktop-wallpaper-youtube');
    if (iframe) iframe.style.pointerEvents = 'none';

    _ytInteractive = false;
    _ytCurrentVid  = '';
}

/* --- Quick-change video prompt --- */
function wpYtPromptChangeVideo() {
    const url = prompt('Nhập YouTube URL hoặc Video ID mới:');
    if (url && url.trim()) {
        wpLoadVideoFromUrl(url.trim());
    }
}