const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredFiles = [
  'index.html',
  'admin.html',
  'main.js',
  'app/styles.css',
  'app/firebase-client.js',
  'app/safe-content.js',
  'assets/STFD Logo 244x244.png',
  'assets/LOGO 3000X3000.png',
  'sounds/default.mp3',
  'sounds/alarm.mp3',
  'sounds/chime.mp3',
  'deptadmin/index.html',
  'deptadmin/main.js',
  '.firebaserc',
  'firestore.rules',
  'scripts/package-windows.js'
];

const failures = [];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing required file: ${relativePath}`);
}

for (const page of ['index.html', 'admin.html', 'deptadmin/index.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (!/Content-Security-Policy/i.test(html)) failures.push(`${page} is missing a Content Security Policy.`);
  if (/cdn\.tailwindcss\.com/i.test(html)) failures.push(`${page} still loads the Tailwind development CDN.`);
  if (/<script[^>]+src=["']https?:/i.test(html)) failures.push(`${page} still executes a remote script.`);
}

if (pkg.version !== '2.1.0') failures.push('package.json version must be 2.1.0.');
const firebaseProject = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8')).projects?.default;
if (firebaseProject !== 'spfld-twp-fire') failures.push('Firebase deployments must target spfld-twp-fire.');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
for (const requiredRule of [
  'match /dailyTasks/{document}',
  'match /maintenance/{document}',
  'match /addressNotes/{document}',
  'match /unitStatus/{document}',
  'match /artifacts/{appId}/public/data/calls/{document}',
  'match /artifacts/{appId}/public/data/callTrackerConfig/{document}'
]) {
  if (!firestoreRules.includes(requiredRule)) failures.push(`Firestore rules are missing: ${requiredRule}`);
}
if (pkg.scripts.build.includes('--publish always')) failures.push('The ordinary build command must not publish.');
if (!pkg.scripts.release.includes('--publish always')) failures.push('The release command must publish explicitly.');
if (!pkg.scripts.build.includes('npm test')) failures.push('The ordinary build command must run the test suite.');
if (!pkg.scripts.build.includes('package-windows.js')) failures.push('The ordinary build command must use the OneDrive-safe packager.');
if (pkg.build.win.icon !== 'assets/LOGO 3000X3000.png') failures.push('Windows packaging must use the high-resolution icon.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Project validation passed.');
