import { mapImage } from "./maps";
import { analyzeTelemetry } from "./telemetry";
import {
  mapName,
  type MatchDetail,
  type MatchSummary,
  type ModeStats,
  type RankedStats,
  type RosterRow,
  type SeasonInfo,
  type Shard,
  type StatsResponse,
  type Teammate,
} from "./types";

// PUBG_API_BASE kan pege på en lokal mock under test. I drift bruges altid det officielle API.
const API = process.env.PUBG_API_BASE || "https://api.pubg.com";

export class PubgError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* PUBG tillader 10 kald/min på alt undtagen /matches. Vi holder os selv under 9 pr. instans,
   så en baggrundsscanning af sæsoner aldrig får den levende opdatering til at fejle. */
const LIMIT = 9;
const WINDOW = 60_000;
const recent: number[] = [];

async function rateSlot(path: string) {
  if (path.includes("/matches/")) return;
  for (let tries = 0; tries < 30; tries++) {
    const now = Date.now();
    while (recent.length && now - recent[0] > WINDOW) recent.shift();
    if (recent.length < LIMIT) {
      recent.push(now);
      return;
    }
    const wait = WINDOW - (now - recent[0]) + 50;
    if (wait > 20_000) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new PubgError(429, "PUBG's limit of 10 requests per minute was hit. Retrying on next refresh.");
}

async function pubg<T>(path: string): Promise<T> {
  const key = process.env.PUBG_API_KEY;
  if (!key) throw new PubgError(500, "PUBG_API_KEY is not set in the environment variables.");
  await rateSlot(path);

  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json" },
    cache: "no-store",
  });

  if (res.status === 404)
    throw new PubgError(404, "Not found. Check the name – PUBG names are case-sensitive.");
  if (res.status === 401) throw new PubgError(401, "PUBG rejected the API key. Check PUBG_API_KEY.");
  if (res.status === 429)
    throw new PubgError(429, "PUBG's limit of 10 requests per minute was hit. Retrying on next refresh.");
  if (!res.ok) throw new PubgError(res.status, `PUBG API svarede med status ${res.status}.`);
  return (await res.json()) as T;
}

/* ---------- TTL-cache i hukommelsen (overlever mellem kald på en varm Vercel-instans) ---------- */

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 3000;

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const p = fn()
    .then((value) => {
      cache.delete(key);
      cache.set(key, { value, expires: Date.now() + ttlMs });
      while (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cache.delete(oldest);
      }
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/* ---------- Spiller ---------- */

interface RawPlayer {
  data: {
    id: string;
    attributes: { name: string };
    relationships: { matches: { data: { id: string }[] } };
  }[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  matchIds: string[];
}

// Player-endpointet tæller mod rate limit (10/min). 15 s cache = max 4 kald/min pr. spiller.
export function getPlayer(shard: Shard, name: string): Promise<PlayerInfo> {
  return cached(`player:${shard}:${name.toLowerCase()}`, 15_000, async () => {
    const r = await pubg<RawPlayer>(
      `/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(name)}`
    );
    const p = r.data[0];
    if (!p) throw new PubgError(404, "Player not found.");
    return {
      id: p.id,
      name: p.attributes.name,
      matchIds: p.relationships.matches.data.map((m) => m.id),
    };
  });
}

/* ---------- Kampe ---------- */

interface RawStats {
  DBNOs: number;
  assists: number;
  boosts: number;
  damageDealt: number;
  deathType: string;
  headshotKills: number;
  heals: number;
  killPlace: number;
  kills: number;
  longestKill: number;
  name: string;
  playerId: string;
  revives: number;
  rideDistance: number;
  roadKills: number;
  swimDistance: number;
  teamKills: number;
  timeSurvived: number;
  vehicleDestroys: number;
  walkDistance: number;
  weaponsAcquired: number;
  winPlace: number;
}

interface Included {
  type: string;
  id: string;
  attributes: {
    stats?: RawStats & { rank?: number; teamId?: number };
    won?: string;
    URL?: string;
  };
  relationships?: { participants?: { data: { id: string }[] } };
}

interface RawMatch {
  data: {
    id: string;
    attributes: {
      createdAt: string;
      duration: number;
      gameMode: string;
      mapName: string;
      matchType: string;
    };
  };
  included: Included[];
}

// /matches tæller ikke mod rate limit, og kampdata ændrer sig aldrig.
function getMatchRaw(shard: Shard, matchId: string) {
  return cached(`raw:${shard}:${matchId}`, 5 * 60_000, () =>
    pubg<RawMatch>(`/shards/${shard}/matches/${matchId}`)
  );
}

export function getMatchSummary(
  shard: Shard,
  matchId: string,
  accountId: string
): Promise<MatchSummary | null> {
  return cached(`match:${shard}:${matchId}:${accountId}`, 24 * 3600_000, async () =>
    summarizeMatch(await getMatchRaw(shard, matchId), accountId)
  );
}

function splitMatch(m: RawMatch) {
  const participants = m.included.filter((i) => i.type === "participant" && i.attributes.stats);
  const rosters = m.included.filter((i) => i.type === "roster");
  return { participants, rosters };
}

function toTeammate(s: RawStats, accountId: string): Teammate {
  return {
    playerId: s.playerId,
    name: s.name,
    kills: s.kills,
    assists: s.assists,
    damage: Math.round(s.damageDealt),
    dbnos: s.DBNOs,
    revives: s.revives,
    headshots: s.headshotKills,
    longestKill: Math.round(s.longestKill),
    timeSurvived: Math.round(s.timeSurvived),
    distance: Math.round(s.walkDistance + s.rideDistance + s.swimDistance),
    deathType: s.deathType,
    isMe: s.playerId === accountId,
  };
}

function summarizeMatch(m: RawMatch, accountId: string): MatchSummary | null {
  const { participants, rosters } = splitMatch(m);

  const me = participants.find((p) => p.attributes.stats!.playerId === accountId);
  if (!me) return null;

  const myRoster = rosters.find((r) => r.relationships?.participants?.data.some((d) => d.id === me.id));
  const teamIds = new Set(myRoster?.relationships?.participants?.data.map((d) => d.id) ?? [me.id]);

  const team: Teammate[] = participants
    .filter((p) => teamIds.has(p.id))
    .map((p) => toTeammate(p.attributes.stats!, accountId))
    .sort((a, b) => b.damage - a.damage);

  const s = me.attributes.stats!;
  const a = m.data.attributes;
  const placement = myRoster?.attributes.stats?.rank ?? s.winPlace;

  return {
    id: m.data.id,
    createdAt: a.createdAt,
    map: mapName(a.mapName),
    mapRaw: a.mapName,
    mode: a.gameMode,
    matchType: a.matchType,
    duration: a.duration,
    teams: rosters.length || participants.length,
    players: participants.length,
    placement,
    won: myRoster?.attributes.won === "true" || placement === 1,
    kills: s.kills,
    assists: s.assists,
    damage: Math.round(s.damageDealt),
    dbnos: s.DBNOs,
    headshots: s.headshotKills,
    longestKill: Math.round(s.longestKill * 10) / 10,
    timeSurvived: Math.round(s.timeSurvived),
    walkDistance: Math.round(s.walkDistance),
    rideDistance: Math.round(s.rideDistance),
    swimDistance: Math.round(s.swimDistance),
    revives: s.revives,
    heals: s.heals,
    boosts: s.boosts,
    killPlace: s.killPlace,
    deathType: s.deathType,
    teamKills: s.teamKills,
    roadKills: s.roadKills,
    vehicleDestroys: s.vehicleDestroys,
    weaponsAcquired: s.weaponsAcquired,
    team,
  };
}

/* ---------- Kampdetaljer: alle hold + telemetri ---------- */

// Analyseret telemetri caches i 24 t. Fejl caches ikke, så næste klik prøver igen.
function getTelemetry(url: string, matchId: string, accountId: string, mapRaw: string) {
  return cached(`tele:${matchId}:${accountId}`, 24 * 3600_000, async () => {
    // Telemetri-CDN'et kræver ingen nøgle og tæller ikke mod rate limit.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const events = (await res.json()) as Parameters<typeof analyzeTelemetry>[0];
    return analyzeTelemetry(events, accountId, mapRaw);
  });
}

export async function getMatchDetail(shard: Shard, matchId: string, accountId: string): Promise<MatchDetail> {
  const m = await getMatchRaw(shard, matchId);
  const { participants, rosters } = splitMatch(m);
  const byId = new Map(participants.map((p) => [p.id, p.attributes.stats!]));

  const roster: RosterRow[] = rosters
    .map((r) => {
      const members = (r.relationships?.participants?.data ?? [])
        .map((d) => byId.get(d.id))
        .filter((s): s is RawStats => Boolean(s));
      const dist = members.reduce((a, s) => a + s.walkDistance + s.rideDistance + s.swimDistance, 0);
      return {
        rank: r.attributes.stats?.rank ?? 0,
        teamId: r.attributes.stats?.teamId ?? 0,
        names: members.map((s) => s.name),
        kills: members.reduce((a, s) => a + s.kills, 0),
        damage: Math.round(members.reduce((a, s) => a + s.damageDealt, 0)),
        distance: members.length ? Math.round(dist / members.length) : 0,
        isMine: members.some((s) => s.playerId === accountId),
        members: members.map((s) => toTeammate(s, accountId)).sort((x, y) => y.damage - x.damage),
      };
    })
    .sort((a, b) => a.rank - b.rank);

  const a = m.data.attributes;
  const detail: MatchDetail = {
    id: m.data.id,
    mapRaw: a.mapName,
    map: mapName(a.mapName),
    mapImage: mapImage(a.mapName),
    duration: a.duration,
    roster,
    telemetry: null,
  };

  const url = m.included.find((i) => i.type === "asset")?.attributes.URL;
  if (!url) {
    detail.telemetryError = "This match has no telemetry.";
    return detail;
  }
  try {
    detail.telemetry = await getTelemetry(url, matchId, accountId, a.mapName);
  } catch (e) {
    detail.telemetryError = `Telemetry could not be loaded (${e instanceof Error ? e.message : "unknown error"}).`;
  }
  return detail;
}

/* ---------- Sæsoner ---------- */

export function getSeasons(shard: Shard): Promise<SeasonInfo[]> {
  return cached(`seasons:${shard}`, 6 * 3600_000, async () => {
    const r = await pubg<{ data: { id: string; attributes: { isCurrentSeason: boolean } }[] }>(
      `/shards/${shard}/seasons`
    );
    return r.data
      .map((s) => {
        const m = s.id.match(/(?:pc-2018|console)-(\d+)$/);
        const n = m ? Number(m[1]) : null;
        return { s, n };
      })
      .filter((x): x is { s: (typeof r.data)[number]; n: number } => x.n !== null)
      .sort((a, b) => b.n - a.n)
      .map(({ s, n }) => ({
        id: s.id,
        label: `Season ${n}`,
        current: s.attributes.isCurrentSeason,
        ranked: n >= 7,
      }));
  });
}

interface RawModeStats {
  roundsPlayed: number;
  wins: number;
  top10s: number;
  losses: number;
  kills: number;
  assists: number;
  damageDealt: number;
  headshotKills: number;
  dBNOs: number;
  revives: number;
  longestKill: number;
  roundMostKills: number;
  maxKillStreaks: number;
  timeSurvived: number;
  walkDistance: number;
  rideDistance: number;
  heals: number;
  boosts: number;
}

interface RawRanked {
  currentTier?: { tier: string; subTier: string };
  currentRankPoint?: number;
  bestTier?: { tier: string; subTier: string };
  bestRankPoint?: number;
  roundsPlayed: number;
  wins: number;
  avgRank: number;
  top10Ratio: number;
  winRatio: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  damageDealt: number;
  headshotKills: number;
  dBNOs: number;
  roundMostKills: number;
  longestKill: number;
  avgSurvivalTime?: number;
}

/** season = sæson-id eller "lifetime" */
export async function getStats(shard: Shard, accountId: string, season: string): Promise<StatsResponse> {
  const seasons = await getSeasons(shard);
  const seasonId = season === "current" ? seasons.find((s) => s.current)?.id ?? "lifetime" : season;
  const info = seasons.find((s) => s.id === seasonId);
  // Afsluttede sæsoner ændrer sig ikke længere – cache dem et døgn.
  const ttl = seasonId === "lifetime" ? 10 * 60_000 : info?.current ? 120_000 : 24 * 3600_000;

  const normal = cached(`stats:${shard}:${accountId}:${seasonId}`, ttl, async () => {
    const r = await pubg<{ data: { attributes: { gameModeStats: Record<string, RawModeStats> } } }>(
      `/shards/${shard}/players/${accountId}/seasons/${seasonId}`
    );
    return Object.entries(r.data.attributes.gameModeStats)
      .filter(([, s]) => s.roundsPlayed > 0)
      .map(
        ([mode, s]): ModeStats => ({
          mode,
          rounds: s.roundsPlayed,
          wins: s.wins,
          top10s: s.top10s,
          losses: s.losses,
          kills: s.kills,
          assists: s.assists,
          damage: s.damageDealt,
          headshots: s.headshotKills,
          dbnos: s.dBNOs,
          revives: s.revives,
          longestKill: s.longestKill,
          roundMostKills: s.roundMostKills,
          maxKillStreaks: s.maxKillStreaks,
          timeSurvived: s.timeSurvived,
          walkDistance: s.walkDistance,
          rideDistance: s.rideDistance,
          heals: s.heals,
          boosts: s.boosts,
        })
      )
      .sort((a, b) => b.rounds - a.rounds);
  });

  const rankedAllowed = seasonId !== "lifetime" && (info?.ranked ?? false);
  const ranked = rankedAllowed
    ? getRanked(shard, accountId, seasonId, ttl)
    : Promise.resolve([] as RankedStats[]);

  const [modes, rankedRes] = await Promise.all([normal, ranked.then((v) => ({ v, err: null as string | null })).catch((e) => ({ v: [] as RankedStats[], err: e instanceof Error ? e.message : "Error" }))]);

  return { seasonId, modes, ranked: rankedRes.v, ...(rankedRes.err ? { rankedError: rankedRes.err } : {}) };
}

/** Ranked-stats for én sæson. Afsluttede sæsoner ændrer sig ikke og caches et døgn. */
export function getRanked(shard: Shard, accountId: string, seasonId: string, ttl = 24 * 3600_000): Promise<RankedStats[]> {
  return cached(`ranked:${shard}:${accountId}:${seasonId}`, ttl, async () => {
        const r = await pubg<{
          data: { attributes: { rankedGameModeStats: Record<string, RawRanked> } };
        }>(`/shards/${shard}/players/${accountId}/seasons/${seasonId}/ranked`);
        return Object.entries(r.data.attributes.rankedGameModeStats ?? {})
          .filter(([, s]) => s.roundsPlayed > 0)
          .map(
            ([mode, s]): RankedStats => ({
              mode,
              tier: s.currentTier?.tier ?? "Unranked",
              subTier: s.currentTier?.subTier ?? "",
              rp: s.currentRankPoint ?? 0,
              bestTier: s.bestTier?.tier ?? "Unranked",
              bestSubTier: s.bestTier?.subTier ?? "",
              bestRp: s.bestRankPoint ?? 0,
              rounds: s.roundsPlayed,
              wins: s.wins,
              avgRank: s.avgRank,
              top10Ratio: s.top10Ratio,
              winRatio: s.winRatio,
              kills: s.kills,
              deaths: s.deaths,
              assists: s.assists,
              kda: s.kda,
              damage: s.damageDealt,
              headshots: s.headshotKills,
              dbnos: s.dBNOs,
              roundMostKills: s.roundMostKills,
              longestKill: s.longestKill,
              avgSurvivalTime: s.avgSurvivalTime ?? 0,
            })
          )
          .sort((a, b) => b.rounds - a.rounds);
  });
}
