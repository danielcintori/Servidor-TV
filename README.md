# InfoSesi TVs 2.0

Central de comunicação para TVs com Raspberry Pi e Chromium em modo quiosque. Backend Express, painel e player em HTML/CSS/JavaScript, sem etapa de compilação de frontend.

## Executar localmente

Requer Node.js 22 ou 24.

```bash
npm ci
npm run build
npm test
npm start
```

Abra `/admin` para administrar e `/tv?tvId=recepcao` para reproduzir. A rota `/tv` continua disponível para a programação geral. A porta local padrão é 3000; `PORT` substitui esse valor. `npm run dev` reinicia o servidor em desenvolvimento.

## Recursos e fluxo

1. **TVs e grupos:** cadastre TVs, copie os links e configure a reprodução individual. A ficha mostra a playlist efetiva, volume 0–100%, mute e atraso inicial 0–600 segundos. O áudio permanece silenciado por padrão, preservando o comportamento anterior.
2. **Biblioteca:** envie imagens JPG/PNG/WebP ou vídeos MP4/WebM (até 300 MB). Prévia de vídeo silenciada, progresso de upload, busca e filtro. “Somente biblioteca / playlists” não insere o arquivo na programação original.
3. **Playlists:** crie, renomeie, duplique e ordene por arrastar ou botões. Cada ocorrência de imagem pode ter duração própria, entre 1 e 3600 segundos. Vídeos seguem até `ended`. Remover um item não apaga o arquivo. Arquivos referenciados não podem ser excluídos sem antes removê-los das playlists.
4. **Configurações:** atribua playlists a grupos ou à programação geral. Uma atribuição específica da TV tem prioridade sobre o grupo, que tem prioridade sobre a geral. “Herdar” procura o próximo nível; uma playlist explicitamente vazia mantém a tela de espera. Playlists atribuídas não podem ser excluídas.
5. **Faixa:** configuração geral ou específica por TV. Texto, fonte (12–120 px), altura (32–300 px), cores em hexadecimal/seletor e tempo da rolagem (8–90 s). O painel valida a altura mínima para acomodar o texto. A prévia mostra o estilo; a rolagem é exibida no player.

Quando nenhuma playlist é atribuída, o sistema mantém exatamente a regra original: conteúdo para todas as TVs + grupos da TV + conteúdos direcionados àquela TV, em ordem de envio. A migração não converte nem congela essa distribuição. Ao atribuir uma playlist, ela passa a substituir essa sequência para o destino correspondente.

“Atraso” significa esperar uma vez ao abrir a página da TV. Alterações dessa opção passam a valer na próxima abertura. Não é intervalo entre conteúdos. “Altura de áudio” foi interpretada como volume; não há normalização automática de loudness nem controle do mixer do sistema operacional.

## Player e diagnóstico

- Consulta o servidor a cada 10 segundos, sem requisições sobrepostas.
- Faixa e volume são atualizados sem substituir o elemento de vídeo.
- Mantém a mídia atual se ela continua na playlist; nova duração de uma imagem vale na próxima ocorrência.
- Avança ao final dos vídeos e tenta o próximo conteúdo após falha de carregamento.
- Guarda referências da última programação em uma chave local por TV, tolerando JSON inválido e indisponibilidade do armazenamento.
- Isso **não é cache offline completo dos arquivos**. A reprodução sem rede depende do cache de mídia disponível no navegador. Sem o arquivo, o player tenta avançar e se reconectar.
- `/tv?tvId=recepcao&diagnostic=1` exibe o indicador de conexão. A tela normal prioriza o conteúdo.
- A ficha da TV mostra o último relato de mídia, erro e bloqueio de áudio. Os relatos são informações enviadas pelo navegador, não comprovação de som na saída HDMI ou imagem no monitor. Os diagnósticos em memória são reiniciados com o servidor.
- O status online usa a última consulta recebida (janela de 45 segundos).

### Áudio no Chromium

O player trata rejeições de `play()` e tenta continuar silenciado quando a política de autoplay bloqueia som. Para um quiosque administrado, avalie com a TI a opção de inicialização abaixo, documentada pelo Chrome para desativar essa restrição no navegador:

```bash
chromium --kiosk --autoplay-policy=no-user-gesture-required "https://SEU-SERVICO.onrender.com/tv?tvId=recepcao"
```

O executável pode se chamar `chromium-browser`. Verifique a versão e as políticas da instalação real; o comportamento não foi validado em Raspberry Pi físico. Ajustar a URL/argumentos no mecanismo de autostart já usado não exige trocar o ambiente gráfico. Não foi alterada configuração de rede, Wi-Fi ou sistema operacional.

## Autenticação e variáveis

O painel, seus arquivos de administração e as APIs administrativas usam HTTP Basic quando as duas credenciais estão configuradas. Em `NODE_ENV=production` as credenciais são obrigatórias, e a inicialização falha se ausentes. O navegador apresenta a caixa de login. Use HTTPS; não inclua credenciais em URLs. Basic não fornece logout próprio: use perfil dedicado ou feche a sessão do navegador. Os players e arquivos de mídia continuam públicos, como na versão original. Não use esta instalação para mídia confidencial sem adicionar controle de acesso aos players.

| Variável         | Uso                                                      |
| ---------------- | -------------------------------------------------------- |
| `ADMIN_USER`     | Usuário administrativo                                   |
| `ADMIN_PASSWORD` | Senha longa e exclusiva, definida fora do Git            |
| `NODE_ENV`       | `production` no Render                                   |
| `PORT`           | Definida pelo Render; 3000 localmente                    |
| `DATA_DIR`       | Diretório absoluto dos JSON; padrão local `data/`        |
| `UPLOAD_DIR`     | Diretório absoluto dos arquivos; padrão local `uploads/` |

`.env.example` é somente referência. O servidor não carrega `.env` automaticamente. Configure as variáveis no ambiente ou, localmente, use o suporte `--env-file` do Node.

## Atualizar o serviço existente no Render

**Esta alteração não consulta nem modifica sua conta Render. O plano, os discos, as variáveis e o auto-deploy atuais precisam ser verificados no painel antes da implantação.**

1. Revise o pull request e desative temporariamente o auto-deploy antes do merge. Não faça redeploy antes de resgatar os arquivos atuais.
2. Faça uma cópia de `data/` e `uploads/` da instância atual e guarde fora do serviço. Interrompa alterações administrativas e assegure que a cópia dos dados não concorre com gravações. O backup deve incluir uploads, não apenas JSON. Arquivos já perdidos em um deploy anterior não podem ser recuperados por esta migração.
3. A solução desta versão é **uma instância Node com disco persistente**. O Render exige um serviço pago para anexar disco. Se o serviço for gratuito, será necessário contratar armazenamento apropriado ou implementar banco/storage externo antes de garantir persistência; esta versão não integra S3 ou PostgreSQL.
4. Anexe/configure o disco, por exemplo em `/var/data`, e restaure as cópias em `/var/data/infosesi/data` e `/var/data/infosesi/uploads` antes da primeira inicialização v2. Criar ou alterar um disco pode reiniciar o serviço: preserve os arquivos antes dessa etapa.
5. Configure `DATA_DIR=/var/data/infosesi/data`, `UPLOAD_DIR=/var/data/infosesi/uploads`, `NODE_ENV=production`, `ADMIN_USER` e `ADMIN_PASSWORD`. Se já usa outro ponto de montagem, use os caminhos reais sob esse disco.
6. Configure uma versão Node compatível (por exemplo, linha 22 em `NODE_VERSION`), Build Command `npm ci && npm run build`, Start Command `npm start` e Health Check Path `/healthz`.
7. Valide primeiro uma cópia dos dados em homologação, com disco e diretórios independentes. Duas instâncias não devem compartilhar estes JSON.
8. Após aprovação do PR, faça merge e implantação manual no serviço existente. Não crie outro serviço se deseja manter o domínio atual.
9. Confira `/healthz`, login, duas TVs com programações distintas, uploads antigos, faixa e áudio. Reinicie a instância de homologação e confira persistência. Só então reative o auto-deploy se desejar.

Disco persistente implica limitações de escalabilidade e pode causar intervalo de indisponibilidade em deploys. Os JSON são escritos por arquivo temporário seguido de rename; operações de estado são síncronas em um único processo. Não use cluster, múltiplos workers ou réplicas compartilhando esses arquivos. Não há transações entre vários arquivos; mantenha backups independentes.

## Migração e backup

A primeira inicialização com configurações v1 cria `DATA_DIR/backup-v1-TIMESTAMP/` com os três JSON antigos, acrescenta defaults à faixa, marca `schemaVersion: 2` e cria `playlists.json`. IDs, links, mídias e seleção de destinos são preservados. Repetir a inicialização não repete a migração. Esse backup automático não inclui uploads. JSON corrompido provoca erro em vez de substituição silenciosa.

Com o processo parado e os caminhos de ambiente configurados, faça backup completo usando:

```bash
node scripts/backup.js /caminho/fora-dos-dados/backup-novo
```

Não execute com destino dentro de `DATA_DIR` ou `UPLOAD_DIR`. Copie o resultado para armazenamento independente e teste a restauração.

### Reverter

Pare a atualização, preserve um backup do estado v2 e reverta o código ao commit anterior. Restaure o conjunto completo de JSON e uploads do backup anterior à implantação. O código v1 usa `data/` e `uploads/` relativos à raiz e ignora `DATA_DIR`/`UPLOAD_DIR`: ajuste o local restaurado ou use uma versão de rollback que preserve o apontamento ao disco. Não sobrescreva automaticamente os dados v2. Alterações feitas após o backup não estarão no estado restaurado.

## APIs adicionais

| Método       | Rota                      | Uso                                        |
| ------------ | ------------------------- | ------------------------------------------ |
| GET          | `/healthz`                | Saúde do processo                          |
| PATCH        | `/api/tvs/:id`            | Playlist, áudio, atraso e faixa individual |
| GET / POST   | `/api/playlists`          | Listar / criar                             |
| PUT / DELETE | `/api/playlists/:id`      | Atualizar / excluir                        |
| POST         | `/api/settings/playlists` | Atribuições geral e por grupo              |
| POST         | `/api/heartbeat`          | Relato de diagnóstico do player            |

As rotas originais permanecem. `/api/midia-atual` inclui faixa efetiva, `playback` e `playlistSource`. A API de upload também aceita `targetMode=library`.

## Verificação

`npm test` cobre migração idempotente, distribuição antiga, precedência e playlist vazia, isolamento entre duas TVs, persistência após reinício, autenticação, origem de requisições, validação, exclusões referenciadas e upload. `npm run build` verifica sintaxe sem exigir React/Vite. A ação do GitHub executa esses comandos em Node 22.

Consulte `VALIDATION.md` para evidências de navegador e limitações da entrega. Render e Raspberry Pi físicos exigem validação no ambiente real antes de produção.

## Referências oficiais

- [Render: discos persistentes](https://render.com/docs/disks)
- [Render: limites do plano gratuito](https://render.com/docs/free)
- [Render: versão do Node](https://render.com/docs/node-version)
- [Chrome: política de autoplay](https://developer.chrome.com/blog/autoplay)
