/* ============================================================
   Unity (Ubuntu Unity) Desktop Environment module
   Pairs with css/DE/unity/main.css. The launcher and top bar are
   pure CSS reskins of the shared #taskbar/#start-btn, so this
   file's only job is turning the Start button into the round
   Ubuntu-orange launcher icon and keeping itself in sync with
   session switches, the same way the XFCE and GNOME modules do.
   ============================================================ */
(function () {
    var UNITY_ENV_ID = 'unity';

    function buildLauncherIcon() {
        var btn = document.getElementById('start-btn');
        if (!btn || btn.querySelector('.unity-launcher-icon')) return;
        btn.innerHTML = '<span class="material-icons-round unity-launcher-icon">apps</span>';
    }

    function restoreDefaultButton() {
        var btn = document.getElementById('start-btn');
        if (!btn) return;
        btn.innerHTML = '<span class="material-icons-round">apps</span>';
    }

    function applyUnity() {
        document.body.dataset.desktopEnv = UNITY_ENV_ID;
        buildLauncherIcon();
    }

    function revertUnity() {
        restoreDefaultButton();
    }

    function syncFromEnv(env) {
        if (env === UNITY_ENV_ID) {
            applyUnity();
        } else {
            revertUnity();
        }
    }

    function wrapSetDesktopEnv() {
        if (typeof window.setDesktopEnv !== 'function' || window.setDesktopEnv.__unityWrapped) return;
        var original = window.setDesktopEnv;
        var wrapped = function (env, el, silent) {
            original(env, el, silent);
            syncFromEnv(env);
        };
        wrapped.__unityWrapped = true;
        window.setDesktopEnv = wrapped;
    }

    wrapSetDesktopEnv();

    document.addEventListener('DOMContentLoaded', function () {
        wrapSetDesktopEnv();
        var savedEnv = localStorage.getItem('webos-desktop-env') || 'default';
        syncFromEnv(savedEnv);
    });

    window.unitySyncFromEnv = syncFromEnv;
})();
