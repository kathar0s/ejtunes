import { db, auth, provider, generateRoomCode } from './firebase-config';
import { ref, onValue, set, push, remove, query, orderByChild, equalTo, limitToFirst, get, serverTimestamp, update, onDisconnect, child, increment, runTransaction, off } from "firebase/database";
// ... imports ...

// ... imports ...
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { initLanguage, setLanguage, t, updatePageText } from './i18n';
import { themeManager } from './theme-manager';
import { toast, decodeHtmlEntities, getHighResThumbnail } from './utils';
import Sortable from 'sortablejs';
import QRCode from 'qrcode';
import { APP_VERSION } from './version';

// Global State
let player;
let isPlayerReady = false;
let currentVideoId = null;
let roomId = null;
let roomName = null;
let currentUser = null;
let progressInterval;
let currentSongData = null; // Store current song for list display
let currentQueueSnapshot = null; // Store queue snapshot for re-rendering
let sortableInstance = null;
let isDragging = false; // Drag lock flag
let isPlayIntended = false; // Track if we explicitly meant to play (to prevent auto-resume on seek)
let isShuffle = false;
let repeatMode = 'all'; // 'all' or 'one'
let mySessionId = null;
let activeSessions = [];
let isSharedControl = false; // Default to false until loaded
let currentSessionRef = null;

// Kiosk Mode State
let isKioskEnabled = false;
let isKioskActive = false;
let wakeLock = null;
let kioskExitTapCount = 0;
let kioskExitTapTimer = null;

function isAmILeader() {
    if (!mySessionId || activeSessions.length === 0) return false;
    return activeSessions[0].key === mySessionId;
}

function updateLeaderUI() {
    const iconContainer = document.querySelector('#room-info-trigger div');
    if (!iconContainer) return;

    // Find text node to replace "DJ" with "👑"
    let textNode = null;
    iconContainer.childNodes.forEach(node => {
        if (node.nodeType === 3 && node.textContent.trim().length > 0) {
            textNode = node;
        }
    });

    const deleteBtn = document.getElementById('delete-room-btn');
    if (isAmILeader()) {
        if (textNode) textNode.textContent = '👑';
        iconContainer.classList.remove('bg-brand-mint', 'text-black', 'border-white');
        // Gold border with dark background for high contrast with the emoji
        iconContainer.classList.add('bg-gray-900', 'text-white', 'border-2', 'border-yellow-400', 'shadow-lg', 'shadow-yellow-400/20');
        iconContainer.style.fontSize = '1.25rem'; // Slightly larger emoji

        // Update Delete Button for Leader
        if (deleteBtn) {
            deleteBtn.textContent = '방 삭제'; // Delete Room
            deleteBtn.classList.remove('bg-gray-600', 'hover:bg-gray-700');
            deleteBtn.classList.add('bg-red-600/90', 'hover:bg-red-700');
        }
    } else {
        if (textNode) textNode.textContent = 'DJ';
        iconContainer.classList.add('bg-brand-mint', 'text-black');
        iconContainer.classList.remove('bg-gray-900', 'text-white', 'border-2', 'border-yellow-400', 'shadow-lg', 'shadow-yellow-400/20');
        if (iconContainer.classList.contains('border-white')) iconContainer.classList.remove('border-2');
        iconContainer.style.removeProperty('font-size');

        // Update Leave Button for Follower
        // Update Leave Button for Follower
        if (deleteBtn) {
            deleteBtn.textContent = '방 나가기'; // Leave Room
            // Style: Bordered, cleaner look
            deleteBtn.classList.remove('bg-red-600/90', 'hover:bg-red-700', 'text-white');
            deleteBtn.classList.add('bg-transparent', 'border', 'border-gray-500', 'text-gray-300', 'hover:bg-white/10', 'hover:text-white', 'hover:border-gray-400');
        }
    }
    updateControlState();

    // Restrict Settings for Followers (Only Leader can change Shared Control / Private Room)
    const settingsToggles = [
        document.getElementById('shared-control-toggle'),
        document.getElementById('private-room-toggle')
    ];

    settingsToggles.forEach(toggle => {
        if (!toggle) return;
        if (isAmILeader()) {
            toggle.style.opacity = '1';
            toggle.style.pointerEvents = 'auto';
            toggle.style.cursor = 'pointer';
        } else {
            toggle.style.opacity = '0.5';
            toggle.style.pointerEvents = 'none';
            toggle.style.cursor = 'not-allowed';
        }
    });
}

function updateControlState() {
    const amLeader = isAmILeader();
    const canControl = amLeader || isSharedControl;

    // Elements to disable/dim (buttons only, not inputs)
    const buttons = [
        miniPlayBtn, miniNextBtn, miniPrevBtn,
        miniShuffleBtn, miniRepeatBtn,
        fullPlayBtn, fullNextBtn, fullPrevBtn,
        fullShuffleBtn, fullRepeatBtn,
        // Mute buttons only (not volume sliders)
        document.getElementById('host-mute-toggle'),
        document.getElementById('full-mute-toggle'),
        // Seek Bars (Containers)
        progressBarMini ? progressBarMini.parentElement : null,
        fullProgressBar ? fullProgressBar.parentElement.parentElement : null
    ];

    buttons.forEach(btn => {
        if (!btn) return;
        if (canControl) {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
        } else {
            btn.style.opacity = '0.3';
            btn.style.pointerEvents = 'none';
            btn.style.cursor = 'not-allowed';
        }
    });

    // Volume sliders: control via container wrapper (not the input itself to preserve opacity:0)
    const volumeContainers = [
        hostVolume ? hostVolume.parentElement : null,
        fullVolume ? fullVolume.parentElement : null,
        miniVolume ? miniVolume.parentElement : null
    ];
    volumeContainers.forEach(container => {
        if (!container) return;
        if (canControl) {
            container.style.opacity = '1';
            container.style.pointerEvents = 'auto';
        } else {
            container.style.opacity = '0.3';
            container.style.pointerEvents = 'none';
        }
    });

    // Disable Sortable (Drag & Drop)
    if (sortableInstance) {
        sortableInstance.option('disabled', !canControl);
        const handles = document.querySelectorAll('.drag-handle');
        handles.forEach(h => {
            h.style.display = canControl ? 'block' : 'none';
            h.style.cursor = canControl ? 'grab' : 'default';
        });
    }
}

const YOUTUBE_API_KEY = 'AIzaSyBuN6OIAjU8C2q37vIhIZkY_l8hg3R_z9g';
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.snopyta.org',
    'https://yewtu.be'
];

// Elements
const setupScreen = document.getElementById('setup-screen');
const playerScreen = document.getElementById('player-screen');
const fullPlayer = document.getElementById('full-player');
const roomNameInput = document.getElementById('room-name-input');
const roomInvalidError = document.getElementById('room-invalid-error');
const roomNameError = document.getElementById('room-name-error');
const createRoomBtn = document.getElementById('create-room-btn');
const roomExistsModal = document.getElementById('room-exists-modal');
const roomExistsMsg = document.getElementById('room-exists-msg');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalReuseBtn = document.getElementById('modal-reuse-btn');

const roomNameEl = document.getElementById('room-name');

// Mini Player Elements
const miniArt = document.getElementById('mini-art');
const miniTitle = document.getElementById('mini-title');
const miniArtist = document.getElementById('mini-artist');
const miniPlayBtn = document.getElementById('mini-play-btn');
const miniPlayIcon = document.getElementById('mini-play-icon');
const miniPauseIcon = document.getElementById('mini-pause-icon');
const miniNextBtn = document.getElementById('mini-next-btn');
const miniPrevBtn = document.getElementById('mini-prev-btn');
const miniShuffleBtn = document.getElementById('mini-shuffle-btn');
const miniRepeatBtn = document.getElementById('mini-repeat-btn');
const miniRepeatIconAll = document.getElementById('mini-repeat-icon-all');
const miniRepeatIconOne = document.getElementById('mini-repeat-icon-one');
const expandPlayerBtn = document.getElementById('expand-player-btn');
const progressBarMini = document.getElementById('progress-bar-mini');

// Full Player Elements
const bgArt = document.getElementById('bg-art');
const fullArt = document.getElementById('full-art');
const lpContainer = document.getElementById('lp-art-container');
const ytPlayerWrapper = document.getElementById('yt-player-wrapper');
const fullTitle = document.getElementById('full-title');
const fullArtist = document.getElementById('full-artist');
const fullRequester = document.getElementById('full-requester');
const fullLikes = document.getElementById('full-likes');
const fullLikeBtn = document.getElementById('full-like-btn');
const fullPlayBtn = document.getElementById('full-play-btn');
const fullPlayIcon = document.getElementById('full-play-icon');
const fullPauseIcon = document.getElementById('full-pause-icon');
const fullNextBtn = document.getElementById('full-next-btn');
const fullPrevBtn = document.getElementById('full-prev-btn');
const fullShuffleBtn = document.getElementById('full-shuffle-btn');
const fullRepeatBtn = document.getElementById('full-repeat-btn');
const fullRepeatIconAll = document.getElementById('full-repeat-icon-all');
const fullRepeatIconOne = document.getElementById('full-repeat-icon-one');
const fullVolume = document.getElementById('full-volume');
const hostVolume = document.getElementById('host-volume');
const hostMuteToggle = document.getElementById('host-mute-toggle');
const hostVolumeIcon = document.getElementById('host-volume-icon');
const hostMuteIcon = document.getElementById('host-mute-icon');
const fullMuteToggle = document.getElementById('full-mute-toggle');
const miniVolume = document.getElementById('mini-volume');
const miniMuteToggle = document.getElementById('mini-mute-toggle');
const collapsePlayerBtn = document.getElementById('collapse-player-btn');
const fullProgressBar = document.getElementById('full-progress-bar');
const fullProgressHandle = document.getElementById('full-progress-handle');
const miniProgressHandle = document.getElementById('mini-progress-handle');
const progCurrent = document.getElementById('prog-current');
const progDuration = document.getElementById('prog-duration');

// Search & Settings
const searchOverlay = document.getElementById('search-overlay');
const settingsOverlay = document.getElementById('settings-overlay');
const hostSearchBtn = document.getElementById('host-search-btn');
const hostSearchInput = document.getElementById('host-search-input');
const hostSearchInputTop = document.getElementById('host-search-input-top');
const hostSearchSubmitTop = document.getElementById('host-search-submit-top');
const hostSearchSubmit = document.getElementById('host-search-submit');
const hostSearchResults = document.getElementById('host-search-results');
const hostSearchResultsTop = document.getElementById('host-search-results-top');
const flagBtnHost = document.getElementById('flag-btn-host');
const hostLangPopover = document.getElementById('host-lang-popover');
const hostLangOptions = document.querySelectorAll('.host-lang-option');
const clearSearchBtn = document.getElementById('clear-search-btn');
const clearSearchBtnTop = document.getElementById('clear-search-btn-top');
const langToggleSetup = document.getElementById('lang-toggle-setup');
const roomInfoTrigger = document.getElementById('room-info-trigger');
const roomInfoPopover = document.getElementById('room-info-popover');

const sharedControlToggle = document.getElementById('shared-control-toggle');
const privateRoomToggle = document.getElementById('private-room-toggle');
const lastControllerInfo = document.getElementById('last-controller-info');
const lastControllerName = document.getElementById('last-controller-name');
// Immediate UI State Check to prevent FOUC (Flash of Unstyled Content / Setup Screen)
(function () {
    const pathSegments = window.location.pathname.split('/');
    const hostIndex = pathSegments.indexOf('host');
    if (hostIndex !== -1 && pathSegments.length > hostIndex + 1) {
        const potentialId = pathSegments[hostIndex + 1];
        if (potentialId && potentialId.length >= 4) {
            // If URL looks like a room URL, hide setup screen immediately
            const setup = document.getElementById('setup-screen');
            if (setup) {
                setup.classList.add('hidden');
                setup.style.display = 'none';
            }
        }
    }
})();

// Restore kiosk mode from localStorage or URL parameter
if (new URLSearchParams(window.location.search).get('mode') === 'kiosk') {
    isKioskEnabled = true;
    localStorage.setItem('ejtunes_kiosk', 'true');
} else if (localStorage.getItem('ejtunes_kiosk') === 'true') {
    isKioskEnabled = true;
}

// Handle browser back/forward button - reload to reset room state cleanly
window.addEventListener('popstate', () => {
    window.location.reload();
});

// Close search overlay when clicking outside
document.addEventListener('click', (e) => {
    if (!searchOverlay || searchOverlay.classList.contains('hidden')) return;

    // Do not close if clicking inside search overlay or on the toggle button
    if (searchOverlay.contains(e.target) || hostSearchBtn.contains(e.target)) return;

    searchOverlay.classList.add('hidden');
});

// Init Language
const updateLangDisplay = () => {
    const isKo = document.documentElement.lang === 'ko';
    langToggleSetup.innerHTML = isKo ? '<span class="text-xl">🇰🇷</span> 한국어' : '<span class="text-xl">🇺🇸</span> English';
    if (flagBtnHost) {
        flagBtnHost.textContent = isKo ? '🇰🇷' : '🇺🇸';
    }
};

console.log('[Host] Script initialized');
initLanguage();
updatePageText();
updateLangDisplay();

// Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;

        // Bind Theme Toggles
        themeManager.bindToggle('setup-theme-toggle');
        themeManager.bindToggle('error-theme-toggle');
        themeManager.bindToggle('host-theme-toggle'); // Added for settings popover

        // Check for Room ID in URL path: /host/ROOM_ID
        const pathSegments = window.location.pathname.split('/');
        const hostIndex = pathSegments.indexOf('host');

        // Ensure there is a segment after 'host'
        if (hostIndex !== -1 && pathSegments.length > hostIndex + 1) {
            const potentialId = pathSegments[hostIndex + 1];

            // Basic validation (e.g., alphanumeric, length check usually 6)
            if (potentialId && potentialId.length >= 4) {
                const urlRoomId = potentialId.toUpperCase();

                // Try to restore session
                const snapshot = await get(ref(db, `rooms/${urlRoomId}/info`));
                if (snapshot.exists()) {
                    const info = snapshot.val();
                    roomName = info.name;
                    roomId = urlRoomId;
                    console.log(`Restoring room from URL: ${roomId}`);
                    setupRoom(roomId, true); // Treat as reuse/restore
                    // Loading screen hidden inside setupRoom on success
                } else {
                    console.warn(`Room ID from URL not found: ${urlRoomId}`);
                    // Restoration failed: Show error screen
                    const errorScreen = document.getElementById('error-screen');
                    if (errorScreen) {
                        errorScreen.classList.add('legacy-flex-center');
                        errorScreen.classList.remove('hidden');

                        // Sync toggle state with current theme
                        // Handled by content bind above
                    }
                    const setup = document.getElementById('setup-screen');
                    if (setup) setup.classList.add('hidden');
                    const loading = document.getElementById('loading-screen');
                    if (loading) loading.classList.add('hidden');
                    // URL is preserved for refresh retry
                }
            } else {
                // Invalid ID: Show setup screen
                const setup = document.getElementById('setup-screen');
                if (setup) {
                    setup.classList.add('legacy-flex-center');
                    setup.classList.remove('hidden');
                    setup.style.removeProperty('display');
                }
                const loading = document.getElementById('loading-screen');
                if (loading) loading.classList.add('hidden');
            }
        } else {
            // Authenticated but no room ID (root /host): Show setup screen
            const setup = document.getElementById('setup-screen');
            if (setup) {
                setup.classList.add('legacy-flex-center');
                setup.classList.remove('hidden');
                setup.style.removeProperty('display');
            }
            const loading = document.getElementById('loading-screen');
            if (loading) loading.classList.add('hidden');
        }
    } else {
        // Not logged in: Redirect to login
        window.location.href = '/login?redirect=host';
    }
});

document.getElementById('error-back-btn').addEventListener('click', () => {
    window.location.href = '/host';
});




// Setup Events
langToggleSetup.addEventListener('click', () => {
    const newLang = document.documentElement.lang === 'ko' ? 'en' : 'ko';
    setLanguage(newLang);
    updateLangDisplay();
});

const hideErrors = () => {
    const roomNameError = document.getElementById('room-name-error');
    if (roomNameError) roomNameError.classList.add('hidden');
    if (roomInvalidError) roomInvalidError.classList.add('hidden');
    if (roomNameInput) {
        roomNameInput.classList.remove('border-red-500', 'focus:border-red-500');
    }
};

roomNameInput.addEventListener('input', hideErrors);

createRoomBtn.addEventListener('click', async () => {
    console.log('[Create Room] Clicked');
    const roomNameError = document.getElementById('room-name-error');
    const showError = (msg) => {
        console.warn('[Create Room] Error:', msg);
        roomNameError.textContent = msg;
        roomNameError.classList.remove('hidden');
    };
    const hideError = () => {
        hideErrors();
    };

    if (!currentUser) {
        try {
            const result = await signInWithPopup(auth, provider);
            currentUser = result.user;
        } catch (e) {
            showError(t('login_required'));
            return;
        }
    }

    try {
        let name = roomNameInput.value.trim();
        if (!name) {
            showError(t('room_name_required') || 'Please enter a room name');
            return;
        }

        hideError();

        // Check duplicates or ID lookup
        let existingId = null;

        if (name.startsWith('#')) {
            // ID Lookup
            const targetId = name.substring(1);
            const snapshot = await get(ref(db, `rooms/${targetId}`));
            if (snapshot.exists() && snapshot.val().info) {
                existingId = targetId;
                name = snapshot.val().info.name; // Use actual room name for display
            } else {
                showError('Room not found (방을 찾을 수 없습니다)');
                return;
            }
        } else {
            // Name Lookup
            const roomsRef = ref(db, 'rooms');
            const snapshot = await get(roomsRef);

            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    const info = child.val().info;
                    if (info && info.name === name) {
                        existingId = child.key;
                    }
                });
            }
        }

        if (existingId) {
            // Show Custom Modal
            roomExistsMsg.textContent = t('room_exists_msg', { name: name });
            roomExistsModal.classList.remove('hidden');

            // Handle Reuse
            const reuseHandler = async () => {
                try {
                    roomName = name;
                    roomId = existingId;
                    await setupRoom(roomId, true); // true = reuse
                    roomExistsModal.classList.add('hidden');
                    cleanup();
                } catch (e) {
                    console.error("Reuse Room Failed:", e);
                    toast.show("방 연동 실패: " + e.message, { isError: true });
                }
            };

            // Handle Cancel (Change Name)
            const cancelHandler = () => {
                roomExistsModal.classList.add('hidden');
                roomNameError.textContent = t('name_taken_error');
                roomNameError.classList.remove('hidden');
                roomNameInput.classList.add('border-red-500', 'focus:border-red-500');
                roomNameInput.focus();
                cleanup();
            };

            const cleanup = () => {
                modalReuseBtn.removeEventListener('click', reuseHandler);
                modalCancelBtn.removeEventListener('click', cancelHandler);
            };

            modalReuseBtn.addEventListener('click', reuseHandler);
            modalCancelBtn.addEventListener('click', cancelHandler);

        } else {
            // Create New
            roomName = name;
            roomId = generateRoomCode();
            await setupRoom(roomId, false); // false = new
        }
    } catch (e) {
        console.error("Create Room Process Failed:", e);
        toast.show("방 생성 과정 중 오류 발생: " + e.message, { isError: true });
    }
});

// Helper to init room (refactored from original listener)
async function setupRoom(id, isReuse) {
    // Update URL to persist Room ID
    const currentPath = window.location.pathname;
    // Avoid duplicate history entries if already on correct path
    if (!currentPath.includes(id)) {
        window.history.pushState({}, '', `/host/${id}`);
    }

    let roomUpdates = {};

    if (isReuse) {
        // Only update hostOnline, preserve other settings like sharedControl
        roomUpdates[`rooms/${id}/info/hostOnline`] = true;
        roomUpdates[`rooms/${id}/info/name`] = roomName;
        // Reuse shouldn't change isPrivate unless we explicitly want to, preserving existing
    } else {
        // New Room - Initialize
        roomUpdates[`rooms/${id}/info`] = {
            name: roomName,
            createdAt: serverTimestamp(),
            hostOnline: true,
            sharedControl: false,
            isPrivate: false,
            createdBy: currentUser.uid,
            creatorName: currentUser.displayName
        };
        roomUpdates[`rooms/${id}/current_playback`] = {
            status: 'idle',
            title: t('waiting_requests'),
            artist: t('add_song_msg'),
            volume: 50,
            shuffle: false
        };
        roomUpdates[`rooms/${id}/queue`] = {};
    }

    roomUpdates[`rooms/${id}/commands`] = null;

    try {
        if (Object.keys(roomUpdates).length > 0) {
            await update(ref(db), roomUpdates);
        }
    } catch (e) {
        console.error("setupRoom DB update failed:", e);
        throw e; // Re-throw to be caught by caller
    }

    // Register Multi-Tab Host Session with Reconnection Support
    // This handles iOS/iPad background suspension where WebSocket disconnects
    const sessionsRef = ref(db, `rooms/${id}/host_sessions`);

    const registerSession = async () => {
        // Create new session reference on each connection
        currentSessionRef = push(sessionsRef);
        mySessionId = currentSessionRef.key; // Store my session ID
        const sessionData = {
            connectedAt: serverTimestamp(),
            userAgent: navigator.userAgent
        };
        await set(currentSessionRef, sessionData);
        onDisconnect(currentSessionRef).remove();
        console.log('[Host Session] Registered:', mySessionId);
    };

    // Monitor connection state and re-register session on reconnect
    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, async (snapshot) => {
        if (snapshot.val() === true) {
            // Connected (or reconnected)
            await registerSession();
        } else {
            // Disconnected - session will be cleaned up by onDisconnect handler
            console.log('[Host Session] Disconnected, waiting for reconnect...');
        }
    });

    // Ensure hostOnline is true (but don't set false on disconnect here, rely on session check)
    // We update it above in roomUpdates, so it's fine.
    // Important: REMOVE the old onDisconnect that kills the room when one tab closes.
    // const hostOnlineRef = ref(db, `rooms/${id}/info/hostOnline`);
    // onDisconnect(hostOnlineRef).set(false);

    setupScreen.classList.remove('legacy-flex-center');
    setupScreen.classList.add('hidden');
    setupScreen.style.display = 'none';

    const loading = document.getElementById('loading-screen');
    if (loading) {
        loading.classList.remove('legacy-flex-center');
        loading.classList.add('hidden');
    }

    playerScreen.classList.remove('hidden');
    playerScreen.style.display = 'flex';

    document.getElementById('room-name').textContent = roomName;
    document.getElementById('room-code').textContent = `#${id}`;

    // Listen for host count changes
    // Listen for host count changes and Leader Election
    const hostCountBadge = document.getElementById('host-count-badge');
    onValue(sessionsRef, (snapshot) => {
        if (snapshot.exists()) {
            const sessions = snapshot.val();
            // Convert to array and sort by connectedAt
            activeSessions = Object.keys(sessions).map(key => ({
                key,
                ...sessions[key]
            })).sort((a, b) => (a.connectedAt || 0) - (b.connectedAt || 0));

            const count = activeSessions.length;
            if (count >= 2) {
                hostCountBadge.textContent = count;
                hostCountBadge.classList.remove('hidden');
            } else {
                hostCountBadge.classList.add('hidden');
            }
        } else {
            activeSessions = [];
            hostCountBadge.classList.add('hidden');
        }
        updateLeaderUI();
    });

    initYouTubePlayer();
    initRoomSettings();
    updateLangDisplay(); // Ensure flag icon is synced
}

// Clear error on input
roomNameInput.addEventListener('input', () => {
    roomNameError.classList.add('hidden');
    roomNameInput.classList.remove('border-red-500', 'focus:border-red-500');
});



// Player Setup
function initYouTubePlayer() {
    if (window.YT && window.YT.Player) {
        createPlayer();
    } else {
        window.onYouTubeIframeAPIReady = createPlayer;
    }
}

function createPlayer() {
    player = new YT.Player('player', {
        height: '200',
        width: '356',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
            'playsinline': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'rel': 0, 'autoplay': 1, 'enablejsapi': 1,
            'modestbranding': 1, 'iv_load_policy': 3
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}


function onPlayerReady() {
    isPlayerReady = true;

    if (ytPlayerWrapper) {
        ytPlayerWrapper.style.display = '';
        // Ensure we start in main video mode if full player is hidden
        if (document.getElementById('full-player').classList.contains('hidden')) {
            switchYTPlayerMode('main');
        }
    }
    initListeners();
    startProgressLoop();
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        if (!isAmILeader()) {
            console.log("Not leader, ignoring auto-next.");
            return;
        }
        resetProgressBar();
        // Race Condition Safeguard: Only skip if we are playing the current song in DB
        get(ref(db, `rooms/${roomId}/current_playback`)).then(snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.queueKey === currentSongData.queueKey) {
                    if (repeatMode === 'one' && currentSongData.queueKey) {
                        playSongByKey(currentSongData.queueKey);
                    } else {
                        playNextSong();
                    }
                } else {
                    console.log("Skipping next song trigger: DB song does not match local.");
                }
            } else {
                playNextSong();
            }
        });
    }
    if (event.data === YT.PlayerState.PLAYING) {
        // Issue 6: Prevent unintended resume if seeking while paused
        if (currentSongData && currentSongData.status === 'paused' && !isPlayIntended) {
            player.pauseVideo();
            return;
        }
        isPlayIntended = false; // Reset flag after legitimate play start
        setVisuals(true);

        // Prevent animation from 0% on initial load/seek
        if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
            const cur = player.getCurrentTime();
            const dur = player.getDuration();
            if (dur > 0) {
                const pct = (cur / dur) * 100;
                progressBarMini.style.transition = 'none';
                fullProgressBar.style.transition = 'none';
                progressBarMini.style.width = `${pct}%`;
                fullProgressBar.style.width = `${pct}%`;

                // Force reflow
                void progressBarMini.offsetWidth;

                // Restore transition shortly after
                setTimeout(() => {
                    progressBarMini.style.removeProperty('transition');
                    fullProgressBar.style.removeProperty('transition');
                }, 500);
            }
        }

        startProgressLoop(); // Start loop *after* setting initial state

        // Sync: Calculate startedAt based on current time (Resume handling)
        const currentTime = player.getCurrentTime();
        const now = serverTimestamp();
        // We can't use serverTimestamp locally for calculation, so we push to DB.
        // But to calc startedAt locally we need an estimate. 
        // Better: Just push update. 
        // Note: serverTimestamp() is a placeholder, can't subtract from it in JS.
        // We rely on the fact that when we resume, we want 'startedAt' to be 'Now - elapsed'.
        // Since we can't do math on serverTimestamp() in JS easily before pushing,
        // we will use offset locally if needed, but for DB we might need a cloud function or just trust local time?
        // Actually, for sync, using Date.now() + serverOffset is best, but here simplicity:
        // Let's just update status. The 'startedAt' is critical for NEW starts. 
        // For Resumes, we need to update startedAt effectively.
        // We will assume Resume happens fast.

        // However, standard technique: startedAt = Now - elapsed.
        // We will update DB with estimated startedAt based on client clock (approx is fine)
        // OR better: Update status='playing' AND elapsed=currentTime.
        // Then listeners calc: if playing, seekTo = elapsed + (Now - updatedAt).
        // This requires 'updatedAt'.

        // WAIT. User approved plan: "startedAt = Now - CurrentElapsed".
        // Real implementation: We can't subtract from serverTimestamp placeholder.
        // We have to use: startedAt = ServerValue.TIMESTAMP. But we want (Now - Elapsed).
        // We can't send "ServerValue.TIMESTAMP - 5000".

        // So we MUST use a slightly different approach for Resume:
        // Update `startedAt` using `Date.now() - elapsed * 1000` (Client time).
        // This relies on host clock correctness.
        // Most hosts are close enough.
        // Let's try this:
        update(ref(db, `rooms/${roomId}/current_playback`), {
            status: 'playing',
            startedAt: Date.now() - (currentTime * 1000)
        });

        // Ensure high-res art is used if available (refresh on play)
        if (currentVideoId) {
            const hiRes = getHighResThumbnail(currentVideoId);
            if (fullArt.src !== hiRes) {
                fullArt.src = hiRes;
                bgArt.src = hiRes;
            }
        }
    }
    if (event.data === YT.PlayerState.PAUSED) {
        setVisuals(false);
        update(ref(db, `rooms/${roomId}/current_playback`), {
            status: 'paused',
            currentTime: player.getCurrentTime()
        });
    }
}

function onPlayerError() { playNextSong(); }

function resetProgressBar() {
    progressBarMini.style.transition = 'none';
    fullProgressBar.style.transition = 'none';
    progressBarMini.style.width = '0%';
    fullProgressBar.style.width = '0%';
    if (fullProgressHandle) fullProgressHandle.style.left = '0%';
    if (miniProgressHandle) miniProgressHandle.style.left = '0%';
    progCurrent.textContent = '0:00';

    requestAnimationFrame(() => {
        setTimeout(() => {
            progressBarMini.style.transition = '';
            fullProgressBar.style.transition = '';
            if (fullProgressHandle) fullProgressHandle.style.transition = '';
            if (miniProgressHandle) miniProgressHandle.style.transition = '';
        }, 100);
    });
}

function startProgressLoop() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        // Optimization: Skip UI updates if tab is hidden to save battery
        if (document.hidden) return;

        if (!player || !isPlayerReady || typeof player.getPlayerState !== 'function') return;
        if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;

        if (typeof player.getCurrentTime !== 'function' || typeof player.getDuration !== 'function') return;
        const current = player.getCurrentTime();
        const duration = player.getDuration();

        if (duration > 0) {
            const percent = (current / duration) * 100;

            // Only update visuals if user is NOT scrubbing
            if (!isScrubbing) {
                progressBarMini.style.width = `${percent}%`;
                fullProgressBar.style.width = `${percent}%`;
                if (fullProgressHandle) fullProgressHandle.style.left = `${percent}%`;
                if (miniProgressHandle) miniProgressHandle.style.left = `${percent}%`;
                if (progCurrent) {
                    progCurrent.textContent = formatTime(current);
                }

                // Kiosk progress bar + time
                if (isKioskActive) {
                    const kioskProgressBar = document.getElementById('kiosk-progress-bar');
                    if (kioskProgressBar) kioskProgressBar.style.width = `${percent}%`;
                    const kioskTimeCurrent = document.getElementById('kiosk-time-current');
                    const kioskTimeDuration = document.getElementById('kiosk-time-duration');
                    if (kioskTimeCurrent) kioskTimeCurrent.textContent = formatTime(current);
                    if (kioskTimeDuration) kioskTimeDuration.textContent = formatTime(duration);
                }
            }

            // Duration should always be valid
            progDuration.textContent = formatTime(duration);
        }
    }, 500);
}

// Battery Optimization: Handle visibility change to pause/resume visuals
document.addEventListener('visibilitychange', () => {
    if (!player || typeof player.getPlayerState !== 'function') return;

    const isPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
    const isFullVisible = fullPlayer && !fullPlayer.classList.contains('hidden');

    if (document.hidden) {
        // Tab is backgrounded: Stop heavy visuals
        console.log('[Battery] Background detected. Pausing non-essential animations.');
        if (lpContainer) lpContainer.style.animationPlayState = 'paused';
        if (ytPlayerWrapper) ytPlayerWrapper.style.animationPlayState = 'paused';
    } else {
        // Tab is foregrounded: Resume if playing
        console.log('[Battery] Foreground detected. Resuming visuals.');
        if (isPlaying && isFullVisible) {
            setVisuals(true);
        }
    }
});

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Seek Handling with Scrubbing Support
let activeScrubElement = null;
let isScrubbing = false;

const onSeekStart = (e) => {
    // Only handle left click or touch
    if (e.type === 'mousedown' && e.button !== 0) return;

    console.log('[Host] Seek Start:', e.type);

    isScrubbing = true;
    activeScrubElement = e.currentTarget;

    // Prevent scrolling and default behavior
    if (e.cancelable) e.preventDefault();

    handleScrubVisuals(e);
};

const onSeekMove = (e) => {
    if (!isScrubbing) return;
    handleScrubVisuals(e);
};

const onSeekEnd = (e) => {
    if (!isScrubbing && e.type !== 'click') return;

    const wasScrubbing = isScrubbing;
    isScrubbing = false;
    const targetElement = activeScrubElement;
    activeScrubElement = null;

    // Calculate final time and seek
    const percent = getSeekPercent(e, targetElement);
    if (player && isPlayerReady && player.getDuration) {
        const duration = player.getDuration();
        if (duration > 0) {
            // Clamp to avoid instant ending if user seeks to 100%
            let seekTime = duration * percent;
            if (seekTime >= duration - 1) seekTime = duration - 1;

            player.seekTo(seekTime);

            // Disable transition for instant update
            progressBarMini.style.setProperty('transition', 'none', 'important');
            fullProgressBar.style.setProperty('transition', 'none', 'important');
            if (fullProgressHandle) fullProgressHandle.style.setProperty('transition', 'none', 'important');

            // Update progress bar immediately
            const finalPercent = (seekTime / duration) * 100;
            progressBarMini.style.width = `${finalPercent}%`;
            fullProgressBar.style.width = `${finalPercent}%`;
            if (fullProgressHandle) fullProgressHandle.style.left = `${finalPercent}%`;
            progCurrent.textContent = formatTime(seekTime);

            // Restore transition after a short delay
            setTimeout(() => {
                progressBarMini.style.removeProperty('transition');
                fullProgressBar.style.removeProperty('transition');
                if (fullProgressHandle) fullProgressHandle.style.removeProperty('transition');
            }, 100);

            // Explicitly update StartedAt to prevent sync drift jump-back
            if (currentSongData.status === 'paused') {
                update(ref(db, `rooms/${roomId}/current_playback`), {
                    currentTime: seekTime,
                    startedAt: null
                });
                player.seekTo(seekTime, true);
            } else {
                isPlayIntended = true;
                update(ref(db, `rooms/${roomId}/current_playback`), {
                    status: 'playing',
                    startedAt: Date.now() - (seekTime * 1000),
                    currentTime: null
                });
            }
        }
    }
};

// Helper for calculating percentage
const getSeekPercent = (e, overrideElement = null) => {
    let clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    else if (e.changedTouches && e.changedTouches.length > 0) clientX = e.changedTouches[0].clientX;
    else clientX = e.clientX;

    const element = overrideElement || activeScrubElement || e.currentTarget;
    if (!element || !element.getBoundingClientRect) return 0;

    const rect = element.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;
    return Math.max(0, Math.min(1, x / width));
};

const handleScrubVisuals = (e) => {
    const percent = getSeekPercent(e);
    progressBarMini.style.setProperty('transition', 'none', 'important');
    fullProgressBar.style.setProperty('transition', 'none', 'important');
    if (fullProgressHandle) fullProgressHandle.style.setProperty('transition', 'none', 'important');
    if (miniProgressHandle) miniProgressHandle.style.setProperty('transition', 'none', 'important');

    progressBarMini.style.width = `${percent * 100}%`;
    fullProgressBar.style.width = `${percent * 100}%`;
    if (fullProgressHandle) fullProgressHandle.style.left = `${percent * 100}%`;
    if (miniProgressHandle) miniProgressHandle.style.left = `${percent * 100}%`;

    if (player && player.getDuration) {
        const duration = player.getDuration();
        progCurrent.textContent = formatTime(duration * percent);
    }

};


// Bind Events
const bindSeekEvents = (element) => {
    element.addEventListener('click', onSeekEnd);
    element.addEventListener('mousedown', onSeekStart);
    element.addEventListener('touchstart', onSeekStart, { passive: false });

    // Window-level events for smooth tracking even when finger/mouse drifts
    window.addEventListener('mousemove', onSeekMove);
    window.addEventListener('mouseup', onSeekEnd);
    window.addEventListener('touchmove', onSeekMove, { passive: false });
    window.addEventListener('touchend', onSeekEnd, { passive: false });
};

// Apply to Progress Bars
// Apply to Progress Bars
const fullContainerEl = document.getElementById('full-progress-container');
const miniContainerEl = document.getElementById('mini-progress-container');

if (fullContainerEl) {
    // Full player container is the parent of the progress container in new structure
    // structure: .group/prog > #full-progress-container
    const parent = fullContainerEl.parentElement;
    if (parent) {
        bindSeekEvents(parent);
        console.log('[Host] Bound Full Player Seek Events');
    }
}

if (miniContainerEl) {
    // miniContainerEl IS the target element to bind.
    bindSeekEvents(miniContainerEl);
    console.log('[Host] Bound Mini Player Seek Events');
}

// Core Logic (Playlist Mode)
async function playSong(song) {
    if (!song) return;

    // Safety Guard: Only Leader should execute this directly
    if (!isAmILeader()) {
        if (!isSharedControl) {
            toast.show(t('host_control_only'));
        } else {
            // If Shared Control is ON but this function called directly (e.g. from internal logic not caught by higher level delegates),
            // We should ideally delegate. But playSong takes an object. 
            // If we are here, it means we probably should have used playSongByKey.
            // For safety, we block direct DB writes from followers for playback changes to prevent desync.
            console.warn("Follower attempted direct playSong. Use playSongByKey for delegation.");
        }
        return;
    }

    resetProgressBar();
    const updates = {};
    updates[`rooms/${roomId}/current_playback`] = {
        videoId: song.videoId,
        title: song.title,
        artist: song.artist || '',
        thumbnail: song.thumbnail,
        requester: song.requester,
        requesterId: song.requesterId,
        status: 'playing',
        startedAt: serverTimestamp(),
        volume: player.getVolume(),
        queueKey: song.key
    };
    await update(ref(db), updates);
    loadAndPlay(song.videoId);
}

async function playNextSong() {
    // Only Leader controls the playlist
    if (!isAmILeader()) {
        console.log("Not leader, ignoring auto-next (playNextSong).");
        return;
    }
    const queueRef = ref(db, `rooms/${roomId}/queue`);
    const snapshot = await get(queueRef);

    if (snapshot.exists()) {
        const songs = snapshot.val();
        const sortedSongs = Object.keys(songs).map(key => ({
            key, ...songs[key]
        })).sort((a, b) => (a.order !== undefined ? a.order : a.createdAt) - (b.order !== undefined ? b.order : b.createdAt));

        if (sortedSongs.length === 0) return;

        let nextIndex = 0;

        if (isShuffle) {
            // Uniformly pick from other songs to avoid bias
            const otherIndices = sortedSongs.map((_, i) => i)
                .filter(i => !currentSongData || !currentSongData.queueKey || sortedSongs[i].key !== currentSongData.queueKey);

            if (otherIndices.length > 0) {
                const rand = Math.floor(Math.random() * otherIndices.length);
                nextIndex = otherIndices[rand];
            } else {
                nextIndex = 0; // Only one song available
            }
        } else {
            if (currentSongData && currentSongData.queueKey) {
                const currentIndex = sortedSongs.findIndex(s => s.key === currentSongData.queueKey);
                if (currentIndex !== -1 && currentIndex < sortedSongs.length - 1) {
                    nextIndex = currentIndex + 1;
                } else if (currentIndex === sortedSongs.length - 1) {
                    nextIndex = 0; // Loop to start
                }
            }
        }

        playSong(sortedSongs[nextIndex]);
    } else {
        setIdle();
    }
}

async function playPrevSong() {
    // Only Leader controls the playlist
    if (!isAmILeader()) {
        console.log("Not leader, ignoring prev (playPrevSong).");
        return;
    }
    const queueRef = ref(db, `rooms/${roomId}/queue`);
    const snapshot = await get(queueRef);

    if (snapshot.exists()) {
        const songs = snapshot.val();
        const sortedSongs = Object.keys(songs).map(key => ({
            key, ...songs[key]
        })).sort((a, b) => (a.order !== undefined ? a.order : a.createdAt) - (b.order !== undefined ? b.order : b.createdAt));

        if (sortedSongs.length === 0) return;

        let prevIndex = 0;
        if (currentSongData && currentSongData.queueKey) {
            const currentIndex = sortedSongs.findIndex(s => s.key === currentSongData.queueKey);
            if (currentIndex > 0) {
                prevIndex = currentIndex - 1;
            } else {
                prevIndex = sortedSongs.length - 1; // Loop to end
            }
        }

        playSong(sortedSongs[prevIndex]);
    } else {
        setIdle();
    }
}

async function setIdle() {
    resetProgressBar();
    await update(ref(db, `rooms/${roomId}/current_playback`), {
        status: 'idle',
        title: t('waiting_requests'),
        artist: t('add_song_msg'),
        videoId: null,
        thumbnail: null,
        requester: null,
        queueKey: null
    });
    setVisuals(false);
}

// Autoplay Policy Handler
const startOverlay = document.getElementById('start-overlay');
if (startOverlay) {
    startOverlay.addEventListener('click', () => {
        startOverlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => startOverlay.remove(), 500);

        // Attempt to resume playback if state is playing
        if (currentSongData && currentSongData.status === 'playing' && player && isPlayerReady) {
            player.playVideo();
        }
    });
}

function loadAndPlay(videoId, startSeconds = 0) {
    if (!isPlayerReady || !videoId) return;
    currentVideoId = videoId;
    isPlayIntended = true;
    if (startSeconds > 0) {
        player.loadVideoById({ videoId: videoId, startSeconds: startSeconds });
    } else {
        player.loadVideoById(videoId);
    }
    // Force play attempt to ensure autoplay works or resumes correctly
    setTimeout(() => {
        if (player && typeof player.getPlayerState === 'function') {
            const state = player.getPlayerState();
            if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
                player.playVideo();
            }
        }
    }, 200);
}

// YouTube Player Position Management
function switchYTPlayerMode(mode) {
    if (!ytPlayerWrapper) return;

    if (mode === 'lp') {
        const lpOuter = lpContainer ? lpContainer.parentElement : null;
        if (!lpOuter) return;

        const rect = lpOuter.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const diameter = rect.width * 0.40;

        ytPlayerWrapper.className = 'yt-lp-mode';
        ytPlayerWrapper.style.width = diameter + 'px';
        ytPlayerWrapper.style.height = diameter + 'px';
        ytPlayerWrapper.style.left = (centerX - diameter / 2) + 'px';
        ytPlayerWrapper.style.top = (centerY - diameter / 2) + 'px';
    } else if (mode === 'kiosk') {
        const jacket = document.getElementById('kiosk-jacket');
        if (!jacket) return;

        const rect = jacket.getBoundingClientRect();
        ytPlayerWrapper.className = 'yt-kiosk-mode';
        ytPlayerWrapper.style.width = rect.width + 'px';
        ytPlayerWrapper.style.height = rect.height + 'px';
        ytPlayerWrapper.style.left = rect.left + 'px';
        ytPlayerWrapper.style.top = rect.top + 'px';
        ytPlayerWrapper.style.bottom = 'auto';
        ytPlayerWrapper.style.transform = 'none';
    } else {
        // Main mode: reset all inline styles, use CSS defaults
        ytPlayerWrapper.className = '';
        ytPlayerWrapper.style.width = '';
        ytPlayerWrapper.style.height = '';
        ytPlayerWrapper.style.left = '';
        ytPlayerWrapper.style.top = '';
        ytPlayerWrapper.style.bottom = '';
        ytPlayerWrapper.style.transform = '';
        ytPlayerWrapper.style.borderRadius = '';
    }
}

function setVisuals(isPlaying) {
    // Optimization: Only animate if playing AND full player is visible
    const isVisible = fullPlayer && !fullPlayer.classList.contains('hidden');
    const state = (isPlaying && isVisible) ? 'running' : 'paused';

    if (lpContainer) lpContainer.style.animationPlayState = state;

    // Sync video player rotation with LP (if LP mode is active)
    if (ytPlayerWrapper && ytPlayerWrapper.classList.contains('yt-lp-mode')) {
        ytPlayerWrapper.style.animationPlayState = state;
    }

    // Kiosk LP disc rotation sync
    const kioskDisc = document.getElementById('kiosk-lp-disc');
    if (kioskDisc && isKioskActive) {
        kioskDisc.style.animationPlayState = state;
    }

    if (isPlaying) {
        miniPlayIcon.classList.add('hidden');
        miniPauseIcon.classList.remove('hidden');
        fullPlayIcon.classList.add('hidden');
        fullPauseIcon.classList.remove('hidden');
    } else {
        miniPlayIcon.classList.remove('hidden');
        miniPauseIcon.classList.add('hidden');
        fullPlayIcon.classList.remove('hidden');
        fullPauseIcon.classList.add('hidden');
    }
}

// UI Updates
function initListeners() {
    sessionStorage.removeItem('ejtunes_handled_interruption');
    const playbackRef = ref(db, `rooms/${roomId}/current_playback`);
    onValue(playbackRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        currentSongData = data;
        // updateHostUI(data); // MOVED: Called at the end to prevent prematurely updating currentVideoId

        if (player && isPlayerReady) {
            const pState = player.getPlayerState();

            // Priority: If videoId changed, load the new song
            if (data.videoId && data.videoId !== currentVideoId) {
                let startSeconds = 0;
                if (data.startedAt) {
                    const elapsed = (Date.now() - data.startedAt) / 1000;
                    if (elapsed > 0) startSeconds = elapsed;
                } else if (data.currentTime) {
                    startSeconds = data.currentTime;
                }

                if (data.status === 'playing') {
                    loadAndPlay(data.videoId, startSeconds);
                } else if (data.status === 'paused' && data.interrupted && !sessionStorage.getItem('ejtunes_handled_interruption')) {
                    console.log('[Host] Interruption detected on reload, auto-resuming...');
                    sessionStorage.setItem('ejtunes_handled_interruption', 'true');
                    update(playbackRef, {
                        status: 'playing',
                        startedAt: Date.now() - (startSeconds * 1000),
                        interrupted: null
                    });
                    isPlayIntended = true;
                } else {
                    // Paused state - cue the video (using correct startSeconds)
                    if (startSeconds > 0) {
                        player.cueVideoById({ videoId: data.videoId, startSeconds: startSeconds });
                    } else {
                        player.cueVideoById(data.videoId);
                    }
                    currentVideoId = data.videoId;
                    setVisuals(false);
                }
            } else if (data.status === 'playing' && pState !== 1 && pState !== 3) {
                // Same song, but need to resume
                isPlayIntended = true;
                player.playVideo();
            } else if (data.status === 'paused') {
                // Check if this was a crash/interruption and we should auto-resume
                if (data.interrupted && !sessionStorage.getItem('ejtunes_handled_interruption')) {
                    console.log('[Host] Interruption detected, auto-resuming...');
                    sessionStorage.setItem('ejtunes_handled_interruption', 'true');
                    update(playbackRef, {
                        status: 'playing',
                        startedAt: Date.now() - (data.currentTime * 1000),
                        interrupted: null
                    });
                    return; // Next onValue call will handle the 'playing' state
                }

                if (pState === 1) {
                    // Playing -> Paused
                    player.pauseVideo();
                }
                setVisuals(false);

                // Update Progress Visuals manually since loop is paused
                const current = data.currentTime !== undefined ? data.currentTime : (data.elapsed !== undefined ? data.elapsed : -1);

                if (current !== -1 && player && player.getDuration) {
                    const duration = player.getDuration();

                    // NEW: Seek player if time changed significantly while paused
                    if (typeof player.getCurrentTime === 'function') {
                        const localTime = player.getCurrentTime();
                        if (Math.abs(localTime - current) > 2) {
                            console.log(`[Host] Seeking while paused to: ${current}s`);
                            player.seekTo(current, true);
                        }
                    }

                    // Duration might be 0 if just cued and metadata not loaded yet.
                    if (duration > 0) {
                        const percent = (current / duration) * 100;
                        progressBarMini.style.setProperty('transition', 'none', 'important');
                        fullProgressBar.style.setProperty('transition', 'none', 'important');

                        progressBarMini.style.width = `${percent}%`;
                        fullProgressBar.style.width = `${percent}%`;

                        progCurrent.textContent = formatTime(current);
                        progDuration.textContent = formatTime(duration);

                        setTimeout(() => {
                            progressBarMini.style.removeProperty('transition');
                            fullProgressBar.style.removeProperty('transition');
                        }, 100);
                    } else {
                        // Fallback: If duration unknown, just show current time
                        progCurrent.textContent = formatTime(current);
                        // Retry shortly after to get duration
                        setTimeout(() => {
                            if (player && player.getDuration) {
                                const dur = player.getDuration();
                                if (dur > 0) {
                                    const per = (current / dur) * 100;
                                    progressBarMini.style.setProperty('transition', 'none', 'important');
                                    fullProgressBar.style.setProperty('transition', 'none', 'important');

                                    progressBarMini.style.width = `${per}%`;
                                    fullProgressBar.style.width = `${per}%`;

                                    progDuration.textContent = formatTime(dur);

                                    setTimeout(() => {
                                        progressBarMini.style.removeProperty('transition');
                                        fullProgressBar.style.removeProperty('transition');
                                    }, 100);
                                }
                            }
                        }, 500);
                    }
                }
            } else if (data.status === 'playing' && pState === 1) { // Already playing, check sync
                // Case: Host A plays Song A. Host B plays Song B.
                // Host A gets update. Status is playing, pState is playing.
                // We MUST check if videoId changed.
                if (data.videoId && data.videoId !== currentVideoId) {
                    let startSeconds = 0;
                    if (data.startedAt) {
                        const elapsed = (Date.now() - data.startedAt) / 1000;
                        if (elapsed > 0) startSeconds = elapsed;
                    }
                    loadAndPlay(data.videoId, startSeconds);
                } else if (data.startedAt && !isScrubbing) {
                    const expectedTime = (Date.now() - data.startedAt) / 1000;
                    const currentTime = player.getCurrentTime();
                    // If drift is > 2 seconds, seek
                    if (Math.abs(currentTime - expectedTime) > 2) {
                        console.log(`Syncing playback: Local ${currentTime.toFixed(2)}s, Expected ${expectedTime.toFixed(2)}s`);
                        player.seekTo(expectedTime);
                    }
                }
            } else if (data.status === 'skip') {
                playNextSong();
            }

            // Check for commands (like restart from remote)
            // But we need a separate listener for commands as it's a different node.
            // See initListeners extra block below.

            if (data.volume !== undefined) {
                const vol = data.volume;

                // Prevent initial slide-down animation
                const preventAnimation = (element) => {
                    if (!element) return;
                    element.style.transition = 'none';
                    setTimeout(() => element.style.removeProperty('transition'), 500);
                };

                if (fullVolume) {
                    preventAnimation(document.getElementById('full-volume-fill'));
                    fullVolume.value = vol;
                    updateVolumeFill(fullVolume);
                }
                if (hostVolume) {
                    preventAnimation(document.getElementById('host-volume-fill'));
                    hostVolume.value = vol;
                    updateVolumeFill(hostVolume);
                }
                if (miniVolume) {
                    preventAnimation(document.getElementById('mini-volume-fill'));
                    miniVolume.value = vol;
                    updateVolumeFill(miniVolume);
                }

                if (player && typeof player.setVolume === 'function') {
                    player.setVolume(vol);
                }
                updateMuteIcon(vol);
            }
        }

        // Move UI update to the end so currentVideoId comparison above works correctly
        updateHostUI(data);

        // Re-render queue to update active song highlighting
        renderHostQueue();
    });

    const queueRef = ref(db, `rooms/${roomId}/queue`);
    onValue(queueRef, (snapshot) => {
        if (isDragging) return;
        currentQueueSnapshot = snapshot;
        renderHostQueue();
    });

    // Listen for Commands (Restart, Previous, Next)
    const commandsRef = ref(db, `rooms/${roomId}/commands`);
    onValue(commandsRef, (snapshot) => {
        const cmd = snapshot.val();
        if (cmd && player && isPlayerReady) {
            // Only Leader executes commands to prevent duplicate actions
            if (!isAmILeader()) return;

            if (cmd.action === 'restart') {
                player.seekTo(0);
                player.playVideo();
                set(commandsRef, null);
            } else if (cmd.action === 'previous') {
                playPrevSong();
                set(commandsRef, null);
            } else if (cmd.action === 'next') {
                playNextSong();
                set(commandsRef, null);
            } else if (cmd.action === 'seek' && cmd.seekTo !== undefined) {
                player.seekTo(cmd.seekTo, true);
                set(commandsRef, null);
            } else if (cmd.action === 'playByKey' && cmd.key) {
                window.playSongByKey(cmd.key);
                set(commandsRef, null);
            } else if (cmd.action === 'pause') {
                player.pauseVideo();
                set(commandsRef, null);
            } else if (cmd.action === 'resume') {
                isPlayIntended = true;
                player.playVideo();
                set(commandsRef, null);
            }
        }
    });

    // Listen for Shuffle state changes
    const shuffleRef = ref(db, `rooms/${roomId}/info/shuffle`);
    onValue(shuffleRef, (snapshot) => {
        const isShuffled = snapshot.val() === true;
        updateShuffleUI(isShuffled);
    });

    // Listen for Repeat state changes
    const repeatRef = ref(db, `rooms/${roomId}/info/repeatMode`);
    onValue(repeatRef, (snapshot) => {
        const mode = snapshot.val() || 'all';
        updateRepeatUI(mode);
    });

    // Listen for last controller updates
    onValue(ref(db, `rooms/${roomId}/lastController`), (snapshot) => {
        const data = snapshot.val();
        if (data && lastControllerName) {
            lastControllerName.textContent = data.name || '-';
        }
    });

    renderHostQueue();
}

function renderHostQueue() {
    const list = document.getElementById('queue-list');
    const countEl = document.getElementById('queue-count');

    if (!list || !currentQueueSnapshot) return;

    // Save scroll position before re-render
    const scrollPos = list.parentElement ? list.parentElement.scrollTop : 0;

    // list.innerHTML = ''; // Removed to allow DOM diffing

    if (!currentQueueSnapshot.exists()) {
        list.innerHTML = `<div class="text-center text-gray-500 py-12">${t('no_songs_queue')}</div>`;
        if (countEl) countEl.textContent = t('playlist_summary', { count: 0, duration: '0:00' });
        return;
    }

    const songs = currentQueueSnapshot.val();
    const sortedSongs = Object.keys(songs).map(key => ({
        key, ...songs[key]
    })).sort((a, b) => (a.order !== undefined ? a.order : a.createdAt) - (b.order !== undefined ? b.order : b.createdAt));

    // Calculate total duration
    let totalSeconds = 0;
    sortedSongs.forEach(s => {
        if (s.duration) totalSeconds += s.duration;
    });

    const formatHHMMSS = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (countEl) {
        countEl.textContent = t('playlist_summary', {
            count: sortedSongs.length,
            duration: formatHHMMSS(totalSeconds)
        });
    }

    // Remove any non-keyed elements (like "No songs" message)
    Array.from(list.children).forEach(child => {
        if (!child.dataset.key) child.remove();
    });

    // Determine initial control state for rendering
    // Dynamic control check for event listeners
    const checkCanControl = () => isAmILeader() || isSharedControl;
    const canControl = checkCanControl(); // For initial rendering state

    // Helper to create a new song item
    const createSongItem = (song) => {
        // Create wrapper for swipe functionality
        const wrapper = document.createElement('div');
        wrapper.className = `relative overflow-hidden rounded-xl mb-2 queue-item-wrapper ${canControl ? 'sortable-item' : ''}`;
        wrapper.dataset.key = song.key;
        // Ensure initial control check
        const songCanControl = checkCanControl();

        // Delete background (revealed on swipe) - positioned on right
        const deleteBg = document.createElement('div');
        deleteBg.className = 'delete-bg absolute inset-0 bg-red-500 flex items-center justify-end pr-4 rounded-xl';
        deleteBg.innerHTML = `
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
        `;
        wrapper.appendChild(deleteBg);

        // Song item (swipeable) - needs solid background to cover red delete bg
        const el = document.createElement('div');
        el.className = 'song-item p-3 rounded-xl flex items-center gap-2 transition-transform border relative bg-white dark:bg-[#1E1E1E] border-black/5 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-[#262626]';
        el.dataset.key = song.key;
        el.style.touchAction = 'pan-y';

        wrapper.appendChild(el);

        // Attach Event Listeners (One time setup)
        // Swipe logic
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;
        const deleteThreshold = -100;

        const handleStart = (clientX, target) => {
            if (!checkCanControl()) return;
            if (target.closest('.drag-handle')) return;
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
                setTimeout(() => deleteSong(song.key), 200);
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

        // Double click to play
        let lastClickTime = 0;
        el.addEventListener('click', (e) => {
            if (e.target.closest('.drag-handle')) return;
            // Check control permission for playing? Yes, implies control.
            if (!checkCanControl()) return;

            const currentTime = new Date().getTime();
            const timeDiff = currentTime - lastClickTime;

            if (timeDiff < 300 && timeDiff > 0) {
                playSongByKey(song.key);
                lastClickTime = 0; // Reset
            } else {
                lastClickTime = currentTime;
            }
        });

        return wrapper;
    };

    // Track existing keys
    const existingElements = new Map();
    // Re-query ensuring we get the wrappers
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

        // Apply Updates (Incremental)
        const el = wrapper.querySelector('.song-item');

        // 1. Wrapper Class (Sortable)
        // Always toggle sortable-item based on CURRENT global state
        if (canControl) wrapper.classList.add('sortable-item');
        else wrapper.classList.remove('sortable-item');

        // Ensure wrapper class has queue-item-wrapper if we missed it
        wrapper.classList.add('queue-item-wrapper');

        // 2. Song Item Styling
        el.classList.remove('border-brand-mint/50', 'border-white/5', 'cursor-grab', 'active:cursor-grabbing');
        el.style.removeProperty('background-color'); // Remove inline style
        if (isActive) {
            el.classList.add('bg-brand-mint', 'dark:bg-[#222F2F]', 'border-transparent', 'dark:border-white/5');
            el.classList.remove('bg-white', 'dark:bg-[#1E1E1E]', 'hover:bg-white/10', 'hover:bg-black/5', 'bg-emerald-50/80', 'border-brand-mint/50', 'hover:bg-gray-50', 'dark:hover:bg-[#262626]');
            // Text handled in template below
        } else {
            el.classList.add('border-black/5', 'dark:border-white/5', 'bg-white', 'dark:bg-[#1E1E1E]', 'hover:bg-gray-50', 'dark:hover:bg-[#262626]');
            el.classList.remove('bg-brand-mint/10', 'dark:bg-[#222F2F]', 'bg-[#EBFBF0]', 'bg-emerald-50/80', 'bg-brand-mint', 'text-white', 'border-transparent');
        }
        if (canControl) el.classList.add('cursor-grab', 'active:cursor-grabbing');

        // 3. Content Update - Optimized to prevent re-rendering equalizers on play/pause
        const isHost = song.requesterId === roomId;
        let requesterDisplay = decodeHtmlEntities(song.requester);
        if (isHost && !requesterDisplay.includes('(Host)')) {
            requesterDisplay += ' (Host)';
        }

        // TEXT COLOR LOGIC FOR MINT BG
        const titleClass = isActive ? 'text-white dark:text-brand-mint' : 'text-gray-900 dark:text-gray-100';
        const metaClass = isActive ? 'text-white/90 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400';
        const highlightClass = isMySong ? (isActive ? 'text-white font-bold dark:text-brand-mint' : 'text-brand-mint') : '';

        // Full render required to ensure consistency with Remote (Equalizer resets on pause)
        el.innerHTML = `
            ${canControl ? '<div class="w-6 text-gray-500 text-center drag-handle cursor-grab">≡</div>' : ''}
            <div class="thumb-container w-12 h-12 bg-gray-800 rounded-md overflow-hidden flex-shrink-0 relative">
                <img src="${song.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="w-full h-full object-cover">
                ${isActive ? `
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center equalizer-overlay">
                    <div class="equalizer-bar small ${currentSongData?.status !== 'playing' ? 'paused' : ''}"><span></span><span></span><span></span></div>
                </div>` : ''}
            </div>
            <div class="flex-1 min-w-0 pr-2">
                <h4 class="title-text font-bold truncate text-sm ${titleClass}">${decodeHtmlEntities(song.title)}</h4>
                <p class="text-xs ${metaClass} truncate">${decodeHtmlEntities(song.artist) || 'Unknown'} | <span class="${highlightClass}">${requesterDisplay}</span></p>
            </div>
            <span class="duration-text text-xs ${metaClass} flex-shrink-0 hidden sm:block">${song.duration ? formatTime(song.duration) : '--:--'}</span>
        `;

        // 4. Append to list (automatically moves existing elements)
        list.appendChild(wrapper);
    });

    // Cleanup removed items
    existingElements.forEach((wrapper, key) => {
        if (!currentKeys.has(key)) {
            wrapper.remove();
        }
    });

    // Restore scroll
    if (list.parentElement) list.parentElement.scrollTop = scrollPos;

    // SortableJS Management
    if (canControl) {
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
                        updates[`rooms / ${roomId} /queue/${key}/order`] = index;
                    });
                    update(ref(db), updates).then(() => {
                        setTimeout(() => { isDragging = false; }, 500);
                    });
                }
            });
        }
        sortableInstance.option('disabled', false);
    } else {
        if (sortableInstance) {
            sortableInstance.option('disabled', true);
        }
    }
}



window.playSongByKey = async (key) => {
    if (!isAmILeader()) {
        if (!isSharedControl) {
            // Silently ignore as per user request
            return;
        }
        // Delegate to Leader
        const commandsRef = ref(db, `rooms/${roomId}/commands`);
        set(commandsRef, { action: 'playByKey', key: key, timestamp: serverTimestamp() });
        return;
    }

    // Fix: Redefine queueRef locally as it's not in scope
    const queueRef = ref(db, `rooms/${roomId}/queue`);
    const snapshot = await get(queueRef);
    if (snapshot.exists()) {
        const songs = snapshot.val();
        if (songs[key]) playSong({ key, ...songs[key] });
    }
};

window.deleteSong = async (key) => {
    if (!isAmILeader() && !isSharedControl) {
        toast.show(t('host_control_only'));
        return;
    }
    const songRef = ref(db, `rooms/${roomId}/queue/${key}`);
    const snapshot = await get(songRef);

    if (snapshot.exists()) {
        const songData = snapshot.val();

        if (currentSongData && currentSongData.queueKey === key) {
            // If deleting currently playing, skip first then delete
            playNextSong();
        }

        // Optimistic Remove
        remove(songRef);

        // Show Toast with Undo
        toast.show(t('song_deleted', { title: decodeHtmlEntities(songData.title) }), {
            duration: 5000,
            undoText: t('undo'),
            onUndo: async () => {
                await set(songRef, songData);
                toast.show(t('action_undone'));
            }
        });
    }
};


function updateHostUI(data) {
    const defImg = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    let title = decodeHtmlEntities(data.title) || t('waiting_requests');
    let artist = decodeHtmlEntities(data.artist) || t('unknown');
    const img = data.thumbnail || defImg;
    const hiResImg = data.videoId ? getHighResThumbnail(data.videoId) : img;

    // Force localized text for idle state
    if (data.status === 'idle') {
        title = t('waiting_requests');
        artist = t('add_song_msg');
    }

    miniTitle.textContent = title;
    miniArtist.textContent = artist;
    miniArt.src = img;

    fullTitle.textContent = title;
    fullArtist.textContent = artist;
    fullArt.src = hiResImg;
    bgArt.src = hiResImg;
    fullRequester.textContent = data.requester || 'System';

    // Use global likes instead of room-specific likes for persistence
    // Note: We use a separate tracking variable because currentVideoId is updated elsewhere before updateHostUI is called
    if (data.videoId) {
        // Check if we need to register a new listener (different video or first load)
        const likesListenerVideoId = fullLikes.dataset.currentVideoId;
        if (data.videoId !== likesListenerVideoId) {
            // Cleanup old listener
            if (likesListenerVideoId) {
                off(ref(db, `songs/${likesListenerVideoId}/totalLikes`));
            }
            // Store the video ID we're listening to
            fullLikes.dataset.currentVideoId = data.videoId;

            // Start new reactive listener
            onValue(ref(db, `songs/${data.videoId}/totalLikes`), (snapshot) => {
                fullLikes.textContent = snapshot.val() || 0;
            });
        }
    } else {
        // Idle state: cleanup
        const likesListenerVideoId = fullLikes.dataset.currentVideoId;
        if (likesListenerVideoId) {
            off(ref(db, `songs/${likesListenerVideoId}/totalLikes`));
            delete fullLikes.dataset.currentVideoId;
        }
        fullLikes.textContent = 0;
    }

    // Apply marquee if full player is visible
    if (!fullPlayer.classList.contains('hidden')) {
        applyMarquee(title);
    } else {
        // Store title for later marquee application when full player opens
        fullTitle.dataset.originalTitle = title;
        fullTitle.textContent = title;
    }

    // Update kiosk UI if active
    if (isKioskActive) updateKioskUI(data);
}

// Marquee Logic for Fullscreen Title (Seamless Loop)
let currentMarqueeTitle = null;
function applyMarquee(title) {
    if (!title) title = fullTitle.dataset.originalTitle || fullTitle.textContent.split('        •')[0].trim();
    if (!title) return;

    // Skip if marquee is already running with the same title
    if (fullTitle.classList.contains('animate-marquee') && currentMarqueeTitle === title) {
        return;
    }

    // Delay slightly to ensure fonts/layout are ready
    setTimeout(() => {
        // Double-check in case something changed during the delay
        if (fullTitle.classList.contains('animate-marquee') && currentMarqueeTitle === title) {
            return;
        }

        fullTitle.classList.remove('animate-marquee');
        fullTitle.textContent = title; // Reset to original title first
        void fullTitle.offsetWidth; // Trigger reflow

        // Apply if text overflows the parent container
        const parentWidth = fullTitle.parentElement.clientWidth;
        if (fullTitle.scrollWidth > parentWidth) {
            // Duplicate title with separator for seamless loop
            fullTitle.textContent = title + '        •        ' + title + '        •        ';
            fullTitle.classList.add('animate-marquee');
            currentMarqueeTitle = title;
        } else {
            currentMarqueeTitle = null;
        }
    }, 100);
}

// UI Interactions
// Set full player height to actual viewport height (fixes iOS Safari issue)
function setFullPlayerHeight() {
    const vh = window.innerHeight;
    fullPlayer.style.height = `${vh}px`;
    fullPlayer.style.minHeight = `${vh}px`;
    fullPlayer.style.maxHeight = `${vh}px`;
}

// Update height on resize
window.addEventListener('resize', () => {
    if (!fullPlayer.classList.contains('hidden')) {
        setFullPlayerHeight();
        if (isKioskActive) {
            setTimeout(() => {
                switchYTPlayerMode('kiosk');
                positionKioskDisc();
            }, 100);
        } else {
            // Recalculate LP center video position after resize
            setTimeout(() => switchYTPlayerMode('lp'), 100);
        }
    }
});

// Handle orientation change with multiple delayed updates (iOS Safari needs time)
window.addEventListener('orientationchange', () => {
    if (!fullPlayer.classList.contains('hidden')) {
        setTimeout(setFullPlayerHeight, 100);
        setTimeout(setFullPlayerHeight, 300);
        setTimeout(setFullPlayerHeight, 500);
        if (isKioskActive) {
            setTimeout(() => {
                switchYTPlayerMode('kiosk');
                positionKioskDisc();
            }, 600);
        } else {
            setTimeout(() => switchYTPlayerMode('lp'), 600);
        }
    }
});

// Open Full Player with animation
// Sync Video Player Position with LP Vinyl
let lpSyncFrameId = null;

const syncLPPosition = () => {
    const lpContainer = document.getElementById('lp-art-container');

    // Safety check: if LP container is gone or full player hidden, stop sync
    if (!lpContainer || fullPlayer.classList.contains('hidden')) {
        if (lpSyncFrameId) {
            cancelAnimationFrame(lpSyncFrameId);
            lpSyncFrameId = null;
        }
        return;
    }

    const rect = lpContainer.getBoundingClientRect();

    // Apply LP dimensions and position to video wrapper
    if (ytPlayerWrapper) {
        ytPlayerWrapper.style.top = `${rect.top}px`;
        ytPlayerWrapper.style.left = `${rect.left}px`;
        ytPlayerWrapper.style.width = `${rect.width}px`;
        ytPlayerWrapper.style.height = `${rect.height}px`;

        // Ensure circular clipping
        ytPlayerWrapper.style.borderRadius = '50%';
    }

    // Continue loop
    lpSyncFrameId = requestAnimationFrame(syncLPPosition);
};

// Open Full Player with animation
const openFullPlayer = () => {
    setFullPlayerHeight();
    fullPlayer.classList.remove('hidden');
    fullPlayer.style.display = 'block';

    if (isKioskEnabled) {
        // --- Kiosk Layout ---
        isKioskActive = true;
        const kioskOverlay = document.getElementById('kiosk-overlay');
        const mainContent = fullPlayer.querySelector('.relative.z-10.w-full.h-full');

        // Show kiosk, hide normal full player content
        if (kioskOverlay) kioskOverlay.classList.remove('hidden');
        if (mainContent) mainContent.classList.add('hidden');

        // Hide normal full player controls
        const fullscreenToggle = document.getElementById('full-fullscreen-toggle');
        const qrContainer = document.getElementById('full-qr-container');
        const collapseBtn = document.getElementById('collapse-player-btn');
        if (fullscreenToggle) fullscreenToggle.classList.add('hidden');
        if (qrContainer) qrContainer.classList.add('hidden');
        if (collapseBtn) collapseBtn.classList.add('hidden');

        // Force dark mode for kiosk
        if (!document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.add('dark');
        }

        // Generate kiosk QR code
        generateKioskQR();

        // Update kiosk UI with current song data
        if (currentSongData) updateKioskUI(currentSongData);

        // Sync play state for kiosk disc
        if (player && player.getPlayerState) {
            const isPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
            setVisuals(isPlaying);
        }

        // Request Wake Lock
        requestWakeLock();

        // Setup kiosk event listeners
        setupKioskListeners();

        // Resize listener for kiosk repositioning
        window.addEventListener('resize', onKioskResize);
        window.addEventListener('orientationchange', onKioskResize);
    } else {
        // --- Normal LP Full Player ---
        if (ytPlayerWrapper) {
            ytPlayerWrapper.classList.add('yt-lp-mode');
            ytPlayerWrapper.classList.add('animate-spin-slow');
        }

        if (player && player.getPlayerState) {
            const isPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
            setVisuals(isPlaying);

            if (ytPlayerWrapper) {
                ytPlayerWrapper.style.animationPlayState = isPlaying ? 'running' : 'paused';
            }
        }

        syncLPPosition();
    }

    // Double RAF to ensure browser registers the display:flex state
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            fullPlayer.classList.remove('translate-y-full');
            fullPlayer.style.transform = 'translateY(0)';
            fullPlayer.style.webkitTransform = 'translateY(0)';
            if (isKioskActive) {
                // Position YT player + disc AFTER slide-up animation completes (500ms)
                setTimeout(() => {
                    switchYTPlayerMode('kiosk');
                    positionKioskDisc();
                }, 550);
            } else {
                applyMarquee();
            }
        });
    });
};

// Close Full Player with animation
const closeFullPlayer = () => {
    if (isKioskActive) {
        // --- Kiosk Cleanup ---
        isKioskActive = false;
        const kioskOverlay = document.getElementById('kiosk-overlay');
        const mainContent = fullPlayer.querySelector('.relative.z-10.w-full.h-full');

        if (kioskOverlay) kioskOverlay.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');

        // Restore normal full player controls
        const fullscreenToggle = document.getElementById('full-fullscreen-toggle');
        const qrContainer = document.getElementById('full-qr-container');
        const collapseBtn = document.getElementById('collapse-player-btn');
        if (fullscreenToggle) fullscreenToggle.classList.remove('hidden');
        if (qrContainer) qrContainer.classList.remove('hidden');
        if (collapseBtn) collapseBtn.classList.remove('hidden');

        // Release Wake Lock
        releaseWakeLock();

        // Remove kiosk event listeners
        teardownKioskListeners();
        window.removeEventListener('resize', onKioskResize);
        window.removeEventListener('orientationchange', onKioskResize);

        // Clean up YT player kiosk mode
        if (ytPlayerWrapper) {
            ytPlayerWrapper.classList.remove('yt-kiosk-mode');
        }
    }

    // Cleanup LP Mode
    if (ytPlayerWrapper) {
        ytPlayerWrapper.classList.remove('yt-lp-mode');
        ytPlayerWrapper.classList.remove('animate-spin-slow');
        ytPlayerWrapper.style.top = '';
        ytPlayerWrapper.style.left = '';
        ytPlayerWrapper.style.width = '';
        ytPlayerWrapper.style.height = '';
        ytPlayerWrapper.style.borderRadius = '';
        ytPlayerWrapper.style.animationPlayState = '';
    }

    if (lpSyncFrameId) {
        cancelAnimationFrame(lpSyncFrameId);
        lpSyncFrameId = null;
    }

    // Return to main video mode
    switchYTPlayerMode('main');

    fullPlayer.classList.add('translate-y-full');
    fullPlayer.style.transform = 'translateY(100%)';
    fullPlayer.style.webkitTransform = 'translateY(100%)';

    setTimeout(() => {
        fullPlayer.classList.add('hidden');
        fullPlayer.style.display = 'none';
        fullPlayer.style.transform = '';
        fullPlayer.style.webkitTransform = '';
        fullPlayer.classList.add('translate-y-full');

        if (lpContainer) lpContainer.style.animationPlayState = 'paused';
    }, 500);
};

// Queue Panel Toggle
const queuePanel = document.getElementById('queue-panel');
const queuePanelToggle = document.getElementById('queue-panel-toggle');

function toggleQueuePanel() {
    if (!queuePanel || !queuePanelToggle) return;
    const isOpen = !queuePanel.classList.contains('pointer-events-none');
    if (isOpen) {
        // Close
        queuePanel.classList.add('opacity-0', 'pointer-events-none');
        queuePanel.classList.remove('opacity-100', 'pointer-events-auto');
        queuePanelToggle.classList.remove('text-brand-mint');
        queuePanelToggle.classList.add('text-gray-400', 'dark:text-gray-400');
    } else {
        // Open
        queuePanel.classList.remove('opacity-0', 'pointer-events-none');
        queuePanel.classList.add('opacity-100', 'pointer-events-auto');
        queuePanelToggle.classList.add('text-brand-mint');
        queuePanelToggle.classList.remove('text-gray-400', 'dark:text-gray-400');
    }
}

if (queuePanelToggle) {
    queuePanelToggle.addEventListener('click', toggleQueuePanel);
}

expandPlayerBtn.addEventListener('click', openFullPlayer);

collapsePlayerBtn.addEventListener('click', closeFullPlayer);

if (document.getElementById('mini-track-info')) {
    document.getElementById('mini-track-info').addEventListener('click', openFullPlayer);
}


// Close Settings on outside click
document.addEventListener('click', (e) => {
    if (settingsOverlay && !settingsOverlay.classList.contains('hidden') &&
        !settingsOverlay.contains(e.target) &&
        settingsBtn && !settingsBtn.contains(e.target)) {
        settingsOverlay.classList.add('hidden');
    }

    // Close Top Search on outside click
    if (!hostSearchResultsTop.classList.contains('hidden') &&
        !hostSearchResultsTop.contains(e.target) &&
        !hostSearchInputTop.contains(e.target)) {
        hostSearchResultsTop.classList.add('hidden');
    }

    // Close Host Lang Popover
    if (!hostLangPopover.classList.contains('hidden') &&
        !hostLangPopover.contains(e.target) &&
        !flagBtnHost.contains(e.target)) {
        hostLangPopover.classList.add('hidden');
    }
});

// Volume
let lastVolume = parseInt(localStorage.getItem('host_volume') || '50'); // Persist last non-zero volume

const updateVolume = (val) => {
    // Permission check
    if (!isAmILeader() && !isSharedControl) return;

    let volume = parseInt(val);
    if (isNaN(volume)) volume = 50;
    volume = Math.max(0, Math.min(100, volume));

    if (player && typeof player.setVolume === 'function') {
        try {
            player.setVolume(volume);
        } catch (e) {
            console.warn('Failed to set volume:', e);
        }
    }
    if (hostVolume) hostVolume.value = volume;
    if (fullVolume) fullVolume.value = volume;
    if (miniVolume) miniVolume.value = volume;

    const hostVolumeFill = document.getElementById('host-volume-fill');
    const fullVolumeFill = document.getElementById('full-volume-fill');
    const miniVolumeFill = document.getElementById('mini-volume-fill');

    if (hostVolumeFill) hostVolumeFill.style.width = `${volume}%`;
    if (fullVolumeFill) fullVolumeFill.style.width = `${volume}%`;
    if (miniVolumeFill) miniVolumeFill.style.width = `${volume}%`;

    const isMuted = volume === 0;
    document.getElementById('host-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('host-mute-icon')?.classList.toggle('hidden', !isMuted);
    document.getElementById('full-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('full-mute-icon')?.classList.toggle('hidden', !isMuted);
    document.getElementById('mini-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('mini-mute-icon')?.classList.toggle('hidden', !isMuted);

    // Persist volume locally
    localStorage.setItem('host_volume', volume);

    // Update real-time DB
    if (roomId) {
        update(ref(db, `rooms/${roomId}/current_playback`), { volume: volume }).catch(e => console.warn(e));
    }
};

// Bind Volume Inputs
if (hostVolume) {
    hostVolume.addEventListener('input', (e) => updateVolume(e.target.value));
}
if (fullVolume) {
    fullVolume.addEventListener('input', (e) => updateVolume(e.target.value));
}
if (miniVolume) {
    miniVolume.addEventListener('input', (e) => updateVolume(e.target.value));
}

// Bind Mute Toggles
const toggleMute = () => {
    // Permission check
    if (!isAmILeader() && !isSharedControl) return;

    const currentVol = player.getVolume();
    if (currentVol > 0) {
        lastVolume = currentVol;
        updateVolume(0);
    } else {
        updateVolume(lastVolume || 50);
    }
};

if (hostMuteToggle) hostMuteToggle.addEventListener('click', toggleMute);
if (fullMuteToggle) fullMuteToggle.addEventListener('click', toggleMute);
if (miniMuteToggle) miniMuteToggle.addEventListener('click', toggleMute);

// Touch-to-seek for volume sliders (tap to set position)
function handleSliderTouch(slider, updateFn) {
    const setValueFromTouch = (e) => {
        const touch = e.touches[0] || e.changedTouches[0];
        const rect = slider.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        slider.value = percent;
        updateFn(percent);
    };
    slider.addEventListener('touchstart', setValueFromTouch, { passive: true });
    slider.addEventListener('touchmove', setValueFromTouch, { passive: true });
}
if (hostVolume) handleSliderTouch(hostVolume, updateVolume);
if (fullVolume) handleSliderTouch(fullVolume, updateVolume);
if (miniVolume) handleSliderTouch(miniVolume, updateVolume);



// iOS Detection to hide volume controls (Volume/Mute not supported via JS on iOS)
function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
        // iPad on iOS 13 detection
        || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

if (isIOS()) {
    const volumeControls = document.querySelectorAll('#host-volume-fill, #host-volume, #host-mute-toggle, #full-mute-toggle, #full-volume-fill, #full-volume');
    // We should hide the CONTAINER of these controls to be cleaner. Use IDs of parent divs if possible, or hide explicit elements.
    // Let's hide the specific toggle buttons and sliders.
    // Better: hide the parent container if possible, but structure might vary.
    // Simple approach: Hide the elements we know.

    // Main UI Volume container
    const hostVolContainer = document.querySelector('.volume-control-group'); // Check class in index.html?
    // Actually, let's target the exact IDs for buttons and the slider containers.

    const hostMuteBtn = document.getElementById('host-mute-toggle');
    const fullMuteBtn = document.getElementById('full-mute-toggle');

    // For sliders, they are wrapped in a relative div usually.
    // Let's just hide the mute buttons and the slider inputs, effectively disabling them visually.

    if (hostMuteBtn) {
        hostMuteBtn.style.display = 'none'; // Hide mute toggle
        // Also hide the slider next to it
        if (hostVolume) hostVolume.parentElement.style.display = 'none';
    }

    if (fullMuteBtn) {
        fullMuteBtn.parentElement.style.display = 'none'; // Hide the whole volume block in fullscreen
    }
}

// Toggle Shuffle - Just toggle state in DB, random playback is handled by playNextSong
const toggleShuffle = async () => {
    if (!roomId) return;

    const shuffleRef = ref(db, `rooms/${roomId}/info/shuffle`);
    const shuffleSnap = await get(shuffleRef);
    const newShuffleState = shuffleSnap.val() !== true;

    await set(shuffleRef, newShuffleState);
    updateShuffleUI(newShuffleState);
};

// Update shuffle button UI
function updateShuffleUI(isOn) {
    if (fullShuffleBtn) {
        if (isOn) {
            fullShuffleBtn.classList.add('text-brand-mint');
            fullShuffleBtn.classList.remove('text-gray-400');
        } else {
            fullShuffleBtn.classList.add('text-gray-400');
            fullShuffleBtn.classList.remove('text-brand-mint');
        }
    }
    if (miniShuffleBtn) {
        if (isOn) {
            miniShuffleBtn.classList.add('text-brand-mint');
            miniShuffleBtn.classList.remove('text-gray-400');
        } else {
            miniShuffleBtn.classList.add('text-gray-400');
            miniShuffleBtn.classList.remove('text-brand-mint');
        }
    }
}

miniShuffleBtn.addEventListener('click', toggleShuffle);
if (fullShuffleBtn) fullShuffleBtn.addEventListener('click', toggleShuffle);

// Toggle Repeat
const toggleRepeat = async () => {
    if (!roomId) return;
    const infoRef = ref(db, `rooms/${roomId}/info/repeatMode`);
    const snap = await get(infoRef);
    const intent = snap.val() === 'one' ? 'all' : 'one';
    await set(infoRef, intent);
};

// Update Repeat button UI
function updateRepeatUI(mode) {
    if (fullRepeatBtn) {
        if (mode !== 'all') { // 'one'
            fullRepeatBtn.classList.add('text-brand-mint');
            fullRepeatBtn.classList.remove('text-gray-400');
            fullRepeatIconAll?.classList.add('hidden');
            fullRepeatIconOne?.classList.remove('hidden');
        } else {
            fullRepeatBtn.classList.add('text-gray-400');
            fullRepeatBtn.classList.remove('text-brand-mint');
            fullRepeatIconAll?.classList.remove('hidden');
            fullRepeatIconOne?.classList.add('hidden');
        }
    }
    if (miniRepeatBtn) {
        if (mode !== 'all') { // 'one' - but we treat 'off' as all for now? actually remote only has one/all
            miniRepeatBtn.classList.add('text-brand-mint');
            miniRepeatBtn.classList.remove('text-gray-400');
            miniRepeatIconAll?.classList.add('hidden');
            miniRepeatIconOne?.classList.remove('hidden');
        } else {
            miniRepeatBtn.classList.add('text-gray-400');
            miniRepeatBtn.classList.remove('text-brand-mint');
            miniRepeatIconAll?.classList.remove('hidden');
            miniRepeatIconOne?.classList.add('hidden');
        }
    }
}

miniRepeatBtn?.addEventListener('click', toggleRepeat);
fullRepeatBtn?.addEventListener('click', toggleRepeat);

// Play Controls
const togglePlay = () => {
    if (!isAmILeader() && !isSharedControl) {
        toast.show(t('host_control_only'));
        return;
    }

    if (isAmILeader()) {
        if (player.getPlayerState() === 1) {
            player.pauseVideo();
        } else {
            isPlayIntended = true;
            player.playVideo();
        }
    } else {
        // Send command
        const action = player && player.getPlayerState() === 1 ? 'pause' : 'resume';
        const commandsRef = ref(db, `rooms/${roomId}/commands`);
        set(commandsRef, {
            action: action,
            timestamp: serverTimestamp()
        });
    }
};

const prevSong = () => {
    if (!isAmILeader() && !isSharedControl) return;
    if (isAmILeader()) {
        playPrevSong();
    } else {
        const commandsRef = ref(db, `rooms/${roomId}/commands`);
        set(commandsRef, { action: 'previous', timestamp: serverTimestamp() });
    }
};

const nextSong = () => {
    if (!isAmILeader() && !isSharedControl) return;
    if (isAmILeader()) {
        playNextSong();
    } else {
        const commandsRef = ref(db, `rooms/${roomId}/commands`);
        set(commandsRef, { action: 'next', timestamp: serverTimestamp() });
    }
};

miniPlayBtn.addEventListener('click', togglePlay);
fullPlayBtn.addEventListener('click', togglePlay);
miniPrevBtn.addEventListener('click', prevSong);
fullPrevBtn.addEventListener('click', prevSong);
miniNextBtn.addEventListener('click', nextSong);
fullNextBtn.addEventListener('click', nextSong);

// Heart Button (No Op on Host)
// fullLikeBtn.addEventListener('click', () => {}); // Removed logic

// Search Logic
const openSearch = () => {
    searchOverlay.classList.remove('hidden');
    hostSearchInput.focus();
};
hostSearchBtn.addEventListener('click', openSearch);
hostSearchInputTop.addEventListener('focus', () => {
    if (hostSearchResultsTop.innerHTML.trim()) {
        hostSearchResultsTop.classList.remove('hidden');
    }
});



// New Language Button
flagBtnHost.addEventListener('click', (e) => {
    e.stopPropagation();
    hostLangPopover.classList.toggle('hidden');
});

hostLangOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
        const lang = opt.dataset.lang;
        setLanguage(lang);
        hostLangPopover.classList.add('hidden');

        // Update Flag
        const icon = lang === 'ko' ? '🇰🇷' : '🇺🇸';
        flagBtnHost.textContent = icon;

        // Re-render UI components that use dynamic text
        renderHostQueue();
        if (currentSongData) updateNowPlaying(currentSongData);
    });
});

// Room Info Popover & QR Code
roomInfoTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    roomInfoPopover.classList.toggle('hidden');
});
// Fullscreen QR Code Toggle
const fullQrToggle = document.getElementById('full-qr-toggle');
const fullQrWrapper = document.getElementById('full-qr-code-wrapper');
const fullQrCode = document.getElementById('full-qr-code');
const fullQrClose = document.getElementById('full-qr-close');
const fullQrRoomCode = document.getElementById('full-qr-room-code');
let fullQrGenerated = false;

const showFullQr = () => {
    fullQrWrapper?.classList.remove('hidden');
    fullQrToggle?.classList.add('hidden');

    // Generate QR code if not yet generated
    if (roomId && !fullQrGenerated) {
        const joinUrl = `${window.location.origin}/${roomId}`;
        QRCode.toCanvas(fullQrCode, joinUrl, {
            width: 144,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
        });
        if (fullQrRoomCode) fullQrRoomCode.textContent = `#${roomId}`;
        fullQrGenerated = true;
    }
};

const hideFullQr = () => {
    fullQrWrapper?.classList.add('hidden');
    fullQrToggle?.classList.remove('hidden');
};

fullQrToggle?.addEventListener('click', showFullQr);
fullQrClose?.addEventListener('click', hideFullQr);

// Regenerate fullscreen QR when entering fullscreen (in case roomId changes)
if (typeof expandPlayerBtn !== 'undefined' && expandPlayerBtn) {
    expandPlayerBtn.addEventListener('click', () => {
        fullQrGenerated = false;
    });
}


// Fullscreen Toggle Logic
const fullFullscreenToggle = document.getElementById('full-fullscreen-toggle');
const iconEnterFullscreen = document.getElementById('icon-enter-fullscreen');
const iconExitFullscreen = document.getElementById('icon-exit-fullscreen');

const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
};

const updateFullscreenIcon = () => {
    if (document.fullscreenElement) {
        iconEnterFullscreen?.classList.add('hidden');
        iconExitFullscreen?.classList.remove('hidden');
    } else {
        iconEnterFullscreen?.classList.remove('hidden');
        iconExitFullscreen?.classList.add('hidden');
    }
};

if (fullFullscreenToggle) {
    fullFullscreenToggle.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
}
fullQrClose?.addEventListener('click', hideFullQr);

// Regenerate fullscreen QR when entering fullscreen (in case roomId changes)
expandPlayerBtn?.addEventListener('click', () => {
    fullQrGenerated = false;
});

// Click outside to close popover
document.addEventListener('click', (e) => {
    if (!roomInfoPopover.classList.contains('hidden') &&
        !roomInfoPopover.contains(e.target) &&
        !roomInfoTrigger.contains(e.target)) {
        roomInfoPopover.classList.add('hidden');
    }
});


// Delete Room (New Location)
// Delete Room or Leave Room (Context Aware)
document.getElementById('delete-room-btn').addEventListener('click', async () => {
    if (isAmILeader()) {
        // Leader: Delete Room
        if (confirm(t('confirm_delete_room'))) {
            await remove(ref(db, `rooms/${roomId}`));
            localStorage.removeItem('host_room_id');
            location.reload();
        }
    } else {
        // Follower: Leave Room immediately without alert
        // Remove local session
        if (currentSessionRef) {
            await remove(currentSessionRef);
        }
        localStorage.removeItem('host_room_id');
        // Redirect to host landing page to prevent auto-rejoin
        // We must use '/host/' explicitly to clear the Room ID from the URL
        window.location.href = '/host/';
    }
});

// Shared Control Toggle - initialized after room is entered
function initRoomSettings() {
    if (!roomId) return;

    // --- Shared Control ---
    onValue(ref(db, `rooms/${roomId}/info/isSharedControl`), (snapshot) => {
        isSharedControl = snapshot.val() === true;
        updateToggleUI(sharedControlToggle, isSharedControl);

        if (sharedControlToggle && !sharedControlToggle.dataset.listenerAdded) {
            sharedControlToggle.dataset.listenerAdded = 'true';
            sharedControlToggle.addEventListener('change', async (e) => {
                const current = e.target.checked;
                await update(ref(db, `rooms/${roomId}/info`), { isSharedControl: current });
            });
        }
    });

    // --- Private Room ---
    onValue(ref(db, `rooms/${roomId}/info/isPrivate`), (snapshot) => {
        const isPrivate = snapshot.val() === true;
        updateToggleUI(privateRoomToggle, isPrivate);

        if (privateRoomToggle && !privateRoomToggle.dataset.listenerAdded) {
            privateRoomToggle.dataset.listenerAdded = 'true';
            privateRoomToggle.addEventListener('change', async (e) => {
                const current = e.target.checked;
                await update(ref(db, `rooms/${roomId}/info`), { isPrivate: current });
            });
        }
    });

    // --- Shuffle ---
    onValue(ref(db, `rooms/${roomId}/info/shuffle`), (snapshot) => {
        isShuffle = snapshot.val() === true;
        updateShuffleUI(isShuffle);
    });

    // --- Repeat Mode ---
    onValue(ref(db, `rooms/${roomId}/info/repeatMode`), (snapshot) => {
        repeatMode = snapshot.val() || 'all';
        updateRepeatUI(repeatMode);
    });

    // --- Kiosk Mode Toggle ---
    const kioskToggle = document.getElementById('kiosk-mode-toggle');
    if (kioskToggle) {
        kioskToggle.checked = isKioskEnabled;
        kioskToggle.addEventListener('change', (e) => {
            isKioskEnabled = e.target.checked;
            localStorage.setItem('ejtunes_kiosk', isKioskEnabled ? 'true' : 'false');
        });
    }

    // Auto-enter kiosk mode if URL parameter is set
    if (isKioskEnabled) {
        // Wait for player to be ready, then auto-enter full player
        const waitForPlayer = setInterval(() => {
            if (isPlayerReady) {
                clearInterval(waitForPlayer);
                setTimeout(() => openFullPlayer(), 500);
            }
        }, 200);
    }
}

function updateToggleUI(toggleEl, isOn) {
    if (!toggleEl) return;

    // Support both old <button> and new <input type="checkbox"> structure
    if (toggleEl.tagName === 'INPUT') {
        toggleEl.checked = isOn;
    } else {
        // Legacy button support (though the HTML is updated, we keep this for safety)
        toggleEl.setAttribute('aria-checked', isOn);
        const knob = toggleEl.querySelector('span');
        if (knob) {
            if (isOn) {
                toggleEl.classList.remove('bg-gray-600');
                toggleEl.classList.add('bg-brand-mint');
                knob.style.transform = 'translateX(1.25rem)';
            } else {
                toggleEl.classList.remove('bg-brand-mint');
                toggleEl.classList.add('bg-gray-600');
                knob.style.transform = 'translateX(0)';
            }
        }
    }

    // Feature specific side-effects
    if (toggleEl.id === 'shared-control-toggle') {
        if (isOn) lastControllerInfo?.classList.remove('hidden');
        else lastControllerInfo?.classList.add('hidden');
    }
}

// Search Implementation
const executeSearch = (query, container, inputEl) => {
    if (query.length >= 2) {
        performHostSearch(query, container, inputEl);
        inputEl.blur(); // Dismiss virtual keyboard on mobile
    }
};

const setupSearchInput = (input, clearBtn) => {
    const checkInput = () => {
        if (input.value.trim().length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    };
    input.addEventListener('input', checkInput);
    clearBtn.addEventListener('click', () => {
        input.value = '';
        input.focus();
        clearBtn.classList.add('hidden');
    });
};

setupSearchInput(hostSearchInput, clearSearchBtn);
setupSearchInput(hostSearchInputTop, clearSearchBtnTop);

// Input Enter Key
hostSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch(e.target.value.trim(), hostSearchResults, hostSearchInput);
});
hostSearchInputTop.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch(e.target.value.trim(), hostSearchResultsTop, hostSearchInputTop);
});

// Search Button Click
if (hostSearchSubmit) {
    hostSearchSubmit.addEventListener('click', () => {
        executeSearch(hostSearchInput.value.trim(), hostSearchResults, hostSearchInput);
    });
}
if (hostSearchSubmitTop) {
    hostSearchSubmitTop.addEventListener('click', () => {
        executeSearch(hostSearchInputTop.value.trim(), hostSearchResultsTop, hostSearchInputTop);
    });
}

async function performHostSearch(query, container, inputEl) {
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = query.match(regExp);
        if (match && match[2].length === 11) {
            addToHostQueue({ id: match[2], title: 'Video ' + match[2], thumb: `https://i.ytimg.com/vi/${match[2]}/mqdefault.jpg` });
            inputEl.value = '';
            container.classList.add('hidden');
            searchOverlay.classList.add('hidden');
            return;
        }
    }

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&topicId=/m/04rlf&key=${YOUTUBE_API_KEY}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        container.innerHTML = '';
        container.classList.remove('hidden');

        data.items.forEach(item => {
            const vid = {
                id: item.id.videoId,
                title: item.snippet.title,
                artist: item.snippet.channelTitle,
                thumb: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url
            };
            const el = document.createElement('div');
            el.className = 'p-3 flex items-center gap-3 hover:bg-white/10 cursor-pointer border-b border-white/10 last:border-0';
            el.innerHTML = `
                <img src="${vid.thumb}" class="w-12 h-9 object-cover rounded">
                <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-bold truncate text-gray-900 dark:text-white">${vid.title}</h4>
                </div>
                <button class="bg-brand-mint text-black px-3 py-1 rounded text-xs font-bold">${t('add_button')}</button>
            `;
            el.addEventListener('click', () => {
                addToHostQueue(vid);
                // Explicitly hide clear buttons
                clearSearchBtn.classList.add('hidden');
                clearSearchBtnTop.classList.add('hidden');

                inputEl.value = '';
                container.innerHTML = ''; // Fix: Clear previous results
                container.classList.add('hidden');
                searchOverlay.classList.add('hidden');
                hostSearchResultsTop.classList.add('hidden'); // Ensure top results close too
            });
            container.appendChild(el);
        });
    } catch (e) { console.error(e); }
}

async function addToHostQueue(video) {
    if (!roomId || !currentUser) {
        console.error("Missing Room ID or User", { roomId, currentUser });
        toast.show(t('login_required'), { isError: true });
        return;
    }

    try {
        // Fetch video details including duration
        let duration = 0;
        try {
            const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${video.id}&key=${YOUTUBE_API_KEY}`);
            const detailData = await detailRes.json();
            if (detailData.items && detailData.items[0]) {
                const isoDuration = detailData.items[0].contentDetails.duration;
                // Parse ISO 8601 duration (PT#H#M#S)
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

        const queueRef = ref(db, `rooms/${roomId}/queue`);
        const newRef = await push(queueRef, {
            videoId: video.id,
            title: video.title,
            artist: video.artist || 'Unknown',
            thumbnail: video.thumb,
            requester: 'Host',
            requesterId: currentUser.uid,
            duration: duration,
            createdAt: serverTimestamp(),
            order: Date.now(),
        });

        const snap = await get(ref(db, `rooms/${roomId}/current_playback`));
        if (!snap.exists() || !snap.val().videoId || snap.val().status === 'idle') {
            playSong({ key: newRef.key, ...video, requester: 'Host', requesterId: currentUser.uid });
        } else {
            // Show success toast
            toast.show(t('added_to_queue'));
        }
    } catch (e) {
        console.error("Add to Host Queue Failed:", e);
        toast.show(t('failed_add'), { isError: true });
    }
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
    banner.className = 'update-banner top';
    banner.innerHTML = `
        <div class="flex-1 text-sm text-gray-200">
            <span class="font-bold text-brand-mint">${t('update_available')}</span> 
            ${t('update_desc', { version: newVersion })}
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
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark && !document.documentElement.classList.contains('light')) {
        document.documentElement.classList.add('dark');
    }

    const toggle = document.getElementById('error-theme-toggle');
    if (toggle) {
        toggle.checked = document.documentElement.classList.contains('dark');
        toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
            } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
            }
        });
    }
})();



// ==========================================
// Kiosk Mode Functions
// ==========================================

function updateKioskUI(data) {
    const kioskTitle = document.getElementById('kiosk-title');
    const kioskArtist = document.getElementById('kiosk-artist');
    const kioskRequesterName = document.getElementById('kiosk-requester-name');
    const kioskDiscArt = document.getElementById('kiosk-disc-art');

    if (!kioskTitle) return;

    const title = decodeHtmlEntities(data.title) || 'Waiting...';
    const artist = decodeHtmlEntities(data.artist) || 'System';

    kioskTitle.textContent = data.status === 'idle' ? t('waiting_requests') : title;
    kioskArtist.textContent = data.status === 'idle' ? t('add_song_msg') : artist;
    if (kioskRequesterName) kioskRequesterName.textContent = data.requester || 'System';

    // Update disc center art + background
    if (data.videoId) {
        const hiRes = getHighResThumbnail(data.videoId);
        if (kioskDiscArt) kioskDiscArt.src = hiRes;
        const kioskBgArt = document.getElementById('kiosk-bg-art');
        if (kioskBgArt) kioskBgArt.src = hiRes;
    }
}

function generateKioskQR() {
    if (!roomId) return;
    const canvas = document.getElementById('kiosk-qr-code');
    if (!canvas) return;

    const joinUrl = `${window.location.origin}/${roomId}`;
    QRCode.toCanvas(canvas, joinUrl, {
        width: 112,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
    });
}

function positionKioskDisc() {
    const jacket = document.getElementById('kiosk-jacket');
    const disc = document.getElementById('kiosk-lp-disc');
    const highlight = document.getElementById('kiosk-lp-highlight');
    if (!jacket || !disc) return;

    const jacketRect = jacket.getBoundingClientRect();
    const assembly = document.getElementById('kiosk-vinyl-assembly');
    const assemblyRect = assembly ? assembly.getBoundingClientRect() : { left: 0, top: 0 };

    const discSize = jacketRect.width;
    // Position disc so its center is at jacket's right edge
    const discLeft = (jacketRect.left - assemblyRect.left) + jacketRect.width - (discSize / 2);
    const discTop = (jacketRect.top - assemblyRect.top) + (jacketRect.height / 2) - (discSize / 2);

    disc.style.width = discSize + 'px';
    disc.style.height = discSize + 'px';
    disc.style.left = discLeft + 'px';
    disc.style.top = discTop + 'px';

    if (highlight) {
        highlight.style.width = discSize + 'px';
        highlight.style.height = discSize + 'px';
        highlight.style.left = discLeft + 'px';
        highlight.style.top = discTop + 'px';
    }
}

function onKioskResize() {
    if (!isKioskActive) return;
    setTimeout(() => {
        switchYTPlayerMode('kiosk');
        positionKioskDisc();
    }, 100);
}

// Wake Lock API
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('[Kiosk] Wake Lock acquired');
            wakeLock.addEventListener('release', () => {
                console.log('[Kiosk] Wake Lock released');
            });
        } catch (err) {
            console.warn('[Kiosk] Wake Lock failed:', err.message);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Re-acquire wake lock on visibility change (tab switch back)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isKioskActive && !wakeLock) {
        requestWakeLock();
    }
});

// Kiosk interaction lockdown
function setupKioskListeners() {
    document.addEventListener('touchmove', preventKioskTouch, { passive: false });
    document.addEventListener('contextmenu', preventKioskContext);

    // 5-tap exit zone
    const exitZone = document.getElementById('kiosk-exit-zone');
    if (exitZone) {
        exitZone.addEventListener('click', handleKioskExitTap);
    }
}

function teardownKioskListeners() {
    document.removeEventListener('touchmove', preventKioskTouch);
    document.removeEventListener('contextmenu', preventKioskContext);

    const exitZone = document.getElementById('kiosk-exit-zone');
    if (exitZone) {
        exitZone.removeEventListener('click', handleKioskExitTap);
    }

    kioskExitTapCount = 0;
    if (kioskExitTapTimer) {
        clearTimeout(kioskExitTapTimer);
        kioskExitTapTimer = null;
    }
}

function preventKioskTouch(e) {
    if (isKioskActive) e.preventDefault();
}

function preventKioskContext(e) {
    if (isKioskActive) e.preventDefault();
}

function handleKioskExitTap() {
    kioskExitTapCount++;

    if (kioskExitTapTimer) clearTimeout(kioskExitTapTimer);
    kioskExitTapTimer = setTimeout(() => {
        kioskExitTapCount = 0;
    }, 3000); // Reset after 3 seconds of no taps

    if (kioskExitTapCount >= 5) {
        kioskExitTapCount = 0;
        if (kioskExitTapTimer) {
            clearTimeout(kioskExitTapTimer);
            kioskExitTapTimer = null;
        }
        closeFullPlayer();
    }
}

function updateVolumeFill(rangeInput) {
    if (!rangeInput) return;
    const val = rangeInput.value;
    const fill = document.getElementById(rangeInput.id + '-fill');
    if (fill) fill.style.width = `${val}%`;
}

function updateMuteIcon(volume) {
    const isMuted = parseInt(volume) === 0;
    // Host Player
    document.getElementById('host-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('host-mute-icon')?.classList.toggle('hidden', !isMuted);
    // Full Player
    document.getElementById('full-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('full-mute-icon')?.classList.toggle('hidden', !isMuted);
    // Mini Player
    document.getElementById('mini-volume-icon')?.classList.toggle('hidden', isMuted);
    document.getElementById('mini-mute-icon')?.classList.toggle('hidden', !isMuted);
}
