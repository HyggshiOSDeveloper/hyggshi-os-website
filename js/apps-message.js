/* ============ Zashi Messaging APP (Supabase Edition) ============ */

const SB_URL = 'https://kwgxqxffjruykjzjhlkq.supabase.co';
const SB_KEY = 'sb_publishable_cj9pOUvJFPdOEtZCziWULQ_c-Ch1xPb';

const GC_TABLES = {
    users: 'users',
    rooms: 'rooms',
    messages: 'messages'
};

const GC_STORAGE_BUCKET = 'chat-files';
const GC_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#e84393', '#00cec9', '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0'];

let sbClient = null;
let gcUserId = null;
let gcUserName = '';
let gcUserColor = '';
let gcCurrentRoom = 'global';
let gcWin = null;
let gcSubscription = null;
let gcRoomsSubscription = null;
let gcSetupErrorShown = false;
let gcRoomCache = [];
let gcKnownMessageIds = new Set();
let gcPendingMessages = new Map();
let gcPendingAttachment = null;
let gcSyncInterval = null;
let gcActiveRoomRequestId = 0;
const GC_SYNC_INTERVAL_MS = 3000;
const gcTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/* ===== INIT ===== */
function initMessage(win) {
    gcWin = win;
    gcKnownMessageIds = new Set();
    gcPendingMessages = new Map();
    gcPendingAttachment = null;
    gcStopRoomSync();

    let cleanUrl = SB_URL.trim();
    try {
        cleanUrl = new URL(cleanUrl).origin;
    } catch (error) {
        console.error('Invalid Supabase URL:', error);
    }

    if (!cleanUrl || cleanUrl.includes('YOUR_SUPABASE_URL')) {
        showNotification('Zashi Messaging', 'Set a real Supabase URL in js/apps-message.js.');
        gcShowSetup(win);
        return;
    }

    if (window.location.protocol === 'file:') {
        showNotification('Zashi Messaging', 'Open this project with a local web server. file:// mode breaks parts of the app.');
    }

    try {
        if (typeof supabase === 'undefined') {
            showNotification('Zashi Messaging', 'Supabase library did not load.');
            return;
        }
        sbClient = supabase.createClient(cleanUrl, SB_KEY);
    } catch (error) {
        console.error('Supabase init error:', error);
        showNotification('Zashi Messaging', 'Cannot connect to Supabase.');
        return;
    }

    gcApplyEnglishCopy(win);
    gcBindComposer(win);
    gcBindGroupModal(win);

    const userName = localStorage.getItem('webos-gc-username');
    const userId = localStorage.getItem('webos-gc-userid');

    if (!userName || !userId) {
        gcShowSetup(win);
        return;
    }

    gcUserId = userId;
    gcUserName = userName;
    gcUserColor = localStorage.getItem('webos-gc-color') || GC_COLORS[0];
    gcHideSetup(win);
    gcStartApp(win);
}

/* ===== AUTH LOGIC ===== */
function gcToggleAuth(isRegister) {
    if (!gcWin) return;

    const loginCard = gcWin.querySelector('#gc-login-card');
    const registerCard = gcWin.querySelector('#gc-register-card');
    if (!loginCard || !registerCard) return;

    loginCard.classList.toggle('hidden', !!isRegister);
    registerCard.classList.toggle('hidden', !isRegister);
}

function gcFormatSupabaseError(error, tableName) {
    if (!error) return 'Unknown database error.';
    if (error.status === 404) {
        return `Missing Supabase REST resource "${tableName}". Run supabase-schema.sql in your project first.`;
    }
    return error.message || 'Database error.';
}

function gcFormatStorageError(error) {
    if (!error) return 'Upload failed.';
    if (error.status === 404) {
        return `Storage bucket "${GC_STORAGE_BUCKET}" is missing. Run supabase-schema.sql in your project first.`;
    }
    return error.message || 'Upload failed.';
}

function gcNotifySetupIssue(message) {
    if (!gcSetupErrorShown) {
        showNotification('Zashi Messaging', message);
        gcSetupErrorShown = true;
    }
    if (gcWin) gcShowSetup(gcWin);
}

async function gcEnsureBackendReady() {
    if (!sbClient) return false;

    for (const tableName of [GC_TABLES.rooms, GC_TABLES.messages, GC_TABLES.users]) {
        const { error } = await sbClient
            .from(tableName)
            .select('*', { head: true, count: 'exact' })
            .limit(1);

        if (error) {
            console.error('Supabase SQL Error:', error);
            gcNotifySetupIssue(gcFormatSupabaseError(error, tableName));
            return false;
        }
    }

    return true;
}

async function gcLogin() {
    if (!sbClient) {
        showNotification('Zashi Messaging', 'The chat backend is not ready.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-login-user');
    const passInp = gcWin.querySelector('#gc-login-pass');
    const username = userInp?.value.trim().toLowerCase();
    const password = passInp?.value.trim();

    if (!username || !password) return;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .select('*')
            .eq('username', username)
            .single();

        if (error) {
            console.error('Supabase SQL Error:', error);
            showNotification('Zashi Messaging', gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.password !== password) {
            showNotification('Zashi Messaging', 'Wrong username or password.');
            return;
        }

        gcSetUserSession(data.username, data.id, data.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Zashi Messaging', 'Database connection error.');
    }
}

async function gcRegister() {
    if (!sbClient) {
        showNotification('Zashi Messaging', 'The chat backend is not ready.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-reg-user');
    const passInp = gcWin.querySelector('#gc-reg-pass');
    const confirmInp = gcWin.querySelector('#gc-reg-confirm');

    const username = userInp?.value.trim().toLowerCase();
    const password = passInp?.value.trim();
    const confirmation = confirmInp?.value.trim();

    if (!username || !password) return;
    if (username.length < 3 || password.length < 6) {
        showNotification('Zashi Messaging', 'Username must be at least 3 characters and password at least 6 characters.');
        return;
    }
    if (password !== confirmation) {
        showNotification('Zashi Messaging', 'Passwords do not match.');
        return;
    }

    const color = GC_COLORS[Math.floor(Math.random() * GC_COLORS.length)];

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .insert([{ username, password, color }])
            .select();

        if (error) {
            console.error('Supabase SQL Error:', error);
            showNotification('Zashi Messaging', gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        const newUser = data?.[0];
        if (!newUser) {
            showNotification('Zashi Messaging', 'Registration failed.');
            return;
        }

        gcSetUserSession(newUser.username, newUser.id, newUser.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Register error:', error);
        showNotification('Zashi Messaging', 'System error while creating the account.');
    }
}

function gcSetUserSession(name, id, color) {
    gcUserName = name;
    gcUserId = id;
    gcUserColor = color;
    localStorage.setItem('webos-gc-username', name);
    localStorage.setItem('webos-gc-userid', id);
    localStorage.setItem('webos-gc-color', color);
}

/* ===== APP LOGIC ===== */
async function gcStartApp(win) {
    if (!await gcEnsureBackendReady()) return;

    const avatarEl = win.querySelector('.gc-user-avatar');
    if (avatarEl) {
        avatarEl.style.background = gcUserColor;
        avatarEl.textContent = gcUserName.charAt(0).toUpperCase();
    }

    const userNameEl = win.querySelector('.gc-user-name');
    if (userNameEl) userNameEl.textContent = gcUserName;

    gcListenRooms(win);
    gcSwitchRoom('global');
}

async function gcListenRooms(win) {
    if (!sbClient) return;

    const { data, error } = await sbClient.from(GC_TABLES.rooms).select('*');
    if (error) {
        console.error('Supabase SQL Error:', error);
        gcNotifySetupIssue(gcFormatSupabaseError(error, GC_TABLES.rooms));
        return;
    }

    gcRoomCache = data || [];
    gcRenderRoomList(win, gcRoomCache);

    if (gcRoomsSubscription) {
        sbClient.removeChannel(gcRoomsSubscription);
    }

    gcRoomsSubscription = sbClient.channel('public:rooms')
        .on('postgres_changes', { event: '*', schema: 'public', table: GC_TABLES.rooms }, () => {
            gcListenRooms(win);
        })
        .subscribe();
}

function gcRenderRoomList(win, rooms) {
    const list = win.querySelector('.gc-rooms-list');
    if (!list) return;

    list.innerHTML = '';

    if (!rooms.find(room => room.id === 'global')) {
        rooms.unshift({ id: 'global', name: 'Zashi Messaging', type: 'global' });
    }

    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = `gc-room-item${gcCurrentRoom === room.id ? ' active' : ''}`;
        div.onclick = () => gcSwitchRoom(room.id);

        const icon = room.type === 'global' ? 'public' : 'group';
        const preview = room.type === 'global'
            ? 'Shared conversation for everyone'
            : 'Group conversation';
        const meta = room.id === gcCurrentRoom ? 'Open now' : 'Today';

        div.innerHTML = `
            <div class="gc-room-icon ${room.type}"><span class="material-icons-round">${icon}</span></div>
            <div class="gc-room-info">
                <div class="gc-room-name-row">
                    <div class="gc-room-name">${gcEscape(room.name)}</div>
                    <div class="gc-room-meta">${meta}</div>
                </div>
                <div class="gc-room-preview">${preview}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

async function gcSwitchRoom(roomId) {
    if (!sbClient) return;
    const requestId = ++gcActiveRoomRequestId;

    gcStopRoomSync();

    gcCurrentRoom = roomId;
    gcKnownMessageIds = new Set();
    gcPendingMessages.clear();

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;
    msgContainer.innerHTML = '';

    const { data: messages, error } = await sbClient
        .from(GC_TABLES.messages)
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Supabase SQL Error:', error);
        gcNotifySetupIssue(gcFormatSupabaseError(error, GC_TABLES.messages));
        return;
    }
    if (requestId !== gcActiveRoomRequestId || roomId !== gcCurrentRoom) return;

    gcRenderRoomList(gcWin, gcRoomCache);
    (messages || []).slice().reverse().forEach(msg => {
        if (msg.id) gcKnownMessageIds.add(msg.id);
        gcAppendMessage(msgContainer, msg);
    });
    msgContainer.scrollTop = msgContainer.scrollHeight;

    gcStartRoomSync(roomId);
    gcUpdateHeader(roomId);
}

function gcStopRoomSync() {
    if (gcSubscription) {
        sbClient?.removeChannel(gcSubscription);
        gcSubscription = null;
    }
    if (gcSyncInterval) {
        window.clearInterval(gcSyncInterval);
        gcSyncInterval = null;
    }
}

function gcStartRoomSync(roomId) {
    gcSubscription = sbClient.channel(`room:${roomId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: GC_TABLES.messages,
            filter: `room_id=eq.${roomId}`
        }, payload => {
            gcHandleIncomingMessage(payload.new);
        })
        .subscribe();

    gcSyncLatestMessages(roomId);
    gcSyncInterval = window.setInterval(() => {
        gcSyncLatestMessages(roomId);
    }, GC_SYNC_INTERVAL_MS);
}

async function gcSyncLatestMessages(roomId = gcCurrentRoom) {
    if (!sbClient || roomId !== gcCurrentRoom) return;

    const { data: messages, error } = await sbClient
        .from(GC_TABLES.messages)
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Supabase sync error:', error);
        return;
    }

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;

    let appended = false;
    (messages || []).slice().reverse().forEach(msg => {
        if (!msg?.id || gcKnownMessageIds.has(msg.id)) return;
        gcKnownMessageIds.add(msg.id);
        gcAppendMessage(msgContainer, msg);
        appended = true;
    });

    if (appended) msgContainer.scrollTop = msgContainer.scrollHeight;
}

function gcUpdateHeader(roomId) {
    const headerName = gcWin?.querySelector('.gc-chat-header-name');
    const headerStatus = gcWin?.querySelector('.gc-chat-header-status');
    const headerIcon = gcWin?.querySelector('.gc-chat-header-icon');
    const room = gcRoomCache.find(item => item.id === roomId) || {
        id: roomId,
        name: roomId === 'global' ? 'Zashi Messaging' : 'Group Chat',
        type: roomId === 'global' ? 'global' : 'group'
    };

    if (headerName) headerName.textContent = room.name;
    if (headerStatus) {
        headerStatus.textContent = room.type === 'global'
            ? 'The community is chatting now'
            : 'This group is active';
    }
    if (headerIcon) {
        headerIcon.innerHTML = `<span class="material-icons-round">${room.type === 'global' ? 'forum' : 'groups'}</span>`;
    }
}

function gcAppendMessage(container, msg, options = {}) {
    const isSent = msg.sender_id === gcUserId || options.forceSent;
    const div = document.createElement('div');
    div.className = `gc-msg${isSent ? ' sent' : ''}${options.pending ? ' pending' : ''}`;
    if (options.tempId) div.dataset.tempId = options.tempId;
    if (msg.id) div.dataset.messageId = msg.id;

    const initials = (msg.sender_name || '?')[0].toUpperCase();
    const color = msg.sender_color || '#6c5ce7';
    const timeText = options.statusText || gcFormatMessageTime(msg.created_at);

    let contentHtml = '';
    if (msg.type === 'image') {
        const safeUrl = gcEscape(msg.file_url || '');
        contentHtml = `<img src="${safeUrl}" class="gc-msg-media" style="cursor:pointer" onclick="gcOpenExternalMedia(this.src)">`;
    } else if (msg.type === 'video') {
        contentHtml = `<video src="${gcEscape(msg.file_url || '')}" controls class="gc-msg-media"></video>`;
    } else {
        contentHtml = gcRenderMessageTextContent(msg.text || '');
    }

    const progressHtml = options.progress === true ? `
        <div class="gc-upload-progress">
            <div class="gc-upload-progress-bar" style="width:${Math.max(0, Math.min(100, options.progressValue || 0))}%"></div>
        </div>
    ` : '';

    div.innerHTML = `
        <div class="gc-msg-avatar" style="background:${color}">${initials}</div>
        <div class="gc-msg-body">
            <div class="gc-msg-sender" style="color:${color}">${gcEscape(msg.sender_name || 'Unknown')}</div>
            ${contentHtml}
            ${progressHtml}
            <div class="gc-msg-time">${timeText}</div>
        </div>
    `;

    container.appendChild(div);
    return div;
}

function gcHandleIncomingMessage(msg) {
    if (!msg || msg.room_id !== gcCurrentRoom) return;
    if (msg.id && gcKnownMessageIds.has(msg.id)) return;

    const pendingMatch = gcFindPendingMessageMatch(msg);
    if (pendingMatch) {
        const pendingEl = gcPendingMessages.get(pendingMatch);
        if (pendingEl) gcReplacePendingMessage(pendingEl, msg);
        gcPendingMessages.delete(pendingMatch);
    } else {
        const msgContainer = gcWin?.querySelector('.gc-messages');
        if (!msgContainer) return;
        gcAppendMessage(msgContainer, msg);
    }

    if (msg.id) gcKnownMessageIds.add(msg.id);

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
}

function gcFindPendingMessageMatch(msg) {
    for (const [tempId, element] of gcPendingMessages.entries()) {
        const type = element.dataset.messageType;
        const text = element.dataset.messageText || '';
        const fileUrl = element.dataset.fileUrl || '';

        if (type !== msg.type) continue;
        if (type === 'text' && text === (msg.text || '')) return tempId;
        if ((type === 'image' || type === 'video') && fileUrl && fileUrl === (msg.file_url || '')) return tempId;
    }
    return null;
}

function gcReplacePendingMessage(element, msg) {
    if (!element) return;
    const bubble = element.querySelector('.gc-msg-bubble');
    if (bubble) bubble.textContent = msg.text || '';
    element.classList.remove('pending');
    element.dataset.messageId = msg.id;
    const timeEl = element.querySelector('.gc-msg-time');
    if (timeEl) timeEl.textContent = gcFormatMessageTime(msg.created_at || new Date().toISOString());
    element.querySelector('.gc-upload-progress')?.remove();
}

/* ===== SEND & UPLOAD ===== */
async function gcSendMessage() {
    if (!sbClient || !gcWin) return;

    const textarea = gcWin.querySelector('.gc-input-box textarea');
    const text = textarea?.value.trim() || '';
    const attachment = gcPendingAttachment;

    if (!text && !attachment) return;

    if (attachment) {
        await gcSendAttachment(attachment, text);
        return;
    }

    if (!textarea || !text) return;

    textarea.value = '';
    gcResizeTextarea(textarea);

    const optimistic = {
        room_id: gcCurrentRoom,
        text,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type: 'text',
        created_at: new Date().toISOString()
    };

    const tempId = gcCreateTempId('text');
    const msgContainer = gcWin.querySelector('.gc-messages');
    const pendingEl = gcAppendMessage(msgContainer, optimistic, {
        forceSent: true,
        pending: true,
        tempId,
        statusText: 'Sending...'
    });
    pendingEl.dataset.messageType = 'text';
    pendingEl.dataset.messageText = text;
    gcPendingMessages.set(tempId, pendingEl);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    const { data, error } = await sbClient
        .from(GC_TABLES.messages)
        .insert([optimistic])
        .select()
        .single();

    if (error) {
        console.error('Supabase SQL Error:', error);
        showNotification('Zashi Messaging', gcFormatSupabaseError(error, GC_TABLES.messages));
        pendingEl.remove();
        gcPendingMessages.delete(tempId);
        textarea.value = text;
        gcResizeTextarea(textarea);
        return;
    }

    gcPendingMessages.delete(tempId);
    if (data?.id) gcKnownMessageIds.add(data.id);
    gcReplacePendingMessage(pendingEl, data || optimistic);
}

async function gcHandleFileSelect(input) {
    const file = input?.files?.[0];
    if (!file) return;
    gcPrepareAttachment(file);
    input.value = '';
}

async function gcSendAttachment(attachment, extraText = '') {
    if (!sbClient || !gcWin || !attachment?.file) return;

    const file = attachment.file;
    const type = attachment.type;
    const previewUrl = attachment.previewUrl;
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const filePath = `${gcUserId}/${Date.now()}.${ext}`;
    const tempId = gcCreateTempId(type);
    const msgContainer = gcWin.querySelector('.gc-messages');

    gcPendingAttachment = null;
    gcWin.querySelector('.gc-attachment-preview')?.remove();

    const optimistic = {
        room_id: gcCurrentRoom,
        file_url: previewUrl,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type,
        created_at: new Date().toISOString()
    };

    const pendingEl = gcAppendMessage(msgContainer, optimistic, {
        forceSent: true,
        pending: true,
        tempId,
        statusText: 'Uploading...',
        progress: true,
        progressValue: 0
    });
    pendingEl.dataset.messageType = type;
    pendingEl.dataset.fileUrl = previewUrl;
    gcPendingMessages.set(tempId, pendingEl);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    try {
        await gcUploadFileWithProgress(file, filePath, percent => {
            const bar = pendingEl.querySelector('.gc-upload-progress-bar');
            if (bar) bar.style.width = `${percent}%`;
        });

        const { data: urlData } = sbClient.storage
            .from(GC_STORAGE_BUCKET)
            .getPublicUrl(filePath);

        pendingEl.dataset.fileUrl = urlData.publicUrl;

        const payload = {
            room_id: gcCurrentRoom,
            file_url: urlData.publicUrl,
            sender_id: gcUserId,
            sender_name: gcUserName,
            sender_color: gcUserColor,
            type
        };

        const { data, error } = await sbClient
            .from(GC_TABLES.messages)
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        gcPendingMessages.delete(tempId);
        if (data?.id) gcKnownMessageIds.add(data.id);
        gcReplacePendingMessage(pendingEl, data || payload);
        URL.revokeObjectURL(previewUrl);

        const trimmedText = extraText.trim();
        if (trimmedText) {
            const textarea = gcWin.querySelector('.gc-input-box textarea');
            if (textarea) {
                textarea.value = trimmedText;
                await gcSendMessage();
            }
        }
    } catch (error) {
        console.error('Attachment send error:', error);
        showNotification('Zashi Messaging', gcFormatStorageError(error));
        pendingEl.remove();
        gcPendingMessages.delete(tempId);
        URL.revokeObjectURL(previewUrl);
        gcPrepareAttachment(file);
        const textarea = gcWin.querySelector('.gc-input-box textarea');
        if (textarea && extraText) {
            textarea.value = extraText;
            gcResizeTextarea(textarea);
        }
    }
}

function gcUploadFileWithProgress(file, filePath, onProgress) {
    return new Promise((resolve, reject) => {
        if (!sbClient) {
            reject(new Error('Storage client is not ready.'));
            return;
        }

        let progress = 0;
        if (typeof onProgress === 'function') onProgress(progress);

        const progressTimer = window.setInterval(() => {
            progress = Math.min(progress + 8, 90);
            if (typeof onProgress === 'function') onProgress(progress);
        }, 120);

        sbClient.storage
            .from(GC_STORAGE_BUCKET)
            .upload(filePath, file, {
                upsert: false,
                contentType: file.type || 'application/octet-stream'
            })
            .then(({ data, error }) => {
                window.clearInterval(progressTimer);

                if (error) {
                    reject(error);
                    return;
                }

                if (typeof onProgress === 'function') onProgress(100);
                resolve(data);
            })
            .catch(error => {
                window.clearInterval(progressTimer);
                reject(error);
            });
    });
}

/* ===== COMPOSER ===== */
function gcBindComposer(win) {
    const textarea = win.querySelector('.gc-input-box textarea');
    const inputArea = win.querySelector('.gc-input-area');
    const fileInput = win.querySelector('#gc-file-input');
    const imageTool = win.querySelector('.gc-tool-btn[data-role="image"]') || win.querySelector('.gc-composer-tools .gc-tool-btn');

    if (textarea && !textarea.dataset.gcBound) {
        textarea.dataset.gcBound = 'true';
        textarea.removeAttribute('onkeydown');
        textarea.dataset.gcComposing = 'false';
        textarea.addEventListener('compositionstart', () => {
            textarea.dataset.gcComposing = 'true';
        });
        textarea.addEventListener('compositionend', () => {
            textarea.dataset.gcComposing = 'false';
        });
        textarea.addEventListener('keydown', event => {
            if (event.isComposing || textarea.dataset.gcComposing === 'true') return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                gcSendMessage();
            }
        });
        textarea.addEventListener('input', () => gcResizeTextarea(textarea));
        gcResizeTextarea(textarea);
    }

    if (inputArea && !inputArea.dataset.gcDropBound) {
        inputArea.dataset.gcDropBound = 'true';
        ['dragenter', 'dragover'].forEach(eventName => {
            inputArea.addEventListener(eventName, event => {
                event.preventDefault();
                inputArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            inputArea.addEventListener(eventName, event => {
                event.preventDefault();
                if (eventName === 'drop') {
                    const droppedFile = event.dataTransfer?.files?.[0];
                    if (droppedFile) gcPrepareAttachment(droppedFile);
                    inputArea.classList.remove('drag-over');
                    return;
                }
                if (!event.relatedTarget || !inputArea.contains(event.relatedTarget)) {
                    inputArea.classList.remove('drag-over');
                }
            });
        });
    }

    if (imageTool && !imageTool.dataset.gcBound) {
        imageTool.dataset.gcBound = 'true';
        imageTool.addEventListener('click', () => fileInput?.click());
    }
}

function gcResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
}

function gcPrepareAttachment(file) {
    if (!gcWin) return;

    if (file.size > 5 * 1024 * 1024) {
        showNotification('Zashi Messaging', 'Maximum file size is 5 MB.');
        return;
    }

    if (file.type.startsWith('video/')) {
        showNotification('Zashi Messaging', 'Video upload trực tiếp chưa hỗ trợ. Hãy dán link Google Drive, YouTube hoặc TikTok để chia sẻ.');
        return;
    }

    const type = file.type.startsWith('image/') ? 'image' : null;
    if (!type) {
        showNotification('Zashi Messaging', 'Only image files are supported here. For videos, use a Google Drive, YouTube, or TikTok link.');
        return;
    }

    gcClearAttachmentPreview();

    const previewUrl = URL.createObjectURL(file);
    gcPendingAttachment = { file, type, previewUrl };

    const inputArea = gcWin.querySelector('.gc-input-area');
    if (!inputArea) return;

    const preview = document.createElement('div');
    preview.className = 'gc-attachment-preview';
    preview.innerHTML = `
        <button class="gc-attachment-remove" type="button" aria-label="Remove attachment">
            <span class="material-icons-round">close</span>
        </button>
        <div class="gc-attachment-preview-media">
            ${type === 'image'
            ? `<img src="${previewUrl}" alt="${gcEscape(file.name)}">`
            : `<video src="${previewUrl}" muted></video>`}
        </div>
        <div class="gc-attachment-preview-info">
            <div class="gc-attachment-preview-title">${gcEscape(file.name)}</div>
            <div class="gc-attachment-preview-meta">Image ready to send</div>
        </div>
    `;

    preview.querySelector('.gc-attachment-remove')?.addEventListener('click', () => gcClearAttachmentPreview());
    inputArea.insertBefore(preview, inputArea.firstChild);
}

function gcBindGroupModal(win) {
    const overlay = win.querySelector('.gc-modal-overlay');
    const modal = win.querySelector('.gc-modal');
    const input = win.querySelector('#gc-group-name');
    if (!overlay || !modal || !input || overlay.dataset.gcBound) return;

    overlay.dataset.gcBound = 'true';

    overlay.addEventListener('click', event => {
        if (event.target === overlay) gcHideModal();
    });

    modal.addEventListener('click', event => {
        event.stopPropagation();
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            gcHideModal();
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            gcCreateGroup();
        }
    });
}

function gcApplyEnglishCopy(win) {
    const mappings = [
        ['.gc-user-subtitle', 'Active now'],
        ['.gc-rooms-label', 'Messages'],
        ['.gc-chat-header-status', 'Choose a conversation to start chatting'],
        ['.gc-members-title', 'Online Members']
    ];

    mappings.forEach(([selector, text]) => {
        const element = win.querySelector(selector);
        if (element) element.textContent = text;
    });

    const createBtn = win.querySelector('.gc-create-btn');
    if (createBtn) createBtn.innerHTML = '<span class="material-icons-round">add_comment</span> Create group chat';

    const searchInput = win.querySelector('.gc-sidebar-search input');
    if (searchInput) searchInput.placeholder = 'Search conversations';

    const searchBtn = win.querySelector('.gc-header-actions .gc-header-btn[title]');
    if (searchBtn) searchBtn.title = 'Search in chat';

    const headerButtons = win.querySelectorAll('.gc-header-actions .gc-header-btn');
    if (headerButtons[1]) headerButtons[1].title = 'Pin conversation';
    if (headerButtons[2]) headerButtons[2].title = 'Members';

    const toolButtons = win.querySelectorAll('.gc-composer-tools .gc-tool-btn');
    if (toolButtons[0]) toolButtons[0].title = 'Image';
    if (toolButtons[1]) toolButtons[1].title = 'Sticker';
    if (toolButtons[2]) toolButtons[2].title = 'Image upload';

    const uploadBtn = win.querySelector('.gc-input-box .gc-header-btn');
    if (uploadBtn) uploadBtn.title = 'Upload image';
}

function gcClearAttachmentPreview() {
    if (gcPendingAttachment?.previewUrl) {
        URL.revokeObjectURL(gcPendingAttachment.previewUrl);
    }
    gcPendingAttachment = null;
    gcWin?.querySelector('.gc-attachment-preview')?.remove();
}

function gcCreateTempId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ===== UTILS ===== */
function gcShowSetup(win) {
    win?.querySelector('.gc-setup-overlay')?.classList.remove('hidden');
}

function gcHideSetup(win) {
    win?.querySelector('.gc-setup-overlay')?.classList.add('hidden');
}

function gcEscape(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function gcRenderMessageTextContent(text) {
    const preview = gcExtractSupportedVideoLink(text);
    const safeText = gcLinkifyText(text);
    const previewHtml = preview ? gcBuildLinkPreviewHtml(preview) : '';
    return `
        <div class="gc-msg-bubble">${safeText}</div>
        ${previewHtml}
    `;
}

function gcLinkifyText(text) {
    const escapedText = gcEscape(text || '');
    return escapedText
        .replace(/(https?:\/\/[^\s<]+)/gi, url => {
            const safeUrl = gcEscape(url);
            return `<a href="${safeUrl}" class="gc-msg-link" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
        })
        .replace(/\n/g, '<br>');
}

function gcExtractSupportedVideoLink(text) {
    if (!text) return null;
    const matches = text.match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of matches) {
        const preview = gcGetLinkPreviewData(rawUrl);
        if (preview) return preview;
    }
    return null;
}

function gcGetLinkPreviewData(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        return null;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        if (!videoId) return null;
        return {
            type: 'youtube',
            url: rawUrl,
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
            label: 'YouTube video'
        };
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
        const videoId = parsed.searchParams.get('v');
        if (!videoId) return null;
        return {
            type: 'youtube',
            url: rawUrl,
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
            label: 'YouTube video'
        };
    }

    if (host === 'drive.google.com') {
        return {
            type: 'drive',
            url: rawUrl,
            label: 'Google Drive video'
        };
    }

    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
        return {
            type: 'tiktok',
            url: rawUrl,
            label: 'TikTok video'
        };
    }

    return null;
}

function gcBuildLinkPreviewHtml(preview) {
    const safeUrl = gcEscape(preview.url || '');
    const safeLabel = gcEscape(preview.label || 'Video link');

    if (preview.type === 'youtube' && preview.embedUrl) {
        const safeEmbedUrl = gcEscape(preview.embedUrl);
        return `
            <div class="gc-link-preview gc-link-preview-youtube">
                <div class="gc-link-preview-frame">
                    <iframe
                        src="${safeEmbedUrl}"
                        title="${safeLabel}"
                        loading="lazy"
                        referrerpolicy="strict-origin-when-cross-origin"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>
                </div>
                <a href="${safeUrl}" class="gc-link-preview-action" target="_blank" rel="noopener noreferrer">Open on YouTube</a>
            </div>
        `;
    }

    const platformName = preview.type === 'drive'
        ? 'Google Drive'
        : preview.type === 'tiktok'
            ? 'TikTok'
            : 'Video link';

    return `
        <div class="gc-link-preview gc-link-preview-card">
            <div class="gc-link-preview-eyebrow">${platformName}</div>
            <div class="gc-link-preview-title">${safeLabel}</div>
            <a href="${safeUrl}" class="gc-link-preview-action" target="_blank" rel="noopener noreferrer">Open video link</a>
        </div>
    `;
}

function gcFormatMessageTime(value) {
    if (!value) return '';
    const normalizedValue = typeof value === 'string' ? value.replace(' ', 'T') : value;
    const date = new Date(normalizedValue);
    if (isNaN(date.getTime())) return '';
    return gcTimeFormatter.format(date);
}

function gcOpenExternalMedia(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
}

function gcShowSettings() {
    if (confirm('Log out?')) {
        localStorage.removeItem('webos-gc-username');
        localStorage.removeItem('webos-gc-userid');
        localStorage.removeItem('webos-gc-color');
        location.reload();
    }
}

function gcShowCreateGroup() {
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const input = gcWin?.querySelector('#gc-group-name');
    if (!overlay || !input) return;

    input.value = '';
    overlay.classList.remove('hidden');
    window.setTimeout(() => input.focus(), 0);
}

function gcHideModal() {
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const input = gcWin?.querySelector('#gc-group-name');
    if (overlay) overlay.classList.add('hidden');
    if (input) input.value = '';
}

function gcBuildRoomId(name) {
    const slug = (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `group-${slug || 'room'}-${suffix}`;
}

async function gcCreateGroup() {
    if (!sbClient || !gcWin) return;

    const input = gcWin.querySelector('#gc-group-name');
    const createBtn = gcWin.querySelector('.gc-btn-primary');
    const rawName = input?.value || '';
    const name = rawName.trim().replace(/\s+/g, ' ');

    if (!name) {
        showNotification('Zashi Messaging', 'Enter a group name.');
        input?.focus();
        return;
    }

    if (name.length < 3) {
        showNotification('Zashi Messaging', 'Group name must be at least 3 characters.');
        input?.focus();
        return;
    }

    const duplicate = gcRoomCache.some(room =>
        room.type !== 'global' && (room.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
        showNotification('Zashi Messaging', 'A group with this name already exists.');
        input?.focus();
        input?.select();
        return;
    }

    const payload = {
        id: gcBuildRoomId(name),
        name,
        type: 'group'
    };

    if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
    }

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.rooms)
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Create group error:', error);
            showNotification('Zashi Messaging', gcFormatSupabaseError(error, GC_TABLES.rooms));
            return;
        }

        if (data) {
            gcRoomCache = gcRoomCache.filter(room => room.id !== data.id);
            gcRoomCache.push(data);
            gcRenderRoomList(gcWin, gcRoomCache);
            gcHideModal();
            gcSwitchRoom(data.id);
            showNotification('Zashi Messaging', `Created group "${data.name}".`);
        }
    } catch (error) {
        console.error('Create group error:', error);
        showNotification('Zashi Messaging', 'Could not create the group.');
    } finally {
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create';
        }
    }
}

function gcToggleMembers() {
    showNotification('Zashi Messaging', 'Member list is not implemented yet.');
}
