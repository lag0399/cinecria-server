/**
 * Ajusta o AndroidManifest.xml gerado pelo "npx cap add android":
 * permissões de microfone/câmera (WebRTC), tela ligada e tráfego HTTP na rede local.
 * Idempotente — pode rodar quantas vezes quiser.
 */
const fs = require('fs');
const path = require('path');

const manifest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) {
  console.log('• Projeto Android ainda não existe — rode "npm run setup" primeiro.');
  process.exit(0);
}

let xml = fs.readFileSync(manifest, 'utf8');
const perms = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.CAMERA',
  'android.permission.WAKE_LOCK',
];
const features = ['android.hardware.camera', 'android.hardware.microphone'];

const add = [];
for (const p of perms) if (!xml.includes(`"${p}"`)) add.push(`    <uses-permission android:name="${p}" />`);
for (const f of features) if (!xml.includes(`"${f}"`)) add.push(`    <uses-feature android:name="${f}" android:required="false" />`);
if (add.length) xml = xml.replace('</manifest>', `${add.join('\n')}\n</manifest>`);

// IP local do PC é http:// (sem TLS)
if (!xml.includes('usesCleartextTraffic')) xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');

fs.writeFileSync(manifest, xml);
console.log(`✓ AndroidManifest ajustado (${add.length} itens adicionados)`);
