/* ============================================================
   GNOME Desktop Environment module
   Pairs with css/DE/gnome/main.css. Builds the floating bottom
   dock from the same app list already defined in #desktop-icons
   (which this skin hides), and turns the shared #start-btn into
   an "Activities" pill. Stays in sync with session switches made
   from the login screen's top dock or Settings > Desktop
   Environment, the same way js/DE/xfce/main.js does.
   ============================================================ */
(function () {
    var GNOME_ENV_ID = 'gnome';
    var DOCK_ID = 'gnome-dock';

    function buildActivitiesButton() {
        var btn = document.getElementById('start-btn');
        if (!btn || btn.querySelector('.gnome-activities-label')) return;
        btn.innerHTML = '<span class="gnome-activities-label">Activities</span>';
    }

    function restoreDefaultButton() {
        var btn = document.getElementById('start-btn');
        if (!btn) return;
        // Only reset the button if GNOME is the one that customized it.
        // Another DE module (e.g. XFCE) may run its own sync right after
        // this one as part of the same session switch and may have already
        // re-skinned the shared #start-btn - don't clobber that.
        if (!btn.querySelector('.gnome-activities-label')) return;
        btn.innerHTML = '<span class="material-icons-round">apps</span>';
    }

    function buildDock() {
        if (document.getElementById(DOCK_ID)) return;
        var icons = document.querySelectorAll('#desktop-icons .desktop-icon');
        if (!icons.length) return;

        var dock = document.createElement('div');
        dock.id = DOCK_ID;

        icons.forEach(function (icon) {
            var app = icon.getAttribute('data-app');
            var imgEl = icon.querySelector('.icon-img');
            if (!app || !imgEl) return;

            var labelEl = icon.querySelector('.icon-label');
            var item = document.createElement('div');
            item.className = 'gnome-dock-item';
            item.dataset.app = app;
            item.title = labelEl ? labelEl.textContent : app;
            item.appendChild(imgEl.cloneNode(true));
            item.addEventListener('click', function () {
                if (typeof openApp === 'function') openApp(app);
            });
            dock.appendChild(item);
        });

        document.body.appendChild(dock);
    }

    function removeDock() {
        var dock = document.getElementById(DOCK_ID);
        if (dock) dock.remove();
    }

    function applyGnome() {
        document.body.dataset.desktopEnv = GNOME_ENV_ID;
        buildActivitiesButton();
        buildDock();
    }

    function revertGnome() {
        restoreDefaultButton();
        removeDock();
    }

    function syncFromEnv(env) {
        if (env === GNOME_ENV_ID) {
            applyGnome();
        } else {
            revertGnome();
        }
    }

    function wrapSetDesktopEnv() {
        if (typeof window.setDesktopEnv !== 'function' || window.setDesktopEnv.__gnomeWrapped) return;
        var original = window.setDesktopEnv;
        var wrapped = function (env, el, silent) {
            original(env, el, silent);
            syncFromEnv(env);
        };
        wrapped.__gnomeWrapped = true;
        window.setDesktopEnv = wrapped;
    }

    wrapSetDesktopEnv();

    document.addEventListener('DOMContentLoaded', function () {
        wrapSetDesktopEnv();
        var savedEnv = localStorage.getItem('webos-desktop-env') || 'default';
        syncFromEnv(savedEnv);

        // #desktop-icons may be populated asynchronously (after the icon
        // list loads from storage/app registry), which can happen after
        // this DOMContentLoaded handler runs. If GNOME is the active
        // session and the dock came up empty because icons weren't ready
        // yet, watch for them and build the dock once they appear.
        if (savedEnv === GNOME_ENV_ID && !document.getElementById(DOCK_ID)) {
            var desktopIcons = document.getElementById('desktop-icons');
            if (desktopIcons) {
                var observer = new MutationObserver(function () {
                    if (document.body.dataset.desktopEnv === GNOME_ENV_ID) {
                        buildDock();
                    }
                    if (document.getElementById(DOCK_ID)) observer.disconnect();
                });
                observer.observe(desktopIcons, { childList: true });
            }
        }
    });

    window.gnomeSyncFromEnv = syncFromEnv;
})();