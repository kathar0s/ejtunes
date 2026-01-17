/**
 * Shared Utilities for Office DJ
 */

/**
 * Decodes HTML entities (e.g., &#39; -> ')
 * @param {string} str 
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

/**
 * Gets high resolution thumbnail for YouTube video
 * @param {string} videoId 
 * @returns {string}
 */
export function getHighResThumbnail(videoId) {
    if (!videoId) return null;
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Toast Notification System with Undo support
 */
export class ToastManager {
    constructor() {
        // We'll create container on demand or reuse existing
    }

    show(message, options = {}) {
        const { duration = 5000, onUndo = null, undoText = 'UNDO', isError = false } = options;

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-full max-w-[95vw] md:max-w-md pointer-events-none px-4';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-4 text-sm font-medium transition-all animate-fade-in-up border w-full ${isError ? 'bg-red-500 text-white border-red-400' : 'bg-gray-900 text-white border-white/10'}`;

        const textSpan = document.createElement('span');
        textSpan.className = 'flex-1 leading-relaxed break-words';
        textSpan.textContent = message;
        toast.appendChild(textSpan);

        if (onUndo) {
            const undoBtn = document.createElement('span');
            undoBtn.className = 'text-blue-400 font-bold hover:underline cursor-pointer whitespace-nowrap flex-shrink-0 ml-2';
            undoBtn.textContent = undoText;
            undoBtn.onclick = () => {
                onUndo();
                this.dismiss(toast);
            };
            toast.appendChild(undoBtn);
        }

        container.appendChild(toast);

        // Auto dismiss
        setTimeout(() => {
            this.dismiss(toast);
        }, duration);
    }

    dismiss(toast) {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300);
    }
}

export const toast = new ToastManager();
