/* Draait in de GitHub-build, na "npx cap add android".
   1) Voegt de benodigde Android-permissies toe aan AndroidManifest.
   2) Zet compressie uit voor modelbestanden, anders komen de .bin-gewichten
      afgekapt binnen in de app-schil ("byte length of Float32Array ..."). */
const fs = require('fs');

// --- 1. permissies ---
const manifest = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(manifest, 'utf8');
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
for (const p of perms) if (!m.includes(p)) inject += `    <uses-permission android:name="${p}" />\n`;
if (!m.includes('android.hardware.camera')) inject += `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n`;
if (inject) { m = m.replace(/(<manifest[^>]*>)/, `$1\n${inject}`); fs.writeFileSync(manifest, m); console.log('Permissies toegevoegd.'); }
else console.log('Permissies stonden er al in.');

// --- 2. modelbestanden niet comprimeren ---
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
if (!g.includes('noCompress')) {
  g = g.replace(/android\s*\{/, match => match + `\n    androidResources {\n        noCompress += ['bin', 'json']\n    }\n`);
  fs.writeFileSync(gradle, g);
  console.log('noCompress voor bin/json toegevoegd aan build.gradle.');
} else {
  console.log('noCompress stond er al in.');
}
