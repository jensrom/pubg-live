import type { MatchSummary } from "./types";

export interface Summary {
  n: number;
  wins: number;
  top10: number;
  kills: number;
  deaths: number;
  kd: number;
  kda: number;
  avgKills: number;
  avgDmg: number;
  avgPlace: number;
  avgPlacePct: number; // 0 = altid nr. 1, 1 = altid sidst
  hs: number;
  assists: number;
  knocks: number;
  avgSurvived: number;
  mostKills: number;
  longest: number;
  avgDistance: number;
  bestDmg: number;
}

export function summarize(ms: MatchSummary[]): Summary {
  const n = ms.length;
  const sum = (f: (m: MatchSummary) => number) => ms.reduce((a, m) => a + f(m), 0);
  const max = (f: (m: MatchSummary) => number) => ms.reduce((a, m) => Math.max(a, f(m)), 0);
  const kills = sum((m) => m.kills);
  const assists = sum((m) => m.assists);
  const deaths = ms.filter((m) => m.deathType !== "alive").length;
  return {
    n,
    wins: ms.filter((m) => m.placement === 1).length,
    top10: ms.filter((m) => m.placement <= 10).length,
    kills,
    deaths,
    kd: deaths ? kills / deaths : kills,
    kda: deaths ? (kills + assists) / deaths : kills + assists,
    avgKills: n ? kills / n : 0,
    avgDmg: n ? sum((m) => m.damage) / n : 0,
    avgPlace: n ? sum((m) => m.placement) / n : 0,
    avgPlacePct: n ? sum((m) => (m.teams > 1 ? (m.placement - 1) / (m.teams - 1) : 0)) / n : 0,
    hs: kills ? sum((m) => m.headshots) / kills : 0,
    assists,
    knocks: sum((m) => m.dbnos),
    avgSurvived: n ? sum((m) => m.timeSurvived) / n : 0,
    mostKills: max((m) => m.kills),
    longest: max((m) => m.longestKill),
    avgDistance: n ? sum((m) => m.walkDistance + m.rideDistance + m.swimDistance) / n : 0,
    bestDmg: max((m) => m.damage),
  };
}

/** En session = kampe med under 90 minutters pause imellem (listen er nyeste først). */
export function latestSession(ms: MatchSummary[]): MatchSummary[] {
  if (!ms.length) return [];
  const out = [ms[0]];
  for (let i = 1; i < ms.length; i++) {
    const gap = Date.parse(ms[i - 1].createdAt) - (Date.parse(ms[i].createdAt) + ms[i].duration * 1000);
    if (gap > 90 * 60_000) break;
    out.push(ms[i]);
  }
  return out;
}

export type TimeRange = "alle" | "session" | "idag" | "24t" | "7d";
export const TIME_LABELS: Record<TimeRange, string> = {
  alle: "All",
  session: "Latest session",
  idag: "Today",
  "24t": "24 hours",
  "7d": "7 days",
};

export function inRange(ms: MatchSummary[], range: TimeRange, now = Date.now()): MatchSummary[] {
  if (range === "alle") return ms;
  if (range === "session") return latestSession(ms);
  let from = 0;
  if (range === "idag") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    from = d.getTime();
  } else if (range === "24t") from = now - 24 * 3600_000;
  else from = now - 7 * 24 * 3600_000;
  return ms.filter((m) => Date.parse(m.createdAt) >= from);
}

export interface MapRow {
  map: string;
  games: number;
  wins: number;
  top10: number;
  avgPlace: number;
  avgDmg: number;
  kd: number;
}

export function byMap(ms: MatchSummary[]): MapRow[] {
  const groups = new Map<string, MatchSummary[]>();
  for (const m of ms) groups.set(m.map, [...(groups.get(m.map) ?? []), m]);
  return [...groups.entries()]
    .map(([map, g]) => {
      const s = summarize(g);
      return { map, games: s.n, wins: s.wins, top10: s.top10, avgPlace: s.avgPlace, avgDmg: s.avgDmg, kd: s.kd };
    })
    .sort((a, b) => b.games - a.games);
}

export interface MateRow {
  name: string;
  games: number;
  wins: number;
  avgPlace: number;
  theirDmg: number;
  myDmg: number;
}

export function playedWith(ms: MatchSummary[]): MateRow[] {
  const rows = new Map<string, { games: number; wins: number; place: number; their: number; mine: number }>();
  for (const m of ms) {
    const me = m.team.find((t) => t.isMe);
    for (const t of m.team) {
      if (t.isMe) continue;
      const r = rows.get(t.name) ?? { games: 0, wins: 0, place: 0, their: 0, mine: 0 };
      r.games += 1;
      r.wins += m.placement === 1 ? 1 : 0;
      r.place += m.placement;
      r.their += t.damage;
      r.mine += me?.damage ?? m.damage;
      rows.set(t.name, r);
    }
  }
  return [...rows.entries()]
    .map(([name, r]) => ({
      name,
      games: r.games,
      wins: r.wins,
      avgPlace: r.place / r.games,
      theirDmg: r.their / r.games,
      myDmg: r.mine / r.games,
    }))
    .sort((a, b) => b.games - a.games || a.avgPlace - b.avgPlace)
    .slice(0, 8);
}

export function unique(arr: string[]) {
  return [...new Set(arr)];
}
