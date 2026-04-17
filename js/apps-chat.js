/* ============ CHAT AI logic ============ */
let chatSessions = [];
let currentChatId = null;
let chatModel = 'gemini-2.5-flash';
let currentChatImages = []; // Stores {base64, full, mimeType}

// --- Markdown Parser ---
function chatParseMarkdown(text) {
    if (!text) return "";
    text = text.replace(/```([\w#+.-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
        const label = (language || 'code').trim();
        return `<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-label">${label}</span><button class="chat-code-copy-btn" onclick="chatCopyCodeBlock(this, event)" title="Copy code"><span class="material-icons-round">content_copy</span><span>Copy code</span></button></div><pre><code>${code}</code></pre></div>`;
    });
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
    chatSyncMusicButtonState(win);

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

function chatSetTtsButtonState(button, state) {
    if (!button) return;
    button.dataset.state = state;
    button.disabled = state === 'loading';
    const icon = button.querySelector('.material-icons-round');
    if (!icon) return;
    if (state === 'loading') icon.innerText = 'hourglass_top';
    else if (state === 'playing') icon.innerText = 'stop_circle';
    else icon.innerText = 'volume_up';
}

function chatResetTtsPlaybackState() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (chatTtsAudio) {
        chatTtsAudio.pause();
        chatTtsAudio.src = '';
        chatTtsAudio = null;
    }
    if (chatTtsAudioUrl) {
        URL.revokeObjectURL(chatTtsAudioUrl);
        chatTtsAudioUrl = null;
    }
    if (chatTtsActiveButton) {
        chatSetTtsButtonState(chatTtsActiveButton, 'idle');
        chatTtsActiveButton = null;
    }
}

function chatGetPreviewFallbacks() {
    try {
        const raw = localStorage.getItem('webos-chat-preview-fallbacks');
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        return {};
    }
}

function chatSavePreviewFallbacks(fallbacks) {
    localStorage.setItem('webos-chat-preview-fallbacks', JSON.stringify(fallbacks || {}));
}

function chatGetPreviewFallback(feature) {
    return !!chatPreviewFallbacks?.[feature];
}

function chatSetPreviewFallback(feature, enabled) {
    chatPreviewFallbacks = { ...(chatPreviewFallbacks || {}) };
    if (enabled) chatPreviewFallbacks[feature] = true;
    else delete chatPreviewFallbacks[feature];
    chatSavePreviewFallbacks(chatPreviewFallbacks);
    chatSyncMusicButtonState();
}

function chatSyncMusicButtonState(winEl = getChatWindowEl()) {
    const button = winEl?.querySelector('.chat-music-btn');
    if (!button) return;
    const disabledByFallback = chatGetPreviewFallback('music');
    button.disabled = disabledByFallback || button.classList.contains('is-loading');
    button.classList.toggle('is-disabled', disabledByFallback);
    button.title = disabledByFallback
        ? 'Music preview disabled after rate limit. Save a new API key to re-enable.'
        : 'Generate music clip';
}

function chatPlayBrowserTts(text, button) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', 'Browser TTS is not available on this device.');
        }
        return;
    }
    chatResetTtsPlaybackState();
    chatTtsActiveButton = button;
    chatSetTtsButtonState(button, 'playing');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => chatResetTtsPlaybackState();
    utterance.onerror = () => {
        chatResetTtsPlaybackState();
        if (typeof showNotification === 'function') showNotification('Chat AI', 'Browser TTS playback failed.');
    };
    window.speechSynthesis.speak(utterance);
    if (typeof showNotification === 'function') {
        showNotification('Chat AI', 'Using browser TTS because Gemini TTS preview was rate-limited.');
    }
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function createWavBlobFromPcm(pcmBytes, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcmBytes.length;

    const writeString = (offset, value) => {
        for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    return new Blob([header, pcmBytes], { type: 'audio/wav' });
}

async function chatReadApiJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function chatGetRateLimitCooldownLeftMs() {
    return Math.max(0, chatRateLimitUntil - Date.now());
}

function chatFormatCooldown(ms) {
    const seconds = Math.max(1, Math.ceil(ms / 1000));
    return `${seconds}s`;
}

function chatEnsureRateLimitAvailable(featureName = 'This action') {
    const cooldownLeft = chatGetRateLimitCooldownLeftMs();
    if (cooldownLeft <= 0) return true;
    if (typeof showNotification === 'function') {
        showNotification('Chat AI', `${featureName} is temporarily paused after a rate limit response. Try again in ${chatFormatCooldown(cooldownLeft)}.`);
    }
    return false;
}

function chatBuildApiErrorMessage(response, data, fallbackMessage) {
    if (response?.status === 429) {
        const retryAfter = Number(response.headers?.get('retry-after')) || 15;
        chatRateLimitUntil = Date.now() + (retryAfter * 1000);
        return `Rate limit reached for this Gemini API key. Wait about ${retryAfter}s and check your quota in Google AI Studio.`;
    }
    return data?.error?.message || fallbackMessage;
}

function chatSetMusicButtonState(button, state) {
    if (!button) return;
    button.disabled = state === 'loading';
    button.classList.toggle('is-loading', state === 'loading');
    const icon = button.querySelector('.material-icons-round');
    if (!icon) return;
    icon.innerText = state === 'loading' ? 'hourglass_top' : 'music_note';
}

function chatCreateAudioBlobFromInlineData(audioBase64, mimeType = '', fallback = {}) {
    const bytes = base64ToUint8Array(audioBase64);
    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime.startsWith('audio/') && normalizedMime !== 'audio/pcm' && normalizedMime !== 'audio/l16') {
        return new Blob([bytes], { type: mimeType });
    }
    return createWavBlobFromPcm(
        bytes,
        fallback.sampleRate || 48000,
        fallback.channels || 2,
        fallback.bitsPerSample || 16
    );
}

function chatOpenMusicPlayerWithBlob(blob, promptText) {
    openApp('music-player');
    setTimeout(() => {
        if (typeof mpLoadAudioFromBlob === 'function') {
            mpLoadAudioFromBlob(blob, 'Lyria Clip', promptText || 'AI Generated Music');
        }
    }, 120);
}

async function chatGenerateMusicClip(button) {
    const winEl = getChatWindowEl();
    const textarea = winEl?.querySelector('#chat-textarea');
    const initialPrompt = textarea?.value.trim() || '';
    const promptText = initialPrompt || prompt('Describe the music clip you want to generate:');
    const finalPrompt = promptText ? promptText.trim() : '';
    if (!finalPrompt) return;
    if (!chatEnsureRateLimitAvailable('Music generation')) return;

    const apiKey = localStorage.getItem('webos-gemini-key');
    if (!apiKey || apiKey.trim().length <= 10) {
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', 'Add a Gemini API key in Settings to generate music.');
        }
        return;
    }
    if (chatGetPreviewFallback('music')) {
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', 'Music preview is disabled for this API key after a 429 response. Save a new key in Settings to re-enable it.');
        }
        chatSyncMusicButtonState(winEl);
        return;
    }

    chatSetMusicButtonState(button, 'loading');
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey.trim()
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: finalPrompt
                    }]
                }],
                generationConfig: {
                    responseModalities: ['AUDIO']
                }
            })
        });

        const data = await chatReadApiJson(response);
        const inlineData = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData
            || data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        const audioBase64 = inlineData?.data;
        if (!response.ok || !audioBase64) {
            if (response.status === 429) chatSetPreviewFallback('music', true);
            throw new Error(chatBuildApiErrorMessage(response, data, 'Music generation failed.'));
        }

        const audioBlob = chatCreateAudioBlobFromInlineData(audioBase64, inlineData?.mimeType, {
            sampleRate: 48000,
            channels: 2,
            bitsPerSample: 16
        });
        chatOpenMusicPlayerWithBlob(audioBlob, finalPrompt);
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', 'Music clip generated and loaded into Music Player.');
        }
    } catch (error) {
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', error.message || 'Unable to generate music clip.');
        }
    } finally {
        chatSetMusicButtonState(button, 'idle');
    }
}

async function chatSpeakMessage(msgId, event) {
    if (event) event.stopPropagation();
    const button = event?.currentTarget || document.querySelector(`#${msgId} .chat-tts-btn`);
    const msgEl = document.getElementById(msgId);
    if (!button || !msgEl) return;

    if (chatTtsActiveButton === button && button.dataset.state === 'playing') {
        chatResetTtsPlaybackState();
        return;
    }

    const apiKey = localStorage.getItem('webos-gemini-key');
    if (!apiKey || apiKey.trim().length <= 10) {
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', 'Add a Gemini API key in Settings to use TTS.');
        }
        return;
    }

    const text = (msgEl.dataset.rawText || msgEl.querySelector('.chat-text')?.innerText || '').trim();
    if (!text) return;
    if (!chatEnsureRateLimitAvailable('TTS playback')) return;
    if (chatGetPreviewFallback('tts')) {
        chatPlayBrowserTts(text, button);
        return;
    }

    chatResetTtsPlaybackState();
    chatTtsActiveButton = button;
    chatSetTtsButtonState(button, 'loading');
    const requestId = ++chatTtsRequestId;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CHAT_TTS_MODEL}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey.trim()
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Read this exactly as natural speech, preserving the original language and wording:\n\n${text}`
                    }]
                }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: CHAT_TTS_VOICE
                            }
                        }
                    }
                }
            })
        });

        const data = await chatReadApiJson(response);
        if (requestId !== chatTtsRequestId) return;

        const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!response.ok || !audioBase64) {
            if (response.status === 429) {
                chatSetPreviewFallback('tts', true);
                chatPlayBrowserTts(text, button);
                return;
            }
            throw new Error(chatBuildApiErrorMessage(response, data, 'TTS request failed.'));
        }

        const pcmBytes = base64ToUint8Array(audioBase64);
        const wavBlob = createWavBlobFromPcm(pcmBytes);
        chatTtsAudioUrl = URL.createObjectURL(wavBlob);
        chatTtsAudio = new Audio(chatTtsAudioUrl);
        chatTtsAudio.onended = () => chatResetTtsPlaybackState();
        chatTtsAudio.onerror = () => {
            chatResetTtsPlaybackState();
            if (typeof showNotification === 'function') showNotification('Chat AI', 'Unable to play generated audio.');
        };

        chatSetTtsButtonState(button, 'playing');
        await chatTtsAudio.play();
    } catch (error) {
        if (requestId !== chatTtsRequestId) return;
        chatResetTtsPlaybackState();
        if (typeof showNotification === 'function') {
            showNotification('Chat AI', error.message || 'TTS failed.');
        }
    }
}

function chatDestroyWindow(wid) {
    chatResetTtsPlaybackState();
    currentChatImages = [];
    resetTypingIndicatorState();
}

/* === Premium chat motion overrides === */
let chatScrollRafId = 0;
let chatPendingScroll = null;
let chatTypingIndicatorState = { element: null, shownAt: 0, sessionId: null };
let chatTtsAudio = null;
let chatTtsAudioUrl = null;
let chatTtsRequestId = 0;
let chatTtsActiveButton = null;
let chatRateLimitUntil = 0;
let chatPreviewFallbacks = chatGetPreviewFallbacks();
const CHAT_TYPING_MIN_DELAY = 20;
const CHAT_TYPING_MAX_DELAY = 40;
const CHAT_MESSAGE_DELAY_MS = 500;
const CHAT_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const CHAT_TTS_VOICE = 'Kore';

function getChatWindowEl() {
    for (const [, windowRef] of Object.entries(windows)) {
        if (windowRef.appId === 'chat-ai') return windowRef.el;
    }
    return null;
}

function getChatMessagesEl(winEl = getChatWindowEl()) {
    return winEl ? winEl.querySelector('#chat-messages') : null;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function queueChatScroll(messagesEl, behavior = 'smooth') {
    if (!messagesEl) return;
    chatPendingScroll = { messagesEl, behavior };
    if (chatScrollRafId) return;
    chatScrollRafId = requestAnimationFrame(() => {
        const pending = chatPendingScroll;
        chatPendingScroll = null;
        chatScrollRafId = 0;
        if (!pending || !pending.messagesEl || !pending.messagesEl.isConnected) return;
        pending.messagesEl.scrollTo({ top: pending.messagesEl.scrollHeight, behavior: pending.behavior });
    });
}

function chatCopyCodeBlock(button, event) {
    if (event) event.stopPropagation();
    const codeEl = button?.closest('.chat-code-block')?.querySelector('code');
    if (!codeEl) return;
    const codeText = codeEl.textContent || '';
    navigator.clipboard.writeText(codeText).then(() => {
        const icon = button.querySelector('.material-icons-round');
        const text = button.querySelector('span:last-child');
        const oldIcon = icon ? icon.innerText : '';
        const oldText = text ? text.innerText : '';
        if (icon) icon.innerText = 'check';
        if (text) text.innerText = 'Copied';
        button.classList.add('success');
        setTimeout(() => {
            if (icon) icon.innerText = oldIcon;
            if (text) text.innerText = oldText;
            button.classList.remove('success');
        }, 1800);
    });
}

function resetTypingIndicatorState() {
    if (chatTypingIndicatorState.element && chatTypingIndicatorState.element.isConnected) {
        chatTypingIndicatorState.element.remove();
    }
    chatTypingIndicatorState = { element: null, shownAt: 0, sessionId: null };
}

function createChatMessageElement(sender, images = null) {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-message ${sender}`;
    msg.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar';
    avatar.innerHTML = `<span class="material-icons-round">${sender === 'ai' ? 'psychology' : 'person'}</span>`;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-wrapper';

    const content = document.createElement('div');
    content.className = 'chat-msg-content';

    if (images && images.length > 0) {
        const imageWrap = document.createElement('div');
        imageWrap.className = 'chat-msg-images';
        images.forEach(img => {
            const image = document.createElement('img');
            image.src = img.full;
            image.alt = 'Photo';
            image.className = 'chat-msg-img';
            image.onclick = () => chatViewFullImage(img.full);
            imageWrap.appendChild(image);
        });
        content.appendChild(imageWrap);
    }

    const textEl = document.createElement('div');
    textEl.className = 'chat-text';
    content.appendChild(textEl);

    const utils = document.createElement('div');
    utils.className = 'chat-msg-utils';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'chat-util-btn';
    copyBtn.title = 'Copy Message';
    copyBtn.innerHTML = '<span class="material-icons-round">content_copy</span>';
    copyBtn.onclick = (event) => chatCopyMessage(msg.id, event);
    utils.appendChild(copyBtn);

    if (sender === 'ai') {
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'chat-util-btn chat-tts-btn';
        ttsBtn.title = 'Play TTS';
        ttsBtn.dataset.state = 'idle';
        ttsBtn.innerHTML = '<span class="material-icons-round">volume_up</span>';
        ttsBtn.onclick = (event) => chatSpeakMessage(msg.id, event);
        utils.appendChild(ttsBtn);
    }

    wrapper.appendChild(content);
    wrapper.appendChild(utils);
    msg.appendChild(avatar);
    msg.appendChild(wrapper);

    return { msg, textEl };
}

async function typeMessage(element, text, options = {}) {
    if (!element) return;
    const messagesEl = options.messagesEl || getChatMessagesEl();
    const useMarkdown = options.markdown !== false;
    const chars = Array.from(text || '');
    let visibleText = '';

    element.classList.add('is-typing');
    element.textContent = '';

    for (let index = 0; index < chars.length; index += 1) {
        const char = chars[index];
        visibleText += char;
        element.textContent = visibleText;
        queueChatScroll(messagesEl, 'smooth');

        let delay = CHAT_TYPING_MIN_DELAY + Math.random() * (CHAT_TYPING_MAX_DELAY - CHAT_TYPING_MIN_DELAY);
        if (/[,.!?]/.test(char)) delay += 90 + Math.random() * 110;
        if (char === '\n') delay += 55;
        if (char === ' ') delay *= 0.45;
        await wait(delay);
    }

    element.classList.remove('is-typing');
    element.innerHTML = useMarkdown ? chatParseMarkdown(text) : text;
    queueChatScroll(messagesEl, 'smooth');
}

async function addMessage(text, sender, options = {}) {
    const winEl = options.winEl || getChatWindowEl();
    const messagesEl = getChatMessagesEl(winEl);
    if (!messagesEl) return null;

    const animate = options.animate !== false;
    const shouldType = sender === 'ai' && options.typewriter !== false;
    const useMarkdown = options.markdown !== false;
    const { msg, textEl } = createChatMessageElement(sender, options.images || null);
    msg.dataset.rawText = text || '';
    msg.dataset.sender = sender;

    if (animate) msg.classList.add('is-entering');
    messagesEl.appendChild(msg);
    queueChatScroll(messagesEl, animate ? 'smooth' : 'auto');

    if (text) {
        if (shouldType) {
            await typeMessage(textEl, text, { messagesEl, markdown: useMarkdown });
        } else {
            textEl.innerHTML = useMarkdown ? chatParseMarkdown(text) : text;
        }
    }

    if (animate) {
        setTimeout(() => msg.classList.remove('is-entering'), 420);
    }

    return msg;
}

function showTypingIndicator(sessionId = currentChatId, winEl = getChatWindowEl()) {
    const messagesEl = getChatMessagesEl(winEl);
    if (!messagesEl) return null;

    if (chatTypingIndicatorState.element && chatTypingIndicatorState.sessionId === sessionId) {
        return chatTypingIndicatorState.element;
    }

    resetTypingIndicatorState();

    const indicator = document.createElement('div');
    indicator.className = 'chat-msg chat-message ai chat-typing-indicator is-entering';
    indicator.innerHTML = `
        <div class="chat-msg-avatar"><span class="material-icons-round">psychology</span></div>
        <div class="chat-msg-wrapper">
            <div class="chat-msg-content" aria-label="Assistant is typing">
                <div class="chat-typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>
            </div>
        </div>`;

    messagesEl.appendChild(indicator);
    chatTypingIndicatorState = { element: indicator, shownAt: performance.now(), sessionId };
    queueChatScroll(messagesEl, 'smooth');
    setTimeout(() => indicator.classList.remove('is-entering'), 420);
    return indicator;
}

async function hideTypingIndicator(minVisibleMs = CHAT_MESSAGE_DELAY_MS, sessionId = chatTypingIndicatorState.sessionId) {
    if (!chatTypingIndicatorState.element) return;
    if (sessionId && chatTypingIndicatorState.sessionId && sessionId !== chatTypingIndicatorState.sessionId) return;

    const indicator = chatTypingIndicatorState.element;
    const shownAt = chatTypingIndicatorState.shownAt;
    chatTypingIndicatorState = { element: null, shownAt: 0, sessionId: null };

    const elapsed = performance.now() - shownAt;
    if (elapsed < minVisibleMs) {
        await wait(minVisibleMs - elapsed);
    }

    if (indicator && indicator.isConnected) {
        indicator.classList.add('is-exiting');
        await wait(160);
        if (indicator.isConnected) indicator.remove();
    }
}

function chatLoadSession(id) {
    currentChatId = id;
    const session = chatSessions.find(s => s.id === id);
    if (!session) return;

    const winEl = getChatWindowEl();
    if (!winEl) return;

    chatResetTtsPlaybackState();
    const messagesEl = getChatMessagesEl(winEl);
    if (messagesEl) messagesEl.innerHTML = '';
    resetTypingIndicatorState();

    if (session.messages.length === 0) {
        addMessage("Hello! I'm your AI assistant. How can I help you today?", 'ai', {
            winEl,
            animate: false,
            typewriter: false
        });
    } else {
        session.messages.forEach(msg => {
            addMessage(msg.text, msg.role, {
                winEl,
                images: msg.images,
                animate: false,
                typewriter: false
            });
        });
    }

    chatModel = session.model || 'gemini-2.5-flash';
    const modelSelect = winEl.querySelector('#chat-model-select');
    if (modelSelect) modelSelect.value = chatModel;
    chatRenderHistory();
    queueChatScroll(messagesEl, 'auto');

    const textarea = winEl.querySelector('#chat-textarea');
    if (textarea) textarea.focus();
}

let chatIsSending = false;

async function chatSendMessage() {
    if (chatIsSending) return;
    const winEl = getChatWindowEl();
    if (!winEl) return;

    const textarea = winEl.querySelector('#chat-textarea');
    const text = textarea.value.trim();
    const uploadedImages = [...currentChatImages];
    if (!text && uploadedImages.length === 0) return;

    // Clear input immediately to prevent duplicate sends
    textarea.value = '';
    textarea.style.height = '';
    currentChatImages = [];
    chatRenderPreviews();

    chatIsSending = true;
    const sessionId = currentChatId;
    await addMessage(text, 'user', {
        winEl,
        images: uploadedImages,
        typewriter: false
    });

    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
        if (session.messages.length === 0 && text) {
            session.title = text.length > 20 ? `${text.substring(0, 20)}...` : text;
        }
        session.messages.push({
            role: 'user',
            text,
            images: uploadedImages.length > 0 ? uploadedImages : null,
            timestamp: Date.now()
        });
        chatSaveToDisk();
        chatRenderHistory();
    }

    showTypingIndicator(sessionId, winEl);

    const apiKey = localStorage.getItem('webos-gemini-key');
    if (apiKey && apiKey.trim().length > 10) {
        await chatCallGemini(winEl, apiKey.trim(), text, uploadedImages, sessionId);
        chatIsSending = false;
        return;
    }

    const responses = [
        "I'm currently in simulation mode, but the response feel much more natural now.",
        "That makes sense. I can help you work through it step by step.",
        "I can certainly help with that. Tell me what part you want to refine next.",
        "I don't have a live API key here, so this is a local simulated response."
    ];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    setTimeout(async () => {
        const storedSession = chatSessions.find(s => s.id === sessionId);
        if (storedSession) {
            storedSession.messages.push({ role: 'ai', text: randomResponse });
            chatSaveToDisk();
        }

        if (currentChatId === sessionId) {
            await hideTypingIndicator(CHAT_MESSAGE_DELAY_MS, sessionId);
            await addMessage(randomResponse, 'ai', { winEl, typewriter: true });
        }
        chatIsSending = false;
    }, 720 + Math.floor(Math.random() * 260));
}

async function chatCallGemini(winEl, apiKey, prompt, images = [], sessionId = currentChatId) {
    if (!chatEnsureRateLimitAvailable('Chat requests')) {
        await hideTypingIndicator(CHAT_MESSAGE_DELAY_MS, sessionId);
        return;
    }
    const modelName = chatModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const parts = [{ text: prompt }];
    images.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } }));

    let aiText = '';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] })
        });
        const data = await chatReadApiJson(response);
        aiText = data?.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
            ? data.candidates[0].content.parts[0].text
            : chatBuildApiErrorMessage(response, data, 'Error processing request.');
    } catch (error) {
        aiText = 'Connection failed.';
    }

    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
        session.messages.push({ role: 'ai', text: aiText, timestamp: Date.now() });
        chatSaveToDisk();
    }

    if (currentChatId !== sessionId) return;
    await hideTypingIndicator(CHAT_MESSAGE_DELAY_MS, sessionId);
    await addMessage(aiText, 'ai', { winEl, typewriter: true });
}

function chatAddMessage(winEl, role, text, images = null, save = true) {
    return addMessage(text, role, {
        winEl,
        images,
        animate: save !== false,
        typewriter: save !== false && role === 'ai'
    });
}
