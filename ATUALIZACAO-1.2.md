# Cinecria 1.2 — menções, câmera vertical, PiP e tela preta

## Como integrar

Se você não alterou o projeto, substitua a pasta `cinecria/`. Nenhuma dependência nova e nenhuma mudança no servidor. No Android, rode `cd mobile && npm run sync`.

| Arquivo | O que mudou |
|---|---|
| `app/main.js` | modo compatibilidade de vídeo opcional (`settings.json` + reinício), switch de autoplay |
| `app/preload.js` | `getSettings()` e `setCompatVideo()` |
| `app/renderer/js/app.js` | menções com autocomplete, aviso sonoro e badges, PiP, guia anti-tela-preta |
| `app/renderer/js/rtc.js` | câmera sem tamanho fixo no celular |
| `app/renderer/styles.css` | câmera com `contain`, estilos novos (bloco "1.2" no fim do arquivo) |

## 1. Menções `@nome`

- Ao digitar `@` aparece a lista dos membros do servidor; o texto digitado filtra a lista, ignorando acentos e maiúsculas.
- **Tab** ou **Enter** completam o nome; **↑ ↓** navegam e **Esc** fecha. No celular, é só tocar no nome.
- **Nomes com espaço funcionam** (`@Bia Ramos`). A menção é reconhecida comparando com os nomes conhecidos (membros do servidor e autores do histórico), não "até o próximo espaço".
- E-mails como `a@b.com` não viram menção, e `@Theodoro` não destaca o "Theo".
- Na mensagem, a menção aparece como uma etiqueta âmbar. Se for **você**, a etiqueta fica em neon e a linha inteira ganha fundo dourado com borda lateral.
- O aviso sonoro é um "plim" de duas notas gerado na hora pelo Web Audio. Ele não toca se você estiver com o áudio desativado e no máximo uma vez a cada 1,2 s.
- Menção em outro canal mostra um aviso na tela e um selo **@** no canal e no servidor, que somem quando você abre o canal.

## 2. Câmera vertical (celular)

- `object-fit: contain` nos vídeos de câmera, com fundo `#0a0a0f`. A câmera em pé (9:16) aparece inteira, sem zoom ou corte, no PC e no celular.
- No celular, a câmera não pede mais largura nem altura: o sensor entrega a imagem na orientação nativa. No PC continua pedindo 720p como **sugestão** (`ideal`, nunca `exact`), porque muitas webcams abrem em 640×480 se ninguém pedir.

## 3. Picture-in-Picture (só PC)

- O botão aparece ao passar o mouse sobre qualquer câmera ou transmissão, ao lado do botão de tela cheia. Clique de novo para sair.
- Não aparece no celular, em tela de toque nem onde `document.pictureInPictureEnabled` não existir.
- Usa um `<video>` separado, fora dos cards. Assim a janela flutuante não fecha quando a grade se reorganiza, já que o Chrome encerra o PiP se o vídeo sai da página.
- O card mostra "Em janela flutuante" enquanto isso. Se a pessoa desligar a câmera ou parar a transmissão, a janela fecha sozinha.

## 4. Tela preta na Netflix / Prime / Disney+

**Por que não desliguei a aceleração de hardware do Cinecria por padrão:** a tela preta acontece no **navegador que toca o filme**, não no Cinecria. O DRM (Widevine no Chrome, PlayReady no Edge) protege o vídeo quando ele é decodificado pela placa de vídeo, e a captura de tela do Windows recebe só um retângulo preto. Desligar a placa de vídeo no Cinecria não muda nada nisso. Além disso, deixaria a decodificação dos vídeos dos amigos e a codificação da sua transmissão 1080p60 por conta do processador.

**O que foi feito:**
- **Guia no seletor de tela**: um painel "Tela preta na Netflix…?" com três passos e botões que copiam `chrome://settings/system`, `edge://settings/system` e `brave://settings/system`, mais a instrução para o Firefox.
  - O painel abre sozinho quando você escolhe uma janela de navegador ou de streaming.
  - Avisa também que os apps da Microsoft Store (Netflix/Disney+/Prime para Windows) não podem ser capturados.
- **Modo compatibilidade de vídeo**: `app.disableHardwareAcceleration()` antes do `whenReady()`, como pedido, mas **opcional**.
  - Fica num botão no fim do guia, com confirmação em dois cliques porque reinicia o app.
  - Serve para o caso raro de um driver que deixa preta a imagem dentro do próprio Cinecria.
  - Também pode ser ligado com `--compat-video`.
- Novo switch `autoplay-policy=no-user-gesture-required`, para o áudio dos amigos e os vídeos do chat tocarem sem exigir um clique.

**O "navegador interno" ficou de fora:** o Electron padrão não tem o módulo Widevine, então a Netflix nem abre dentro dele. Isso exigiria trocar para o build castLabs do Electron e assinar o app com eles (VMP), e mesmo assim a captura continuaria bloqueada.
