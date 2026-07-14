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

/* ============ MUSIC PLAYER (Redesigned) ============ */
/* ─── State ─── */
let mpPlaying = false;
let mpAudioContext = null;
let mpAnalyser = null;
let mpFrequencyData = null;
let mpSourceNode = null;
let mpVisualizerFrame = null;
let mpCanvasState = [];
let mpAudioUrl = null;
let mpVolume = 0.8;
let mpMuted = false;
let mpShuffle = false;
let mpRepeat = 'off'; // 'off', 'all', 'one'
let mpCurrentTrackIndex = -1;
let mpFilter = 'all';
let mpAudioInitialized = false; // Track if AudioContext source has been created for current audio element

let mpLibrary = [];
let mpQueue = [];

/* ─── Visualiser Configuration (configurable) ─── */
let mpFftSize = 256;        // 64, 128, 256, 512, 1024, 2048
let mpBarCount = 64;        // auto-adjusted: fftSize / 4
const MP_SMOOTHING = 0.75;
const MP_VISUAL_GAIN = 1.8;
const MP_BEAT_HOLD = 6;    // frames to hold beat state
let mpBeatHoldCounter = 0;
let mpBeatDetected = false;
let mpPrevEnergy = 0;
let mpEnergyHistory = [];
const MP_ENERGY_HISTORY = 43; // ~43 frames @60fps ≈ 0.7s window

/* ─── Helpers ─── */
function mpGetWindows() {
    return Object.values(windows).filter(w => w.appId === 'music-player');
}

function mpGetAudio() {
    return document.getElementById('mp-audio');
}

function mpGetCanvas(winEl) {
    return winEl ? winEl.querySelector('.mp-visualizer-canvas') : null;
}

function mpFormatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
}

function mpGetStoredFavorites() {
    try {
        return JSON.parse(localStorage.getItem('mp_favorites') || '[]');
    } catch { return []; }
}

function mpSetStoredFavorites(favs) {
    localStorage.setItem('mp_favorites', JSON.stringify(favs));
}

/* ─── Visualizer (Redesigned) ─── */
let mpIdleAnimFrame = null;
let mpIdleTime = 0;
let mpIdleActive = false;

function mpResizeCanvas(canvas, forceReset) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        if (forceReset || !mpCanvasState.length) {
            mpCanvasState = new Array(mpBarCount).fill(0.08);
        }
    }
}

/* ─── Draw a rounded rectangle ─── */
function mpRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/* ─── Get color for a bar based on frequency index ─── */
function mpGetBarColor(i, total, normalized) {
    // Create a vibrant gradient: indigo → violet → pink → cyan on beat
    const t = i / total;
    const intensity = Math.max(0.4, Math.min(1, normalized * 1.3));
    let r, g, b;
    if (t < 0.25) {
        // Indigo → Purple
        const p = t / 0.25;
        r = 99 + (168 - 99) * p;
        g = 102 + (85 - 102) * p;
        b = 241 + (247 - 241) * p;
    } else if (t < 0.5) {
        // Purple → Pink
        const p = (t - 0.25) / 0.25;
        r = 168 + (236 - 168) * p;
        g = 85 + (72 - 85) * p;
        b = 247 + (153 - 247) * p;
    } else if (t < 0.75) {
        // Pink → Coral/Orange
        const p = (t - 0.5) / 0.25;
        r = 236 + (251 - 236) * p;
        g = 72 + (146 - 72) * p;
        b = 153 + (60 - 153) * p;
    } else {
        // Coral → Cyan
        const p = (t - 0.75) / 0.25;
        r = 251 + (56 - 251) * p;
        g = 146 + (189 - 146) * p;
        b = 60 + (248 - 60) * p;
    }
    return `rgba(${Math.round(r * intensity)}, ${Math.round(g * intensity)}, ${Math.round(b * intensity)}, ${0.8 + normalized * 0.2})`;
}

/* ─── Idle state: animated gentle wave ─── */
function mpDrawIdle(canvas) {
    if (!canvas) return;
    if (mpPlaying) return; // Don't draw idle if actively playing
    mpResizeCanvas(canvas, true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    function drawWave() {
        if (!canvas || !canvas.isConnected || mpPlaying) {
            mpIdleActive = false;
            mpIdleAnimFrame = null;
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        
        ctx.clearRect(0, 0, w, h);
        mpIdleTime += 0.025;
        
        const gap = Math.max(2, Math.floor(w * 0.007));
        const totalGap = gap * (mpBarCount - 1);
        const barWidth = Math.max(2, Math.floor((w - totalGap) / mpBarCount));
        const totalBarsWidth = barWidth * mpBarCount + totalGap;
        let x = Math.floor((w - totalBarsWidth) / 2);
        const baseH = Math.floor(h * 0.25);
        
        for (let i = 0; i < mpBarCount; i++) {
            const t = i / mpBarCount;
            // Gentle sine wave that moves over time
            const wave = Math.sin(t * Math.PI * 4 + mpIdleTime * 3) * 0.3 + 
                         Math.sin(t * Math.PI * 2 - mpIdleTime * 2) * 0.2 +
                         0.35;
            const barHeight = Math.max(2, Math.floor(wave * baseH));
            const y = h - barHeight;
            
            const color = mpGetBarColor(i, mpBarCount, wave * 0.5);
            ctx.fillStyle = color;
            
            // Rounded bars
            const radius = Math.min(3, barWidth * 0.35);
            mpRoundRect(ctx, x, y, barWidth, barHeight, radius);
            ctx.fill();
            
            // Subtle glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            x += barWidth + gap;
        }
        
        mpIdleAnimFrame = requestAnimationFrame(drawWave);
    }
    
    // Stop any existing idle loop first
    if (mpIdleAnimFrame) {
        cancelAnimationFrame(mpIdleAnimFrame);
        mpIdleAnimFrame = null;
    }
    mpIdleActive = true;
    mpIdleTime = 0;
    drawWave();
}

function mpStopIdle() {
    mpIdleActive = false;
    if (mpIdleAnimFrame) { 
        cancelAnimationFrame(mpIdleAnimFrame); 
        mpIdleAnimFrame = null; 
    }
}

/* ─── Audio Analyzer Setup ─── */
function mpSetupAudioAnalyzer(audio) {
    if (!audio) return;
    if (!mpAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        mpAudioContext = new AudioCtx();
    }
    // If AudioContext was suspended (browser autoplay policy), resume it
    if (mpAudioContext.state === 'suspended') {
        mpAudioContext.resume();
    }
    // createMediaElementSource can only be called ONCE per audio element's lifetime.
    // If we already created it, just reuse the existing connections.
    if (mpAudioInitialized) {
        // Update FFT size if it changed
        if (mpAnalyser) {
            mpAnalyser.fftSize = mpFftSize;
            mpFrequencyData = new Uint8Array(mpAnalyser.frequencyBinCount);
            mpBarCount = Math.max(8, Math.floor(mpFftSize / 4));
            mpCanvasState = new Array(mpBarCount).fill(0.08);
        }
        return;
    }
    
    try {
        mpSourceNode = mpAudioContext.createMediaElementSource(audio);
        mpAnalyser = mpAudioContext.createAnalyser();
        mpAnalyser.fftSize = mpFftSize;
        mpAnalyser.smoothingTimeConstant = MP_SMOOTHING;
        mpSourceNode.connect(mpAnalyser);
        mpAnalyser.connect(mpAudioContext.destination);
        mpFrequencyData = new Uint8Array(mpAnalyser.frequencyBinCount);
        mpBarCount = Math.max(8, Math.floor(mpFftSize / 4));
        mpCanvasState = new Array(mpBarCount).fill(0.08);
        mpAudioInitialized = true;
    } catch (e) {
        console.warn('Audio analyzer setup failed:', e);
        mpAudioInitialized = false;
    }
}

/* ─── Beat Detection ─── */
function mpDetectBeat(energy) {
    // Keep energy history
    mpEnergyHistory.push(energy);
    if (mpEnergyHistory.length > MP_ENERGY_HISTORY) {
        mpEnergyHistory.shift();
    }
    
    // Calculate average energy over history window
    const avg = mpEnergyHistory.reduce((a, b) => a + b, 0) / mpEnergyHistory.length;
    
    // Beat threshold: energy must be significantly above average
    const threshold = avg * 1.3 + 0.05;
    
    if (energy > threshold && energy > 0.15) {
        if (!mpBeatDetected) {
            mpBeatDetected = true;
            mpBeatHoldCounter = MP_BEAT_HOLD;
        }
    }
    
    // Hold beat state for a few frames
    if (mpBeatHoldCounter > 0) {
        mpBeatHoldCounter--;
        if (mpBeatHoldCounter === 0) {
            mpBeatDetected = false;
        }
    }
    
    mpPrevEnergy = energy;
}

/* ─── Visualizer Rendering ─── */
function mpRenderVisualizerFrame() {
    if (!mpAnalyser || !mpFrequencyData) return;
    mpAnalyser.getByteFrequencyData(mpFrequencyData);
    
    // Calculate overall energy for beat detection
    let totalEnergy = 0;
    for (let i = 0; i < mpFrequencyData.length; i++) {
        totalEnergy += mpFrequencyData[i] / 255;
    }
    totalEnergy /= mpFrequencyData.length;
    mpDetectBeat(totalEnergy);
    
    for (const w of mpGetWindows()) {
        const canvas = mpGetCanvas(w.el);
        if (!canvas) continue;
        mpResizeCanvas(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const width = canvas.width, height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        
        const gap = Math.max(2, Math.floor(width * 0.007));
        const totalGap = gap * (mpBarCount - 1);
        const barWidth = Math.max(2, Math.floor((width - totalGap) / mpBarCount));
        const totalBarsWidth = barWidth * mpBarCount + totalGap;
        let x = Math.floor((width - totalBarsWidth) / 2);
        if (!mpCanvasState.length || mpCanvasState.length !== mpBarCount) mpCanvasState = new Array(mpBarCount).fill(0.08);
        
        // Beat flash: extra glow intensity
        const beatGlow = mpBeatDetected ? 1.6 : 1.0;
        
        for (let i = 0; i < mpBarCount; i++) {
            const freqIndex = Math.floor((i / mpBarCount) * mpFrequencyData.length);
            const raw = (mpFrequencyData[freqIndex] || 0) / 255;
            const boosted = Math.min(1, raw * MP_VISUAL_GAIN);
            const prev = mpCanvasState[i] || 0.08;
            
            // Faster attack on beat, smoother release
            let next;
            if (mpBeatDetected) {
                next = boosted > prev ? prev + (boosted - prev) * 0.75 : prev * 0.78 + boosted * 0.22;
            } else {
                next = boosted > prev ? prev + (boosted - prev) * 0.55 : prev * 0.88 + boosted * 0.12;
            }
            mpCanvasState[i] = next;
            const normalized = Math.pow(next, 0.65);
            const barHeight = Math.max(2, Math.floor(normalized * height * 0.92));
            const y = height - barHeight;
            
            // Dynamic color based on frequency position
            const color = mpGetBarColor(i, mpBarCount, normalized);
            
            // Use fillRect for sharp, clean bars (modern pro look)
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Glow effect - stronger on beat
            ctx.shadowColor = color;
            ctx.shadowBlur = Math.max(4, Math.floor(normalized * 18 * beatGlow));
            ctx.fillRect(x, y, barWidth, barHeight);
            ctx.shadowBlur = 0;
            
            // Bright top highlight for depth
            if (barHeight > 4) {
                const hlHeight = Math.max(2, Math.floor(barHeight * 0.3));
                const grad = ctx.createLinearGradient(0, y, 0, y + hlHeight);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, barWidth, hlHeight);
            }
            
            x += barWidth + gap;
        }
    }
}

function mpStartVisualizer() {
    if (!mpAnalyser || mpVisualizerFrame) return;
    // Stop idle animation when starting live visualizer
    mpStopIdle();
    const draw = () => {
        if (!mpAnalyser || !mpFrequencyData) { mpVisualizerFrame = null; return; }
        mpRenderVisualizerFrame();
        mpVisualizerFrame = requestAnimationFrame(draw);
    };
    mpVisualizerFrame = requestAnimationFrame(draw);
}

function mpStopVisualizer() {
    if (mpVisualizerFrame) { cancelAnimationFrame(mpVisualizerFrame); mpVisualizerFrame = null; }
    mpCanvasState = new Array(mpBarCount).fill(0.08);
    for (const w of mpGetWindows()) mpDrawIdle(mpGetCanvas(w.el));
}

/* ─── FFT Size Control ─── */
function mpSetFftSize(newSize) {
    const validSizes = [64, 128, 256, 512, 1024, 2048];
    if (!validSizes.includes(newSize)) return;
    
    mpFftSize = newSize;
    mpBarCount = Math.max(8, Math.floor(mpFftSize / 4));
    mpCanvasState = new Array(mpBarCount).fill(0.08);
    
    // Update analyzer if already initialized
    if (mpAnalyser) {
        mpAnalyser.fftSize = mpFftSize;
        mpFrequencyData = new Uint8Array(mpAnalyser.frequencyBinCount);
    }
    
    // Update UI selector
    for (const w of mpGetWindows()) {
        const select = w.el.querySelector('#mp-fft-select');
        if (select) select.value = String(newSize);
    }
    
    // Save preference
    try {
        localStorage.setItem('mp_fft_size', String(newSize));
    } catch (e) {}
}

function mpLoadFftPreference() {
    try {
        const saved = localStorage.getItem('mp_fft_size');
        if (saved) {
            const val = parseInt(saved, 10);
            if ([64, 128, 256, 512, 1024, 2048].includes(val)) {
                mpFftSize = val;
                mpBarCount = Math.max(8, Math.floor(mpFftSize / 4));
            }
        }
    } catch (e) {}
}

/* ─── Progress / Seek ─── */
function mpUpdateProgressUI(audio) {
    const percent = (audio.currentTime / (audio.duration || 1)) * 100;
    for (const w of mpGetWindows()) {
        const fill = w.el.querySelector('#mp-bar-fill');
        const thumb = w.el.querySelector('#mp-bar-thumb');
        const curr = w.el.querySelector('#mp-current-time');
        const dur = w.el.querySelector('#mp-duration');
        if (fill) fill.style.width = percent + '%';
        if (thumb) thumb.style.left = percent + '%';
        if (curr) curr.textContent = mpFormatTime(audio.currentTime);
        if (dur) dur.textContent = mpFormatTime(audio.duration);
    }
}

function mpSeekToFraction(fraction) {
    const audio = mpGetAudio();
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
    mpUpdateProgressUI(audio);
}

function mpBindSeekBar(winEl) {
    const bar = winEl.querySelector('#mp-bar');
    if (!bar || bar.dataset.seekBound === '1') return;
    bar.dataset.seekBound = '1';
    const stopDrag = () => { bar.dataset.dragging = '0'; };
    bar.addEventListener('pointerdown', (e) => {
        bar.dataset.dragging = '1';
        if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
        const rect = bar.getBoundingClientRect();
        if (rect.width) mpSeekToFraction((e.clientX - rect.left) / rect.width);
    });
    bar.addEventListener('pointermove', (e) => {
        if (bar.dataset.dragging === '1') {
            const rect = bar.getBoundingClientRect();
            if (rect.width) mpSeekToFraction((e.clientX - rect.left) / rect.width);
        }
    });
    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);
    bar.addEventListener('lostpointercapture', stopDrag);
}

function mpBindVolumeBar(winEl) {
    const bar = winEl.querySelector('#mp-volume-bar');
    if (!bar || bar.dataset.volBound === '1') return;
    bar.dataset.volBound = '1';
    const stopDrag = () => { bar.dataset.dragging = '0'; };
    const setVol = (clientX) => {
        const rect = bar.getBoundingClientRect();
        if (!rect.width) return;
        const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        mpVolume = frac;
        const audio = mpGetAudio();
        if (audio) audio.volume = mpMuted ? 0 : mpVolume;
        const fill = bar.querySelector('#mp-volume-fill');
        const thumb = bar.querySelector('.mp-volume-thumb');
        if (fill) fill.style.width = (mpVolume * 100) + '%';
        if (thumb) thumb.style.left = (mpVolume * 100) + '%';
    };
    bar.addEventListener('pointerdown', (e) => {
        bar.dataset.dragging = '1';
        if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
        setVol(e.clientX);
    });
    bar.addEventListener('pointermove', (e) => {
        if (bar.dataset.dragging === '1') setVol(e.clientX);
    });
    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);
    bar.addEventListener('lostpointercapture', stopDrag);
}

/* ─── Library / Queue Management ─── */
function mpImportFiles() {
    document.getElementById('mp-upload-input').click();
}

function mpImportFolder() {
    document.getElementById('mp-folder-input').click();
}

function mpHandleFilesUpload(input) {
    if (!input.files || !input.files.length) return;
    const newSongs = [];
    for (const file of input.files) {
        if (!file.type.startsWith('audio/')) continue;
        newSongs.push({
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            duration: 0,
            blob: file,
            url: URL.createObjectURL(file),
            addedAt: Date.now()
        });
    }
    mpLibrary = mpLibrary.concat(newSongs);
    mpSaveLibrary();
    mpRenderLibrary();
    mpUpdateStats();
    input.value = '';
}

function mpSaveLibrary() {
    try {
        const serializable = mpLibrary.map(s => ({
            id: s.id, name: s.name, artist: s.artist,
            duration: s.duration, addedAt: s.addedAt
        }));
        localStorage.setItem('mp_library_meta', JSON.stringify(serializable));
    } catch (e) {}
}

function mpLoadLibrary() {
    try {
        const meta = JSON.parse(localStorage.getItem('mp_library_meta') || '[]');
        if (!meta.length) {
            mpLibrary = [];
            localStorage.removeItem('mp_library_meta');
            mpRenderLibrary();
            mpUpdateStats();
            return;
        }
        // Audio blobs (URL.createObjectURL) do NOT survive page reloads.
        // Without actual blob data, songs can't be played.
        // Clear the stored metadata so the library doesn't show unplayable songs.
        localStorage.removeItem('mp_library_meta');
        mpLibrary = [];
        mpRenderLibrary();
        mpUpdateStats();
        // Show a notification to inform the user
        if (typeof showNotification === 'function') {
            showNotification('Music Player', 'Previously imported songs are no longer available after page reload. Please re-import your music files.');
        }
    } catch (e) {}
}

function mpGetFilteredSongs() {
    let songs = mpLibrary;
    if (mpFilter === 'favorites') {
        const favs = mpGetStoredFavorites();
        songs = songs.filter(s => favs.includes(s.id));
    } else if (mpFilter === 'recent') {
        songs = [...songs].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
    return songs;
}

function mpPlaySong(libIndex) {
    const songs = mpGetFilteredSongs();
    if (libIndex < 0 || libIndex >= songs.length) return;
    const song = songs[libIndex];
    // Find actual index in mpLibrary
    const actualIndex = mpLibrary.findIndex(s => s.id === song.id);
    if (actualIndex === -1) return;

    mpCurrentTrackIndex = actualIndex;

    // Build queue from current filter starting at this song
    mpQueue = [];
    const filtered = mpGetFilteredSongs();
    let startIdx = filtered.findIndex(s => s.id === song.id);
    if (startIdx === -1) startIdx = 0;
    for (let i = startIdx; i < filtered.length; i++) {
        const si = mpLibrary.findIndex(s => s.id === filtered[i].id);
        if (si !== -1) mpQueue.push(si);
    }

    mpPlayCurrent();
}

function mpPlayCurrent() {
    if (mpCurrentTrackIndex < 0 || mpCurrentTrackIndex >= mpLibrary.length) return;
    const song = mpLibrary[mpCurrentTrackIndex];
    if (!song || !song.blob && !song.url) {
        // Song data is missing (e.g., after page reload where blobs were cleared)
        if (typeof showNotification === 'function') {
            showNotification('Music Player', `Cannot play "${song ? song.name : 'unknown'}": audio file is no longer available. Please re-import.`, 'error');
        }
        mpPlaying = false;
        mpCurrentTrackIndex = -1;
        return;
    }

    const audio = mpGetAudio();
    if (!audio) return;

    // Setup audio analyzer (only creates MediaElementSource once per audio element)
    mpSetupAudioAnalyzer(audio);

    // Update player info
    for (const w of mpGetWindows()) {
        const title = w.el.querySelector('#mp-title');
        const artist = w.el.querySelector('#mp-artist');
        const artworkIcon = w.el.querySelector('#mp-artwork .material-icons-round');
        if (title) title.textContent = song.name;
        if (artist) artist.textContent = song.artist;
        if (artworkIcon) artworkIcon.textContent = 'music_note';
    }

    // Update favorite button
    mpUpdateFavBtn();

    // Revoke old URL
    if (mpAudioUrl) { URL.revokeObjectURL(mpAudioUrl); mpAudioUrl = null; }

    if (song.blob) {
        mpAudioUrl = URL.createObjectURL(song.blob);
        audio.src = mpAudioUrl;
    } else if (song.url) {
        audio.src = song.url;
    }
    audio.load();

    audio.onloadedmetadata = () => {
        song.duration = audio.duration;
        mpUpdateProgressUI(audio);
        mpSaveLibrary();
        mpRenderLibrary();
    };

    audio.ontimeupdate = () => {
        mpUpdateProgressUI(audio);
    };

    audio.onended = () => {
        mpPlaying = false;
        if (mpRepeat === 'one') {
            mpPlayCurrent();
            return;
        }
        mpNext();
    };

    mpPlaying = true;
    if (mpAudioContext && mpAudioContext.state === 'suspended') mpAudioContext.resume();
    audio.volume = mpMuted ? 0 : mpVolume;

    audio.play().then(() => {
        mpStartVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('#mp-play-btn .material-icons-round');
            if (btn) btn.textContent = 'pause';
        }
        mpRenderQueue();
    }).catch(() => {
        mpPlaying = false;
        mpStopVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('#mp-play-btn .material-icons-round');
            if (btn) btn.textContent = 'play_arrow';
        }
    });
    mpRenderLibrary();
    mpRenderQueue();
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
                const btn = w.el.querySelector('#mp-play-btn .material-icons-round');
                if (btn) btn.textContent = 'pause';
            }
        }).catch(() => {
            mpPlaying = false;
            mpStopVisualizer();
            for (const w of mpGetWindows()) {
                const btn = w.el.querySelector('#mp-play-btn .material-icons-round');
                if (btn) btn.textContent = 'play_arrow';
            }
        });
    } else {
        audio.pause();
        mpStopVisualizer();
        for (const w of mpGetWindows()) {
            const btn = w.el.querySelector('#mp-play-btn .material-icons-round');
            if (btn) btn.textContent = 'play_arrow';
        }
    }
}

function mpNext() {
    if (!mpQueue.length) return;
    const currentInQueue = mpQueue.indexOf(mpCurrentTrackIndex);
    let nextIdx;
    if (mpShuffle) {
        const remaining = mpQueue.filter(i => i !== mpCurrentTrackIndex);
        if (remaining.length) {
            nextIdx = remaining[Math.floor(Math.random() * remaining.length)];
        } else if (mpRepeat === 'all') {
            nextIdx = mpQueue[0];
        } else {
            return;
        }
    } else {
        const pos = currentInQueue + 1;
        if (pos >= mpQueue.length) {
            if (mpRepeat === 'all') {
                nextIdx = mpQueue[0];
            } else {
                return;
            }
        } else {
            nextIdx = mpQueue[pos];
        }
    }
    mpCurrentTrackIndex = nextIdx;
    mpPlayCurrent();
}

function mpPrev() {
    const audio = mpGetAudio();
    if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    if (!mpQueue.length) return;
    const currentInQueue = mpQueue.indexOf(mpCurrentTrackIndex);
    let prevIdx;
    if (mpShuffle) {
        const others = mpQueue.filter(i => i !== mpCurrentTrackIndex);
        if (others.length) {
            prevIdx = others[Math.floor(Math.random() * others.length)];
        } else {
            prevIdx = mpCurrentTrackIndex;
        }
    } else {
        const pos = currentInQueue - 1;
        if (pos < 0) {
            if (mpRepeat === 'all') {
                prevIdx = mpQueue[mpQueue.length - 1];
            } else {
                return;
            }
        } else {
            prevIdx = mpQueue[pos];
        }
    }
    mpCurrentTrackIndex = prevIdx;
    mpPlayCurrent();
}

function mpClearQueue() {
    mpQueue = [];
    mpRenderQueue();
}

function mpToggleShuffle() {
    mpShuffle = !mpShuffle;
    for (const w of mpGetWindows()) {
        const btn = w.el.querySelector('#mp-shuffle-btn');
        if (btn) btn.classList.toggle('active', mpShuffle);
    }
}

function mpToggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const idx = modes.indexOf(mpRepeat);
    mpRepeat = modes[(idx + 1) % modes.length];
    for (const w of mpGetWindows()) {
        const btn = w.el.querySelector('#mp-repeat-btn');
        if (btn) {
            btn.classList.toggle('active', mpRepeat !== 'off');
            const icon = btn.querySelector('.material-icons-round');
            if (icon) icon.textContent = mpRepeat === 'one' ? 'repeat_one' : 'repeat';
        }
    }
}

function mpToggleMute() {
    mpMuted = !mpMuted;
    const audio = mpGetAudio();
    if (audio) audio.volume = mpMuted ? 0 : mpVolume;
    for (const w of mpGetWindows()) {
        const btn = w.el.querySelector('#mp-mute-btn .material-icons-round');
        if (btn) btn.textContent = mpMuted ? 'volume_off' : (mpVolume > 0.5 ? 'volume_up' : (mpVolume > 0 ? 'volume_down' : 'volume_mute'));
    }
}

function mpToggleFavorite() {
    if (mpCurrentTrackIndex < 0) return;
    const song = mpLibrary[mpCurrentTrackIndex];
    if (!song) return;
    const favs = mpGetStoredFavorites();
    const idx = favs.indexOf(song.id);
    if (idx === -1) {
        favs.push(song.id);
    } else {
        favs.splice(idx, 1);
    }
    mpSetStoredFavorites(favs);
    mpUpdateFavBtn();
    mpRenderLibrary();
    mpUpdateStats();
}

function mpUpdateFavBtn() {
    if (mpCurrentTrackIndex < 0) return;
    const song = mpLibrary[mpCurrentTrackIndex];
    if (!song) return;
    const favs = mpGetStoredFavorites();
    const isFav = favs.includes(song.id);
    for (const w of mpGetWindows()) {
        const btn = w.el.querySelector('#mp-fav-btn');
        const icon = btn ? btn.querySelector('.material-icons-round') : null;
        if (btn) btn.classList.toggle('active', isFav);
        if (icon) icon.textContent = isFav ? 'favorite' : 'favorite_border';
    }
}

function mpSetFilter(filter) {
    mpFilter = filter;
    for (const w of mpGetWindows()) {
        w.el.querySelectorAll('.mp-playlist-item').forEach(el => el.classList.remove('active'));
        const items = w.el.querySelectorAll('.mp-playlist-item');
        const filters = ['all', 'favorites', 'recent'];
        const idx = filters.indexOf(filter);
        if (idx !== -1 && items[idx]) items[idx].classList.add('active');
    }
    mpRenderLibrary();
    mpUpdateStats();
}

/* ─── Rendering ─── */
function mpRenderLibrary() {
    const songs = mpGetFilteredSongs();
    const favs = mpGetStoredFavorites();
    for (const w of mpGetWindows()) {
        const list = w.el.querySelector('#mp-library-list');
        if (!list) continue;
        if (!songs.length) {
            list.innerHTML = `<div class="mp-library-empty">
                <span class="material-icons-round">album</span>
                <p>${mpFilter === 'favorites' ? 'No favorites yet.' : mpFilter === 'recent' ? 'No recently added songs.' : 'No songs yet. Import some music!'}</p>
            </div>`;
            continue;
        }
        list.innerHTML = songs.map((song, idx) => {
            const inLib = mpLibrary.findIndex(s => s.id === song.id);
            const isActive = inLib === mpCurrentTrackIndex;
            const isFav = favs.includes(song.id);
            return `<div class="mp-library-item ${isActive ? 'active' : ''}" onclick="mpPlaySong(${idx})" data-id="${song.id}">
                <div class="mp-li-icon"><span class="material-icons-round">${isActive ? 'equalizer' : 'music_note'}</span></div>
                <div class="mp-li-info">
                    <div class="mp-li-title">${song.name}</div>
                    <div class="mp-li-artist">${song.artist}</div>
                </div>
                <div class="mp-li-duration">${mpFormatTime(song.duration)}</div>
                <button class="mp-li-fav ${isFav ? 'favorited' : ''}" onclick="event.stopPropagation(); mpToggleFavFromLib('${song.id}')">
                    <span class="material-icons-round">${isFav ? 'favorite' : 'favorite_border'}</span>
                </button>
            </div>`;
        }).join('');
    }
}

function mpToggleFavFromLib(songId) {
    const favs = mpGetStoredFavorites();
    const idx = favs.indexOf(songId);
    if (idx === -1) favs.push(songId);
    else favs.splice(idx, 1);
    mpSetStoredFavorites(favs);
    if (mpCurrentTrackIndex >= 0 && mpLibrary[mpCurrentTrackIndex] && mpLibrary[mpCurrentTrackIndex].id === songId) {
        mpUpdateFavBtn();
    }
    mpRenderLibrary();
    mpUpdateStats();
}

function mpRenderQueue() {
    for (const w of mpGetWindows()) {
        const list = w.el.querySelector('#mp-queue-list');
        if (!list) continue;
        if (!mpQueue.length) {
            list.innerHTML = `<div class="mp-queue-empty">
                <span class="material-icons-round">music_note</span>
                <p>Queue is empty. Select a song to play.</p>
            </div>`;
            continue;
        }
        list.innerHTML = mpQueue.map((libIdx, qi) => {
            const song = mpLibrary[libIdx];
            if (!song) return '';
            const isPlaying = libIdx === mpCurrentTrackIndex;
            return `<div class="mp-queue-item ${isPlaying ? 'playing' : ''}" onclick="${isPlaying ? '' : 'mpPlayByQueueIndex(' + qi + ')'}">
                <div class="mp-qi-index">${isPlaying ? '<span class="material-icons-round" style="font-size:16px;color:var(--accent)">equalizer</span>' : (qi + 1)}</div>
                <div class="mp-qi-info">
                    <div class="mp-qi-title">${song.name}</div>
                    <div class="mp-qi-artist">${song.artist}</div>
                </div>
                <div class="mp-qi-duration">${mpFormatTime(song.duration)}</div>
                <button class="mp-qi-remove" onclick="event.stopPropagation(); mpRemoveFromQueue(${qi})">
                    <span class="material-icons-round">close</span>
                </button>
            </div>`;
        }).join('');
    }
}

function mpPlayByQueueIndex(qi) {
    if (qi < 0 || qi >= mpQueue.length) return;
    mpCurrentTrackIndex = mpQueue[qi];
    mpPlayCurrent();
}

function mpRemoveFromQueue(qi) {
    if (qi < 0 || qi >= mpQueue.length) return;
    mpQueue.splice(qi, 1);
    mpRenderQueue();
}

function mpUpdateStats() {
    const total = mpLibrary.length;
    const favs = mpGetStoredFavorites();
    const favCount = mpLibrary.filter(s => favs.includes(s.id)).length;
    const recentCount = mpLibrary.length;
    for (const w of mpGetWindows()) {
        const stats = w.el.querySelector('#mp-library-stats');
        const allCount = w.el.querySelector('#mp-count-all');
        const favCountEl = w.el.querySelector('#mp-count-favorites');
        const recentCountEl = w.el.querySelector('#mp-count-recent');
        if (stats) stats.textContent = total + ' song' + (total !== 1 ? 's' : '');
        if (allCount) allCount.textContent = total;
        if (favCountEl) favCountEl.textContent = favCount;
        if (recentCountEl) recentCountEl.textContent = recentCount;
    }
}

/* ─── Init / Destroy ─── */
function mpInitWindow(win) {
    if (!win) return;
    mpBindSeekBar(win);
    mpBindVolumeBar(win);
    mpDrawIdle(mpGetCanvas(win));

    // Set volume UI
    const volFill = win.querySelector('#mp-volume-fill');
    const volThumb = win.querySelector('.mp-volume-thumb');
    if (volFill) volFill.style.width = (mpVolume * 100) + '%';
    if (volThumb) volThumb.style.left = (mpVolume * 100) + '%';

    // Load FFT preference
    mpLoadFftPreference();

    // Set FFT selector value
    const fftSelect = win.querySelector('#mp-fft-select');
    if (fftSelect) fftSelect.value = String(mpFftSize);

    // Load library
    mpLoadLibrary();
    mpRenderLibrary();
    mpRenderQueue();
    mpUpdateStats();
    mpSetFilter(mpFilter);
    mpUpdateFavBtn();

    // Set shuffle/repeat state
    const shuffleBtn = win.querySelector('#mp-shuffle-btn');
    const repeatBtn = win.querySelector('#mp-repeat-btn');
    if (shuffleBtn) shuffleBtn.classList.toggle('active', mpShuffle);
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', mpRepeat !== 'off');
        const icon = repeatBtn.querySelector('.material-icons-round');
        if (icon) icon.textContent = mpRepeat === 'one' ? 'repeat_one' : 'repeat';
    }

    // Check if currently playing and update UI
    if (mpPlaying && mpCurrentTrackIndex >= 0) {
        const btn = win.querySelector('#mp-play-btn .material-icons-round');
        if (btn) btn.textContent = 'pause';
    }
}

function mpDestroyWindow(wid) {
    const remaining = mpGetWindows();
    if (remaining.length === 0) {
        mpStopVisualizer();
        // Clean up AudioContext when last window closes
        if (mpAudioContext) {
            mpAudioContext.close().catch(() => {});
            mpAudioContext = null;
            mpSourceNode = null;
            mpAnalyser = null;
            mpFrequencyData = null;
            mpAudioInitialized = false;
        }
    }
}

/* ─── External API (used by Chat AI for generated music) ─── */
function mpLoadAudioFromBlob(blob, titleText, artistText) {
    const audio = mpGetAudio();
    if (!audio || !blob) return;

    // Add to library
    const song = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: titleText || 'Generated Track',
        artist: artistText || 'AI Generated',
        duration: 0,
        blob: blob,
        url: null,
        addedAt: Date.now()
    };
    mpLibrary.push(song);
    mpSaveLibrary();

    // Build queue and play
    mpQueue = [mpLibrary.length - 1];
    mpCurrentTrackIndex = mpLibrary.length - 1;
    mpPlayCurrent();
    mpRenderLibrary();
    mpUpdateStats();
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