/**
 * Configuração do cliente Cinecria.
 * Edite aqui o servidor padrão e os servidores ICE (STUN/TURN).
 */
window.CINECRIA_CONFIG = {
  // - App Android (Capacitor): o usuário informa o IP do PC na tela de entrada.
  // - Navegador servido pelo servidor: mesma origem.  - Electron (file://): localhost.
  defaultServerUrl: window.Capacitor?.isNativePlatform?.() ? ''
    : location.protocol.startsWith('http') ? location.origin : 'http://localhost:3001',
  defaultPort: 3001,

  // Limites dos anexos do chat (o servidor valida de novo: MAX_IMAGE_MB / MAX_VIDEO_MB)
  maxImageMB: 15,
  maxVideoMB: 100,

  // STUN resolve a maioria das redes domésticas. Para redes restritivas (4G, empresas,
  // NAT simétrico) adicione um TURN próprio (ex.: coturn) — veja o README.
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // { urls: 'turn:SEU_IP_OU_DOMINIO:3478', username: 'cinecria', credential: 'troque-esta-senha' },
  ],

  // Perfis de qualidade do compartilhamento de tela.
  // bitrate = teto por espectador (no mesh, o upload total = bitrate × espectadores).
  // É um TETO: o WebRTC sobe até ele conforme a rede aguenta (começa em ~4 Mbps, ver rtc.js).
  screenPresets: {
    '720p30':  { label: '720p 30FPS',  width: 1280, height: 720,  fps: 30, bitrate: 6_000_000 },
    '1080p30': { label: '1080p 30FPS', width: 1920, height: 1080, fps: 30, bitrate: 10_000_000 },
    '1080p60': { label: '1080p 60FPS', width: 1920, height: 1080, fps: 60, bitrate: 10_000_000 },
    '1440p60': { label: '1440p 60FPS', width: 2560, height: 1440, fps: 60, bitrate: 16_000_000 },
    'source':  { label: 'Nativa 60FPS', width: null, height: null, fps: 60, bitrate: 20_000_000 },
  },
  defaultScreenPreset: '1080p60',

  camera: { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
};
