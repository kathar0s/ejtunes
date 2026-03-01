import { ref, onValue } from 'firebase/database';
import { db } from './firebase-config';
import { APP_VERSION } from './version';
import { toast } from './utils';
import { t } from './i18n';

let notified = false;

function isNewerVersion(latest, current) {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (latestParts[i] > currentParts[i]) return true;
        if (latestParts[i] < currentParts[i]) return false;
    }
    return false;
}

export function initVersionChecker() {
    const versionRef = ref(db, 'app_settings/version');
    onValue(versionRef, (snapshot) => {
        const remoteVersion = snapshot.val();
        if (!remoteVersion || notified) return;
        if (isNewerVersion(remoteVersion, APP_VERSION)) {
            notified = true;
            toast.show(t('update_desc', { version: remoteVersion }), {
                duration: 60000,
                onUndo: () => window.location.reload(),
                undoText: t('refresh'),
            });
        }
    });
}
