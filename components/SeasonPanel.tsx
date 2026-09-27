"use client";

import { useEffect, useState } from "react";
import { mmss, num, pct } from "@/lib/format";
import {
  TIER_COLORS,
  type ModeStats,
  type RankedStats,
  type SeasonInfo,
  type Shard,
  type StatsResponse,
} from "@/lib/types";

type View = "fpp" | "tpp";
const MODES = ["solo", "duo", "squad"] as const;
const MODE_NAMES: Record<string, string> = { solo: "Solo", duo: "Duo", squad: "Squad" };

export default function SeasonPanel({
  shard,
  accountId,
  refreshKey,
  preferFpp,
}: {
  shard: Shard;
  accountId: string;
  refreshKey: string;
  preferFpp: boolean;
}) {
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [season, setSeason] = useState("current");
  const [view, setView] = useState<View>(preferFpp ? "fpp" : "tpp");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setView(preferFpp ? "fpp" : "tpp"), [preferFpp]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/seasons?shard=${shard}`)
      .then((r) => r.json())
      .then((j) => alive && Array.isArray(j) && setSeasons(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shard]);

  // Hent sæsonstats. Nuværende sæson hentes igen når der kommer en ny kamp (refreshKey).
  const isCurrent = season === "current";
  const key = `${shard}|${accountId}|${season}|${isCurrent ? refreshKey : ""}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/stats?shard=${shard}&account=${accountId}&season=${encodeURIComponent(season)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Fejl ${r.status}`);
        return j as StatsResponse;
      })
      .then((j) => {
        if (!alive) return;
        setStats(j);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const suffix = view === "fpp" ? "-fpp" : "";
  const modeKey = (m: string) => `${m}${suffix}`;
  const normal = new Map((stats?.modes ?? []).map((m) => [m.mode, m]));
  const ranked = new Map((stats?.ranked ?? []).map((m) => [m.mode, m]));
  const rankedModes = ["squad", "duo"].map(modeKey).filter((m) => ranked.has(m));
  const currentLabel = seasons.find((s) => s.current)?.label;
  const showRanked = season !== "lifetime";

  return (
    <section className="season-panel" aria-label="Season stats" aria-busy={loading}>
      <div className="panel-bar">
        <h2>Season stats</h2>
        <div className="panel-controls">
          <select aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value)}>
            <option value="current">{currentLabel ? `${currentLabel} (current)` : "Current season"}</option>
            <option value="lifetime">Lifetime (all seasons)</option>
            {seasons
              .filter((s) => !s.current)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </select>
          <div className="seg" role="group" aria-label="Perspective">
            <button type="button" aria-pressed={view === "fpp"} onClick={() => setView("fpp")}>
              FPP
            </button>
            <button type="button" aria-pressed={view === "tpp"} onClick={() => setView("tpp")}>
              TPP
            </button>
          </div>
          {loading && <span className="muted small">Loading…</span>}
        </div>
      </div>

      {error && <p className="error small">{error}</p>}

      {showRanked && (
        <div className="ranked-row">
          {rankedModes.length ? (
            rankedModes.map((m) => <RankedCard key={m} s={ranked.get(m)!} />)
          ) : (
            <div className="card card-empty">
              <span className="card-title">Ranked {view.toUpperCase()}</span>
              <p className="muted small">
                {stats?.rankedError ? stats.rankedError : "No ranked matches this season."}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mode-row">
        {MODES.filter((m) => normal.has(modeKey(m))).map((m) => (
          <ModeCard key={m} title={`${MODE_NAMES[m]} ${view.toUpperCase()}`} s={normal.get(modeKey(m))!} />
        ))}
      </div>
      {stats && (
        <p className="muted small season-note">
          K/D = kills ÷ deaths · KDA = (kills + assists) ÷ deaths · Percentages are rounded down like in-game. PUBG&apos;s
          API has no average placement for normal modes, so that figure is only shown for ranked.
        </p>
      )}
      {MODES.some((m) => !normal.has(modeKey(m))) && stats && (
        <p className="muted small empty-modes">
          No matches in{" "}
          {MODES.filter((m) => !normal.has(modeKey(m)))
            .map((m) => `${MODE_NAMES[m]} ${view.toUpperCase()}`)
            .join(", ")}
          {season === "lifetime" ? "." : " this season."}
        </p>
      )}
    </section>
  );
}

function tierLabel(tier: string, sub: string) {
  if (tier === "Master" || tier === "Survivor" || tier === "Unranked") return tier;
  return `${tier} ${sub}`.trim();
}

// PUBG viser procenter rundet ned (fx 5/40 = 12,5 % vises som 12 %). Vi gør det samme, så tallene matcher.
function gamePct(part: number, whole: number) {
  return whole ? `${Math.floor((part / whole) * 100)}%` : "–";
}

function Ratios({ kd, kda, dmg }: { kd: number; kda: number; dmg: number }) {
  return (
    <div className="big-trio">
      <div className="t-kills">
        <span className="big">{num(kd, 2)}</span>
        <span className="muted small">K/D</span>
      </div>
      <div className="t-kda">
        <span className="big">{num(kda, 2)}</span>
        <span className="muted small">KDA</span>
      </div>
      <div className="t-dmg">
        <span className="big">{num(dmg, 1)}</span>
        <span className="muted small">avg. damage</span>
      </div>
    </div>
  );
}

function RankedCard({ s }: { s: RankedStats }) {
  const color = TIER_COLORS[s.tier] ?? TIER_COLORS.Unranked;
  const kd = s.deaths ? s.kills / s.deaths : s.kills;
  const kda = s.deaths ? (s.kills + s.assists) / s.deaths : s.kills + s.assists;
  return (
    <article className="card card-ranked" style={{ ["--tier" as string]: color }}>
      <header className="card-head">
        <span className="card-title">Ranked {modeName(s.mode)}</span>
        <span className="card-badges">
          <span className="muted small">{s.rounds} matches</span>
          {s.wins > 0 && <span className="badge badge-win">{s.wins} W</span>}
        </span>
      </header>
      <div className="tier">
        <TierMark color={color} />
        <div>
          <strong className="tier-name">{tierLabel(s.tier, s.subTier)}</strong>
          <span className="tier-rp">{num(s.rp)} RP</span>
          <span className="muted small">
            Best: {tierLabel(s.bestTier, s.bestSubTier)} · {num(s.bestRp)} RP
          </span>
        </div>
      </div>
      <Ratios kd={kd} kda={kda} dmg={s.damage / s.rounds} />
      <dl className="kv">
        <KV k="Avg. placement" v={`#${num(s.avgRank, 1)}`} />
        <KV k="Avg. kills" v={num(s.kills / s.rounds, 1)} />
        <KV k="Win rate" v={gamePct(s.wins, s.rounds)} />
        <KV k="Top 10 rate" v={pct(s.top10Ratio)} />
        <KV k="Total kills" v={num(s.kills)} />
        <KV k="Total assists" v={num(s.assists)} />
        <KV k="Total deaths" v={num(s.deaths)} />
        <KV k="Total DBNOs" v={num(s.dbnos)} />
        <KV k="Headshot kills" v={`${num(s.headshots)} (${gamePct(s.headshots, s.kills)})`} />
        <KV k="Total damage" v={num(s.damage)} />
        <KV k="Most kills" v={s.roundMostKills} />
        <KV k="Longest kill" v={`${num(s.longestKill)} m`} />
        {s.avgSurvivalTime > 0 && <KV k="Avg. survived" v={mmss(s.avgSurvivalTime)} />}
      </dl>
    </article>
  );
}

function ModeCard({ title, s }: { title: string; s: ModeStats }) {
  // PUBG's API giver "losses" = antal kampe man døde i. Det er det tal spillet kalder "Total deaths".
  const deaths = s.losses;
  const kd = deaths ? s.kills / deaths : s.kills;
  const kda = deaths ? (s.kills + s.assists) / deaths : s.kills + s.assists;
  return (
    <article className="card">
      <header className="card-head">
        <span className="card-title">{title}</span>
        <span className="card-badges">
          <span className="muted small">{s.rounds} matches</span>
          {s.wins > 0 && <span className="badge badge-win">{s.wins} W</span>}
          {s.top10s > 0 && <span className="badge badge-top">{s.top10s} top 10</span>}
        </span>
      </header>
      <Ratios kd={kd} kda={kda} dmg={s.damage / s.rounds} />
      <dl className="kv">
        <KV k="Matches played" v={num(s.rounds)} />
        <KV k="Avg. kills" v={num(s.kills / s.rounds, 1)} />
        <KV k="Win rate" v={gamePct(s.wins, s.rounds)} />
        <KV k="Total wins" v={num(s.wins)} />
        <KV k="Top 10 rate" v={gamePct(s.top10s, s.rounds)} />
        <KV k="Total kills" v={num(s.kills)} />
        <KV k="Total assists" v={num(s.assists)} />
        <KV k="Total deaths" v={num(deaths)} />
        <KV k="Total DBNOs" v={num(s.dbnos)} />
        <KV k="Total revives" v={num(s.revives)} />
        <KV k="Headshot kills" v={`${num(s.headshots)} (${gamePct(s.headshots, s.kills)})`} />
        <KV k="Total damage" v={num(s.damage)} />
        <KV k="Avg. survived" v={mmss(s.timeSurvived / s.rounds)} />
        <KV k="Most kills" v={s.roundMostKills} />
        <KV k="Longest kill" v={`${num(s.longestKill)} m`} />
      </dl>
    </article>
  );
}

function KV({ k, v, hi }: { k: string; v: string | number; hi?: boolean }) {
  return (
    <div className={hi ? "hi" : ""}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function TierMark({ color }: { color: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 3 39 12v20L22 41 5 32V12Z" fill="none" stroke={color} strokeWidth="2.5" />
      <path d="M22 11 31 16v12l-9 5-9-5V16Z" fill={color} opacity="0.85" />
    </svg>
  );
}

function modeName(mode: string) {
  const [b, v] = mode.split("-");
  return `${MODE_NAMES[b] ?? b} ${v === "fpp" ? "FPP" : "TPP"}`;
}
