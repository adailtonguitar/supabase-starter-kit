function pad(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) { crc = (crc << 1) ^ 0x1021; } else { crc <<= 1; }
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixPayload {
  pixKey: string;
  pixKeyType?: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txId?: string;
  description?: string;
}

function normalizeASCII(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
}

function formatPixKey(key: string, keyType?: string): string {
  const cleaned = key.replace(/[\s\-().]/g, "");
  if (keyType === "phone" || (!keyType && /^\d{10,11}$/.test(cleaned))) {
    if (cleaned.startsWith("+55")) return cleaned;
    if (cleaned.startsWith("55") && cleaned.length >= 12) return "+" + cleaned;
    return "+55" + cleaned;
  }
  return key;
}

export function generatePixPayload(data: PixPayload): string {
  const merchantName = normalizeASCII(data.merchantName).substring(0, 25).toUpperCase();
  const merchantCity = normalizeASCII(data.merchantCity).substring(0, 15).toUpperCase();
  const txId = (data.txId || "***").substring(0, 25);
  const pixKey = formatPixKey(data.pixKey, data.pixKeyType);
  let mai = "";
  mai += pad("00", "br.gov.bcb.pix");
  mai += pad("01", pixKey);
  if (data.description) mai += pad("02", data.description.substring(0, 72));
  let payload = "";
  payload += pad("00", "01");
  payload += pad("01", "12");
  payload += pad("26", mai);
  payload += pad("52", "0000");
  payload += pad("53", "986");
  if (data.amount && data.amount > 0) payload += pad("54", data.amount.toFixed(2));
  payload += pad("58", "BR");
  payload += pad("59", merchantName);
  payload += pad("60", merchantCity);
  payload += pad("62", pad("05", txId));
  const crcInput = payload + "6304";
  const crcValue = crc16(crcInput);
  payload += pad("63", crcValue);
  return payload;
}
