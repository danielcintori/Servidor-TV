//documentação feita por Guilherme Fagundes Leal :)
//bibliotecas

const express = require("express"); // framework web para node js para desenvolvimentos de APIs
const multer = require("multer"); // biblioteca padrão para fazer upload de arquivos que permite salvar eles na memória
const fs = require("fs"); //biblioteca que permite interagir com arquivos (ler, gravar, deletar etc)
const path = require("path"); // biblioteca para transformação e navegação de files de plataformas diferentes (linux, windows etc)

//localhost:3000
const app = express();
const PORT = process.env.PORT || 3000;

//arquivos e pastas
const ROOT = __dirname; // /PROJETOTV
const PUBLIC_DIR = path.join(ROOT, "public"); // /public -> pasta com html, css e js
const UPLOAD_DIR = path.join(ROOT, "uploads"); // /uploads -> .gitkeep
const DATA_DIR = path.join(ROOT, "data"); // /data -> .gitkeep e midias.json
const DB_FILE = path.join(DATA_DIR, "midias.json"); // arquivo midias.json

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"]); // tipos de arquivos permitidos
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]); // tipos de imagem
const videoExtensions = new Set([".mp4", ".webm"]); // tipos de vídeos

fs.mkdirSync(UPLOAD_DIR, { recursive: true });//pega os arquivos dentro da pasta /uploads e procura se tem outras pastas dentro
fs.mkdirSync(DATA_DIR, { recursive: true });//pega os arquivos dentro da pasta /data e procura se tem outras pastas dentro

function readMidias() {
  if (!fs.existsSync(DB_FILE)) return []; //se não existe midias.json, ele retorna um array vazio
  //se não ele lê o que está dentro do array em midias.json
  try {
    //adiciona ao json o que foi lido
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (error) {
    console.error("Erro ao ler banco local:", error);
    return [];
  }
}

function writeMidias(midias) {
  //recebe midias, escreve dentro do midias.json 
  fs.writeFileSync(DB_FILE, JSON.stringify(midias, null, 2));
}

function getMediaType(filename) {
  //pega o caminho do arquivo coloca em lower case
  const extension = path.extname(filename).toLowerCase();
  //verifica se é uma imagem
  if (imageExtensions.has(extension)) return "image";
  //ou um vídeo
  if (videoExtensions.has(extension)) return "video";
  //se não retorna como desconhecido
  return "unknown";
}
//cria um espaço no disco
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR), //determina o caminho de destino que é /uploads e manda o arquivo dentro
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase(); //caminho para o arquivo
    const baseName = path
      .basename(file.originalname, extension)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
      //magia 0_0
    callback(null, `${Date.now()}-${baseName || "midia"}${extension}`); //data + nome do arquivo
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }, //limite do tamanho do arquivo
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Formato nao permitido. Use jpg, png, webp, mp4 ou webm.")); //verifica se o tipo do arquivo está dentro dos permitidos
    }
    callback(null, true);
  }
});

app.use(express.json()); //o aplicativo usa o express.json que analisa os arquivos JSON
app.use(express.static(PUBLIC_DIR)); //conecta o frontend
//usa o endpoint uploads e determina um tempo máximo de 1 hora de cache
app.use("/uploads", express.static(UPLOAD_DIR, {
  maxAge: "1h",
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));

//quando tenta voltar para root apenas redireciona para /admin
app.get("/", (_req, res) => {
  res.redirect("/admin");
});

//quando for escrito o endpoint /admin é levado para o arquivo admin.html
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

//quando for escrito o endpoint /tv é levado para o arquivo tv.html
app.get("/tv", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "tv.html"));
});

//endpoint que leva a leitura do JSON na função readMidias()
app.get("/api/midias", (_req, res) => {
  res.json(readMidias());
});

//Pega a primeira mídia, quando foi postada ou atualizada e a playlist em que ela está, se não retorna null caso não exista
app.get("/api/midia-atual", (_req, res) => {
  //pega todas as mídias e coloca na constante
  const midias = readMidias();
  res.json({
    updatedAt: midias[0]?.createdAt || null,
    current: midias[0] || null,
    playlist: midias
  });
});

//posta uma mídia única, se não houver um arquivo responde com um erro
app.post("/api/midias", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Envie um arquivo no campo media." });
  }
  //duração de que a mídia vai ser mostrada
  const durationSeconds = Number.parseInt(req.body.durationSeconds, 10);
  //configurações da mídia postada
  const media = {
    //id sempre vai ser a data atual
    id: `${Date.now()}`,
    //nome original do upload
    originalName: req.file.originalname,
    //novo nome atribuido
    filename: req.file.filename,
    //url que será enviado
    url: `/uploads/${req.file.filename}`,
    //tipo de arquivo da mídia
    type: getMediaType(req.file.filename),
    //duração
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 10,
    //tamanho do arquivo
    size: req.file.size,
    //quando foi criado
    createdAt: new Date().toISOString()
  };
  //pega todas as mídias
  const midias = readMidias();
  //tira a primeira mídia do array do midias.json
  midias.unshift(media);
  //escreve a nova mídias
  writeMidias(midias);
  
  //sucesso
  res.status(201).json(media);
});

//dela uma das mídias
app.delete("/api/midias/:id", (req, res) => {
  //pega todas as mídias
  const midias = readMidias();
  //encontra a mídia com o id certo
  const media = midias.find((item) => item.id === req.params.id);

  //se não achar da not found
  if (!media) {
    return res.status(404).json({ error: "Midia nao encontrada." });
  }

  //escreve todas as mídias que não atendem o id da mídia que será deletada
  writeMidias(midias.filter((item) => item.id !== req.params.id));
  //deleta o caminho para a mídia com o id correspondente
  fs.rm(path.join(UPLOAD_DIR, media.filename), { force: true }, () => {});
  //sucesso
  res.status(204).end();
});

//erro padrão
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Erro inesperado." });
});

//mensagem que é passada pelo terminal
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sistema de TVs rodando em http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`TV: http://localhost:${PORT}/tv`);
});
