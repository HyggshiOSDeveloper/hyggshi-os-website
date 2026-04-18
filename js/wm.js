/* ============ GLOBAL STATE ============ */
let windowZIndex = 100;
let activeWindowId = null;
let windows = {};
let windowIdCounter = 0;
let startMenuOpen = false;
let calendarOpen = false;

/* ============ WINDOW MANAGEMENT ============ */
const appMeta = {
    'file-manager': { title: 'Files', icon: 'folder', w: 750, h: 480 },
    'terminal': { title: 'Terminal', icon: 'terminal', w: 650, h: 420 },
    'text-editor': { title: 'Text Editor', icon: 'edit_note', w: 650, h: 460 },
    'ide-editor': { title: 'IDE Code Editor', icon: 'code', w: 980, h: 640 },
    'browser': { title: 'Browser', icon: 'public', w: 900, h: 580 },
    'calculator': { title: 'Calculator', icon: 'calculate', w: 320, h: 480 },
    'settings': { title: 'Settings', icon: 'settings', w: 680, h: 460 },
    'image-viewer': { title: 'Photos', icon: 'image', w: 650, h: 480 },
    'music-player': { title: 'Music Player', icon: 'headphones', w: 380, h: 480 },
    'chat-ai': { title: 'Chat AI', icon: 'psychology', w: 800, h: 600 },
    'video-player': { title: 'Video Player', icon: 'movie', w: 750, h: 520 },
    'youtube': { title: 'YouTube', icon: 'smart_display', w: 850, h: 550 },
    'weather': { title: 'Weather', icon: 'cloud', w: 700, h: 500 },
    'global-chat': { title: 'Zashi Messaging', icon: 'public', w: 850, h: 600 },
    'about': { title: 'About Web OS', icon: 'info', w: 420, h: 500 },
};

function openApp(appId) {
    if (startMenuOpen) toggleStartMenu();
    hideContextMenu();

    // Check if already open
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === appId) {
            if (w.minimized) {
                w.minimized = false;
                w.el.classList.remove('minimized');
            }
            focusWindow(wid);
            return;
        }
    }

    const meta = appMeta[appId];
    if (!meta) return;

    const template = document.getElementById('tmpl-' + appId);
    if (!template) return;

    const wid = 'win-' + (++windowIdCounter);

    // Calculate position
    const offsetX = (windowIdCounter % 8) * 30 + 60;
    const offsetY = (windowIdCounter % 6) * 30 + 40;
    const x = Math.min(offsetX, window.innerWidth - meta.w - 20);
    const y = Math.min(offsetY, window.innerHeight - meta.h - 80);

    // Create window
    const win = document.createElement('div');
    win.className = 'window focused';
    win.id = wid;
    win.style.cssText = `left:${x}px;top:${y}px;width:${meta.w}px;height:${meta.h}px;z-index:${++windowZIndex};`;

    win.innerHTML = `
    <div class="window-titlebar">
      <span class="material-icons-round win-icon">${meta.icon}</span>
      <span class="window-title">${meta.title}</span>
      <div class="win-controls">
        <button class="win-ctrl minimize" onclick="minimizeWindow('${wid}')"><span class="material-icons-round">remove</span></button>
        <button class="win-ctrl maximize" onclick="maximizeWindow('${wid}')"><span class="material-icons-round">crop_square</span></button>
        <button class="win-ctrl close" onclick="closeWindow('${wid}')"><span class="material-icons-round">close</span></button>
      </div>
    </div>
    <div class="window-body"></div>
    <div class="resize-handle rh-right"></div>
    <div class="resize-handle rh-bottom"></div>
    <div class="resize-handle rh-corner"></div>
    <div class="resize-handle rh-left"></div>
    <div class="resize-handle rh-top"></div>
  `;

    // Clone template content into body
    const body = win.querySelector('.window-body');
    body.appendChild(template.content.cloneNode(true));

    document.getElementById('windows-container').appendChild(win);

    // Register window
    windows[wid] = {
        el: win,
        appId: appId,
        minimized: false,
        maximized: false,
        restoreRect: null
    };

    // Focus
    focusWindow(wid);

    // Make draggable & resizable
    makeDraggable(win, wid);
    makeResizable(win, wid);

    // Add to taskbar
    addTaskbarApp(wid, meta);

    // Init app-specific logic
    initApp(appId, wid);

    // Window click to focus
    win.addEventListener('mousedown', () => focusWindow(wid));
}

function closeWindow(wid) {
    const w = windows[wid];
    if (!w) return;
    w.el.classList.add('closing');
    setTimeout(() => {
        // Cleanup app-specific resources
        destroyApp(w.appId, wid);
        w.el.remove();
        delete windows[wid];
        removeTaskbarApp(wid);
        if (activeWindowId === wid) activeWindowId = null;
    }, 200);
}

function minimizeWindow(wid) {
    const w = windows[wid];
    if (!w) return;
    w.minimized = true;
    w.el.classList.add('minimized');
    const tb = document.querySelector(`.taskbar-app[data-wid="${wid}"]`);
    if (tb) tb.classList.remove('active');
    if (activeWindowId === wid) activeWindowId = null;
}

function maximizeWindow(wid) {
    const w = windows[wid];
    if (!w) return;
    if (w.maximized) {
        // Restore
        w.maximized = false;
        w.el.classList.remove('maximized');
        if (w.restoreRect) {
            w.el.style.left = w.restoreRect.left;
            w.el.style.top = w.restoreRect.top;
            w.el.style.width = w.restoreRect.width;
            w.el.style.height = w.restoreRect.height;
        }
    } else {
        // Save & maximize
        w.restoreRect = {
            left: w.el.style.left, top: w.el.style.top,
            width: w.el.style.width, height: w.el.style.height
        };
        w.maximized = true;
        w.el.classList.add('maximized');
        focusWindow(wid);
    }
}

function focusWindow(wid) {
    if (activeWindowId === wid) return;
    // Unfocus previous
    document.querySelectorAll('.window.focused').forEach(w => w.classList.remove('focused'));
    document.querySelectorAll('.taskbar-app.active').forEach(a => a.classList.remove('active'));

    const w = windows[wid];
    if (!w) return;
    w.el.classList.add('focused');
    w.el.style.zIndex = ++windowZIndex;
    activeWindowId = wid;

    const tb = document.querySelector(`.taskbar-app[data-wid="${wid}"]`);
    if (tb) tb.classList.add('active');
}

/* ============ DRAGGING ============ */
function makeDraggable(win, wid) {
    const titlebar = win.querySelector('.window-titlebar');
    let dragging = false;
    let startX, startY, origLeft, origTop;
    let rafId = null;

    const onMouseMove = (e) => {
        if (!dragging) return;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft = Math.max(-(win.offsetWidth / 2), Math.min(origLeft + dx, window.innerWidth - win.offsetWidth / 2));
            const newTop = Math.max(0, Math.min(origTop + dy, window.innerHeight - 60));
            win.style.left = newLeft + 'px';
            win.style.top = newTop + 'px';
            rafId = null;
        });
    };

    const onMouseUp = () => {
        if (dragging) {
            dragging = false;
            document.body.classList.remove('dragging-window');
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };

    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.win-controls')) return;
        const w = windows[wid];
        if (w && w.maximized) return;

        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = win.offsetLeft;
        origTop = win.offsetTop;

        document.body.classList.add('dragging-window');
        focusWindow(wid);

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });
}

/* ============ RESIZING ============ */
function makeResizable(win, wid) {
    const handles = win.querySelectorAll('.resize-handle');
    let resizing = false;
    let resizeDir = '';
    let startX, startY, origW, origH, origLeft, origTop;
    let rafId = null;

    const onMouseMove = (e) => {
        if (!resizing) return;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const minW = 360;
            const minH = 240;

            if (resizeDir === 'right' || resizeDir === 'corner') {
                win.style.width = Math.max(minW, origW + dx) + 'px';
            }
            if (resizeDir === 'bottom' || resizeDir === 'corner') {
                win.style.height = Math.max(minH, origH + dy) + 'px';
            }
            if (resizeDir === 'left') {
                const newW = Math.max(minW, origW - dx);
                win.style.width = newW + 'px';
                win.style.left = (origLeft + origW - newW) + 'px';
            }
            if (resizeDir === 'top') {
                const newH = Math.max(minH, origH - dy);
                win.style.height = newH + 'px';
                win.style.top = (origTop + origH - newH) + 'px';
            }
            rafId = null;
        });
    };

    const onMouseUp = () => {
        if (resizing) {
            resizing = false;
            document.body.classList.remove('resizing-window');
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const w = windows[wid];
            if (w && w.maximized) return;

            resizing = true;
            if (handle.classList.contains('rh-right')) resizeDir = 'right';
            else if (handle.classList.contains('rh-bottom')) resizeDir = 'bottom';
            else if (handle.classList.contains('rh-corner')) resizeDir = 'corner';
            else if (handle.classList.contains('rh-left')) resizeDir = 'left';
            else if (handle.classList.contains('rh-top')) resizeDir = 'top';

            startX = e.clientX;
            startY = e.clientY;
            origW = win.offsetWidth;
            origH = win.offsetHeight;
            origLeft = win.offsetLeft;
            origTop = win.offsetTop;

            document.body.classList.add('resizing-window');
            focusWindow(wid);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

/* ============ TASKBAR APPS ============ */
function addTaskbarApp(wid, meta) {
    const el = document.createElement('button');
    el.className = 'taskbar-app active';
    el.dataset.wid = wid;
    el.innerHTML = `<span class="material-icons-round">${meta.icon}</span><span>${meta.title}</span>`;
    el.addEventListener('click', () => {
        const w = windows[wid];
        if (!w) return;
        if (w.minimized) {
            w.minimized = false;
            w.el.classList.remove('minimized');
            focusWindow(wid);
        } else if (activeWindowId === wid) {
            minimizeWindow(wid);
        } else {
            focusWindow(wid);
        }
    });
    document.getElementById('taskbar-apps').appendChild(el);
}

function removeTaskbarApp(wid) {
    const el = document.querySelector(`.taskbar-app[data-wid="${wid}"]`);
    if (el) el.remove();
}

/* ============ APP INITIALIZATION & CLEANUP ============ */
function initApp(appId, wid) {
    const win = windows[wid].el;

    switch (appId) {
        case 'file-manager': initFileManager(win); break;
        case 'terminal': initTerminal(win); break;
        case 'text-editor': initTextEditor(win); break;
        case 'ide-editor': initIdeEditor(win); break;
        case 'browser': initBrowser(win); break;
        case 'calculator': initCalculator(win); break;
        case 'chat-ai': initChatAi(win); break;
        case 'settings': initSettings(win); break;
        case 'music-player': mpInitWindow(win); break;
        case 'video-player': initVideoPlayer(win); break;
        case 'global-chat': initMessage(win); break;
    }
}

function destroyApp(appId, wid) {
    // Custom cleanup for specific apps
    switch (appId) {
        case 'music-player': mpDestroyWindow(wid); break;
        case 'video-player': vpDestroyWindow(wid); break;
        case 'chat-ai': chatDestroyWindow(wid); break;
    }
}
