/* ============ GLOBAL CHAT APP (Supabase Edition) ============ */

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

/* ===== INIT ===== */
function initMessage(win) {
    gcWin = win;

    let cleanUrl = SB_URL.trim();
    try {
        cleanUrl = new URL(cleanUrl).origin;
    } catch (error) {
        console.error('Invalid Supabase URL:', error);
    }

    if (!cleanUrl || cleanUrl.includes('YOUR_SUPABASE_URL')) {
        showNotification('Global Chat', 'Set a real Supabase URL in js/apps-message.js.');
        gcShowSetup(win);
        return;
    }

    if (window.location.protocol === 'file:') {
        showNotification('Global Chat', 'Open this project with a local web server. file:// mode breaks parts of the app.');
    }

    try {
        if (typeof supabase === 'undefined') {
            showNotification('Global Chat', 'Supabase library did not load.');
            return;
        }
        sbClient = supabase.createClient(cleanUrl, SB_KEY);
    } catch (error) {
        console.error('Supabase init error:', error);
        showNotification('Global Chat', 'Cannot connect to Supabase.');
        return;
    }

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

function gcNotifySetupIssue(message) {
    if (!gcSetupErrorShown) {
        showNotification('Global Chat', message);
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
        showNotification('Global Chat', 'The chat backend is not ready.');
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
            showNotification('Global Chat', gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.password !== password) {
            showNotification('Global Chat', 'Wrong username or password.');
            return;
        }

        gcSetUserSession(data.username, data.id, data.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Global Chat', 'Database connection error.');
    }
}

async function gcRegister() {
    if (!sbClient) {
        showNotification('Global Chat', 'The chat backend is not ready.');
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
        showNotification('Global Chat', 'Username must be at least 3 chars and password at least 6 chars.');
        return;
    }
    if (password !== confirmation) {
        showNotification('Global Chat', 'Passwords do not match.');
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
            showNotification('Global Chat', gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        const newUser = data?.[0];
        if (!newUser) {
            showNotification('Global Chat', 'Registration failed.');
            return;
        }

        gcSetUserSession(newUser.username, newUser.id, newUser.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (error) {
        console.error('Register error:', error);
        showNotification('Global Chat', 'System error while creating account.');
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
        rooms.unshift({ id: 'global', name: 'Global Chat', type: 'global' });
    }

    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = `gc-room-item${gcCurrentRoom === room.id ? ' active' : ''}`;
        div.onclick = () => gcSwitchRoom(room.id);

        const icon = room.type === 'global' ? 'public' : 'group';
        const preview = room.type === 'global'
            ? 'Phòng chat chung của mọi người'
            : 'Nhóm trò chuyện';
        const meta = room.id === gcCurrentRoom ? 'Đang mở' : 'Hôm nay';
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

    if (gcSubscription) {
        sbClient.removeChannel(gcSubscription);
        gcSubscription = null;
    }

    gcCurrentRoom = roomId;

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;
    msgContainer.innerHTML = '';

    const { data: messages, error } = await sbClient
        .from(GC_TABLES.messages)
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) {
        console.error('Supabase SQL Error:', error);
        gcNotifySetupIssue(gcFormatSupabaseError(error, GC_TABLES.messages));
        return;
    }

    gcRenderRoomList(gcWin, gcRoomCache);
    (messages || []).forEach(msg => gcAppendMessage(msgContainer, msg));
    msgContainer.scrollTop = msgContainer.scrollHeight;

    gcSubscription = sbClient.channel(`room:${roomId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: GC_TABLES.messages,
            filter: `room_id=eq.${roomId}`
        }, payload => {
            gcAppendMessage(msgContainer, payload.new);
            msgContainer.scrollTop = msgContainer.scrollHeight;
        })
        .subscribe();

    gcUpdateHeader(roomId);
}

function gcUpdateHeader(roomId) {
    const headerName = gcWin?.querySelector('.gc-chat-header-name');
    const headerStatus = gcWin?.querySelector('.gc-chat-header-status');
    const headerIcon = gcWin?.querySelector('.gc-chat-header-icon');
    const room = gcRoomCache.find(item => item.id === roomId) || {
        id: roomId,
        name: roomId === 'global' ? 'Global Chat' : 'Group Chat',
        type: roomId === 'global' ? 'global' : 'group'
    };

    if (headerName) headerName.textContent = room.name;
    if (headerStatus) {
        headerStatus.textContent = room.type === 'global'
            ? 'Cộng đồng đang trò chuyện'
            : 'Nhóm đang hoạt động';
    }
    if (headerIcon) {
        headerIcon.innerHTML = `<span class="material-icons-round">${room.type === 'global' ? 'forum' : 'groups'}</span>`;
    }
}

function gcAppendMessage(container, msg) {
    const isSent = msg.sender_id === gcUserId;
    const div = document.createElement('div');
    div.className = `gc-msg${isSent ? ' sent' : ''}`;

    const initials = (msg.sender_name || '?')[0].toUpperCase();
    const color = msg.sender_color || '#6c5ce7';

    let contentHtml = '';
    if (msg.type === 'image') {
        const safeUrl = gcEscape(msg.file_url || '');
        contentHtml = `<img src="${safeUrl}" class="gc-msg-media" style="cursor:pointer" onclick="gcOpenExternalMedia(this.src)">`;
    } else if (msg.type === 'video') {
        contentHtml = `<video src="${gcEscape(msg.file_url || '')}" controls class="gc-msg-media"></video>`;
    } else {
        contentHtml = `<div class="gc-msg-bubble">${gcEscape(msg.text || '')}</div>`;
    }

    div.innerHTML = `
        <div class="gc-msg-avatar" style="background:${color}">${initials}</div>
        <div class="gc-msg-body">
            <div class="gc-msg-sender" style="color:${color}">${gcEscape(msg.sender_name || 'Unknown')}</div>
            ${contentHtml}
            <div class="gc-msg-time">${gcFormatMessageTime(msg.created_at)}</div>
        </div>
    `;

    container.appendChild(div);
}

/* ===== SEND & UPLOAD ===== */
async function gcSendMessage() {
    if (!sbClient) return;

    const textarea = gcWin?.querySelector('.gc-input-box textarea');
    const text = textarea?.value.trim();
    if (!textarea || !text) return;

    textarea.value = '';

    const { error } = await sbClient.from(GC_TABLES.messages).insert([{
        room_id: gcCurrentRoom,
        text,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type: 'text'
    }]);

    if (error) {
        console.error('Supabase SQL Error:', error);
        showNotification('Global Chat', gcFormatSupabaseError(error, GC_TABLES.messages));
        textarea.value = text;
    }
}

async function gcHandleFileSelect(input) {
    if (!sbClient) return;

    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showNotification('Global Chat', 'Maximum file size is 5 MB.');
        return;
    }

    const type = file.type.startsWith('image/') ? 'image' : 'video';
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const filePath = `${gcUserId}/${Date.now()}.${ext}`;

    showNotification('Global Chat', 'Uploading file...');

    const { error: uploadError } = await sbClient.storage
        .from(GC_STORAGE_BUCKET)
        .upload(filePath, file);

    if (uploadError) {
        console.error('Supabase Storage Error:', uploadError);
        showNotification('Global Chat', `Upload failed. Create a public "${GC_STORAGE_BUCKET}" bucket first.`);
        return;
    }

    const { data: urlData } = sbClient.storage
        .from(GC_STORAGE_BUCKET)
        .getPublicUrl(filePath);

    const { error: insertError } = await sbClient.from(GC_TABLES.messages).insert([{
        room_id: gcCurrentRoom,
        file_url: urlData.publicUrl,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type
    }]);

    if (insertError) {
        console.error('Supabase SQL Error:', insertError);
        showNotification('Global Chat', gcFormatSupabaseError(insertError, GC_TABLES.messages));
        return;
    }

    showNotification('Global Chat', 'File sent.');
    input.value = '';
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

function gcFormatMessageTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    showNotification('Global Chat', 'Group creation is not implemented yet.');
}

function gcToggleMembers() {
    showNotification('Global Chat', 'Member list is not implemented yet.');
}
