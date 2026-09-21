import { supabase } from './supabase';

// Envio de arquivo para o bucket 'fotos'. UM lugar só com a política inteira:
// compressão, nome do caminho, tipo declarado e checagem de erro.
//
// Por que existe: foto de celular chega com 4 a 8 MB. Subir crua enche o
// storage e deixa a tela lenta justamente onde a internet é pior — no canteiro.
// A imagem é reduzida ANTES de sair do aparelho, então o usuário pode escolher
// a foto que quiser, no tamanho que vier, que o que sobe é leve.
//
// PDF passa intacto de propósito: contrato, nota e cotação não podem perder
// nitidez, e já chegam pequenos (média de 330 KB nos arquivos reais).

const MAX_LADO = 1600;      // cabe em tela cheia de desktop sem borrar
const QUALIDADE = 0.7;      // abaixo disso começa a aparecer sujeira no JPEG

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Devolve um JPEG menor, ou null quando não deu para comprimir (formato que o
// navegador não decodifica, como HEIC no desktop). Null é resposta legítima:
// quem chama sobe o original em vez de mentir sobre o tipo do arquivo.
async function comprimirImagem(file, maxDim = MAX_LADO, quality = QUALIDADE) {
  if (!file?.type?.startsWith('image/')) return null;
  try {
    const img = await carregarImagem(file);
    const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * escala));
    const h = Math.max(1, Math.round(img.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  } catch (_) {
    return null;
  }
}

// pasta: 'pedidos' | 'cotacoes' | 'atas' | 'rdo/<id>'…
// Nome sorteado, nunca o nome original: o bucket é público, então caminho
// adivinhável é arquivo adivinhável. O nome de exibição vai no retorno.
export async function enviarArquivo(file, pasta, { maxDim, quality } = {}) {
  const comprimida = await comprimirImagem(file, maxDim, quality);
  const blob = comprimida || file;
  const ext = comprimida ? 'jpg' : (file.name?.split('.').pop() || 'bin').toLowerCase();
  const tipoMime = comprimida ? 'image/jpeg' : (file.type || undefined);
  const path = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from('fotos')
    .upload(path, blob, { upsert: false, contentType: tipoMime });
  if (error) throw error;

  const { data: pub } = supabase.storage.from('fotos').getPublicUrl(path);
  return {
    url: pub.publicUrl,
    path,
    nome: file.name || 'arquivo',
    tipo: file.type?.startsWith('image/') ? 'foto' : 'pdf',
    bytes: blob.size ?? file.size ?? 0,
  };
}
