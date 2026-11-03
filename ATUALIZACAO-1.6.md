# Cinecria 1.6 — visual limpo e alerta de nome

## Como integrar
Substitua a pasta `cinecria/`, envie ao GitHub e **refaça o deploy no Render**, porque o servidor mudou o formato do erro de nome. Gere o `.exe` de novo. No Android, rode `npm run sync`.

| Arquivo | O que mudou |
|---|---|
| `server/index.js` | erro de nome no formato `{ error: 'NAME_TAKEN', message: '…' }` |
| `app/renderer/js/app.js` | lateral em pílulas (texto = voz, sem `#`), cabeçalho de sessão, balões, alerta "Nome indisponível" |
| `app/renderer/js/config.js` | bitrates: 720p 4 · 1080p 8 · 1440p/Nativa 12 Mbps |
| `app/renderer/js/rtc.js` | bitrate de partida 4 Mbps (a imagem já começa nítida) |
| `app/renderer/styles.css` | bloco "1.6" no fim |

`index.html` não precisou mudar: o alerta é criado pelo `app.js`.

## 1 e 2. Salas e bate-papos com o mesmo visual
- **Cada sala ou canal é uma pílula** com `padding: 10px 14px`, raio 10 px, fundo `rgba(255,255,255,.03)` e hover azul `rgba(59,130,246,.1)`. Sem bordas, caixas nem subtítulos.
- **Texto e voz idênticos:** só o ícone muda (balão para bate-papo, alto-falante para sala). O `#` saiu da lateral, do cabeçalho, do campo de mensagem e dos avisos.
- **O que aparece na pílula:**
  - Uma pílula pequena à direita com o número de pessoas, só quando há gente.
  - Mini-avatares embaixo, só quando a sala tem participantes.
  - Um pontinho azul pulsando quando tem transmissão.
- **Chat:**
  - **Cabeçalho de sessão:** ícone, nome e "Bate-papo · N online".
  - **Mensagens:** em balões arredondados de 14 px, espaçados. As **suas** ficam à direita em azul. Menção a você acende o balão. Emoji sozinho fica grande e sem balão.
  - **Campo de mensagem:** pílula flutuante com o botão de enviar redondo.
  - **Chat da sala:** usa os mesmos balões.

## 3. Nome indisponível
- **Servidor:** recusa `hello` e `profile:update` com `{ error: 'NAME_TAKEN', code: 'name_taken', message: 'Este nome não está disponível! Já existe alguém com este nome online.' }`.
- **Comparação:** ignora maiúsculas, como pedido, e também acentos e espaços extras. Assim, "João" e "joao", ou "dvd " e "dvd", também contam como iguais.
- **Na tela de entrada:**
  - O usuário **não entra**.
  - Aparece um card vermelho com ícone ⚠️ grande: **"Nome indisponível — Já existe alguém com o nome “X” online no momento. Por favor, escolha outro apelido."**
  - O campo treme e fica com borda vermelha brilhante; o alerta some quando a pessoa digita outro nome.
- **Em "Meu perfil":** o mesmo alerta aparece ao trocar para um nome em uso.
- **Queda de conexão:** a retomada da 1.5 continua. Se a conexão cair, **você mesmo** não é barrado pelo seu próprio nome ao voltar.

## 4. Qualidade da transmissão
**Mudou nesta versão:** tetos de 8 Mbps em 1080p e 12 Mbps em 1440p/Nativa (720p: 4 Mbps), e a transmissão começa em 4 Mbps em vez de subir aos poucos.

**Já estava no código desde a 1.3/1.5 e foi conferido de novo**, com duas sessões WebRTC reais conectadas no teste:
- `degradationPreference: 'maintain-resolution'`, `scaleResolutionDownBy: 1`, `maxFramerate: 60`, `priority`/`networkPriority: 'high'`;
- H.264 → VP9 via `setCodecPreferences`;
- `contentHint` motion/detail;
- captura nativa sem redimensionar (Nativa não pede largura/altura; `frameRate: { ideal: 60, max: 60 }`);
- prévia de quem transmite desligada por padrão.

**Cuidados:**
- **Upload:** 12 Mbps é **por amigo assistindo** (modo P2P). Com 3 pessoas assistindo em Nativa, são até ~36 Mbps de upload; o seletor de tela mostra a estimativa.
- **Encoder:** o H.264 só usa o chip da placa de vídeo se o encoder de hardware estiver disponível. Confira no **ⓘ** do card: o certo é aparecer "hardware" e "Limitado por: nenhum".
