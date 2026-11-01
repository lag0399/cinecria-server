/**
 * Copia a UI compartilhada (app/renderer) para mobile/www — o Capacitor empacota essa pasta.
 * Uma única base de código: qualquer melhoria na UI do desktop chega ao Android no próximo "npm run sync".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'app', 'renderer');
const OUT = path.join(ROOT, 'www');
const SIO = path.join(ROOT, 'node_modules', 'socket.io-client', 'dist', 'socket.io.min.js');

if (!fs.existsSync(SRC)) throw new Error(`UI não encontrada em ${SRC}`);
if (!fs.existsSync(SIO)) throw new Error('socket.io-client ausente — rode "npm install" na pasta mobile.');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.copyFileSync(SIO, path.join(OUT, 'vendor', 'socket.io.min.js'));

const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
// 1) socket.io vem de www/vendor (no desktop vem de ../node_modules)
html = html.replace('../node_modules/socket.io-client/dist/socket.io.min.js', 'vendor/socket.io.min.js');
// 2) o Capacitor injeta a ponte nativa como <script> inline no <head> — a CSP precisa permitir
html = html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
fs.writeFileSync(indexPath, html);

console.log('✓ UI copiada para mobile/www');
