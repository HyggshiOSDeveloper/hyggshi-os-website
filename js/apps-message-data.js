/* Split from apps-message.js: data */

async function gcSwitchRoom(roomId) {
    if (!sbClient) return;
    const room = gcGetRoomById(roomId)
        || (roomId === GC_GLOBAL_ROOM_ID ? { id: GC_GLOBAL_ROOM_ID, type: 'global' } : null)
        || (roomId === GC_SYSTEM_ROOM_ID ? { id: GC_SYSTEM_ROOM_ID, type: 'system' } : null);
    if (roomId !== GC_GLOBAL_ROOM_ID && !gcCanAccessRoom(room)) {
        gcNotifyError('You cannot view this room.');
        if (gcCurrentRoom !== GC_GLOBAL_ROOM_ID) {
            gcSwitchRoom(GC_GLOBAL_ROOM_ID);
        }
        return;
    }

    const requestId = ++gcActiveRoomRequestId;

    gcStopRoomSync();

    gcCurrentRoom = roomId;
    gcClearReplyTarget();
    gcCurrentUserRoomRole = roomId === GC_GLOBAL_ROOM_ID ? 'owner' : 'member';
    gcRoomMembersCache = [];
    gcKnownMessageIds = new Set();
    gcPendingMessages.clear();

    const msgContainer = gcWin?.querySelector('.gc-messages');
    if (!msgContainer) return;
    msgContainer.innerHTML = '';
    gcCurrentRoomMessages = [];

    gcApplyRoomInteractionState(roomId);
    if (gcIsSystemRoom(roomId)) {
        await gcLoadSystemNotices(roomId);
        gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
        gcUpdateHeader(roomId);
        gcRefreshMembersPanel();
        return;
    }

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

    await gcEnsureAdminTestOwnership(roomId);
    await gcLoadRoomMembers(roomId);
    gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
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

function gcApplyRoomInteractionState(roomId = gcCurrentRoom) {
    const inputArea = gcWin?.querySelector('.gc-input-area');
    const textarea = gcWin?.querySelector('.gc-input-box textarea');
    const sendBtn = gcWin?.querySelector('.gc-send-btn');
    const fileInput = gcWin?.querySelector('#gc-file-input');
    const toolButtons = gcWin?.querySelectorAll('.gc-composer-tools .gc-tool-btn, .gc-input-box .gc-header-btn');
    if (!inputArea || !textarea || !sendBtn || !fileInput) return;

    const isReadOnly = gcIsSystemRoom(roomId) || (gcIsGlobalRoom(roomId) && gcIsGlobalChatBanned());
    inputArea.classList.toggle('gc-readonly-room', isReadOnly);
    textarea.disabled = isReadOnly;
    sendBtn.disabled = isReadOnly;
    fileInput.disabled = isReadOnly;
    textarea.placeholder = gcIsSystemRoom(roomId)
        ? 'System inbox is read-only.'
        : (gcIsGlobalRoom(roomId) && gcIsGlobalChatBanned() ? 'You are banned from Global Chat.' : 'Type a message...');

    if (toolButtons?.length) {
        toolButtons.forEach(btn => {
            btn.disabled = isReadOnly;
            btn.classList.toggle('is-disabled', isReadOnly);
        });
    }
}

function gcBuildSystemNoticeMessage(notice) {
    const title = gcStripUnsafeText(notice?.title || 'System Notice');
    const body = gcStripUnsafeText(notice?.body || '');
    return {
        room_id: GC_SYSTEM_ROOM_ID,
        sender_id: null,
        sender_name: 'Zashi System',
        sender_color: '#2563eb',
        sender_avatar_url: '',
        type: 'text',
        text: body ? `${title}\n${body}` : title,
        created_at: notice?.created_at || new Date().toISOString(),
        system_notice: true,
        notice_type: notice?.type || 'info',
        source_message_id: notice?.source_message_id || null,
        source_room_id: notice?.source_room_id || null
    };
}

async function gcLoadSystemNotices(roomId = GC_SYSTEM_ROOM_ID) {
    if (!sbClient || !gcWin) return;
    const msgContainer = gcWin.querySelector('.gc-messages');
    if (!msgContainer) return;

    const { data, error } = await sbClient
        .from(GC_TABLES.userNotices)
        .select('id,title,body,type,created_at')
        .eq('user_id', gcUserId)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) {
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.userNotices));
        return;
    }

    msgContainer.innerHTML = '';
    const notices = data || [];
    if (notices.length === 0) {
        const emptyMsg = gcBuildSystemNoticeMessage({
            title: 'No notifications yet',
            body: 'When the system sends updates for your account, they will appear here.',
            type: 'info'
        });
        gcCurrentRoomMessages = [emptyMsg];
        gcAppendMessage(msgContainer, emptyMsg);
        msgContainer.scrollTop = msgContainer.scrollHeight;
        return;
    }

    const mapped = notices.map(item => gcBuildSystemNoticeMessage(item));
    gcCurrentRoomMessages = mapped;
    mapped.forEach(item => gcAppendMessage(msgContainer, item));
    msgContainer.scrollTop = msgContainer.scrollHeight;
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
        gcMarkGroupJoined(roomId);
        await gcLoadRoomMembers(roomId);
    }
}

async function gcEnsureAdminTestOwnership(roomId = gcCurrentRoom) {
    if (!sbClient || !gcUserId || !gcUserIsAdmin || roomId !== GC_ADMIN_TEST_ROOM_ID) return;

    const { error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .upsert([{
            room_id: roomId,
            user_id: gcUserId,
            role: 'owner'
        }], { onConflict: 'room_id,user_id' });

    if (error) {
        gcDebugError('Ensure admin test ownership error:', error);
        return;
    }
    gcMarkGroupJoined(roomId);
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
        .select('room_id,user_id,role,users(id,username,color,avatar_url,cover_url,bio,is_admin)')
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

    if (gcIsGlobalRoom(roomId) && (messages || []).length >= GC_GLOBAL_MAX_MESSAGES) {
        gcPruneGlobalMessages();
    }

    if (appended) msgContainer.scrollTop = msgContainer.scrollHeight;
}

function gcUpdateHeader(roomId) {
    const headerName = gcWin?.querySelector('.gc-chat-header-name');
    const headerStatus = gcWin?.querySelector('.gc-chat-header-status');
    const headerIcon = gcWin?.querySelector('.gc-chat-header-icon');
    const deleteBtn = gcWin?.querySelector('.gc-delete-room-btn');
    const systemComposeBtn = gcWin?.querySelector('.gc-header-actions .gc-system-compose-btn');
    const shareBtn = gcWin?.querySelector('.gc-header-actions .gc-share-room-btn');
    const leaveBtn = gcWin?.querySelector('.gc-header-actions .gc-leave-room-btn');
    const searchBtn = gcWin?.querySelector('.gc-header-actions .gc-search-btn');
    const pinBtn = gcWin?.querySelector('.gc-header-actions .gc-pin-room-btn');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-members-toggle-btn');
    const room = gcRoomCache.find(item => item.id === roomId) || {
        id: roomId,
        name: roomId === GC_GLOBAL_ROOM_ID ? GC_GLOBAL_ROOM_LABEL : 'Group Chat',
        type: roomId === GC_GLOBAL_ROOM_ID ? 'global' : 'group'
    };

    if (headerName) headerName.textContent = gcGetDisplayRoomName(room);
    if (headerStatus) {
        if (room.type === 'global') {
            headerStatus.textContent = 'Public room for signed-in users. Slowmode is enabled.';
        } else if (room.type === 'system' || room.id === GC_SYSTEM_ROOM_ID) {
            headerStatus.textContent = 'Read-only personal notifications for your account.';
        } else if (gcIsAdminOnlyRoom(room)) {
            headerStatus.textContent = 'Hidden admin-only test room. Auto deletes after 1 day.';
        } else {
            headerStatus.textContent = 'This group is active';
        }
    }
    if (headerIcon) {
        gcSetAvatarContent(headerIcon, {
            avatarUrl: room.avatar_url || '',
            initials: gcGetInitials(room.name),
            color: '#6c5ce7',
            icon: room.type === 'global' ? 'forum' : (room.type === 'system' ? 'notifications_active' : 'groups')
        });
        headerIcon.title = room.type === 'group' ? 'Change group avatar' : (room.type === 'system' ? 'System inbox' : 'Public room');
    }
    const isSystem = room.type === 'system' || room.id === GC_SYSTEM_ROOM_ID;
    if (systemComposeBtn) systemComposeBtn.style.display = isSystem && gcUserIsAdmin ? 'grid' : 'none';
    if (deleteBtn) deleteBtn.style.display = !isSystem && room.type === 'group' && gcCanDeleteGroup(roomId) ? 'grid' : 'none';
    if (shareBtn) shareBtn.style.display = !isSystem && room.type === 'group' && gcCanShareGroupLink(roomId) ? 'grid' : 'none';
    if (leaveBtn) leaveBtn.style.display = !isSystem && room.type === 'group' && gcCanLeaveGroup(roomId) ? 'grid' : 'none';
    if (searchBtn) searchBtn.style.display = isSystem ? 'none' : 'grid';
    if (pinBtn) {
        pinBtn.style.display = isSystem ? 'none' : 'grid';
        pinBtn.classList.toggle('active', gcIsRoomPinned(roomId));
    }
    if (membersBtn) {
        membersBtn.style.display = isSystem ? 'none' : 'grid';
        membersBtn.classList.toggle('active', gcMembersPanelOpen);
    }
    if (isSystem) gcHideMembersPanel();
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

function gcGetMessageSnapshot(msg) {
    if (!msg) return '';
    const sticker = gcParseStickerToken(msg.text || '');
    if (sticker) return `[Sticker: ${sticker.label}]`;
    if (msg.text) return String(msg.text).trim().slice(0, 280);
    if (msg.reply_to_text) return String(msg.reply_to_text).trim().slice(0, 280);
    if (msg.type === 'image') return '[Image]';
    if (msg.type === 'video') return '[Video]';
    if (msg.file_url) return '[Attachment]';
    return '[Message]';
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

async function gcOpenReportedMessage(roomId, messageId) {
    if (!roomId || !messageId) return;
    gcHideModal();
    await gcSwitchRoom(roomId);
    window.setTimeout(() => gcScrollToMessage(messageId), 220);
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
    if (msg.system_notice) {
        const noticeType = ['info', 'warning', 'mute', 'ban', 'update'].includes(msg.notice_type) ? msg.notice_type : 'info';
        contentHtml = `
            <div class="gc-system-notice gc-system-notice-${noticeType}">
                <div class="gc-system-notice-badge">${gcEscape(noticeType)}</div>
                ${contentHtml}
            </div>
        `;
    }

    const progressHtml = options.progress === true ? `
        <div class="gc-upload-progress">
            <div class="gc-upload-progress-bar" style="width:${Math.max(0, Math.min(100, options.progressValue || 0))}%"></div>
        </div>
    ` : '';
    const isSystemNotice = !!msg.system_notice || gcIsSystemRoom(msg.room_id);
    const canDeleteMessage = msg.id && !options.pending && ((msg.sender_id === gcUserId || options.forceSent) || (gcCanManageGroup(msg.room_id) && gcIsGroupRoom(msg.room_id)));
    const deleteButtonHtml = canDeleteMessage ? `
        <button class="gc-msg-action gc-msg-delete" type="button" data-action="delete" title="Delete message">
            <span class="material-icons-round">delete</span>
        </button>
    ` : '';
    const replyButtonHtml = !isSystemNotice && !options.pending && msg.id ? `
        <button class="gc-msg-action gc-msg-reply" type="button" data-action="reply" title="Reply to message">
            <span class="material-icons-round">reply</span>
        </button>
    ` : '';
    const reportButtonHtml = !isSystemNotice && !options.pending && msg.id ? `
        <button class="gc-msg-action gc-msg-report" type="button" data-action="report" title="Report message">
            <span class="material-icons-round">flag</span>
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
                ${reportButtonHtml}
                ${deleteButtonHtml}
            </div>
        </div>
    `;
}

function gcBindMessageInteractions(element, msg, options = {}) {
    if (!element) return;
    if (msg.system_notice || gcIsSystemRoom(msg.room_id)) return;

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

    const reportAction = element.querySelector('.gc-msg-report');
    if (reportAction) {
        reportAction.onclick = () => gcShowReportModal(msg.id);
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
    if (gcIsSystemRoom()) {
        gcNotifyError('System inbox is read-only. You can only view notifications.');
        return;
    }
    if (gcIsGlobalRoom() && gcIsGlobalChatBanned()) {
        gcNotifyError('You are banned from Global Chat.');
        return;
    }
    if (gcIsUserMuted()) {
        gcNotifyError(`You are muted and cannot send messages for ${gcGetMuteRemainingText()}.`);
        return;
    }

    const textarea = gcWin.querySelector('.gc-input-box textarea');
    const text = textarea?.value.trim() || '';
    const attachment = gcPendingAttachment;

    if (!text && !attachment) return;
    if (attachment && !text) {
        const slowmodeError = gcGetGlobalSlowmodeError(gcCurrentRoom);
        if (slowmodeError) {
            gcNotifyError(slowmodeError);
            return;
        }
    }

    const validationError = text ? gcValidateOutgoingMessage(text, gcCurrentRoom) : null;
    if (validationError) {
        gcNotifyError(validationError);
        return;
    }

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
    if (gcIsGlobalRoom()) {
        gcGlobalLastSentAt = Date.now();
        gcPruneGlobalMessages();
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
    if (gcIsSystemRoom()) {
        gcNotifyError('System inbox is read-only. You can only view notifications.');
        return;
    }
    if (gcIsGlobalRoom() && gcIsGlobalChatBanned()) {
        gcNotifyError('You are banned from Global Chat.');
        return;
    }
    if (gcIsUserMuted()) {
        gcNotifyError(`You are muted and cannot send messages for ${gcGetMuteRemainingText()}.`);
        return;
    }
    const trimmedExtraText = String(extraText || '').trim();
    const validationError = trimmedExtraText ? gcValidateOutgoingMessage(trimmedExtraText, gcCurrentRoom) : null;
    if (validationError) {
        gcNotifyError(validationError);
        return;
    }

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

        const trimmedText = trimmedExtraText;
        if (trimmedText) {
            const textarea = gcWin.querySelector('.gc-input-box textarea');
            if (textarea) {
                textarea.value = trimmedText;
                await gcSendMessage();
            }
        } else if (gcIsGlobalRoom()) {
            gcGlobalLastSentAt = Date.now();
            gcPruneGlobalMessages();
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
    const imageTool = win.querySelector('.gc-composer-tools .gc-tool-btn:nth-of-type(1)');
    const stickerTool = win.querySelector('.gc-composer-tools .gc-tool-btn:nth-of-type(2)');

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

    if (stickerTool && !stickerTool.dataset.gcBound) {
        stickerTool.dataset.gcBound = 'true';
        stickerTool.addEventListener('click', () => gcShowStickerPicker());
    }
}

function gcResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
}

function gcPrepareAttachment(file) {
    if (!gcWin) return;
    if (gcIsSystemRoom()) {
        gcNotifyError('System inbox is read-only. Upload is disabled here.');
        return;
    }

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

