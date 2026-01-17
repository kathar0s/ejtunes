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

    // 4. Git Tag & Push
    console.log('Creating Git tag and pushing to GitHub...');
    execSync(`git add .`, { stdio: 'inherit' });
    execSync(`git commit -m "Chore: Release v${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    // Using simple git push as origin and master are standard
    execSync(`git push origin master --tags`, { stdio: 'inherit' });

    // 5. Create GitHub Release
    console.log('Creating GitHub Release...');
    const releaseCommand = `gh release create v${newVersion} --title "Release v${newVersion}" --notes "Automated release for version ${newVersion}"`;
    execSync(releaseCommand, { stdio: 'inherit' });

    console.log(`\n🚀 version ${newVersion} has been pushed to GitHub!`);
    console.log(`GitHub Actions will now automatically handle the build and Firebase deployment.`);
    console.log(`You can track the progress in the 'Actions' tab.`);
} catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
}
