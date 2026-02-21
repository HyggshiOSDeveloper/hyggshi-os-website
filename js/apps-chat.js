/* ============ CHAT AI logic ============ */
let chatSessions = [];
let currentChatId = null;
let chatModel = 'gemini-2.5-flash';
let currentChatImages = []; // Stores {base64, full, mimeType}

// --- Markdown Parser ---
function chatParseMarkdown(text) {
    if (!text) return "";
    text = text.replace(/```([\s\S]*?)```/g, '<div class="chat-code-block"><pre><code>$1</code></pre></div>');
    text = text.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/^\s*\* (.*)$/gm, '<li class="chat-list-item">$1</li>');
    text = text.replace(/(<li.*<\/li>)/gs, '<ul class="chat-list">$1</ul>');
    if (!text.includes('<pre>')) text = text.replace(/\n/g, '<br>');
    return text;
}

function initChatAi(win) {
    const textarea = win.querySelector('#chat-textarea');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSendMessage();
            }
        });
    }
    const modelSelect = win.querySelector('#chat-model-select');
    if (modelSelect) modelSelect.value = chatModel;

    chatLoadFromDisk().then(() => {
        if (chatSessions.length === 0) {
            chatNewConversation(false);
        } else {
            chatLoadSession(chatSessions[0].id);
        }
        chatRenderHistory();
    });
}

// IndexedDB Helper
const ChatDB = {
    dbName: 'WebOS-ChatAI', storeName: 'sessions', dbVersion: 1,
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject('Database error');
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
            };
            request.onsuccess = (e) => resolve(e.target.result);
        });
    },
    async save(sessions) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(sessions, 'all_sessions');
            request.onsuccess = () => resolve();
            request.onerror = () => reject();
        });
    },
    async load() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get('all_sessions');
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject();
        });
    }
};

function chatRenderHistory() {
    let winEl = null;
    for (const [id, w] of Object.entries(windows)) {
        if (w.appId === 'chat-ai') { winEl = w.el; break; }
    }
    if (!winEl) return;
    const list = winEl.querySelector('#chat-history-list');
    if (!list) return;
    list.innerHTML = '';
    chatSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'chat-history-item' + (currentChatId === session.id ? ' active' : '');
        item.innerHTML = `<span class="material-icons-round">chat_bubble_outline</span><span class="chat-item-title">${session.title || 'New Conversation'}</span><button class="chat-item-delete" onclick="chatDeleteSession('${session.id}', event)"><span class="material-icons-round">delete_outline</span></button>`;
        item.onclick = () => chatLoadSession(session.id);
        list.appendChild(item);
    });
}

function chatDeleteSession(id, event) {
    if (event) event.stopPropagation();
    const index = chatSessions.findIndex(s => s.id === id);
    if (index === -1) return;
    chatSessions.splice(index, 1);
    if (currentChatId === id) {
        if (chatSessions.length > 0) chatLoadSession(chatSessions[0].id);
        else chatNewConversation(true);
    } else chatRenderHistory();
    chatSaveToDisk();
}

function chatNewConversation(render = true) {
    const id = 'chat-' + Date.now();
    const newSession = { id, title: 'New Conversation', messages: [], model: chatModel };
    chatSessions.unshift(newSession);
    currentChatId = id;
    if (render) { chatLoadSession(id); chatRenderHistory(); chatSaveToDisk(); }
}

function chatLoadSession(id) {
    currentChatId = id;
    const session = chatSessions.find(s => s.id === id);
    if (!session) return;
    let winEl = null;
    for (const [wid, w] of Object.entries(windows)) if (w.appId === 'chat-ai') { winEl = w.el; break; }
    if (!winEl) return;
    const messagesEl = winEl.querySelector('#chat-messages');
    messagesEl.innerHTML = '';
    if (session.messages.length === 0) chatAddMessage(winEl, 'ai', "Hello! I'm your AI assistant. How can I help you today?", null, false);
    else session.messages.forEach(msg => chatAddMessage(winEl, msg.role, msg.text, msg.images, false));
    chatModel = session.model || 'gemini-2.5-flash';
    const modelSelect = winEl.querySelector('#chat-model-select');
    if (modelSelect) modelSelect.value = chatModel;
    chatRenderHistory();
    const textarea = winEl.querySelector('#chat-textarea');
    if (textarea) textarea.focus();
}

function chatSetModel(val) {
    chatModel = val;
    const session = chatSessions.find(s => s.id === currentChatId);
    if (session) { session.model = val; chatSaveToDisk(); }
}

function chatHandleFileUpload(input) {
    if (input.files) {
        Array.from(input.files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                currentChatImages.push({ base64: e.target.result.split(',')[1], full: e.target.result, mimeType: file.type });
                chatRenderPreviews();
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    }
}

function chatRenderPreviews() {
    let winEl = null;
    for (const [id, w] of Object.entries(windows)) if (w.appId === 'chat-ai') { winEl = w.el; break; }
    if (!winEl) return;
    const previewContainer = winEl.querySelector('#chat-image-preview');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    currentChatImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'chat-preview-item';
        item.innerHTML = `<img src="${img.full}" alt="Preview"><div class="chat-preview-remove" onclick="chatRemovePreview(${index})"><span class="material-icons-round">close</span></div>`;
        previewContainer.appendChild(item);
    });
}

function chatRemovePreview(index) {
    currentChatImages.splice(index, 1);
    chatRenderPreviews();
}

async function chatSaveToDisk() {
    try { await ChatDB.save(chatSessions); localStorage.setItem('webos-chat-model', chatModel); }
    catch (e) { console.error("IndexedDB Save Error:", e); }
}

async function chatLoadFromDisk() {
    const oldData = localStorage.getItem('webos-chat-sessions');
    if (oldData) {
        try { chatSessions = JSON.parse(oldData); await chatSaveToDisk(); localStorage.removeItem('webos-chat-sessions'); }
        catch (e) { console.error("Migration failed", e); }
    } else chatSessions = await ChatDB.load();
    const savedModel = localStorage.getItem('webos-chat-model');
    if (savedModel) chatModel = savedModel;
}

function chatSendMessage() {
    let winEl = null;
    for (const [id, w] of Object.entries(windows)) if (w.appId === 'chat-ai') { winEl = w.el; break; }
    if (!winEl) return;
    const textarea = winEl.querySelector('#chat-textarea');
    const text = textarea.value.trim();
    if (!text && currentChatImages.length === 0) return;
    chatAddMessage(winEl, 'user', text, [...currentChatImages]);
    textarea.value = ''; textarea.style.height = '';
    const session = chatSessions.find(s => s.id === currentChatId);
    if (session) {
        if (session.messages.length === 0) session.title = text.length > 20 ? text.substring(0, 20) + '...' : text;
        session.messages.push({ role: 'user', text, images: currentChatImages.length > 0 ? [...currentChatImages] : null });
        chatSaveToDisk(); chatRenderHistory();
    }
    const apiKey = localStorage.getItem('webos-gemini-key');
    const messages = winEl.querySelector('#chat-messages');
    const typingId = 'typing-' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId; typingEl.className = 'chat-msg ai';
    typingEl.innerHTML = `<div class="chat-msg-avatar"><span class="material-icons-round">psychology</span></div><div class="chat-msg-content">...</div>`;
    messages.appendChild(typingEl); messages.scrollTop = messages.scrollHeight;
    if (apiKey && apiKey.trim().length > 10) chatCallGemini(winEl, apiKey, text, typingEl, currentChatImages);
    else {
        setTimeout(() => {
            typingEl.remove();
            const responses = ["I'm currently in simulation mode...", "That's an interesting question!", "I can certainly help you with that.", "The Google AI Studio style...", "I'm simulated..."];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            chatAddMessage(winEl, 'ai', randomResponse);
            if (session) { session.messages.push({ role: 'ai', text: randomResponse }); chatSaveToDisk(); }
        }, 1500);
    }
    currentChatImages = []; chatRenderPreviews();
}

async function chatCallGemini(winEl, apiKey, prompt, typingEl, images = []) {
    const modelName = chatModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const parts = [{ text: prompt }];
    images.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
        const data = await response.json();
        typingEl.remove();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
            const aiText = data.candidates[0].content.parts[0].text;
            chatAddMessage(winEl, 'ai', aiText);
            const session = chatSessions.find(s => s.id === currentChatId);
            if (session) { session.messages.push({ role: 'ai', text: aiText }); chatSaveToDisk(); }
        } else chatAddMessage(winEl, 'ai', data.error ? `API Error: ${data.error.message}` : "Error processing request.");
    } catch (error) { typingEl.remove(); chatAddMessage(winEl, 'ai', "Connection failed."); }
}

function chatAddMessage(winEl, role, text, images = null, save = true) {
    const messages = winEl.querySelector('#chat-messages');
    if (!messages) return;
    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`; msg.id = 'msg-' + Date.now();
    let imagesHtml = '';
    if (images && images.length > 0) {
        imagesHtml = '<div class="chat-msg-images">';
        images.forEach(img => imagesHtml += `<img src="${img.full}" alt="Photo" class="chat-msg-img" onclick="chatViewFullImage('${img.full}')">`);
        imagesHtml += '</div>';
    }
    msg.innerHTML = `<div class="chat-msg-avatar"><span class="material-icons-round">${role === 'ai' ? 'psychology' : 'person'}</span></div><div class="chat-msg-wrapper"><div class="chat-msg-content">${imagesHtml}<div class="chat-text">${chatParseMarkdown(text)}</div></div><div class="chat-msg-utils"><button class="chat-util-btn" onclick="chatCopyMessage('${msg.id}', event)" title="Copy Message"><span class="material-icons-round">content_copy</span></button></div></div>`;
    messages.appendChild(msg); messages.scrollTop = messages.scrollHeight;
}

function chatCopyMessage(msgId, event) {
    if (event) event.stopPropagation();
    const msgEl = document.getElementById(msgId);
    if (!msgEl) return;
    const textToCopy = msgEl.querySelector('.chat-text').innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const icon = event.currentTarget.querySelector('.material-icons-round');
        const old = icon.innerText; icon.innerText = 'check';
        event.currentTarget.classList.add('success');
        setTimeout(() => { icon.innerText = old; event.currentTarget.classList.remove('success'); }, 2000);
    });
}

function chatViewFullImage(url) {
    openApp('image-viewer');
    setTimeout(() => {
        for (const [id, w] of Object.entries(windows)) if (w.appId === 'image-viewer') {
            const canvas = w.el.querySelector('.iv-canvas');
            if (canvas) canvas.innerHTML = `<img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px;">`;
            break;
        }
    }, 300);
}
