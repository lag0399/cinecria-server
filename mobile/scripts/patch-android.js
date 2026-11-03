/**
 * Ajusta o AndroidManifest.xml gerado pelo "npx cap add android":
 * permissões de microfone/câmera (WebRTC), tela ligada e tráfego HTTP na rede local.
 * Também instala a captura de tela nativa (mobile/native/android) no projeto gerado.
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
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
];
const features = ['android.hardware.camera', 'android.hardware.microphone'];

const add = [];
for (const p of perms) if (!xml.includes(`"${p}"`)) add.push(`    <uses-permission android:name="${p}" />`);
for (const f of features) if (!xml.includes(`"${f}"`)) add.push(`    <uses-feature android:name="${f}" android:required="false" />`);
if (add.length) xml = xml.replace('</manifest>', `${add.join('\n')}\n</manifest>`);

// IP local do PC é http:// (sem TLS)
if (!xml.includes('usesCleartextTraffic')) xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');

// Serviço em primeiro plano da captura de tela
if (!xml.includes('.ScreenCaptureService')) {
  xml = xml.replace('</application>', `    <service android:name=".ScreenCaptureService" android:exported="false" android:foregroundServiceType="mediaProjection" />\n    </application>`);
}

fs.writeFileSync(manifest, xml);
console.log(`✓ AndroidManifest ajustado (${add.length} itens adicionados)`);

// Código do plugin: a pasta android/ é gerada, a fonte fica em mobile/native/android
const nativeSrc = path.join(__dirname, '..', 'native', 'android');
const javaOut = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'cinecria', 'app');
fs.mkdirSync(javaOut, { recursive: true });
for (const f of fs.readdirSync(nativeSrc)) fs.copyFileSync(path.join(nativeSrc, f), path.join(javaOut, f));

// Biblioteca nativa do WebRTC, usada só na conexão local entre a captura e o WebView
const gradleFile = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const WEBRTC_DEP = "implementation 'io.getstream:stream-webrtc-android:1.3.10'";
let gradle = fs.readFileSync(gradleFile, 'utf8');
if (!gradle.includes('stream-webrtc-android')) {
  if (!/dependencies\s*\{/.test(gradle)) throw new Error('Bloco dependencies não encontrado em android/app/build.gradle');
  gradle = gradle.replace(/dependencies\s*\{/, (m) => `${m}\n    ${WEBRTC_DEP}`);
  fs.writeFileSync(gradleFile, gradle);
}
console.log('✓ Captura de tela nativa instalada');
