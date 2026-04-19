/**
 * Log local (localStorage) de acionamentos do "Notificar dono" no Radar Fiscal.
 * Sem migrations — apenas observabilidade no browser do super admin.
 */
const KEY = "fiscal_radar_notify_log_v1";
const MAX = 200;

export interface NotifyLogEntry {
  ts: string; // ISO
  company_id: string;
  company_name?: string;
  recipients: string[];
  critical: number;
  warn: number;
  note?: string;
}

export function readNotifyLog(): NotifyLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NotifyLogEntry[];
  } catch {
    return [];
  }
}

export function appendNotifyLog(entry: NotifyLogEntry) {
  try {
    const cur = readNotifyLog();
    cur.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(cur.slice(0, MAX)));
  } catch (e) {
    console.warn("[fiscal-radar-notify-log] persist failed", e);
  }
}

export function lastNotifyForCompany(company_id: string): NotifyLogEntry | null {
  return readNotifyLog().find((e) => e.company_id === company_id) || null;
}
