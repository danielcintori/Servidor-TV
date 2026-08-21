# InfoSesi TVs

Sistema web para controlar conteudos exibidos em TVs conectadas a Raspberry Pi em modo kiosk.

## O que este prototipo faz

- Painel `/admin` para enviar imagens e videos.
- Tela `/tv` para exibicao em tela cheia.
- Cadastro de TVs com nome, grupo e link individual.
- Envio de conteudo para todas as TVs, grupos selecionados ou TVs especificas.
- Playlist automatica com polling a cada 10 segundos.
- Suporte a `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4` e `.webm`.
- Videos com `autoplay`, `muted`, `loop` e `playsinline`.
- Faixa de mensagem opcional no rodape das TVs.
- Status online/offline simples por heartbeat da rota `/tv`.
- Cache local da ultima playlist no navegador da TV.

## Como rodar localmente

```bash
npm install
npm start
```

Depois acesse:

- Admin: `http://localhost:3000/admin`
- TV geral: `http://localhost:3000/tv`
- TV especifica: `http://localhost:3000/tv?tvId=recepcao`

O servidor usa a porta `3000` por padrao. Em hospedagem, ele tambem respeita `process.env.PORT`.

## Como usar no painel

1. Abra `/admin`.
2. Cadastre as TVs que vao existir fisicamente.
3. Separe por grupo quando fizer sentido, por exemplo `Recepcao`, `Corredores`, `Salas`, `Eventos`.
4. Copie o link individual de cada TV, como `/tv?tvId=recepcao`.
5. Envie uma midia escolhendo o destino:
   - `Todas as TVs`
   - `Grupos selecionados`
   - `TVs especificas`
6. Se quiser uma mensagem no rodape, ative a `Faixa de mensagem`, escreva o texto e salve.
7. Para esconder a faixa, desmarque a opcao e salve.

## Raspberry Pi em modo kiosk

Exemplo para uma TV especifica:

```bash
chromium-browser --noerrdialogs --disable-infobars --kiosk http://IP_DO_SERVIDOR:3000/tv?tvId=recepcao
```

Exemplo de autostart no Raspberry Pi OS:

```bash
mkdir -p ~/.config/lxsession/LXDE-pi
nano ~/.config/lxsession/LXDE-pi/autostart
```

Conteudo sugerido:

```text
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
@chromium-browser --noerrdialogs --disable-infobars --kiosk http://IP_DO_SERVIDOR:3000/tv?tvId=recepcao
```

Se `unclutter` nao estiver instalado:

```bash
sudo apt install unclutter
```

## APIs principais

- `GET /api/config`: TVs, grupos e configuracoes.
- `GET /api/tvs`: lista TVs com status online/offline.
- `POST /api/tvs`: cadastra TV.
- `DELETE /api/tvs/:id`: remove TV.
- `GET /api/midias`: lista todas as midias cadastradas.
- `POST /api/midias`: faz upload de uma midia.
- `DELETE /api/midias/:id`: remove midia.
- `GET /api/midia-atual?tvId=recepcao`: retorna a playlist filtrada para uma TV.
- `POST /api/settings/ticker`: salva a faixa opcional.

## Dados locais

- Arquivos enviados: `uploads/`
- Midias: `data/midias.json`
- TVs: `data/tvs.json`
- Configuracoes: `data/settings.json`

Para producao, o ideal e migrar esses dados para Supabase, Firebase, S3/R2 ou outro storage persistente.

## Melhorias recomendadas

- Login no painel admin.
- Permissao por usuario, escola/unidade ou setor.
- Agendamento com data/hora de inicio e fim.
- Ordenacao manual da playlist por arrastar e soltar.
- Prioridade de emergencia para mensagens urgentes.
- Banco SQLite/Postgres em vez de JSON local.
- Storage externo para arquivos grandes.
- Logs de exibicao por TV.
- Tela de diagnostico do Raspberry com versao, IP, ultimo heartbeat e espaco em disco.
