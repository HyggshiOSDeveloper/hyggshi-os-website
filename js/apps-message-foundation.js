/* Split from apps-message.js: foundation */

/* ============ Zashi Messaging APP (Supabase Edition) ============ */

const SB_URL = 'https://kwgxqxffjruykjzjhlkq.supabase.co';
const SB_KEY = 'sb_publishable_cj9pOUvJFPdOEtZCziWULQ_c-Ch1xPb';

const GC_TABLES = {
    users: 'users',
    rooms: 'rooms',
    messages: 'messages',
    roomMembers: 'room_members',
    reports: 'reports',
    userNotices: 'user_notices'
};

const GC_STORAGE_BUCKET = 'chat-files';
const GC_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#e84393', '#00cec9', '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0'];
const GC_GLOBAL_ROOM_ID = 'global';
const GC_GLOBAL_ROOM_LABEL = 'Global Chat (Public room)';
const GC_SYSTEM_ROOM_ID = 'system-inbox';
const GC_SYSTEM_ROOM_LABEL = 'System Inbox';
const GC_ADMIN_TEST_ROOM_ID = 'admin-test-room';
const GC_GLOBAL_RATE_LIMIT_MS = 5000;
const GC_GLOBAL_MAX_MESSAGES = 100;
const GC_GLOBAL_MAX_TEXT_LENGTH = 500;
const GC_GLOBAL_FILTER_WORDS = ['dm me now', 'free nitro', 'discord.gg/', 'telegram.me/', 'sex', 'porn', 'nude', 'xxx', 'kill yourself'];
const GC_REPORT_RATE_LIMIT_MS = 30000;
const GC_USERNAME_MIN_LENGTH = 3;
const GC_USERNAME_MAX_LENGTH = 32;
const GC_ROOM_NAME_MIN_LENGTH = 3;
const GC_ROOM_NAME_MAX_LENGTH = 32;
const GC_BIO_MAX_LENGTH = 160;
const GC_SAFE_NAME_REGEX = /^[A-Za-z0-9_ ]{3,32}$/;
const GC_GOOGLE_CLIENT_ID_KEY = 'webos-gc-google-client-id';
const GC_GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GC_GOOGLE_GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const GC_THEME_KEY = 'webos-gc-theme';
const GC_STICKERS = [
    { id: 'hi', label: 'HI', accent: '#2f80ed' },
    { id: 'ok', label: 'OK', accent: '#12b886' },
    { id: 'gg', label: 'GG', accent: '#8e59ff' },
    { id: 'wow', label: 'WOW', accent: '#ff8a00' },
    { id: 'lol', label: 'LOL', accent: '#ff5d6f' },
    { id: 'nice', label: 'NICE', accent: '#00a6a6' },
    { id: 'brb', label: 'BRB', accent: '#667eea' },
    { id: 'bye', label: 'BYE', accent: '#ef4444' }
];
const GC_THEMES = [
    { id: 'default', name: 'Sky Glass', description: 'Light blue default look' },
    { id: 'sunset', name: 'Sunset Pop', description: 'Warm coral and peach panels' },
    { id: 'forest', name: 'Forest Mint', description: 'Soft green layered workspace' },
    { id: 'midnight', name: 'Midnight Ink', description: 'Dark blue focus mode' }
];

let sbClient = null;
let gcUserId = null;
let gcUserName = '';
let gcUserColor = '';
let gcUserAvatarUrl = '';
let gcUserCoverUrl = '';
let gcUserBio = '';
let gcUserIsAdmin = false;
let gcUserMutedUntil = '';
let gcUserWarningsCount = 0;
let gcUserGlobalChatBanned = false;
let gcThemeId = 'default';
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
let gcLeftGroupIds = new Set();
let gcMembersPanelOpen = false;
let gcAvatarUploadMode = 'user';
let gcCurrentUserRoomRole = 'member';
let gcGlobalLastSentAt = 0;
let gcGlobalLastPruneAt = 0;
let gcGoogleTokenClient = null;
let gcGoogleAccessToken = '';
let gcGoogleTokenExpiresAt = 0;
const GC_PINNED_ROOMS_KEY = 'webos-gc-pinned-rooms';
const GC_LEFT_GROUPS_KEY = 'webos-gc-left-groups';
const GC_IS_ADMIN_KEY = 'webos-gc-is-admin';
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

function gcIsGlobalRoom(roomId = gcCurrentRoom) {
    return roomId === GC_GLOBAL_ROOM_ID;
}

function gcIsSystemRoom(roomId = gcCurrentRoom) {
    return roomId === GC_SYSTEM_ROOM_ID;
}

function gcGetDisplayRoomName(room) {
    if (!room) return GC_GLOBAL_ROOM_LABEL;
    if (room.id === GC_GLOBAL_ROOM_ID) return GC_GLOBAL_ROOM_LABEL;
    if (room.id === GC_SYSTEM_ROOM_ID) return GC_SYSTEM_ROOM_LABEL;
    return room.name || 'Group Chat';
}

function gcGetGlobalRoomPreview() {
    return 'Public room for signed-in users only';
}

function gcGetSystemRoomPreview() {
    return 'Private notices for your account only';
}

function gcIsUserMuted() {
    if (!gcUserMutedUntil) return false;
    const muteUntil = new Date(gcUserMutedUntil).getTime();
    return Number.isFinite(muteUntil) && muteUntil > Date.now();
}

function gcGetMuteRemainingText() {
    if (!gcIsUserMuted()) return '';
    const muteUntil = new Date(gcUserMutedUntil).getTime();
    const remainingMs = Math.max(0, muteUntil - Date.now());
    const minutes = Math.ceil(remainingMs / 60000);
    if (minutes < 60) return `${minutes} minute(s)`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} hour(s)`;
}

function gcIsGlobalChatBanned() {
    return !!gcUserGlobalChatBanned;
}

function gcIsAdminOnlyRoom(room) {
    return !!room?.is_admin_only;
}

function gcIsRoomExpired(room) {
    if (!room?.expires_at) return false;
    const expiresAt = new Date(room.expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function gcCanAccessRoom(room) {
    if (!room) return false;
    if (gcIsRoomExpired(room)) return false;
    if (gcIsAdminOnlyRoom(room) && !gcUserIsAdmin) return false;
    if (room.type === 'group' && gcLeftGroupIds.has(room.id)) return false;
    return true;
}

function gcGetVisibleRooms(rooms = gcRoomCache) {
    return (rooms || []).filter(room => gcCanAccessRoom(room));
}

function gcGetRoomPreview(room) {
    if (!room) return 'Group conversation';
    if (room.type === 'global') return gcGetGlobalRoomPreview();
    if (room.type === 'system' || room.id === GC_SYSTEM_ROOM_ID) return gcGetSystemRoomPreview();
    if (gcIsAdminOnlyRoom(room)) return 'Hidden admin-only test room';
    return 'Group conversation';
}

function gcApplyTheme(themeId = gcThemeId, win = gcWin) {
    if (!win) return;
    const nextTheme = GC_THEMES.some(item => item.id === themeId) ? themeId : 'default';
    gcThemeId = nextTheme;
    localStorage.setItem(GC_THEME_KEY, nextTheme);

    const root = win.querySelector('.app-globalchat');
    if (!root) return;
    root.classList.remove(...GC_THEMES.map(item => `gc-theme-${item.id}`));
    root.classList.add(`gc-theme-${nextTheme}`);
}

function gcEncodeStickerToken(stickerId) {
    return `[[sticker:${String(stickerId || '').trim().toLowerCase()}]]`;
}

function gcParseStickerToken(text) {
    const match = String(text || '').trim().match(/^\[\[sticker:([a-z0-9_-]+)\]\]$/i);
    if (!match) return null;
    const stickerId = match[1].toLowerCase();
    return GC_STICKERS.find(item => item.id === stickerId) || null;
}

async function gcDeleteExpiredAdminRooms() {
    if (!sbClient) return false;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.rooms)
            .select('id')
            .eq('is_admin_only', true)
            .lt('expires_at', new Date().toISOString());

        if (error || !data?.length) return false;

        const ids = data
            .map(item => item.id)
            .filter(id => !!id && id === GC_ADMIN_TEST_ROOM_ID);

        if (ids.length === 0) return false;

        const { error: deleteError } = await sbClient
            .from(GC_TABLES.rooms)
            .delete()
            .in('id', ids);

        if (deleteError) {
            gcDebugError('Delete expired admin rooms error:', deleteError);
            return false;
        }

        return true;
    } catch (error) {
        gcDebugError('Delete expired admin rooms error:', error);
        return false;
    }
}

function gcHasBlockedGlobalContent(text) {
    const lowered = String(text || '').toLowerCase();
    return GC_GLOBAL_FILTER_WORDS.find(word => lowered.includes(word)) || '';
}

function gcStripUnsafeText(value) {
    return String(value || '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/[\u200B-\u200D\u2060\uFEFF\u180E]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function gcNormalizeUsernameInput(value) {
    return gcStripUnsafeText(value).toLowerCase();
}

function gcNormalizeRoomNameInput(value) {
    return gcStripUnsafeText(value);
}

function gcValidateSafeName(value, kind = 'Username') {
    const label = kind === 'Room' ? 'Group name' : 'Username';
    const minLength = kind === 'Room' ? GC_ROOM_NAME_MIN_LENGTH : GC_USERNAME_MIN_LENGTH;
    const maxLength = kind === 'Room' ? GC_ROOM_NAME_MAX_LENGTH : GC_USERNAME_MAX_LENGTH;
    const normalized = kind === 'Room' ? gcNormalizeRoomNameInput(value) : gcNormalizeUsernameInput(value);

    if (!normalized) {
        return { normalized: '', error: `${label} cannot be empty.` };
    }
    if (normalized.length < minLength) {
        return { normalized, error: `${label} must be at least ${minLength} characters.` };
    }
    if (normalized.length > maxLength) {
        return { normalized, error: `${label} must be at most ${maxLength} characters.` };
    }
    if (!GC_SAFE_NAME_REGEX.test(normalized)) {
        return { normalized, error: `${label} can only use letters, numbers, spaces, and underscores.` };
    }
    return { normalized, error: '' };
}

function gcNormalizeBioInput(value) {
    return gcStripUnsafeText(value).slice(0, GC_BIO_MAX_LENGTH);
}

function gcGetGlobalSlowmodeError(roomId = gcCurrentRoom) {
    if (!gcIsGlobalRoom(roomId)) return '';
    const remaining = GC_GLOBAL_RATE_LIMIT_MS - (Date.now() - gcGlobalLastSentAt);
    if (remaining > 0) {
        return `Global chat slowmode is on. Wait ${Math.ceil(remaining / 1000)}s before sending again.`;
    }
    return '';
}

function gcValidateOutgoingMessage(text, roomId = gcCurrentRoom) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;
    if (trimmed.length > GC_GLOBAL_MAX_TEXT_LENGTH) {
        return `Messages can be at most ${GC_GLOBAL_MAX_TEXT_LENGTH} characters.`;
    }
    if (gcIsGlobalRoom(roomId)) {
        const slowmodeError = gcGetGlobalSlowmodeError(roomId);
        if (slowmodeError) return slowmodeError;
        const blockedWord = gcHasBlockedGlobalContent(trimmed);
        if (blockedWord) {
            return 'This message contains blocked words for the public room.';
        }
    }
    return null;
}

async function gcPruneGlobalMessages(force = false) {
    if (!sbClient || !gcIsGlobalRoom()) return;
    const now = Date.now();
    if (!force && now - gcGlobalLastPruneAt < 15000) return;
    gcGlobalLastPruneAt = now;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.messages)
            .select('id')
            .eq('room_id', GC_GLOBAL_ROOM_ID)
            .order('created_at', { ascending: false })
            .range(GC_GLOBAL_MAX_MESSAGES, GC_GLOBAL_MAX_MESSAGES + 149);

        if (error || !data?.length) return;

        const idsToDelete = data.map(item => item.id).filter(Boolean);
        if (idsToDelete.length === 0) return;

        await sbClient
            .from(GC_TABLES.messages)
            .delete()
            .in('id', idsToDelete);
    } catch (error) {
        gcDebugError('Global prune error:', error);
    }
}

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
    const userIsAdmin = localStorage.getItem(GC_IS_ADMIN_KEY) === 'true';
    const userMutedUntil = localStorage.getItem('webos-gc-muted-until') || '';
    const userWarningsCount = Number(localStorage.getItem('webos-gc-warnings-count') || 0);
    const userGlobalChatBanned = localStorage.getItem('webos-gc-global-chat-banned') === 'true';
    const savedThemeId = localStorage.getItem(GC_THEME_KEY) || 'default';
    gcLeftGroupIds = gcLoadLeftGroups();

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
    gcUserIsAdmin = userIsAdmin;
    gcUserMutedUntil = userMutedUntil;
    gcUserWarningsCount = Number.isFinite(userWarningsCount) ? userWarningsCount : 0;
    gcUserGlobalChatBanned = userGlobalChatBanned;
    gcThemeId = GC_THEMES.some(item => item.id === savedThemeId) ? savedThemeId : 'default';
    gcApplyTheme(gcThemeId, win);
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
        if (tableName === GC_TABLES.reports) return 'This report was already submitted.';
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
    if (tableName === GC_TABLES.reports) return 'Could not submit the report.';
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

    for (const tableName of [GC_TABLES.rooms, GC_TABLES.messages, GC_TABLES.users, GC_TABLES.roomMembers, GC_TABLES.reports]) {
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
    const validation = gcValidateSafeName(userInp?.value || '', 'Username');
    const username = validation.normalized;
    const usernameKey = gcBuildNameKey(username);
    const password = passInp?.value.trim();

    if (!username || !password || !usernameKey) return;
    if (validation.error) {
        gcNotifyError(validation.error);
        userInp?.focus();
        return;
    }

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

        gcSetUserSession(data.username, data.id, data.color, data.avatar_url, data.cover_url, data.bio, data.is_admin, data.muted_until, data.warnings_count, data.global_chat_banned);
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

    const validation = gcValidateSafeName(userInp?.value || '', 'Username');
    const username = validation.normalized;
    const usernameKey = gcBuildNameKey(username);
    const password = passInp?.value.trim();
    const confirmation = confirmInp?.value.trim();

    if (!username || !password || !usernameKey) return;
    if (validation.error) {
        gcNotifyError(validation.error);
        userInp?.focus();
        return;
    }
    if (password.length < 6) {
        gcNotifyError('Password must be at least 6 characters.');
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

        await gcCreateWelcomeNoticeForUser(newUser.id, newUser.username);
        gcSetUserSession(newUser.username, newUser.id, newUser.color, newUser.avatar_url, newUser.cover_url, newUser.bio, newUser.is_admin, newUser.muted_until, newUser.warnings_count, newUser.global_chat_banned);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        gcDebugError('Register error:', error);
        gcNotifyError('System error while creating the account.');
    }
}

async function gcCreateWelcomeNoticeForUser(userId, username = '') {
    if (!sbClient || !userId) return;
    const safeName = gcStripUnsafeText(username || 'there');
    const payload = {
        user_id: userId,
        title: 'Welcome to Zashi Messaging',
        body: `Welcome ${safeName}! Your account is ready. Open System Inbox anytime to see personal notices.`,
        type: 'info'
    };

    try {
        const { error } = await sbClient
            .from(GC_TABLES.userNotices)
            .insert([payload]);
        if (error) gcDebugError('Create welcome notice error:', error);
    } catch (error) {
        gcDebugError('Create welcome notice error:', error);
    }
}

async function gcCreateSystemNotice(userId, title, body, type = 'info') {
    if (!sbClient || !userId) return false;

    const payload = {
        user_id: userId,
        title: gcStripUnsafeText(title || 'System Notice').slice(0, 120),
        body: gcStripUnsafeText(body || '').slice(0, 500),
        type: ['info', 'warning', 'mute', 'ban', 'update'].includes(type) ? type : 'info'
    };

    try {
        const { error } = await sbClient
            .from(GC_TABLES.userNotices)
            .insert([payload]);
        if (error) {
            gcDebugError('Create system notice error:', error);
            return false;
        }
        return true;
    } catch (error) {
        gcDebugError('Create system notice error:', error);
        return false;
    }
}

function gcSetUserSession(name, id, color, avatarUrl = '', coverUrl = '', bio = '', isAdmin = false, mutedUntil = '', warningsCount = 0, globalChatBanned = false) {
    gcUserName = name;
    gcUserId = id;
    gcUserColor = color;
    gcUserAvatarUrl = avatarUrl || '';
    gcUserCoverUrl = coverUrl || '';
    gcUserBio = bio || '';
    gcUserIsAdmin = !!isAdmin;
    gcUserMutedUntil = mutedUntil || '';
    gcUserWarningsCount = Number(warningsCount) || 0;
    gcUserGlobalChatBanned = !!globalChatBanned;
    localStorage.setItem('webos-gc-username', name);
    localStorage.setItem('webos-gc-userid', id);
    localStorage.setItem('webos-gc-color', color);
    localStorage.setItem('webos-gc-avatar', gcUserAvatarUrl);
    localStorage.setItem('webos-gc-cover', gcUserCoverUrl);
    localStorage.setItem('webos-gc-bio', gcUserBio);
    localStorage.setItem(GC_IS_ADMIN_KEY, String(gcUserIsAdmin));
    localStorage.setItem('webos-gc-muted-until', gcUserMutedUntil);
    localStorage.setItem('webos-gc-warnings-count', String(gcUserWarningsCount));
    localStorage.setItem('webos-gc-global-chat-banned', String(gcUserGlobalChatBanned));
    gcCacheUserProfile({
        id,
        username: name,
        color,
        avatar_url: gcUserAvatarUrl,
        cover_url: gcUserCoverUrl,
        bio: gcUserBio,
        is_admin: gcUserIsAdmin,
        muted_until: gcUserMutedUntil,
        warnings_count: gcUserWarningsCount,
        global_chat_banned: gcUserGlobalChatBanned
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

function gcLoadLeftGroups() {
    try {
        const raw = localStorage.getItem(GC_LEFT_GROUPS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
        return new Set();
    }
}

function gcSaveLeftGroups() {
    localStorage.setItem(GC_LEFT_GROUPS_KEY, JSON.stringify([...gcLeftGroupIds]));
}

function gcMarkGroupLeft(roomId) {
    if (!roomId) return;
    gcLeftGroupIds.add(roomId);
    gcSaveLeftGroups();
}

function gcMarkGroupJoined(roomId) {
    if (!roomId) return;
    if (!gcLeftGroupIds.has(roomId)) return;
    gcLeftGroupIds.delete(roomId);
    gcSaveLeftGroups();
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

function gcCanLeaveGroup(roomId = gcCurrentRoom) {
    if (!gcIsGroupRoom(roomId)) return false;
    return gcCurrentUserRoomRole !== 'owner';
}

function gcCanShareGroupLink(roomId = gcCurrentRoom) {
    return gcIsGroupRoom(roomId);
}

function gcBuildGroupInviteLink(roomId = gcCurrentRoom) {
    const room = gcGetRoomById(roomId);
    if (!room || room.type !== 'group') return '';

    try {
        const url = new URL(window.location.href);
        url.searchParams.set('gc_join', room.id);
        return url.toString();
    } catch (error) {
        const base = window.location.href.split('?')[0];
        return `${base}?gc_join=${encodeURIComponent(room.id)}`;
    }
}

function gcGetInviteRoomIdFromUrl() {
    try {
        const url = new URL(window.location.href);
        return gcStripUnsafeText(url.searchParams.get('gc_join') || '');
    } catch (error) {
        return '';
    }
}

function gcClearInviteRoomIdFromUrl() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('gc_join');
        window.history.replaceState({}, document.title, url.toString());
    } catch (error) {
        gcDebugError('Clear invite link error:', error);
    }
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
            bio: gcUserBio,
            is_admin: gcUserIsAdmin,
            muted_until: gcUserMutedUntil,
            warnings_count: gcUserWarningsCount,
            global_chat_banned: gcUserGlobalChatBanned
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
                .select('id, username, color, avatar_url, cover_url, bio, is_admin')
                .in('id', missingIds);
            profiles = profiles.concat(data || []);
        }
        if (missingNames.length > 0) {
            const { data } = await sbClient
                .from(GC_TABLES.users)
                .select('id, username, color, avatar_url, cover_url, bio, is_admin')
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
        if (a.id === GC_SYSTEM_ROOM_ID) return -1;
        if (b.id === GC_SYSTEM_ROOM_ID) return 1;

        const pinnedDelta = Number(gcIsRoomPinned(b.id)) - Number(gcIsRoomPinned(a.id));
        if (pinnedDelta !== 0) return pinnedDelta;

        return (a.name || '').localeCompare(b.name || '');
    });
}

/* ===== APP LOGIC ===== */
async function gcStartApp(win) {
    if (!await gcEnsureBackendReady()) return;
    await gcRefreshCurrentUserSession();
    gcClearReplyTarget();
    gcRenderUserIdentity(win);

    await gcDeleteExpiredAdminRooms();
    await gcListenRooms(win);
    const joinedFromInvite = await gcHandleInviteLink();
    if (!joinedFromInvite) {
        gcSwitchRoom('global');
    }
}

async function gcRefreshCurrentUserSession() {
    if (!sbClient || !gcUserId) return;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .select('id, username, color, avatar_url, cover_url, bio, is_admin, muted_until, warnings_count, global_chat_banned')
            .eq('id', gcUserId)
            .maybeSingle();

        if (error || !data) return;
        gcSetUserSession(
            data.username,
            data.id,
            data.color,
            data.avatar_url,
            data.cover_url,
            data.bio,
            data.is_admin,
            data.muted_until,
            data.warnings_count,
            data.global_chat_banned
        );
        if (!data.is_admin) {
            gcApplyTheme('default');
        }
    } catch (error) {
        gcDebugError('Refresh current user session error:', error);
    }
}

async function gcListenRooms(win) {
    if (!sbClient) return;

    await gcDeleteExpiredAdminRooms();
    const { data, error } = await sbClient.from(GC_TABLES.rooms).select('*');
    if (error) {
        gcDebugError('Supabase SQL Error:', error);
        gcNotifySetupIssue(gcFormatSupabaseError(error, GC_TABLES.rooms));
        return;
    }

    gcRoomCache = data || [];
    gcRoomCache = gcSortRooms(gcRoomCache);
    gcRenderRoomList(win, gcGetVisibleRooms(gcRoomCache));

    const currentRoomMeta = gcGetRoomById(gcCurrentRoom)
        || (gcCurrentRoom === GC_SYSTEM_ROOM_ID ? { id: GC_SYSTEM_ROOM_ID, type: 'system' } : null);
    if (gcCurrentRoom !== GC_GLOBAL_ROOM_ID && !gcCanAccessRoom(currentRoomMeta)) {
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

async function gcHandleInviteLink() {
    const roomId = gcGetInviteRoomIdFromUrl();
    if (!roomId || !sbClient || !gcUserId) return false;

    try {
        const room = gcGetRoomById(roomId);
        if (!room || room.type !== 'group') {
            gcClearInviteRoomIdFromUrl();
            return false;
        }

        const { error } = await sbClient
            .from(GC_TABLES.roomMembers)
            .upsert([{
                room_id: roomId,
                user_id: gcUserId,
                role: 'member'
            }], { onConflict: 'room_id,user_id' });

        if (error) {
            gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.roomMembers));
            gcClearInviteRoomIdFromUrl();
            return false;
        }

        gcMarkGroupJoined(roomId);
        gcClearInviteRoomIdFromUrl();
        await gcSwitchRoom(roomId);
        showNotification('Zashi Messaging', `Joined group "${room.name}".`);
        return true;
    } catch (error) {
        gcDebugError('Handle invite link error:', error);
        gcClearInviteRoomIdFromUrl();
        return false;
    }
}

function gcRenderRoomList(win, rooms) {
    const list = win.querySelector('.gc-rooms-list');
    if (!list) return;

    list.innerHTML = '';

    const visibleRooms = [...(rooms || [])];
    if (!visibleRooms.find(room => room.id === GC_GLOBAL_ROOM_ID)) {
        visibleRooms.unshift({ id: GC_GLOBAL_ROOM_ID, name: GC_GLOBAL_ROOM_LABEL, type: 'global' });
    }
    if (!visibleRooms.find(room => room.id === GC_SYSTEM_ROOM_ID)) {
        visibleRooms.unshift({ id: GC_SYSTEM_ROOM_ID, name: GC_SYSTEM_ROOM_LABEL, type: 'system' });
    }

    gcSortRooms(visibleRooms).forEach(room => {
        const div = document.createElement('div');
        const isPinned = gcIsRoomPinned(room.id);
        div.className = `gc-room-item${gcCurrentRoom === room.id ? ' active' : ''}${isPinned ? ' pinned' : ''}`;
        div.onclick = () => gcSwitchRoom(room.id);

        const icon = room.type === 'global' ? 'public' : (room.type === 'system' ? 'notifications' : 'group');
        const roomName = gcGetDisplayRoomName(room);
        const preview = gcGetRoomPreview(room);
        const meta = room.id === gcCurrentRoom ? 'Open now' : (isPinned ? 'Pinned' : 'Today');

        div.innerHTML = `
            <div class="gc-room-icon ${room.type}">${room.avatar_url
                ? `<img src="${gcEscape(room.avatar_url)}" alt="${gcEscape(room.name)}">`
                : `<span class="material-icons-round">${icon}</span>`}</div>
            <div class="gc-room-info">
                <div class="gc-room-name-row">
                    <div class="gc-room-name">${gcEscape(roomName)}</div>
                    <div class="gc-room-meta">${meta}</div>
                </div>
                <div class="gc-room-preview">${preview}</div>
            </div>
        `;
        list.appendChild(div);
    });
}
