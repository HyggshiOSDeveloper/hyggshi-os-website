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
let mpProgress = 0;
let mpInterval = null;

function mpToggle() {
    mpPlaying = !mpPlaying;
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'music-player') {
            const btn = w.el.querySelector('.mp-play .material-icons-round');
            btn.textContent = mpPlaying ? 'pause' : 'play_arrow';

            if (mpPlaying) {
                mpInterval = setInterval(() => {
                    mpProgress = (mpProgress + 0.5) % 100;
                    const fill = w.el.querySelector('.mp-bar-fill');
                    if (fill) fill.style.width = mpProgress + '%';
                }, 200);
            } else {
                clearInterval(mpInterval);
            }
            break;
        }
    }
}

/* ============ VIDEO PLAYER ============ */
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
        playBtn.querySelector('span').textContent = 'play_arrow';
    });
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
        const url = URL.createObjectURL(file);
        video.src = url;
        video.currentTime = 0;
        playBtn.textContent = 'play_arrow';

        video.play().then(() => {
            playBtn.textContent = 'pause';
        }).catch(err => {
            console.log("Auto-play blocked, user must click play.");
        });
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return min + ":" + (sec < 10 ? "0" + sec : sec);
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
