export class ThemeManager {
    constructor() {
        this.storageKey = 'ejtunes_theme';
        this.init();
    }

    init() {
        // Check local storage or system preference
        const savedTheme = localStorage.getItem(this.storageKey);

        if (savedTheme === 'dark') {
            this.setDark(true);
        } else if (savedTheme === 'light') {
            this.setDark(false);
        } else {
            // No preference saved, check system
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.setDark(prefersDark);
        }

        // Listen for system changes if no preference is saved? 
        // For now, manual override wins.
    }

    setDark(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
            localStorage.setItem(this.storageKey, 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            localStorage.setItem(this.storageKey, 'light');
        }
        this.updateToggles();
    }

    toggle() {
        const isDark = document.documentElement.classList.contains('dark');
        this.setDark(!isDark);
    }

    // Helper to sync all toggle switches in the DOM
    updateToggles() {
        const isDark = document.documentElement.classList.contains('dark');
        const toggles = document.querySelectorAll('.theme-toggle-input');
        toggles.forEach(toggle => {
            toggle.checked = isDark;
        });
    }

    // Bind a specific toggle element
    bindToggle(elementId) {
        const toggle = document.getElementById(elementId);
        if (toggle) {
            toggle.classList.add('theme-toggle-input'); // Add marker class
            toggle.checked = document.documentElement.classList.contains('dark');
            toggle.addEventListener('change', (e) => {
                this.setDark(e.target.checked);
            });
        }
    }
}

export const themeManager = new ThemeManager();
