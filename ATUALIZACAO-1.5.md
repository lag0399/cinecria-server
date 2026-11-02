# Cinecria 1.5 — "Cinema Lounge"

## Como integrar

Substitua a pasta `cinecria/`, envie para o GitHub e **refaça o deploy no Render**, porque o servidor mudou e as 8 salas novas só aparecem depois de reiniciar. Gere o `.exe` de novo. No Android, rode `npm run sync`. Nenhuma dependência nova.

### Chave de GIF (uma vez, no Render)
No Render, abra o serviço → **Environment** → adicione **`KLIPY_API_KEY`** (<https://partner.klipy.com>) e/ou **`GIPHY_API_KEY`** (<https://developers.giphy.com/dashboard/>) → Save.

- O app lê as chaves em `/api/client-config`, então **não precisa gerar outro .exe** para trocar de chave.
- **Ordem de uso:** KLIPY primeiro; se ele falhar (limite, fora do ar), o GIPHY assume sozinho.
- **Sem nenhuma chave**, o modal explica o motivo e ainda aceita colar o link de um GIF.
- As buscas saem do app de cada usuário, como os dois provedores exigem, e não do servidor.

| Arquivo | O que mudou |
|---|---|
| `server/index.js` | apelido único (com retomada da própria sessão), servidores públicos travados, 8 salas no Lobby, `/api/client-config`, CDNs de GIF, horário de entrada |
| `app/main.js`, `app/package.json` | ícone `.ico` da janela no Windows |
| `app/renderer/index.html` | favicon, barra superior, cards da foto |
| `app/renderer/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | **novos** |
| `app/renderer/js/config.js` | bitrates novos, chaves KLIPY/GIPHY, prévia oculta, luzes |
| `app/renderer/js/rtc.js` | detector de fala com limpeza, captura sem reconfiguração extra |
| `app/renderer/js/app.js` | barra superior, cards de sala, perfil, recorte, seletor de GIF, luzes, sons |
| `app/renderer/styles.css` | bloco "1.5" no fim + correções de performance |

## O que mudou

1–2. **Escolher GIF.** O card tem mosaico 2×2 animado, com os GIFs em alta. O modal abre em **12 categorias** com fundo animado: GIFs em alta, hello, lol, love, happy birthday, thank you, excited, yes, no, sorry, anime e cinema. A busca espera você parar de digitar. Anúncios do KLIPY são filtrados, e os resultados ficam 30 min em cache. O fundo das categorias usa **uma única busca** ("em alta"); quando você abre uma categoria, o primeiro GIF dela vira o fundo dali em diante. Isso evita gastar 12 buscas do limite da chave toda vez que alguém abre o modal.

3. **Favicon** SVG azul (com PNG de reserva e ícone para iPhone) e `.ico` na janela do Windows.

4. **Editar imagem.** PNG, JPG e WebP abrem num recorte circular: arraste para enquadrar, zoom pelo slider, pelos botões −/+, pela roda do mouse ou com pinça no celular. A saída é 256×256. GIF pula o recorte e continua animado.

5. **Apelido único.** "dvd", "DVD", " dvd " e "João Pedro"/"joao pedro" contam como iguais. O bloqueio vale ao entrar e ao trocar o nome no perfil, com o erro mostrado no campo.
   - **Retomada de sessão (não estava no pedido):** se sua conexão cair, o servidor ainda segura a conexão antiga por uns 20–45 s. Sem esse ajuste, ao reconectar **você mesmo** seria barrado pelo próprio apelido. Agora cada aparelho tem uma chave aleatória: se for você, a conexão antiga é derrubada e você volta normalmente. Outra pessoa com o mesmo nome continua barrada.

6. **Cinema Lounge.**
   - **Comunidades em pills numa barra superior**, com selo de oficial, indicador de voz e de não lidas. No celular, elas ficam no topo da gaveta.
   - **Salas de exibição viram cards:** fotos de quem está dentro, contagem, "AO VIVO" com o nome de quem transmite, e "Sala vazia · entre e dê o play".
   - **Superfícies** `#070b14`/`#0f172a`, raio de 14 px, e o dock de controles flutuante continua.

7. **Servidores públicos travados.** Sem os botões "+" e sem "criar canal" no menu; o servidor também recusa com a mensagem pedida. **Lobby com 8 salas:** Sala de Cinema, Sessão da Tarde, Jogatina, Terror da Madrugada, Clube do Anime, Pipoca & Série, Papear / Barzinho e Corujão VIP.

8. **Perfil.**
   - **Onde clicar:** num membro, numa pessoa da sala, no nome ou na foto de quem mandou uma mensagem, no nome de um card de vídeo ou numa foto do card da sala.
   - **O que mostra:** banner com as cores da pessoa, foto grande com anel azul, online desde quando, sala e horário de entrada, transmitindo, câmera, mic/fone mutado e o volume que você deixou para ela.
   - **Botões:** **Mencionar no chat** (abre o chat da sala, se preciso) e **Volume**. Para você mesmo, **Editar perfil**.
   - **No celular:** tocar num card de vídeo abre o perfil, já com o botão de volume.

9. **Performance:**
   - **Bitrates** nos valores pedidos (720p 2,5 · 1080p 4,5 · 1440p/Nativa 6 Mbps). Veja a observação abaixo.
   - **Prévia da sua transmissão desligada por padrão**, com o card "Clique para ver a prévia".
   - **Detector de fala:** um único timer de 150 ms; para quando a janela está escondida; usa o mesmo `AudioContext` do volume; e **desliga o analisador de quem sai ou muta**. Antes ficava pendurado, vazando memória.
   - **Captura:** sem o `applyConstraints` extra, que reconfigurava o track depois do `getDisplayMedia`.
   - **CSS (o maior ganho para quem assiste):** saíram o desfoque de fundo (`backdrop-filter`) sobre o vídeo nos controles, etiquetas e balões, a granulação com `mix-blend-mode` sobre o palco inteiro e o gradiente animado de cor ambiente. Os três obrigavam o navegador a recompor a tela a cada quadro do filme.

10. **Luzes de cinema.** Ligadas por padrão quando há transmissão em foco, com o botão 💡 **Luzes** no topo da sala.
    - **Como funciona:** o vídeo é desenhado num canvas de 16×9 px a cada 120 ms, e o CSS amplia e aplica `blur(45px) saturate(1.8)` com opacidade 0,65 na GPU. **Sem `getImageData`**: a versão antiga lia pixels de volta para a CPU.
    - **Entorno:** escurece a barra superior, a lateral, a plateia e os controles; passar o mouse traz tudo de volta.
    - **Pausa:** com a janela escondida ou ao desligar o botão.

11. **Sons de mutar.** Microfone: dois bipes subindo ao ligar e dois mais graves descendo ao mutar. Áudio: três notas. Gerados pelo Web Audio, tocam **só no seu fone**.

## ⚠️ Sobre o bitrate e a lentidão

**Baixar o bitrate quase não alivia o PC de quem transmite.** O custo do encoder vem da **resolução × FPS × número de espectadores**:
- No modo P2P atual, **cada amigo assistindo é um encode separado**. 1440p60 para 4 pessoas = 4 encodes de 1440p60.
- Bitrate baixo nessas resoluções só deixa a imagem mais borrada.

**O que de fato alivia:**
- Prévia desligada (já é o padrão).
- **1080p60 em vez de Nativa** quando o monitor é 1440p/4K, ou quando há mais de 2–3 espectadores.
- Placa de vídeo ligada: modo compatibilidade desligado.
- Conferir no **ⓘ** do card se o encoder está em "hardware" e o "Limitado por".

Para salas grandes, a solução definitiva é um SFU (LiveKit/mediasoup): **um encode só**, distribuído pelo servidor.
