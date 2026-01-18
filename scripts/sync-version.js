import admin from 'firebase-admin';
import fs from 'fs';

async function syncVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        const version = pkg.version;

        console.log(`Syncing version ${version} to Realtime Database...`);

        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://ejtunes-music-default-rtdb.asia-southeast1.firebasedatabase.app"
        });

        const db = admin.database();
        await db.ref('app_settings/version').set(version);

        console.log('✅ Version sync successful!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to sync version:', error.message);
        process.exit(1);
    }
}

syncVersion();
