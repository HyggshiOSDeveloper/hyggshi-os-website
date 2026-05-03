/* Split from apps-message.js: panels */

async function gcRefreshMembersPanel() {
    const list = gcWin?.querySelector('.gc-members-list');
    if (!list) return;
    if (gcIsSystemRoom()) {
        list.innerHTML = '';
        return;
    }

    await gcEnsureRoomMembership();
    await gcLoadRoomMembers();

    if (gcIsGroupRoom()) {
        const shareActionHtml = gcCanShareGroupLink()
            ? `<div class="gc-member-actions gc-member-actions-top"><button class="gc-member-action" onclick="gcShareCurrentGroupLink()">Share link</button></div>`
            : '';
        const leaveActionHtml = gcCanLeaveGroup()
            ? `<div class="gc-member-actions gc-member-actions-top"><button class="gc-member-action danger" onclick="gcLeaveCurrentGroup()">Leave group</button></div>`
            : '';
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

        list.innerHTML = `${shareActionHtml}${leaveActionHtml}${memberList.map(member => {
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
        }).join('')}`;
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

    const loginUser = win.querySelector('#gc-login-user');
    if (loginUser) loginUser.maxLength = GC_USERNAME_MAX_LENGTH;

    const registerUser = win.querySelector('#gc-reg-user');
    if (registerUser) registerUser.maxLength = GC_USERNAME_MAX_LENGTH;

    const groupName = win.querySelector('#gc-group-name');
    if (groupName) groupName.maxLength = GC_ROOM_NAME_MAX_LENGTH;

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

function gcBuildDefaultModalHtml() {
    return `
        <h3>Create New Group</h3>
        <input type="text" id="gc-group-name" class="gc-setup-input" maxlength="${GC_ROOM_NAME_MAX_LENGTH}" placeholder="Group name...">
        <div class="gc-modal-actions">
            <button class="gc-btn-cancel" onclick="gcHideModal()">Cancel</button>
            <button class="gc-btn-primary" onclick="gcCreateGroup()">Create</button>
        </div>
    `;
}

function gcShowStickerPicker() {
    if (!gcWin) return;
    if (gcIsSystemRoom()) {
        gcNotifyError('System inbox is read-only. You can only view notifications.');
        return;
    }
    if (gcIsGlobalRoom() && gcIsGlobalChatBanned()) {
        gcNotifyError('You are banned from Global Chat.');
        return;
    }
    if (gcIsUserMuted()) {
        gcNotifyError(`You are muted and cannot send stickers for ${gcGetMuteRemainingText()}.`);
        return;
    }

    const overlay = gcWin.querySelector('.gc-modal-overlay');
    const modal = gcWin.querySelector('.gc-modal');
    if (!overlay || !modal) return;

    modal.classList.add('gc-settings-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Sticker</div>
                    <h3>Choose a sticker</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close sticker picker">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-sticker-grid">
                ${GC_STICKERS.map(sticker => `
                    <button class="gc-sticker-tile" type="button" onclick="gcSendSticker('${gcEscape(sticker.id)}')" style="--gc-sticker-accent:${gcEscape(sticker.accent)}">
                        <div class="gc-sticker-tile-art">${gcEscape(sticker.label)}</div>
                        <div class="gc-sticker-tile-name">${gcEscape(sticker.id.toUpperCase())}</div>
                    </button>
                `).join('')}
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Close</button>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
}

async function gcSendSticker(stickerId) {
    const sticker = GC_STICKERS.find(item => item.id === String(stickerId || '').toLowerCase());
    if (!sticker || !gcWin) return;

    const textarea = gcWin.querySelector('.gc-input-box textarea');
    if (!textarea) return;
    textarea.value = gcEncodeStickerToken(sticker.id);
    gcHideModal();
    await gcSendMessage();
}

function gcHideSetup(win) {
    win?.querySelector('.gc-setup-overlay')?.classList.add('hidden');
}

function gcEscape(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function gcShowLegalModal(type = 'terms') {
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const modal = gcWin?.querySelector('.gc-modal');
    if (!overlay || !modal) return;

    const isPrivacy = type === 'privacy';
    const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
    const intro = isPrivacy
        ? 'What Zashi Messaging stores and how it handles your data.'
        : 'Basic rules for using the chat system.';
    const items = isPrivacy
        ? [
            'We store account details you provide, such as username, avatar, cover, bio, and chat content.',
            'We store message attachments and moderation reports so the system can work and abuse can be reviewed.',
            'We do not sell your personal data.',
            'Administrators may remove content or accounts that violate the rules or harm the service.'
        ]
        : [
            'Do not spam, harass, or abuse other users.',
            'Do not post illegal, harmful, or infringing content.',
            'Uploaded files and messages may be removed to protect the platform or its users.',
            'The service may suspend or delete content, groups, or accounts that break these rules.'
        ];

    modal.classList.add('gc-settings-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Legal</div>
                    <h3>${title}</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close ${title}">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">${title}</div>
                <div class="gc-settings-card-note">${intro}</div>
                <div class="gc-legal-list">
                    ${items.map(item => `<div class="gc-legal-item">${gcEscape(item)}</div>`).join('')}
                </div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Close</button>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');
}

function gcShowReportModal(messageId) {
    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const modal = gcWin?.querySelector('.gc-modal');
    const message = gcGetMessageById(messageId);
    if (!overlay || !modal || !message?.id) return;

    modal.classList.add('gc-settings-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Safety</div>
                    <h3>Report Message</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close report modal">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Reported message</div>
                <div class="gc-report-quote">
                    <div class="gc-report-quote-name">${gcEscape(message.sender_name || 'Unknown')}</div>
                    <div class="gc-report-quote-text">${gcEscape(gcGetMessageSnapshot(message) || 'Message')}</div>
                </div>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Reason</div>
                <select id="gc-report-reason" class="gc-setup-input">
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment</option>
                    <option value="illegal">Illegal content</option>
                    <option value="impersonation">Impersonation</option>
                    <option value="other">Other</option>
                </select>
                <textarea id="gc-report-details" class="gc-setup-textarea" maxlength="300" placeholder="Optional details..."></textarea>
                <div class="gc-settings-card-note">Reports help moderators review abuse and remove harmful content.</div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Cancel</button>
                <button class="gc-btn-primary" type="button" onclick="gcSubmitReport('${gcEscape(message.id)}')">Submit report</button>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');
}

function gcGetReportStatusMeta(status) {
    const safeStatus = String(status || 'open').toLowerCase();
    if (safeStatus === 'reviewed') return { label: 'Reviewed', css: 'reviewed' };
    if (safeStatus === 'closed') return { label: 'Closed', css: 'closed' };
    return { label: 'Open', css: 'open' };
}

async function gcOpenAdminReportWorkspace() {
    if (!gcUserIsAdmin) {
        gcNotifyError('Only admins can access the report workspace.');
        return;
    }

    const overlay = gcWin?.querySelector('.gc-modal-overlay');
    const modal = gcWin?.querySelector('.gc-modal');
    if (!overlay || !modal) return;

    modal.classList.add('gc-settings-modal');
    modal.innerHTML = `
        <div class="gc-settings-sheet">
            <div class="gc-settings-header">
                <div>
                    <div class="gc-settings-eyebrow">Moderation</div>
                    <h3>Admin Report Workspace</h3>
                </div>
                <button class="gc-settings-close" type="button" onclick="gcHideModal()" aria-label="Close report workspace">
                    <span class="material-icons-round">close</span>
                </button>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Reports</div>
                <div class="gc-settings-card-note">Review user reports and update handling status.</div>
                <div id="gc-admin-reports-list" class="gc-admin-reports-list">
                    <div class="gc-admin-reports-empty">Loading reports...</div>
                </div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcShowSettings()">Back</button>
                <button class="gc-btn-primary" type="button" onclick="gcOpenAdminReportWorkspace()">Refresh</button>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');
    await gcRenderAdminReportsList();
}

async function gcRenderAdminReportsList() {
    if (!sbClient || !gcUserIsAdmin) return;
    const list = gcWin?.querySelector('#gc-admin-reports-list');
    if (!list) return;

    const { data, error } = await sbClient
        .from(GC_TABLES.reports)
        .select('id,room_id,message_id,reporter_user_id,reported_user_id,reason,details,message_snapshot,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.reports));
        list.innerHTML = '<div class="gc-admin-reports-empty">Could not load reports.</div>';
        return;
    }

    const reports = data || [];
    if (reports.length === 0) {
        list.innerHTML = '<div class="gc-admin-reports-empty">No reports yet.</div>';
        return;
    }

    const userIdSet = new Set();
    const roomIdSet = new Set();
    reports.forEach(item => {
        if (item.reporter_user_id) userIdSet.add(item.reporter_user_id);
        if (item.reported_user_id) userIdSet.add(item.reported_user_id);
        if (item.room_id) roomIdSet.add(item.room_id);
    });

    const userMap = new Map();
    const roomMap = new Map();
    const messageMap = new Map();
    try {
        const userIds = [...userIdSet];
        if (userIds.length) {
            const { data: users } = await sbClient
                .from(GC_TABLES.users)
                .select('id,username')
                .in('id', userIds);
            (users || []).forEach(user => userMap.set(user.id, user.username || 'Unknown'));
        }
        const roomIds = [...roomIdSet];
        if (roomIds.length) {
            const { data: rooms } = await sbClient
                .from(GC_TABLES.rooms)
                .select('id,name,type')
                .in('id', roomIds);
            (rooms || []).forEach(room => roomMap.set(room.id, gcGetDisplayRoomName(room)));
        }
        const messageIds = reports.map(item => item.message_id).filter(Boolean);
        if (messageIds.length) {
            const { data: messages } = await sbClient
                .from(GC_TABLES.messages)
                .select('id,text,file_url,type,sender_name')
                .in('id', messageIds);
            (messages || []).forEach(message => messageMap.set(message.id, message));
        }
    } catch (resolveError) {
        gcDebugError('Resolve report metadata error:', resolveError);
    }

    list.innerHTML = reports.map(item => {
        const statusMeta = gcGetReportStatusMeta(item.status);
        const reporterName = userMap.get(item.reporter_user_id) || 'Unknown';
        const reportedName = userMap.get(item.reported_user_id) || 'Unknown';
        const roomName = roomMap.get(item.room_id) || (item.room_id || 'Unknown');
        const details = gcEscape(item.details || '');
        const createdText = gcFormatMessageTime(item.created_at);
        const liveMessage = item.message_id ? messageMap.get(item.message_id) : null;
        const liveSticker = gcParseStickerToken(liveMessage?.text || '');
        const previewBaseText = liveSticker
            ? `[Sticker: ${liveSticker.label}]`
            : String(liveMessage?.text || item.message_snapshot || 'No snapshot').trim() || 'No snapshot';
        const previewText = gcEscape(previewBaseText);
        const previewImage = liveMessage?.type === 'image' && liveMessage?.file_url
            ? `<img class="gc-admin-report-preview-image" src="${gcEscape(liveMessage.file_url)}" alt="Reported image preview">`
            : '';

        return `
            <div class="gc-admin-report-item">
                <div class="gc-admin-report-top">
                    <div class="gc-admin-report-reason">${gcEscape(item.reason || 'other')}</div>
                    <div class="gc-admin-report-status ${statusMeta.css}">${statusMeta.label}</div>
                </div>
                <div class="gc-admin-report-meta">
                    <span>Reporter: <strong>${gcEscape(reporterName)}</strong></span>
                    <span>Reported: <strong>${gcEscape(reportedName)}</strong></span>
                    <span>Room: <strong>${gcEscape(roomName)}</strong></span>
                    <span>Time: <strong>${gcEscape(createdText)}</strong></span>
                </div>
                <div class="gc-admin-report-preview">
                    ${previewImage}
                    <div class="gc-admin-report-snapshot is-flagged">${previewText}</div>
                </div>
                ${details ? `<div class="gc-admin-report-details">${details}</div>` : ''}
                <div class="gc-admin-report-actions">
                    ${item.message_id && item.room_id ? `<button class="gc-member-action" type="button" onclick="gcOpenReportedMessage('${gcEscape(item.room_id)}','${gcEscape(item.message_id)}')">Jump to message</button>` : ''}
                    ${item.message_id ? `<button class="gc-member-action danger" type="button" onclick="gcDeleteReportedMessage('${gcEscape(item.id)}')">Delete message</button>` : ''}
                    <button class="gc-member-action" type="button" onclick="gcWarnReportedUser('${gcEscape(item.id)}')">Warn only</button>
                    ${item.message_id ? `<button class="gc-member-action danger" type="button" onclick="gcDeleteReportedMessageAndWarn('${gcEscape(item.id)}')">Delete + warn</button>` : ''}
                    ${item.message_id ? `<button class="gc-member-action danger" type="button" onclick="gcDeleteReportedMessageAndMute('${gcEscape(item.id)}')">Delete + mute 24h</button>` : ''}
                    <button class="gc-member-action" type="button" onclick="gcUpdateReportStatus('${gcEscape(item.id)}','reviewed')">Mark reviewed</button>
                    <button class="gc-member-action danger" type="button" onclick="gcUpdateReportStatus('${gcEscape(item.id)}','closed')">Close</button>
                    <button class="gc-member-action" type="button" onclick="gcUpdateReportStatus('${gcEscape(item.id)}','open')">Reopen</button>
                </div>
            </div>
        `;
    }).join('');
}

async function gcUpdateReportStatus(reportId, nextStatus) {
    if (!sbClient || !gcUserIsAdmin || !reportId) return;
    const status = String(nextStatus || '').toLowerCase();
    if (!['open', 'reviewed', 'closed'].includes(status)) {
        gcNotifyError('Invalid report status.');
        return;
    }

    const { error } = await sbClient
        .from(GC_TABLES.reports)
        .update({ status })
        .eq('id', reportId);

    if (error) {
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.reports));
        return;
    }

    showNotification('Zashi Messaging', `Report marked as ${status}.`);
    await gcRenderAdminReportsList();
}

async function gcApplyModerationWarning(userId, reason = 'policy violation') {
    if (!sbClient || !userId) return null;

    const { data: user, error: userError } = await sbClient
        .from(GC_TABLES.users)
        .select('id,warnings_count,global_chat_banned')
        .eq('id', userId)
        .maybeSingle();

    if (userError || !user) {
        gcNotifyError('Could not update moderation warnings.');
        return null;
    }

    const nextWarnings = Math.max(0, Number(user.warnings_count) || 0) + 1;
    const shouldGlobalBan = nextWarnings >= 5;
    const { error: updateError } = await sbClient
        .from(GC_TABLES.users)
        .update({
            warnings_count: nextWarnings,
            global_chat_banned: shouldGlobalBan ? true : !!user.global_chat_banned
        })
        .eq('id', userId);

    if (updateError) {
        gcNotifyError(gcFormatSupabaseError(updateError, GC_TABLES.users));
        return null;
    }

    if (nextWarnings >= 3) {
        await gcMuteUserFor24Hours(userId, reason);
    }

    if (shouldGlobalBan) {
        await gcCreateSystemNotice(
            userId,
            'Global chat ban',
            `You have been banned from Global Chat because your account reached ${nextWarnings} warnings.`,
            'ban'
        );
    }

    if (userId === gcUserId) {
        await gcRefreshCurrentUserSession();
        gcApplyRoomInteractionState(gcCurrentRoom);
    }

    return {
        warningsCount: nextWarnings,
        globalChatBanned: shouldGlobalBan || !!user.global_chat_banned
    };
}

async function gcDeleteReportedMessageCore(reportId, options = {}) {
    if (!sbClient || !gcUserIsAdmin || !reportId) return false;

    const {
        skipConfirm = false,
        confirmationText = 'Delete the reported message?',
        successText = 'Reported message deleted.',
        sendWarning = false
    } = options;

    if (!skipConfirm) {
        const confirmed = confirm(confirmationText);
        if (!confirmed) return false;
    }

    const { data: report, error: reportError } = await sbClient
        .from(GC_TABLES.reports)
        .select('id, room_id, message_id, reported_user_id, reason, status')
        .eq('id', reportId)
        .maybeSingle();

    if (reportError || !report?.message_id) {
        gcNotifyError('Could not load the reported message.');
        return false;
    }

    const { data: message, error: messageError } = await sbClient
        .from(GC_TABLES.messages)
        .select('id, room_id, sender_id, sender_name, text, file_url')
        .eq('id', report.message_id)
        .maybeSingle();

    if (messageError) {
        gcNotifyError(gcFormatSupabaseError(messageError, GC_TABLES.messages));
        return false;
    }

    if (!message?.id) {
        await gcUpdateReportStatus(reportId, 'closed');
        gcNotifyError('That message was already removed.');
        return false;
    }

    const deleteError = await (async () => {
        const { error } = await sbClient
            .from(GC_TABLES.messages)
            .delete()
            .eq('id', message.id);
        return error;
    })();

    if (deleteError) {
        gcNotifyError(gcFormatSupabaseError(deleteError, GC_TABLES.messages));
        return false;
    }

    if (message.file_url) {
        gcDeleteStorageObjectByUrl(message.file_url).catch(storageError => {
            gcDebugError('Delete reported message file error:', storageError);
        });
    }

    if (gcCurrentRoom === message.room_id) {
        gcRemoveMessageFromUi(message.id);
    }

    const warnedUserId = report.reported_user_id || message.sender_id || null;
    if (sendWarning && warnedUserId) {
        await gcCreateSystemNotice(
            warnedUserId,
            'Content warning',
            `One of your messages was removed by an admin for "${report.reason || 'policy violation'}". Please review the chat rules before posting again.`,
            'warning'
        );
        await gcApplyModerationWarning(warnedUserId, report.reason || 'policy violation');
    }

    const { error: updateError } = await sbClient
        .from(GC_TABLES.reports)
        .update({ status: 'closed' })
        .eq('id', reportId);

    if (updateError) {
        gcDebugError('Close report after deletion error:', updateError);
    }

    showNotification('Zashi Messaging', successText);
    await gcRenderAdminReportsList();
    return true;
}

async function gcDeleteReportedMessage(reportId) {
    await gcDeleteReportedMessageCore(reportId);
}

async function gcWarnReportedUser(reportId) {
    if (!sbClient || !gcUserIsAdmin || !reportId) return;

    const confirmed = confirm('Send a warning notice to this user and mark the report as reviewed?');
    if (!confirmed) return;

    const { data: report, error } = await sbClient
        .from(GC_TABLES.reports)
        .select('id, reported_user_id, reason')
        .eq('id', reportId)
        .maybeSingle();

    if (error || !report?.reported_user_id) {
        gcNotifyError('Could not load the reported user.');
        return;
    }

    await gcCreateSystemNotice(
        report.reported_user_id,
        'Account warning',
        `Your content was reported for "${report.reason || 'policy violation'}". Please follow the community rules to avoid stronger action.`,
        'warning'
    );
    await gcApplyModerationWarning(report.reported_user_id, report.reason || 'policy violation');
    await gcUpdateReportStatus(reportId, 'reviewed');
}

async function gcDeleteReportedMessageAndWarn(reportId) {
    await gcDeleteReportedMessageCore(reportId, {
        confirmationText: 'Delete the reported message and issue a warning to this user?',
        successText: 'Reported message deleted and warning sent.',
        sendWarning: true
    });
}

async function gcMuteUserFor24Hours(userId, reason = 'policy violation') {
    if (!sbClient || !userId) return false;
    const mutedUntil = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();

    const { error } = await sbClient
        .from(GC_TABLES.users)
        .update({ muted_until: mutedUntil })
        .eq('id', userId);

    if (error) {
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.users));
        return false;
    }

    await gcCreateSystemNotice(
        userId,
        'Temporary mute',
        `You have been muted for 24 hours for "${reason}". During this time you cannot send messages or uploads.`,
        'mute'
    );
    return true;
}

async function gcDeleteReportedMessageAndMute(reportId) {
    if (!sbClient || !gcUserIsAdmin || !reportId) return;

    const confirmed = confirm('Delete the reported message, mute this user for 24 hours, and send a warning?');
    if (!confirmed) return;

    const { data: report, error } = await sbClient
        .from(GC_TABLES.reports)
        .select('id, reported_user_id, reason')
        .eq('id', reportId)
        .maybeSingle();

    if (error || !report) {
        gcNotifyError('Could not load the report.');
        return;
    }

    const deleted = await gcDeleteReportedMessageCore(reportId, {
        skipConfirm: true,
        successText: 'Reported message deleted.',
        sendWarning: true
    });
    if (deleted && report.reported_user_id) {
        const muted = await gcMuteUserFor24Hours(report.reported_user_id, report.reason || 'policy violation');
        if (muted) {
            showNotification('Zashi Messaging', 'User muted for 24 hours.');
        }
    }
    await gcRenderAdminReportsList();
}

async function gcCheckReportRateLimit(messageId) {
    if (!sbClient || !gcUserId) return { blocked: false, duplicate: false };

    const { data: duplicate } = await sbClient
        .from(GC_TABLES.reports)
        .select('id')
        .eq('reporter_user_id', gcUserId)
        .eq('message_id', messageId)
        .limit(1);

    const { data: recentReports } = await sbClient
        .from(GC_TABLES.reports)
        .select('id,created_at')
        .eq('reporter_user_id', gcUserId)
        .order('created_at', { ascending: false })
        .limit(1);

    const lastCreatedAt = recentReports?.[0]?.created_at ? new Date(recentReports[0].created_at).getTime() : 0;
    const blocked = !!lastCreatedAt && (Date.now() - lastCreatedAt < GC_REPORT_RATE_LIMIT_MS);
    return {
        blocked,
        duplicate: !!duplicate?.length
    };
}

async function gcHandleAutoReportEscalation(reportedUserId, reason = 'policy violation') {
    if (!sbClient || !reportedUserId) return;

    const { count, error } = await sbClient
        .from(GC_TABLES.reports)
        .select('id', { count: 'exact', head: true })
        .eq('reported_user_id', reportedUserId);

    if (error || !count) return;

    if (count === 3) {
        await gcCreateSystemNotice(
            reportedUserId,
            'Automatic warning',
            `Your account reached 3 reports for "${reason}". Please fix your behavior to avoid stronger action.`,
            'warning'
        );
        await gcApplyModerationWarning(reportedUserId, reason);
    }

    if (count === 5) {
        const muted = await gcMuteUserFor24Hours(reportedUserId, `automatic report threshold for "${reason}"`);
        if (muted) {
            showNotification('Zashi Messaging', 'Auto moderation muted a user after 5 reports.');
        }
    }
}

async function gcSubmitReport(messageId) {
    if (!sbClient || !gcUserId || !messageId) return;
    const message = gcGetMessageById(messageId);
    if (!message) {
        gcNotifyError('Could not find that message anymore.');
        return;
    }

    const reasonInput = gcWin?.querySelector('#gc-report-reason');
    const detailsInput = gcWin?.querySelector('#gc-report-details');
    const reason = (reasonInput?.value || '').trim();
    const details = (detailsInput?.value || '').trim().slice(0, 300);
    if (!reason) {
        gcNotifyError('Choose a reason for the report.');
        return;
    }

    const reportGuard = await gcCheckReportRateLimit(messageId);
    if (reportGuard.duplicate) {
        gcNotifyError('You already reported this message.');
        return;
    }
    if (reportGuard.blocked) {
        gcNotifyError(`Please wait ${Math.ceil(GC_REPORT_RATE_LIMIT_MS / 1000)}s before sending another report.`);
        return;
    }

    const payload = {
        room_id: message.room_id || gcCurrentRoom,
        message_id: message.id,
        reporter_user_id: gcUserId,
        reported_user_id: message.sender_id || null,
        reason,
        details: details || null,
        message_snapshot: gcGetMessageSnapshot(message)
    };

    const { error } = await sbClient
        .from(GC_TABLES.reports)
        .insert([payload]);

    if (error) {
        gcDebugError('Submit report error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.reports));
        return;
    }

    if (payload.reported_user_id) {
        await gcHandleAutoReportEscalation(payload.reported_user_id, reason);
    }

    gcHideModal();
    showNotification('Zashi Messaging', 'Report submitted. Thank you.');
}

function gcRenderMessageTextContent(text) {
    const sticker = gcParseStickerToken(text);
    if (sticker) {
        return `
            <div class="gc-sticker-message" style="--gc-sticker-accent:${gcEscape(sticker.accent)}">
                <div class="gc-sticker-message-art">${gcEscape(sticker.label)}</div>
                <div class="gc-sticker-message-tag">Sticker</div>
            </div>
        `;
    }

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

function gcFormatExportDate(value) {
    const date = value ? new Date(value) : new Date();
    if (isNaN(date.getTime())) return 'unknown-date';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function gcBuildExportRoomSlug(room = gcGetRoomById()) {
    const baseName = gcGetDisplayRoomName(room)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return baseName || 'chat-room';
}

function gcDownloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function gcGetGoogleClientId() {
    return localStorage.getItem(GC_GOOGLE_CLIENT_ID_KEY) || '';
}

function gcSaveGoogleClientId() {
    const input = gcWin?.querySelector('#gc-google-client-id');
    const value = (input?.value || '').trim();
    if (!value) {
        gcNotifyError('Enter your Google OAuth Client ID first.');
        return;
    }
    localStorage.setItem(GC_GOOGLE_CLIENT_ID_KEY, value);
    showNotification('Zashi Messaging', 'Saved Google Drive Client ID.');
    gcShowSettings();
}

function gcResetGoogleDriveSession() {
    gcGoogleTokenClient = null;
    gcGoogleAccessToken = '';
    gcGoogleTokenExpiresAt = 0;
}

function gcLoadRemoteScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

async function gcEnsureGoogleIdentityReady() {
    await gcLoadRemoteScript(GC_GOOGLE_GSI_SCRIPT);
    if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services is unavailable.');
    }
}

async function gcGetGoogleDriveAccessToken(forcePrompt = false) {
    const clientId = gcGetGoogleClientId();
    if (!clientId) {
        throw new Error('Missing Google OAuth Client ID.');
    }

    if (!forcePrompt && gcGoogleAccessToken && Date.now() < gcGoogleTokenExpiresAt - 15000) {
        return gcGoogleAccessToken;
    }

    await gcEnsureGoogleIdentityReady();

    return new Promise((resolve, reject) => {
        gcGoogleTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GC_GOOGLE_DRIVE_SCOPE,
            callback: response => {
                if (response?.error) {
                    reject(new Error(response.error));
                    return;
                }
                gcGoogleAccessToken = response.access_token || '';
                gcGoogleTokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
                resolve(gcGoogleAccessToken);
            }
        });

        gcGoogleTokenClient.requestAccessToken({
            prompt: forcePrompt || !gcGoogleAccessToken ? 'consent' : ''
        });
    });
}

function gcBuildExportPayload(format = 'txt') {
    const room = gcGetRoomById();
    if (format === 'json') {
        return {
            filename: gcBuildExportFilename('json'),
            mimeType: 'application/json',
            content: gcBuildChatExportJson(),
            roomName: gcGetDisplayRoomName(room)
        };
    }
    return {
        filename: gcBuildExportFilename('txt'),
        mimeType: 'text/plain',
        content: gcBuildChatExportText(),
        roomName: gcGetDisplayRoomName(room)
    };
}

async function gcUploadBackupToGoogleDrive(format = 'txt') {
    if (!gcCurrentRoomMessages.length) {
        gcNotifyError('There are no messages to back up in this conversation.');
        return;
    }

    const clientId = gcGetGoogleClientId();
    if (!clientId) {
        gcNotifyError('Set your Google OAuth Client ID in Settings before backing up.');
        return;
    }

    const payload = gcBuildExportPayload(format);

    try {
        const accessToken = await gcGetGoogleDriveAccessToken(!gcGoogleAccessToken);
        const boundary = `zashi-${Date.now().toString(36)}`;
        const metadata = {
            name: payload.filename,
            mimeType: payload.mimeType
        };
        const multipartBody = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            `Content-Type: ${payload.mimeType}; charset=UTF-8`,
            '',
            payload.content,
            `--${boundary}--`
        ].join('\r\n');

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });

        if (!response.ok) {
            if (response.status === 401) {
                gcResetGoogleDriveSession();
            }
            throw new Error(`drive-upload-${response.status}`);
        }

        const data = await response.json();
        showNotification('Zashi Messaging', `Backed up "${payload.roomName}" to Google Drive.`);
        if (data?.webViewLink) {
            window.open(data.webViewLink, '_blank', 'noopener,noreferrer');
        }
    } catch (error) {
        gcDebugError('Google Drive backup error:', error);
        if (`${error?.message || ''}`.includes('Missing Google OAuth Client ID')) {
            gcNotifyError('Set your Google OAuth Client ID before using Google Drive backup.');
            return;
        }
        if (`${error?.message || ''}`.includes('popup_closed') || `${error?.message || ''}`.includes('access_denied')) {
            gcNotifyError('Google Drive backup was cancelled.');
            return;
        }
        gcNotifyError('Could not back up to Google Drive.');
    }
}

function gcBuildExportFilename(extension = 'txt') {
    const room = gcGetRoomById();
    const slug = gcBuildExportRoomSlug(room);
    const stamp = gcFormatExportDate(new Date());
    return `zashi-chat-${slug}-${stamp}.${extension}`;
}

function gcBuildChatExportText() {
    const room = gcGetRoomById();
    const lines = [
        `Zashi Messaging Export`,
        `Room: ${gcGetDisplayRoomName(room)}`,
        `Exported: ${new Date().toISOString()}`,
        `Messages: ${gcCurrentRoomMessages.length}`,
        ''
    ];

    gcCurrentRoomMessages.forEach(msg => {
        const timestamp = msg.created_at ? new Date(msg.created_at).toISOString() : '';
        const author = msg.sender_name || 'Unknown';
        const body = msg.text
            ? String(msg.text)
            : msg.type === 'image'
                ? `[Image] ${msg.file_url || ''}`.trim()
                : msg.type === 'video'
                    ? `[Video] ${msg.file_url || ''}`.trim()
                    : gcGetMessageSnapshot(msg);
        const replyPrefix = msg.reply_to_sender_name
            ? `\n  Reply to ${msg.reply_to_sender_name}: ${msg.reply_to_text || 'Message'}`
            : '';
        lines.push(`[${timestamp}] ${author}: ${body}${replyPrefix}`);
    });

    return lines.join('\n');
}

function gcBuildChatExportJson() {
    const room = gcGetRoomById();
    return JSON.stringify({
        app: 'Zashi Messaging',
        exportedAt: new Date().toISOString(),
        room: room ? {
            id: room.id,
            name: gcGetDisplayRoomName(room),
            type: room.type || 'group'
        } : {
            id: gcCurrentRoom,
            name: gcGetDisplayRoomName(null),
            type: gcIsGlobalRoom() ? 'global' : 'group'
        },
        messages: gcCurrentRoomMessages.map(msg => ({
            id: msg.id || null,
            room_id: msg.room_id || gcCurrentRoom,
            type: msg.type || 'text',
            text: msg.text || null,
            file_url: msg.file_url || null,
            sender_id: msg.sender_id || null,
            sender_name: msg.sender_name || 'Unknown',
            sender_color: msg.sender_color || null,
            sender_avatar_url: msg.sender_avatar_url || null,
            reply_to_message_id: msg.reply_to_message_id || null,
            reply_to_user_id: msg.reply_to_user_id || null,
            reply_to_sender_name: msg.reply_to_sender_name || null,
            reply_to_text: msg.reply_to_text || null,
            created_at: msg.created_at || null
        }))
    }, null, 2);
}

function gcExportCurrentChat(format = 'txt') {
    if (!gcCurrentRoomMessages.length) {
        gcNotifyError('There are no messages to export in this conversation.');
        return;
    }

    if (format === 'json') {
        gcDownloadBlob(gcBuildExportFilename('json'), gcBuildChatExportJson(), 'application/json;charset=utf-8');
        showNotification('Zashi Messaging', 'Exported chat as JSON.');
        return;
    }

    gcDownloadBlob(gcBuildExportFilename('txt'), gcBuildChatExportText(), 'text/plain;charset=utf-8');
    showNotification('Zashi Messaging', 'Exported chat as TXT.');
}

function gcChangeTheme(themeId) {
    if (!gcUserIsAdmin) {
        gcApplyTheme('default');
        gcNotifyError('Only admins can change the interface theme.');
        return;
    }
    gcApplyTheme(themeId);
    showNotification('Zashi Messaging', 'Theme updated.');
    gcShowSettings();
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
    const inviteLink = gcCanShareGroupLink() ? gcBuildGroupInviteLink(gcCurrentRoom) : '';
    const roleText = gcIsGroupRoom() ? gcGetRoleLabel(gcCurrentUserRoomRole) : 'Community';
    const roomText = gcGetDisplayRoomName(room);
    const expiryText = room?.expires_at ? new Date(room.expires_at).toLocaleString() : '';

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
                ${gcUserIsAdmin ? `
                <div class="gc-settings-stat-row">
                    <span>Account level</span>
                    <strong>Admin</strong>
                </div>
                ` : ''}
                ${gcIsAdminOnlyRoom(room) ? `
                <div class="gc-settings-stat-row">
                    <span>Visibility</span>
                    <strong>Admin only</strong>
                </div>
                <div class="gc-settings-stat-row">
                    <span>Expires</span>
                    <strong>${gcEscape(expiryText || 'In 1 day')}</strong>
                </div>
                ` : ''}
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
            ${gcIsGroupRoom() && gcCanLeaveGroup() ? `
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Membership</div>
                <div class="gc-settings-card-note">Leave this group and remove it from your conversation list on this device.</div>
                <div class="gc-settings-actions">
                    <button class="gc-settings-link gc-settings-link-danger" type="button" onclick="gcLeaveCurrentGroup()">
                        <span class="material-icons-round">logout</span>
                        Leave group
                    </button>
                </div>
            </div>
            ` : ''}
            ${gcCanShareGroupLink() ? `
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Invite</div>
                <div class="gc-settings-card-note">Copy a share link so other signed-in users can join this group directly.</div>
                <div class="gc-invite-preview">
                    <div class="gc-invite-preview-label">Invite Link Preview</div>
                    <textarea class="gc-invite-preview-input" rows="3" readonly onclick="this.focus(); this.select();">${gcEscape(inviteLink)}</textarea>
                </div>
                <div class="gc-settings-actions">
                    <button class="gc-settings-link" type="button" onclick="gcShareCurrentGroupLink()">
                        <span class="material-icons-round">share</span>
                        Share group link
                    </button>
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
                    <button class="gc-settings-link" type="button" onclick="gcShowLegalModal('terms')">
                        <span class="material-icons-round">description</span>
                        Terms of Service
                    </button>
                    <button class="gc-settings-link" type="button" onclick="gcShowLegalModal('privacy')">
                        <span class="material-icons-round">shield</span>
                        Privacy Policy
                    </button>
                    ${gcUserIsAdmin ? `
                    <button class="gc-settings-link" type="button" onclick="gcOpenAdminReportWorkspace()">
                        <span class="material-icons-round">admin_panel_settings</span>
                        Admin Report Workspace
                    </button>
                    ` : ''}
                </div>
            </div>
            ${gcUserIsAdmin ? `
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Appearance</div>
                <div class="gc-settings-card-note">Pick a visual style for Zashi Messaging on this device.</div>
                <div class="gc-theme-grid">
                    ${GC_THEMES.map(theme => `
                        <button class="gc-theme-tile${gcThemeId === theme.id ? ' active' : ''}" type="button" onclick="gcChangeTheme('${gcEscape(theme.id)}')">
                            <div class="gc-theme-preview gc-theme-preview-${gcEscape(theme.id)}"></div>
                            <div class="gc-theme-name">${gcEscape(theme.name)}</div>
                            <div class="gc-theme-desc">${gcEscape(theme.description)}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
            ` : `
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Appearance</div>
                <div class="gc-settings-card-note">Theme controls are admin-only on this build.</div>
            </div>
            `}
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Export Chat</div>
                <div class="gc-settings-card-note">Download the current conversation to your device. TXT is lighter, JSON keeps more metadata.</div>
                <div class="gc-settings-actions">
                    <button class="gc-settings-link" type="button" onclick="gcExportCurrentChat('txt')">
                        <span class="material-icons-round">description</span>
                        Export as TXT
                    </button>
                    <button class="gc-settings-link" type="button" onclick="gcExportCurrentChat('json')">
                        <span class="material-icons-round">data_object</span>
                        Export as JSON
                    </button>
                </div>
            </div>
            <div class="gc-settings-card">
                <div class="gc-settings-card-title">Google Drive Backup</div>
                <div class="gc-settings-card-note">Use your own Google Drive for chat backups. OAuth stays in the browser session and is not sent to Supabase.</div>
                <input id="gc-google-client-id" class="gc-setup-input" type="text" placeholder="Paste your Google OAuth Client ID..." value="${gcEscape(gcGetGoogleClientId())}">
                <div class="gc-settings-actions">
                    <button class="gc-settings-link" type="button" onclick="gcSaveGoogleClientId()">
                        <span class="material-icons-round">key</span>
                        Save Google Client ID
                    </button>
                    <button class="gc-settings-link" type="button" onclick="gcUploadBackupToGoogleDrive('txt')">
                        <span class="material-icons-round">cloud_upload</span>
                        Backup TXT to Google Drive
                    </button>
                    <button class="gc-settings-link" type="button" onclick="gcUploadBackupToGoogleDrive('json')">
                        <span class="material-icons-round">backup</span>
                        Backup JSON to Google Drive
                    </button>
                </div>
            </div>
            <div class="gc-settings-footer">
                <button class="gc-btn-cancel" type="button" onclick="gcHideModal()">Close</button>
                <button class="gc-settings-logout" type="button" onclick="gcLogout()">Log out</button>
            </div>
        </div>
    `;

    modal.scrollTop = 0;
    overlay.classList.remove('hidden');
}

function gcLogout() {
    localStorage.removeItem('webos-gc-username');
    localStorage.removeItem('webos-gc-userid');
    localStorage.removeItem('webos-gc-color');
    localStorage.removeItem('webos-gc-avatar');
    localStorage.removeItem('webos-gc-cover');
    localStorage.removeItem('webos-gc-bio');
    localStorage.removeItem(GC_IS_ADMIN_KEY);
    localStorage.removeItem('webos-gc-muted-until');
    localStorage.removeItem('webos-gc-warnings-count');
    localStorage.removeItem('webos-gc-global-chat-banned');
    localStorage.removeItem(GC_LEFT_GROUPS_KEY);
    location.reload();
}

function gcShowCreateGroup() {
    if (gcIsSystemRoom()) {
        gcNotifyError('System inbox is read-only. Switch to another room to create groups.');
        return;
    }
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
        modal.classList.remove('gc-settings-modal', 'gc-profile-modal');
        modal.innerHTML = gcBuildDefaultModalHtml();
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
    if (gcIsUserMuted()) {
        gcNotifyError(`You are muted and cannot create groups for ${gcGetMuteRemainingText()}.`);
        return;
    }

    const input = gcWin.querySelector('#gc-group-name');
    const createBtn = gcWin.querySelector('.gc-btn-primary');
    const validation = gcValidateSafeName(input?.value || '', 'Room');
    const name = validation.normalized;
    const nameKey = gcBuildNameKey(name);

    if (!name || !nameKey) {
        gcNotifyError('Enter a group name.');
        input?.focus();
        return;
    }

    if (validation.error) {
        gcNotifyError(validation.error);
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
            gcMarkGroupJoined(data.id);
            gcRoomCache = gcRoomCache.filter(room => room.id !== data.id);
            gcRoomCache.push(data);
            gcRoomCache = gcSortRooms(gcRoomCache);
            gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
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
    gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
    gcHideMembersPanel();
    gcSwitchRoom('global');
    showNotification('Zashi Messaging', `Deleted group "${room.name}".`);
}

async function gcLeaveCurrentGroup() {
    const room = gcGetRoomById();
    if (!sbClient || !room || room.type !== 'group' || !gcUserId) return;

    if (!gcCanLeaveGroup(room.id)) {
        gcNotifyError('The group leader cannot leave directly. Delete the group or transfer leadership first.');
        return;
    }

    const confirmed = confirm(`Leave group "${room.name}"?`);
    if (!confirmed) return;

    const { error } = await sbClient
        .from(GC_TABLES.roomMembers)
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', gcUserId);

    if (error) {
        gcDebugError('Leave group error:', error);
        gcNotifyError(gcFormatSupabaseError(error, GC_TABLES.roomMembers));
        return;
    }

    gcPinnedRoomIds.delete(room.id);
    gcSavePinnedRooms();
    gcMarkGroupLeft(room.id);
    gcRoomMembersCache = [];
    gcCurrentUserRoomRole = 'member';
    gcHideMembersPanel();
    gcHideModal();
    gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
    gcSwitchRoom(GC_GLOBAL_ROOM_ID);
    showNotification('Zashi Messaging', `Left group "${room.name}".`);
}

async function gcShareCurrentGroupLink() {
    const room = gcGetRoomById();
    if (!room || room.type !== 'group') {
        gcNotifyError('Only group chats can be shared by link.');
        return;
    }

    const inviteLink = gcBuildGroupInviteLink(room.id);
    if (!inviteLink) {
        gcNotifyError('Could not build the group link.');
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(inviteLink);
        } else {
            throw new Error('clipboard-unavailable');
        }
        showNotification('Zashi Messaging', 'Group link copied to clipboard.');
    } catch (error) {
        prompt('Copy this group link:', inviteLink);
    }
}

function gcHideMembersPanel() {
    const panel = gcWin?.querySelector('.gc-members-panel');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-members-toggle-btn');
    gcMembersPanelOpen = false;
    panel?.classList.remove('show');
    membersBtn?.classList.remove('active');
}

async function gcToggleMembers() {
    if (gcIsSystemRoom()) return;
    const panel = gcWin?.querySelector('.gc-members-panel');
    const membersBtn = gcWin?.querySelector('.gc-header-actions .gc-members-toggle-btn');
    if (!panel) return;

    gcMembersPanelOpen = !gcMembersPanelOpen;
    panel.classList.toggle('show', gcMembersPanelOpen);
    membersBtn?.classList.toggle('active', gcMembersPanelOpen);

    if (gcMembersPanelOpen) {
        await gcRefreshMembersPanel();
    }
}
