/**
 * Normaliza o logo da empresa para uso em DANFE/cupom fiscal na Nuvem Fiscal:
 * - PNG ou JPEG, máximo 200 KB (regra da API)
 * - Redimensiona para caber em ~512px (suficiente para impressão térmica)
 * - Fundo branco (JPEG não preserva transparência)
 */

const MAX_BYTES = 200 * 1024;
const MAX_SIDE = 512;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem. Use PNG ou JPEG."));
    };
    img.src = url;
  });
}

/**
 * Gera JPEG otimizado para limite da Nuvem Fiscal.
 */
export async function normalizeCompanyLogoForFiscal(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem (PNG ou JPEG).");
  }
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    throw new Error("SVG não é aceito. Exporte como PNG ou JPEG.");
  }

  const img = await loadImageFromFile(file);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Dimensões da imagem inválidas.");

  const scale = Math.min(1, MAX_SIDE / w, MAX_SIDE / h);
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta processamento de imagem.");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.9;
  for (let i = 0; i < 10; i++) {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_BYTES) return blob;
    quality -= 0.07;
    if (quality < 0.35) break;
  }

  // Ainda grande: reduz dimensões
  let factor = 0.88;
  while (w > 80 && h > 80) {
    w = Math.max(80, Math.round(w * factor));
    h = Math.max(80, Math.round(h * factor));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    if (blob && blob.size <= MAX_BYTES) return blob;
    factor *= 0.92;
  }

  throw new Error(
    "Não foi possível reduzir o logo para no máximo 200 KB. Tente uma imagem com menos detalhes ou menor resolução.",
  );
}
