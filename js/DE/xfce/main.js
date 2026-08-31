/* ============================================================
   XFCE Desktop Environment module
   Pairs with css/DE/xfce/main.css. This file only touches the
   couple of pieces a stylesheet can't reach (swapping the start
   button's icon-only look for a "Whisker menu" label, and keeping
   itself in sync whenever the session is changed from the login
   screen's top dock or Settings > Desktop Environment).
   ============================================================ */
(function () {
    var XFCE_ENV_ID = 'xfce';

    function buildWhiskerButton() {
        var btn = document.getElementById('start-btn');
        if (!btn || btn.querySelector('.xfce-whisker-label')) return;
        btn.innerHTML =
            '<span class="material-icons-round">apps</span>' +
            '<span class="xfce-whisker-label">Applications</span>';
    }

    function restoreDefaultButton() {
        var btn = document.getElementById('start-btn');
        if (!btn) return;
        // Only reset the button if XFCE is the one that customized it.
        // Another DE module (e.g. GNOME) may run its own sync right after
        // this one as part of the same session switch and may have already
        // re-skinned the shared #start-btn - don't clobber that.
        if (!btn.querySelector('.xfce-whisker-label')) return;
        btn.innerHTML = '<span class="material-icons-round">apps</span>';
    }

    function applyXfce() {
        document.body.dataset.desktopEnv = XFCE_ENV_ID;
        buildWhiskerButton();
    }

    function revertXfce() {
        restoreDefaultButton();
    }

    function syncFromEnv(env) {
        if (env === XFCE_ENV_ID) {
            applyXfce();
        } else {
            revertXfce();
        }
    }

    // Wrap the core setDesktopEnv (js/apps/system-apps/core.js) so every path
    // that switches sessions - the Settings app, or selectLoginSession() on the
    // lock screen's top dock - re-skins the desktop live, not just on reload.
    function wrapSetDesktopEnv() {
        if (typeof window.setDesktopEnv !== 'function' || window.setDesktopEnv.__xfceWrapped) return;
        var original = window.setDesktopEnv;
        var wrapped = function (env, el, silent) {
            original(env, el, silent);
            syncFromEnv(env);
        };
        wrapped.__xfceWrapped = true;
        window.setDesktopEnv = wrapped;
    }

    // core.js and the taskbar markup are already loaded by the time this file
    // runs (it's included after them), so wrap immediately rather than waiting
    // for DOMContentLoaded - that guarantees the very first setDesktopEnv()
    // call made during boot already goes through this wrapper.
    wrapSetDesktopEnv();

    // Fallback: if for any reason nothing called setDesktopEnv on boot, make
    // sure the saved choice is still reflected. Safe to call more than once.
    document.addEventListener('DOMContentLoaded', function () {
        wrapSetDesktopEnv();
        var savedEnv = localStorage.getItem('webos-desktop-env') || 'default';
        syncFromEnv(savedEnv);
    });

    window.xfceSyncFromEnv = syncFromEnv;
})();