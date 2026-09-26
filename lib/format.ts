export function num(n: number, d = 0) {
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pct(f: number, d = 0) {
  if (!Number.isFinite(f)) return "–";
  return `${num(f * 100, d)}%`;
}

export function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function km(meters: number) {
  return meters >= 1000 ? `${num(meters / 1000, 1)} km` : `${Math.round(meters)} m`;
}

export function clock(iso: string | number) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function ago(iso: string, now = Date.now()) {
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function dayTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
