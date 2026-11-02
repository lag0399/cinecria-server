# 🎬 Cinecria

> 📱 Versão Android: veja [`mobile/README.md`](mobile/README.md) · 🆕 Novidades da 1.1 (visual "Sala Escura", volume individual, emojis e mídia no chat): [`ATUALIZACAO-1.1.md`](ATUALIZACAO-1.1.md). · 🆕 1.2 (menções, câmera vertical, PiP, tela preta em streamings): [`ATUALIZACAO-1.2.md`](ATUALIZACAO-1.2.md). · 🆕 1.3 (qualidade da transmissão, estatísticas, chat da sala): [`ATUALIZACAO-1.3.md`](ATUALIZACAO-1.3.md). · 🆕 1.4 (paleta azul, BETA, foto com GIF, servidor oficial): [`ATUALIZACAO-1.4.md`](ATUALIZACAO-1.4.md).

Assista junto com seus amigos: servidores, canais de texto e de voz, e **compartilhamento de tela em alta qualidade** (até 1440p/60 FPS com áudio do sistema). Sem cadastro: apelido + foto e pronto.

---

## 1. Arquitetura

```
cinecria/
├── server/                     # Servidor de sinalização (Node.js + Socket.io)
│   ├── index.js                #   sessões, servidores, convites, chat, presença, relay WebRTC
│   └── package.json
├── mobile/                     # App Android (Capacitor) — reaproveita app/renderer, veja mobile/README.md
└── app/                        # Aplicativo desktop (Electron)
    ├── main.js                 #   janela, desktopCapturer, getDisplayMedia + áudio loopback
    ├── preload.js              #   ponte segura (contextBridge) → window.cinecria
    ├── package.json            #   scripts + configuração do electron-builder (.exe)
    ├── build/
    │   ├── icon.ico            #   ícone do .exe / instalador
    │   └── icon.png            #   ícone da janela
    └── renderer/               #   UI (HTML/CSS/JS puro — também roda no navegador)
        ├── index.html
        ├── styles.css          #   tema escuro, layout estilo Discord
        └── js/
            ├── config.js       #   URL do servidor, STUN/TURN, presets de qualidade
            ├── rtc.js          #   VoiceSession: WebRTC mesh, perfect negotiation, tuning
            ├── app.js          #   estado + renderização + seletor de tela + modais
            └── vendor-fallback.js
```

### Como as peças conversam

```
 ┌──────────── Cinecria (Electron) ────────────┐        ┌──── server/index.js ────┐
 │ renderer  ── Socket.io (chat, presença) ────┼──────► │ servidores · canais     │
 │    │       ── SDP / ICE (sinalização) ──────┼──────► │ convites · histórico    │
 │    │                                        │        │ relay de "signal"       │
 │ preload ⇄ main.js (desktopCapturer)         │        └─────────────────────────┘
 └────┼────────────────────────────────────────┘
      │  áudio · câmera · TELA  (WebRTC P2P, criptografado DTLS-SRTP)
      ▼
 outros participantes do canal de voz (uma RTCPeerConnection por pessoa)
```

- **Sinalização**: o servidor só repassa mensagens; nenhuma mídia passa por ele.
- **Mídia**: malha (mesh) P2P. Cada pessoa no canal mantém uma conexão com cada outra.
- **Identificação de streams**: microfone, câmera e tela vão em `MediaStream`s separados; o `id` de cada um é publicado no estado do usuário (`micStreamId`, `camStreamId`, `screenStreamId`), então quem recebe sabe o que é cada vídeo.
- **Renegociação**: *perfect negotiation* — ligar câmera ou tela no meio da chamada só adiciona a trilha; não há colisão de ofertas.

### Qualidade do "Cine"

| Ajuste | Onde | O que faz |
|---|---|---|
| Presets 720p30 → Nativa 60 | `config.js` | resolução, FPS e bitrate máximo por espectador |
| `contentHint` motion/detail | seletor de tela | "Fluidez" mantém os 60 FPS; "Nitidez" mantém a resolução |
| `degradationPreference` + `maxBitrate` + `priority: high` | `rtc.js → applyParams` | o encoder não derruba a qualidade à toa |
| Áudio do sistema sem AEC/NS/AGC | `startScreen` | música e efeitos não são "limpos" como se fossem voz |
| Opus estéreo 256 kbps | `enableOpusStereo` | áudio de filme em estéreo |
| `disable-renderer-backgrounding` | `main.js` | não perde FPS com o app minimizado |

---

## 2. Rodando em desenvolvimento

Pré-requisito: **Node.js 18+** (recomendado 20 LTS).

```bash
# Terminal 1 — servidor
cd server
npm install
npm start            # → http://localhost:3001

# Terminal 2 — app desktop
cd app
npm install
npm start            # ou: npm run dev  (abre o DevTools)
```

**Testar sozinho com 2 participantes:** com o servidor rodando, abra `http://localhost:3001` no Chrome. É a mesma interface, servida pelo próprio servidor. Entre com um apelido no app e outro no navegador, os dois no mesmo canal de voz.

---

## 3. Gerando o `.exe` para Windows

```bash
cd app
npm install
npm run dist             # instalador NSIS + versão portátil
# ou
npm run dist:portable    # só o .exe portátil (não precisa instalar)
```

Saída em `app/dist/`:

- `Cinecria-Setup-1.0.0.exe` → instalador (atalho na área de trabalho e no menu Iniciar)
- `Cinecria-Portable-1.0.0.exe` → executável único, roda direto

Observações:
- Gere o build **no Windows** (ou use CI com runner Windows). No Linux/macOS o electron-builder precisa do Wine.
- Sem assinatura de código, o Windows SmartScreen mostra "Editor desconhecido" na primeira execução (*Mais informações → Executar assim mesmo*). Para distribuir publicamente, assine com um certificado de code signing (`win.certificateFile` / `CSC_LINK`).
- Antes de distribuir, troque `defaultServerUrl` em `renderer/js/config.js` pelo endereço do seu servidor público, ou cada pessoa informa o endereço em **Servidor Cinecria** na tela de entrada.

---

## 4. Colocando online para os amigos

1. **Servidor de sinalização**: hospede `server/` em qualquer serviço Node (VPS, Railway, Render, Fly.io…). Use HTTPS/WSS na frente (Caddy ou Nginx) — ex.: `https://cinecria.seudominio.com`.
2. **TURN** (recomendado): STUN resolve a maioria das redes domésticas, mas 4G, redes de empresa e NAT simétrico precisam de TURN. Instale o [coturn](https://github.com/coturn/coturn) na mesma VPS e adicione em `config.js`:
   ```js
   { urls: 'turn:cinecria.seudominio.com:3478', username: 'cinecria', credential: 'sua-senha' }
   ```
3. Libere as portas: `3001` (ou 443 via proxy), `3478` TCP/UDP e a faixa de relay do coturn (ex.: `49152-65535/udp`).

---

## 5. Limites atuais e próximos passos

- **Mesh P2P ≈ até 5–6 pessoas transmitindo/assistindo.** Cada espectador recebe um encode separado: 1080p60 a 9 Mbps para 4 amigos ≈ 36 Mbps de upload. O seletor de tela mostra essa estimativa. Para salas maiores, troque o mesh por um **SFU** ([LiveKit](https://livekit.io) ou [mediasoup](https://mediasoup.org)): quem transmite envia uma vez (com simulcast) e o SFU distribui. A troca fica toda em `rtc.js`; o resto da UI não muda.
- **Eco do áudio do sistema**: no Windows, o loopback captura *toda* a saída de som, incluindo a voz dos amigos tocando no Cinecria, então eles podem se ouvir com atraso. A solução definitiva é um módulo nativo com *WASAPI Process Loopback* (Windows 10 2004+) para capturar só o app/jogo escolhido ou excluir o processo do Cinecria. Enquanto isso, quem transmite pode silenciar a sala (botão de fone) durante o filme.
- **Áudio do sistema** só no Windows (macOS exige driver virtual de áudio).
- **Estado em memória**: reiniciar o servidor apaga servidores criados e histórico. Para persistir, troque os `Map`s por SQLite/Redis.
- **Sem moderação**: qualquer membro cria canais. Para uso público, adicione dono/admin (o `ownerId` já é guardado).

Atalhos: `Ctrl+Shift+M` silencia o microfone · `Ctrl+Shift+D` desativa o áudio · duplo clique num vídeo = tela cheia.
