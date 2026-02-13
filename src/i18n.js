// Language Dictionary
const resources = {
    en: {
        app_title: "EJTunes",
        create_room: "Create Room",
        create_room_desc: "Enjoy Jamming Together",
        join_room: "Join Room",
        room_name_placeholder: "Room Name (e.g. 5F Lounge)",
        room_code_placeholder: "Enter Room Code",
        waiting_requests: "Waiting for requests...",
        add_song_msg: "Add songs to create a playlist",
        add_button: "Add",
        now_playing: "Now Playing",
        no_music_playing: "No music playing",
        up_next: "Playlist",
        no_songs_queue: "No songs in queue",
        search_placeholder: "Paste YouTube URL or search...",
        room_name_required: "Please enter a room name",
        login_required: "Login required",
        room_exists: "Room '{name}' already exists (Code: {code}).\nDo you want to reuse it?",
        host_disconnected: "Host has disconnected.",
        room_exists_title: "Room Already Exists",
        room_exists_msg: "Room '{name}' is already active. Do you want to reuse it?",
        reuse_room: "Reuse Room",
        change_name: "Change Name",
        name_taken_error: "This room name is already taken.",
        added_to_queue: "Added to queue!",
        failed_add: "Failed to add song",
        pro_tip: "💡 Pro Tip",
        pro_tip_desc: "Log in with <span class='text-gray-800 dark:text-white'>YouTube Premium</span> on this browser to play music without ads.",
        settings: "Settings",
        language: "Language",
        logout: "Logout",
        join: "Join",
        room_not_found: "Room not found",
        active_rooms: "Active Rooms",
        no_active_rooms: "No active rooms",
        confirm_delete: "Delete this song?",
        volume: "Volume",
        volume: "Volume",
        songs_count: "{count} songs",
        playlist_summary: "{count} songs • {duration}",
        undo: "UNDO",
        unknown: "Unknown",
        song_deleted: "{title} deleted",
        action_undone: "Action undone",
        delete_room: "Delete Room",
        confirm_delete_room: "Are you sure you want to delete this room?",
        host_disconnected_title: "Connection Lost",
        host_disconnected_msg: "The host has ended the session or disconnected.",
        return_home: "Return to Home",
        reconnect: "Reconnect",
        leave_room: "Leave Room",
        room_code: "Room Code",
        shared_control: "Shared Control",
        last_controller: "Last controlled by",
        shuffle_on: "Shuffle ON",
        shuffle_off: "Shuffle OFF",
        sign_in_google: "Sign in with Google",
        no_results: "No results found",
        private_room: "Private Room",
        private_room_hint: "Hidden from active room list",
        host_control_only: "Host Control Only",
        dark_mode: "Dark Mode",
        delete: "Delete",
        update_available: "New Version Available",
        update_desc: "Version {version} has been released. Please refresh to update.",
        refresh: "Refresh",
        error_oops: "Wait, we can't find that room!",
        error_desc_participant: "We couldn't find a room for that code. If it was just created, try refreshing this page in a few seconds!",
        error_desc_host: "This host session seems to be gone. You can try refreshing to check again, or just head back to create a new one.",
        back_to_home: "Back to Home",
        host_not_found_title: "Host Not Found",
        waiting_reconnect: "Waiting for reconnection...",
        preparing_music: "Preparing music...",
        kiosk_mode: "Kiosk Mode",
        kiosk_mode_hint: "Cafe display mode",
        scan_to_request: "Scan to request a song",
        exit_kiosk: "Exit Kiosk Mode?",
        exit_kiosk_desc: "Return to the normal player view.",
        cancel_btn: "Cancel",
        exit_btn: "Exit",
        requested_by: "Requested by",
        song_too_long: "Songs longer than {minutes} minutes are not allowed"
    },
    ko: {
        app_title: "EJTunes",
        create_room: "방 만들기",
        create_room_desc: "함께 즐거운 음악 시간을 즐기세요!",
        join_room: "방 입장하기",
        room_name_placeholder: "방 이름 (예: 5층 라운지)",
        room_code_placeholder: "방 코드 입력",
        waiting_requests: "신청곡 대기 중...",
        add_song_msg: "노래를 추가하여 플레이리스트를 만들어보세요",
        add_button: "추가",
        now_playing: "지금 재생중",
        no_music_playing: "재생 중인 곡이 없습니다",
        up_next: "재생 목록",
        no_songs_queue: "대기 중인 곡이 없습니다",
        search_placeholder: "유튜브 링크 붙여넣기 또는 검색...",
        room_name_required: "방 이름을 입력해주세요",
        login_required: "로그인이 필요합니다",
        room_exists: "'{name}' 방이 이미 존재합니다 (코드: {code}).\n이어서 사용하시겠습니까?",
        host_disconnected: "호스트 연결이 끊어졌습니다.",
        room_exists_title: "방이 이미 존재합니다",
        room_exists_msg: "'{name}' 방은 이미 활성화되어 있습니다. 이어서 사용하시겠습니까?",
        reuse_room: "이어서 사용하기",
        change_name: "이름 변경하기",
        name_taken_error: "이미 사용 중인 방 이름입니다.",
        added_to_queue: "대기열에 추가되었습니다!",
        failed_add: "곡 추가 실패",
        pro_tip: "💡 꿀팁",
        pro_tip_desc: "이 브라우저에서 <span class='text-gray-800 dark:text-white'>유튜브 프리미엄</span>에 로그인하면 광고 없이 재생됩니다.",
        settings: "설정",
        language: "언어 (Language)",
        logout: "로그아웃",
        join: "입장",
        room_not_found: "방을 찾을 수 없습니다",
        active_rooms: "현재 활성화된 방",
        no_active_rooms: "활성화된 방이 없습니다",
        confirm_delete: "이 곡을 삭제하시겠습니까?",
        volume: "볼륨",
        volume: "볼륨",
        songs_count: "{count}곡",
        playlist_summary: "총 {count}곡 • {duration}",
        undo: "실행취소",
        unknown: "알 수 없음",
        song_deleted: "{title} 곡이 삭제되었습니다",
        action_undone: "삭제가 취소되었습니다",
        delete_room: "방 삭제",
        confirm_delete_room: "정말로 방을 삭제하시겠습니까?",
        host_disconnected_title: "연결 끊김",
        host_disconnected_msg: "호스트가 세션을 종료했거나 연결이 끊어졌습니다.",
        return_home: "홈으로 돌아가기",
        reconnect: "다시 연결",
        leave_room: "방 나가기",
        room_code: "방 코드",
        shared_control: "공유 제어",
        last_controller: "마지막 조작",
        shuffle_on: "셔플 켜짐",
        shuffle_off: "셔플 꺼짐",
        sign_in_google: "구글 계정으로 로그인",
        no_results: "검색 결과가 없습니다",
        private_room: "비공개 방",
        private_room_hint: "방 목록에 표시되지 않습니다",
        host_control_only: "제어 권한이 없습니다",
        dark_mode: "다크 모드",
        delete: "삭제",
        update_available: "새로운 버전 사용 가능",
        update_desc: "새로운 버전 {version}이(가) 출시되었습니다. 업데이트를 위해 새로고침해 주세요.",
        refresh: "새로고침",
        error_oops: "앗, 방을 찾을 수 없어요!",
        error_desc_participant: "입력하신 코드에 해당하는 방을 찾을 수 없습니다.<br/>방이 방금 만들어졌다면 잠시 후 새로고침 해보세요!",
        error_desc_host: "이 방은 존재하지 않습니다.<br/>메인 화면으로 돌아가서 새 방을 만들어주세요.",
        back_to_home: "메인 화면으로",
        host_not_found_title: "호스트를 찾을 수 없습니다",
        waiting_reconnect: "재연결 대기 중...",
        preparing_music: "음악을 준비중입니다.",
        kiosk_mode: "키오스크 모드",
        kiosk_mode_hint: "카페 디스플레이 모드",
        scan_to_request: "스캔하여 곡 신청",
        exit_kiosk: "키오스크 모드 종료",
        exit_kiosk_desc: "일반 플레이어 화면으로 돌아갑니다.",
        cancel_btn: "취소",
        exit_btn: "나가기",
        requested_by: "신청",
        song_too_long: "{minutes}분 이상의 노래는 추가할 수 없습니다"
    }
};

let currentLang = 'en';

export function initLanguage() {
    const saved = localStorage.getItem('ejtunes_lang');
    if (saved) {
        currentLang = saved;
    } else {
        // Detect browser language
        const browserLang = navigator.language || navigator.userLanguage;
        currentLang = browserLang.startsWith('ko') ? 'ko' : 'en';
    }
    document.documentElement.lang = currentLang;
    return currentLang;
}

export function setLanguage(lang) {
    if (resources[lang]) {
        currentLang = lang;
        localStorage.setItem('ejtunes_lang', lang);
        document.documentElement.lang = lang;
        updatePageText();
        return true;
    }
    return false;
}

export function t(key, params = {}) {
    let text = resources[currentLang][key] || resources['en'][key] || key;

    // Replace params like {name}
    Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return text;
}

export function updatePageText() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        // Handle placeholders for inputs
        if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
            el.placeholder = t(key);
        } else {
            // Always use innerHTML to support user formatting like <br/>
            el.innerHTML = t(key);
        }
    });
}
