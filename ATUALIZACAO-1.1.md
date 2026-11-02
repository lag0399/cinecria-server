# Cinecria 1.1 — "Sala Escura"

O que mudou e como integrar ao seu projeto.

## Como integrar

**Se você não alterou nada no projeto desde a versão anterior:** substitua a pasta `cinecria/` inteira pela deste pacote e rode `npm install` de novo em `server/` e `app/`. Nenhuma dependência nova foi adicionada.

**Se você já fez mudanças próprias**, estes são os arquivos alterados:

| Arquivo | O que mudou |
|---|---|
| `server/index.js` | `POST /upload` e `GET /media/:id` (fotos/vídeos), token de upload no `hello`, `chat:send` aceita `attachment`, limpeza dos arquivos |
| `app/renderer/styles.css` | **reescrito** — nova identidade visual + layout mobile completo |
| `app/renderer/js/app.js` | menu de volume individual, chat com emojis/anexos/visualizador, luz ambiente no palco, novos rótulos |
| `app/renderer/js/rtc.js` | volume local por participante (`applyVolume` / `applyVolumes`), áudio desbloqueado ao entrar |
| `app/renderer/js/config.js` | `maxImageMB` / `maxVideoMB` |
| `app/renderer/index.html` | CSP libera imagens/vídeos vindos do servidor; novo slogan e cor do tema |
| `app/main.js`, `mobile/*` | cor de fundo nova (`#0c0c14`) |
| `app/build/*`, `mobile/assets/*` | ícones com as cores novas |

Depois de atualizar, no Android rode `cd mobile && npm run sync`.

## 1. Visual próprio: "Sala Escura"

O Cinecria deixa de parecer um clone do Discord:

- **Cores**: tinta azul-noite em vez de cinza, com luz de projetor âmbar e neon magenta de letreiro. O verde-menta fica só para "ao vivo na voz" e para quem está falando.
- **Tira de filme**: a barra de servidores tem perfurações de película nas bordas. Os servidores são "ingressos" quadrados, e o selecionado ganha um anel âmbar brilhante.
- **Painéis flutuantes**: canais, chat e membros viram cartões separados sobre o fundo escuro.
- **Tipografia**: títulos condensados em caixa alta, no estilo de letreiro (Bahnschrift no Windows, Roboto Condensed no Android). A qualidade da transmissão aparece em fonte monoespaçada, como num timecode.
- **Avatares em "squircle"** (quadrado arredondado), em vez de círculo.
- **Palco**:
  - fundo de sala escura com granulação de filme;
  - **luz ambiente**: a cor média da tela transmitida tinge o palco, como a luz do filme na sala;
  - no modo foco, os participantes sem câmera viram uma **plateia de assentos** embaixo da tela;
  - o dock de controles tem botões quadrados e um botão **TRANSMITIR** destacado.
- **Pílulas e etiquetas**: "AO VIVO" com brilho neon e ponto piscando, e salas com transmissão marcadas como **EM CARTAZ**.
- **Entrada**: cartão de letreiro de cinema com lâmpadas piscando e um facho de projetor.
- **Novos nomes**: as categorias viraram "Chat" e "Salas de exibição".

## 2. Volume individual (só para você)

| Onde | Como abrir |
|---|---|
| PC | botão direito em qualquer pessoa: no palco, na lista do canal de voz ou na lista de membros |
| Celular | tocar no assento de alguém no palco, ou **segurar** o dedo sobre a pessoa em qualquer lista |

- O menu tem dois controles:
  - **Voz**, de 0 a 200%;
  - **Transmissão**, de 0 a 200%, para o áudio da tela que a pessoa está compartilhando.
- Também tem **Silenciar para mim** e **100%** (restaurar).
- O controle "gruda" em 100% quando passa perto.
- A pessoa ganha um selo "150%" ou de mudo na lista. Só você vê.
- Os ajustes ficam salvos no seu aparelho, pelo apelido da pessoa, e voltam na próxima vez que vocês se encontrarem.

**Como funciona (`rtc.js`):**
- Cada trilha de áudio recebida tem o seu próprio `<audio>`.
- **De 0 a 100%** muda o `volume` desse elemento, o que preserva o cancelamento de eco do navegador.
- **Acima de 100%**, o `<audio>` fica mudo, mas continua tocando, porque o Chrome exige isso para receber áudio WebRTC. O som então passa por um `GainNode` do WebAudio, que permite amplificar.
- Nada muda no que é enviado: o volume dos outros participantes não é afetado.

## 3. Chat com emojis e mídia

- **Emojis**: botão 😊 no campo de mensagem. Tem as categorias Cinema 🎬, Carinhas, Gestos e Corações, e uma aba de recentes. O seletor continua aberto para você inserir vários seguidos.
- **Mensagens só de emoji** aparecem grandes.
- **Anexos**: pelo botão de clipe 📎, **colando** (Ctrl+V) ou **arrastando** o arquivo para o chat.
  - Formatos: PNG, JPG, GIF e WebP até 15 MB; MP4, WebM e MOV até 100 MB.
  - Antes de enviar, os arquivos ficam numa bandeja com miniatura. Dá para remover e escrever uma legenda.
  - Durante o envio aparece uma barra de progresso.
- **No chat**: as imagens abrem num visualizador em tela cheia, e os vídeos tocam ali mesmo, com avanço e retrocesso.
- **Mensagens novas são acrescentadas ao fim**, sem redesenhar a lista, então um vídeo tocando não reinicia quando chega mensagem.

**No servidor:**
- O upload exige um token que só o próprio cliente recebe ao entrar.
- O servidor valida o tipo e o tamanho do arquivo, limita a 12 envios por minuto e só aceita um anexo do próprio autor.
- Os arquivos são servidos com tipo fixo e `nosniff`, para nunca serem executados como página.
- **Limites ajustáveis** por variável de ambiente: `MAX_IMAGE_MB`, `MAX_VIDEO_MB`, `MAX_UPLOAD_TOTAL_MB` (padrão 2 GB; acima disso apaga os mais antigos) e `UPLOAD_DIR`.
- Os arquivos duram enquanto o servidor estiver rodando, assim como o histórico do chat. No Render gratuito, somem quando o serviço dorme.

## 4. Celular pelo navegador

O mesmo layout do app Android vale no navegador do celular: menu gaveta (☰ ou arrastar da borda), palco vertical com plateia em grade, menus que sobem de baixo, emojis e volume adaptados ao toque.

⚠️ **Importante:** o navegador do celular só libera o **microfone e a câmera em HTTPS**. O motivo:
- `http://192.168.x.x:3001` abre o chat, as fotos e os vídeos, e mostra as transmissões;
- mas **sem microfone**, porque o Chrome bloqueia `getUserMedia` fora de HTTPS.

Para falar pelo navegador do celular, você tem duas opções:
- hospedar com HTTPS (o Render já entrega `https://…onrender.com`);
- ou usar o app Android (Capacitor), que não tem essa restrição.
