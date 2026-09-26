import weaponNames from "./weapons.json";
import { mapSizeCm } from "./maps";
import type { KillEvent, MatchDetail, Point, TeamRoute, WeaponDamage, ZoneCircle } from "./types";

/* PUBG-telemetri er én stor JSON-array med events. Vi læser kun de få typer vi skal bruge
   og smider resten væk, så svaret til browseren bliver få KB i stedet for 10-30 MB. */

interface Loc {
  x: number;
  y: number;
  z: number;
}
interface Char {
  name: string;
  teamId: number;
  accountId: string;
  location: Loc;
}
interface DamageInfo {
  damageReason?: string;
  damageTypeCategory?: string;
  damageCauserName?: string;
  distance?: number;
}
interface Ev {
  _D: string;
  _T: string;
  [k: string]: unknown;
}

const NAMES = weaponNames as Record<string, string>;

const CATEGORY_LABELS: Record<string, string> = {
  Damage_BlueZone: "Blue zone",
  Damage_Drown: "Drowned",
  Damage_Fall: "Fall damage",
  Damage_Groggy: "Bled out",
  Damage_VehicleHit: "Run over",
  Damage_VehicleCrashHit: "Vehicle crash",
  Damage_Vehicle: "Vehicle",
  Damage_Explosion_RedZone: "Red zone",
  Damage_Explosion_BlackZone: "Black zone",
  Damage_Explosion_Grenade: "Grenade",
  Damage_Molotov: "Molotov",
};

export function weaponLabel(info: DamageInfo | undefined): string {
  if (!info) return "Unknown";
  const causer = info.damageCauserName ?? "";
  if (causer && causer !== "None" && NAMES[causer]) return NAMES[causer];
  const cat = info.damageTypeCategory ?? "";
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
  if (causer && causer !== "None") return causer.replace(/^Weap/, "").replace(/_C$/, "");
  return cat.replace(/^Damage_/, "") || "Unknown";
}

const isHead = (i?: DamageInfo | { damageReason?: string }) => i?.damageReason === "HeadShot";

export function analyzeTelemetry(
  events: Ev[],
  accountId: string,
  mapRaw: string
): NonNullable<MatchDetail["telemetry"]> {
  const size = mapSizeCm(mapRaw);
  const norm = (l: Loc | undefined) =>
    l && (l.x || l.y) ? { x: clamp01(l.x / size), y: clamp01(l.y / size) } : null;

  const start = Date.parse(
    (events.find((e) => e._T === "LogMatchStart") ?? events[0])?._D ?? new Date().toISOString()
  );
  const sec = (e: Ev) => Math.max(0, Math.round((Date.parse(e._D) - start) / 1000));

  // Find mit hold via første positions-event
  let myTeam = -1;
  for (const e of events) {
    if (e._T !== "LogPlayerPosition") continue;
    const c = e.character as Char;
    if (c?.accountId === accountId) {
      myTeam = c.teamId;
      break;
    }
  }

  const routes = new Map<string, TeamRoute & { lastT: number }>();
  const landed = new Map<string, number>();
  const kills: KillEvent[] = [];
  const dealt = new Map<string, WeaponDamage>();
  const taken = new Map<string, { weapon: string; damage: number; hits: number }>();
  const zones: ZoneCircle[] = [];
  const vehicles = new Set<string>();
  let damageTaken = 0;
  let firstFight: number | null = null;
  let landing: { x: number; y: number } | null = null;
  let landingTime: number | null = null;
  let lastZoneR = -1;

  const weaponRow = (w: string) => {
    let r = dealt.get(w);
    if (!r) {
      r = { weapon: w, damage: 0, hits: 0, headshots: 0, kills: 0, knocks: 0 };
      dealt.set(w, r);
    }
    return r;
  };

  for (const e of events) {
    switch (e._T) {
      case "LogPlayerPosition": {
        const c = e.character as Char;
        if (!c || c.teamId !== myTeam) break;
        const p = norm(c.location);
        if (!p) break;
        const t = Number(e.elapsedTime ?? sec(e));
        let r = routes.get(c.accountId);
        if (!r) {
          r = { name: c.name, isMe: c.accountId === accountId, path: [], landedAt: null, lastT: -1 };
          routes.set(c.accountId, r);
        }
        if (t === r.lastT) break;
        r.lastT = t;
        r.path.push({ x: round4(p.x), y: round4(p.y), t });
        break;
      }

      case "LogParachuteLanding": {
        const c = e.character as Char;
        if (!c || c.teamId !== myTeam) break;
        const r = routes.get(c.accountId);
        if (r && !landed.has(c.accountId)) landed.set(c.accountId, r.path.length);
        if (c.accountId === accountId && !landing) {
          landing = norm(c.location);
          landingTime = sec(e);
        }
        break;
      }

      case "LogVehicleRide": {
        const c = e.character as Char;
        const v = e.vehicle as { vehicleId?: string } | undefined;
        if (c?.accountId === accountId && v?.vehicleId && !/Parachute|Plane|Dummy/i.test(v.vehicleId))
          vehicles.add(NAMES[v.vehicleId] ?? v.vehicleId.replace(/^BP_/, "").replace(/_C$/, ""));
        break;
      }

      case "LogPlayerTakeDamage": {
        const att = e.attacker as Char | null;
        const vic = e.victim as Char | null;
        const dmg = Number(e.damage) || 0;
        if (dmg <= 0) break;
        const info = e as unknown as DamageInfo;
        if (att?.accountId === accountId && vic && vic.teamId !== myTeam) {
          const row = weaponRow(weaponLabel(info));
          row.damage += dmg;
          row.hits += 1;
          if (isHead(info)) row.headshots += 1;
          if (firstFight === null) firstFight = sec(e);
        }
        if (vic?.accountId === accountId) {
          damageTaken += dmg;
          const w = weaponLabel(info);
          const r = taken.get(w) ?? { weapon: w, damage: 0, hits: 0 };
          r.damage += dmg;
          r.hits += 1;
          taken.set(w, r);
          if (att && att.teamId !== myTeam && firstFight === null) firstFight = sec(e);
        }
        break;
      }

      case "LogPlayerMakeGroggy": {
        const att = e.attacker as Char | null;
        const vic = e.victim as Char | null;
        const info = e as unknown as DamageInfo;
        if (att?.accountId === accountId && vic) {
          kills.push({
            t: sec(e),
            kind: "knock",
            other: vic.name,
            weapon: weaponLabel(info),
            distance: Math.round((info.distance ?? 0) / 100),
            headshot: isHead(info),
            at: norm(vic.location),
          });
          weaponRow(weaponLabel(info)).knocks += 1;
        } else if (vic?.accountId === accountId) {
          kills.push({
            t: sec(e),
            kind: "knocked",
            other: att?.name ?? "Unknown",
            weapon: weaponLabel(info),
            distance: Math.round((info.distance ?? 0) / 100),
            headshot: isHead(info),
            at: norm(vic.location),
          });
        }
        break;
      }

      case "LogPlayerKillV2": {
        const victim = e.victim as Char | null;
        const killer = (e.killer ?? e.finisher) as Char | null;
        const info = (e.killerDamageInfo ?? e.finishDamageInfo) as DamageInfo | undefined;
        if (killer?.accountId === accountId && victim && victim.accountId !== accountId) {
          kills.push({
            t: sec(e),
            kind: "kill",
            other: victim.name,
            weapon: weaponLabel(info),
            distance: Math.round((info?.distance ?? 0) / 100),
            headshot: isHead(info),
            at: norm(victim.location),
          });
          weaponRow(weaponLabel(info)).kills += 1;
        } else if (victim?.accountId === accountId) {
          const suicide = Boolean(e.isSuicide);
          kills.push({
            t: sec(e),
            kind: "death",
            other: suicide ? "Yourself" : killer?.name ?? weaponLabel(info),
            weapon: weaponLabel(info),
            distance: Math.round((info?.distance ?? 0) / 100),
            headshot: isHead(info),
            at: norm(victim.location),
          });
        }
        break;
      }

      case "LogGameStatePeriodic": {
        // poisonGasWarning = den hvide cirkel (næste safe zone). Én ny værdi pr. fase.
        const g = e.gameState as
          | { elapsedTime: number; poisonGasWarningPosition: Loc; poisonGasWarningRadius: number }
          | undefined;
        if (!g || !g.poisonGasWarningRadius) break;
        const r = Math.round(g.poisonGasWarningRadius);
        if (lastZoneR !== -1 && Math.abs(r - lastZoneR) < lastZoneR * 0.01) break;
        lastZoneR = r;
        const p = norm(g.poisonGasWarningPosition);
        if (!p) break;
        zones.push({ t: g.elapsedTime, x: round4(p.x), y: round4(p.y), r: round4(r / size) });
        break;
      }
    }
  }


  const routeList = [...routes.entries()].map(([id, r]) => ({
    name: r.name,
    isMe: r.isMe,
    path: thin(r.path),
    landedAt: (() => {
      const idx = landed.get(id);
      if (idx === undefined) return null;
      // index skal pege ind i den udtyndede sti
      const t = r.path[Math.min(idx, r.path.length - 1)]?.t ?? 0;
      return thin(r.path).findIndex((p) => p.t >= t);
    })(),
  }));
  routeList.sort((a, b) => Number(b.isMe) - Number(a.isMe));

  return {
    events: kills.sort((a, b) => a.t - b.t),
    dealt: [...dealt.values()]
      .map((r) => ({ ...r, damage: Math.round(r.damage) }))
      .sort((a, b) => b.damage - a.damage),
    taken: [...taken.values()]
      .map((r) => ({ ...r, damage: Math.round(r.damage) }))
      .sort((a, b) => b.damage - a.damage),
    routes: routeList,
    zones: dedupeZones(zones),
    landing,
    landingTime,
    damageTaken: Math.round(damageTaken),
    firstFight,
    vehicles: [...vehicles],
  };
}

function dedupeZones(z: ZoneCircle[]) {
  const out: ZoneCircle[] = [];
  for (const c of z) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.r - c.r) < 0.001) continue;
    out.push(c);
  }
  return out.slice(0, 12);
}

// Maks ~220 punkter pr. spiller er rigeligt til at tegne en rute
function thin(path: Point[]): Point[] {
  if (path.length <= 220) return path;
  const step = path.length / 220;
  const out: Point[] = [];
  for (let i = 0; i < 220; i++) out.push(path[Math.floor(i * step)]);
  out.push(path[path.length - 1]);
  return out;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
