# Cinecria 1.4 — azul, BETA, foto com GIF e servidor oficial

## Como integrar

Substitua a pasta `cinecria/`, envie para o GitHub e **refaça o deploy no Render**, porque o servidor mudou. Gere o `.exe` de novo (`cd app && npm run dist`). No Android, rode `cd mobile && npm run sync`. Nenhuma dependência nova.

| Arquivo | O que mudou |
|---|---|
| `server/index.js` | avatar guardado no servidor e enviado como link (`GET /avatar/:hash`), GIF até 2 MB, links do GIPHY/Tenor aceitos, CORS no `/health` |
| `app/renderer/js/config.js` | servidor oficial travado, `gifApiKey`, Nativa 60 FPS como padrão |
| `app/renderer/index.html` | nova entrada, BETA, endereço do servidor com cadeado |
| `app/renderer/js/app.js` | foto do dispositivo (GIF preservado), busca de GIF, espera do servidor acordar, BETA, qualidade recomendada, logo azul |
| `app/renderer/styles.css` | paleta azul em todo o app + bloco "1.4" no fim |
| `app/build/*`, `mobile/assets/*` | ícones azuis |

## ⚠️ Antes de publicar: chave do GIPHY

**A API do Tenor foi desligada pelo Google em 30/06/2026**; o endpoint `g.tenor.com/v1/...` não responde mais. A busca usa o **GIPHY**:

1. Crie uma chave grátis em <https://developers.giphy.com/dashboard/>.
2. Cole a chave em `app/renderer/js/config.js` → `gifApiKey: 'SUA_CHAVE'`.

Limites e regras:
- **Limite da chave beta:** 100 buscas por hora, somadas entre **todos** os usuários. A busca espera você parar de digitar para não gastar o limite. Para mais, peça a chave de produção no painel do GIPHY.
- **Atribuição:** o GIPHY exige a marca "Powered by GIPHY", que já aparece no rodapé da busca.
- **Sem chave**, o botão "Buscar GIF" abre do mesmo jeito: explica a situação e aceita **colar o link** de um GIF do giphy.com.

## 1. "★ Nativa 60FPS (Recomendado)"
- Sempre vem selecionada quando o modal abre, com o selo azul "★ Recomendado" logo abaixo. O selo some se você escolher outra qualidade.
- **Nativa** transmite na resolução da sua tela: num monitor 4K, é 4K a 60 FPS, com teto de 20 Mbps por espectador. O upload estimado aparece no rodapé do modal.

## 2. Foto de perfil com GIF
- Dois botões, na entrada e em "Meu perfil": **Enviar do dispositivo** e **Buscar GIF**.
- **GIF do PC:** é lido com `FileReader.readAsDataURL()`, sem passar pelo canvas, e **continua animado**. Limite de 2 MB.
  - PNG, JPG e WebP continuam sendo recortados em quadrado de 256 px. Agora em WebP, para não perder a transparência do PNG.
- **GIF da busca:** guarda só o link HTTPS (versão de 200 px, leve para quem vê).
- Um selo "GIF" aparece na foto escolhida.

**Mudança importante no servidor (não estava no pedido):** antes o avatar ia **dentro** de cada atualização de presença.
- **O problema:** com GIFs de 2 MB, cada "fulano mutou" mandaria dezenas de MB para cada pessoa da sala.
- **Como ficou:** o servidor guarda a imagem (sem duplicar arquivos iguais, cache de 200 MB) e circula só `/avatar/<hash>`. O navegador baixa cada foto uma vez e guarda em cache.
- **Limites:** `maxHttpBufferSize` foi para 3,2 MB e a validação para 2,9 milhões de caracteres, não os 2,5 milhões pedidos. Um GIF de 2 MB em base64 tem cerca de 2,8 milhões de caracteres, então 2,5 milhões recusaria GIFs entre ~1,8 e 2 MB.
- **Links aceitos:** só HTTPS de `media*.giphy.com`, `i.giphy.com`, `media*.tenor.com` e `c.tenor.com`. São recusados SVG, `http:`, `javascript:` e hosts parecidos como `media.giphy.com.evil.com`.
- **Foto salva no aparelho:** vai para o IndexedDB, porque um GIF de 2 MB não cabe no localStorage.
- **Foto que não carrega** (servidor reiniciou, GIF apagado) volta sozinha para o avatar com a inicial.

## 3. Nova entrada
- **Cartão de vidro escuro:** `backdrop-filter: blur(16px)`, borda `rgba(59,130,246,.2)` e sombra profunda.
- **Foto:** grande, com anel em gradiente azul, e os dois botões lado a lado.
- **Transições:** suaves no foco dos campos e no botão **Entrar**.
- **Celular:** o cartão ocupa a tela inteira, sem desfoque, que pesa em aparelhos fracos.

## 4. BETA
- Selo `.beta-badge` com o estilo pedido: ao lado de "CINECRIA" na entrada, embaixo da logo na barra lateral e no título da janela ("Cinecria Beta").

## 5. Servidor travado
- O campo editável foi trocado por um indicador com cadeado: **SERVIDOR OFICIAL · cinecria-server.onrender.com**, com status ● online / ● acordando… / ● fora do ar.
- **Endereço usado:**
  - App desktop e Android: sempre o oficial.
  - Site aberto pelo próprio servidor: `window.location.origin`.
- Qualquer endereço antigo salvo no aparelho é ignorado e substituído.
- **Render gratuito:** o servidor dorme sem uso e leva uns 50 s para acordar. Agora o app **espera até 90 s**, com o botão em "Acordando o servidor…", em vez de dar erro na hora.
- **Para desenvolver com servidor local no app desktop:** mude `lockServer: false` em `config.js`, ou abra `http://localhost:3001` no navegador, que usa a própria origem.

## 6. Paleta azul
- **Cores principais:** `#2563eb` / `#3b82f6`, brilho `#60a5fa` / `#1d4ed8`, gradiente `linear-gradient(135deg, #2563eb, #0ea5e9)`.
- **Onde aparece:** Entrar, Transmitir, Entrar ao vivo, pílulas AO VIVO, bordas de foco, seleções, menções, selos e logo.
- **O que continua vermelho:** só o destrutivo e os alertas (Desligar, mudo, erros, aviso de GPU).
- **Verde-menta:** continua indicando "voz conectada" e "falando".
- **No código:** as variáveis foram renomeadas para o que são (`--accent`, `--accent-2`, `--grad`, `--on-accent`), e os fundos ganharam um tom azul-noite.
