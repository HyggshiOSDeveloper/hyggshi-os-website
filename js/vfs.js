/* ============ VIRTUAL FILE SYSTEM ============ */
const vfs = {
    '/home': {
        type: 'dir', children: {
            'Documents': {
                type: 'dir', children: {
                    'readme.txt': { type: 'file', content: 'Welcome to Web OS!\n\nThis is your personal desktop environment running in the browser.\n\nFeel free to create, edit, and organize your files.' },
                    'notes.txt': { type: 'file', content: 'Shopping list:\n- Milk\n- Bread\n- Coffee\n- Eggs' }
                }
            },
            'Pictures': {
                type: 'dir', children: {
                    'background.png': { type: 'file', content: 'image:Resources/background.png' }
                }
            },
            'Music': {
                type: 'dir', children: {
                    'sample.mp3': { type: 'file', content: '[audio]' },
                    'video_clip.mp4': { type: 'file', content: 'video:Resources/sample.mp4' }
                }
            },
            'Downloads': {
                type: 'dir',
                children: {
                    'report.pdf': { type: 'file', content: '[PDF Content]' },
                    'photo.jpg': { type: 'file', content: 'image:Resources/background.png' },
                    'script.js': { type: 'file', content: 'console.log("Hello WebOS");' },
                    'style.css': { type: 'file', content: 'body { color: blue; }' },
                    'index.html': { type: 'file', content: '<h1>Web OS</h1>' }
                }
            },
            'Desktop': { type: 'dir', children: {} }
        }
    }
};

function getVfsNode(path) {
    const parts = path.split('/').filter(Boolean);
    let node = vfs;
    for (const p of parts) {
        if (node['/' + p]) { node = node['/' + p]; continue; }
        if (node.children && node.children[p]) { node = node.children[p]; continue; }
        return null;
    }
    return node;
}
