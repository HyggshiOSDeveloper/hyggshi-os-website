/* ============ GLOBAL CHAT APP (Supabase Edition) ============ */

// ==========================================
// BẮT BUỘC: Điền thông tin Supabase của bạn vào đây
// ==========================================
const SB_URL = 'https://kwgxqxffjruykjzjhlkq.supabase.co';
const SB_KEY = 'sb_publishable_cj9pOUvJFPdOEtZCziWULQ_c-Ch1xPb';
const GC_TABLES = {
    users: 'users',
    rooms: 'rooms',
    messages: 'messages'
};
const GC_STORAGE_BUCKET = 'chat-files';

let sbClient = null;
let gcUserId = null;
let gcUserName = '';
let gcUserColor = '';
let gcCurrentRoom = 'global';
let gcWin = null;
let gcSubscription = null;
let gcRoomsSubscription = null;
let gcSetupErrorShown = false;

const GC_COLORS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#fd79a8', '#e84393', '#00cec9', '#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#fab1a0'];

/* ===== INIT ===== */
function initMessage(win) {
    gcWin = win;

    // 1. Kiểm tra và làm sạch URL (Chỉ lấy phần domain chính)
    let cleanUrl = SB_URL.trim();
    try {
        const urlObj = new URL(cleanUrl);
        cleanUrl = urlObj.origin; // Tự động lấy https://xyz.supabase.co
    } catch (e) {
        console.error("Invalid URL format");
    }

    if (cleanUrl.includes('YOUR_SUPABASE_URL')) {
        showNotification('Global Chat', 'Lỗi: Bạn phải điền URL Supabase thật của mình vào apps-message.js');
        gcShowSetup(win);
        return;
    }

    // 2. Khởi tạo Client
    try {
        if (typeof supabase === 'undefined') {
            showNotification('Global Chat', 'Lỗi: Thư viện Supabase chưa tải. HÃY DÙNG LIVE SERVER!');
            return;
        }
        sbClient = supabase.createClient(cleanUrl, SB_KEY);
    } catch (e) {
        console.error("Supabase init error:", e);
        showNotification('Global Chat', 'Không thể kết nối Supabase.');
        return;
    }

    const userName = localStorage.getItem('webos-gc-username');
    const userId = localStorage.getItem('webos-gc-userid');

    if (!userName || !userId) {
        gcShowSetup(win);
    } else {
        gcUserId = userId;
        gcUserName = userName;
        gcUserColor = localStorage.getItem('webos-gc-color') || GC_COLORS[0];
        gcHideSetup(win);
        gcStartApp(win);
    }
}

/* ===== AUTH LOGIC ===== */
function gcToggleAuth(isRegister) {
    if (!gcWin) return;
    const loginCard = gcWin.querySelector('#gc-login-card');
    const registerCard = gcWin.querySelector('#gc-register-card');
    if (isRegister) {
        loginCard.classList.add('hidden');
        registerCard.classList.remove('hidden');
    } else {
        registerCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
    }
}

function gcFormatSupabaseError(error, tableName) {
    if (!error) return 'Lỗi không xác định.';
    if (error.status === 404) {
        return `Không tìm thấy bảng "${tableName}" trên Supabase REST API. Hãy tạo bảng và bật quyền truy cập cho nó.`;
    }
    return error.message || 'Lỗi database.';
}

async function gcLogin() {
    if (!sbClient) {
        showNotification('Global Chat', 'Hệ thống chưa sẵn sàng. Kiểm tra cấu hình hoặc Internet.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-login-user');
    const passInp = gcWin.querySelector('#gc-login-pass');
    const username = userInp.value.trim().toLowerCase();
    const password = passInp.value.trim();

    if (!username || !password) return;

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .select('*')
            .eq('username', username)
            .single();

        if (error) {
            console.error("Supabase SQL Error:", error);
            showNotification('Global Chat', gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.password !== password) {
            showNotification('Global Chat', 'Sai tài khoản hoặc mật khẩu.');
            return;
        }

        gcSetUserSession(data.username, data.id, data.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (e) {
        showNotification('Global Chat', 'Lỗi kết nối database.');
    }
}

async function gcRegister() {
    if (!sbClient) {
        showNotification('Global Chat', 'Hệ thống chưa sẵn sàng.');
        return;
    }

    const userInp = gcWin.querySelector('#gc-reg-user');
    const passInp = gcWin.querySelector('#gc-reg-pass');
    const confirmInp = gcWin.querySelector('#gc-reg-confirm');

    const username = userInp.value.trim().toLowerCase();
    const password = passInp.value.trim();

    if (username.length < 3 || password.length < 6) {
        showNotification('Global Chat', 'Username ≥ 3 ký tự, Password ≥ 6 ký tự.');
        return;
    }
    if (password !== confirmInp.value.trim()) {
        showNotification('Global Chat', 'Mật khẩu không khớp.');
        return;
    }

    const color = GC_COLORS[Math.floor(Math.random() * GC_COLORS.length)];

    try {
        const { data, error } = await sbClient
            .from(GC_TABLES.users)
            .insert([{ username, password, color }])
            .select();

        if (error) {
            console.error("Supabase SQL Error:", error);
            showNotification('Global Chat', 'L?i: ' + gcFormatSupabaseError(error, GC_TABLES.users));
            return;
        }

        if (!data || data.length === 0) {
            showNotification('Global Chat', 'Đăng ký thất bại: Không có dữ liệu trả về.');
            return;
        }

        const newUser = data[0];
        gcSetUserSession(newUser.username, newUser.id, newUser.color);
        gcHideSetup(gcWin);
        gcStartApp(gcWin);
    } catch (e) {
        console.error("Critical Register Error:", e);
        showNotification('Global Chat', 'Lỗi hệ thống: ' + e.message);
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
function gcStartApp(win) {
    const avatarEl = win.querySelector('.gc-user-avatar');
    if (avatarEl) {
        avatarEl.style.background = gcUserColor;
        avatarEl.textContent = gcUserName.charAt(0).toUpperCase();
    }
    win.querySelector('.gc-user-name').textContent = gcUserName;

    gcListenRooms(win);
    gcSwitchRoom('global');
}

async function gcListenRooms(win) {
    if (!sbClient) return;
    const { data, error } = await sbClient.from(GC_TABLES.rooms).select('*');
    if (error) {
        console.error("Supabase SQL Error:", error);
        showNotification('Global Chat', gcFormatSupabaseError(error, GC_TABLES.rooms));
        return;
    }
    gcRenderRoomList(win, data || []);

    sbClient.channel('public:rooms')
        .on('postgres_changes', { event: '*', schema: 'public', table: GC_TABLES.rooms }, payload => {
            gcListenRooms(win);
        }).subscribe();
}

function gcRenderRoomList(win, rooms) {
    const list = win.querySelector('.gc-rooms-list');
    list.innerHTML = '';

    if (!rooms.find(r => r.id === 'global')) {
        rooms.unshift({ id: 'global', name: '🌍 Global Chat', type: 'global' });
    }

    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = `gc-room-item${gcCurrentRoom === room.id ? ' active' : ''}`;
        div.onclick = () => gcSwitchRoom(room.id);
        const icon = room.type === 'global' ? 'public' : 'group';
        div.innerHTML = `
            <div class="gc-room-icon ${room.type}"><span class="material-icons-round">${icon}</span></div>
            <div class="gc-room-info"><div class="gc-room-name">${gcEscape(room.name)}</div></div>
        `;
        list.appendChild(div);
    });
}

async function gcSwitchRoom(roomId) {
    if (!sbClient) return;
    if (gcSubscription) sbClient.removeChannel(gcSubscription);
    gcCurrentRoom = roomId;

    const msgContainer = gcWin.querySelector('.gc-messages');
    msgContainer.innerHTML = '';

    const { data: messages } = await sbClient
        .from(GC_TABLES.messages)
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

    if (messages) {
        messages.forEach(msg => gcAppendMessage(msgContainer, msg));
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    gcSubscription = sbClient.channel(`room:${roomId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: GC_TABLES.messages,
            filter: `room_id=eq.${roomId}`
        }, payload => {
            gcAppendMessage(msgContainer, payload.new);
            msgContainer.scrollTop = msgContainer.scrollHeight;
        }).subscribe();

    gcUpdateHeader(roomId);
}

function gcUpdateHeader(roomId) {
    const headerName = gcWin.querySelector('.gc-chat-header-name');
    headerName.textContent = roomId === 'global' ? '🌍 Global Chat' : 'Group Chat';
}

function gcAppendMessage(container, msg) {
    const isSent = msg.sender_id == gcUserId;
    const div = document.createElement('div');
    div.className = `gc-msg${isSent ? ' sent' : ''}`;
    const initials = (msg.sender_name || '?')[0].toUpperCase();
    const color = msg.sender_color || '#6c5ce7';

    let contentHtml = '';
    if (msg.type === 'image') {
        contentHtml = `<img src="${msg.file_url}" class="gc-msg-media" style="cursor:pointer" onclick="window.open('${msg.file_url}')">`;
    } else if (msg.type === 'video') {
        contentHtml = `<video src="${msg.file_url}" controls class="gc-msg-media"></video>`;
    } else {
        contentHtml = `<div class="gc-msg-bubble">${gcEscape(msg.text || '')}</div>`;
    }

    div.innerHTML = `
        <div class="gc-msg-avatar" style="background:${color}">${initials}</div>
        <div class="gc-msg-body">
            <div class="gc-msg-sender" style="color:${color}">${gcEscape(msg.sender_name)}</div>
            ${contentHtml}
        </div>
    `;
    container.appendChild(div);
}

/* ===== SEND & UPLOAD ===== */
async function gcSendMessage() {
    if (!sbClient) return;
    const textarea = gcWin.querySelector('.gc-input-box textarea');
    const text = textarea.value.trim();
    if (!text) return;

    textarea.value = '';
    await sbClient.from(GC_TABLES.messages).insert([{
        room_id: gcCurrentRoom,
        text: text,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type: 'text'
    }]);
}

async function gcHandleFileSelect(input) {
    if (!sbClient) return;
    const file = input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showNotification('Global Chat', 'File tối đa 5MB.');
        return;
    }

    const type = file.type.startsWith('image/') ? 'image' : 'video';
    const ext = file.name.split('.').pop();
    const filePath = `${gcUserId}/${Date.now()}.${ext}`;

    showNotification('Global Chat', 'Đang tải lên...');

    const { data, error } = await sbClient.storage
        .from('chat-files')
        .upload(filePath, file);

    if (error) {
        showNotification('Global Chat', 'Lỗi upload. Hãy tạo bucket "chat-files" public.');
        return;
    }

    const { data: urlData } = sbClient.storage
        .from('chat-files')
        .getPublicUrl(filePath);

    await sbClient.from(GC_TABLES.messages).insert([{
        room_id: gcCurrentRoom,
        file_url: urlData.publicUrl,
        sender_id: gcUserId,
        sender_name: gcUserName,
        sender_color: gcUserColor,
        type: type
    }]);

    showNotification('Global Chat', 'Đã gửi file.');
    input.value = '';
}

/* ===== UTILS ===== */
function gcShowSetup(win) { win.querySelector('.gc-setup-overlay').classList.remove('hidden'); }
function gcHideSetup(win) { win.querySelector('.gc-setup-overlay').classList.add('hidden'); }
function gcEscape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function gcShowSettings() {
    if (confirm('Đăng xuất?')) {
        localStorage.clear();
        location.reload();
    }
}
function gcShowCreateGroup() { showNotification('Global Chat', 'Tính năng đang phát triển.'); }
function gcToggleMembers() { showNotification('Global Chat', 'Tính năng đang phát triển.'); }



