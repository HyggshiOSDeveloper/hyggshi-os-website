/* ============ FILE MANAGER ============ */
let fmCurrentPath = '/home';
let fmHistory = ['/home'];
let fmHistoryIndex = 0;

function initFileManager(win) {
    renderFileManager(win);
}

function renderFileManager(win, searchQuery = '') {
    if (!win) {
        for (const [wid, w] of Object.entries(windows)) {
            if (w.appId === 'file-manager') { win = w.el; break; }
        }
    }
    if (!win) return;

    const content = win.querySelector('.fm-content');
    const pathEl = win.querySelector('.fm-path');
    if (!content || !pathEl) return;

    // Render Breadcrumbs
    pathEl.innerHTML = '';
    const parts = fmCurrentPath.split('/').filter(Boolean);
    let tempPath = '';

    // Root breadcrumb
    const rootPart = document.createElement('span');
    rootPart.className = 'fm-breadcrumb';
    rootPart.innerHTML = '<span class="material-icons-round">home</span>';
    rootPart.onclick = () => fmGoTo('/home');
    pathEl.appendChild(rootPart);

    parts.forEach((part, index) => {
        if (part === 'home' && index === 0) return; // Skip if it's the root we already added
        pathEl.appendChild(document.createTextNode(' / '));
        tempPath += '/' + part;
        const bPath = tempPath;
        const span = document.createElement('span');
        span.className = 'fm-breadcrumb';
        span.textContent = part;
        span.onclick = () => fmGoTo(bPath);
        pathEl.appendChild(span);
    });

    content.innerHTML = '';
    const node = getVfsNode(fmCurrentPath);
    if (!node || !node.children) return;

    let entries = Object.entries(node.children);

    // Search filter
    if (searchQuery) {
        entries = entries.filter(([name]) => name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Sort: dirs first
    entries.sort((a, b) => {
        if (a[1].type === 'dir' && b[1].type !== 'dir') return -1;
        if (a[1].type !== 'dir' && b[1].type === 'dir') return 1;
        return a[0].localeCompare(b[0]);
    });

    for (const [name, item] of entries) {
        const el = document.createElement('div');
        el.className = 'fm-item ' + (item.type === 'dir' ? 'folder' : 'file');
        const itemPath = fmCurrentPath === '/' ? '/' + name : fmCurrentPath + '/' + name;

        let icon = item.type === 'dir' ? 'folder' : 'description';
        if (item.type === 'file') {
            const ext = name.split('.').pop().toLowerCase();
            const iconMap = {
                'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image',
                'mp3': 'headphones', 'wav': 'audio_file',
                'mp4': 'videocam', 'webm': 'movie', 'ogg': 'movie',
                'pdf': 'picture_as_pdf',
                'txt': 'description', 'md': 'edit_note',
                'html': 'html', 'js': 'javascript', 'css': 'css'
            };
            icon = iconMap[ext] || 'description';
        }

        el.innerHTML = `
            <span class="material-icons-round">${icon}</span>
            <span class="fm-item-name">${name}</span>
        `;

        el.addEventListener('dblclick', () => {
            if (item.type === 'dir') {
                fmCurrentPath = fmCurrentPath === '/' ? '/' + name : fmCurrentPath + '/' + name;
                fmHistory = fmHistory.slice(0, fmHistoryIndex + 1);
                fmHistory.push(fmCurrentPath);
                fmHistoryIndex = fmHistory.length - 1;
                renderFileManager(win);
            } else {
                const ext = name.split('.').pop().toLowerCase();
                if (['mp4', 'webm', 'ogg'].includes(ext)) {
                    openVideoInPlayer(name, item.content);
                } else if (isIdeFile(name)) {
                    openFileInIde(itemPath);
                } else {
                    openFileInEditor(name, item.content);
                }
            }
        });

        // Context Menu for Items
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fmShowItemContextMenu(e.clientX, e.clientY, name, item.type);
        });

        content.appendChild(el);
    }

    // Update sidebar active
    win.querySelectorAll('.fm-nav-item').forEach(n => {
        const navPath = n.getAttribute('onclick').match(/'([^']+)'/)[1];
        n.classList.toggle('active', fmCurrentPath === navPath);
    });
}

function fmNavigate(dir) {
    if (dir === 'back' && fmHistoryIndex > 0) {
        fmHistoryIndex--;
        fmCurrentPath = fmHistory[fmHistoryIndex];
        renderFileManager();
    } else if (dir === 'up') {
        const parts = fmCurrentPath.split('/').filter(Boolean);
        if (parts.length > 1) {
            parts.pop();
            fmCurrentPath = '/' + parts.join('/');
            fmHistory.push(fmCurrentPath);
            fmHistoryIndex = fmHistory.length - 1;
            renderFileManager();
        }
    }
}

function fmGoTo(path) {
    fmCurrentPath = path;
    fmHistory.push(path);
    fmHistoryIndex = fmHistory.length - 1;
    renderFileManager();
}

function fmNewFolder() {
    const name = prompt('Folder name:');
    if (!name) return;
    const node = getVfsNode(fmCurrentPath);
    if (node && node.children) {
        if (node.children[name]) {
            alert('A folder or file with this name already exists.');
            return;
        }
        node.children[name] = { type: 'dir', children: {} };
        renderFileManager();
    }
}

function fmNewFile() {
    const name = prompt('File name:');
    if (!name) return;
    const node = getVfsNode(fmCurrentPath);
    if (node && node.children) {
        if (node.children[name]) {
            alert('A folder or file with this name already exists.');
            return;
        }
        node.children[name] = { type: 'file', content: '' };
        renderFileManager();
    }
}

function fmSearch(query) {
    renderFileManager(null, query);
}

function fmDelete(name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    const node = getVfsNode(fmCurrentPath);
    if (node && node.children) {
        delete node.children[name];
        renderFileManager();
    }
}

function fmRename(oldName) {
    const newName = prompt(`Rename "${oldName}" to:`, oldName);
    if (!newName || newName === oldName) return;
    const node = getVfsNode(fmCurrentPath);
    if (node && node.children) {
        if (node.children[newName]) {
            alert('A folder or file with this name already exists.');
            return;
        }
        node.children[newName] = node.children[oldName];
        delete node.children[oldName];
        renderFileManager();
    }
}

function fmShowItemContextMenu(x, y, name, type) {
    const ctx = document.getElementById('context-menu');
    ctx.innerHTML = `
        <div class="ctx-item" onclick="fmItemAction('open', '${name}')"><span class="material-icons-round">open_in_new</span> Open</div>
        <div class="ctx-item" onclick="fmItemAction('rename', '${name}')"><span class="material-icons-round">edit</span> Rename</div>
        <div class="ctx-separator"></div>
        <div class="ctx-item ctx-delete" onclick="fmItemAction('delete', '${name}')"><span class="material-icons-round">delete</span> Delete</div>
    `;
    ctx.style.left = x + 'px';
    ctx.style.top = y + 'px';
    ctx.classList.remove('hidden');

    const closeCtx = () => {
        ctx.classList.add('hidden');
        document.removeEventListener('click', closeCtx);
        // Restore standard context menu
        ctx.innerHTML = `
            <div class="ctx-item" onclick="ctxRefresh()"><span class="material-icons-round">refresh</span> Refresh</div>
            <div class="ctx-separator"></div>
            <div class="ctx-item" onclick="ctxNewFolder()"><span class="material-icons-round">create_new_folder</span> New Folder</div>
            <div class="ctx-item" onclick="openApp('settings')"><span class="material-icons-round">display_settings</span> Display Settings</div>
            <div class="ctx-separator"></div>
            <div class="ctx-item" onclick="openApp('about')"><span class="material-icons-round">info</span> About Web OS</div>
        `;
    };
    setTimeout(() => document.addEventListener('click', closeCtx), 10);
}

function fmItemAction(action, name) {
    if (action === 'open') {
        const node = getVfsNode(fmCurrentPath);
        const item = node.children[name];
        if (item.type === 'dir') {
            fmCurrentPath = fmCurrentPath === '/' ? '/' + name : fmCurrentPath + '/' + name;
            fmHistory.push(fmCurrentPath);
            fmHistoryIndex = fmHistory.length - 1;
            renderFileManager();
        } else {
            const ext = name.split('.').pop().toLowerCase();
            if (['mp4', 'webm', 'ogg'].includes(ext)) {
                openVideoInPlayer(name, item.content);
            } else {
                openFileInEditor(name, item.content);
            }
        }
    } else if (action === 'delete') {
        fmDelete(name);
    } else if (action === 'rename') {
        fmRename(name);
    }
}

/* ============ TERMINAL ============ */
function initTerminal(win) {
    const input = win.querySelector('.term-input');
    const output = win.querySelector('.term-output');

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            input.value = '';

            // Echo command
            appendTermLine(output, `<span class="term-green">user@webos</span>:<span class="term-blue">~</span>$ ${escapeHtml(cmd)}`);

            if (cmd) {
                const result = executeCommand(cmd);
                if (result) appendTermLine(output, result);
            }

            output.scrollTop = output.scrollHeight;
        }
    });

    // Focus input on window click
    win.querySelector('.app-terminal').addEventListener('click', () => input.focus());
    input.focus();
}

function appendTermLine(output, html) {
    const line = document.createElement('div');
    line.className = 'term-line';
    line.innerHTML = html;
    output.appendChild(line);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function executeCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
        case 'help':
            return `<span class="term-cyan">Available commands:</span>
  help          - Show this help
  echo [text]   - Print text
  clear         - Clear terminal
  date          - Show current date/time
  whoami        - Show current user
  ls            - List files
  pwd           - Print working directory
  cat [file]    - Show file contents
  mkdir [name]  - Create directory
  touch [name]  - Create file
  neofetch      - System info
  history       - Command history
  uname         - System name
  calc [expr]   - Calculate expression`;

        case 'echo':
            return args.join(' ');

        case 'clear':
            setTimeout(() => {
                for (const [wid, w] of Object.entries(windows)) {
                    if (w.appId === 'terminal') {
                        w.el.querySelector('.term-output').innerHTML = '';
                        break;
                    }
                }
            }, 0);
            return '';

        case 'date':
            return `<span class="term-yellow">${new Date().toString()}</span>`;

        case 'whoami':
            return 'user';

        case 'pwd':
            return fmCurrentPath;

        case 'ls': {
            const path = args[0] || fmCurrentPath;
            const node = getVfsNode(path);
            if (!node || !node.children) return `<span class="term-red">ls: cannot access '${path}'</span>`;
            return Object.entries(node.children).map(([name, item]) =>
                item.type === 'dir' ? `<span class="term-blue">${name}/</span>` : name
            ).join('  ');
        }

        case 'cat': {
            if (!args[0]) return `<span class="term-red">cat: missing file operand</span>`;
            const node = getVfsNode(fmCurrentPath);
            if (node && node.children && node.children[args[0]]) {
                const file = node.children[args[0]];
                if (file.type === 'file') return escapeHtml(file.content || '');
                return `<span class="term-red">cat: ${args[0]}: Is a directory</span>`;
            }
            return `<span class="term-red">cat: ${args[0]}: No such file</span>`;
        }

        case 'mkdir': {
            if (!args[0]) return `<span class="term-red">mkdir: missing operand</span>`;
            const node = getVfsNode(fmCurrentPath);
            if (node && node.children) {
                node.children[args[0]] = { type: 'dir', children: {} };
                renderFileManager();
                return '';
            }
            return `<span class="term-red">mkdir: error</span>`;
        }

        case 'touch': {
            if (!args[0]) return `<span class="term-red">touch: missing operand</span>`;
            const node = getVfsNode(fmCurrentPath);
            if (node && node.children) {
                node.children[args[0]] = { type: 'file', content: '' };
                renderFileManager();
                return '';
            }
            return `<span class="term-red">touch: error</span>`;
        }

        case 'neofetch':
            return `<span class="term-cyan">
  ╔══════════════════════╗
  ║      WEB OS 1.0      ║
  ╠══════════════════════╣
  ║ OS:     Web OS       ║
  ║ Host:   Browser      ║
  ║ Kernel: JavaScript   ║
  ║ Shell:  WebShell 1.0 ║
  ║ DE:     Web Desktop  ║
  ║ Theme:  Glassmorphic ║
  ╚══════════════════════╝</span>`;

        case 'uname':
            return 'WebOS 1.0 JavaScript x86_64 Browser';

        case 'calc': {
            if (!args.length) return `<span class="term-red">calc: missing expression</span>`;
            try {
                const expr = args.join('');
                const safe = expr.replace(/[^0-9+\-*/.()% ]/g, '');
                const result = Function('"use strict"; return (' + safe + ')')();
                return `<span class="term-yellow">${result}</span>`;
            } catch {
                return `<span class="term-red">calc: invalid expression</span>`;
            }
        }

        case 'history':
            return `<span class="term-yellow">Command history not saved in this session.</span>`;

        default:
            return `<span class="term-red">${command}: command not found. Type 'help' for available commands.</span>`;
    }
}

/* ============ TEXT EDITOR ============ */
let teCurrentFile = 'Untitled';
let ideState = {
    openFiles: [],
    activePath: null,
    runtimeLogs: []
};
let ideBackgroundState = null;
let desktopWallpaperState = null;

function initTextEditor(win) {
    const area = win.querySelector('.te-area');
    area.addEventListener('input', () => updateWordCount(win));

    // Load saved content
    const saved = localStorage.getItem('webos-editor-content');
    if (saved) area.value = saved;
    updateWordCount(win);
}

function updateWordCount(win) {
    const area = win.querySelector('.te-area');
    const wc = win.querySelector('.te-wordcount');
    if (area && wc) {
        const text = area.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wc.textContent = `Words: ${words}`;
    }
}

function teNew() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'text-editor') {
            w.el.querySelector('.te-area').value = '';
            w.el.querySelector('.te-filename').textContent = 'Untitled';
            updateWordCount(w.el);
            break;
        }
    }
}

function teOpen() {
    // Show simple file picker from virtual FS
    const files = [];
    function collectFiles(node, path) {
        if (node.children) {
            for (const [name, item] of Object.entries(node.children)) {
                if (item.type === 'file' && (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.js') || name.endsWith('.css') || name.endsWith('.html'))) {
                    files.push({ name, path: path + '/' + name, content: item.content });
                }
                if (item.type === 'dir') collectFiles(item, path + '/' + name);
            }
        }
    }
    collectFiles(vfs['/home'], '/home');

    if (files.length === 0) { alert('No compatible files found.'); return; }

    const choice = prompt('Open file:\n' + files.map((f, i) => `${i + 1}. ${f.path}`).join('\n') + '\n\nEnter number:');
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < files.length) {
        openFileInEditor(files[idx].name, files[idx].content);
    }
}

function teSave() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'text-editor') {
            const content = w.el.querySelector('.te-area').value;
            const filename = w.el.querySelector('.te-filename').textContent;
            localStorage.setItem('webos-editor-content', content);

            // Save to virtual FS
            const node = getVfsNode(fmCurrentPath || '/home/Documents');
            if (node && node.children) {
                const fn = filename === 'Untitled' ? 'untitled.txt' : filename;
                node.children[fn] = { type: 'file', content: content };
                renderFileManager();
            }

            showNotification('File Saved', `${filename} has been saved.`);
            break;
        }
    }
}

function teUndo() { document.execCommand('undo'); }
function teRedo() { document.execCommand('redo'); }

function openFileInEditor(name, content) {
    openApp('text-editor');
    setTimeout(() => {
        for (const [wid, w] of Object.entries(windows)) {
            if (w.appId === 'text-editor') {
                const area = w.el.querySelector('.te-area');
                const fn = w.el.querySelector('.te-filename');
                if (area) area.value = content || '';
                if (fn) fn.textContent = name;
                updateWordCount(w.el);
                break;
            }
        }
    }, 100);
}

/* ============ IDE CODE EDITOR ============ */
function isIdeFile(name = '') {
    return /\.(js|ts|jsx|tsx|json|css|scss|html|xml|py|java|c|cpp|cs|php|rb|go|rs|sh)$/i.test(name);
}

function ideCollectFiles(root = vfs['/home'], basePath = '/home', files = []) {
    if (!root?.children) return files;
    Object.entries(root.children).forEach(([name, item]) => {
        const path = `${basePath}/${name}`;
        if (item.type === 'dir') ideCollectFiles(item, path, files);
        else if (item.type === 'file' && isIdeFile(name)) files.push({ name, path, content: item.content || '' });
    });
    return files;
}

function ideGetWindowEl() {
    for (const [, w] of Object.entries(windows)) {
        if (w.appId === 'ide-editor') return w.el;
    }
    return null;
}

function ideLerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function wallpaperLerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function initIdeEditor(win) {
    const area = win.querySelector('#ide-editor-area');
    if (area && !area.dataset.bound) {
        area.dataset.bound = '1';
        area.addEventListener('input', () => {
            const active = ideState.openFiles.find(file => file.path === ideState.activePath);
            if (!active) return;
            active.content = area.value;
            active.dirty = true;
            ideRenderTabs(win);
            ideUpdateStatus(win);
        });
        area.addEventListener('click', () => ideUpdateStatus(win));
        area.addEventListener('keyup', () => ideUpdateStatus(win));
    }
    ideInitAnimatedBackground(win);
    ideRenderExplorer(win);
    ideRenderTabs(win);
    ideUpdateEditor(win);
    ideRenderRuntime(win);
}

function ideInitAnimatedBackground(win) {
    const bg = win.querySelector('#ide-animated-bg');
    if (!bg || bg.dataset.bound === '1') return;
    bg.dataset.bound = '1';

    const blobs = Array.from(bg.querySelectorAll('.ide-bg-blob'));
    ideBackgroundState = {
        win,
        bg,
        blobs: blobs.map((el, index) => ({
            el,
            currentX: 18 + index * 22,
            currentY: 24 + index * 16,
            targetX: 18 + index * 22,
            targetY: 24 + index * 16,
            amplitudeX: 8 + index * 4,
            amplitudeY: 10 + index * 5,
            speed: 0.00035 + index * 0.00014
        })),
        mouseX: 0.5,
        mouseY: 0.5,
        rafId: 0
    };

    const onPointerMove = (event) => {
        const rect = bg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ideBackgroundState.mouseX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        ideBackgroundState.mouseY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    };

    bg.addEventListener('pointermove', onPointerMove);
    bg.addEventListener('pointerleave', () => {
        if (!ideBackgroundState) return;
        ideBackgroundState.mouseX = 0.5;
        ideBackgroundState.mouseY = 0.5;
    });

    const tick = (time) => {
        if (!ideBackgroundState || !ideBackgroundState.bg.isConnected) {
            if (ideBackgroundState?.rafId) cancelAnimationFrame(ideBackgroundState.rafId);
            ideBackgroundState = null;
            return;
        }

        ideBackgroundState.blobs.forEach((blob, index) => {
            const waveX = Math.sin(time * blob.speed + index * 1.6);
            const waveY = Math.cos(time * (blob.speed * 0.78) + index * 2.1);
            blob.targetX = 50 + waveX * blob.amplitudeX + (ideBackgroundState.mouseX - 0.5) * (8 + index * 4);
            blob.targetY = 50 + waveY * blob.amplitudeY + (ideBackgroundState.mouseY - 0.5) * (10 + index * 3);
            blob.currentX = ideLerp(blob.currentX, blob.targetX, 0.055);
            blob.currentY = ideLerp(blob.currentY, blob.targetY, 0.055);
            blob.el.style.transform = `translate(${blob.currentX - 50}%, ${blob.currentY - 50}%)`;
        });

        ideBackgroundState.rafId = requestAnimationFrame(tick);
    };

    ideBackgroundState.rafId = requestAnimationFrame(tick);
}

function ideRenderExplorer(win = ideGetWindowEl()) {
    const tree = win?.querySelector('#ide-file-tree');
    if (!tree) return;
    const files = ideCollectFiles();
    tree.innerHTML = '';
    files.forEach(file => {
        const item = document.createElement('button');
        item.className = 'ide-file-item' + (file.path === ideState.activePath ? ' active' : '');
        item.innerHTML = `<span class="material-icons-round">description</span><span class="ide-file-name">${file.name}</span><span class="ide-file-path">${file.path.replace('/home/', '')}</span>`;
        item.onclick = () => openFileInIde(file.path);
        tree.appendChild(item);
    });
}

function ideRenderTabs(win = ideGetWindowEl()) {
    const tabs = win?.querySelector('#ide-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    if (ideState.openFiles.length === 0) {
        tabs.innerHTML = '<div class="ide-empty-tabs">No files open</div>';
        return;
    }
    ideState.openFiles.forEach(file => {
        const tab = document.createElement('button');
        tab.className = 'ide-tab' + (file.path === ideState.activePath ? ' active' : '');
        tab.innerHTML = `<span>${file.name}${file.dirty ? ' •' : ''}</span><span class="material-icons-round">close</span>`;
        tab.onclick = () => ideSetActiveFile(file.path);
        tab.querySelector('.material-icons-round').onclick = (event) => {
            event.stopPropagation();
            ideCloseTab(file.path);
        };
        tabs.appendChild(tab);
    });
}

function ideUpdateEditor(win = ideGetWindowEl()) {
    const area = win?.querySelector('#ide-editor-area');
    const active = ideState.openFiles.find(file => file.path === ideState.activePath);
    if (!area) return;
    area.value = active ? active.content : '';
    area.disabled = !active;
    ideRenderExplorer(win);
    ideRenderTabs(win);
    ideUpdateStatus(win);
    ideRenderRuntime(win);
}

function ideUpdateStatus(win = ideGetWindowEl()) {
    const area = win?.querySelector('#ide-editor-area');
    const pathEl = win?.querySelector('#ide-status-path');
    const metaEl = win?.querySelector('#ide-status-meta');
    const active = ideState.openFiles.find(file => file.path === ideState.activePath);
    if (pathEl) pathEl.textContent = active ? active.path : 'No file selected';
    if (!metaEl || !area) return;
    const beforeCursor = area.value.slice(0, area.selectionStart);
    const line = beforeCursor.split('\n').length;
    const column = beforeCursor.length - beforeCursor.lastIndexOf('\n');
    metaEl.textContent = active ? `Ln ${line}, Col ${column}` : 'Ln 1, Col 1';
}

function ideRenderRuntime(win = ideGetWindowEl()) {
    const consoleEl = win?.querySelector('#ide-runtime-console');
    if (!consoleEl) return;
    const active = ideState.openFiles.find(file => file.path === ideState.activePath);
    if (ideState.runtimeLogs.length === 0) {
        consoleEl.innerHTML = `<div class="ide-runtime-empty">${active ? 'Press Run to execute the active file.' : 'Open a file to run code.'}</div>`;
        return;
    }
    consoleEl.innerHTML = ideState.runtimeLogs.map(log => `<div class="ide-runtime-line ${log.type || 'info'}">${log.text}</div>`).join('');
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function ideSetRuntimeLogs(logs) {
    ideState.runtimeLogs = logs;
    ideRenderRuntime();
}

function ideAppendRuntimeLog(text, type = 'info') {
    ideState.runtimeLogs.push({ text, type });
    ideRenderRuntime();
}

function ideClearOutput() {
    ideState.runtimeLogs = [];
    const frame = ideGetWindowEl()?.querySelector('#ide-runtime-frame');
    if (frame) frame.srcdoc = '';
    ideRenderRuntime();
}

function ideSetActiveFile(path) {
    ideState.activePath = path;
    ideUpdateEditor();
}

function openFileInIde(path) {
    const node = getVfsNode(path);
    if (!node || node.type !== 'file') return;
    openApp('ide-editor');
    setTimeout(() => {
        const existing = ideState.openFiles.find(file => file.path === path);
        if (!existing) {
            ideState.openFiles.push({
                path,
                name: path.split('/').pop(),
                content: node.content || '',
                dirty: false
            });
        }
        ideState.activePath = path;
        ideUpdateEditor();
        ideGetWindowEl()?.querySelector('#ide-editor-area')?.focus();
    }, 100);
}

function ideSaveFile() {
    const active = ideState.openFiles.find(file => file.path === ideState.activePath);
    if (!active) return;
    const node = getVfsNode(active.path);
    if (!node || node.type !== 'file') return;
    node.content = active.content;
    active.dirty = false;
    ideUpdateEditor();
    renderFileManager();
    showNotification('IDE', `${active.name} saved.`);
}

function ideRunFile() {
    const win = ideGetWindowEl();
    const frame = win?.querySelector('#ide-runtime-frame');
    const active = ideState.openFiles.find(file => file.path === ideState.activePath);
    if (!active || !frame) {
        ideSetRuntimeLogs([{ text: 'No active file to run.', type: 'warn' }]);
        return;
    }

    const ext = active.name.split('.').pop().toLowerCase();
    ideState.runtimeLogs = [];

    if (ext === 'html') {
        frame.srcdoc = active.content;
        ideSetRuntimeLogs([{ text: `Rendered ${active.name} in preview.`, type: 'success' }]);
        return;
    }

    if (ext === 'js') {
        const runtimeHtml = `<!doctype html>
<html><body>
<script>
const send = (type, value) => parent.postMessage({ source: 'webos-ide-runtime', type, value }, '*');
console.log = (...args) => send('log', args.map(String).join(' '));
console.error = (...args) => send('error', args.map(String).join(' '));
window.onerror = (msg, src, line, col) => send('error', msg + ' (' + line + ':' + col + ')');
try {
${active.content}
send('success', 'Execution finished.');
} catch (error) {
send('error', error && error.stack ? error.stack : String(error));
}
</script>
</body></html>`;
        frame.srcdoc = runtimeHtml;
        ideSetRuntimeLogs([{ text: `Running ${active.name}...`, type: 'info' }]);
        return;
    }

    if (ext === 'css') {
        frame.srcdoc = `<!doctype html><html><head><style>${active.content}</style></head><body><div style="padding:20px;font-family:sans-serif">CSS preview loaded. Styles apply to this preview page.</div></body></html>`;
        ideSetRuntimeLogs([{ text: `Previewing stylesheet ${active.name}.`, type: 'success' }]);
        return;
    }

    if (ext === 'json') {
        try {
            JSON.parse(active.content);
            frame.srcdoc = '';
            ideSetRuntimeLogs([{ text: `${active.name} is valid JSON.`, type: 'success' }]);
        } catch (error) {
            frame.srcdoc = '';
            ideSetRuntimeLogs([{ text: error.message, type: 'error' }]);
        }
        return;
    }

    frame.srcdoc = '';
    ideSetRuntimeLogs([{ text: `Run is not supported yet for .${ext} files.`, type: 'warn' }]);
}

function ideCloseTab(path) {
    const index = ideState.openFiles.findIndex(file => file.path === path);
    if (index === -1) return;
    ideState.openFiles.splice(index, 1);
    if (ideState.activePath === path) {
        ideState.activePath = ideState.openFiles[Math.max(0, index - 1)]?.path || ideState.openFiles[0]?.path || null;
    }
    ideUpdateEditor();
}

function ideCloseActiveTab() {
    if (ideState.activePath) ideCloseTab(ideState.activePath);
}

function ideOpenQuickPick() {
    const files = ideCollectFiles();
    if (files.length === 0) {
        alert('No compatible code files found.');
        return;
    }
    const choice = prompt('Open file in IDE:\n' + files.map((file, index) => `${index + 1}. ${file.path}`).join('\n') + '\n\nEnter number:');
    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < files.length) openFileInIde(files[index].path);
}

function ideNewFile() {
    const name = prompt('New code file name:', 'untitled.js');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const parent = getVfsNode('/home/Downloads');
    if (!parent?.children) return;
    if (parent.children[trimmed]) {
        alert('A file with this name already exists in Downloads.');
        return;
    }
    parent.children[trimmed] = { type: 'file', content: '' };
    ideRenderExplorer();
    renderFileManager();
    openFileInIde(`/home/Downloads/${trimmed}`);
}

window.addEventListener('message', (event) => {
    if (event.data?.source !== 'webos-ide-runtime') return;
    ideAppendRuntimeLog(event.data.value || '', event.data.type === 'success' ? 'success' : event.data.type);
});

/* ============ BROWSER ============ */
function initBrowser(win) {
    const urlInput = win.querySelector('.br-url');
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') brGo();
    });
}

function brGo() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'browser') {
            const url = w.el.querySelector('.br-url').value;
            const frame = w.el.querySelector('.br-frame');
            let fullUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                fullUrl = 'https://' + url;
            }
            frame.src = fullUrl;
            break;
        }
    }
}

function brBack() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'browser') {
            try { w.el.querySelector('.br-frame').contentWindow.history.back(); } catch (e) { }
            break;
        }
    }
}
function brForward() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'browser') {
            try { w.el.querySelector('.br-frame').contentWindow.history.forward(); } catch (e) { }
            break;
        }
    }
}
function brReload() {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'browser') {
            try { w.el.querySelector('.br-frame').contentWindow.location.reload(); } catch (e) {
                const url = w.el.querySelector('.br-url').value;
                w.el.querySelector('.br-frame').src = url;
            }
            break;
        }
    }
}

/* ============ CALCULATOR ============ */
let calcDisplay = '0';
let calcExpression = '';
let calcNewNumber = true;
let calcOperator = null;
let calcPrevValue = null;

function initCalculator(win) {
    // Keyboard support
    win.addEventListener('keydown', (e) => {
        if (e.key >= '0' && e.key <= '9') calcAction('num', e.key);
        else if (e.key === '+') calcAction('op', '+');
        else if (e.key === '-') calcAction('op', '-');
        else if (e.key === '*') calcAction('op', '*');
        else if (e.key === '/') calcAction('op', '/');
        else if (e.key === '.') calcAction('dot');
        else if (e.key === 'Enter' || e.key === '=') calcAction('eq');
        else if (e.key === 'Escape') calcAction('clear');
        else if (e.key === '%') calcAction('percent');
    });
}

function calcAction(type, value) {
    let calcResult, calcExpr;
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'calculator') {
            calcResult = w.el.querySelector('.calc-result');
            calcExpr = w.el.querySelector('.calc-expression');
            break;
        }
    }
    if (!calcResult) return;

    switch (type) {
        case 'num':
            if (calcNewNumber) { calcDisplay = value; calcNewNumber = false; }
            else { calcDisplay = calcDisplay === '0' ? value : calcDisplay + value; }
            break;
        case 'op':
            if (calcOperator && !calcNewNumber) {
                calcPrevValue = calcCompute(calcPrevValue, parseFloat(calcDisplay), calcOperator);
                calcDisplay = String(calcPrevValue);
            } else { calcPrevValue = parseFloat(calcDisplay); }
            calcOperator = value;
            calcExpression = calcDisplay + ' ' + getOpSymbol(value);
            calcNewNumber = true;
            break;
        case 'eq':
            if (calcOperator) {
                calcExpression = calcPrevValue + ' ' + getOpSymbol(calcOperator) + ' ' + calcDisplay + ' =';
                calcPrevValue = calcCompute(calcPrevValue, parseFloat(calcDisplay), calcOperator);
                calcDisplay = String(calcPrevValue);
                calcOperator = null;
                calcNewNumber = true;
            }
            break;
        case 'clear':
            calcDisplay = '0'; calcExpression = ''; calcOperator = null; calcPrevValue = null; calcNewNumber = true;
            break;
        case 'sign': calcDisplay = String(-parseFloat(calcDisplay)); break;
        case 'percent': calcDisplay = String(parseFloat(calcDisplay) / 100); break;
        case 'dot':
            if (calcNewNumber) { calcDisplay = '0.'; calcNewNumber = false; }
            else if (!calcDisplay.includes('.')) { calcDisplay += '.'; }
            break;
    }

    if (calcDisplay.length > 12) { calcDisplay = parseFloat(calcDisplay).toPrecision(10); }
    calcResult.textContent = calcDisplay;
    calcExpr.textContent = calcExpression;
}

function calcCompute(a, b, op) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b !== 0 ? a / b : 'Error';
        default: return b;
    }
}

function getOpSymbol(op) {
    switch (op) {
        case '+': return '+'; case '-': return '−'; case '*': return '×'; case '/': return '÷';
        default: return op;
    }
}

/* ============ SETTINGS ============ */
let currentUser = 'User';
let users = JSON.parse(localStorage.getItem('webos-users')) || ['User'];

function initSettings(win) {
    const keyInput = win.querySelector('#gemini-api-key');
    if (keyInput) {
        keyInput.value = localStorage.getItem('webos-gemini-key') || '';
    }

    // Load Lock Settings
    const lockBlur = win.querySelector('#set-lock-blur');
    if (lockBlur) lockBlur.checked = localStorage.getItem('webos-lock-blur') !== 'false';

    const lockStartup = win.querySelector('#set-lock-startup');
    if (lockStartup) lockStartup.checked = localStorage.getItem('webos-lock-startup') === 'true';

    const lockTimer = win.querySelector('#set-lock-timer');
    if (lockTimer) lockTimer.value = localStorage.getItem('webos-lock-timer') || '0';

    const recoveryVal = win.querySelector('#set-recovery-key-val');
    if (recoveryVal) {
        let key = localStorage.getItem('webos-recovery-key');
        if (!key) {
            key = generateRecoveryKey();
            localStorage.setItem('webos-recovery-key', key);
        }
        recoveryVal.textContent = key;
    }

    renderUsersList(win);
}

async function saveLockPassword(pwd) {
    if (!pwd) {
        localStorage.removeItem('webos-lock-password');
        showNotification('Security', 'Lock screen password removed.');
        return;
    }
    const hashed = await hashPassword(pwd);
    localStorage.setItem('webos-lock-password', hashed);
    showNotification('Security', 'Lock screen password updated and hashed.');
}

function setAutoLockTimer(minutes) {
    localStorage.setItem('webos-lock-timer', minutes);
    showNotification('Behavior', `Auto-lock set to ${minutes === '0' ? 'Never' : minutes + ' minutes'}.`);
    // Logic to update main timer needs to happen in main.js
}

function copyRecoveryKey() {
    const key = localStorage.getItem('webos-recovery-key');
    if (key) {
        navigator.clipboard.writeText(key);
        showNotification('System', 'Recovery key copied to clipboard.');
    }
}

/* --- Multi-User Management --- */
function renderUsersList(win) {
    const list = win.querySelector('#set-users-list');
    if (!list) return;
    list.innerHTML = '';
    users.forEach(u => {
        const el = document.createElement('div');
        el.className = 'user-mgmt-item';
        el.innerHTML = `
            <span class="material-icons-round">account_circle</span>
            <div class="user-mgmt-info">
                <div class="user-mgmt-name">${u}</div>
                <div class="user-mgmt-role">${u === 'User' ? 'Administrator' : 'Standard User'}</div>
            </div>
            ${u !== 'User' ? `<button class="set-btn-small" onclick="deleteUser('${u}')">Remove</button>` : ''}
        `;
        list.appendChild(el);
    });
}

function showAddUserDialog() {
    showAddUserDialogWithOptions();
}

function showAddUserDialogWithOptions(options = {}) {
    const promptText = options.promptText || 'Enter new user name:';
    const successLabel = options.successLabel || 'User';
    const switchDelay = typeof options.switchDelay === 'number' ? options.switchDelay : 1500;
    const rawName = prompt(promptText);
    const name = rawName ? rawName.trim() : '';
    if (name && !users.includes(name)) {
        users.push(name);
        localStorage.setItem('webos-users', JSON.stringify(users));
        renderUsersList(document.querySelector('.app-settings'));
        if (typeof renderLockUsers === 'function') renderLockUsers();
        showNotification('System', `${successLabel} ${name} added. Switching to new account...`);

        // Switch to the newly created user after a brief delay
        setTimeout(() => {
            if (typeof selectUser === 'function') selectUser(name);
            if (typeof switchUser === 'function') switchUser();
        }, switchDelay);
    } else if (name && users.includes(name)) {
        showNotification('System', `Account ${name} already exists.`);
    }
}

function createChatAiAccount() {
    showAddUserDialogWithOptions({
        promptText: 'Enter new Chat AI account name:',
        successLabel: 'Chat AI account'
    });
}

function deleteUser(name) {
    if (confirm(`Remove user ${name}? All their data will be lost.`)) {
        users = users.filter(u => u !== name);
        localStorage.setItem('webos-users', JSON.stringify(users));
        renderUsersList(document.querySelector('.app-settings'));
        showNotification('System', `User ${name} removed.`);
    }
}

function setTab(tab) {
    for (const [wid, w] of Object.entries(windows)) {
        if (w.appId === 'settings') {
            w.el.querySelectorAll('.set-panel').forEach(p => p.classList.add('hidden'));
            w.el.querySelector('#set-' + tab)?.classList.remove('hidden');
            w.el.querySelectorAll('.set-nav').forEach(n => n.classList.remove('active'));
            w.el.querySelectorAll('.set-nav').forEach(n => {
                if (n.getAttribute('onclick')?.includes(tab)) n.classList.add('active');
            });
            break;
        }
    }
}

function setAccent(color, silent) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-soft', color + '40');
    document.documentElement.style.setProperty('--accent-glow', color + '80');
    localStorage.setItem('webos-accent', color);
    document.querySelectorAll('.set-color').forEach(c => {
        c.classList.toggle('active', c.style.background === color || c.style.backgroundColor === color);
    });
    if (!silent) showNotification('Appearance', 'Accent color updated.');
}

function setWallpaper(wp, silent) {
    const desktop = document.getElementById('desktop');
    const wallpaperImage = document.getElementById('desktop-wallpaper-image');
    const gradients = {
        'gradient1': 'linear-gradient(135deg, #0c0c1d, #1a1a3e, #2d1b69)',
        'gradient2': 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
        'gradient3': 'linear-gradient(135deg, #1a0533, #3b1f5e, #6c2c91)',
        'gradient4': 'linear-gradient(135deg, #141e30, #243b55)',
    };

    if (wallpaperImage) {
        if (wp.startsWith('gradient')) {
            wallpaperImage.style.background = gradients[wp] || gradients['gradient1'];
        } else {
            wallpaperImage.style.background = `url('${wp}') center/cover no-repeat`;
        }
    }
    if (desktop) desktop.dataset.wallpaper = wp;
    localStorage.setItem('webos-wallpaper', wp);
    document.querySelectorAll('.set-wp').forEach(w => {
        const onclick = w.getAttribute('onclick') || '';
        w.classList.toggle('active', onclick.includes(wp));
    });
    if (!silent) showNotification('Appearance', 'Wallpaper updated.');
}

function setScale(value) {
    document.body.style.zoom = value / 100;
    const el = document.getElementById('set-scale-val');
    if (el) el.textContent = value + '%';
}

function saveGeminiKey(key) {
    localStorage.setItem('webos-gemini-key', key);
    localStorage.removeItem('webos-chat-preview-fallbacks');
    showNotification('AI Settings', 'Gemini API key saved.');
}

function initAnimatedWallpaper() {
    const desktop = document.getElementById('desktop');
    const wallpaper = document.getElementById('desktop-wallpaper');
    if (!desktop || !wallpaper || wallpaper.dataset.bound === '1') return;
    wallpaper.dataset.bound = '1';

    const imageLayer = document.getElementById('desktop-wallpaper-image');
    const blobs = Array.from(wallpaper.querySelectorAll('.desktop-wallpaper-blob'));

    desktopWallpaperState = {
        desktop,
        wallpaper,
        imageLayer,
        mouseX: 0.5,
        mouseY: 0.5,
        rafId: 0,
        blobs: blobs.map((el, index) => ({
            el,
            currentX: 50,
            currentY: 50,
            targetX: 50,
            targetY: 50,
            amplitudeX: 12 + index * 6,
            amplitudeY: 10 + index * 7,
            speed: 0.00018 + index * 0.00008
        })),
        imageOffsetX: 0,
        imageOffsetY: 0
    };

    const onPointerMove = (event) => {
        const rect = wallpaper.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        desktopWallpaperState.mouseX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        desktopWallpaperState.mouseY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    };

    desktop.addEventListener('pointermove', onPointerMove);
    desktop.addEventListener('pointerleave', () => {
        if (!desktopWallpaperState) return;
        desktopWallpaperState.mouseX = 0.5;
        desktopWallpaperState.mouseY = 0.5;
    });

    const tick = (time) => {
        if (!desktopWallpaperState || !desktopWallpaperState.wallpaper.isConnected) {
            if (desktopWallpaperState?.rafId) cancelAnimationFrame(desktopWallpaperState.rafId);
            desktopWallpaperState = null;
            return;
        }

        desktopWallpaperState.blobs.forEach((blob, index) => {
            const waveX = Math.sin(time * blob.speed + index * 1.7);
            const waveY = Math.cos(time * blob.speed * 0.82 + index * 2.4);
            blob.targetX = 50 + waveX * blob.amplitudeX + (desktopWallpaperState.mouseX - 0.5) * (10 + index * 4);
            blob.targetY = 50 + waveY * blob.amplitudeY + (desktopWallpaperState.mouseY - 0.5) * (12 + index * 4);
            blob.currentX = wallpaperLerp(blob.currentX, blob.targetX, 0.045);
            blob.currentY = wallpaperLerp(blob.currentY, blob.targetY, 0.045);
            blob.el.style.transform = `translate(${blob.currentX - 50}%, ${blob.currentY - 50}%)`;
        });

        if (desktopWallpaperState.imageLayer) {
            const targetOffsetX = (desktopWallpaperState.mouseX - 0.5) * 16;
            const targetOffsetY = (desktopWallpaperState.mouseY - 0.5) * 12;
            desktopWallpaperState.imageOffsetX = wallpaperLerp(desktopWallpaperState.imageOffsetX, targetOffsetX, 0.035);
            desktopWallpaperState.imageOffsetY = wallpaperLerp(desktopWallpaperState.imageOffsetY, targetOffsetY, 0.035);
            desktopWallpaperState.imageLayer.style.transform = `translate(${desktopWallpaperState.imageOffsetX}px, ${desktopWallpaperState.imageOffsetY}px) scale(1.05)`;
        }

        desktopWallpaperState.rafId = requestAnimationFrame(tick);
    };

    desktopWallpaperState.rafId = requestAnimationFrame(tick);
}

function setThemeMode(mode, silent) {
    document.body.classList.remove('light-mode');
    if (mode === 'light') document.body.classList.add('light-mode');
    localStorage.setItem('webos-theme-mode', mode);
    document.querySelectorAll('.set-mode-card').forEach(card => {
        card.classList.toggle('active', card.id === 'mode-' + mode);
    });
    if (!silent) showNotification('Theme Mode', `Switched to ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode.`);
}

const uiStyles = ['glassmorphism', 'liquid-glass', 'neumorphism', 'acrylic', 'flat', 'hyggshi-os'];
function setUIStyle(style, silent) {
    uiStyles.forEach(s => document.body.classList.remove('theme-' + s));
    if (style !== 'glassmorphism') document.body.classList.add('theme-' + style);
    
    // Set data attribute for advanced theme engine
    const styleDataMap = {
        'glassmorphism': 'glass',
        'liquid-glass': 'liquid',
        'neumorphism': 'neumorphic',
        'acrylic': 'acrylic',
        'flat': 'flat',
        'hyggshi-os': 'hyggshi'
    };
    document.body.dataset.uiStyle = styleDataMap[style] || style;

    localStorage.setItem('webos-ui-style', style);
    document.querySelectorAll('.set-style-card').forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        card.classList.toggle('active', onclick.includes(style));
    });
    if (!silent) {
        const names = { 
            'glassmorphism': 'Standard Glass', 
            'liquid-glass': 'Liquid Glass', 
            'neumorphism': 'Neumorphic Glass', 
            'acrylic': 'Acrylic Glass', 
            'flat': 'Flat Glass',
            'hyggshi-os': 'Hyggshi OS'
        };
        showNotification('UI Style', `Switched to ${names[style] || style}.`);
    }
}

/* ============ ABOUT ============ */
function initAbout(win) { /* Logic if needed */ }
