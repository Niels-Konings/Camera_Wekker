/* Voegt de benodigde Android-permissies toe aan het gegenereerde AndroidManifest.
   Draait in de GitHub-build, na "npx cap add android". */
const fs = require('fs');
const path = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(path, 'utf8');

const perms = [
  'android.permission.CAMERA',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED'
];

let inject = '';
for (const p of perms) {
  if (!m.includes(p)) inject += `    <uses-permission android:name="${p}" />\n`;
}
if (!m.includes('android.hardware.camera')) {
  inject += `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n`;
}

if (inject) {
  m = m.replace(/(<manifest[^>]*>)/, `$1\n${inject}`);
  fs.writeFileSync(path, m);
  console.log('Permissies toegevoegd:\n' + inject);
} else {
  console.log('Alle permissies stonden er al in.');
}
