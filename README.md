# Sistema de TVs com Raspberry Pi

Protótipo funcional para enviar imagens e vídeos por um painel web e exibir automaticamente em TVs conectadas a Raspberry Pi.

## Requisitos

- Node.js 18 ou superior.
- Raspberry Pi OS com Chromium instalado.

## Instalação

```bash
npm install
npm start
```

A aplicação sobe em:

- Painel admin: `http://localhost:3000/admin`
- Tela da TV: `http://localhost:3000/tv`
- API de mídias: `http://localhost:3000/api/midias`
- API da mídia atual/playlist: `http://localhost:3000/api/midia-atual`

Para acessar pela rede local, abra no Raspberry o IP do computador/servidor:

```text
http://IP_DO_SERVIDOR:3000/tv
```

## Uso

1. Acesse `/admin`.
2. Envie um arquivo `.jpg`, `.png`, `.webp`, `.mp4` ou `.webm`.
3. Abra `/tv` em outra tela ou no Raspberry.
4. A TV verifica novidades a cada 10 segundos e troca o conteúdo automaticamente.

Imagens usam o tempo configurado no painel. Vídeos rodam com `autoplay`, `muted`, `loop` e `playsinline`.

## Storage local

- Arquivos enviados ficam em `uploads/`.
- Metadados ficam em `data/midias.json`.

Este protótipo usa armazenamento local para simplificar. Em produção, pode ser migrado para Supabase Storage, Firebase Storage, Cloudflare R2 ou S3.

## Raspberry Pi em modo kiosk

Exemplo de comando:

```bash
chromium-browser --noerrdialogs --disable-infobars --kiosk http://IP_DO_SERVIDOR:3000/tv
```

Para iniciar automaticamente ao ligar, edite:

```bash
mkdir -p ~/.config/lxsession/LXDE-pi
nano ~/.config/lxsession/LXDE-pi/autostart
```

Conteúdo sugerido:

```text
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
@chromium-browser --noerrdialogs --disable-infobars --kiosk http://IP_DO_SERVIDOR:3000/tv
```

Se `unclutter` não estiver instalado:

```bash
sudo apt install unclutter
```

## Próximas melhorias

- Separar TVs por grupos.
- Agendar início e fim de cada mídia.
- Registrar status online/offline dos Raspberrys.
- Adicionar autenticação no painel admin.
- Trocar o JSON local por SQLite ou banco gerenciado.
