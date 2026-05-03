/* Split from apps-message.js: interactions */

function gcBindHeaderActions(win) {
    const actions = win.querySelector('.gc-header-actions');
    if (actions && !actions.querySelector('.gc-share-room-btn')) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'gc-header-btn gc-share-room-btn';
        shareBtn.style.display = 'none';
        shareBtn.title = 'Share group link';
        shareBtn.innerHTML = '<span class="material-icons-round">share</span>';
        shareBtn.addEventListener('click', () => gcShareCurrentGroupLink());
        const searchBtn = actions.querySelector('.gc-header-btn');
        if (searchBtn) {
            actions.insertBefore(shareBtn, searchBtn);
        } else {
            actions.appendChild(shareBtn);
        }
    }

    if (actions && !actions.querySelector('.gc-leave-room-btn')) {
        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'gc-header-btn gc-leave-room-btn';
        leaveBtn.style.display = 'none';
        leaveBtn.title = 'Leave group';
        leaveBtn.innerHTML = '<span class="material-icons-round">logout</span>';
        leaveBtn.addEventListener('click', () => gcLeaveCurrentGroup());
        const searchBtn = actions.querySelector('.gc-header-btn');
        if (searchBtn) {
            actions.insertBefore(leaveBtn, searchBtn);
        } else {
            actions.appendChild(leaveBtn);
        }
    }

    const headerButtons = actions?.querySelectorAll('.gc-header-btn') || [];
    if (headerButtons[0] && !headerButtons[0].classList.contains('gc-leave-room-btn')) {
        headerButtons[0].classList.add('gc-search-btn');
    } else {
        headerButtons[1]?.classList.add('gc-search-btn');
    }
    headerButtons.forEach(btn => {
        const icon = btn.querySelector('.material-icons-round')?.textContent?.trim();
        if (icon === 'share') btn.classList.add('gc-share-room-btn');
        if (icon === 'search') btn.classList.add('gc-search-btn');
        if (icon === 'push_pin') btn.classList.add('gc-pin-room-btn');
        if (icon === 'people') btn.classList.add('gc-members-toggle-btn');
    });

    const shareBtn = win.querySelector('.gc-header-actions .gc-share-room-btn');
    if (shareBtn) shareBtn.title = 'Share group link';

    const pinBtn = win.querySelector('.gc-header-actions .gc-pin-room-btn');
    if (pinBtn) pinBtn.title = 'Pin conversation';

    const membersBtn = win.querySelector('.gc-header-actions .gc-members-toggle-btn');
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
            bio: gcUserBio,
            is_admin: gcUserIsAdmin
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
            bio: gcUserBio,
            is_admin: gcUserIsAdmin
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
        bio: gcUserBio,
        is_admin: gcUserIsAdmin
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
        bio: gcUserBio,
        is_admin: gcUserIsAdmin
    });
    gcShowSettings();
    gcDeleteStorageObjectQuietly(previousCoverUrl);
    showNotification('Zashi Messaging', 'Profile cover removed.');
}

async function gcSaveProfileBio() {
    if (!sbClient || !gcUserId || !gcWin) return;
    const textarea = gcWin.querySelector('.gc-settings-bio-input');
    if (!textarea) return;

    const bio = gcNormalizeBioInput(textarea.value || '');
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
    gcCacheUserProfile({
        id: gcUserId,
        username: gcUserName,
        color: gcUserColor,
        avatar_url: gcUserAvatarUrl,
        cover_url: gcUserCoverUrl,
        bio: gcUserBio,
        is_admin: gcUserIsAdmin
    });
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
        gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
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
    gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
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
    gcRenderRoomList(gcWin, gcGetVisibleRooms(gcRoomCache));
    gcUpdateHeader(roomId);
}

