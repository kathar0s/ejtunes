import { auth, provider } from './firebase-config';
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { initLanguage, setLanguage, updatePageText } from './i18n';

// Init I18n
initLanguage();
updatePageText();

// Elements
const loginBtn = document.getElementById('login-btn');
const loginLangOptions = document.querySelectorAll('.login-lang-option');

// Language UI Update
const updateLoginLangUI = () => {
    const currentLang = document.documentElement.lang || 'en';
    loginLangOptions.forEach(opt => {
        if (opt.dataset.lang === currentLang) {
            opt.classList.remove('opacity-50');
            opt.classList.add('opacity-100');
        } else {
            opt.classList.add('opacity-50');
            opt.classList.remove('opacity-100');
        }
    });
};

// Setup Listeners
loginLangOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        setLanguage(opt.dataset.lang);
        updateLoginLangUI();
    });
});

// Init UI
updateLoginLangUI();

// Login Action
loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(console.error);
});

// Auth State Monitor
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Redirect Logic
        const params = new URLSearchParams(window.location.search);
        const redirectTarget = params.get('redirect');

        if (redirectTarget === 'host') {
            window.location.href = '/host';
        } else if (redirectTarget === 'participant') {
            // Future: might want strict participant redirect
            window.location.href = '/';
        } else {
            // Default to root (Room Select)
            window.location.href = '/';
        }
    }
});
