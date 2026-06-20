/* ============ Camera App ============ */
let cameraStream = null;
let cameraActive = false;
let cameraDeviceId = null;
let cameraFacingMode = 'user';
let cameraTorch = false;
let cameraMirror = false;
let cameraCaptures = [];
let cameraLastCapture = null;
let cameraCurrentQuality = '1280x720';

/* ─── Initialize ─── */
function initCamera(win) {
    const startBtn = win.querySelector('#camera-start-btn');
    const stopBtn = win.querySelector('#camera-stop-btn');
    const captureBtn = win.querySelector('#camera-capture-btn');
    const video = win.querySelector('#camera-video');
    const placeholder = win.querySelector('#camera-placeholder');
    const statusEl = win.querySelector('#camera-status');
    const switchBtn = win.querySelector('#camera-switch-btn');
    const torchBtn = win.querySelector('#camera-torch-btn');
    const mirrorBtn = win.querySelector('#camera-mirror-btn');
    const qualitySelect = win.querySelector('#camera-quality-select');
    const focusOverlay = win.querySelector('#camera-overlay-focus');
    const gallery = win.querySelector('#camera-gallery');
    const galleryGrid = win.querySelector('#camera-gallery-grid');
    const toast = win.querySelector('#camera-toast');

    // Store references on the win element for cleanup
    win._camera = {
        video, placeholder, statusEl, startBtn, stopBtn, captureBtn,
        switchBtn, torchBtn, mirrorBtn, qualitySelect, focusOverlay,
        gallery, galleryGrid, toast
    };

    // Show placeholder
    placeholder.style.display = 'flex';
    video.classList.remove('active');
    statusEl.textContent = 'Ready';
    captureBtn.disabled = true;
}

/* ─── Start Camera ─── */
function cameraStart() {
    const win = findCameraWindow();
    if (!win) return;
    const { video, placeholder, statusEl, startBtn, stopBtn, captureBtn, qualitySelect } = win._camera;

    const constraints = {
        video: {
            facingMode: cameraFacingMode,
            width: { ideal: parseInt(cameraCurrentQuality.split('x')[0]) },
            height: { ideal: parseInt(cameraCurrentQuality.split('x')[1]) }
        },
        audio: false
    };

    if (cameraDeviceId) {
        constraints.video.deviceId = { exact: cameraDeviceId };
    }

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            cameraStream = stream;
            cameraActive = true;
            video.srcObject = stream;
            video.classList.add('active');

            if (cameraMirror) video.classList.add('mirror');
            else video.classList.remove('mirror');

            placeholder.style.display = 'none';
            statusEl.textContent = 'Camera active';
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            captureBtn.disabled = false;

            // Try to detect torch capability
            const track = stream.getVideoTracks()[0];
            if (track && track.getCapabilities) {
                const caps = track.getCapabilities();
                if (caps.torch) {
                    win._camera.torchBtn.style.display = 'flex';
                } else {
                    win._camera.torchBtn.style.display = 'none';
                }
            }
        })
        .catch(err => {
            console.error('Camera error:', err);
            statusEl.textContent = 'Error: ' + (err.message || 'Could not access camera');
            showCameraToast(win, 'Failed to access camera: ' + (err.message || 'Permission denied'));
        });
}

/* ─── Stop Camera ─── */
function cameraStop() {
    const win = findCameraWindow();
    if (!win) return;
    const { video, placeholder, statusEl, startBtn, stopBtn, captureBtn, torchBtn } = win._camera;

    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    cameraActive = false;
    cameraTorch = false;
    torchBtn.classList.remove('active');
    torchBtn.innerHTML = '<span class="material-icons-round">flash_on</span>';

    video.srcObject = null;
    video.classList.remove('active');
    placeholder.style.display = 'flex';
    statusEl.textContent = 'Stopped';
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    captureBtn.disabled = true;
}

/* ─── Capture Photo ─── */
function cameraCapture() {
    const win = findCameraWindow();
    if (!win || !cameraActive || !cameraStream) return;
    const { video, statusEl, focusOverlay, toast } = win._camera;

    // Focus animation
    focusOverlay.classList.remove('show');
    void focusOverlay.offsetWidth;
    focusOverlay.classList.add('show');
    setTimeout(() => focusOverlay.classList.remove('show'), 700);

    // Capture from video
    const canvas = document.createElement('canvas');
    const track = cameraStream.getVideoTracks()[0];
    const settings = track.getSettings();
    canvas.width = settings.width || parseInt(cameraCurrentQuality.split('x')[0]) || 1280;
    canvas.height = settings.height || parseInt(cameraCurrentQuality.split('x')[1]) || 720;

    const ctx = canvas.getContext('2d');
    if (cameraMirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    cameraLastCapture = dataUrl;
    cameraCaptures.push(dataUrl);

    statusEl.textContent = 'Photo captured!';
    showCameraToast(win, 'Photo captured (' + canvas.width + '×' + canvas.height + ')');

    // Update gallery if open
    const galleryGrid = win._camera.galleryGrid;
    if (!win._camera.gallery.classList.contains('hidden')) {
        cameraRenderGallery(galleryGrid);
    }
}

/* ─── Save Last Capture ─── */
function cameraSaveLastCapture() {
    const win = findCameraWindow();
    if (!win || !cameraLastCapture) {
        showCameraToast(win, 'No photo to save');
        return;
    }

    const link = document.createElement('a');
    link.download = 'capture-' + Date.now() + '.jpg';
    link.href = cameraLastCapture;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showCameraToast(win, 'Photo saved');
}

/* ─── Switch Camera ─── */
function cameraSwitchCamera() {
    const win = findCameraWindow();
    if (!win) return;

    // Toggle between user/environment
    cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    cameraDeviceId = null;

    if (cameraActive) {
        // Restart with new facing mode
        cameraStop();
        setTimeout(() => cameraStart(), 200);
    }

    showCameraToast(win, 'Switched to ' + (cameraFacingMode === 'user' ? 'front' : 'back') + ' camera');
}

/* ─── Toggle Torch ─── */
function cameraToggleTorch() {
    const win = findCameraWindow();
    if (!win || !cameraStream) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;

    cameraTorch = !cameraTorch;
    track.applyConstraints({
        advanced: [{ torch: cameraTorch }]
    }).catch(() => {
        cameraTorch = !cameraTorch;
        showCameraToast(win, 'Torch not supported on this device');
    });

    const torchBtn = win._camera.torchBtn;
    if (cameraTorch) {
        torchBtn.classList.add('active');
        torchBtn.innerHTML = '<span class="material-icons-round">flash_on</span>';
    } else {
        torchBtn.classList.remove('active');
        torchBtn.innerHTML = '<span class="material-icons-round">flash_on</span>';
    }
}

/* ─── Toggle Mirror ─── */
function cameraToggleMirror() {
    const win = findCameraWindow();
    if (!win) return;

    cameraMirror = !cameraMirror;
    const video = win._camera.video;
    const mirrorBtn = win._camera.mirrorBtn;

    if (cameraMirror) {
        video.classList.add('mirror');
        mirrorBtn.classList.add('active');
    } else {
        video.classList.remove('mirror');
        mirrorBtn.classList.remove('active');
    }

    showCameraToast(win, cameraMirror ? 'Mirror on' : 'Mirror off');
}

/* ─── Change Quality ─── */
function cameraChangeQuality(value) {
    cameraCurrentQuality = value;
    const win = findCameraWindow();
    if (!win) return;

    if (cameraActive) {
        cameraStop();
        setTimeout(() => cameraStart(), 200);
    }

    showCameraToast(win, 'Quality set to ' + value);
}

/* ─── Gallery ─── */
function cameraViewGallery() {
    const win = findCameraWindow();
    if (!win) return;

    const gallery = win._camera.gallery;
    const grid = win._camera.galleryGrid;
    gallery.classList.remove('hidden');
    cameraRenderGallery(grid);
}

function cameraCloseGallery() {
    const win = findCameraWindow();
    if (!win) return;
    win._camera.gallery.classList.add('hidden');
}

function cameraRenderGallery(grid) {
    grid.innerHTML = '';
    if (cameraCaptures.length === 0) {
        grid.innerHTML = '<div class="camera-gallery-empty"><span class="material-icons-round">photo_library</span><p>No photos yet</p></div>';
        return;
    }

    // Show newest first
    const reversed = [...cameraCaptures].reverse();
    reversed.forEach((dataUrl, i) => {
        const item = document.createElement('div');
        item.className = 'camera-gallery-item';
        item.innerHTML = '<img src="' + dataUrl + '" alt="Capture ' + (cameraCaptures.length - i) + '">';
        item.addEventListener('click', () => {
            // Download on click
            const link = document.createElement('a');
            link.download = 'capture-' + (Date.now() - i) + '.jpg';
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
        grid.appendChild(item);
    });
}

/* ─── Toast ─── */
function showCameraToast(win, message) {
    if (!win) return;
    const toast = win._camera.toast;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ─── Helpers ─── */
function findCameraWindow() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'camera') {
            return w.el;
        }
    }
    return null;
}

/* ─── Cleanup ─── */
function cameraDestroyWindow(wid) {
    const win = windows[wid]?.el;
    if (win && win._camera) {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        cameraActive = false;
    }
}

/* ─── Init hook from WM ─── */
function initCameraApp(win) {
    initCamera(win);
}