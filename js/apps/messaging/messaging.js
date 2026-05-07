/* Legacy shim: Zashi Messaging was split into smaller files. */
(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof window.initMessage === 'function') return;
    const parts = [
        'js/apps-message-foundation.js',
        'js/apps-message-data.js',
        'js/apps-message-interactions.js',
        'js/apps-message-panels.js'
    ];
    document.write(parts.map(src => '<script src="' + src + '"></script>').join(''));
}());
