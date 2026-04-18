/* ============ Zashi Messaging APP (Supabase Edition) ============ */

const SB_URL = 'https://kwgxqxffjruykjzjhlkq.supabase.co';
const SB_KEY = 'sb_publishable_cj9pOUvJFPdOEtZCziWULQ_c-Ch1xPb';

const GC_TABLES = {
    users: 'users',
    rooms: 'rooms',
    messages: 'messages',
    roomMembers: 'room_members'
};

const GC_STORAGE_BUCKET = 'chat-files';
const GC_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#e84393', '#00cec9', '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0'];

let sbClient = null;
let gcUserId = null;
let gcUserName = '';
let gcUserColor = '';
let gcUserAvatarUrl = '';
let gcCurrentRoom = 'global';
let gcWin = null;
let gcSubscription = null;
let gcRoomsSubscription = null;
let gcSetupErrorShown = false;
let gcRoomCache = [];
let gcRoomMembersCache = [];
let gcCurrentRoomMessages = [];
let gcKnownMessageIds = new Set();
let gcPendingMessages = new Map();
let gcPendingAttachment = null;
let gcSyncInterval = null;
let gcActiveRoomRequestId = 0;
let gcPinnedRoomIds = new Set();
let gcMembersPanelOpen = false;
let gcAvatarUploadMode = 'user';
let gcCurrentUserRoomRole = 'member';
const GC_PINNED_ROOMS_KEY = 'webos-gc-pinned-rooms';
const GC_MAX_AVATAR_BYTES = 500 * 1024;
const GC_AVATAR_PRIMARY_SIZE = 256;
const GC_AVATAR_FALLBACK_SIZE = 128;
const GC_SYNC_INTERVAL_MS = 3000;
const gcTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

/* ===== INIT ===== */
function initMessage(win) {
    gcWin = win;
    gcCurrentRoomMessages = [];
    gcKnownMessageIds = new Set();
    gcPendingMessages = new Map();
    gcPendingAttachment = null;
    gcMembersPanelOpen = false;
    gcPinnedRoomIds = gcLoadPinnedRooms();
    gcStopRoomSync();

    let cleanUrl = SB_URL.trim();
    try {
        cleanUrl = new URL(cleanUrl).origin;
    } catch (error) {
        console.error('Invalid Supabase URL:', error);
    }

    if (!cleanUrl || cleanUrl.includes('YOUR_SUPABASE_URL')) {
        gcNotifyError('Set a real Supabase URL in js/apps-message.js.');
        gcShowSetup(win);
        return;
    }

    if (window.location.protocol === 'file:') {
        gcNotifyError('Open this project with a local web server. file:// mode breaks parts of the app.');
    }

    try {
        if (typeof supabase === 'undefined') {
            gcNotifyError('Supabase library did not load.');
            return;
        }
        sbClient = supabase.createClient(cleanUrl, SB_KEY);
    } catch (error) {
        console.error('Supabase init error:', error);
        gcNotifyError('Cannot connect to Supabase.');
        return;
    }

    gcApplyEnglishCopy(win);
    gcBindComposer(win);
    gcBindGroupModal(win);
    gcBindHeaderActions(win);
    gcBindAvatarActions(win);

    const userName = localStorage.getItem('webos-gc-username');
    const userId = localStorage.getItem('webos-gc-userid');
    const userAvatarUrl = localStorage.getItem('webos-gc-avatar') || '';

    if (!userName || !userId) {
        gcShowSetup(win);
        return;
    }

    gcUserId = userId;
    gcUserName = userName;
    gcUserColor = localStorage.getItem('webos-gc-color') || GC_COLORS[0];
    gcUserAvatarUrl = userAvatarUrl;
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

function gcNotifyError(message) {
    showNotification('Zashi Messaging', message, 'error');
}

function gcNotifySetupIssue(message) {
    if (!gcSetupErrorShown) {
        gcNotifyError(message);
        gcSetupErrorShown = true;
    }
    if (gcWin) gcShowSetup(gcWin);
}

async function gcEnsureBackendReady() {
    if (!sbClient) return false;

    for (const tableName of [GC_TABLES.rooms, GC_TABLES.messages, GC_TABLES.users, GC_TABLES.roomMembers]) {
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
        gcNotifyError('The chat backend is not ready.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-login-user');
    const passInp = gcWin.querySelector('#gc-login-pass');
    const username = userInp?.value.trim().toLowerCase();
    const usernameKey = gcBuildNameKey(username);
    const password = passInp?.value.trim();

    if (!username || !password || !usernameKey) return;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .select('*')
            .eq('username_key', usernameKey)
            .single();

        if (error) {
            console.error('Supabase SQL Error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.password !== password) {
            gcNotifyError('Wrong username or password.');
            return;
        }

        gcSetUserSession(data.username, data.id, data.color, data.avatar_url);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Login error:', error);
        gcNotifyError('Database connection error.');
    }
}

async function gcRegister() {
    if (!sbClient) {
        gcNotifyError('The chat backend is not ready.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-reg-user');
    const passInp = gcWin.querySelector('#gc-reg-pass');
    const confirmInp = gcWin.querySelector('#gc-reg-confirm');

    const username = userInp?.value.trim().toLowerCase();
    const usernameKey = gcBuildNameKey(username);
    const password = passInp?.value.trim();
    const confirmation = confirmInp?.value.trim();

    if (!username || !password || !usernameKey) return;
    if (usernameKey.length < 3 || password.length < 6) {
        gcNotifyError('Username must be at least 3 characters and password at least 6 characters.');
        return;
    }
    if (password !== confirmation) {
        gcNotifyError('Passwords do not match.');
        return;
    }

    const color = GC_COLORS[Math.floor(Math.random() * GC_COLORS.length)];

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .insert([{ username, username_key: usernameKey, password, color }])
            .select();

        if (error) {
            console.error('Supabase SQL Error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        const newUser = data?.[0];
        if (!newUser) {
            gcNotifyError('Registration failed.');
            return;
        }

        gcSetUserSession(newUser.username, newUser.id, newUser.color, newUser.avatar_url);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Register error:', error);
        gcNotifyError('System error while creating the account.');
    }
}

function gcSetUserSession(name, id, color, avatarUrl = '') {
    gcUserName = name;
    gcUserId = id;
    gcUserColor = color;
    gcUserAvatarUrl = avatarUrl || '';
    localStorage.setItem('webos-gc-username', name);
    localStorage.setItem('webos-gc-userid', id);
    localStorage.setItem('webos-gc-color', color);
    localStorage.setItem('webos-gc-avatar', gcUserAvatarUrl);
}

function gcLoadPinnedRooms() {
    try {
        const raw = localStorage.getItem(GC_PINNED_ROOMS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
        return new Set();
    }
}

function gcSavePinnedRooms() {
    localStorage.setItem(GC_PINNED_ROOMS_KEY, JSON.stringify([...gcPinnedRoomIds]));
}

function gcIsRoomPinned(roomId) {
    return gcPinnedRoomIds.has(roomId);
}

function gcGetRoomById(roomId = gcCurrentRoom) {
    return gcRoomCache.find(room => room.id === roomId) || null;
}

function gcIsGroupRoom(roomId = gcCurrentRoom) {
    const room = gcGetRoomById(roomId);
    return room?.type === 'group';
}

function gcCanManageGroup(roomId = gcCurrentRoom) {
    if (!gcIsGroupRoom(roomId)) return false;
    return gcCurrentUserRoomRole === 'owner' || gcCurrentUserRoomRole === 'deputy';
}

function gcCanDeleteGroup(roomId = gcCurrentRoom) {
    if (!gcIsGroupRoom(roomId)) return false;
    return gcCurrentUserRoomRole === 'owner';
}

function gcCanAppointDeputy(roomId = gcCurrentRoom) {
    if (!gcIsGroupRoom(roomId)) return false;
    return gcCurrentUserRoomRole === 'owner';
}

function gcGetRoleLabel(role) {
    if (role === 'owner') return 'Leader';
    if (role === 'deputy') return 'Deputy';
    return 'Member';
}

function gcBuildNameKey(value) {
    return (value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function gcGetInitials(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function gcSetAvatarContent(element, options = {}) {
    if (!element) return;

    const {
        avatarUrl = '',
        initials = '?',
        color = '#6c5ce7',
        icon = ''
    } = options;

    element.classList.toggle('has-image', !!avatarUrl);
    element.style.background = avatarUrl ? 'transparent' : color;
    element.innerHTML = avatarUrl
        ? `<img src="${gcEscape(avatarUrl)}" alt="${gcEscape(initials)}">`
        : (icon ? `<span class="material-icons-round">${icon}</span>` : gcEscape(initials));
}

function gcRenderUserIdentity(win = gcWin) {
    if (!win) return;

    const avatarEl = win.querySelector('.gc-user-avatar');
    if (avatarEl) {
        gcSetAvatarContent(avatarEl, {
            avatarUrl: gcUserAvatarUrl,
            initials: gcGetInitials(gcUserName),
            color: gcUserColor
        });
        avatarEl.title = 'Change your avatar';
    }

    const userNameEl = win.querySelector('.gc-user-name');
    if (userNameEl) userNameEl.textContent = gcUserName;
}

function gcSortRooms(rooms) {
    return [...rooms].sort((a, b) => {
        if (a.id === 'global') return -1;
        if (b.id === 'global') return 1;

        const pinnedDelta = Number(gcIsRoomPinned(b.id)) - Number(gcIsRoomPinned(a.id));
        if (pinnedDelta !== 0) return pinnedDelta;

        return (a.name || '').localeCompare(b.name || '');
    });
}

/* ===== APP LOGIC ===== */
async function gcStartApp(win) {
    if (!await gcEnsureBackendReady()) return;
    gcRenderUserIdentity(win);

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
    gcRoomCache = gcSortRooms(gcRoomCache);
    gcRenderRoomList(win, gcRoomCache);

    if (gcCurrentRoom !== 'global' && !gcRoomCache.some(room => room.id === gcCurrentRoom)) {
        gcSwitchRoom('global');
        return;
    }

    gcUpdateHeader(gcCurrentRoom);

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

    gcSortRooms(rooms).forEach(room => {
        const div = document.createElement('div');
        const isPinned = gcIsRoomPinned(room.id);
        div.className = `gc-room-item${gcCurrentRoom === room.id ? ' active' : ''}${isPinned ? ' pinned' : ''}`;
        div.onclick = () => gcSwitchRoom(room.id);

        const icon = room.type === 'global' ? 'public' : 'group';
        const preview = room.type === 'global'
            ? 'Shared conversation for everyone'
            : 'Group conversation';
        const meta = room.id === gcCurrentRoom ? 'Open now' : (isPinned ? 'Pinned' : 'Today');

        div.innerHTML = `
            <div class="gc-room-icon ${room.type}">${room.avatar_url
                ? `<img src="${gcEscape(room.avatar_url)}" alt="${gcEscape(room.name)}">`
                : `<span class="material-icons-round">${icon}</span>`}</div>
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
    gcCurrentUserRoomRole = roomId === 'global' ? 'owner' : 'member';
    gcRoomMembersCache = [];
    gcKnownMessageIds = new Set();
    gcPendingMessages.clear();

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;
    msgContainer.innerHTML = '';
    gcCurrentRoomMessages = [];

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

    await gcLoadRoomMembers(roomId);
    gcRenderRoomList(gcWin, gcRoomCache);
    const orderedMessages = (messages || []).slice().reverse();
    gcCurrentRoomMessages = orderedMessages.slice();
    orderedMessages.forEach(msg => {
        if (msg.id) gcKnownMessageIds.add(msg.id);
        gcAppendMessage(msgContainer, msg);
    });
    msgContainer.scrollTop = msgContainer.scrollHeight;

    gcStartRoomSync(roomId);
    gcUpdateHeader(roomId);
    gcRefreshMembersPanel();
}

async function gcEnsureRoomMembership(roomId = gcCurrentRoom) {
    if (!sbClient || !gcUserId || !gcIsGroupRoom(roomId)) return;

    const exists = gcRoomMembersCache.some(member => member.user_id === gcUserId);
    if (exists) return;

    const payload = {
        room_id: roomId,
        user_id: gcUserId,
        role: 'member'
    };

    const { error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .upsert([payload], { onConflict: 'room_id,user_id' });

    if (!error) {
        await gcLoadRoomMembers(roomId);
    }
}

async function gcLoadRoomMembers(roomId = gcCurrentRoom) {
    if (!sbClient) return;

    if (!gcIsGroupRoom(roomId)) {
        gcRoomMembersCache = [];
        gcCurrentUserRoomRole = 'owner';
        return;
    }

    const { data, error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .select('room_id,user_id,role,users(id,username,color,avatar_url)')
        .eq('room_id', roomId);

    if (error) {
        console.error('Load room members error:', error);
        gcRoomMembersCache = [];
        gcCurrentUserRoomRole = 'member';
        return;
    }

    gcRoomMembersCache = data || [];
    const self = gcRoomMembersCache.find(member => member.user_id === gcUserId);
    gcCurrentUserRoomRole = self?.role || 'member';
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
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: GC_TABLES.messages,
            filter: `room_id=eq.${roomId}`
        }, payload => {
            gcHandleDeletedMessage(payload.old);
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
    const liveMessageIds = new Set((messages || []).map(msg => msg?.id).filter(Boolean));
    (messages || []).slice().reverse().forEach(msg => {
        if (!msg?.id || gcKnownMessageIds.has(msg.id)) return;
        gcKnownMessageIds.add(msg.id);
        gcAppendMessage(msgContainer, msg);
        gcCurrentRoomMessages.push(msg);
        appended = true;
    });

    const removedIds = [...gcKnownMessageIds].filter(id => !liveMessageIds.has(id));
    removedIds.forEach(id => gcRemoveMessageFromUi(id));

    if (appended) msgContainer.scrollTop = msgContainer.scrollHeight;
}

function gcUpdateHeader(roomId) {
    const headerName = gcWin?.querySelector('.gc-chat-header-name');
    const headerStatus = gcWin?.querySelector('.gc-chat-header-status');
    const headerIcon = gcWin?.querySelector('.gc-chat-header-icon');
    const deleteBtn = gcWin?.querySelector('.gc-delete-room-btn');
    const pinBtn = gcWin?.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(3)');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(4)');
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
        gcSetAvatarContent(headerIcon, {
            avatarUrl: room.avatar_url || '',
            initials: gcGetInitials(room.name),
            color: '#6c5ce7',
            icon: room.type === 'global' ? 'forum' : 'groups'
        });
        headerIcon.title = room.type === 'group' ? 'Change group avatar' : 'Community room';
    }
    if (deleteBtn) deleteBtn.style.display = room.type === 'group' && gcCanDeleteGroup(roomId) ? 'grid' : 'none';
    if (pinBtn) pinBtn.classList.toggle('active', gcIsRoomPinned(roomId));
    if (membersBtn) membersBtn.classList.toggle('active', gcMembersPanelOpen);
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
    const canDeleteMessage = msg.id && !options.pending && (isSent || (gcCanManageGroup(msg.room_id) && gcIsGroupRoom(msg.room_id)));
    const deleteButtonHtml = canDeleteMessage ? `
        <button class="gc-msg-delete" type="button" onclick="gcDeleteMessage('${gcEscape(msg.id)}')" title="Delete message">
            <span class="material-icons-round">delete</span>
        </button>
    ` : '';

    div.innerHTML = `
        <div class="gc-msg-avatar" style="background:${color}">${initials}</div>
        <div class="gc-msg-body">
            <div class="gc-msg-sender" style="color:${color}">${gcEscape(msg.sender_name || 'Unknown')}</div>
            ${contentHtml}
            ${progressHtml}
            <div class="gc-msg-meta">
                <div class="gc-msg-time">${timeText}</div>
                ${deleteButtonHtml}
            </div>
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
    gcCurrentRoomMessages.push(msg);
    gcRefreshMembersPanel();

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
}

function gcHandleDeletedMessage(msg) {
    const messageId = msg?.id;
    if (!messageId) return;
    gcRemoveMessageFromUi(messageId);
}

function gcRemoveMessageFromUi(messageId) {
    if (!messageId) return;

    gcKnownMessageIds.delete(messageId);
    gcCurrentRoomMessages = gcCurrentRoomMessages.filter(msg => msg?.id !== messageId);
    const element = gcWin?.querySelector(`.gc-msg[data-message-id="${messageId}"]`);
    element?.remove();
    gcRefreshMembersPanel();
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
    const metaEl = element.querySelector('.gc-msg-meta');
    if (metaEl && msg.id && (msg.sender_id === gcUserId || element.classList.contains('sent') || gcCanManageGroup(msg.room_id))) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gc-msg-delete';
        deleteBtn.type = 'button';
        deleteBtn.title = 'Delete message';
        deleteBtn.setAttribute('onclick', `gcDeleteMessage('${msg.id}')`);
        deleteBtn.innerHTML = '<span class="material-icons-round">delete</span>';
        metaEl.appendChild(deleteBtn);
    }
}

async function gcDeleteMessage(messageId) {
    if (!sbClient || !messageId) return;

    const message = gcCurrentRoomMessages.find(item => item?.id === messageId);
    if (!message) return;
    const canDelete = message.sender_id === gcUserId || (gcIsGroupRoom(message.room_id) && gcCanManageGroup(message.room_id));
    if (!canDelete) {
        gcNotifyError('You do not have permission to delete this message.');
        return;
    }

    const confirmed = confirm('Delete this message?');
    if (!confirmed) return;

    try {
        const { error } = await sbClient
            .from(GC_TABLES.messages)
            .delete()
            .eq('id', messageId);

        if (error) {
            console.error('Delete message error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.messages));
            return;
        }

        gcRemoveMessageFromUi(messageId);
        if (message.file_url) {
            gcDeleteStorageObjectByUrl(message.file_url).catch(storageError => {
                console.error('Delete message file error:', storageError);
            });
        }
        showNotification('Zashi Messaging', 'Message deleted.');
    } catch (error) {
        console.error('Delete message error:', error);
        gcNotifyError('Could not delete message.');
    }
}

async function gcDeleteStorageObjectByUrl(fileUrl) {
    if (!sbClient || !fileUrl) return;

    try {
        const parsed = new URL(fileUrl);
        const marker = `/storage/v1/object/public/${GC_STORAGE_BUCKET}/`;
        const index = parsed.pathname.indexOf(marker);
        if (index === -1) return;
        const objectPath = decodeURIComponent(parsed.pathname.slice(index + marker.length));
        if (!objectPath) return;
        await sbClient.storage.from(GC_STORAGE_BUCKET).remove([objectPath]);
    } catch (error) {
        console.error('Storage delete parse error:', error);
    }
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
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.messages));
        pendingEl.remove();
        gcPendingMessages.delete(tempId);
        textarea.value = text;
        gcResizeTextarea(textarea);
        return;
    }

    gcPendingMessages.delete(tempId);
    if (data?.id) gcKnownMessageIds.add(data.id);
    gcReplacePendingMessage(pendingEl, data || optimistic);
    gcCurrentRoomMessages.push(data || optimistic);
    gcRefreshMembersPanel();
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
        gcCurrentRoomMessages.push(data || payload);
        gcRefreshMembersPanel();
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
        gcNotifyError(gcFormatStorageError(error));
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
        gcNotifyError('Maximum file size is 5 MB.');
        return;
    }

    if (file.type.startsWith('video/')) {
        gcNotifyError('Video upload trực tiếp chưa hỗ trợ. Hãy dán link Google Drive, YouTube hoặc TikTok để chia sẻ.');
        return;
    }

    const type = file.type.startsWith('image/') ? 'image' : null;
    if (!type) {
        gcNotifyError('Only image files are supported here. For videos, use a Google Drive, YouTube, or TikTok link.');
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

function gcEnsureAvatarInput(win = gcWin) {
    if (!win) return null;

    let input = win.querySelector('#gc-avatar-input');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'gc-avatar-input';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.addEventListener('change', () => gcHandleAvatarFileSelect(input));
        win.querySelector('.gc-input-box')?.prepend(input);
    }
    return input;
}

function gcBindHeaderActions(win) {
    const pinBtn = win.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(3)');
    if (pinBtn) pinBtn.title = 'Pin conversation';

    const membersBtn = win.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(4)');
    if (membersBtn) membersBtn.title = 'Members';
}

function gcBindAvatarActions(win) {
    const userAvatar = win.querySelector('.gc-user-avatar');
    if (userAvatar && !userAvatar.dataset.gcBound) {
        userAvatar.dataset.gcBound = 'true';
        userAvatar.title = 'Change your avatar';
        userAvatar.style.cursor = 'pointer';
        userAvatar.addEventListener('click', () => gcPromptAvatarUpload('user'));
    }

    const headerIcon = win.querySelector('.gc-chat-header-icon');
    if (headerIcon && !headerIcon.dataset.gcBound) {
        headerIcon.dataset.gcBound = 'true';
        headerIcon.style.cursor = 'pointer';
        headerIcon.addEventListener('click', () => {
            const room = gcGetRoomById();
            if (!room || room.type !== 'group') {
                gcNotifyError('Only group chats can have a custom group avatar.');
                return;
            }
            gcPromptAvatarUpload('group');
        });
    }
}

function gcPromptAvatarUpload(mode) {
    const input = gcEnsureAvatarInput();
    if (!input) return;

    gcAvatarUploadMode = mode;
    input.value = '';
    input.click();
}

async function gcHandleAvatarFileSelect(input) {
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        gcNotifyError('Avatar must be an image file.');
        input.value = '';
        return;
    }

    const processedFile = await gcPrepareAvatarFile(file);
    if (!processedFile) {
        input.value = '';
        return;
    }

    if (gcAvatarUploadMode === 'group') {
        await gcUploadGroupAvatar(processedFile);
    } else {
        await gcUploadUserAvatar(processedFile);
    }

    input.value = '';
}

function gcGetFileExtension(file) {
    const ext = (file?.name || '').split('.').pop();
    return ext && ext !== file?.name ? ext.toLowerCase() : 'png';
}

async function gcPrepareAvatarFile(file) {
    if (file.size <= GC_MAX_AVATAR_BYTES) return file;

    try {
        const primary = await gcResizeAvatarImage(file, GC_AVATAR_PRIMARY_SIZE);
        if (primary.size <= GC_MAX_AVATAR_BYTES) return primary;

        const fallback = await gcResizeAvatarImage(file, GC_AVATAR_FALLBACK_SIZE);
        if (fallback.size <= GC_MAX_AVATAR_BYTES) return fallback;

        gcNotifyError('Avatar could not be reduced below 500 KB. Try a simpler image.');
        return null;
    } catch (error) {
        console.error('Avatar resize error:', error);
        gcNotifyError('Could not process avatar image.');
        return null;
    }
}

function gcLoadImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function gcCanvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Canvas conversion failed.'));
                return;
            }
            resolve(blob);
        }, type, quality);
    });
}

async function gcResizeAvatarImage(file, targetSize) {
    const image = await gcLoadImageFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');

    const squareSize = Math.min(image.width, image.height);
    const sourceX = Math.floor((image.width - squareSize) / 2);
    const sourceY = Math.floor((image.height - squareSize) / 2);

    context.clearRect(0, 0, targetSize, targetSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sourceX, sourceY, squareSize, squareSize, 0, 0, targetSize, targetSize);

    const formats = [
        { type: 'image/webp', qualities: [0.9, 0.82, 0.72] },
        { type: 'image/jpeg', qualities: [0.9, 0.82, 0.72] }
    ];

    let bestBlob = null;
    let bestType = 'image/jpeg';

    for (const format of formats) {
        for (const quality of format.qualities) {
            const blob = await gcCanvasToBlob(canvas, format.type, quality);
            if (!bestBlob || blob.size < bestBlob.size) {
                bestBlob = blob;
                bestType = format.type;
            }
            if (blob.size <= GC_MAX_AVATAR_BYTES) {
                return new File([blob], `avatar-${targetSize}.${format.type === 'image/webp' ? 'webp' : 'jpg'}`, {
                    type: format.type,
                    lastModified: Date.now()
                });
            }
        }
    }

    if (!bestBlob) throw new Error('No avatar blob generated.');

    return new File([bestBlob], `avatar-${targetSize}.${bestType === 'image/webp' ? 'webp' : 'jpg'}`, {
        type: bestType,
        lastModified: Date.now()
    });
}

async function gcUploadUserAvatar(file) {
    if (!sbClient || !gcUserId) return;

    const filePath = `avatars/users/${gcUserId}-${Date.now()}.${gcGetFileExtension(file)}`;

    try {
        await gcUploadFileWithProgress(file, filePath);
        const { data: urlData } = sbClient.storage.from(GC_STORAGE_BUCKET).getPublicUrl(filePath);
        const avatarUrl = urlData?.publicUrl || '';

        const { error } = await sbClient
            .from(GC_TABLES.users)
            .update({ avatar_url: avatarUrl })
            .eq('id', gcUserId);

        if (error) {
            console.error('User avatar update error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        gcUserAvatarUrl = avatarUrl;
        localStorage.setItem('webos-gc-avatar', avatarUrl);
        gcRenderUserIdentity();
        gcRefreshMembersPanel();
        showNotification('Zashi Messaging', 'User avatar updated.');
    } catch (error) {
        console.error('User avatar upload error:', error);
        gcNotifyError(gcFormatStorageError(error));
    }
}

async function gcUploadGroupAvatar(file) {
    if (!sbClient) return;

    const room = gcGetRoomById();
    if (!room || room.type !== 'group') return;
    if (!gcCanManageGroup(room.id)) {
        gcNotifyError('Only the group leader or deputy can change the group avatar.');
        return;
    }

    const filePath = `avatars/rooms/${room.id}-${Date.now()}.${gcGetFileExtension(file)}`;

    try {
        await gcUploadFileWithProgress(file, filePath);
        const { data: urlData } = sbClient.storage.from(GC_STORAGE_BUCKET).getPublicUrl(filePath);
        const avatarUrl = urlData?.publicUrl || '';

        const { data, error } = await sbClient
            .from(GC_TABLES.rooms)
            .update({ avatar_url: avatarUrl })
            .eq('id', room.id)
            .select()
            .single();

        if (error) {
            console.error('Group avatar update error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.rooms));
            return;
        }

        gcRoomCache = gcRoomCache.map(item => item.id === room.id ? { ...item, ...(data || {}), avatar_url: avatarUrl } : item);
        gcRenderRoomList(gcWin, gcRoomCache);
        gcUpdateHeader(room.id);
        showNotification('Zashi Messaging', 'Group avatar updated.');
    } catch (error) {
        console.error('Group avatar upload error:', error);
        gcNotifyError(gcFormatStorageError(error));
    }
}

function gcTogglePinRoom() {
    const roomId = gcCurrentRoom;
    if (!roomId) return;

    if (gcPinnedRoomIds.has(roomId)) {
        gcPinnedRoomIds.delete(roomId);
        showNotification('Zashi Messaging', 'Conversation unpinned.');
    } else {
        gcPinnedRoomIds.add(roomId);
        showNotification('Zashi Messaging', 'Conversation pinned.');
    }

    gcSavePinnedRooms();
    gcRoomCache = gcSortRooms(gcRoomCache);
    gcRenderRoomList(gcWin, gcRoomCache);
    gcUpdateHeader(roomId);
}

async function gcRefreshMembersPanel() {
    const list = gcWin?.querySelector('.gc-members-list');
    if (!list) return;

    await gcEnsureRoomMembership();
    await gcLoadRoomMembers();

    if (gcIsGroupRoom()) {
        const memberList = gcRoomMembersCache.map(member => {
            const user = member.users || {};
            return {
                id: member.user_id,
                name: user.username || 'Unknown',
                color: user.color || '#6c5ce7',
                avatar_url: user.avatar_url || '',
                role: member.role || 'member'
            };
        });

        list.innerHTML = memberList.map(member => {
            const canPromote = gcCanAppointDeputy() && member.id !== gcUserId && member.role === 'member';
            const canDemote = gcCanAppointDeputy() && member.id !== gcUserId && member.role === 'deputy';
            const canRemove = gcCanManageGroup() && member.id !== gcUserId && member.role !== 'owner';
            return `
                <div class="gc-member-item">
                    <div class="gc-member-avatar${member.avatar_url ? ' has-image' : ''}" style="${member.avatar_url ? '' : `background:${member.color};`}">
                        ${member.avatar_url
                            ? `<img src="${gcEscape(member.avatar_url)}" alt="${gcEscape(member.name)}">`
                            : gcEscape(gcGetInitials(member.name))}
                    </div>
                    <div class="gc-member-main">
                        <div class="gc-member-name-row">
                            <div class="gc-member-name">${gcEscape(member.name)}</div>
                            <div class="gc-member-role ${member.role}">${gcGetRoleLabel(member.role)}</div>
                        </div>
                        <div class="gc-member-actions">
                            ${canPromote ? `<button class="gc-member-action" onclick="gcAssignDeputy('${member.id}')">Promote deputy</button>` : ''}
                            ${canDemote ? `<button class="gc-member-action" onclick="gcDemoteDeputy('${member.id}')">Remove deputy</button>` : ''}
                            ${canRemove ? `<button class="gc-member-action danger" onclick="gcRemoveMember('${member.id}')">Remove</button>` : ''}
                        </div>
                    </div>
                    <div class="gc-member-online"></div>
                </div>
            `;
        }).join('');
        return;
    }

    const members = new Map();
    members.set(gcUserId || 'self', {
        id: gcUserId,
        name: gcUserName,
        color: gcUserColor,
        avatar_url: gcUserAvatarUrl
    });

    [...gcCurrentRoomMessages].reverse().forEach(msg => {
        const key = msg.sender_id || `${msg.sender_name}-${msg.sender_color}`;
        if (members.has(key)) return;
        members.set(key, {
            id: msg.sender_id || null,
            name: msg.sender_name || 'Unknown',
            color: msg.sender_color || '#6c5ce7',
            avatar_url: ''
        });
    });

    const memberList = [...members.values()];
    const userIds = memberList.map(member => member.id).filter(Boolean);

    if (sbClient && userIds.length > 0) {
        try {
            const { data } = await sbClient
                .from(GC_TABLES.users)
                .select('id, avatar_url')
                .in('id', userIds);

            (data || []).forEach(user => {
                const member = memberList.find(item => item.id === user.id);
                if (member) member.avatar_url = user.avatar_url || member.avatar_url;
            });
        } catch (error) {
            console.error('Members avatar lookup error:', error);
        }
    }

    list.innerHTML = memberList.map(member => `
        <div class="gc-member-item">
            <div class="gc-member-avatar${member.avatar_url ? ' has-image' : ''}" style="${member.avatar_url ? '' : `background:${member.color};`}">
                ${member.avatar_url
                    ? `<img src="${gcEscape(member.avatar_url)}" alt="${gcEscape(member.name)}">`
                    : gcEscape(gcGetInitials(member.name))}
            </div>
            <div class="gc-member-name">${gcEscape(member.name)}</div>
            <div class="gc-member-online"></div>
        </div>
    `).join('');
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

    const searchBtn = win.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(2)');
    if (searchBtn) searchBtn.title = 'Search in chat';

    const pinBtn = win.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(3)');
    if (pinBtn) pinBtn.title = 'Pin conversation';

    const membersBtn = win.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(4)');
    if (membersBtn) membersBtn.title = 'Members';

    const toolButtons = win.querySelectorAll('.gc-composer-tools .gc-tool-btn');
    if (toolButtons[0]) toolButtons[0].title = 'Image';
    if (toolButtons[1]) toolButtons[1].title = 'Sticker';
    if (toolButtons[2]) toolButtons[2].title = 'Image upload';

    const uploadBtn = win.querySelector('.gc-input-box .gc-header-btn');
    if (uploadBtn) uploadBtn.title = 'Upload image';
}

async function gcAssignDeputy(userId) {
    if (!sbClient || !gcCanAppointDeputy() || !userId) return;
    await gcUpdateMemberRole(userId, 'deputy', 'Deputy assigned.');
}

async function gcDemoteDeputy(userId) {
    if (!sbClient || !gcCanAppointDeputy() || !userId) return;
    await gcUpdateMemberRole(userId, 'member', 'Deputy role removed.');
}

async function gcUpdateMemberRole(userId, role, successMessage) {
    const room = gcGetRoomById();
    if (!room || room.type !== 'group') return;

    const { error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .update({ role })
        .eq('room_id', room.id)
        .eq('user_id', userId);

    if (error) {
        console.error('Update member role error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.roomMembers));
        return;
    }

    await gcLoadRoomMembers(room.id);
    await gcRefreshMembersPanel();
    gcUpdateHeader(room.id);
    showNotification('Zashi Messaging', successMessage);
}

async function gcRemoveMember(userId) {
    if (!sbClient || !gcCanManageGroup() || !userId) return;
    const room = gcGetRoomById();
    const member = gcRoomMembersCache.find(item => item.user_id === userId);
    if (!room || !member || member.role === 'owner') return;

    const confirmed = confirm(`Remove "${member.users?.username || 'this member'}" from the group?`);
    if (!confirmed) return;

    const { error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', userId);

    if (error) {
        console.error('Remove member error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.roomMembers));
        return;
    }

    await gcLoadRoomMembers(room.id);
    await gcRefreshMembersPanel();
    showNotification('Zashi Messaging', 'Member removed from the group.');
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
        localStorage.removeItem('webos-gc-avatar');
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
    const nameKey = gcBuildNameKey(name);

    if (!name || !nameKey) {
        gcNotifyError('Enter a group name.');
        input?.focus();
        return;
    }

    if (nameKey.length < 3) {
        gcNotifyError('Group name must be at least 3 characters.');
        input?.focus();
        return;
    }

    const duplicate = gcRoomCache.some(room =>
        room.type !== 'global' && gcBuildNameKey(room.name) === nameKey
    );
    if (duplicate) {
        gcNotifyError('A group with this name already exists.');
        input?.focus();
        input?.select();
        return;
    }

    const payload = {
        id: gcBuildRoomId(name),
        name,
        name_key: nameKey,
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
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.rooms));
            return;
        }

        if (data) {
            await sbClient
                .from(GC_TABLES.roomMembers)
                .upsert([{
                    room_id: data.id,
                    user_id: gcUserId,
                    role: 'owner'
                }], { onConflict: 'room_id,user_id' });
            gcRoomCache = gcRoomCache.filter(room => room.id !== data.id);
            gcRoomCache.push(data);
            gcRoomCache = gcSortRooms(gcRoomCache);
            gcRenderRoomList(gcWin, gcRoomCache);
            gcHideModal();
            gcSwitchRoom(data.id);
            showNotification('Zashi Messaging', `Created group "${data.name}".`);
        }
    } catch (error) {
        console.error('Create group error:', error);
        gcNotifyError('Could not create the group.');
    } finally {
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create';
        }
    }
}

async function gcDeleteCurrentRoom() {
    const room = gcGetRoomById();
    if (!sbClient || !room || room.type !== 'group') return;
    if (!gcCanDeleteGroup(room.id)) {
        gcNotifyError('Only the group leader can delete this group.');
        return;
    }

    const confirmed = confirm(`Delete group "${room.name}"? This will remove its messages too.`);
    if (!confirmed) return;

    const { error } = await sbClient
        .from(GC_TABLES.rooms)
        .delete()
        .eq('id', room.id);

    if (error) {
        console.error('Delete room error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.rooms));
        return;
    }

    gcPinnedRoomIds.delete(room.id);
    gcSavePinnedRooms();
    gcRoomCache = gcRoomCache.filter(item => item.id !== room.id);
    gcRoomCache = gcSortRooms(gcRoomCache);
    gcRenderRoomList(gcWin, gcRoomCache);
    gcHideMembersPanel();
    gcSwitchRoom('global');
    showNotification('Zashi Messaging', `Deleted group "${room.name}".`);
}

function gcHideMembersPanel() {
    const panel = gcWin?.querySelector('.gc-members-panel');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(4)');
    gcMembersPanelOpen = false;
    panel?.classList.remove('show');
    membersBtn?.classList.remove('active');
}

async function gcToggleMembers() {
    const panel = gcWin?.querySelector('.gc-members-panel');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-header-btn:nth-of-type(4)');
    if (!panel) return;

    gcMembersPanelOpen = !gcMembersPanelOpen;
    panel.classList.toggle('show', gcMembersPanelOpen);
    membersBtn?.classList.toggle('active', gcMembersPanelOpen);

    if (gcMembersPanelOpen) {
        await gcRefreshMembersPanel();
    }
}
