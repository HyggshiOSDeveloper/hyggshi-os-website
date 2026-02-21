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
    const name = prompt('Enter new user name:');
    if (name && !users.includes(name)) {
        users.push(name);
        localStorage.setItem('webos-users', JSON.stringify(users));
        renderUsersList(document.querySelector('.app-settings'));
        showNotification('System', `User ${name} added. Switching to new account...`);

        // Switch to the newly created user after a brief delay
        setTimeout(() => {
            if (typeof selectUser === 'function') selectUser(name);
            if (typeof switchUser === 'function') switchUser();
        }, 1500);
    }
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
    if (wp.startsWith('gradient')) {
        const gradients = {
            'gradient1': 'linear-gradient(135deg, #0c0c1d, #1a1a3e, #2d1b69)',
            'gradient2': 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
            'gradient3': 'linear-gradient(135deg, #1a0533, #3b1f5e, #6c2c91)',
            'gradient4': 'linear-gradient(135deg, #141e30, #243b55)',
        };
        desktop.style.background = gradients[wp] || gradients['gradient1'];
    } else {
        desktop.style.background = `url('${wp}') center/cover no-repeat`;
        desktop.style.backgroundColor = '#0a0a1a';
    }
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
    showNotification('AI Settings', 'Gemini API key saved.');
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

const uiStyles = ['glassmorphism', 'liquid-glass', 'neumorphism', 'acrylic', 'flat'];
function setUIStyle(style, silent) {
    uiStyles.forEach(s => document.body.classList.remove('theme-' + s));
    if (style !== 'glassmorphism') document.body.classList.add('theme-' + style);
    localStorage.setItem('webos-ui-style', style);
    document.querySelectorAll('.set-style-card').forEach(card => {
        const onclick = card.getAttribute('onclick') || '';
        card.classList.toggle('active', onclick.includes(style));
    });
    if (!silent) {
        const names = { 'glassmorphism': 'Standard Glass', 'liquid-glass': 'Liquid Glass', 'neumorphism': 'Neumorphic Glass', 'acrylic': 'Acrylic Glass', 'flat': 'Flat Glass' };
        showNotification('UI Style', `Switched to ${names[style] || style}.`);
    }
}

/* ============ ABOUT ============ */
function initAbout(win) { /* Logic if needed */ }
