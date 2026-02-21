/* ============ MAIN ENTRY POINT ============ */
let isSafeMode = false;
let idleTimer;

document.addEventListener('DOMContentLoaded', () => {
    // Detect Safe Mode (Shift held during load)
    window.addEventListener('keydown', (e) => { if (e.shiftKey) isSafeMode = true; }, { once: true });
    // 1. Initial Clock & Calendar
    updateClock();
    setInterval(updateClock, 1000);
    updateLockClock();
    setInterval(updateLockClock, 1000 * 60);
    buildCalendar();

    // 2. Load Preferences
    const savedAccent = localStorage.getItem('webos-accent') || '#3b82f6';
    setAccent(savedAccent, true);

    const savedWallpaper = localStorage.getItem('webos-wallpaper') || 'Resources/background.png';
    setWallpaper(savedWallpaper, true);

    const savedThemeMode = localStorage.getItem('webos-theme-mode') || 'dark';
    setThemeMode(savedThemeMode, true);

    const savedUIStyle = localStorage.getItem('webos-ui-style') || 'glassmorphism';
    setUIStyle(savedUIStyle, true);

    // 3. Global Event Listeners
    document.addEventListener('contextmenu', showContextMenu);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#context-menu') && !e.target.closest('.fm-item')) hideContextMenu();
        if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn') && startMenuOpen) toggleStartMenu();
        if (!e.target.closest('#calendar-popup') && !e.target.closest('#tray-clock') && calendarOpen) toggleCalendar();
    });

    // 4. Start Menu Search
    const startSearch = document.getElementById('start-search');
    if (startSearch) {
        startSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.start-app-item').forEach(item => {
                const name = item.querySelector('span:last-child').textContent.toLowerCase();
                item.classList.toggle('hidden', !name.includes(query));
            });
        });
    }

    // 5. Boot Sequence Simulation
    setTimeout(() => {
        const boot = document.getElementById('boot-screen');
        if (boot) {
            boot.classList.add('fade-out');
            setTimeout(() => {
                boot.classList.add('hidden');
                // respect "Lock on Startup" setting
                const lockOnStartup = localStorage.getItem('webos-lock-startup') === 'true';
                if (lockOnStartup) {
                    lockOS();
                }
            }, 800);
        }
    }, 2500);

    // Initial Lock Settings apply (Blur)
    const lockBlur = localStorage.getItem('webos-lock-blur') !== 'false';
    const lockEl = document.getElementById('lock-screen');
    if (lockEl) {
        lockEl.style.backdropFilter = lockBlur ? 'blur(40px)' : 'none';
        lockEl.style.webkitBackdropFilter = lockBlur ? 'blur(40px)' : 'none';
    }

    // 6. Global Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Meta') { e.preventDefault(); toggleStartMenu(); }
        if (e.key === 'L' && e.altKey) { e.preventDefault(); lockOS(); }

        // Lock screen specific listeners
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen && !lockScreen.classList.contains('hidden') && !lockScreen.classList.contains('fade-out')) {
            if (!lockScreen.classList.contains('show-login')) {
                showLoginBox();
            } else if (e.key === 'Enter') {
                unlockOS();
            }
        }
    });

    // 7. Lock screen interaction
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) {
        lockScreen.addEventListener('mousedown', () => {
            if (!lockScreen.classList.contains('show-login') && !lockScreen.classList.contains('hidden')) {
                showLoginBox();
            }
        });
    }

    // 8. Auto-Lock & Idle Detection
    resetIdleTimer();
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, true);
    });
});

/* --- Security & Boot --- */
function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (typeof isSafeMode !== 'undefined' && isSafeMode) return;

    const minutes = parseInt(localStorage.getItem('webos-lock-timer') || '0');
    if (minutes > 0) {
        idleTimer = setTimeout(() => {
            const lock = document.getElementById('lock-screen');
            if (lock && lock.classList.contains('hidden')) lockOS();
        }, minutes * 60 * 1000);
    }
}

/* Lock Screen Logic */
function lockOS() {
    const lock = document.getElementById('lock-screen');
    const loginBox = document.getElementById('lock-login-box');
    const recoveryBox = document.getElementById('lock-recovery-box');
    const passwordInput = document.getElementById('lock-password');

    if (lock) {
        lock.classList.remove('hidden', 'fade-out', 'show-login');
        if (recoveryBox) recoveryBox.classList.add('hidden');
        if (loginBox) loginBox.classList.remove('hidden');
        if (passwordInput) passwordInput.value = '';
        renderLockUsers();
        if (typeof startMenuOpen !== 'undefined' && startMenuOpen) toggleStartMenu();
    }
}

function switchUser() {
    if (typeof startMenuOpen !== 'undefined' && startMenuOpen) toggleStartMenu();
    lockOS();
    showNotification('System', 'Select an account to log in.');
}

function renderLockUsers() {
    const list = document.getElementById('lock-users-list');
    if (!list) return;
    list.innerHTML = '';
    const usersList = JSON.parse(localStorage.getItem('webos-users')) || ['User'];
    usersList.forEach(u => {
        const el = document.createElement('div');
        el.className = 'lock-user-item' + (typeof currentUser !== 'undefined' && u === currentUser ? ' active' : '');
        el.onclick = (e) => { e.stopPropagation(); selectUser(u); };
        el.innerHTML = `
            <div class="lock-avatar"><span class="material-icons-round">account_circle</span></div>
            <span>${u}</span>
        `;
        list.appendChild(el);
    });
}

function selectUser(name) {
    if (typeof currentUser !== 'undefined') currentUser = name;
    renderLockUsers();
    document.getElementById('lock-password')?.focus();
}

function showLoginBox() {
    const lock = document.getElementById('lock-screen');
    if (lock) {
        const savedPwd = localStorage.getItem('webos-lock-password') || '';
        if (!savedPwd) {
            unlockOS();
            return;
        }
        lock.classList.add('show-login');
        setTimeout(() => {
            document.getElementById('lock-password')?.focus();
        }, 300);
    }
}

async function unlockOS() {
    const lock = document.getElementById('lock-screen');
    const passwordInput = document.getElementById('lock-password');
    const savedPwd = localStorage.getItem('webos-lock-password') || '';

    if (lock) {
        if (savedPwd && passwordInput && passwordInput.value) {
            const hashedInput = await hashPassword(passwordInput.value);
            if (hashedInput !== savedPwd) {
                passwordInput.classList.add('shake');
                setTimeout(() => passwordInput.classList.remove('shake'), 400);
                passwordInput.value = '';
                return;
            }
        } else if (savedPwd && passwordInput && !passwordInput.value) {
            return;
        }

        lock.classList.add('fade-out');
        setTimeout(() => {
            lock.classList.add('hidden');
            lock.classList.remove('fade-out', 'show-login');

            // Update Start Menu user name
            const startUserName = document.getElementById('start-user-name');
            if (startUserName && typeof currentUser !== 'undefined') {
                startUserName.textContent = currentUser;
            }

            if (typeof isSafeMode !== 'undefined' && isSafeMode) showNotification('System', 'Running in Safe Mode');
        }, 800);
    }
}

/* --- Recovery Mode --- */
function showRecoveryInput() {
    document.getElementById('lock-login-box')?.classList.add('hidden');
    document.getElementById('lock-recovery-box')?.classList.remove('hidden');
}

function hideRecoveryInput() {
    document.getElementById('lock-recovery-box')?.classList.add('hidden');
    document.getElementById('lock-login-box')?.classList.remove('hidden');
}

function unlockWithRecovery() {
    const keyInput = document.getElementById('lock-recovery-key');
    const savedKey = localStorage.getItem('webos-recovery-key');

    if (keyInput && keyInput.value.toUpperCase() === savedKey) {
        localStorage.removeItem('webos-lock-password');
        showNotification('Security', 'Password reset via recovery key.');
        unlockOS();
    } else if (keyInput) {
        keyInput.classList.add('shake');
        setTimeout(() => keyInput.classList.remove('shake'), 400);
    }
}
