#!/usr/bin/env node
/**
 * Converte imagens pesadas de src/assets para WebP.
 *
 * - Logos grandes são redimensionados para no máximo 512px de largura
 *   (não fazem sentido em 2000px — perda de bateria e LCP horrível).
 * - Fotos/composições são redimensionadas para no máximo 1600px.
 * - Mantém o PNG/JPG original (para compatibilidade com imports legados
 *   e fallback manual quando necessário).
 *
 * Uso: node scripts/optimize-images.mjs
 */

import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join, resolve, parse } from "path";
import { readdir, stat } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "..", "src", "assets");

/**
 * Regras de transformação por arquivo.
 * Se um arquivo não listado aqui for grande (>500 KB), o script usa padrão
 * (max 1600px, quality 82).
 */
const RULES = {
  "logo-as.png": { maxWidth: 512, quality: 90 },
  "financeiro-gestor.png": { maxWidth: 1200, quality: 82 },
  "stock-employee.png": { maxWidth: 1200, quality: 82 },
  "pdv-venda-real.png": { maxWidth: 1400, quality: 85 },
  "pdv-checkout-scene.jpg": { maxWidth: 1600, quality: 80 },
  "mobile-mockup.png": { maxWidth: 720, quality: 88 },
};

const DEFAULT_RULE = { maxWidth: 1600, quality: 82 };

async function convert(filename) {
  const input = join(ASSETS_DIR, filename);
  const { name } = parse(filename);
  const output = join(ASSETS_DIR, `${name}.webp`);

  const rule = RULES[filename] ?? DEFAULT_RULE;

  const before = (await stat(input)).size;

  await sharp(input)
    .resize({
      width: rule.maxWidth,
      withoutEnlargement: true,
    })
    .webp({ quality: rule.quality, effort: 6 })
    .toFile(output);

  const after = (await stat(output)).size;
  const saved = Math.round(((before - after) / before) * 100);

  console.log(
    `[${filename}]  ${Math.round(before / 1024)} KB  →  ${name}.webp  ${Math.round(
      after / 1024,
    )} KB  (-${saved}%)`,
  );
}

async function main() {
  const files = await readdir(ASSETS_DIR);
  const targets = files.filter((f) => /\.(png|jpe?g)$/i.test(f));

  console.log(`Convertendo ${targets.length} imagens para WebP...\n`);

  for (const file of targets) {
    try {
      await convert(file);
    } catch (err) {
      console.error(`Falha em ${file}:`, err.message);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
