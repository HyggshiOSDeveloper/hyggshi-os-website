/**
 * Hyggshi OS Theme Switcher
 * Handles Dark/Light mode toggle with localStorage persistence
 */

(function() {
    const THEME_KEY = 'hyggshi-theme';
    const DARK = 'dark';
    const LIGHT = 'light';
    
    // Get saved theme or default to dark
    function getSavedTheme() {
        return localStorage.getItem(THEME_KEY) || DARK;
    }
    
    // Apply theme to document
    function applyTheme(theme) {
        if (theme === LIGHT) {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateToggleIcon(theme);
    }
    
    // Update toggle button icon
    function updateToggleIcon(theme) {
        const toggles = document.querySelectorAll('.theme-toggle');
        toggles.forEach(btn => {
            btn.textContent = theme === LIGHT ? '🌙' : '☀️';
            btn.title = theme === LIGHT ? 'Chuyển sang Dark Mode' : 'Chuyển sang Light Mode';
        });
    }
    
    // Toggle theme
    function toggleTheme() {
        const current = getSavedTheme();
        const next = current === DARK ? LIGHT : DARK;
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
    }
    
    // Initialize on page load
    function init() {
        // Apply saved theme immediately
        applyTheme(getSavedTheme());
        
        // Attach click handlers to all toggle buttons
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            btn.addEventListener('click', toggleTheme);
        });
    }
    
    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Expose for external use if needed
    window.HyggshiTheme = {
        toggle: toggleTheme,
        set: function(theme) {
            localStorage.setItem(THEME_KEY, theme);
            applyTheme(theme);
        },
        get: getSavedTheme
    };
})();
