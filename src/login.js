import { auth, provider } from './firebase-config';
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { initLanguage, setLanguage, updatePageText } from './i18n';

// Init I18n
initLanguage();
updatePageText();

// Elements
const loginBtn = document.getElementById('login-btn');
const loginLangOptions = document.querySelectorAll('.login-lang-option');
const themeToggle = document.getElementById('login-theme-toggle');

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

// Theme Toggle Logic
(function initLoginTheme() {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark && !document.documentElement.classList.contains('light')) {
        document.documentElement.classList.add('dark');
    }

    if (themeToggle) {
        themeToggle.checked = document.documentElement.classList.contains('dark');
        themeToggle.addEventListener('change', (e) => {
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
