# Validação da versão 2.0

Executada em 24/09/2026 em ambiente local isolado, com dados e uploads temporários. Nenhum dado de produção foi usado ou alterado.

## Automatizada no repositório

- `npm ci --ignore-scripts`: instalação das 78 dependências transitivas concluída.
- `npm run build`: verificações de sintaxe concluídas.
- `npm test`: 2 testes aprovados, com múltiplas asserções de integração.
- Migração v1→v2, backup de JSON e segunda inicialização sem repetir migração.
- Distribuição original preservada para duas TVs; precedência de playlist individual/grupo e comportamento de playlist vazia.
- Persistência de volume, playlists, configurações e upload após reinício local.
- Rejeição de playlist/mídia inexistente e parâmetros de reprodução inválidos.
- Exclusão bloqueada para mídia referenciada e playlist atribuída.
- Autenticação administrativa e proteção contra requisição de origem diferente.
- Upload “Somente biblioteca” sem inserção na programação original.

## Navegador Chromium headless

Verificado com Playwright e Chromium extraído do pacote `@sparticuz/chromium`, com servidor local executado no mesmo ambiente:

- Criar playlist pela interface, adicionar vídeo/imagem, reordenar por botão, editar duração e salvar.
- Atribuir playlist à TV, alterar volume/mute e salvar.
- Configurar e salvar texto, fonte e altura da faixa.
- Navegar nas seis áreas em larguras 390, 720 e 1280 px: sem overflow horizontal da página (a navegação móvel tem rolagem própria).
- Capturas inspecionadas: visão geral, editor de playlist, faixa no celular e player.
- Player em 1280×720 e 1920×1080: área de mídia termina onde começa a faixa.
- Atualização real por polling: texto/volume modificados sem substituir o elemento de vídeo e sem voltar o tempo de reprodução.
- Atraso de 2 segundos aplicado na abertura; atraso desativado ignora um valor salvo de 500 segundos.
- Rejeição `NotAllowedError` simulada no primeiro `play()` com som: fallback silenciado mantém reprodução.
- Avanço ao final do vídeo, usando mídia WebM de teste e seek próximo ao final.
- Arquivo inválido exibe espera e avança para a imagem válida seguinte.
- Cache local corrompido com API indisponível mantém tela de conexão, sem erro JavaScript não tratado.
- Nenhum erro JavaScript não tratado nos fluxos testados.

## Limitações e validações de implantação

- Não houve acesso à conta Render nem validação de plano, disco, auto-deploy ou variáveis existentes.
- Reinício local não comprova a configuração de persistência no Render. Verificar os caminhos e o disco antes de implantar.
- Não houve teste em Raspberry Pi físico, áudio HDMI, Chromium administrado da instituição ou desempenho prolongado no dispositivo.
- O bloqueio de autoplay foi simulado para validar tratamento de erro; políticas reais do Chromium precisam ser confirmadas no quiosque.
- Não há normalização de loudness, cache offline completo, banco remoto ou armazenamento externo integrado.
- A gravação JSON pressupõe um único processo; não foi implementado controle de edição simultânea por múltiplos administradores (a última gravação prevalece).
- A integração contínua está configurada em `.github/workflows/test.yml`; consultar o resultado da execução no GitHub antes do merge.

Os comandos de operação, backup, migração e rollback estão no README.
