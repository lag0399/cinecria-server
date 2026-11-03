# 📱 Cinecria Mobile (Android)

O app Android usa **a mesma interface e o mesmo módulo WebRTC do desktop** (`app/renderer`), empacotados com o [Capacitor](https://capacitorjs.com). Ele conversa com o mesmo `server/index.js` na porta 3001: quem está no celular aparece nos mesmos servidores, canais e salas de voz de quem está no PC.

## Por que Capacitor e não React Native?

| | Capacitor (escolhido) | React Native |
|---|---|---|
| Código | **reaproveita 100%** do `app/renderer` (UI, chat, canais, `rtc.js`) | reescrever a UI inteira + trocar o WebRTC por `react-native-webrtc` |
| Uma correção | vale para PC, navegador e Android ao mesmo tempo | precisa ser feita duas vezes |
| WebRTC | o do Chromium (WebView do Android), o mesmo do Electron | módulo nativo |
| Transmitir a tela **do celular** | ✅ plugin nativo (`mobile/native/android`), só imagem | ✅ via MediaProjection |

No celular você **assiste às telas, fala, ouve, liga a câmera e transmite a tela** (só a imagem). Veja "Transmitir a tela do celular" em Detalhes técnicos.

## Estrutura

```
cinecria/
├── server/                    # o MESMO servidor do PC (nada muda)
├── app/renderer/              # UI compartilhada — agora responsiva:
│   ├── styles.css             #   + bloco MOBILE (gaveta, palco vertical, paisagem, bottom sheets)
│   └── js/app.js              #   + gaveta, gestos, botão voltar, tela cheia, tela sempre ligada
└── mobile/
    ├── capacitor.config.json  # appId, HTTP liberado para IP local, cores
    ├── package.json           # scripts setup / sync / run / apk
    ├── assets/                # ícone e splash (gerados para todas as densidades)
    ├── scripts/
    │   ├── copy-web.js        # copia app/renderer → www e ajusta socket.io + CSP
    │   └── patch-android.js   # permissões (microfone, câmera, wake lock, HTTP local) + captura de tela
    ├── native/android/        # código Java da captura de tela (copiado para android/ pelo patch)
    └── android/               # gerado pelo "npm run setup" (projeto Android Studio)
```

## O que mudou na interface para o celular

- **Entrada**: apelido, foto (presets ou galeria) e **endereço do servidor sempre visível**. Digitar só `192.168.0.10` já vira `http://192.168.0.10:3001`. Botão **Testar conexão** (consulta `/health`) e atalho **Emulador Android** (`10.0.2.2`). Nome, foto e IP ficam salvos no aparelho.
- **Gaveta lateral**: ☰ no topo ou arrastar da borda esquerda abre servidores + canais. Tocar num canal fecha a gaveta. Membros abrem numa gaveta à direita.
- **Palco ("Cine")**: transmissão em 16:9 no topo e participantes em grade de 2 colunas. Deitando o celular: transmissão à esquerda, participantes em coluna à direita.
- **Tela cheia**: toque em ⛶ → o vídeo ocupa a tela, gira para paisagem e esconde a barra de status.
- **Botão voltar do Android**: fecha modal → tela cheia → gavetas → sai do palco, nessa ordem.
- **Tela sempre ligada** enquanto estiver num canal de voz.
- O botão "Tela" abre "Transmitir do celular": a tela do aparelho (no APK) ou um vídeo da galeria.

## Rodando

Pré-requisitos: Node 18+, **Android Studio** (com SDK e um emulador ou celular com depuração USB).

```bash
# 1) servidor no PC (o mesmo de sempre)
cd server && npm install && npm start

# 2) app Android
cd mobile
npm install
npm run setup     # 1ª vez: copia a UI, cria a pasta android/ e aplica as permissões
npm run run       # compila e instala no emulador/celular conectado
# ou: npm run open  → abre no Android Studio (▶ Run)
```

Depois de mexer em `app/renderer`, rode `npm run sync` para levar as mudanças ao Android.

### Qual endereço digitar na tela de entrada

| Onde o app está | Endereço |
|---|---|
| Emulador do Android Studio | `10.0.2.2` (botão **Emulador Android**) |
| Celular no mesmo Wi-Fi do PC | IP do PC — no Windows: `ipconfig` → "Endereço IPv4" (ex.: `192.168.0.10`) |
| Servidor na internet (Render etc.) | `https://seu-app.onrender.com` |

> `localhost` no celular é o próprio celular — o app avisa se você digitar isso.
> Na primeira vez, o **Firewall do Windows** pergunta se o Node pode aceitar conexões: marque **Redes privadas**.

## Gerando o APK

```bash
npm run apk            # APK de teste → android/app/build/outputs/apk/debug/app-debug.apk
```

Mande o `app-debug.apk` para os amigos (eles precisam permitir "instalar apps desconhecidos"). Para distribuir de verdade ou publicar na Play Store, gere uma build assinada no Android Studio (**Build → Generate Signed Bundle / APK**).

No macOS/Linux, troque `gradlew` por `./gradlew` nos scripts. Ícones: `npm run icons` gera todos os tamanhos a partir de `assets/`.

## Detalhes técnicos

- **HTTP na rede local**: o app roda em `https://localhost` (origem segura, exigida pelo microfone/câmera). Conectar a `http://192.168.x.x` é "conteúdo misto", por isso `allowMixedContent` + `usesCleartextTraffic`. Com servidor HTTPS na internet nada disso é necessário.
- **Permissões**: o Capacitor converte o pedido de microfone/câmera do WebRTC em pedido de permissão do Android automaticamente; o `patch-android.js` só declara as permissões no manifest.
- **Plugins nativos** (acessados por `Capacitor.Plugins`, sem bundler): `App` (botão voltar), `StatusBar`, `ScreenOrientation`, `KeepAwake`. Fora do Android, o código ignora todos eles.
- **Transmitir a tela do celular**: o WebView não tem `getDisplayMedia`. O plugin `ScreenCapture` captura com `MediaProjection` (dentro de um Foreground Service) e manda o vídeo ao WebView por uma conexão WebRTC local, no próprio aparelho, usando a biblioteca `stream-webrtc-android`. O `rtc.js` recebe uma faixa de vídeo comum e a transmite para a sala como no PC. Limites: só imagem, sem áudio, e o vídeo é codificado duas vezes, por isso a captura vai até 1280 px no lado maior. Edite o Java em `native/android`, nunca em `android/`: o `npm run sync` sobrescreve.
- **Consumo de dados**: assistir a uma transmissão 1080p60 recebe até ~9 Mbps (≈ 4 GB por hora). No 4G, peça para quem transmite usar 720p.

## Próximos passos

1. **Áudio na transmissão da tela do celular**: capturar com `AudioPlaybackCapture` (Android 10+).
2. **Voz com o app em segundo plano**: o Android pausa o WebView; para manter a chamada com a tela apagada é preciso um Foreground Service com notificação ("Em chamada no Cinecria").
3. **TURN** para 4G (veja o README principal).
