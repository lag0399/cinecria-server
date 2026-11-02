/**
 * Configuração do cliente Cinecria.
 * Edite aqui o servidor padrão e os servidores ICE (STUN/TURN).
 */
(function () {
  // Servidor oficial. A tela de entrada mostra o endereço travado (não editável) e
  // ignora qualquer endereço antigo salvo no aparelho.
  const OFFICIAL = 'https://cinecria-server.onrender.com';
  const isNative = !!window.Capacitor?.isNativePlatform?.();
  // Aberto pelo próprio site do servidor (Render, ou http://localhost:3001 em testes): mesma origem.
  // App desktop (file://) e Android (Capacitor): sempre o oficial.
  const servedByServer = !isNative && /^https?:$/.test(location.protocol);
  window.__CINECRIA_SERVER__ = servedByServer ? location.origin : OFFICIAL;
})();

window.CINECRIA_CONFIG = {
  serverUrl: window.__CINECRIA_SERVER__,
  // true = endereço travado na entrada. Para desenvolver com um servidor local no app desktop,
  // mude para false (volta o campo editável) ou abra http://localhost:3001 no navegador.
  lockServer: true,
  defaultServerUrl: window.__CINECRIA_SERVER__,
  defaultPort: 3001,

  // Busca de GIFs para a foto de perfil (GIPHY). A API do Tenor foi desligada pelo Google
  // em 30/06/2026. Pegue uma chave grátis em https://developers.giphy.com/dashboard/
  // (chave beta: 100 buscas/hora para TODO o app). Sem chave, o usuário ainda pode colar
  // o link de um GIF do GIPHY.
  gifApiKey: '',
  gifRating: 'pg-13',

  // Foto de perfil: GIF animado é enviado como está (até 2 MB); outras imagens são recortadas.
  maxAvatarMB: 2,

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
    'source':  { label: '★ Nativa 60FPS (Recomendado)', width: null, height: null, fps: 60, bitrate: 20_000_000 },
  },
  // Sempre selecionado ao abrir "Compartilhar tela" (resolução original da tela, 60 FPS).
  defaultScreenPreset: 'source',
  recommendedScreenPreset: 'source',

  camera: { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
};
