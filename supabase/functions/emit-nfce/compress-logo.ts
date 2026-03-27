/**
 * Reduz logo para ≤ 200 KB (limite Nuvem Fiscal) sem dependências nativas.
 * JPEG/PNG → RGBA → redimensiona + JPEG com qualidade decrescente.
 */

import { Buffer } from "node:buffer";
import { decode as decodeJpeg, encode as encodeJpeg } from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";

const MAX_BYTES = 200 * 1024;
const MAX_SIDE = 512;
const MIN_SIDE = 64;

function detectKind(bytes: Uint8Array): "jpeg" | "png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  return null;
}

function flattenOnWhite(rgba: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = rgba[o + 3] / 255;
    out[o] = Math.round(rgba[o] * a + 255 * (1 - a));
    out[o + 1] = Math.round(rgba[o + 1] * a + 255 * (1 - a));
    out[o + 2] = Math.round(rgba[o + 2] * a + 255 * (1 - a));
    out[o + 3] = 255;
  }
  return out;
}

function resizeBilinear(rgba: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const dst = new Uint8Array(dw * dh * 4);
  const xFactor = sw / dw;
  const yFactor = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * xFactor - 0.5;
      const sy = (y + 0.5) * yFactor - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const dx = sx - x0;
      const dy = sy - y0;
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = rgba[(y0 * sw + x0) * 4 + c];
        const p10 = rgba[(y0 * sw + x1) * 4 + c];
        const p01 = rgba[(y1 * sw + x0) * 4 + c];
        const p11 = rgba[(y1 * sw + x1) * 4 + c];
        const v = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy;
        dst[di + c] = Math.round(v);
      }
    }
  }
  return dst;
}

function decodeToRgba(buf: ArrayBuffer): { data: Uint8Array; w: number; h: number } | null {
  const bytes = new Uint8Array(buf);
  const kind = detectKind(bytes);
  try {
    if (kind === "jpeg") {
      const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
      if (!decoded.width || !decoded.height || !decoded.data) return null;
      return { data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), w: decoded.width, h: decoded.height };
    }
    if (kind === "png") {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { data: new Uint8Array(png.data), w: png.width, h: png.height };
    }
  } catch {
    return null;
  }
  return null;
}

function jpegToArrayBuffer(jpeg: { data: Uint8Array | Uint8Array[] }): ArrayBuffer {
  const d = jpeg.data as Uint8Array;
  const copy = new Uint8Array(d.byteLength);
  copy.set(d);
  return copy.buffer;
}

/**
 * Garante buffer ≤ 200 KB em JPEG. Retorna null se não conseguir (imagem inválida ou limite físico).
 */
export function compressLogoForNuvemFiscal(buf: ArrayBuffer): ArrayBuffer | null {
  if (buf.byteLength <= MAX_BYTES) return buf;

  const decoded = decodeToRgba(buf);
  if (!decoded) {
    console.warn("[emit-nfce] Não foi possível decodificar logo para recompressão (use PNG ou JPEG).");
    return null;
  }

  let { data, w, h } = decoded;
  let flat = flattenOnWhite(data, w, h);

  let scale = Math.min(1, MAX_SIDE / w, MAX_SIDE / h);
  let cw = Math.max(1, Math.round(w * scale));
  let ch = Math.max(1, Math.round(h * scale));
  if (cw !== w || ch !== h) {
    const resized = resizeBilinear(new Uint8Array(flat.buffer, flat.byteOffset, flat.byteLength), w, h, cw, ch);
    flat = flattenOnWhite(resized, cw, ch);
    w = cw;
    h = ch;
  }

  const tryEncode = (q: number): ArrayBuffer | null => {
    const jpeg = encodeJpeg({ data: flat, width: w, height: h }, q);
    if (jpeg.data.length <= MAX_BYTES) return jpegToArrayBuffer(jpeg);
    return null;
  };

  for (let q = 88; q >= 38; q -= 5) {
    const out = tryEncode(q);
    if (out) return out;
  }

  let factor = 0.88;
  for (let _ = 0; _ < 20 && Math.min(w, h) > MIN_SIDE; _++) {
    cw = Math.max(MIN_SIDE, Math.round(w * factor));
    ch = Math.max(MIN_SIDE, Math.round(h * factor));
    const resized = resizeBilinear(new Uint8Array(flat.buffer, flat.byteOffset, flat.byteLength), w, h, cw, ch);
    flat = flattenOnWhite(resized, cw, ch);
    w = cw;
    h = ch;
    for (let q = 85; q >= 35; q -= 5) {
      const out = tryEncode(q);
      if (out) return out;
    }
    factor *= 0.9;
  }

  console.warn("[emit-nfce] Logo acima de 200KB mesmo após recompressão.");
  return null;
}
