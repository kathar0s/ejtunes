import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const VERSION_FILE = './src/version.js';

function getNextVersion(current) {
    const parts = current.split('.');
    parts[2] = parseInt(parts[2]) + 1;
    return parts.join('.');
}

try {
    // 1. Read current version
    console.log('Reading current version...');
    const content = fs.readFileSync(VERSION_FILE, 'utf8');
    const versionMatch = content.match(/APP_VERSION = '(.+)'/);
    if (!versionMatch) throw new Error('Could not find version in ' + VERSION_FILE);

    const currentVersion = versionMatch[1];
    const newVersion = getNextVersion(currentVersion);
    console.log(`Upgrading version: ${currentVersion} -> ${newVersion}`);

    // 2. Update version file
    fs.writeFileSync(VERSION_FILE, `export const APP_VERSION = '${newVersion}';\n`);

    // 3. Update package.json
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');

    // 4. Build project
    console.log('Building project...');
    execSync('npm run build', { stdio: 'inherit' });

    // 5. Deploy to Firebase
    console.log('Deploying to Firebase Hosting...');
    execSync('firebase deploy --only hosting', { stdio: 'inherit' });

    // 6. Update Version in Firebase Database
    console.log('Syncing new version to Firebase Database...');
    const dbCommand = `firebase database:set /app_settings/version '"${newVersion}"' -f --instance ejtune-default-rtdb`;
    execSync(dbCommand, { stdio: 'inherit' });

    // 7. Git Tag & Push
    console.log('Creating Git tag...');
    execSync(`git add .`, { stdio: 'inherit' });
    execSync(`git commit -m "Chore: Release v${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
    execSync(`git push origin master --tags`, { stdio: 'inherit' });

    // 8. Create GitHub Release
    console.log('Creating GitHub Release...');
    const releaseCommand = `gh release create v${newVersion} --title "Release v${newVersion}" --notes "Automated release for version ${newVersion}"`;
    execSync(releaseCommand, { stdio: 'inherit' });

    console.log(`\n✅ Successfully deployed and released version ${newVersion}!`);
} catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
}
