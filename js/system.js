/* ============ CLOCK ============ */
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
    document.getElementById('clock-time').textContent = timeStr;
    document.getElementById('clock-date').textContent = dateStr;
}

function updateLockClock() {
    const now = new Date();
    const lockTime = document.getElementById('lock-time');
    const lockDate = document.getElementById('lock-date');
    if (lockTime) {
        lockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lockDate.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
}

/* ============ NOTIFICATIONS ============ */
function showNotification(title, body) {
    const list = document.getElementById('notif-list');
    list.innerHTML = '';
    const el = document.createElement('div');
    el.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid var(--border);';
    el.innerHTML = `<div style="font-weight:600;font-size:13px;margin-bottom:4px;">${title}</div><div style="font-size:12px;color:var(--text-secondary);">${body}</div>`;
    list.appendChild(el);
}

/* ============ START MENU ============ */
function toggleStartMenu() {
    const menu = document.getElementById('start-menu');
    const btn = document.getElementById('start-btn');
    startMenuOpen = !startMenuOpen;
    menu.classList.toggle('hidden', !startMenuOpen);
    btn.classList.toggle('active', startMenuOpen);
    if (startMenuOpen) {
        document.getElementById('start-search').value = '';
        document.querySelectorAll('.start-app-item').forEach(i => i.classList.remove('hidden'));
        document.getElementById('start-search').focus();
        // Close calendar if open
        if (calendarOpen) toggleCalendar();
    }
}

/* ============ CALENDAR ============ */
function toggleCalendar() {
    const popup = document.getElementById('calendar-popup');
    calendarOpen = !calendarOpen;
    popup.classList.toggle('hidden', !calendarOpen);
    if (calendarOpen && startMenuOpen) toggleStartMenu();
}

function buildCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    document.getElementById('cal-month').textContent = now.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    days.forEach(d => {
        const h = document.createElement('div');
        h.className = 'cal-header';
        h.textContent = d;
        grid.appendChild(h);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    // Previous month filling
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = document.createElement('div');
        d.className = 'cal-day other';
        d.textContent = prevDays - i;
        grid.appendChild(d);
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('div');
        d.className = 'cal-day' + (i === today ? ' today' : '');
        d.textContent = i;
        grid.appendChild(d);
    }

    // Next month filling
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        const d = document.createElement('div');
        d.className = 'cal-day other';
        d.textContent = i;
        grid.appendChild(d);
    }
}

/* ============ CONTEXT MENU (Global) ============ */
function showContextMenu(e) {
    if (e.target.closest('.window') || e.target.closest('#taskbar') || e.target.closest('#start-menu')) return;
    e.preventDefault();
    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
}

function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
}

function ctxRefresh() { location.reload(); }
function ctxNewFolder() { openApp('file-manager'); }

/* ============ SHUTDOWN & POWER ============ */
function showShutdownDialog() {
    if (startMenuOpen) toggleStartMenu();
    document.getElementById('shutdown-overlay').classList.remove('hidden');
}

function hideShutdownDialog() {
    document.getElementById('shutdown-overlay').classList.add('hidden');
}

function doShutdown(type) {
    hideShutdownDialog();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-family:Inter,sans-serif;opacity:0;transition:opacity 1s;';
    overlay.textContent = type === 'restart' ? 'Restarting...' : type === 'sleep' ? '' : 'Shutting down...';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = '1');
    if (type === 'restart') {
        setTimeout(() => location.reload(), 2000);
    }
}

/* ============ VOLUME TOGGLE ============ */
let volumeMuted = false;
function toggleVolume() {
    volumeMuted = !volumeMuted;
    const iconEl = document.querySelector('#tray-volume .material-icons-round');
    if (iconEl) {
        iconEl.textContent = volumeMuted ? 'volume_off' : 'volume_up';
    }
}

/* ============ SECURITY UTILS ============ */
async function hashPassword(password) {
    if (!password) return '';
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function generateRecoveryKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 3) key += '-';
    }
    return key;
}
