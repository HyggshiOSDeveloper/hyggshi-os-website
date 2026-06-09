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

let wallpaperEngineState = {
    currentPreset: 'nature',
    currentSource: wallpaperEnginePresets.nature.wallpaper,
    currentLabel: wallpaperEnginePresets.nature.label,
    currentKind: 'preset',
    videoSrc: ''
};

function initWallpaperEngine(win) {
    syncWallpaperEngineStateFromSavedWallpaper();
    wpUpdateWindowUI(win);

    // Initialize scaling mode dropdown
    const scalingSelect = win?.querySelector('#wp-scaling-mode');
    if (scalingSelect) {
        scalingSelect.value = localStorage.getItem('webos-wallpaper-scaling') || 'cover';
    }

    // Initialize loop toggle
    const loopToggle = win?.querySelector('#wp-loop-toggle');
    if (loopToggle) {
        loopToggle.checked = localStorage.getItem('webos-wallpaper-loop') !== 'false';
    }

    // Initialize screen info
    wpUpdateScreenInfo(win);
    
    // Add resize listener for live resolution updates
    const onResize = () => wpUpdateScreenInfo(win);
    window.addEventListener('resize', onResize);
    
    // Cleanup resize listener when window is destroyed
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
                const preset = layer.classList.contains('nature')
                    ? 'nature'
                    : layer.classList.contains('space')
                        ? 'space'
                        : layer.classList.contains('abstract')
                            ? 'abstract'
                            : layer.classList.contains('ocean')
                                ? 'ocean'
                                : 'city';
                wpChange(preset);
            });
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
        return;
    }

    if (saved.startsWith('video:')) {
        wallpaperEngineState.currentPreset = 'video';
        wallpaperEngineState.currentSource = saved;
        wallpaperEngineState.currentLabel = 'Video';
        wallpaperEngineState.currentKind = 'video';
        wallpaperEngineState.videoSrc = saved.slice(6);
        return;
    }

    if (saved.startsWith('youtube:')) {
        wallpaperEngineState.currentPreset = 'youtube';
        wallpaperEngineState.currentSource = saved;
        wallpaperEngineState.currentLabel = 'YouTube Video';
        wallpaperEngineState.currentKind = 'youtube';
        wallpaperEngineState.videoSrc = saved.slice(8);
        return;
    }

    wallpaperEngineState.currentPreset = 'nature';
    wallpaperEngineState.currentSource = wallpaperEnginePresets.nature.wallpaper;
    wallpaperEngineState.currentLabel = wallpaperEnginePresets.nature.label;
    wallpaperEngineState.currentKind = 'preset';
    wallpaperEngineState.videoSrc = '';
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

function wpUpdateWindowUI(win = wpGetWindow()) {
    if (!win) return;
    const title = win.querySelector('#wp-active-name');
    const previewVideo = win.querySelector('#wp-preview-video');
    const previewYoutube = win.querySelector('#wp-preview-youtube');
    const activePreset = wallpaperEngineState.currentKind === 'preset' ? wallpaperEngineState.currentPreset : '';

    if (title) title.textContent = wallpaperEngineState.currentLabel;

    win.querySelectorAll('.wp-toolbar button').forEach(button => {
        const isActive = button.dataset.wp === activePreset;
        button.classList.toggle('active', isActive);
    });

    win.querySelectorAll('.wp-bg').forEach(layer => {
        layer.classList.toggle('active', layer.classList.contains(wallpaperEngineState.currentKind === 'preset'
            ? wallpaperEnginePresets[wallpaperEngineState.currentPreset]?.previewClass
            : ''));
    });

    if (previewVideo) {
        if (wallpaperEngineState.currentKind === 'video' && wallpaperEngineState.videoSrc) {
            if (previewVideo.src !== wallpaperEngineState.videoSrc) {
                previewVideo.src = wallpaperEngineState.videoSrc;
            }
            previewVideo.classList.add('active');
            previewVideo.loop = localStorage.getItem('webos-wallpaper-loop') !== 'false';
            previewVideo.play().catch(() => { });
        } else {
            previewVideo.pause();
            previewVideo.removeAttribute('src');
            previewVideo.load();
            previewVideo.classList.remove('active');
        }
    }

    if (previewYoutube) {
        if (wallpaperEngineState.currentKind === 'youtube' && wallpaperEngineState.videoSrc) {
            const youtubeUrl = `https://www.youtube-nocookie.com/embed/${wallpaperEngineState.videoSrc}?autoplay=1&mute=1&loop=1&playlist=${wallpaperEngineState.videoSrc}&controls=0&modestbranding=1&rel=0`;
            if (previewYoutube.src !== youtubeUrl) {
                previewYoutube.src = youtubeUrl;
            }
            previewYoutube.classList.add('active');
        } else {
            previewYoutube.classList.remove('active');
            previewYoutube.removeAttribute('src');
        }
    }
}

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

    setWallpaper(config.wallpaper, silent);
    wpUpdateWindowUI();
}

function wpApplyToDesktop() {
    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();
}

function wpRandomize() {
    const keys = Object.keys(wallpaperEnginePresets);
    const next = keys[Math.floor(Math.random() * keys.length)];
    wpChange(next);
}

function wpLoadVideoFromUrl(url) {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;

    let videoId = '';

    // Check if it's a YouTube URL
    if (trimmed.includes('youtube.com/watch?v=')) {
        const urlObj = new URL(trimmed);
        videoId = urlObj.searchParams.get('v');
    } else if (trimmed.includes('youtu.be/')) {
        videoId = trimmed.split('youtu.be/')[1].split('?')[0];
    } else if (trimmed.length === 11) {
        // Direct video ID
        videoId = trimmed;
    }

    if (videoId) {
        // It's a YouTube video!
        wallpaperEngineState.currentPreset = 'youtube';
        wallpaperEngineState.currentKind = 'youtube';
        wallpaperEngineState.currentLabel = 'YouTube Video';
        wallpaperEngineState.currentSource = `youtube:${videoId}`;
        wallpaperEngineState.videoSrc = videoId;

        setWallpaper(wallpaperEngineState.currentSource, false);
        wpUpdateWindowUI();
        
        showNotification('Wallpaper Engine', 'Loading YouTube video...');
        return;
    }

    // Regular video URL
    try {
        new URL(trimmed);
    } catch (_) {
        showNotification('Wallpaper Engine', 'Please enter a valid URL.', 'error');
        return;
    }

    wallpaperEngineState.currentPreset = 'video';
    wallpaperEngineState.currentKind = 'video';
    wallpaperEngineState.currentLabel = 'Remote Video';
    wallpaperEngineState.currentSource = `video:${trimmed}`;
    wallpaperEngineState.videoSrc = trimmed;

    setWallpaper(wallpaperEngineState.currentSource, false);
    wpUpdateWindowUI();
    
    showNotification('Wallpaper Engine', 'Loading video from URL...');
}

function wpUploadVideo(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
        showNotification('Wallpaper Engine', 'Please select a video file.', 'error');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl.startsWith('data:video/')) {
            showNotification('Wallpaper Engine', 'Could not read this video file.', 'error');
            input.value = '';
            return;
        }

        wallpaperEngineState.currentPreset = 'video';
        wallpaperEngineState.currentKind = 'video';
        wallpaperEngineState.currentLabel = file.name ? `Video: ${file.name}` : 'Video';
        wallpaperEngineState.currentSource = `video:${dataUrl}`;
        wallpaperEngineState.videoSrc = dataUrl;

        setWallpaper(wallpaperEngineState.currentSource, false);
        wpUpdateWindowUI();

        try {
            localStorage.setItem('webos-wallpaper-engine-preset', 'video');
        } catch (_) {
            sessionStorage.setItem('webos-wallpaper-engine-preset', 'video');
        }
        input.value = '';
    };
    reader.onerror = () => {
        showNotification('Wallpaper Engine', 'Video upload failed.', 'error');
        input.value = '';
    };
    reader.readAsDataURL(file);
}

function wpUpdateScreenInfo(win = wpGetWindow()) {
    if (!win) return;
    const resEl = win.querySelector('#wp-screen-res');
    if (resEl) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const ratio = (width / height).toFixed(2);
        resEl.textContent = `${width} x ${height} (${ratio}:1)`;

        // Update expanded details if panel is visible
        const panel = win.querySelector('#wp-details-panel');
        if (panel && !panel.classList.contains('hidden')) {
            const orientEl = win.querySelector('#wp-detail-orient');
            const ratioEl = win.querySelector('#wp-detail-ratio');
            const dprEl = win.querySelector('#wp-detail-dpr');
            const depthEl = win.querySelector('#wp-detail-depth');

            if (orientEl) orientEl.textContent = width > height ? 'Landscape' : 'Portrait';
            if (ratioEl) {
                const gcd = (a, b) => b ? gcd(b, a % b) : a;
                const r = gcd(width, height);
                ratioEl.textContent = `${width / r}:${height / r}`;
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
    const icon = win.querySelector('#wp-expand-icon');
    if (panel && icon) {
        const isHidden = panel.classList.toggle('hidden');
        icon.textContent = isHidden ? 'expand_more' : 'expand_less';
        if (!isHidden) wpUpdateScreenInfo(win);
    }
}

function wpDestroyWindow(wid) {
    const win = windows?.[wid]?.el;
    if (!win) return;
    const previewVideo = win.querySelector('#wp-preview-video');
    if (previewVideo) {
        previewVideo.pause();
        previewVideo.removeAttribute('src');
        previewVideo.load();
        previewVideo.classList.remove('active');
    }
    win.querySelectorAll('.wp-bg').forEach(layer => {
        layer.classList.remove('active');
    });
}
