export type Shard = "steam" | "kakao" | "psn" | "xbox";
export const SHARDS: Shard[] = ["steam", "kakao", "psn", "xbox"];
export const SHARD_LABELS: Record<Shard, string> = {
  steam: "PC (Steam)",
  kakao: "PC (Kakao)",
  psn: "PlayStation",
  xbox: "Xbox",
};

/* ---------- Kampe (listevisning) ---------- */

export interface Teammate {
  playerId: string;
  name: string;
  kills: number;
  assists: number;
  damage: number;
  dbnos: number;
  revives: number;
  headshots: number;
  longestKill: number;
  timeSurvived: number;
  distance: number;
  deathType: string;
  isMe: boolean;
}

export interface MatchSummary {
  id: string;
  createdAt: string;
  map: string;
  mapRaw: string;
  mode: string;
  matchType: string;
  duration: number;
  teams: number;
  players: number;
  placement: number;
  won: boolean;
  kills: number;
  assists: number;
  damage: number;
  dbnos: number;
  headshots: number;
  longestKill: number;
  timeSurvived: number;
  walkDistance: number;
  rideDistance: number;
  swimDistance: number;
  revives: number;
  heals: number;
  boosts: number;
  killPlace: number;
  deathType: string;
  teamKills: number;
  roadKills: number;
  vehicleDestroys: number;
  weaponsAcquired: number;
  team: Teammate[];
}

export interface ApiResponse {
  player: { id: string; name: string };
  shard: Shard;
  fetchedAt: string;
  matchCount: number;
  matches: MatchSummary[];
}

/* ---------- Sæsoner ---------- */

export interface SeasonInfo {
  id: string;
  label: string;
  current: boolean;
  ranked: boolean;
}

export interface ModeStats {
  mode: string;
  rounds: number;
  wins: number;
  top10s: number;
  losses: number;
  kills: number;
  assists: number;
  damage: number;
  headshots: number;
  dbnos: number;
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

export interface RankedStats {
  mode: string;
  tier: string;
  subTier: string;
  rp: number;
  bestTier: string;
  bestSubTier: string;
  bestRp: number;
  rounds: number;
  wins: number;
  avgRank: number;
  top10Ratio: number;
  winRatio: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  damage: number;
  headshots: number;
  dbnos: number;
  roundMostKills: number;
  longestKill: number;
  avgSurvivalTime: number;
}

export interface StatsResponse {
  seasonId: string;
  modes: ModeStats[];
  ranked: RankedStats[];
  rankedError?: string;
}

/* ---------- Kampdetaljer (telemetri) ---------- */

export interface Point {
  x: number; // 0..1 af kortets bredde
  y: number; // 0..1 af kortets højde
  t: number; // sekunder fra kampstart
}

export interface KillEvent {
  t: number;
  kind: "kill" | "knock" | "death" | "knocked";
  other: string;
  weapon: string;
  distance: number; // meter
  headshot: boolean;
  at: { x: number; y: number } | null;
}

export interface WeaponDamage {
  weapon: string;
  damage: number;
  hits: number;
  headshots: number;
  kills: number;
  knocks: number;
}

export interface TeamRoute {
  name: string;
  isMe: boolean;
  path: Point[];
  landedAt: number | null; // index i path hvor spilleren landede
}

export interface ZoneCircle {
  t: number;
  x: number;
  y: number;
  r: number; // radius som andel af kortets bredde
}

/** Et hold den viste spiller har været i kamp med (skade givet/taget, knocks, kills). */
export interface TeamFight {
  teamId: number;
  dealt: number;
  taken: number;
  knocks: number;
  kills: number;
  knockedBy: number;
  killedBy: boolean;
  first: number; // sekunder fra kampstart
}

export interface RosterRow {
  rank: number;
  teamId: number;
  names: string[];
  kills: number;
  damage: number;
  distance: number; // gennemsnit pr. spiller i meter
  isMine: boolean;
  members: Teammate[];
}

export interface MatchDetail {
  id: string;
  mapRaw: string;
  map: string;
  mapImage: string | null;
  duration: number;
  roster: RosterRow[];
  telemetry: {
    events: KillEvent[];
    dealt: WeaponDamage[];
    taken: { weapon: string; damage: number; hits: number }[];
    routes: TeamRoute[];
    zones: ZoneCircle[];
    landing: { x: number; y: number } | null;
    landingTime: number | null;
    damageTaken: number;
    firstFight: number | null;
    vehicles: string[];
    fights: TeamFight[];
  } | null;
  telemetryError?: string;
}

/* ---------- Oversættelser ---------- */

const MAP_NAMES: Record<string, string> = {
  Baltic_Main: "Erangel",
  Erangel_Main: "Erangel",
  Desert_Main: "Miramar",
  Savage_Main: "Sanhok",
  DihorOtok_Main: "Vikendi",
  Summerland_Main: "Karakin",
  Chimera_Main: "Paramo",
  Heaven_Main: "Haven",
  Tiger_Main: "Taego",
  Kiki_Main: "Deston",
  Neon_Main: "Rondo",
  Range_Main: "Camp Jackal",
};

export function mapName(raw: string): string {
  return MAP_NAMES[raw] ?? raw.replace(/_Main$/, "");
}

export function modeLabel(mode: string): string {
  if (/tdm/i.test(mode)) return "TDM";
  const [base, view] = mode.split("-");
  const known = ["solo", "duo", "squad"];
  if (!known.includes(base)) return mode;
  return `${base[0].toUpperCase()}${base.slice(1)} ${view === "fpp" ? "FPP" : "TPP"}`;
}

/** Team Deathmatch og andre arcade-modes tæller ikke som rigtige BR-kampe. */
export function isTdm(m: { mode: string; matchType?: string }) {
  return /tdm/i.test(m.mode);
}

export function isFpp(mode: string) {
  return mode.endsWith("-fpp");
}

export const DEATH_LABELS: Record<string, string> = {
  alive: "Survived",
  byplayer: "Killed by player",
  byzone: "Died in zone",
  suicide: "Suicide",
  logout: "Logged out",
};

export const TIER_COLORS: Record<string, string> = {
  Bronze: "#b8835a",
  Silver: "#b9bdc2",
  Gold: "#d9b44a",
  Platinum: "#7fb8ad",
  Crystal: "#a8d8e8",
  Diamond: "#8fb1d9",
  Master: "#b89ad6",
  Survivor: "#e8894a",
  Unranked: "#a39a8a",
};
