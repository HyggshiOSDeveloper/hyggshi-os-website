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
let gcUserCoverUrl = '';
let gcUserBio = '';
let gcCurrentRoom = 'global';
let gcWin = null;
let gcSubscription = null;
let gcRoomsSubscription = null;
let gcSetupErrorShown = false;
let gcRoomCache = [];
let gcRoomMembersCache = [];
let gcUserProfileCache = new Map();
let gcCurrentRoomMessages = [];
let gcKnownMessageIds = new Set();
let gcPendingMessages = new Map();
let gcPendingAttachment = null;
let gcReplyDraft = null;
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
const GC_MAX_COVER_BYTES = 1024 * 1024;
const GC_COVER_PRIMARY = { width: 960, height: 320 };
const GC_COVER_FALLBACK = { width: 640, height: 240 };
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
        gcDebugError('Invalid Supabase URL:', error);
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
        gcDebugError('Supabase init error:', error);
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
    const userCoverUrl = localStorage.getItem('webos-gc-cover') || '';
    const userBio = localStorage.getItem('webos-gc-bio') || '';

    if (!userName || !userId) {
        gcShowSetup(win);
        return;
    }

    gcUserId = userId;
    gcUserName = userName;
    gcUserColor = localStorage.getItem('webos-gc-color') || GC_COLORS[0];
    gcUserAvatarUrl = userAvatarUrl;
    gcUserCoverUrl = userCoverUrl;
    gcUserBio = userBio;
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
    const rawMessage = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    if (error.code === '23505' || error.status === 409) {
        if (tableName === GC_TABLES.users) return 'This username is already taken.';
        if (tableName === GC_TABLES.rooms) return 'A group with this name already exists.';
        return 'This item already exists.';
    }
    if (error.status === 404) {
        return 'Chat data is not ready yet. Run supabase-schema.sql first.';
    }
    if (rawMessage.includes('duplicate key') || rawMessage.includes('unique constraint') || rawMessage.includes('already exists')) {
        if (tableName === GC_TABLES.users) return 'This username is already taken.';
        if (tableName === GC_TABLES.rooms) return 'A group with this name already exists.';
        return 'This item already exists.';
    }
    if (rawMessage.includes('row-level security') || rawMessage.includes('permission denied')) {
        return 'You do not have permission to do that.';
    }
    if (rawMessage.includes('violates check constraint') || rawMessage.includes('invalid input')) {
        return 'The information you entered is not valid.';
    }
    if (rawMessage.includes('network') || rawMessage.includes('fetch')) {
        return 'Could not connect to the chat server.';
    }
    if (tableName === GC_TABLES.roomMembers) return 'Could not update group members.';
    if (tableName === GC_TABLES.messages) return 'Could not update messages.';
    if (tableName === GC_TABLES.rooms) return 'Could not update the group.';
    if (tableName === GC_TABLES.users) return 'Could not update the account.';
    return 'Database error.';
}

function gcFormatStorageError(error) {
    if (!error) return 'Upload failed.';
    const rawMessage = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (error.status === 404) {
        return 'File storage is not ready yet. Run supabase-schema.sql first.';
    }
    if (rawMessage.includes('too large') || rawMessage.includes('entity too large')) {
        return 'The selected file is too large.';
    }
    if (rawMessage.includes('permission') || rawMessage.includes('row-level security')) {
        return 'You do not have permission to upload this file.';
    }
    return 'Upload failed.';
}

function gcNotifyError(message) {
    showNotification('Zashi Messaging', message, 'error');
}

function gcDebugError() {
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
            gcDebugError('Supabase SQL Error:', error);
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
            gcDebugError('Supabase SQL Error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.password !== password) {
            gcNotifyError('Wrong username or password.');
            return;
        }

        gcSetUserSession(data.username, data.id, data.color, data.avatar_url, data.cover_url, data.bio);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        gcDebugError('Login error:', error);
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

    try {
        const { data: duplicateUser } = await sbClient
            .from(GC_TABLES.users)
            .select('id')
            .eq('username_key', usernameKey)
            .maybeSingle();

        if (duplicateUser) {
            const suggestion = await gcSuggestAvailableUsername(username);
            if (userInp) {
                userInp.value = suggestion;
                userInp.focus();
                userInp.select();
            }
            gcNotifyError(`This username is already taken. Try "${suggestion}".`);
            return;
        }
    } catch (error) {
        gcDebugError('Check duplicate username error:', error);
    }

    const color = GC_COLORS[Math.floor(Math.random() * GC_COLORS.length)];

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .insert([{ username, username_key: usernameKey, password, color }])
            .select();

        if (error) {
            if (error.code === '23505' || error.status === 409) {
                const suggestion = await gcSuggestAvailableUsername(username);
                if (userInp) {
                    userInp.value = suggestion;
                    userInp.focus();
                    userInp.select();
                }
                gcNotifyError(`This username is already taken. Try "${suggestion}".`);
                return;
            }
            gcDebugError('Supabase SQL Error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        const newUser = data?.[0];
        if (!newUser) {
            gcNotifyError('Registration failed.');
            return;
        }

        gcSetUserSession(newUser.username, newUser.id, newUser.color, newUser.avatar_url, newUser.cover_url, newUser.bio);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        gcDebugError('Register error:', error);
        gcNotifyError('System error while creating the account.');
    }
}

function gcSetUserSession(name, id, color, avatarUrl = '', coverUrl = '', bio = '') {
    gcUserName = name;
    gcUserId = id;
    gcUserColor = color;
    gcUserAvatarUrl = avatarUrl || '';
    gcUserCoverUrl = coverUrl || '';
    gcUserBio = bio || '';
    localStorage.setItem('webos-gc-username', name);
    localStorage.setItem('webos-gc-userid', id);
    localStorage.setItem('webos-gc-color', color);
    localStorage.setItem('webos-gc-avatar', gcUserAvatarUrl);
    localStorage.setItem('webos-gc-cover', gcUserCoverUrl);
    localStorage.setItem('webos-gc-bio', gcUserBio);
    gcCacheUserProfile({
        id,
        username: name,
        color,
        avatar_url: gcUserAvatarUrl,
        cover_url: gcUserCoverUrl,
        bio: gcUserBio
    });
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

function gcCacheUserProfile(profile) {
    if (!profile) return;
    if (profile.id) {
        gcUserProfileCache.set(`id:${profile.id}`, profile);
    }
    if (profile.username) {
        gcUserProfileCache.set(`username:${String(profile.username).toLowerCase()}`, profile);
    }
}

function gcGetCachedUserProfile(userId, userName = '') {
    if (userId === gcUserId) {
        return {
            id: gcUserId,
            username: gcUserName,
            color: gcUserColor,
            avatar_url: gcUserAvatarUrl,
            cover_url: gcUserCoverUrl,
            bio: gcUserBio
        };
    }

    if (userId && gcUserProfileCache.has(`id:${userId}`)) {
        return gcUserProfileCache.get(`id:${userId}`);
    }

    const lowered = String(userName || '').toLowerCase();
    if (lowered && gcUserProfileCache.has(`username:${lowered}`)) {
        return gcUserProfileCache.get(`username:${lowered}`);
    }

    const member = gcRoomMembersCache.find(item => item.user_id === userId || String(item.users?.username || '').toLowerCase() === lowered);
    if (member?.users) {
        gcCacheUserProfile(member.users);
        return member.users;
    }

    return null;
}

function gcResolveUserAvatar(userId, userName = '') {
    return gcGetCachedUserProfile(userId, userName)?.avatar_url || '';
}

function gcResolveUserCover(userId, userName = '') {
    return gcGetCachedUserProfile(userId, userName)?.cover_url || '';
}

function gcResolveUserBio(userId, userName = '') {
    return gcGetCachedUserProfile(userId, userName)?.bio || '';
}

async function gcHydrateMessagesWithAvatars(messages = []) {
    if (!sbClient || !Array.isArray(messages) || messages.length === 0) return messages;

    const missingIds = [...new Set(messages.filter(msg => !msg?.sender_avatar_url && msg?.sender_id).map(msg => msg.sender_id))];
    const missingNames = [...new Set(
        messages
            .filter(msg => !msg?.sender_avatar_url && !msg?.sender_id && msg?.sender_name)
            .map(msg => String(msg.sender_name).toLowerCase())
    )];

    if (missingIds.length === 0 && missingNames.length === 0) {
        return messages.map(msg => ({
            ...msg,
            sender_avatar_url: msg.sender_avatar_url || gcResolveUserAvatar(msg.sender_id, msg.sender_name)
        }));
    }

    try {
        let profiles = [];
        if (missingIds.length > 0) {
            const { data } = await sbClient
                .from(GC_TABLES.users)
                .select('id, username, color, avatar_url, cover_url, bio')
                .in('id', missingIds);
            profiles = profiles.concat(data || []);
        }
        if (missingNames.length > 0) {
            const { data } = await sbClient
                .from(GC_TABLES.users)
                .select('id, username, color, avatar_url, cover_url, bio')
                .in('username', missingNames);
            profiles = profiles.concat(data || []);
        }

        profiles.forEach(profile => gcCacheUserProfile(profile));
        return messages.map(msg => ({
            ...msg,
            sender_avatar_url: msg.sender_avatar_url || gcResolveUserAvatar(msg.sender_id, msg.sender_name)
        }));
    } catch (error) {
        gcDebugError('Hydrate message avatars error:', error);
        return messages.map(msg => ({
            ...msg,
            sender_avatar_url: msg.sender_avatar_url || gcResolveUserAvatar(msg.sender_id, msg.sender_name)
        }));
    }
}

function gcBuildNameKey(value) {
    return (value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function gcBuildAutoName(baseName, existingKeys = new Set()) {
    const trimmedBase = (baseName || '').trim().replace(/\s+/g, ' ') || 'name';
    let candidate = trimmedBase;
    let index = 1;

    while (existingKeys.has(gcBuildNameKey(candidate))) {
        candidate = `${trimmedBase}${index}`;
        index += 1;
    }

    return candidate;
}

async function gcSuggestAvailableUsername(baseName) {
    if (!sbClient) return `${(baseName || 'user').trim() || 'user'}1`;

    try {
        const { data } = await sbClient.from(GC_TABLES.users).select('username_key');
        const existingKeys = new Set((data || []).map(item => item.username_key).filter(Boolean));
        return gcBuildAutoName(baseName, existingKeys);
    } catch (error) {
        gcDebugError('Suggest username error:', error);
        return `${(baseName || 'user').trim() || 'user'}1`;
    }
}

function gcSuggestAvailableRoomName(baseName) {
    const existingKeys = new Set(gcRoomCache.map(room => gcBuildNameKey(room.name)).filter(Boolean));
    return gcBuildAutoName(baseName, existingKeys);
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
    gcClearReplyTarget();
    gcRenderUserIdentity(win);

    gcListenRooms(win);
    gcSwitchRoom('global');
}

async function gcListenRooms(win) {
    if (!sbClient) return;

    const { data, error } = await sbClient.from(GC_TABLES.rooms).select('*');
    if (error) {
        gcDebugError('Supabase SQL Error:', error);
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
    gcClearReplyTarget();
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
        gcDebugError('Supabase SQL Error:', error);
        gcNotifySetupIssue(gcFormatSupabaseError(error, GC_TABLES.messages));
        return;
    }
    if (requestId !== gcActiveRoomRequestId || roomId !== gcCurrentRoom) return;

    await gcLoadRoomMembers(roomId);
    gcRenderRoomList(gcWin, gcRoomCache);
    const orderedMessages = await gcHydrateMessagesWithAvatars((messages || []).slice().reverse());
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
        .select('room_id,user_id,role,users(id,username,color,avatar_url,cover_url,bio)')
        .eq('room_id', roomId);

    if (error) {
        gcDebugError('Load room members error:', error);
        gcRoomMembersCache = [];
        gcCurrentUserRoomRole = 'member';
        return;
    }

    gcRoomMembersCache = data || [];
    gcRoomMembersCache.forEach(member => gcCacheUserProfile(member.users));
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
        gcDebugError('Supabase sync error:', error);
        return;
    }

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;

    let appended = false;
    const liveMessageIds = new Set((messages || []).map(msg => msg?.id).filter(Boolean));
    const hydratedMessages = await gcHydrateMessagesWithAvatars(messages || []);
    hydratedMessages.slice().reverse().forEach(msg => {
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

function gcGetMessageById(messageId) {
    if (!messageId) return null;
    return gcCurrentRoomMessages.find(msg => msg?.id === messageId) || null;
}

function gcGetReplyPreviewText(msg) {
    if (!msg) return '';
    if (msg.reply_to_text) return String(msg.reply_to_text).trim();
    if (msg.text) return String(msg.text).trim();
    if (msg.type === 'image') return 'Image';
    if (msg.type === 'video') return 'Video';
    if (msg.file_url) return 'Attachment';
    return 'Message';
}

function gcBuildReplyPayload(sourceMessage) {
    if (!sourceMessage) return null;
    return {
        messageId: sourceMessage.id || '',
        userId: sourceMessage.sender_id || null,
        senderName: sourceMessage.sender_name || 'Unknown',
        text: gcGetReplyPreviewText(sourceMessage).slice(0, 120)
    };
}

function gcClearReplyTarget() {
    gcReplyDraft = null;
    gcWin?.querySelector('.gc-reply-preview')?.remove();
}

function gcRenderReplyComposer() {
    if (!gcWin) return;
    const inputArea = gcWin.querySelector('.gc-input-area');
    if (!inputArea) return;

    inputArea.querySelector('.gc-reply-preview')?.remove();
    if (!gcReplyDraft?.messageId) return;

    const replyingToYou = gcReplyDraft.userId && gcReplyDraft.userId === gcUserId;
    const preview = document.createElement('div');
    preview.className = `gc-reply-preview${replyingToYou ? ' is-you' : ''}`;
    preview.innerHTML = `
        <div class="gc-reply-preview-bar"></div>
        <div class="gc-reply-preview-content">
            <div class="gc-reply-preview-title">
                Replying to ${gcEscape(gcReplyDraft.senderName || 'Unknown')}
                ${replyingToYou ? '<span class="gc-reply-pill">@you</span>' : ''}
            </div>
            <div class="gc-reply-preview-text">${gcEscape(gcReplyDraft.text || 'Message')}</div>
        </div>
        <button class="gc-attachment-remove" type="button" aria-label="Cancel reply">
            <span class="material-icons-round">close</span>
        </button>
    `;

    preview.querySelector('.gc-attachment-remove')?.addEventListener('click', () => gcClearReplyTarget());
    inputArea.insertBefore(preview, inputArea.firstChild);
}

function gcSetReplyTarget(messageId) {
    const sourceMessage = gcGetMessageById(messageId);
    if (!sourceMessage) {
        gcNotifyError('Could not find the message to reply to.');
        return;
    }

    gcReplyDraft = gcBuildReplyPayload(sourceMessage);
    gcRenderReplyComposer();
    const textarea = gcWin?.querySelector('.gc-input-box textarea');
    textarea?.focus();
}

function gcScrollToMessage(messageId) {
    if (!messageId) return;
    const target = gcWin?.querySelector(`.gc-msg[data-message-id="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('gc-msg-flash');
    void target.offsetWidth;
    target.classList.add('gc-msg-flash');
    window.setTimeout(() => target.classList.remove('gc-msg-flash'), 1800);
}

function gcBuildMessageReplyHtml(msg) {
    if (!msg?.reply_to_message_id) return '';
    const replyName = gcEscape(msg.reply_to_sender_name || 'Unknown');
    const replyText = gcEscape(String(msg.reply_to_text || '').trim() || 'Message');
    const replyTag = msg.reply_to_user_id && msg.reply_to_user_id === gcUserId
        ? '<span class="gc-reply-pill">@you</span>'
        : '';
    return `
        <button class="gc-msg-reply-context${msg.reply_to_user_id && msg.reply_to_user_id === gcUserId ? ' is-you' : ''}" type="button" data-reply-message-id="${gcEscape(msg.reply_to_message_id)}" title="Jump to original message">
            <span class="material-icons-round">reply</span>
            <div class="gc-msg-reply-copy">
                <div class="gc-msg-reply-name">${replyName}${replyTag}</div>
                <div class="gc-msg-reply-text">${replyText}</div>
            </div>
        </button>
    `;
}

function gcBuildMessageBodyHtml(msg, options = {}) {
    const initials = (msg.sender_name || '?')[0].toUpperCase();
    const color = msg.sender_color || '#6c5ce7';
    const avatarUrl = msg.sender_avatar_url || gcResolveUserAvatar(msg.sender_id, msg.sender_name);
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
    const canDeleteMessage = msg.id && !options.pending && ((msg.sender_id === gcUserId || options.forceSent) || (gcCanManageGroup(msg.room_id) && gcIsGroupRoom(msg.room_id)));
    const deleteButtonHtml = canDeleteMessage ? `
        <button class="gc-msg-action gc-msg-delete" type="button" data-action="delete" title="Delete message">
            <span class="material-icons-round">delete</span>
        </button>
    ` : '';
    const replyButtonHtml = !options.pending && msg.id ? `
        <button class="gc-msg-action gc-msg-reply" type="button" data-action="reply" title="Reply to message">
            <span class="material-icons-round">reply</span>
        </button>
    ` : '';

    return `
        <div class="gc-msg-avatar${avatarUrl ? ' has-image' : ''}" style="${avatarUrl ? '' : `background:${color}`}" title="View profile">${avatarUrl ? `<img src="${gcEscape(avatarUrl)}" alt="${gcEscape(msg.sender_name || 'User')}">` : initials}</div>
        <div class="gc-msg-body">
            <div class="gc-msg-sender" style="color:${color}">${gcEscape(msg.sender_name || 'Unknown')}</div>
            ${gcBuildMessageReplyHtml(msg)}
            ${contentHtml}
            ${progressHtml}
            <div class="gc-msg-meta">
                <div class="gc-msg-time">${timeText}</div>
                ${replyButtonHtml}
                ${deleteButtonHtml}
            </div>
        </div>
    `;
}

function gcBindMessageInteractions(element, msg, options = {}) {
    if (!element) return;
    const avatarUrl = msg.sender_avatar_url || gcResolveUserAvatar(msg.sender_id, msg.sender_name);
    const avatarEl = element.querySelector('.gc-msg-avatar');
    if (avatarEl) {
        avatarEl.style.cursor = 'pointer';
        avatarEl.onclick = () => {
            gcShowUserProfile(msg.sender_id || '', msg.sender_name || '', msg.sender_color || '', avatarUrl || '');
        };
    }

    const replyAction = element.querySelector('.gc-msg-reply');
    if (replyAction) {
        replyAction.onclick = () => gcSetReplyTarget(msg.id);
    }

    const deleteAction = element.querySelector('.gc-msg-delete');
    if (deleteAction) {
        deleteAction.onclick = () => gcDeleteMessage(msg.id);
    }

    const replyContext = element.querySelector('.gc-msg-reply-context');
    if (replyContext) {
        replyContext.onclick = () => gcScrollToMessage(msg.reply_to_message_id);
    }
}

function gcAppendMessage(container, msg, options = {}) {
    const isSent = msg.sender_id === gcUserId || options.forceSent;
    const div = document.createElement('div');
    const isReplyHit = msg.reply_to_user_id && msg.reply_to_user_id === gcUserId && msg.sender_id !== gcUserId;
    div.className = `gc-msg${isSent ? ' sent' : ''}${options.pending ? ' pending' : ''}${isReplyHit ? ' reply-hit' : ''}`;
    if (options.tempId) div.dataset.tempId = options.tempId;
    if (msg.id) div.dataset.messageId = msg.id;
    div.innerHTML = gcBuildMessageBodyHtml(msg, options);

    container.appendChild(div);
    gcBindMessageInteractions(div, msg, options);
    return div;
}

function gcHandleIncomingMessage(msg) {
    if (!msg || msg.room_id !== gcCurrentRoom) return;
    if (msg.id && gcKnownMessageIds.has(msg.id)) return;
    if (!msg.sender_avatar_url) {
        msg.sender_avatar_url = gcResolveUserAvatar(msg.sender_id, msg.sender_name);
    }

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
    if (gcReplyDraft?.messageId === messageId) {
        gcClearReplyTarget();
    }
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
    element.classList.remove('pending');
    element.classList.toggle('sent', msg.sender_id === gcUserId);
    element.classList.toggle('reply-hit', !!(msg.reply_to_user_id && msg.reply_to_user_id === gcUserId && msg.sender_id !== gcUserId));
    element.dataset.messageId = msg.id;
    element.innerHTML = gcBuildMessageBodyHtml(msg, {});
    gcBindMessageInteractions(element, msg, {});
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
            gcDebugError('Delete message error:', error);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.messages));
            return;
        }

        gcRemoveMessageFromUi(messageId);
        if (message.file_url) {
            gcDeleteStorageObjectByUrl(message.file_url).catch(storageError => {
                gcDebugError('Delete message file error:', storageError);
            });
        }
        showNotification('Zashi Messaging', 'Message deleted.');
    } catch (error) {
        gcDebugError('Delete message error:', error);
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
        gcDebugError('Storage delete parse error:', error);
    }
}

async function gcDeleteStorageObjectQuietly(fileUrl) {
    if (!fileUrl) return;
    try {
        await gcDeleteStorageObjectByUrl(fileUrl);
    } catch (error) {
        gcDebugError('Storage cleanup error:', error);
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

    const replyPayload = gcReplyDraft ? {
        reply_to_message_id: gcReplyDraft.messageId || null,
        reply_to_user_id: gcReplyDraft.userId || null,
        reply_to_sender_name: gcReplyDraft.senderName || null,
        reply_to_text: gcReplyDraft.text || null
    } : {};
    textarea.value = '';
    gcResizeTextarea(textarea);

    const optimistic = {
        room_id: gcCurrentRoom,
        text,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        sender_avatar_url: gcUserAvatarUrl,
        type: 'text',
        created_at: new Date().toISOString(),
        ...replyPayload
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
        gcDebugError('Supabase SQL Error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.messages));
        pendingEl.remove();
        gcPendingMessages.delete(tempId);
        textarea.value = text;
        gcResizeTextarea(textarea);
        return;
    }

    gcClearReplyTarget();
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
    const replyPayload = gcReplyDraft ? {
        reply_to_message_id: gcReplyDraft.messageId || null,
        reply_to_user_id: gcReplyDraft.userId || null,
        reply_to_sender_name: gcReplyDraft.senderName || null,
        reply_to_text: gcReplyDraft.text || null
    } : {};

    const optimistic = {
        room_id: gcCurrentRoom,
        file_url: previewUrl,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        sender_avatar_url: gcUserAvatarUrl,
        type,
        created_at: new Date().toISOString(),
        ...replyPayload
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
            sender_avatar_url: gcUserAvatarUrl,
            type,
            ...replyPayload
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
        gcClearReplyTarget();
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
        gcDebugError('Attachment send error:', error);
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
    if (!overlay || !modal) return;

    if (!overlay.dataset.gcBound) {
        overlay.dataset.gcBound = 'true';

        overlay.addEventListener('click', event => {
            if (event.target === overlay) gcHideModal();
        });

        modal.addEventListener('click', event => {
            event.stopPropagation();
        });
    }

    if (!input || input.dataset.gcBound) return;
    input.dataset.gcBound = 'true';
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

    const processedFile = gcAvatarUploadMode === 'cover'
        ? await gcPrepareCoverFile(file)
        : await gcPrepareAvatarFile(file);
    if (!processedFile) {
        input.value = '';
        return;
    }

    if (gcAvatarUploadMode === 'cover') {
        await gcUploadUserCover(processedFile);
    } else if (gcAvatarUploadMode === 'group') {
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
        gcDebugError('Avatar resize error:', error);
        gcNotifyError('Could not process avatar image.');
        return null;
    }
}

async function gcPrepareCoverFile(file) {
    if (file.size <= GC_MAX_COVER_BYTES) return file;

    try {
        const primary = await gcResizeCoverImage(file, GC_COVER_PRIMARY.width, GC_COVER_PRIMARY.height);
        if (primary.size <= GC_MAX_COVER_BYTES) return primary;

        const fallback = await gcResizeCoverImage(file, GC_COVER_FALLBACK.width, GC_COVER_FALLBACK.height);
        if (fallback.size <= GC_MAX_COVER_BYTES) return fallback;

        gcNotifyError('Cover image could not be reduced below 1 MB. Try a simpler image.');
        return null;
    } catch (error) {
        gcDebugError('Cover resize error:', error);
        gcNotifyError('Could not process cover image.');
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

async function gcResizeCoverImage(file, targetWidth, targetHeight) {
    const image = await gcLoadImageFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');

    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = image.width / image.height;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > targetRatio) {
        sourceWidth = Math.floor(image.height * targetRatio);
        sourceX = Math.floor((image.width - sourceWidth) / 2);
    } else {
        sourceHeight = Math.floor(image.width / targetRatio);
        sourceY = Math.floor((image.height - sourceHeight) / 2);
    }

    context.clearRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

    const formats = [
        { type: 'image/webp', qualities: [0.86, 0.76, 0.66] },
        { type: 'image/jpeg', qualities: [0.86, 0.76, 0.66] }
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
            if (blob.size <= GC_MAX_COVER_BYTES) {
                return new File([blob], `cover-${targetWidth}x${targetHeight}.${format.type === 'image/webp' ? 'webp' : 'jpg'}`, {
                    type: format.type,
                    lastModified: Date.now()
                });
            }
        }
    }

    if (!bestBlob) throw new Error('No cover blob generated.');

    return new File([bestBlob], `cover-${targetWidth}x${targetHeight}.${bestType === 'image/webp' ? 'webp' : 'jpg'}`, {
        type: bestType,
        lastModified: Date.now()
    });
}

async function gcUploadUserAvatar(file) {
    if (!sbClient || !gcUserId) return;

    const previousAvatarUrl = gcUserAvatarUrl || '';
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
            gcDebugError('User avatar update error:', error);
            await gcDeleteStorageObjectQuietly(avatarUrl);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        gcUserAvatarUrl = avatarUrl;
        localStorage.setItem('webos-gc-avatar', avatarUrl);
        gcCacheUserProfile({
            id: gcUserId,
            username: gcUserName,
            color: gcUserColor,
            avatar_url: gcUserAvatarUrl,
            cover_url: gcUserCoverUrl,
            bio: gcUserBio
        });
        gcRenderUserIdentity();
        gcRefreshMembersPanel();
        if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
            gcDeleteStorageObjectQuietly(previousAvatarUrl);
        }
        showNotification('Zashi Messaging', 'User avatar updated.');
    } catch (error) {
        gcDebugError('User avatar upload error:', error);
        gcNotifyError(gcFormatStorageError(error));
    }
}

async function gcUploadUserCover(file) {
    if (!sbClient || !gcUserId) return;

    const previousCoverUrl = gcUserCoverUrl || '';
    const filePath = `covers/users/${gcUserId}-${Date.now()}.${gcGetFileExtension(file)}`;

    try {
        await gcUploadFileWithProgress(file, filePath);
        const { data: urlData } = sbClient.storage.from(GC_STORAGE_BUCKET).getPublicUrl(filePath);
        const coverUrl = urlData?.publicUrl || '';

        const { error } = await sbClient
            .from(GC_TABLES.users)
            .update({ cover_url: coverUrl })
            .eq('id', gcUserId);

        if (error) {
            gcDebugError('User cover update error:', error);
            await gcDeleteStorageObjectQuietly(coverUrl);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        gcUserCoverUrl = coverUrl;
        localStorage.setItem('webos-gc-cover', coverUrl);
        gcCacheUserProfile({
            id: gcUserId,
            username: gcUserName,
            color: gcUserColor,
            avatar_url: gcUserAvatarUrl,
            cover_url: gcUserCoverUrl,
            bio: gcUserBio
        });
        gcShowSettings();
        if (previousCoverUrl && previousCoverUrl !== coverUrl) {
            gcDeleteStorageObjectQuietly(previousCoverUrl);
        }
        showNotification('Zashi Messaging', 'Profile cover updated.');
    } catch (error) {
        gcDebugError('User cover upload error:', error);
        gcNotifyError(gcFormatStorageError(error));
    }
}

async function gcRemoveUserAvatar() {
    if (!sbClient || !gcUserId || !gcUserAvatarUrl) return;
    const confirmed = confirm('Remove your avatar?');
    if (!confirmed) return;

    const previousAvatarUrl = gcUserAvatarUrl;
    const { error } = await sbClient
        .from(GC_TABLES.users)
        .update({ avatar_url: null })
        .eq('id', gcUserId);

    if (error) {
        gcDebugError('Remove avatar error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
        return;
    }

    gcUserAvatarUrl = '';
    localStorage.setItem('webos-gc-avatar', '');
    gcCacheUserProfile({
        id: gcUserId,
        username: gcUserName,
        color: gcUserColor,
        avatar_url: '',
        cover_url: gcUserCoverUrl,
        bio: gcUserBio
    });
    gcRenderUserIdentity();
    gcRefreshMembersPanel();
    gcShowSettings();
    gcDeleteStorageObjectQuietly(previousAvatarUrl);
    showNotification('Zashi Messaging', 'User avatar removed.');
}

async function gcRemoveUserCover() {
    if (!sbClient || !gcUserId || !gcUserCoverUrl) return;
    const confirmed = confirm('Remove your profile cover?');
    if (!confirmed) return;

    const previousCoverUrl = gcUserCoverUrl;
    const { error } = await sbClient
        .from(GC_TABLES.users)
        .update({ cover_url: null })
        .eq('id', gcUserId);

    if (error) {
        gcDebugError('Remove cover error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
        return;
    }

    gcUserCoverUrl = '';
    localStorage.setItem('webos-gc-cover', '');
    gcCacheUserProfile({
        id: gcUserId,
        username: gcUserName,
        color: gcUserColor,
        avatar_url: gcUserAvatarUrl,
        cover_url: '',
        bio: gcUserBio
    });
    gcShowSettings();
    gcDeleteStorageObjectQuietly(previousCoverUrl);
    showNotification('Zashi Messaging', 'Profile cover removed.');
}

async function gcSaveProfileBio() {
    if (!sbClient || !gcUserId || !gcWin) return;
    const textarea = gcWin.querySelector('.gc-settings-bio-input');
    if (!textarea) return;

    const bio = textarea.value.trim().slice(0, 160);
    const { error } = await sbClient
        .from(GC_TABLES.users)
        .update({ bio })
        .eq('id', gcUserId);

    if (error) {
        gcDebugError('Save bio error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
        return;
    }

    gcUserBio = bio;
    localStorage.setItem('webos-gc-bio', bio);
    gcShowSettings();
    showNotification('Zashi Messaging', 'Profile bio updated.');
}

async function gcShowUserProfile(userId, fallbackName = '', fallbackColor = '#6c5ce7', fallbackAvatar = '') {
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const modal = gcWin?.querySelector('.gc-modal');
    if (!overlay || !modal) return;

    let profile = {
        id: userId,
        username: fallbackName || 'Unknown',
        color: fallbackColor || '#6c5ce7',
        avatar_url: fallbackAvatar || gcResolveUserAvatar(userId),
        cover_url: gcResolveUserCover(userId),
        bio: gcResolveUserBio(userId)
    };

    if (sbClient && userId) {
        try {
            const { data } = await sbClient
                .from(GC_TABLES.users)
                .select('id, username, color, avatar_url, cover_url, bio')
                .eq('id', userId)
                .maybeSingle();
            if (data) profile = { ...profile, ...data };
        } catch (error) {
            gcDebugError('Load profile info error:', error);
        }
    }

    const roleMember = gcRoomMembersCache.find(item => item.user_id === userId);
    const roleText = roleMember ? gcGetRoleLabel(roleMember.role) : 'Member';

    modal.classList.add('gc-settings-modal', 'gc-profile-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Profile</div>
                    <h3>${gcEscape(profile.username || 'Unknown')}</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close profile">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-profile-preview">
                <div class="gc-settings-cover gc-profile-cover" style="${profile.cover_url ? `background-image:url('${gcEscape(profile.cover_url)}')` : ''}">
                    <div class="gc-settings-profile-row">
                        <div class="gc-settings-avatar${profile.avatar_url ? ' has-image' : ''}">
                            ${profile.avatar_url ? `<img src="${gcEscape(profile.avatar_url)}" alt="${gcEscape(profile.username || 'User')}">` : gcEscape(gcGetInitials(profile.username))}
                        </div>
                        <div class="gc-settings-profile-meta">
                            <div class="gc-settings-name">${gcEscape(profile.username || 'Unknown')}</div>
                            <div class="gc-settings-subtitle">${gcEscape(roleText)}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Bio</div>
                <div class="gc-profile-bio-row">
                    <div class="gc-profile-bio-icon" aria-hidden="true">
                        <span class="material-icons-round">edit_note</span>
                    </div>
                    <div class="gc-profile-bio-block">
                        <div class="gc-profile-bio-label">About</div>
                        <div class="gc-profile-bio">${gcEscape(profile.bio || 'No profile description yet.')}</div>
                    </div>
                </div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Close</button>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
}

async function gcUploadGroupAvatar(file) {
    if (!sbClient) return;

    const room = gcGetRoomById();
    if (!room || room.type !== 'group') return;
    if (!gcCanManageGroup(room.id)) {
        gcNotifyError('Only the group leader or deputy can change the group avatar.');
        return;
    }

    const previousAvatarUrl = room.avatar_url || '';
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
            gcDebugError('Group avatar update error:', error);
            await gcDeleteStorageObjectQuietly(avatarUrl);
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.rooms));
            return;
        }

        gcRoomCache = gcRoomCache.map(item => item.id === room.id ? { ...item, ...(data || {}), avatar_url: avatarUrl } : item);
        gcRenderRoomList(gcWin, gcRoomCache);
        gcUpdateHeader(room.id);
        if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
            gcDeleteStorageObjectQuietly(previousAvatarUrl);
        }
        showNotification('Zashi Messaging', 'Group avatar updated.');
    } catch (error) {
        gcDebugError('Group avatar upload error:', error);
        gcNotifyError(gcFormatStorageError(error));
    }
}

async function gcRemoveGroupAvatar() {
    if (!sbClient) return;

    const room = gcGetRoomById();
    if (!room || room.type !== 'group' || !room.avatar_url) return;
    if (!gcCanManageGroup(room.id)) {
        gcNotifyError('Only the group leader or deputy can remove the group avatar.');
        return;
    }

    const confirmed = confirm(`Remove the avatar for "${room.name}"?`);
    if (!confirmed) return;

    const previousAvatarUrl = room.avatar_url;
    const { data, error } = await sbClient
        .from(GC_TABLES.rooms)
        .update({ avatar_url: null })
        .eq('id', room.id)
        .select()
        .single();

    if (error) {
        gcDebugError('Remove group avatar error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.rooms));
        return;
    }

    gcRoomCache = gcRoomCache.map(item => item.id === room.id ? { ...item, ...(data || {}), avatar_url: '' } : item);
    gcRenderRoomList(gcWin, gcRoomCache);
    gcUpdateHeader(room.id);
    gcShowSettings();
    gcDeleteStorageObjectQuietly(previousAvatarUrl);
    showNotification('Zashi Messaging', 'Group avatar removed.');
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
            gcDebugError('Members avatar lookup error:', error);
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
        gcDebugError('Update member role error:', error);
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
        gcDebugError('Remove member error:', error);
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
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const modal = gcWin?.querySelector('.gc-modal');
    if (!overlay || !modal) return;

    const room = gcGetRoomById();
    const roleText = gcIsGroupRoom() ? gcGetRoleLabel(gcCurrentUserRoomRole) : 'Community';
    const roomText = room?.name || 'Zashi Messaging';

    modal.classList.add('gc-settings-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Account</div>
                    <h3>Zashi Messaging Settings</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close settings">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-settings-profile">
                <div class="gc-settings-cover" onclick="gcPromptAvatarUpload('cover')" title="Change profile cover" style="${gcUserCoverUrl ? `background-image:url('${gcEscape(gcUserCoverUrl)}')` : ''}">
                    <div class="gc-settings-cover-badge">
                        <span class="material-icons-round">photo</span>
                        Cover max 1 MB
                    </div>
                    <div class="gc-settings-profile-row">
                        <div class="gc-settings-avatar${gcUserAvatarUrl ? ' has-image' : ''}" onclick="event.stopPropagation(); gcPromptAvatarUpload('user')" title="Change your avatar">
                            ${gcUserAvatarUrl ? `<img src="${gcEscape(gcUserAvatarUrl)}" alt="${gcEscape(gcUserName)}">` : gcEscape(gcGetInitials(gcUserName))}
                        </div>
                        <div class="gc-settings-profile-meta">
                            <div class="gc-settings-name">${gcEscape(gcUserName)}</div>
                            <div class="gc-settings-subtitle">Active now</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="gc-settings-grid">
                <button class="gc-settings-tile" type="button" onclick="gcPromptAvatarUpload('user')">
                    <span class="material-icons-round">photo_camera</span>
                    <div>
                        <div class="gc-settings-tile-title">Change Avatar</div>
                        <div class="gc-settings-tile-text">Upload a profile image others can see</div>
                    </div>
                </button>
                <button class="gc-settings-tile" type="button" onclick="gcPromptAvatarUpload('cover')">
                    <span class="material-icons-round">image</span>
                    <div>
                        <div class="gc-settings-tile-title">Change Cover</div>
                        <div class="gc-settings-tile-text">Upload a profile cover under 1 MB</div>
                    </div>
                </button>
                <button class="gc-settings-tile" type="button" onclick="gcHideModal(); gcToggleMembers();">
                    <span class="material-icons-round">group</span>
                    <div>
                        <div class="gc-settings-tile-title">Members</div>
                        <div class="gc-settings-tile-text">Open the member list for this conversation</div>
                    </div>
                </button>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Current Conversation</div>
                <div class="gc-settings-stat-row">
                    <span>Room</span>
                    <strong>${gcEscape(roomText)}</strong>
                </div>
                <div class="gc-settings-stat-row">
                    <span>Your role</span>
                    <strong>${gcEscape(roleText)}</strong>
                </div>
                <div class="gc-settings-stat-row">
                    <span>Pinned</span>
                    <strong>${gcIsRoomPinned(gcCurrentRoom) ? 'Yes' : 'No'}</strong>
                </div>
            </div>
            ${gcIsGroupRoom() && gcCanManageGroup() ? `
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Group Appearance</div>
                <div class="gc-settings-actions">
                    <button class="gc-settings-link" type="button" onclick="gcPromptAvatarUpload('group')">
                        <span class="material-icons-round">imagesmode</span>
                        Change group avatar
                    </button>
                    ${room?.avatar_url ? `
                    <button class="gc-settings-link gc-settings-link-danger" type="button" onclick="gcRemoveGroupAvatar()">
                        <span class="material-icons-round">delete</span>
                        Remove group avatar
                    </button>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Profile Bio</div>
                <div class="gc-profile-bio-row">
                    <div class="gc-profile-bio-icon" aria-hidden="true">
                        <span class="material-icons-round">edit_note</span>
                    </div>
                    <div class="gc-profile-bio-block">
                        <div class="gc-profile-bio-label">Short description</div>
                        <div class="gc-settings-card-note">Visible when other people tap your avatar in chat.</div>
                    </div>
                </div>
                <textarea class="gc-settings-bio-input" maxlength="160" placeholder="Write a short profile description...">${gcEscape(gcUserBio)}</textarea>
                <div class="gc-settings-actions">
                    <button class="gc-settings-link" type="button" onclick="gcSaveProfileBio()">
                        <span class="material-icons-round">edit</span>
                        Save profile bio
                    </button>
                    ${gcUserAvatarUrl ? `
                    <button class="gc-settings-link gc-settings-link-danger" type="button" onclick="gcRemoveUserAvatar()">
                        <span class="material-icons-round">delete</span>
                        Remove avatar
                    </button>
                    ` : ''}
                    ${gcUserCoverUrl ? `
                    <button class="gc-settings-link gc-settings-link-danger" type="button" onclick="gcRemoveUserCover()">
                        <span class="material-icons-round">delete_sweep</span>
                        Remove cover
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Quick Actions</div>
                <div class="gc-settings-actions">
                    <a class="gc-settings-link" href="https://discord.gg/C2wnU8Vz6U" target="_blank" rel="noopener noreferrer">
                        <span class="material-icons-round">groups</span>
                        Join Discord
                    </a>
                    <button class="gc-settings-link" type="button" onclick="gcHideModal(); gcTogglePinRoom();">
                        <span class="material-icons-round">push_pin</span>
                        ${gcIsRoomPinned(gcCurrentRoom) ? 'Unpin conversation' : 'Pin conversation'}
                    </button>
                </div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Close</button>
                <button class="gc-settings-logout" type="button" onclick="gcLogout()">Log out</button>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
}

function gcLogout() {
    localStorage.removeItem('webos-gc-username');
    localStorage.removeItem('webos-gc-userid');
    localStorage.removeItem('webos-gc-color');
    localStorage.removeItem('webos-gc-avatar');
    localStorage.removeItem('webos-gc-cover');
    localStorage.removeItem('webos-gc-bio');
    location.reload();
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
    const modal = gcWin?.querySelector('.gc-modal');
    if (overlay) overlay.classList.add('hidden');
    if (input) input.value = '';
    if (modal) {
        modal.classList.remove('gc-settings-modal');
        modal.innerHTML = `
            <h3>Create New Group</h3>
            <input type="text" id="gc-group-name" class="gc-setup-input" placeholder="Group name...">
            <div class="gc-modal-actions">
                <button class="gc-btn-cancel" onclick="gcHideModal()">Cancel</button>
                <button class="gc-btn-primary" onclick="gcCreateGroup()">Create</button>
            </div>
        `;
        gcBindGroupModal(gcWin);
    }
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
        const suggestion = gcSuggestAvailableRoomName(name);
        if (input) {
            input.value = suggestion;
            input.focus();
            input.select();
        }
        gcNotifyError(`A group with this name already exists. Try "${suggestion}".`);
        input?.focus();
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
            if (error.code === '23505' || error.status === 409) {
                const suggestion = gcSuggestAvailableRoomName(name);
                if (input) {
                    input.value = suggestion;
                    input.focus();
                    input.select();
                }
                gcNotifyError(`A group with this name already exists. Try "${suggestion}".`);
                return;
            }
            gcDebugError('Create group error:', error);
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
        gcDebugError('Create group error:', error);
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
        gcDebugError('Delete room error:', error);
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
