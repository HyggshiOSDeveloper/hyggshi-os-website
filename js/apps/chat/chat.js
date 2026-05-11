/**
Hyggshi OS Web Edition
Chat AI Application Module
Standardized and Encapsulated
*/
const ChatAI = {
    // --- State ---
    sessions: [],
    currentChatId: null,
    model: 'gemini-2.5-flash',
    currentImages: [],
    responseMode: localStorage.getItem('webos-chat-response-mode') || 'auto',
    aspectRatio: localStorage.getItem('webos-chat-image-aspect') || '1:1',
    imageModel: localStorage.getItem('webos-chat-image-model') || 'flux',
    isSending: false,
    rateLimitUntil: 0,
    previewFallbacks: {},
    ttsAudio: null,
    ttsAudioUrl: null,
    ttsActiveButton: null,
    scrollRafId: 0,
    typingIndicatorState: { element: null, shownAt: 0, sessionId: null },

    // --- Constants ---
    HF_PROXY_URL: 'https://hyggshi-hf-proxy.tfhy5321.workers.dev',

    MODELS: { 
        'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite', description: 'Fast, lightweight responses for everyday chat.', type: 'chat' },
        'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', description: 'Balanced performance for default experience.', type: 'chat' },
        'gemini-3-flash-preview': { label: 'Gemini 3 Flash Preview', description: 'Stronger reasoning and richer responses.', type: 'chat' },
        'gemini-3.1-pro-preview': { label: 'Gemini 3.1 Pro Preview', description: 'Deep analysis and complex tasks.', type: 'chat' },
        'gemini-3.1-flash-lite': { label: 'Gemini 3.1 Flash Lite', description: 'Optimized for speed and local-feel.', type: 'chat' }
    },
    RESPONSE_MODES: { auto: 'Auto', think: 'Think', fast: 'Fast' },
    ASPECT_RATIOS: {
        '1:1': { label: '1:1', width: 1024, height: 1024 },
        '16:9': { label: '16:9', width: 1024, height: 576 },
        '9:16': { label: '9:16', width: 576, height: 1024 },
        '4:3': { label: '4:3', width: 1024, height: 768 },
        '3:4': { label: '3:4', width: 768, height: 1024 }
    },
    IMAGE_MODELS: [
        { id: 'kontext', label: 'FLUX.1 Kontext' },
        { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell', provider: 'huggingface', description: 'Hugging Face Text-to-Image - black-forest-labs/FLUX.1-schnell' },
        { id: 'stabilityai/stable-diffusion-3-medium-diffusers', label: 'Stable Diffusion 3 Medium', provider: 'huggingface', description: 'Hugging Face Text-to-Image - stabilityai/stable-diffusion-3-medium-diffusers' },
        { id: 'nanobanana', label: 'NanoBanana', premium: true },
        { id: 'nanobanana-2', label: 'NanoBanana 2', premium: true },
        { id: 'nanobanana-pro', label: 'NanoBanana Pro', premium: true },
        { id: 'seedream5', label: 'Seedream 5.0 Lite', premium: true },
        { id: 'gptimage', label: 'GPT Image 1 Mini', premium: true },
        { id: 'gptimage-large', label: 'GPT Image 1.5', premium: true },
        { id: 'gptimage-2', label: 'GPT Image 2', premium: true },
        { id: 'flux', label: 'Flux Schnell' },
        { id: 'zimage', label: 'Z-Image Turbo' },
        { id: 'wan-image', label: 'Wan 2.7 Image' },
        { id: 'wan-image-pro', label: 'Wan 2.7 Image Pro', premium: true },
        { id: 'qwen-image', label: 'Qwen Image Plus' },
        { id: 'grok-imagine', label: 'Grok Imagine', premium: true },
        { id: 'grok-imagine-pro', label: 'Grok Imagine Pro', premium: true },
        { id: 'klein', label: 'FLUX.2 Klein 4B' },
        { id: 'p-image', label: 'Pruna p-image', premium: true },
        { id: 'p-image-edit', label: 'Pruna p-image-edit', premium: true },
        { id: 'nova-canvas', label: 'Nova Canvas', premium: true }
    ],
    IMAGE_REFERENCE_MODELS: new Set(['kontext', 'p-image-edit', 'nanobanana', 'nanobanana-2', 'nanobanana-pro', 'gptimage', 'gptimage-large', 'gptimage-2']),
    TYPING_DELAY: { min: 20, max: 40 },
    MESSAGE_DELAY_MS: 500,
    TTS_MODEL: 'gemini-3.1-flash-tts-preview',
    TTS_VOICE: 'Kore',

    // --- Initialization ---
    async init(win) {
        this.bindEvents(win);
        this.previewFallbacks = this.getPreviewFallbacks();
        this.updateModelPicker(win);
        this.updateModePicker(win);
        this.updateAspectPicker(win);
        this.renderImageModelMenu(win);
        this.updateImageModelPicker(win);
        await this.loadFromDisk();
        if (this.sessions.length === 0) {
            this.createNewConversation(false);
            await this.saveToDisk();
            this.loadSession(this.currentChatId);
        } else {
            this.loadSession(this.sessions[0].id);
        }
        this.renderHistory();
    },

    bindEvents(win) {
        const textarea = win.querySelector('#chat-textarea');
        if (textarea) {
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage(textarea);
                }
            });
        }
        win.querySelector('#chat-model-trigger')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu(win, '#chat-model-menu');
        });
        win.querySelector('#chat-mode-trigger')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu(win, '#chat-mode-menu');
        });
        win.querySelector('#chat-aspect-trigger')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu(win, '#chat-aspect-menu');
        });
        win.querySelector('#chat-image-model-trigger')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu(win, '#chat-image-model-menu');
        });
        document.addEventListener('pointerdown', (e) => {
            if (!win.contains(e.target)) this.closeAllMenus(win);
        });
    },

    // --- Context Helpers ---
    getAppEl(child) {
        if (!child) return this.getWindowEl();
        return child.closest('.app-chat-ai') || this.getWindowEl();
    },
    getWindowEl() {
        if (typeof windows === 'undefined') return null;
        if (typeof activeWindowId !== 'undefined' && windows[activeWindowId]?.appId === 'chat-ai') return windows[activeWindowId].el;
        for (const [, w] of Object.entries(windows)) {
            if (w.appId === 'chat-ai') return w.el;
        }
        return null;
    },

    // --- UI State Management ---
    updateShellState(winEl, hasMessages = null) {
        if (!winEl) return;
        const workspace = winEl.querySelector('.chat-workspace');
        const messagesEl = winEl.querySelector('#chat-messages');
        const active = typeof hasMessages === 'boolean' ? hasMessages : (messagesEl?.children.length > 0);
        workspace?.classList.toggle('is-empty', !active);
        workspace?.classList.toggle('is-active', active);
    },
    toggleMenu(win, selector) {
        const menu = win.querySelector(selector);
        if (!menu) return;
        const isHidden = menu.classList.contains('hidden');
        this.closeAllMenus(win);
        if (isHidden) menu.classList.remove('hidden');
    },
    closeAllMenus(win) {
        const targetWin = win || this.getWindowEl();
        targetWin?.querySelectorAll('.chat-model-menu, .chat-mode-menu, .chat-aspect-menu, .chat-image-model-menu').forEach(m => m.classList.add('hidden'));
    },

    // --- Model Management ---
    selectModel(modelId, btn) {
        const modelInfo = this.MODELS[modelId];
        if (modelInfo?.type && modelInfo.type !== 'chat') return;
        this.model = modelId;
        const session = this.sessions.find(s => s.id === this.currentChatId);
        if (session) session.model = modelId;
        this.saveToDisk();
        const appEl = this.getAppEl(btn);
        this.updateModelPicker(appEl);
        this.closeAllMenus(appEl);
    },
    updateModelPicker(win) {
        if (!win) return;
        const info = this.MODELS[this.model] || { label: this.model };
        const label = win.querySelector('#chat-model-trigger-label');
        if (label) {
            const icon = info.type === 'image' ? '🎨 ' : '💬 ';
            label.innerHTML = `${icon}${info.label}`;
        }
        win.querySelectorAll('.chat-model-item').forEach(item => item.classList.toggle('active', item.dataset.model === this.model));
        win.querySelectorAll('.chat-more-model-item').forEach(item => {
            item.classList.toggle('active', item.dataset.model === this.model);
            const checkIcon = item.querySelector('.check-icon');
            if (item.dataset.model === this.model) {
                if (!checkIcon) {
                    const icon = document.createElement('span');
                    icon.className = 'material-icons-round check-icon';
                    icon.textContent = 'check';
                    item.appendChild(icon);
                }
            } else if (checkIcon) {
                checkIcon.remove();
            }
        });
    },

    // --- Mode Management ---
    selectMode(mode, btn) {
        if (!this.RESPONSE_MODES[mode]) return;
        this.responseMode = mode;
        localStorage.setItem('webos-chat-response-mode', mode);
        const appEl = this.getAppEl(btn);
        this.updateModePicker(appEl);
        this.closeAllMenus(appEl);
    },
    updateModePicker(win) {
        if (!win) return;
        const label = win.querySelector('#chat-mode-label');
        if (label) label.textContent = this.RESPONSE_MODES[this.responseMode];
        win.querySelectorAll('.chat-mode-item').forEach(item => item.classList.toggle('active', item.dataset.mode === this.responseMode));
    },

    // --- Aspect Management ---
    selectAspectRatio(aspect, btn) {
        if (!this.ASPECT_RATIOS[aspect]) return;
        this.aspectRatio = aspect;
        localStorage.setItem('webos-chat-image-aspect', aspect);
        const appEl = this.getAppEl(btn);
        this.updateAspectPicker(appEl);
        this.closeAllMenus(appEl);
    },
    updateAspectPicker(win) {
        if (!win) return;
        const info = this.ASPECT_RATIOS[this.aspectRatio];
        const label = win.querySelector('#chat-aspect-label');
        if (label) label.textContent = info.label;
        win.querySelectorAll('.chat-aspect-item').forEach(item => item.classList.toggle('active', item.dataset.aspect === this.aspectRatio));
    },

    // --- Image Model Management ---
    getImageModelInfo(modelId = this.imageModel) {
        return this.IMAGE_MODELS.find(model => model.id === modelId) || this.IMAGE_MODELS.find(model => model.id === 'flux');
    },
    renderImageModelMenu(win) {
        const menu = win?.querySelector('#chat-image-model-menu');
        if (!menu) return;
        menu.innerHTML = this.IMAGE_MODELS.map(model => `
            <button class="chat-image-model-item" type="button" data-image-model="${model.id}"
                onclick="chatSelectImageModel('${model.id}', this)">
                <span class="chat-image-model-copy">
                    <strong>${model.label}${model.premium ? ' <span class="chat-premium-mark">💎</span>' : ''}</strong>
                    ${model.description ? `<small>${model.description}</small>` : model.premium ? '<small>Top up your pollen balance to unlock this model · enter.pollinations.ai</small>' : `<small>${model.provider === 'huggingface' ? 'Hugging Face image model' : 'Pollinations.ai image model'}</small>`}
                </span>
                <span class="material-icons-round">check</span>
            </button>
        `).join('');
    },
    updateImageModelPicker(win) {
        if (!win) return;
        const info = this.getImageModelInfo();
        const label = win.querySelector('#chat-image-model-label');
        if (label) label.textContent = info?.label || 'Flux Schnell';
        win.querySelectorAll('.chat-image-model-item').forEach(item => {
            item.classList.toggle('active', item.dataset.imageModel === this.imageModel);
        });
    },
    selectImageModel(modelId, btn) {
        const info = this.getImageModelInfo(modelId);
        if (!info) return;
        this.imageModel = info.id;
        localStorage.setItem('webos-chat-image-model', info.id);
        const appEl = this.getAppEl(btn);
        this.updateImageModelPicker(appEl);
        this.closeAllMenus(appEl);
    },
    getPollinationsKeyIfNeeded(modelInfo, force = false) {
        if (!force && !modelInfo?.premium) return '';
        const saved = localStorage.getItem('webos-pollinations-key');
        if (saved && saved.trim().length > 8) return saved.trim();
        const key = prompt('Enter your Pollinations key from enter.pollinations.ai:');
        const cleanKey = key ? key.trim() : '';
        if (cleanKey.length > 8) {
            localStorage.setItem('webos-pollinations-key', cleanKey);
            return cleanKey;
        }
        return '';
    },

    // --- Session Management ---
    async loadSession(id) {
        this.currentChatId = id;
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;
        const winEl = this.getWindowEl();
        const messagesEl = winEl?.querySelector('#chat-messages');
        if (!messagesEl) return;
        this.resetTtsPlayback();
        messagesEl.innerHTML = '';
        this.currentImages = [];
        this.renderPreviews(winEl);
        for (const msg of session.messages) {
            await this.addMessageElement(msg.text, msg.role, { winEl, images: msg.images, thoughtCompleted: !!msg.thoughtCompleted, animate: false, typewriter: false });
        }
        this.model = this.MODELS[session.model]?.type === 'chat' ? session.model : 'gemini-2.5-flash';
        this.renderHistory();
        this.updateModelPicker(winEl);
        this.updateShellState(winEl, session.messages.length > 0);
        this.scrollToBottom(messagesEl, 'auto');
        winEl.querySelector('#chat-textarea')?.focus();
    },
    createNewConversation(render = true) {
        const id = 'chat-' + Date.now();
        const newSession = { id, title: 'New Chat', messages: [], model: this.model };
        this.sessions.unshift(newSession);
        this.currentChatId = id;
        if (render) { this.loadSession(id); this.renderHistory(); this.saveToDisk(); }
    },
    deleteSession(id, e) {
        e?.stopPropagation();
        const index = this.sessions.findIndex(s => s.id === id);
        if (index === -1) return;
        this.sessions.splice(index, 1);
        if (this.currentChatId === id) {
            if (this.sessions.length > 0) this.loadSession(this.sessions[0].id);
            else this.createNewConversation(true);
        } else this.renderHistory();
        this.saveToDisk();
    },

    // --- Messaging ---
    async sendMessage(trigger) {
        if (this.isSending) return;
        const appEl = this.getAppEl(trigger);
        const textarea = appEl?.querySelector('#chat-textarea');
        const text = textarea?.value.trim();
        const images = [...this.currentImages];
        if (!text && images.length === 0) return;
        this.isSending = true;
        const sessionId = this.currentChatId;
        try {
            if (textarea) { textarea.value = ''; textarea.style.height = ''; }
            this.currentImages = [];
            this.renderPreviews(appEl);
            await this.addMessageElement(text, 'user', { winEl: appEl, images, typewriter: false });
            this.updateShellState(appEl, true);
            const session = this.sessions.find(s => s.id === sessionId);
            if (session) {
                if (session.messages.length === 0 && text) session.title = text.length > 25 ? text.substring(0, 25) + '...' : text;
                session.messages.push({ role: 'user', text, images: images.length > 0 ? images : null, timestamp: Date.now() });
                this.saveToDisk();
                this.renderHistory();
            }
            this.showTypingIndicator(sessionId, appEl);
            const apiKey = localStorage.getItem('webos-gemini-key');
            if (apiKey && apiKey.trim().length > 10) await this.callGeminiApi(apiKey.trim(), text, images, sessionId);
            else await this.simulateResponse(text, sessionId);
        } catch (error) {
            console.error('SendMessage Error:', error);
            showNotification('Chat AI', 'Error sending message.');
        } finally { this.isSending = false; }
    },
    async callGeminiApi(apiKey, prompt, images, sessionId) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
        const parts = [{ text: prompt }];
        images.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));
        const body = { contents: [{ parts }] };
        const thinking = this.getThinkingConfig();
        if (thinking) body.generationConfig = { thinkingConfig: thinking };
        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await response.json();
            let aiText = '';
            if (response.ok) {
                const parts = data.candidates?.[0]?.content?.parts || [];
                const textPart = parts.find(p => !p.thought && p.text != null);
                aiText = textPart?.text || 'No response text.';
            } else aiText = data?.error?.message || 'AI request failed.';
            await this.finalizeAiResponse(aiText, sessionId);
        } catch (error) {
            console.error('API Error:', error);
            await this.finalizeAiResponse('Connection failed.', sessionId);
        }
    },
    async simulateResponse(text, sessionId) {
        await new Promise(r => setTimeout(r, 1200));
        await this.finalizeAiResponse("I'm in simulation mode. Connect a Gemini API key in Settings for real AI.", sessionId);
    },
    async finalizeAiResponse(text, sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.messages.push({ role: 'ai', text, timestamp: Date.now(), thoughtCompleted: this.responseMode === 'think' });
            this.saveToDisk();
        }
        if (this.currentChatId === sessionId) {
            const appEl = this.getWindowEl();
            await this.hideTypingIndicator(sessionId, appEl);
            await this.addMessageElement(text, 'ai', { winEl: appEl, typewriter: true, thoughtCompleted: this.responseMode === 'think' });
            this.updateShellState(appEl);
        }
    },

    // --- UI Rendering ---
    async addMessageElement(text, sender, options = {}) {
        const winEl = options.winEl || this.getWindowEl();
        const messagesEl = winEl?.querySelector('#chat-messages');
        if (!messagesEl) return null;
        const { msg, textEl } = this.createMessageDOM(sender, options.images);
        msg.dataset.rawText = text || '';
        if (options.animate !== false) msg.classList.add('is-entering');
        messagesEl.appendChild(msg);
        this.scrollToBottom(messagesEl, options.animate !== false ? 'smooth' : 'auto');
        if (text) {
            if (options.typewriter) await this.typeEffect(textEl, text, messagesEl);
            else textEl.innerHTML = this.parseMarkdown(text);
        }
        if (sender === 'ai' && options.thoughtCompleted) {
            const thought = document.createElement('button');
            thought.className = 'chat-thought-status';
            thought.innerHTML = `<span class="material-icons-round">emoji_objects</span> <span>Thought completed</span> <span class="material-icons-round">chevron_right</span>`;
            msg.querySelector('.chat-msg-wrapper').insertBefore(thought, msg.querySelector('.chat-msg-utils'));
        }
        if (options.animate !== false) setTimeout(() => msg.classList.remove('is-entering'), 400);
        return msg;
    },
    createMessageDOM(sender, images) {
        const msg = document.createElement('div');
        msg.className = `chat-msg chat-message ${sender}`;
        msg.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
        const avatar = `<div class="chat-msg-avatar"><span class="material-icons-round">${sender === 'ai' ? 'psychology' : 'person'}</span></div>`;
    
        let imagesHtml = '';
        if (images?.length > 0) {
            imagesHtml = `<div class="chat-msg-images">${images.map(img => 
                `<img src="${img.full}" class="chat-msg-img" onclick="ChatAI.viewFullImage('${img.full}')" alt="Generated image">`
            ).join('')}</div>`;
        }
    
        msg.innerHTML = `
            ${avatar}
            <div class="chat-msg-wrapper">
                <div class="chat-msg-content">
                    ${imagesHtml}
                    <div class="chat-text"></div>
                </div>
                <div class="chat-msg-utils">
                    <button class="chat-util-btn" onclick="ChatAI.copyMessage('${msg.id}', event)" title="Copy"><span class="material-icons-round">content_copy</span></button>
                    ${sender === 'ai' ? `<button class="chat-util-btn chat-tts-btn" onclick="ChatAI.speakMessage('${msg.id}', event)" title="Speak"><span class="material-icons-round">volume_up</span></button>` : ''}
                </div>
            </div>
        `;
    
        return { msg, textEl: msg.querySelector('.chat-text') };
    },
    async typeEffect(el, text, scrollEl) {
        el.classList.add('is-typing');
        let current = '';
        const chars = Array.from(text || '');
        for (const char of chars) {
            current += char;
            el.textContent = current;
            this.scrollToBottom(scrollEl, 'smooth');
            let delay = this.TYPING_DELAY.min + Math.random() * (this.TYPING_DELAY.max - this.TYPING_DELAY.min);
            if (/[.,!?]/.test(char)) delay += 100;
            await new Promise(r => setTimeout(r, delay));
        }
        el.classList.remove('is-typing');
        el.innerHTML = this.parseMarkdown(text);
        this.scrollToBottom(scrollEl, 'smooth');
    },
    renderHistory() { 
        const win = this.getWindowEl();
        const list = win?.querySelector('#chat-history-list');
        if (!list) return;
        const search = win.querySelector('#chat-search-input')?.value.toLowerCase() || '';
        list.innerHTML = '';
        const filtered = this.sessions.filter(s => s.title.toLowerCase().includes(search) || s.messages.some(m => (m.text || '').toLowerCase().includes(search)));
        if (filtered.length === 0) {
            list.innerHTML = `<div class="chat-history-empty">${search ? 'No matches found.' : 'No conversations yet.'}</div>`;
            return;
        }
        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = `chat-history-item ${this.currentChatId === s.id ? 'active' : ''}`;
            const lastMsg = s.messages[s.messages.length - 1]?.text || 'No messages';
            item.innerHTML = `
                <span class="chat-item-bullet"><span class="material-icons-round">chat_bubble_outline</span></span>
                <span class="chat-item-body"><span class="chat-item-title">${s.title}</span><span class="chat-item-preview">${lastMsg}</span></span>
                <button class="chat-item-delete" onclick="ChatAI.chatDeleteSession('${s.id}', event)"><span class="material-icons-round">delete_outline</span></button>
            `;
            item.onclick = () => this.loadSession(s.id);
            list.appendChild(item);
        });
    },
    renderPreviews(win) {
        const appEl = win || this.getWindowEl();
        const container = appEl?.querySelector('#chat-image-preview');
        if (!container) return;
        container.innerHTML = this.currentImages.map((img, i) => `
            <div class="chat-preview-item"><img src="${img.full}"><div class="chat-preview-remove" onclick="ChatAI.removePreview(${i}, this)"><span class="material-icons-round">close</span></div></div>
        `).join('');
    },

    // --- Indicators ---
    showTypingIndicator(sessionId, winEl) {
        const messagesEl = winEl?.querySelector('#chat-messages');
        if (!messagesEl || this.typingIndicatorState.element) return;
        const indicator = document.createElement('div');
        indicator.className = 'chat-msg chat-message ai chat-typing-indicator is-entering';
        indicator.innerHTML = `<div class="chat-msg-avatar"><span class="material-icons-round">psychology</span></div><div class="chat-msg-wrapper"><div class="chat-msg-content"><div class="chat-typing-dots"><span></span><span></span><span></span></div></div></div>`;
        messagesEl.appendChild(indicator);
        this.typingIndicatorState = { element: indicator, shownAt: performance.now(), sessionId };
        this.scrollToBottom(messagesEl, 'smooth');
        setTimeout(() => indicator.classList.remove('is-entering'), 400);
    },
    async hideTypingIndicator(sessionId, winEl) {
        if (!this.typingIndicatorState.element || this.typingIndicatorState.sessionId !== sessionId) return;
        const { element, shownAt } = this.typingIndicatorState;
        this.typingIndicatorState = { element: null, shownAt: 0, sessionId: null };
        const elapsed = performance.now() - shownAt;
        if (elapsed < this.MESSAGE_DELAY_MS) await new Promise(r => setTimeout(r, this.MESSAGE_DELAY_MS - elapsed));
        element.classList.add('is-exiting');
        await new Promise(r => setTimeout(r, 200));
        element.remove();
    },

    // --- Utils ---
    scrollToBottom(el, behavior = 'smooth') {
        if (!el) return;
        if (this.scrollRafId) cancelAnimationFrame(this.scrollRafId);
        this.scrollRafId = requestAnimationFrame(() => {
            el.scrollTo({ top: el.scrollHeight, behavior });
            this.scrollRafId = 0;
        });
    },
    parseMarkdown(text) {
        if (!text) return '';
        let html = String(text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-label">${lang || 'code'}</span><button class="chat-code-copy-btn" onclick="ChatAI.copyCode(this, event)"><span class="material-icons-round">content_copy</span><span>Copy</span></button></div><pre><code>${code.trim()}</code></pre></div>`)
            .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/^\s*\* (.*)$/gm, '<li class="chat-list-item">$1</li>')
            .replace(/(<li.*<\/li>)/gs, '<ul class="chat-list">$1</ul>');
        if (!html.includes('<pre>')) html = html.replace(/\n/g, '<br>');
        return html;
    },
    getThinkingConfig() {
        if (this.responseMode === 'auto') return null;
        if (/^gemini-3/i.test(this.model)) return { thinkingLevel: this.responseMode === 'think' ? 'high' : 'minimal' };
        if (/^gemini-2\.5/i.test(this.model)) return { thinkingBudget: this.responseMode === 'think' ? -1 : 0 };
        return null;
    },

    // --- Actions ---
    copyMessage(id, e) {
        e?.stopPropagation();
        const text = document.getElementById(id)?.querySelector('.chat-text').innerText;
        if (text) navigator.clipboard.writeText(text).then(() => showNotification('Chat', 'Copied to clipboard.'));
    },
    copyCode(btn, e) {
        e?.stopPropagation();
        const code = btn.closest('.chat-code-block').querySelector('code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const span = btn.querySelector('span:last-child');
            const old = span.textContent;
            span.textContent = 'Copied!';
            setTimeout(() => span.textContent = old, 2000);
        });
    },
    viewFullImage(url) {
        if (typeof openApp === 'function') {
            openApp('image-viewer');
            setTimeout(() => {
                const win = Object.values(windows).find(w => w.appId === 'image-viewer')?.el;
                const canvas = win?.querySelector('.iv-canvas');
                if (canvas) canvas.innerHTML = `<img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;">`;
            }, 300);
        }
    },

    // --- Storage ---
    async saveToDisk() {
        try { const db = await this.openDB(); db.transaction('sessions', 'readwrite').objectStore('sessions').put(this.sessions, 'all_sessions'); } catch (e) {}
    },
    async loadFromDisk() {
        try {
            const db = await this.openDB();
            return new Promise(r => {
                const req = db.transaction('sessions', 'readonly').objectStore('sessions').get('all_sessions');
                req.onsuccess = () => { this.sessions = req.result || []; r(); };
                req.onerror = () => { this.sessions = []; r(); };
            });
        } catch (e) { this.sessions = []; return Promise.resolve(); }
    },
    openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('WebOS-ChatAI', 1);
            req.onupgradeneeded = (e) => { if (!e.target.result.objectStoreNames.contains('sessions')) e.target.result.createObjectStore('sessions'); };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = reject;
        });
    },
    getPreviewFallbacks() { try { return JSON.parse(localStorage.getItem('webos-chat-preview-fallbacks')) || {}; } catch { return {}; } },

    // --- TTS & Audio ---
    resetTtsPlayback() {
        if (this.ttsAudio) { this.ttsAudio.pause(); this.ttsAudio = null; }
        if (this.ttsAudioUrl) { URL.revokeObjectURL(this.ttsAudioUrl); this.ttsAudioUrl = null; }
        if (this.ttsActiveButton) {
            this.ttsActiveButton.classList.remove('active');
            const icon = this.ttsActiveButton.querySelector('.material-icons-round');
            if (icon) icon.textContent = 'volume_up';
            this.ttsActiveButton = null;
        }
    },
    async speakMessage(msgId, e) {
        e?.stopPropagation();
        const msgEl = document.getElementById(msgId);
        const btn = e?.currentTarget || msgEl?.querySelector('.chat-tts-btn');
        const text = msgEl?.dataset.rawText;
        if (!text || !btn) return; 
        if (this.ttsActiveButton === btn) { this.resetTtsPlayback(); return; }
        this.resetTtsPlayback();
        this.ttsActiveButton = btn;
        btn.classList.add('active');
        const icon = btn.querySelector('.material-icons-round');
        if (icon) icon.textContent = 'stop';
        const apiKey = localStorage.getItem('webos-gemini-key');
        if (!apiKey) { showNotification('Chat AI', 'API Key required for TTS'); this.resetTtsPlayback(); return; }
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.TTS_MODEL}:predict?key=${apiKey}`;
            const res = await fetch(url, { method: 'POST', body: JSON.stringify({ instances: [{ text }], parameters: { voice: { name: 'Kore' } } }) });
            const data = await res.json();
            const base64Audio = data.predictions?.[0]?.audioContents;
            if (base64Audio) {
                const binary = atob(base64Audio);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                this.ttsAudioUrl = URL.createObjectURL(new Blob([array], { type: 'audio/mpeg' }));
                this.ttsAudio = new Audio(this.ttsAudioUrl);
                this.ttsAudio.onended = () => this.resetTtsPlayback();
                this.ttsAudio.play();
            }
        } catch (err) { this.resetTtsPlayback(); }
    },

    // --- Image Handling ---
    async handleFileUpload(input) {
        const files = Array.from(input.files || []);
        if (files.length === 0) return;
        for (const file of files) {
            if (this.currentImages.length >= 4) break;
            const data = await this.fileToBase64(file);
            this.currentImages.push({ base64: data.split(',')[1], full: data, mimeType: file.type });
        }
        input.value = '';
        this.renderPreviews(this.getAppEl(input));
    },
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },
    removePreview(index, btn) {
        this.currentImages.splice(index, 1);
        this.renderPreviews(this.getAppEl(btn));
    },

    // ---  Image Generation Engine ---
    async generateImage(btn) {
        if (this.isSending) return;
        const appEl = this.getAppEl(btn);
        const textarea = appEl?.querySelector('#chat-textarea');
        const prompt = textarea?.value.trim();
        if (!prompt) { showNotification('Chat AI', 'Please enter a prompt.'); textarea?.focus(); return; }
        const referenceImages = [...this.currentImages];

        const icon = btn.querySelector('.material-icons-round');
        const oldIcon = icon ? icon.textContent : 'auto_awesome';
        if (icon) icon.textContent = 'hourglass_empty';
        btn.classList.add('loading');
        this.isSending = true;
        const sessionId = this.currentChatId;

        try {
            await this.addMessageElement(`Generating image for: "${prompt}"...`, 'user', {
                winEl: appEl,
                images: referenceImages.length ? referenceImages : null,
                typewriter: false
            });
            this.updateShellState(appEl, true);
            const session = this.sessions.find(s => s.id === sessionId);
            if (session) {
                if (session.messages.length === 0) session.title = prompt.length > 25 ? prompt.substring(0, 25) + '...' : prompt;
                session.messages.push({
                    role: 'user',
                    text: `[Image Gen] ${prompt}`,
                    images: referenceImages.length ? referenceImages : null,
                    timestamp: Date.now()
                });
                this.saveToDisk(); this.renderHistory();
            }
            this.currentImages = [];
            this.renderPreviews(appEl);

            const aspectConfig = this.ASPECT_RATIOS[this.aspectRatio] || this.ASPECT_RATIOS['1:1'];
            const randomSeed = Math.floor(Math.random() * 2147483647);
            const modelInfo = this.getImageModelInfo();
            const provider = modelInfo?.provider || 'pollinations';
            
            let imageUrl = null;
            let usedService = provider;

            if (provider === 'huggingface') {
                imageUrl = await this.generateWithHuggingFace(prompt, aspectConfig, randomSeed);
            } else {
                imageUrl = await this.generateWithPollinations(prompt, aspectConfig, randomSeed, referenceImages);
            }

            await this.addMessageElement(`Generated image via ${usedService} (Seed: ${randomSeed})`, 'ai', { winEl: appEl, images: [{ full: imageUrl, mimeType: 'image/jpeg' }], typewriter: true });
            const sess = this.sessions.find(s => s.id === sessionId);
            if (sess) {
                sess.messages.push({ role: 'ai', text: `Generated image via ${usedService} (Seed: ${randomSeed})`, images: [{ full: imageUrl, mimeType: 'image/jpeg' }], seed: randomSeed, service: usedService, timestamp: Date.now() });
                this.saveToDisk();
            }
            if (textarea) textarea.value = '';
        } catch (err) {
            console.error('Image Gen Error:', err);
            showNotification('Chat AI', 'Generation failed.');
            await this.addMessageElement(`❌ ${err.message}`, 'ai', { winEl: appEl, typewriter: true });
        } finally {
            if (icon) icon.textContent = oldIcon;
            btn.classList.remove('loading');
            this.isSending = false;
            this.updateShellState(appEl);
        }
    },

    async generateWithPollinations(prompt, aspectConfig, seed, referenceImages = []) {
        const selectedModel = this.getImageModelInfo();
        const hasReference = referenceImages.length > 0;
        const requestModelId = hasReference && !this.IMAGE_REFERENCE_MODELS.has(selectedModel?.id) ? 'kontext' : selectedModel?.id;
        const modelInfo = this.getImageModelInfo(requestModelId);
        const key = this.getPollinationsKeyIfNeeded(modelInfo);
        if (modelInfo?.premium && !key) throw new Error('Pollinations key required for this premium model.');
        const buildUrl = (apiKey = '') => {
            const baseUrl = 'https://gen.pollinations.ai/image/';
            const encodedPrompt = encodeURIComponent(prompt);
            const params = new URLSearchParams({
                width: aspectConfig.width,
                height: aspectConfig.height,
                seed,
                model: requestModelId || 'flux',
                enhance: 'true',
                noStore: 'true'
            });
            if (hasReference) {
                params.set('image', referenceImages.map(img => img.full).join('|'));
            }
            if (apiKey) params.set('key', apiKey);
            return `${baseUrl}${encodedPrompt}?${params.toString()}`;
        };
        let response = await fetch(buildUrl(key));
        if (response.status === 401 && !key) {
            const retryKey = this.getPollinationsKeyIfNeeded(modelInfo, true);
            if (!retryKey) throw new Error('Pollinations key required for this model.');
            response = await fetch(buildUrl(retryKey));
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Pollinations.ai error: ${response.status}${detail ? ` - ${detail}` : ''}`);
        }
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert image'));
            reader.readAsDataURL(blob);
        });
    },

    async generateWithHuggingFace(prompt, aspectConfig, seed) {
        const hfToken = localStorage.getItem('webos-hf-token');
        if (!hfToken || hfToken.trim().length < 10) throw new Error('HuggingFace token required.');
        const modelInfo = this.getImageModelInfo();
        const modelId = modelInfo?.provider === 'huggingface' ? modelInfo.id : 'black-forest-labs/FLUX.1-schnell';
        const steps = modelId.includes('stable-diffusion-3') ? 28 : 4;
        const modelPath = modelId.split('/').map(encodeURIComponent).join('/');
        let hfResponse = await fetch(`https://router.huggingface.co/hf-inference/models/${modelPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'image/png', 'Authorization': `Bearer ${hfToken.trim()}` },
            body: JSON.stringify({ inputs: prompt, parameters: { width: aspectConfig.width, height: aspectConfig.height, num_inference_steps: steps, seed: seed } })
        });
        if (!hfResponse.ok && this.HF_PROXY_URL) {
            hfResponse = await fetch(this.HF_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfToken.trim()}` },
                body: JSON.stringify({ model: modelId, inputs: prompt, parameters: { width: aspectConfig.width, height: aspectConfig.height, num_inference_steps: steps, seed: seed } })
            });
        }
        if (!hfResponse.ok) {
            const errText = await hfResponse.text().catch(() => hfResponse.status);
            throw new Error(`HuggingFace API error (${hfResponse.status}): ${errText}`);
        }
        const blob = await hfResponse.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read image data'));
            reader.readAsDataURL(blob);
        });
    },

    async generateMusic(btn) {
        const appEl = this.getAppEl(btn);
        const textarea = appEl?.querySelector('#chat-textarea');
        if (!textarea?.value.trim()) { showNotification('Chat AI', 'Please enter a prompt.'); return; }
        const icon = btn.querySelector('.material-icons-round');
        const oldIcon = icon ? icon.textContent : 'mic';
        if (icon) icon.textContent = 'hourglass_empty';
        btn.classList.add('loading');
        try { await new Promise(r => setTimeout(r, 2000)); showNotification('Chat AI', 'Music engine in preview.'); } 
        finally { if (icon) icon.textContent = oldIcon; btn.classList.remove('loading'); }
    },

    // === 📜 Expand More Models Handler ===
    chatExpandMoreModels(btn) {
        const appEl = this.getAppEl(btn);
        const moreSection = appEl?.querySelector('#chat-more-models-section');
        const expandBtn = appEl?.querySelector('#chat-expand-more-btn');
        if (!moreSection || !expandBtn) return;
        const isExpanded = moreSection.style.display !== 'none';
        moreSection.style.display = isExpanded ? 'none' : 'block';
        expandBtn.setAttribute('aria-expanded', !isExpanded);
        expandBtn.querySelector('.material-icons-round').textContent = isExpanded ? 'chevron_right' : 'expand_less';
        if (!isExpanded && !moreSection.dataset.rendered) {
            this.renderMoreModelsList(moreSection);
            moreSection.dataset.rendered = 'true';
        }
    },
    renderMoreModelsList(container) {
        const imageModels = Object.entries(this.MODELS).filter(([id, info]) => info.type === 'image');
        container.innerHTML = `
            <div class="chat-more-models-grid">
                ${imageModels.map(([id, info]) => `
                    <button class="chat-more-model-item ${this.model === id ? 'active' : ''}" data-model="${id}" onclick="ChatAI.chatSelectModel('${id}', this)" title="${info.description}">
                        <span class="chat-model-icon">🎨</span>
                        <div class="chat-model-info"><strong>${info.label}</strong><small>${info.description}</small><span class="chat-model-provider">${info.provider || 'default'}</span></div>
                        ${this.model === id ? '<span class="material-icons-round check-icon">check</span>' : ''}
                    </button>
                `).join('')}
            </div>
            <div class="chat-more-models-footer"><small>💡 Tip: Image models work with the 🎨 Generate Image button</small></div>
        `;
    },

    // --- Compatibility Wrappers ---
    chatNewConversation() { this.createNewConversation(true); },
    chatRenderHistory() { this.renderHistory(); },
    chatSendMessage(trigger) { this.sendMessage(trigger); },
    chatToggleSidebar(btn) { this.getAppEl(btn)?.classList.toggle('chat-sidebar-collapsed'); },
    chatFocusSearch(btn) { this.getAppEl(btn)?.querySelector('#chat-search-input')?.focus(); },
    chatHandleFileUpload(input) { this.handleFileUpload(input); },
    chatGenerateImageFromPrompt(btn) { this.generateImage(btn); },
    chatGenerateMusicClip(btn) { this.generateMusic(btn); },
    chatSelectModel(modelId, btn) { this.selectModel(modelId, btn); },
    chatSelectImageModel(modelId, btn) { this.selectImageModel(modelId, btn); },
    chatSelectMode(mode, btn) { this.selectMode(mode, btn); },
    chatSelectAspectRatio(aspect, btn) { this.selectAspectRatio(aspect, btn); },
    chatDeleteSession(id, e) { this.deleteSession(id, e); }
};

// --- Global Initialization & Bridges ---
function initChatAi(win) { if (ChatAI && typeof ChatAI.init === 'function') ChatAI.init(win); }
function chatDestroyWindow(wid) { ChatAI.resetTtsPlayback(); }

function chatNewConversation() { ChatAI.chatNewConversation(); }
function chatRenderHistory() { ChatAI.chatRenderHistory(); }
function chatSendMessage(trigger) { ChatAI.chatSendMessage(trigger); }
function chatToggleSidebar(btn) { ChatAI.chatToggleSidebar(btn); }
function chatFocusSearch(btn) { ChatAI.chatFocusSearch(btn); }
function chatHandleFileUpload(input) { ChatAI.chatHandleFileUpload(input); }
function chatGenerateImageFromPrompt(btn) { ChatAI.chatGenerateImageFromPrompt(btn); }
function chatGenerateMusicClip(btn) { ChatAI.chatGenerateMusicClip(btn); }
function chatSelectModel(modelId, btn) { ChatAI.chatSelectModel(modelId, btn); }
function chatSelectImageModel(modelId, btn) { ChatAI.chatSelectImageModel(modelId, btn); }
function chatSelectMode(mode, btn) { ChatAI.chatSelectMode(mode, btn); }
function chatSelectAspectRatio(aspect, btn) { ChatAI.chatSelectAspectRatio(aspect, btn); }
function chatExpandMoreModels(btn) { ChatAI.chatExpandMoreModels(btn); }

window.ChatAI = ChatAI;
window.chatExpandMoreModels = chatExpandMoreModels;
window.chatSelectImageModel = chatSelectImageModel;
