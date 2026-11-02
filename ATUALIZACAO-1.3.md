# Cinecria 1.3 — qualidade da transmissão e chat da sala

## Como integrar

Se você não alterou o projeto, substitua a pasta `cinecria/` e **reinicie o servidor**, porque ele mudou. No Android, rode `cd mobile && npm run sync`. Nenhuma dependência nova.

| Arquivo | O que mudou |
|---|---|
| `server/index.js` | `chat:send` aceita canais de voz: cada sala tem o próprio chat (`chat:history` já aceitava) |
| `app/main.js` | switches `enable-gpu-rasterization`, `enable-zero-copy`, `WebRTCPipeWireCapturer` (só Linux) |
| `app/renderer/js/rtc.js` | bitrate de partida/teto na SDP, H.264 → VP9 → VP8, `maintain-resolution`, atraso mínimo no receptor, `videoStats()` |
| `app/renderer/js/config.js` | tetos de bitrate: 720p 6 · 1080p 10 · 1440p60 16 · nativa 20 Mbps |
| `app/renderer/js/app.js` | chat da sala, balões de mensagem, contador, ocultar prévia, estatísticas, aviso de GPU desligada, tela cheia do palco no PC |
| `app/renderer/styles.css` | bloco "1.3" no fim do arquivo |

## 1. Transmissão: borrada, travando e com atraso

### Aceleração de hardware (GPU)
Na 1.2 a GPU **já ficava ligada por padrão**. `app.disableHardwareAcceleration()` só roda se o **modo compatibilidade** for ativado no guia "Tela preta". Se você ativou esse botão, é ele que está causando o problema: o encode de 1440p60 vai todo para a CPU.

- **Novo:** quando o modo compatibilidade está ligado, aparece uma **faixa vermelha** no topo com o botão **"Religar GPU e reiniciar"**. O seletor de tela também avisa antes de você entrar ao vivo.
- O guia da Netflix continua orientando a desligar a aceleração **só no navegador** onde o filme toca.

### Bitrate
O teto já era alto (14 Mbps em 1440p60). Faltava resolver duas coisas que derrubam a qualidade na prática:
- **Arranque lento:** o WebRTC começa em ~300 kbps e sobe aos poucos, então os primeiros segundos ficam borrados. Agora começa em **4 Mbps** (`x-google-start-bitrate`).
- **Teto interno:** algumas versões do Chrome limitam o vídeo a ~2,5 Mbps mesmo com `maxBitrate` maior. Agora o teto também vai na SDP (`x-google-max-bitrate=20000`).
- **Valores pedidos:** 720p 6, 1080p 10 e 1440p60 16 Mbps. São **tetos**: o WebRTC sobe até eles conforme sua rede aguenta. Cada amigo assistindo soma esse valor ao seu upload (o seletor mostra o total).

### Nitidez
- `degradationPreference: 'maintain-resolution'` nos dois modos. Quando falta banda ou CPU, o Chrome **solta quadros em vez de borrar**.
- `scaleResolutionDownBy: 1`, `maxFramerate` do perfil escolhido e `priority`/`networkPriority: 'high'`.
- `contentHint` segue a escolha "Fluidez" (`motion`) ou "Nitidez" (`detail`).

### Codec
- `setCodecPreferences` na ordem **H.264 → VP9 → VP8**.
  - H.264 é o codec com encoder por hardware (NVENC/AMF/QuickSync) no Chrome/Electron para Windows.
  - Se um dos lados não suportar, a negociação cai no próximo da lista.
- **Testado** com duas sessões reais conectadas: o H.264 foi negociado, e o envio ficou com teto de 10 Mbps, 60 fps e `maintain-resolution`.

### Atraso
- `jitterBufferTarget = 0` (e `playoutDelayHint = 0` nas versões antigas) nos receptores de vídeo e do áudio da transmissão. O microfone mantém o buffer padrão, para a voz não picotar.
- **O "pular para o fim do buffer" não se aplica aqui:** vídeo WebRTC (`srcObject`) não acumula buffer como um vídeo de arquivo, então `video.buffered` fica vazio. Quem controla o atraso é o jitter buffer acima.

### Sua prévia
- O `<video>` da sua própria transmissão já era `muted`: o áudio da tela nunca toca de volta no seu PC.
- **Novo:** botão **"Ocultar prévia"** no seu card. Nada é desenhado na sua tela e seus amigos continuam recebendo normalmente.

### Estatísticas (botão ⓘ no card da transmissão)
O painel mostra a causa real quando algo trava ou borra:
- **Quem assiste vê:** resolução, FPS, bitrate, codec, se o **decoder é hardware ou software**, atraso do buffer, ping e perdas.
- **Quem transmite vê, por espectador:** o mesmo, mais **"Limitado por: CPU / rede"** e se o **encoder é hardware**.
- **Encoder "software" com limite por CPU** = GPU desligada ou sem encoder de hardware. **Limite por rede** = seu upload não aguenta aquela qualidade para aquele número de pessoas.

## 2. Chat da sala

- **Onde abrir:** botão 💬 no topo do palco, no dock de controles e, no celular, dentro da tela cheia.
- **Contador vermelho:** mostra as mensagens novas enquanto o painel está fechado.
- **Painel:**
  - No PC fica à direita, com 340 px. O vídeo se ajusta ao espaço restante, sem cortar.
  - No celular é uma gaveta sobreposta; toque fora para fechar.
- **Com o painel fechado:** mensagens novas aparecem como **balões** no canto do palco por 6 s. Tocar num balão abre o chat.
- **Tela cheia no PC:** agora é o **palco inteiro** que vai para tela cheia, com o card escolhido em foco. Assim o chat, os controles e a plateia continuam disponíveis. Duplo clique num card faz o mesmo.
- **Recursos:** o chat da sala tem os mesmos recursos dos canais de texto: fotos, vídeos (inclusive arrastar e soltar sobre o palco), emojis e **@menções**. Menção a você faz o "plim", destaca a mensagem e marca a sala na barra lateral.
- **Um chat por sala:** cada sala de voz tem o próprio histórico, guardado no servidor como os canais de texto, enquanto ele estiver ligado.
