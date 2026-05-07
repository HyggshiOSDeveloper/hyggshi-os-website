/* ============ IMAGE VIEWER ============ */
let ivZoomLevel = 100;

function ivOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            for (const [wid, w] of Object.entries(windows)) {
                if (w.appId === 'image-viewer') {
                    const canvas = w.el.querySelector('.iv-canvas');
                    canvas.innerHTML = `<img src="${ev.target.result}" alt="${file.name}" id="iv-image">`;
                    ivZoomLevel = 100;
                    break;
                }
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function ivZoom(dir) {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'image-viewer') {
            const img = w.el.querySelector('#iv-image');
            if (!img) return;
            if (dir === 'in') ivZoomLevel = Math.min(300, ivZoomLevel + 25);
            else if (dir === 'out') ivZoomLevel = Math.max(25, ivZoomLevel - 25);
            else ivZoomLevel = 100;
            img.style.transform = `scale(${ivZoomLevel / 100})`;
            break;
        }
    }
}

/* ============ MUSIC PLAYER ============ */
let mpPlaying = false;
let mpAudioContext = null;
let mpAnalyser = null;
let mpFrequencyData = null;
let mpSourceNode = null;
let mpVisualizerFrame = null;
let mpCanvasState = [];

const MP_BAR_COUNT = 40;
const MP_FFT_SIZE = 256;
const MP_SMOOTHING = 0.72;
const MP_VISUAL_GAIN = 1.7;

function mpGetWindows() {
    return Object.values(windows).filter(w => w.appId === 'music-player');
}

function mpGetAudio() {
    return document.getElementById('mp-audio');
}

function mpGetCanvas(winEl) {
    return winEl ? winEl.querySelector('.mp-visualizer-canvas') : null;
}

function mpResizeCanvas(canvas, forceReset = false) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        if (forceReset || !mpCanvasState.length) {
            mpCanvasState = new Array(MP_BAR_COUNT).fill(0.08);
        }
    }
}

function mpDrawIdle(canvas) {
    if (!canvas) return;
    mpResizeCanvas(canvas, true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const gap = Math.max(2, Math.floor(w * 0.007));
    const totalGap = gap * (MP_BAR_COUNT - 1);
    const barWidth = Math.max(2, Math.floor((w - totalGap) / MP_BAR_COUNT));
    const totalBarsWidth = barWidth * MP_BAR_COUNT + totalGap;
    let x = Math.floor((w - totalBarsWidth) / 2);

    ctx.fillStyle = 'rgba(162, 155, 254, 0.26)';
    for (let i = 0; i < MP_BAR_COUNT; i++) {
        const y = Math.floor(h * 0.84);
        const barHeight = Math.max(3, Math.floor(h * 0.08));
        ctx.fillRect(x, y, barWidth, barHeight);
        x += barWidth + gap;
    }
}

function mpUpdateProgressUI(audio) {
    const percent = (audio.currentTime / (audio.duration || 1)) * 100;
    for (const w of mpGetWindows()) {
        const fill = w.el.querySelector('.mp-bar-fill');
        if (fill) fill.style.width = percent + '%';
        const times = w.el.querySelector('.mp-times');
        if (times) {
            times.innerHTML = `<span>${formatTime(audio.currentTime)}</span><span>${formatTime(audio.duration)}</span>`;
        }
    }
}

function mpSeekToFraction(fraction) {
    const audio = mpGetAudio();
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const safe = Math.max(0, Math.min(1, fraction));
    audio.currentTime = safe * audio.duration;
    mpUpdateProgressUI(audio);
}

function mpSeekFromClientX(clientX, bar) {
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return;
    mpSeekToFraction((clientX - rect.left) / rect.width);
}

function mpBindSeekBar(winEl) {
    const bar = winEl.querySelector('.mp-bar');
    if (!bar || bar.dataset.seekBound === '1') return;
    bar.dataset.seekBound = '1';

    const stopDrag = () => {
        bar.dataset.dragging = '0';
    };

    bar.addEventListener('pointerdown', (e) => {
        bar.dataset.dragging = '1';
        if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
        mpSeekFromClientX(e.clientX, bar);
    });

    bar.addEventListener('pointermove', (e) => {
        if (bar.dataset.dragging === '1') mpSeekFromClientX(e.clientX, bar);
    });

    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);
    bar.addEventListener('lostpointercapture', stopDrag);
}

function mpInitWindow(win) {
    if (!win) return;
    mpBindSeekBar(win);
    mpDrawIdle(mpGetCanvas(win));
}

function mpSetupAudioAnalyzer(audio) {
    if (!audio) return;

    if (!mpAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        mpAudioContext = new AudioCtx();
    }

    if (!mpSourceNode) {
        mpSourceNode = mpAudioContext.createMediaElementSource(audio);
        mpAnalyser = mpAudioContext.createAnalyser();
        mpAnalyser.fftSize = MP_FFT_SIZE;
        mpAnalyser.smoothingTimeConstant = MP_SMOOTHING;
        mpSourceNode.connect(mpAnalyser);
        mpAnalyser.connect(mpAudioContext.destination);
        mpFrequencyData = new Uint8Array(mpAnalyser.frequencyBinCount);
    }
}

function mpRenderVisualizerFrame() {
    if (!mpAnalyser || !mpFrequencyData) return;
    mpAnalyser.getByteFrequencyData(mpFrequencyData);

    for (const w of mpGetWindows()) {
        const canvas = mpGetCanvas(w.el);
        if (!canvas) continue;

        mpResizeCanvas(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, 'rgba(108, 92, 231, 0.96)');
        gradient.addColorStop(1, 'rgba(162, 155, 254, 0.98)');
        ctx.fillStyle = gradient;

        const gap = Math.max(2, Math.floor(width * 0.007));
        const totalGap = gap * (MP_BAR_COUNT - 1);
        const barWidth = Math.max(2, Math.floor((width - totalGap) / MP_BAR_COUNT));
        const totalBarsWidth = barWidth * MP_BAR_COUNT + totalGap;
        let x = Math.floor((width - totalBarsWidth) / 2);

        if (!mpCanvasState.length || mpCanvasState.length !== MP_BAR_COUNT) {
            mpCanvasState = new Array(MP_BAR_COUNT).fill(0.08);
        }

        for (let i = 0; i < MP_BAR_COUNT; i++) {
            const freqIndex = Math.floor((i / MP_BAR_COUNT) * mpFrequencyData.length);
            const raw = (mpFrequencyData[freqIndex] || 0) / 255;
            const boosted = Math.min(1, raw * MP_VISUAL_GAIN);

            const prev = mpCanvasState[i] || 0.08;
            const next = boosted > prev
                ? prev + (boosted - prev) * 0.62
                : prev * 0.86 + boosted * 0.14;
            mpCanvasState[i] = next;

            const normalized = Math.pow(next, 0.72);
            const barHeight = Math.max(3, Math.floor(normalized * height * 0.9));
            const y = height - barHeight;
            ctx.fillRect(x, y, barWidth, barHeight);
            x += barWidth + gap;
        }
    }
}

function mpStartVisualizer() {
    if (!mpAnalyser || mpVisualizerFrame) return;

    const draw = () => {
        if (!mpAnalyser || !mpFrequencyData) {
            mpVisualizerFrame = null;
            return;
        }
        mpRenderVisualizerFrame();
        mpVisualizerFrame = requestAnimationFrame(draw);
    };

    mpVisualizerFrame = requestAnimationFrame(draw);
}

function mpStopVisualizer() {
    if (mpVisualizerFrame) {
        cancelAnimationFrame(mpVisualizerFrame);
        mpVisualizerFrame = null;
    }

    mpCanvasState = new Array(MP_BAR_COUNT).fill(0.08);
    for (const w of mpGetWindows()) {
        mpDrawIdle(mpGetCanvas(w.el));
    }
}

function mpSelectAudio() {
    const input = document.getElementById('mp-upload-input');
    if (input) input.click();
}

let mpAudioUrl = null;

function mpLoadAudioFromBlob(blob, titleText = 'Generated Track', artistText = 'AI Generated') {
    const audio = mpGetAudio();
    if (!audio || !blob) return;

    mpSetupAudioAnalyzer(audio);

    for (const w of mpGetWindows()) {
        const title = w.el.querySelector('.mp-title');
        const artist = w.el.querySelector('.mp-artist');
        const times = w.el.querySelector('.mp-times');
        const fill = w.el.querySelector('.mp-bar-fill');

        if (title) title.textContent = titleText;
        if (artist) artist.textContent = artistText;
        if (times) times.innerHTML = '<span>0:00</span><span>--:--</span>';
        if (fill) fill.style.width = '0%';
    }

    // Revoke old URL to prevent memory leak
    if (mpAudioUrl) {
        URL.revokeObjectURL(mpAudioUrl);
    }
    
    mpAudioUrl = URL.createObjectURL(blob);
    audio.src = mpAudioUrl;
    audio.load();

    audio.onloadedmetadata = () => {
        for (const w of mpGetWindows()) {
            const times = w.el.querySelector('.mp-times');
            if (times) times.innerHTML = `<span>0:00</span><span>${formatTime(audio.duration)}</span>`;
        }
    };

    audio.ontimeupdate = () => {
        mpUpdateProgressUI(audio);
    };

    audio.onended = () => {
        mpPlaying = false;
        mpStopVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('.mp-play .material-icons-round');
            if (btn) btn.textContent = 'play_arrow';
        }
    };

    mpPlaying = true;
    if (mpAudioContext && mpAudioContext.state === 'suspended') mpAudioContext.resume();

    audio.play().then(() => {
        mpStartVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('.mp-play .material-icons-round');
            if (btn) btn.textContent = 'pause';
        }
    }).catch(() => {
        mpPlaying = false;
        mpStopVisualizer();
    });
}

function mpDestroyWindow(wid) {
    // If this was the last music player window, we might want to stop the music,
    // but usually in an OS, music continues. However, we MUST stop the visualizer
    // loop if there are no more windows to draw to.
    const remaining = mpGetWindows();
    if (remaining.length === 0) {
        mpStopVisualizer();
        // Also clean up audio context if needed
        if (mpAudioContext) {
            // mpAudioContext.close(); // Optional: keeps audio playing in background
        }
    }
}

function mpHandleUpload(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    mpLoadAudioFromBlob(file, file.name.replace(/\.[^/.]+$/, ''), 'Local File');
}

function mpToggle() {
    const audio = mpGetAudio();
    if (!audio || !audio.src) return;

    mpSetupAudioAnalyzer(audio);
    mpPlaying = !mpPlaying;

    if (mpPlaying) {
        if (mpAudioContext && mpAudioContext.state === 'suspended') mpAudioContext.resume();
        audio.play().then(() => {
            mpStartVisualizer();
            for (const w of mpGetWindows()) {
                const btn = w.el.querySelector('.mp-play .material-icons-round');
                if (btn) btn.textContent = 'pause';
            }
        }).catch(() => {
            mpPlaying = false;
            mpStopVisualizer();
            for (const w of mpGetWindows()) {
                const btn = w.el.querySelector('.mp-play .material-icons-round');
                if (btn) btn.textContent = 'play_arrow';
            }
        });
    } else {
        audio.pause();
        mpStopVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('.mp-play .material-icons-round');
            if (btn) btn.textContent = 'play_arrow';
        }
    }
}

/* ============ VIDEO PLAYER ============ */
let vpVideoUrl = null;

function initVideoPlayer(win, videoPath = '') {
    const video = win.querySelector('#vp-video');
    const playBtn = win.querySelector('#vp-play-btn');
    const muteBtn = win.querySelector('#vp-mute-btn');
    const progressBar = win.querySelector('#vp-progress-bar');
    const timeDisplay = win.querySelector('#vp-time');

    if (videoPath) {
        if (videoPath.startsWith('video:')) {
            video.src = videoPath.split('video:')[1];
        } else {
            video.src = 'Resources/sample.mp4';
        }
    }

    video.addEventListener('timeupdate', () => {
        const percent = (video.currentTime / video.duration) * 100;
        progressBar.style.width = percent + '%';
        timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
    });

    video.addEventListener('ended', () => {
        const icon = playBtn.querySelector('span');
        if (icon) icon.textContent = 'play_arrow';
    });
}

function vpDestroyWindow(wid) {
    const win = document.getElementById(wid);
    if (!win) return;
    const video = win.querySelector('#vp-video');
    if (video) {
        video.pause();
        video.src = '';
        video.load();
    }
    if (vpVideoUrl) {
        URL.revokeObjectURL(vpVideoUrl);
        vpVideoUrl = null;
    }
}

function vpTogglePlay() {
    const video = document.getElementById('vp-video');
    const btn = document.getElementById('vp-play-btn').querySelector('span');
    if (video.paused) {
        video.play();
        btn.textContent = 'pause';
    } else {
        video.pause();
        btn.textContent = 'play_arrow';
    }
}

function vpStop() {
    const video = document.getElementById('vp-video');
    video.pause();
    video.currentTime = 0;
    document.getElementById('vp-play-btn').querySelector('span').textContent = 'play_arrow';
}

function vpToggleMute() {
    const video = document.getElementById('vp-video');
    const btn = document.getElementById('vp-mute-btn').querySelector('span');
    video.muted = !video.muted;
    btn.textContent = video.muted ? 'volume_off' : 'volume_up';
}

function vpFullscreen() {
    const video = document.getElementById('vp-video');
    if (video.requestFullscreen) video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
}

function vpSelectVideo() {
    document.getElementById('vp-upload-input').click();
}

function vpHandleUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const video = document.getElementById('vp-video');
        const playBtn = document.getElementById('vp-play-btn').querySelector('span');

        video.pause();
        
        // Revoke old URL
        if (vpVideoUrl) URL.revokeObjectURL(vpVideoUrl);
        
        vpVideoUrl = URL.createObjectURL(file);
        video.src = vpVideoUrl;
        video.currentTime = 0;
        playBtn.textContent = 'play_arrow';

        video.play().then(() => {
            playBtn.textContent = 'pause';
        }).catch(() => {
            console.log('Auto-play blocked, user must click play.');
        });
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return min + ':' + (sec < 10 ? '0' + sec : sec);
}

function openVideoInPlayer(name, content) {
    openApp('video-player');
    setTimeout(() => {
        for (const [wid, w] of Object.entries(windows)) {
            if (w.appId === 'video-player') {
                initVideoPlayer(w.el, content);
                break;
            }
        }
    }, 100);
}

/* ============ YOUTUBE PLAYER ============ */
function ytLoadVideo(url) {
    if (!url) return;

    let videoId = '';

    if (url.includes('youtube.com/watch?v=')) {
        videoId = new URL(url).searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.length === 11) {
        videoId = url;
    } else {
        showNotification('YouTube', 'Invalid YouTube URL format.');
        return;
    }

    if (videoId) {
        for (const [wid, w] of Object.entries(windows)) {
            if (w.appId === 'youtube') {
                const contentDiv = w.el.querySelector('#yt-content');
                if (contentDiv) {
                    contentDiv.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&origin=http://localhost" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="border-radius: var(--radius-md);"></iframe>`;
                }
                break;
            }
        }
    }
}
