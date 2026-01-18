import { db, auth, provider } from './firebase-config';
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { ref, push, serverTimestamp, onValue, update, get, set, query, orderByChild, remove, off, increment } from "firebase/database";
import { initLanguage, setLanguage, t, updatePageText } from './i18n';
import { decodeHtmlEntities, toast } from './utils';
import Sortable from 'sortablejs';
import { APP_VERSION } from './version';

let currentUser = null;
let currentRoomId = null;
let currentRoomCreatorId = null;
let hasLikedCurrent = false;
let currentStatus = 'idle';
let currentSongData = null; // Store for queue rendering
let currentQueueSnapshot = null; // Store queue snapshot
let activeRoomsSnapshot = null; // Store active rooms snapshot for re-rendering
let sharedControlState = false; // Global state for permission checks
let currentVideoId = null; // Track current video for listener cleanup
let sortableInstance = null; // Sortable instance for queue reordering
let isDragging = false; // Drag lock flag
let isHostMissing = false; // Track host connection state globally

const YOUTUBE_API_KEY = 'AIzaSyBuN6OIAjU8C2q37vIhIZkY_l8hg3R_z9g';
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.snopyta.org',
    'https://yewtu.be'
];

// Elements
const loadingScreen = document.getElementById('loading-screen');

const roomSelectScreen = document.getElementById('room-select-screen');
const appScreen = document.getElementById('app-screen');
const appUserAvatar = document.getElementById('app-user-avatar');
const hostBadge = document.getElementById('host-badge');
const remoteVolume = document.getElementById('remote-volume');

// Header Controls
const flagBtnSelect = document.getElementById('flag-btn-select');
const flagBtnApp = document.getElementById('flag-btn-app');
const avatarBtnSelect = document.getElementById('avatar-btn-select');
const avatarBtnApp = document.getElementById('avatar-btn-app');

// Popovers
const popovers = {
    select: {
        lang: document.getElementById('lang-popover-select'),
        profile: document.getElementById('profile-popover-select'),
        avatar: document.getElementById('popover-avatar-select'),
        name: document.getElementById('popover-name-select'),
        email: document.getElementById('popover-email-select'),
        logout: document.getElementById('logout-btn-popover-select')
    },
    app: {
        lang: document.getElementById('lang-popover-app'),
        profile: document.getElementById('profile-popover-app'),
        roomInfo: document.getElementById('room-info-popover'), // New Room Info Popover
        avatar: document.getElementById('popover-avatar-app'),
        name: document.getElementById('popover-name-app'),
        email: document.getElementById('popover-email-app'),
        logout: document.getElementById('logout-btn-popover-app')
    }
};

const langSelectApp = document.getElementById('lang-select-app');
const langOptions = document.querySelectorAll('.lang-option'); // Keep for login/host pages if needed

// Init I18n
const startLang = initLanguage();
updatePageText();
updateFlagIcon(startLang);

// Auth & Setup
if (window.location.pathname.startsWith('/host')) {
    // Prevent execution on host page
}



// Settings & Logout
// --- Helper Functions ---
function updateFlagIcon(lang) {
    const icon = lang === 'ko' ? '🇰🇷' : '🇺🇸';
    if (flagBtnSelect) flagBtnSelect.textContent = icon;
    if (flagBtnApp) flagBtnApp.textContent = icon;
}

// Security Helper
function canControlRoom() {
    // If no room joined, false (though UI hidden)
    if (!currentRoomId || !currentUser) return false;
    // Authorized if Creator OR Shared Control is ON
    return currentUser.uid === currentRoomCreatorId || sharedControlState === true;
}

function togglePopover(popover) {
    if (!popover) return;
    if (popover.classList.contains('hidden')) {
        closeAllPopovers();
        popover.classList.remove('hidden');
    } else {
        popover.classList.add('hidden');
    }
}

function closeAllPopovers() {
    ['select', 'app'].forEach(key => {
        if (popovers[key].lang) popovers[key].lang.classList.add('hidden');
        if (popovers[key].profile) popovers[key].profile.classList.add('hidden');
        if (popovers[key].roomInfo) popovers[key].roomInfo.classList.add('hidden'); // Close room info
    });
}

// --- Event Listeners ---

// Avatar Click -> Profile Popover
// Event Delegation for Header Buttons (More Robust)
// Event Delegation for Header Buttons (More Robust)
document.addEventListener('click', (e) => {
    // Debug Click
    // console.log('Click target:', e.target);
    const btn = e.target.closest('button');
    if (!btn) {
        // Close popovers if clicking outside
        if (!e.target.closest('.popover-content') && !e.target.closest('[id*="popover"]')) {
            closeAllPopovers();
        }
        return;
    }

    // console.log('Button clicked:', btn.id);

    if (btn.id === 'flag-btn-select') {
        e.stopPropagation();
        togglePopover(popovers.select.lang);
    } else if (btn.id === 'avatar-btn-select') {
        e.stopPropagation();
        togglePopover(popovers.select.profile);
    } else if (btn.id === 'avatar-btn-app') {
        e.stopPropagation();
        togglePopover(popovers.app.profile);
    } else if (btn.id === 'room-info-btn') { // Room Info Button
        e.stopPropagation();
        togglePopover(popovers.app.roomInfo);
    }
});

// Language Options
// Language Options (Dropdown)
if (langSelectApp) {
    langSelectApp.addEventListener('change', (e) => {
        const lang = e.target.value;
        setLanguage(lang);
        // updateFlagIcon(lang); // Flag icon removed
        updatePageText();

        // Re-render dynamic components
        renderActiveRooms();
        if (typeof currentSongData !== 'undefined') updateNowPlaying(currentSongData);
        renderQueue();

        // closeAllPopovers(); // Keep popover open or close? Usually dropdowns are inside.
        // If we want to close popover after selection (UX choice), enable next line:
        // closeAllPopovers(); 
    });
}

// Legacy/Other Language Options (if any remain)
langOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = opt.dataset.lang;
        setLanguage(lang);
        updatePageText();
        renderActiveRooms();
        if (typeof currentSongData !== 'undefined') updateNowPlaying(currentSongData);
        renderQueue();
        closeAllPopovers();
    });
});

// Logout
['select', 'app'].forEach(key => {
    if (popovers[key].logout) {
        popovers[key].logout.addEventListener('click', () => {
            signOut(auth).then(() => window.location.reload());
        });
    }
});



onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;


        // Update generic avatars
        document.getElementById('user-avatar').src = user.photoURL || '';
        document.getElementById('app-user-avatar').src = user.photoURL || '';

        // Update both popovers
        ['select', 'app'].forEach(key => {
            if (popovers[key].avatar) popovers[key].avatar.src = user.photoURL || '';
            if (popovers[key].name) popovers[key].name.textContent = user.displayName || '';
            if (popovers[key].email) popovers[key].email.textContent = user.email || '';
        });

        // Check URL for room code
        const path = window.location.pathname.substring(1);
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromQuery = urlParams.get('room');
        const targetRoom = (path && path.length >= 4 && !path.startsWith('host')) ? path : roomFromQuery;

        if (targetRoom) joinRoom(targetRoom);
        else {
            const redirectParams = new URLSearchParams(window.location.search);
            if (redirectParams.get('redirect') === 'host') {
                window.location.href = '/host';
                return;
            }
            showRoomSelect();
        }

        // Update text after login success
        updatePageText();
        // updateFlagIcon(document.documentElement.lang); // Removed flag icon

        // Sync Dropdown Value
        if (langSelectApp) {
            langSelectApp.value = document.documentElement.lang || 'en';
        }



    } else {
        // Not logged in: Redirect to login
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?redirect=participant';
        }
    }
});

function showRoomSelect() {
    roomSelectScreen.classList.add('legacy-flex-center');
    roomSelectScreen.classList.remove('hidden');
    roomSelectScreen.style.display = 'flex';
    appScreen.classList.add('hidden');
    const errorScreen = document.getElementById('error-screen');
    if (errorScreen) errorScreen.classList.add('hidden');

    // Hide loading screen
    loadingScreen.classList.remove('legacy-flex-center');
    loadingScreen.classList.add('hidden');

    updatePageText(); // Ensure text is updated
    updateFlagIcon(document.documentElement.lang);
    loadActiveRooms();
}

document.getElementById('error-back-btn').addEventListener('click', () => {
    window.location.href = '/';
});



function loadActiveRooms() {
    const roomsRef = ref(db, 'rooms');
    onValue(roomsRef, (snapshot) => {
        activeRoomsSnapshot = snapshot;
        renderActiveRooms();
    });
}

function renderActiveRooms() {
    const list = document.getElementById('room-list');
    if (!list || !activeRoomsSnapshot) return;

    list.innerHTML = '';

    if (!activeRoomsSnapshot.exists()) {
        list.innerHTML = `<div class="text-center text-gray-500 py-8">${t('no_active_rooms')}</div>`;
        return;
    }

    let hasActiveRooms = false;
    activeRoomsSnapshot.forEach((child) => {
        const room = child.val();
        const info = room.info || {};

        // Multi-Host Support: Check if host_sessions has any active sessions
        // Only show rooms with ACTIVE host sessions - don't rely on legacy hostOnline flag
        // as it can become stale when hosts unexpectedly disconnect
        const hasSessions = room.host_sessions && Object.keys(room.host_sessions).length > 0;

        if (!hasSessions) return;
        if (info.isPrivate) return; // Hide private rooms

        hasActiveRooms = true;
        const el = document.createElement('div');
        el.className = 'bg-brand-gray p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition border border-white/5';
        el.innerHTML = `
                <div class="w-12 h-12 flex items-center justify-center text-white">
                    <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold truncate">${info.name || 'Unnamed Room'}</h3>
                    <p class="text-sm text-gray-400">${info.creatorName || 'Unknown'}</p>
                </div>
                <span class="text-brand-mint font-mono text-sm">${child.key}</span>
            `;
        el.addEventListener('click', () => joinRoom(child.key));
        list.appendChild(el);
    });

    if (!hasActiveRooms) {
        list.innerHTML = `<div class="text-center text-gray-500 py-8">${t('no_active_rooms')}</div>`;
    }
}


document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length >= 4) joinRoom(code);
});

document.getElementById('room-code-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('join-room-btn').click();
});

async function joinRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}/info`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
        const errorScreen = document.getElementById('error-screen');
        if (errorScreen) {
            errorScreen.classList.remove('hidden');
            errorScreen.classList.add('legacy-flex-center');

            // Sync toggle state with current theme
            const themeToggle = document.getElementById('error-theme-toggle');
            if (themeToggle) {
                // Determine initial theme (system or current class)
                const isDark = document.documentElement.classList.contains('dark') ||
                    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) document.documentElement.classList.add('dark');
                themeToggle.checked = isDark;
            }
        }
        loadingScreen.classList.add('hidden');
        loadingScreen.classList.remove('legacy-flex-center');
        // URL is preserved for refresh retry
        return;
    }

    const info = snapshot.val();

    if (!info.hostOnline) {
        document.getElementById('host-disconnected-modal').classList.remove('hidden');
        return;
    }

    currentRoomId = roomId;
    currentRoomCreatorId = info.createdBy;

    window.history.pushState({}, '', `/${roomId}`);

    loadingScreen.classList.add('hidden');
    loadingScreen.classList.remove('legacy-flex-center');
    roomSelectScreen.classList.remove('legacy-flex-center');
    roomSelectScreen.classList.add('hidden');
    roomSelectScreen.style.display = 'none';
    appScreen.classList.remove('hidden');

    document.getElementById('current-room-name').textContent = info.name || 'Room';
    document.getElementById('current-room-code').textContent = `#${roomId}`;

    // Update Host Badge
    if (hostBadge) {
        if (currentUser && currentUser.uid === currentRoomCreatorId) {
            hostBadge.classList.remove('hidden');
        } else {
            hostBadge.classList.add('hidden');
        }
    }

    // Helper to set creator name safely
    const setCreatorName = (name) => {
        const creatorEl = document.getElementById('current-room-creator');
        if (creatorEl) creatorEl.textContent = name || 'Unknown';
    };

    // Fetch and display Creator Info
    if (info.createdBy) {
        // First check if creator name is cached/stored in room info (optimization)
        if (info.creatorName) {
            setCreatorName(info.creatorName);
        } else {
            // Fallback to fetching user profile
            get(ref(db, `users/${info.createdBy}/detail`)).then(userSnap => {
                if (userSnap.exists()) {
                    setCreatorName(userSnap.val().displayName);
                } else {
                    setCreatorName('Unknown');
                }
            }).catch(() => setCreatorName('Unknown'));
        }
    } else {
        setCreatorName('Unknown');
    }

    const adminControls = document.getElementById('admin-controls');

    // Check sharedControl setting for showing admin controls
    const adminOverlay = document.getElementById('admin-overlay');

    const updateAdminControlsVisibility = (sharedControl) => {
        sharedControlState = sharedControl === true; // Sync global state

        // Check permission
        const isAuthorized = currentUser && (currentUser.uid === currentRoomCreatorId || sharedControl === true);

        if (isAuthorized) {
            // Authorized: Show controls, Hide overlay (just in case), Enable interaction
            adminControls.classList.remove('hidden', 'opacity-50', 'pointer-events-none');
            adminOverlay.classList.add('hidden');
        } else {
            // Unauthorized: Hide COMPLETELY (User Request)
            adminControls.classList.add('hidden');
        }
    };

    // Initial check
    get(ref(db, `rooms/${roomId}/info/sharedControl`)).then(snapshot => {
        updateAdminControlsVisibility(snapshot.val());
    });

    // Listen for changes
    onValue(ref(db, `rooms/${roomId}/info/sharedControl`), (snapshot) => {
        updateAdminControlsVisibility(snapshot.val());
        // Re-render queue to update drag handles based on new permission
        if (typeof renderQueue === 'function' && currentQueueSnapshot) {
            renderQueue();
        }
    });

    // Listen for shuffle state changes
    onValue(ref(db, `rooms/${roomId}/info/shuffle`), (snapshot) => {
        updateRemoteShuffleUI(snapshot.val() === true);
    });

    onValue(ref(db, `rooms/${roomId}/info/repeatMode`), (snapshot) => {
        updateRemoteRepeatUI(snapshot.val() || 'all');
    });

    initRoomListeners();
}

document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (currentRoomId) {
        off(ref(db, `rooms/${currentRoomId}/info/hostOnline`));
        off(ref(db, `rooms/${currentRoomId}/current_playback`));
        off(ref(db, `rooms/${currentRoomId}/queue`));
    }
    currentRoomId = null;
    window.history.pushState({}, '', '/');
    showRoomSelect();
});

function initRoomListeners() {
    // Multi-Host Support: Monitor active sessions with grace period for reconnection
    const sessionsRef = ref(db, `rooms/${currentRoomId}/host_sessions`);
    let disconnectTimeout = null;
    isHostMissing = false; // Reset on init
    const GRACE_PERIOD_MS = 0; // 0 seconds grace period for host reconnection

    const connectionIndicator = document.getElementById('connection-indicator');
    const appScreenBlock = document.getElementById('app-screen'); // Access main wrapper to blur content
    // We want to blur everything EXCEPT the header potentially, or just blur the body.
    // Let's create a specific blur target efficiently.
    // Actually, blurring the whole app-screen is fine if we show a toast.
    // Or just blur `playlist-container` and `controls`.

    const hostMissingOverlay = document.getElementById('host-missing-overlay');
    const playbackSection = document.getElementById('remote-playback-section');

    onValue(sessionsRef, (snapshot) => {
        // Connected if sessions exist
        const hasSessions = snapshot.exists() && snapshot.size > 0;

        if (hasSessions) {
            // Connected
            if (disconnectTimeout) {
                clearTimeout(disconnectTimeout);
                disconnectTimeout = null;
            }
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-red-500');
                connectionIndicator.classList.add('bg-green-500', 'animate-pulse');
            }
            // Remove Blur & Overlay on playback section only
            playbackSection?.classList.remove('blur-sm', 'opacity-50', 'pointer-events-none');
            hostMissingOverlay?.classList.add('hidden');
            isHostMissing = false;

        } else {
            // Disconnected
            if (!disconnectTimeout) {
                disconnectTimeout = setTimeout(() => {
                    // Double check if still disconnected
                    get(ref(db, `rooms/${currentRoomId}/host_sessions`)).then(snapshot => {
                        if (!snapshot.exists()) {
                            // TRULY DISCONNECTED
                            connectionIndicator.classList.remove('bg-green-500', 'animate-pulse');
                            connectionIndicator.classList.add('bg-red-500');

                            // Check if room still exists (Deleted vs Disconnected)
                            get(ref(db, `rooms/${currentRoomId}`)).then(roomSnap => {
                                if (!roomSnap.exists()) {
                                    // Room DELETED
                                    document.getElementById('host-disconnected-modal').classList.remove('hidden');
                                } else {
                                    // Room Exists, Host Temporarily Gone -> Deactivate PLAYBACK area
                                    // Use backdrop-blur on the overlay itself in HTML so text stays sharp
                                    playbackSection?.classList.add('pointer-events-none');
                                    hostMissingOverlay?.classList.remove('hidden');
                                    isHostMissing = true;

                                    // IMPROVEMENT: Pause the state in DB to avoid time jump
                                    if (currentSongData && currentSongData.status === 'playing' && currentSongData.startedAt) {
                                        const elapsedSec = (Date.now() - currentSongData.startedAt) / 1000;
                                        stopRemoteProgressTimer();
                                        update(ref(db, `rooms/${currentRoomId}/current_playback`), {
                                            status: 'paused',
                                            startedAt: null,
                                            currentTime: elapsedSec,
                                            interrupted: true // Mark as interruption for auto-resume
                                        });
                                    }
                                }
                            });
                        }
                        disconnectTimeout = null;
                    });
                }, GRACE_PERIOD_MS);
            }
        }
    });

    const playbackRef = ref(db, `rooms/${currentRoomId}/current_playback`);
    onValue(playbackRef, (snapshot) => {
        const data = snapshot.val();
        currentSongData = data;
        updateNowPlaying(data);
    });

    const queueRef = ref(db, `rooms/${currentRoomId}/queue`);
    onValue(queueRef, (snapshot) => {
        if (isDragging) return;
        currentQueueSnapshot = snapshot;
        renderQueue();
        // Update progress bar when queue loads (to get duration)
        if (currentSongData) {
            setRemoteProgressBar(currentSongData);
        }
    });
}

// Volume Control with fill update
const volumeFill = document.getElementById('remote-volume-fill');
// Listener consolidated below (line ~1216)

function updateRemoteMuteIcon(volume) {
    const volumeIcon = document.getElementById('volume-icon');
    const muteIcon = document.getElementById('mute-icon');
    if (parseInt(volume) > 0) {
        volumeIcon?.classList.remove('hidden');
        muteIcon?.classList.add('hidden');
    } else {
        volumeIcon?.classList.add('hidden');
        muteIcon?.classList.remove('hidden');
    }
}

// Mute Toggle
let previousRemoteVolume = 100;
const muteToggle = document.getElementById('mute-toggle');
const volumeIcon = document.getElementById('volume-icon');
const muteIcon = document.getElementById('mute-icon');

if (muteToggle) {
    muteToggle.addEventListener('click', () => {
        if (!canControlRoom()) return;
        if (!currentRoomId) return;
        const currentVolume = remoteVolume.value;
        if (parseInt(currentVolume) > 0) {
            // Mute: save current volume and set to 0
            previousRemoteVolume = currentVolume;
            remoteVolume.value = 0;
            if (volumeFill) volumeFill.style.width = '0%';
            if (currentRoomId) {
                update(ref(db, `rooms/${currentRoomId}/current_playback`), { volume: 0 });
            }
            volumeIcon?.classList.add('hidden');
            muteIcon?.classList.remove('hidden');
        } else {
            // Unmute: restore previous volume
            remoteVolume.value = previousRemoteVolume;
            if (volumeFill) volumeFill.style.width = `${previousRemoteVolume}%`;
            if (currentRoomId) {
                update(ref(db, `rooms/${currentRoomId}/current_playback`), { volume: parseInt(previousRemoteVolume) });
            }
            volumeIcon?.classList.remove('hidden');
            muteIcon?.classList.add('hidden');
        }
    });
}

// Shuffle Toggle
const shuffleToggle = document.getElementById('shuffle-toggle');
let shuffleEnabled = false;

const updateRemoteShuffleUI = (isOn) => {
    shuffleEnabled = isOn;
    if (shuffleToggle) {
        if (isOn) {
            shuffleToggle.classList.remove('text-gray-500');
            shuffleToggle.classList.add('text-brand-mint');
        } else {
            shuffleToggle.classList.add('text-gray-500');
            shuffleToggle.classList.remove('text-brand-mint');
        }
    }
};

// Toggle Shuffle - Just toggle state in DB
const toggleRemoteShuffle = async () => {
    if (!currentRoomId || !canControlRoom()) return;

    const shuffleRef = ref(db, `rooms/${currentRoomId}/info/shuffle`);
    const shuffleSnap = await get(shuffleRef);
    const newShuffleState = shuffleSnap.val() !== true;

    await set(shuffleRef, newShuffleState);
    updateRemoteShuffleUI(newShuffleState);
    updateLastController();
};

if (shuffleToggle) {
    shuffleToggle.addEventListener('click', toggleRemoteShuffle);
}

// Repeat Logic
const repeatToggle = document.getElementById('repeat-toggle');
const repeatIconAll = document.getElementById('repeat-icon-all');
const repeatIconOne = document.getElementById('repeat-icon-one');
let repeatMode = 'all';

const updateRemoteRepeatUI = (mode) => {
    repeatMode = mode;
    if (repeatToggle) {
        if (mode === 'one') {
            repeatToggle.classList.remove('text-gray-500');
            repeatToggle.classList.add('text-brand-mint');
            repeatIconAll?.classList.add('hidden');
            repeatIconOne?.classList.remove('hidden');
        } else {
            repeatToggle.classList.add('text-gray-500');
            repeatToggle.classList.remove('text-brand-mint');
            repeatIconAll?.classList.remove('hidden');
            repeatIconOne?.classList.add('hidden');
        }
    }
};

const toggleRemoteRepeat = async () => {
    if (!currentRoomId || !canControlRoom()) return;
    const repeatRef = ref(db, `rooms/${currentRoomId}/info/repeatMode`);
    const snap = await get(repeatRef);
    const intent = snap.val() === 'one' ? 'all' : 'one';
    await set(repeatRef, intent);
    updateRemoteRepeatUI(intent);
    updateLastController();
};

if (repeatToggle) {
    repeatToggle.addEventListener('click', toggleRemoteRepeat);
}

function updateNowPlaying(data) {
    const titleEl = document.getElementById('np-title');
    const requesterEl = document.getElementById('np-requester');
    const artEl = document.getElementById('np-art');
    const placeholderEl = document.getElementById('np-placeholder');
    const likeCountEl = document.getElementById('like-count');
    const likeIconEl = document.getElementById('like-icon');
    const indicatorEl = document.getElementById('playing-indicator');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const remotePlayIcon = document.getElementById('remote-play-icon');
    const remotePauseIcon = document.getElementById('remote-pause-icon');

    if (data && data.videoId) {
        titleEl.textContent = decodeHtmlEntities(data.title) || 'Unknown';
        requesterEl.textContent = `${decodeHtmlEntities(data.artist) || 'Unknown'} | ${decodeHtmlEntities(data.requester) || 'Anonymous'}`;

        if (data.thumbnail) {
            artEl.src = data.thumbnail;
            artEl.classList.remove('hidden');
            if (placeholderEl) placeholderEl.classList.add('hidden');
        } else {
            artEl.classList.add('hidden');
            if (placeholderEl) placeholderEl.classList.remove('hidden');
        }

        // Get like count and state from centralized paths
        if (data.videoId) {
            // 1. Reactive total count for all users
            if (data.videoId !== currentVideoId) {
                // Cleanup old listener
                if (currentVideoId) {
                    off(ref(db, `songs/${currentVideoId}/totalLikes`));
                }
                currentVideoId = data.videoId;

                // Start new reactive listener
                onValue(ref(db, `songs/${currentVideoId}/totalLikes`), (snapshot) => {
                    likeCountEl.textContent = snapshot.val() || 0;
                });

                // 2. One-time check for user's specific vote status on song change
                if (currentUser) {
                    get(ref(db, `votes/${data.videoId}/${currentUser.uid}`)).then(snapshot => {
                        hasLikedCurrent = snapshot.exists();
                        if (hasLikedCurrent) {
                            likeIconEl.innerHTML = `<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
                        } else {
                            likeIconEl.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
                        }
                    });
                }
            }
        } else {
            // Idle state: cleanup
            if (currentVideoId) {
                off(ref(db, `songs/${currentVideoId}/totalLikes`));
                currentVideoId = null;
            }
            likeCountEl.textContent = 0;
            hasLikedCurrent = false;
            likeIconEl.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
        }

        currentStatus = data.status;
        if (data.status === 'playing' || data.status === 'paused') {
            indicatorEl.classList.remove('hidden');
            const bars = indicatorEl.querySelectorAll('.equalizer-bar');
            bars.forEach(bar => {
                if (data.status === 'paused') bar.classList.add('paused');
                else bar.classList.remove('paused');
            });

            if (data.status === 'playing') {
                if (remotePlayIcon) remotePlayIcon.classList.add('hidden');
                if (remotePauseIcon) remotePauseIcon.classList.remove('hidden');
            } else {
                if (remotePlayIcon) remotePlayIcon.classList.remove('hidden');
                if (remotePauseIcon) remotePauseIcon.classList.add('hidden');
            }
        } else {
            indicatorEl.classList.add('hidden');
            if (remotePlayIcon) remotePlayIcon.classList.remove('hidden');
            if (remotePauseIcon) remotePauseIcon.classList.add('hidden');
        }

        if (data.volume !== undefined) {
            remoteVolume.value = data.volume;
            if (volumeFill) volumeFill.style.width = `${data.volume}%`;
            updateRemoteMuteIcon(data.volume);
        }

        // Update queue visuals without re-rendering
        updateQueueVisuals(data);

        // Update progress bar
        setRemoteProgressBar(data);

    } else {
        titleEl.textContent = t('waiting_requests');
        requesterEl.textContent = t('add_song_msg');
        artEl.classList.add('hidden');
        if (placeholderEl) placeholderEl.classList.remove('hidden');
        likeCountEl.textContent = '0';
        likeIconEl.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
        indicatorEl.classList.add('hidden');
        hasLikedCurrent = false;
        currentStatus = 'idle';
        if (remotePlayIcon) remotePlayIcon.classList.remove('hidden');
        if (remotePauseIcon) remotePauseIcon.classList.add('hidden');

        updateQueueVisuals(null);
        setRemoteProgressBar(null);
    }

    // Moved equalizer update logic to updateQueueVisuals function
}


// Toggle equalizer paused class without re-creating DOM
// Helper to update queue active state and equalizer without re-rendering
function updateQueueVisuals(data) {
    const listItems = document.querySelectorAll('.song-item');
    const isPaused = data && data.status !== 'playing';

    listItems.forEach(el => {
        const isPlaying = data && el.dataset.key === data.queueKey;
        const thumbContainer = el.querySelector('.thumb-container');

        if (isPlaying) {
            el.classList.remove('bg-[#1E1E1E]', 'border-white/5');
            el.classList.add('border-brand-mint/50');
            el.style.backgroundColor = '#222F2F'; // Solid opaque blended color
            el.querySelector('.title-text')?.classList.add('text-brand-mint');

            // Add equalizer overlay if not present
            if (thumbContainer && !thumbContainer.querySelector('.equalizer-overlay')) {
                const overlay = document.createElement('div');
                overlay.className = 'equalizer-overlay absolute inset-0 bg-black/60 flex items-center justify-center';
                overlay.innerHTML = `<div class="equalizer-bar small ${isPaused ? 'paused' : ''}"><span></span><span></span><span></span></div>`;
                thumbContainer.appendChild(overlay);
            } else if (thumbContainer) {
                // Update paused class on existing equalizer
                const eqBar = thumbContainer.querySelector('.equalizer-bar');
                if (eqBar) {
                    if (isPaused) eqBar.classList.add('paused');
                    else eqBar.classList.remove('paused');
                }
            }
        } else {
            // Reset to default
            el.classList.remove('border-brand-mint/50');
            el.classList.add('bg-[#1E1E1E]', 'border-white/5');
            el.style.backgroundColor = '';

            el.querySelector('.title-text')?.classList.remove('text-brand-mint');
            el.querySelector('.equalizer-overlay')?.remove();
        }
    });
}

// ========== PROGRESS BAR LOGIC ==========
const remoteProgressFill = document.getElementById('remote-progress-fill');
const remoteProgressHandle = document.getElementById('remote-progress-handle');
const remoteProgressContainer = document.getElementById('remote-progress-container');
const remoteCurrentTime = document.getElementById('remote-current-time');
const remoteTotalTime = document.getElementById('remote-total-time');
let remoteProgressInterval = null;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateRemoteProgress() {
    if (!currentSongData || !currentSongData.duration || currentSongData.status !== 'playing' || isRemoteScrubbing) return;
    const elapsed = Math.floor((Date.now() - currentSongData.startedAt) / 1000);
    const duration = currentSongData.duration;
    const percent = Math.min((elapsed / duration) * 100, 100);

    if (remoteProgressFill) remoteProgressFill.style.width = `${percent}%`;
    if (remoteProgressHandle) remoteProgressHandle.style.left = `${percent}%`;
    if (remoteCurrentTime) remoteCurrentTime.textContent = formatTime(elapsed);
}

function startRemoteProgressTimer() {
    stopRemoteProgressTimer();
    updateRemoteProgress();
    remoteProgressInterval = setInterval(updateRemoteProgress, 1000);
}

function stopRemoteProgressTimer() {
    if (remoteProgressInterval) {
        clearInterval(remoteProgressInterval);
        remoteProgressInterval = null;
    }
}

function setRemoteProgressBar(data) {
    // Look up duration from queue if not in playback data
    let duration = data?.duration || 0;
    if (!duration && data?.queueKey && currentQueueSnapshot?.exists()) {
        const queueData = currentQueueSnapshot.val();
        const queueItem = queueData[data.queueKey];
        if (queueItem) duration = queueItem.duration || 0;
    }

    // Store duration in currentSongData for progress timer
    if (currentSongData && duration) {
        currentSongData.duration = duration;
    }

    if (!data || !duration) {
        if (remoteTotalTime) remoteTotalTime.textContent = '0:00';
        if (remoteCurrentTime) remoteCurrentTime.textContent = '0:00';
        if (remoteProgressFill) remoteProgressFill.style.width = '0%';
        if (remoteProgressHandle) remoteProgressHandle.style.left = '0%';
        stopRemoteProgressTimer();
        return;
    }

    if (remoteTotalTime) remoteTotalTime.textContent = formatTime(duration);

    // Calculate and show current position immediately (for both playing and paused)
    if (!isRemoteScrubbing) {
        let elapsed = 0;
        if (data.startedAt) {
            elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
        } else if (data.currentTime !== undefined) {
            elapsed = Math.floor(data.currentTime);
        }

        const clampedElapsed = Math.min(elapsed, duration);
        const percent = Math.min((clampedElapsed / duration) * 100, 100);
        if (remoteProgressFill) remoteProgressFill.style.width = `${percent}%`;
        if (remoteProgressHandle) remoteProgressHandle.style.left = `${percent}%`;
        if (remoteCurrentTime) remoteCurrentTime.textContent = formatTime(clampedElapsed);
    }

    if (data.status === 'playing') {
        startRemoteProgressTimer();
    } else {
        stopRemoteProgressTimer();
    }
}

// Seek & Scrubbing Handling
let isRemoteScrubbing = false;

const getRemoteSeekPercent = (e) => {
    let clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    else if (e.changedTouches && e.changedTouches.length > 0) clientX = e.changedTouches[0].clientX;
    else clientX = e.clientX;

    const rect = remoteProgressContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
};

const handleRemoteScrubVisuals = (e) => {
    const percent = getRemoteSeekPercent(e);
    const duration = currentSongData?.duration || 0;
    const seekTime = Math.floor(percent * duration);

    if (remoteProgressFill) {
        remoteProgressFill.style.setProperty('transition', 'none', 'important');
        remoteProgressFill.style.width = `${percent * 100}%`;
    }
    if (remoteProgressHandle) {
        remoteProgressHandle.style.setProperty('transition', 'none', 'important');
        remoteProgressHandle.style.left = `${percent * 100}%`;
    }
    if (remoteCurrentTime) remoteCurrentTime.textContent = formatTime(seekTime);
};

if (remoteProgressContainer) {
    const onScrubStart = (e) => {
        // Only handle left click or touch
        if (e.type === 'mousedown' && e.button !== 0) return;

        if (!canControlRoom()) return;
        isRemoteScrubbing = true;

        // Prevent scrolling
        if (e.cancelable) e.preventDefault();

        handleRemoteScrubVisuals(e);
    };

    const onScrubMove = (e) => {
        if (!isRemoteScrubbing) return;

        // Prevent scrolling while scrubbing
        if (e.cancelable) e.preventDefault();

        handleRemoteScrubVisuals(e);
    };

    const onScrubEnd = async (e) => {
        if (!isRemoteScrubbing && e.type !== 'click') return;
        const wasScrubbing = isRemoteScrubbing;
        isRemoteScrubbing = false;

        if (!canControlRoom()) return;
        if (!currentSongData || !currentSongData.duration || !currentRoomId) return;

        const percent = getRemoteSeekPercent(e);
        const seekTime = Math.floor(percent * currentSongData.duration);

        // Update startedAt to sync all hosts
        if (currentSongData.status === 'paused') {
            await update(ref(db, `rooms/${currentRoomId}/current_playback`), {
                currentTime: seekTime,
                startedAt: null
            });
        } else {
            await update(ref(db, `rooms/${currentRoomId}/current_playback`), {
                startedAt: Date.now() - (seekTime * 1000)
            });
        }

        // Restore transitions
        setTimeout(() => {
            if (remoteProgressFill) remoteProgressFill.style.removeProperty('transition');
            if (remoteProgressHandle) remoteProgressHandle.style.removeProperty('transition');
        }, 100);

        updateLastController();
    };

    remoteProgressContainer.addEventListener('click', onScrubEnd);
    remoteProgressContainer.addEventListener('mousedown', onScrubStart);
    remoteProgressContainer.addEventListener('touchstart', onScrubStart, { passive: false });

    window.addEventListener('mousemove', onScrubMove);
    window.addEventListener('mouseup', onScrubEnd);
    window.addEventListener('touchmove', onScrubMove, { passive: false });
    window.addEventListener('touchend', onScrubEnd, { passive: false });
}

function renderQueue() {
    const list = document.getElementById('remote-queue-list');
    const countEl = document.getElementById('remote-queue-count');
    // list.innerHTML = ''; // Removed duplicate

    // list.innerHTML = ''; // Removed to enable DOM diffing

    // Removed separate "Now Playing" card as requested.
    // It will be highlighted in the main list below.

    if (!currentQueueSnapshot || !currentQueueSnapshot.exists()) {
        if (!currentSongData || !currentSongData.videoId) {
            list.innerHTML += `<div class="text-center text-gray-500 py-8 text-sm">${t('no_songs_queue')}</div>`;
        }
        if (countEl) countEl.textContent = t('songs_count', { count: 0 });
        return;
    }

    const songs = currentQueueSnapshot.val();
    const sortedSongs = Object.keys(songs).map(key => ({
        key, ...songs[key]
    })).sort((a, b) => (a.order !== undefined ? a.order : a.createdAt) - (b.order !== undefined ? b.order : b.createdAt));

    if (countEl) countEl.textContent = t('songs_count', { count: sortedSongs.length });

    // Remove any non-keyed elements (like "No songs" message)
    Array.from(list.children).forEach(child => {
        if (!child.dataset.key) child.remove();
    });

    // Helper to format duration
    const formatDuration = (seconds) => {
        if (!seconds) return '';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Helper to check control permission dynamically
    // Note: canControlRoom is defined in outer scope but we use it here
    const canDrag = canControlRoom();

    // Create item helper
    const createSongItem = (song) => {
        const wrapper = document.createElement('div');
        wrapper.className = `relative overflow-hidden rounded-xl mb-2 queue-item-wrapper ${canDrag ? 'sortable-item' : ''}`;
        wrapper.dataset.key = song.key;

        // Dynamic check for delete permission
        const checkCanDelete = () => (currentUser && song.requesterId === currentUser.uid) || canControlRoom();
        const canDelete = checkCanDelete();

        // Delete background
        const deleteBg = document.createElement('div');
        deleteBg.className = `delete-bg absolute inset-0 bg-red-500 flex items-center justify-end pr-4 rounded-xl ${canDelete ? '' : 'hidden'}`;
        deleteBg.innerHTML = `
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
        `;
        wrapper.appendChild(deleteBg);

        const el = document.createElement('div');
        el.className = 'song-item p-3 rounded-xl flex items-center gap-2 transition-transform border relative';
        el.dataset.key = song.key;
        el.style.touchAction = 'pan-y';
        wrapper.appendChild(el);

        // Events
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;
        const deleteThreshold = -100;

        const handleStart = (clientX, target) => {
            if (!checkCanDelete()) return;
            if (target && target.closest('.drag-handle')) return;
            // Don't swipe if dragging sortable? handled by sortable?
            // "isDragging" global var from remote.js
            if (typeof isDragging !== 'undefined' && isDragging) return;

            startX = clientX;
            isSwiping = true;
            el.style.transition = 'none';
        };

        const handleMove = (clientX) => {
            if (!isSwiping) return;
            currentX = clientX - startX;
            if (currentX < 0) {
                el.style.transform = `translateX(${Math.max(currentX, -150)}px)`;
            }
        };

        const handleEnd = () => {
            if (!isSwiping) return;
            isSwiping = false;
            el.style.transition = 'transform 0.3s ease';

            if (currentX < deleteThreshold) {
                el.style.transform = 'translateX(-100%)';
                setTimeout(() => {
                    // Logic to delete song
                    const songData = song; // closure capture correct? Yes, createSongItem called per song
                    // But we should use current song data? Key is stable.
                    const songRef = ref(db, `rooms/${currentRoomId}/queue/${song.key}`);
                    remove(songRef);
                    // Toast
                    toast.show(t('song_deleted', { title: song.title }), {
                        duration: 5000,
                        undoText: t('undo'),
                        onUndo: async () => {
                            await update(ref(db, `rooms/${currentRoomId}/queue`), {
                                [song.key]: songData // Note: songData might be stale if updated? Usually static once added.
                            });
                        }
                    });
                }, 200);
            } else {
                el.style.transform = 'translateX(0)';
            }
            currentX = 0;
        };

        el.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX, e.target), { passive: true });
        el.addEventListener('touchmove', (e) => handleMove(e.touches[0].clientX), { passive: true });
        el.addEventListener('touchend', handleEnd);

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            handleStart(e.clientX, e.target);
            const onMouseMove = (me) => handleMove(me.clientX);
            const onMouseUp = () => {
                handleEnd();
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Double click / Double tap to play
        let lastClickTime = 0;
        el.addEventListener('click', () => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastClickTime;
            if (timeDiff < 300 && timeDiff > 0) {
                if (canControlRoom() && !isHostMissing) {
                    playSongByKey(song.key);
                }
                lastClickTime = 0;
            } else {
                lastClickTime = currentTime;
            }
        });

        return wrapper;
    };

    // Map existing
    const existingElements = new Map();
    Array.from(list.children).forEach(child => {
        if (child.dataset.key) existingElements.set(child.dataset.key, child);
    });

    const currentKeys = new Set();

    sortedSongs.forEach((song) => {
        currentKeys.add(song.key);
        const isActive = currentSongData && currentSongData.queueKey === song.key;
        const isMySong = currentUser && song.requesterId === currentUser.uid;

        let wrapper = existingElements.get(song.key);
        if (!wrapper) {
            wrapper = createSongItem(song);
        }

        // Apply Updates
        const el = wrapper.querySelector('.song-item');
        const deleteBg = wrapper.querySelector('.delete-bg');

        // 1. Sortable Class
        // In remote, depends on global state mostly
        if (canDrag) wrapper.classList.add('sortable-item');
        else wrapper.classList.remove('sortable-item');
        wrapper.classList.add('queue-item-wrapper'); // Ensure class

        // 2. Styling
        el.classList.remove('bg-[#1E1E1E]', 'bg-brand-mint/10', 'border-white/5', 'border-brand-mint/50', 'cursor-grab', 'active:cursor-grabbing');
        if (isActive) {
            el.classList.add('border-brand-mint/50');
            el.style.backgroundColor = '#222F2F'; // Solid opaque blended color
            el.querySelector('.title-text')?.classList.add('text-brand-mint');
        } else {
            el.classList.add('bg-[#1E1E1E]', 'border-white/5');
            el.style.backgroundColor = '';
            el.querySelector('.title-text')?.classList.remove('text-brand-mint');
        }
        if (canDrag) el.classList.add('cursor-grab', 'active:cursor-grabbing');

        // 3. Delete BG Visibility
        const canDelete = (currentUser && song.requesterId === currentUser.uid) || canControlRoom();
        if (canDelete) deleteBg.classList.remove('hidden');
        else deleteBg.classList.add('hidden');

        // 4. Content
        // We replace innerHTML to ensure consistency
        const isPaused = currentStatus !== 'playing';

        el.innerHTML = `
            ${canDrag ? '<div class="w-6 text-gray-500 text-center drag-handle cursor-grab">≡</div>' : ''}
            <div class="thumb-container w-12 h-12 rounded-lg overflow-hidden relative flex-shrink-0">
                <img src="${song.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="w-full h-full object-cover">
                 ${isActive ? `
                <div class="equalizer-overlay absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div class="equalizer-bar small ${isPaused ? 'paused' : ''}"><span></span><span></span><span></span></div>
                </div>` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="title-text text-sm font-bold truncate ${isActive ? 'text-brand-mint' : ''}">${decodeHtmlEntities(song.title)}</h4>
                <p class="text-xs text-gray-400 truncate">${decodeHtmlEntities(song.artist) || 'Unknown'} | <span class="${isMySong ? 'text-brand-mint' : ''}">${decodeHtmlEntities(song.requester) || 'Anonymous'}</span></p>
            </div>
            <div class="flex-shrink-0 text-right">
                ${song.duration ? `<span class="duration-text text-xs text-gray-500">${formatDuration(song.duration)}</span>` : ''}
            </div>
        `;

        wrapper.appendChild(el);
        list.appendChild(wrapper);
    });

    // Cleanup
    existingElements.forEach((wrapper, key) => {
        if (!currentKeys.has(key)) wrapper.remove();
    });

    // Sortable
    if (canDrag) {
        if (!sortableInstance) {
            sortableInstance = new Sortable(list, {
                animation: 150,
                handle: '.drag-handle',
                draggable: '.sortable-item',
                onStart: function () {
                    isDragging = true;
                },
                onEnd: function (evt) {
                    const items = list.querySelectorAll('.sortable-item');
                    const updates = {};
                    items.forEach((item, index) => {
                        const key = item.dataset.key;
                        updates[`rooms/${currentRoomId}/queue/${key}/order`] = index;
                    });
                    update(ref(db), updates).then(() => {
                        setTimeout(() => { isDragging = false; }, 500);
                    });
                }
            });
        }
        sortableInstance.option('disabled', false);
    } else {
        if (sortableInstance) sortableInstance.option('disabled', true);
    }

    // Apply paused state after DOM is rendered and animation starts
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (currentSongData) {
                // Ensure status is current
                updateQueueVisuals({ ...currentSongData, status: currentStatus });
            }
        });
    });
}

// Keep old function for reference but override logic above
function updateQueueList(snapshot) {
    // This is now handled by renderQueue called in listeners
}

// Search & Add Logic
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const remoteClearSearchBtn = document.getElementById('remote-clear-search-btn');
let searchTimeout;

if (remoteClearSearchBtn) {
    const checkInput = () => {
        if (searchInput.value.trim().length > 0) remoteClearSearchBtn.classList.remove('hidden');
        else remoteClearSearchBtn.classList.add('hidden');
    };
    searchInput.addEventListener('input', checkInput);
    remoteClearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        remoteClearSearchBtn.classList.add('hidden');
    });
}

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const input = e.target.value.trim();
    if (input.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    const videoId = extractYouTubeId(input);
    if (videoId) fetchVideoInfo(videoId);
    // else searchTimeout = setTimeout(() => performSearch(input), 500); // Removed debounce search
});

const executeRemoteSearch = (query) => {
    if (query.length >= 2) performSearch(query);
};

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeRemoteSearch(e.target.value.trim());
});

// Header Search Overlay Logic
const headerSearchTrigger = document.getElementById('header-search-trigger');
const headerSearchOverlay = document.getElementById('header-search-overlay');
const headerSearchBack = document.getElementById('header-search-back');

if (headerSearchTrigger && headerSearchOverlay) {
    headerSearchTrigger.addEventListener('click', () => {
        headerSearchOverlay.classList.remove('hidden');
        searchInput.focus();
    });
}

const closeSearchOverlay = () => {
    if (headerSearchOverlay) headerSearchOverlay.classList.add('hidden');
    // Hide results when closing overlay to reset state
    searchResults.classList.add('hidden');
    searchInput.value = '';
};

if (headerSearchBack) {
    headerSearchBack.addEventListener('click', closeSearchOverlay);
}

// Search Submit Icon Listener
const searchSubmitBtn = document.getElementById('search-submit-btn');
if (searchSubmitBtn) {
    searchSubmitBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) executeRemoteSearch(query);
    });
}

// Click outside to close overlay (if clicking body content)
document.addEventListener('click', (e) => {
    const isClickInHeader = (headerSearchOverlay && headerSearchOverlay.contains(e.target)) ||
        (headerSearchTrigger && headerSearchTrigger.contains(e.target));
    const isClickInResults = searchResults.contains(e.target);

    // If click is NOT in Header Overlay AND NOT in Results -> Close
    if (!isClickInHeader && !isClickInResults) {
        if (headerSearchOverlay && !headerSearchOverlay.classList.contains('hidden')) {
            closeSearchOverlay();
        }
        searchResults.classList.add('hidden');
    }
});

// ... (Search helper functions: extractYouTubeId, fetchVideoInfo, performSearch, etc. same as before)
// Re-implementing simplified versions to fit context and avoid missing code errors.

function extractYouTubeId(input) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function fetchVideoInfo(videoId) {
    displaySearchResults([{
        id: videoId,
        title: `Video ${videoId}`,
        artist: 'YouTube',
        thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    }]);
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (response.ok) {
            const data = await response.json();
            displaySearchResults([{
                id: videoId,
                title: data.title,
                artist: data.author_name,
                thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
            }]);
        }
    } catch (e) { }
}

async function performSearch(query) {
    searchResults.classList.remove('hidden');
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            const results = data.items.map(item => ({
                id: item.id.videoId,
                title: decodeHtmlEntities(item.snippet.title),
                artist: decodeHtmlEntities(item.snippet.channelTitle),
                thumb: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url
            }));
            displaySearchResults(results);
            return;
        }
    } catch (e) { }

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const response = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { signal: AbortSignal.timeout(3000) });
            if (response.ok) {
                const data = await response.json();
                const results = data.map(item => ({
                    id: item.videoId,
                    title: item.title,
                    artist: item.author,
                    thumb: item.videoThumbnails ? item.videoThumbnails[1].url : ''
                }));
                displaySearchResults(results);
                return;
            }
        } catch (e) { }
    }
}

function displaySearchResults(results) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
        searchResults.classList.add('hidden');
        return;
    }

    searchResults.classList.remove('hidden');
    results.forEach(video => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 p-3 hover:bg-white/10 transition cursor-pointer border-b border-white/5 last:border-0';
        div.innerHTML = `
            <div class="w-12 h-12 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                <img src="${video.thumb}" class="w-full h-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-sm truncate text-white">${video.title}</h4>
                <p class="text-xs text-gray-400 truncate">${video.artist}</p>
            </div>
        `;

        // Click entire row to add
        div.addEventListener('click', () => {
            addToQueue({
                id: video.id,
                title: video.title,
                artist: video.artist,
                thumb: video.thumb, // Fixed key name for addToQueue
                duration: 0
            });
            // Close search UI immediately
            searchResults.classList.add('hidden');
            if (headerSearchOverlay) headerSearchOverlay.classList.add('hidden');
            searchInput.value = '';
        });

        searchResults.appendChild(div);
    });
}

async function addToQueue(video) {
    if (!currentRoomId || !currentUser) return;
    searchResults.classList.add('hidden');
    searchResults.innerHTML = ''; // Fix: Clear previous results
    searchInput.value = '';
    if (remoteClearSearchBtn) remoteClearSearchBtn.classList.add('hidden');

    try {
        // Fetch video details including duration
        let duration = 0;
        try {
            const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${video.id}&key=${YOUTUBE_API_KEY}`);
            const detailData = await detailRes.json();
            if (detailData.items && detailData.items[0]) {
                const isoDuration = detailData.items[0].contentDetails.duration;
                const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                if (match) {
                    const hours = parseInt(match[1] || 0);
                    const mins = parseInt(match[2] || 0);
                    const secs = parseInt(match[3] || 0);
                    duration = hours * 3600 + mins * 60 + secs;
                }
            }
        } catch (e) {
            console.warn('Could not fetch video duration', e);
        }

        const queueRef = ref(db, `rooms/${currentRoomId}/queue`);
        await push(queueRef, {
            videoId: video.id,
            title: video.title,
            artist: video.artist || '',
            thumbnail: video.thumb,
            requester: currentUser.displayName || 'Anonymous',
            requesterId: currentUser.uid,
            duration: duration,
            createdAt: serverTimestamp(),
            order: Date.now(),
        });
        toast.show(t('added_to_queue'));
    } catch (e) {
        toast.show(t('failed_add'), { isError: true });
    }
}

// Toast is now imported from utils.js


// Play song by queue key (for double-click to play)
// Send command to host to play the song
const playSongByKey = async (key) => {
    if (!currentRoomId || !canControlRoom() || isHostMissing) return;

    // Send playByKey command to host (same pattern as next/previous)
    await set(ref(db, `rooms/${currentRoomId}/commands`), {
        action: 'playByKey',
        key: key,
        timestamp: serverTimestamp()
    });
    updateLastController();
};

// Admin Controls (Already in HTML, adding listeners if they exist)
// Helper to update last controller info
const updateLastController = () => {
    if (currentRoomId && currentUser) {
        update(ref(db, `rooms/${currentRoomId}`), {
            lastController: {
                name: currentUser.displayName || 'Anonymous',
                timestamp: serverTimestamp()
            }
        });
    }
};

// Helper to send commands to the host
function sendCommand(action) {
    if (!currentRoomId || isHostMissing) return;
    update(ref(db, `rooms/${currentRoomId}/commands`), { action: action, timestamp: serverTimestamp() });
    updateLastController();
}

const skipBtn = document.getElementById('skip-btn');
if (skipBtn) {
    skipBtn.addEventListener('click', () => {
        if (!canControlRoom()) return;
        sendCommand('next');
    });
}

const playPauseBtn = document.getElementById('play-pause-btn');
if (playPauseBtn) {
    playPauseBtn.addEventListener('click', async () => {
        if (!canControlRoom()) return;
        if (!currentRoomId) return;
        const newStatus = currentStatus === 'playing' ? 'paused' : 'playing';
        update(ref(db, `rooms/${currentRoomId}/current_playback`), { status: newStatus });
        updateLastController();
    });
}

const prevBtn = document.getElementById('prev-btn');
if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        if (!canControlRoom()) return;
        sendCommand('previous');
    });
}

document.getElementById('like-btn').addEventListener('click', async () => {
    if (!currentRoomId || !currentUser) return;

    const playbackRef = ref(db, `rooms/${currentRoomId}/current_playback`);
    const snapshot = await get(playbackRef);
    const data = snapshot.val();

    if (!data || !data.videoId) return;

    const videoId = data.videoId;
    const songRef = ref(db, `songs/${videoId}`);
    const voteRef = ref(db, `votes/${videoId}/${currentUser.uid}`);

    const voteSnap = await get(voteRef);
    const hasLiked = voteSnap.exists();

    if (hasLiked) {
        // UNLIKE logic
        // 1. Update permanent songs count (atomic decrement)
        await update(songRef, { totalLikes: increment(-1) });

        // 2. Remove vote record
        await remove(voteRef);

        hasLikedCurrent = false;
        document.getElementById('like-icon').innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
        return;
    }

    // LIKE logic
    // 1. Update permanent songs collection (metadata + atomic increment)
    const songUpdates = {
        videoId: videoId,
        title: data.title || 'Unknown',
        artist: data.artist || 'Unknown',
        thumbnail: data.thumbnail || '',
        totalLikes: increment(1)
    };
    await update(songRef, songUpdates);

    // 2. Add vote record
    await set(voteRef, true);

    hasLikedCurrent = true;
    document.getElementById('like-icon').innerHTML = `<svg class="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
});
document.getElementById('return-home-btn').addEventListener('click', () => {
    window.location.href = '/';
});
document.getElementById('reconnect-btn').addEventListener('click', () => {
    window.location.reload();
});

// Volume Control
const remoteVolumeFn = (e) => {
    if (!canControlRoom()) {
        // Revert slider visually if not authorized
        onValue(ref(db, `rooms/${currentRoomId}/current_playback/volume`), (snapshot) => {
            const val = snapshot.val() || 100;
            e.target.value = val;
            if (volumeFill) volumeFill.style.width = `${val}%`;
        }, { onlyOnce: true });
        return;
    }

    if (currentRoomId) {
        const value = parseInt(e.target.value);
        update(ref(db, `rooms/${currentRoomId}/current_playback`), { volume: value });
        updateLastController();
        if (volumeFill) volumeFill.style.width = `${value}%`;
        updateRemoteMuteIcon(value);
    }
};
const volSlider = document.getElementById('remote-volume');
if (volSlider) {
    volSlider.removeEventListener('input', remoteVolumeFn); // Prevent duplicates
    volSlider.addEventListener('input', remoteVolumeFn);
}
// Version checking logic
function checkVersion() {
    const versionRef = ref(db, 'app_settings/version');
    onValue(versionRef, (snapshot) => {
        const latestVersion = snapshot.val();
        if (latestVersion && isNewerVersion(latestVersion, APP_VERSION)) {
            showUpdateBanner(latestVersion);
        }
    });
}

function isNewerVersion(latest, current) {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (latestParts[i] > currentParts[i]) return true;
        if (latestParts[i] < currentParts[i]) return false;
    }
    return false;
}

function showUpdateBanner(newVersion) {
    if (document.getElementById('update-notification-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'update-notification-banner';
    banner.className = 'update-banner bottom';
    banner.innerHTML = `
        <div class="flex-1 text-sm text-gray-200">
            <span class="font-bold text-brand-mint">${t('update_available')}</span> 
            <span class="text-xs opacity-70 block">${t('update_desc', { version: newVersion })}</span>
        </div>
        <button id="refresh-app-btn" class="bg-brand-mint hover:bg-brand-mint/80 text-black px-4 py-1.5 rounded-full text-xs font-bold transition-all">
            ${t('refresh')}
        </button>
    `;
    document.body.appendChild(banner);

    document.getElementById('refresh-app-btn').addEventListener('click', () => {
        window.location.reload();
    });
}

// Call version check on init
checkVersion();

// Error Page Theme Toggle Initialization
(function initErrorThemeToggle() {
    // Detect system theme and apply initially if not already set by logic
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark && !document.documentElement.classList.contains('light')) {
        document.documentElement.classList.add('dark');
    }

    const toggle = document.getElementById('error-theme-toggle');
    if (toggle) {
        // Initial sync
        toggle.checked = document.documentElement.classList.contains('dark');

        toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
            } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light'); // Explicit label for manual light mode
            }
        });
    }
})();


