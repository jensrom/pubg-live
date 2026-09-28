"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { num } from "@/lib/format";
import { TIER_COLORS, type RankedStats, type SeasonInfo, type Shard } from "@/lib/types";
import RankIcon from "./RankIcon";

/* All-time high: scanner ranked-stats for alle sæsoner én ad gangen (PUBG tillader 10 kald/min)
   og finder den bedste sæson. Prioritet: 1) bedste rank (tier, subtier, RP), 2) K/D, 3) avg. damage.
   Afsluttede sæsoner gemmes i browseren, så scanningen kun tager tid første gang. */

// Rækkefølge efter ranked-revampet i sæson 36: Crystal ligger mellem Platinum og Diamond.
const TIERS = ["Unranked", "Bronze", "Silver", "Gold", "Platinum", "Crystal", "Diamond", "Master", "Survivor"];
const SCAN_EVERY_MS = 9_000;

interface Best {
  seasonId: string;
  label: string;
  mode: string;
  tier: string;
  subTier: string;
  rp: number;
  kd: number;
  avgDmg: number;
  rounds: number;
}

type Store = Record<string, Best | null>; // null = ingen ranked-kampe i sæsonen

function tierScore(tier: string, sub: string) {
  const i = Math.max(0, TIERS.indexOf(tier));
  const s = Number(sub);
  return i * 10 + (s >= 1 && s <= 5 ? 6 - s : 5);
}

function compare(a: Best, b: Best) {
  return (
    tierScore(b.tier, b.subTier) - tierScore(a.tier, a.subTier) ||
    b.rp - a.rp ||
    b.kd - a.kd ||
    b.avgDmg - a.avgDmg
  );
}

function bestOfSeason(season: SeasonInfo, ranked: RankedStats[]): Best | null {
  const rows = ranked
    .filter((r) => r.rounds > 0)
    .map(
      (r): Best => ({
        seasonId: season.id,
        label: season.label,
        mode: r.mode,
        tier: r.bestTier,
        subTier: r.bestSubTier,
        rp: r.bestRp,
        kd: r.deaths ? r.kills / r.deaths : r.kills,
        avgDmg: r.rounds ? r.damage / r.rounds : 0,
        rounds: r.rounds,
      })
    )
    .sort(compare);
  return rows[0] ?? null;
}

function tierText(b: Best) {
  if (["Master", "Survivor", "Unranked"].includes(b.tier)) return b.tier;
  return `${b.tier} ${b.subTier}`.trim();
}

function modeText(mode: string) {
  const [base, view] = mode.split("-");
  return `${base[0].toUpperCase()}${base.slice(1)} ${view === "fpp" ? "FPP" : "TPP"}`;
}

export default function AllTimeHigh({
  seasons,
  shard,
  accountId,
  onPick,
}: {
  seasons: SeasonInfo[];
  shard: Shard;
  accountId: string;
  onPick: (seasonId: string) => void;
}) {
  const storeKey = `pubg-live:ath:v1:${shard}:${accountId}`;
  const [store, setStore] = useState<Store>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const storeRef = useRef<Store>({});

  const rankedSeasons = useMemo(() => seasons.filter((s) => s.ranked), [seasons]);

  // Hent tidligere scanninger fra browseren
  useEffect(() => {
    let saved: Store = {};
    try {
      saved = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    } catch {
      saved = {};
    }
    // Nuværende sæson ændrer sig; den scannes altid igen
    const current = seasons.find((s) => s.current)?.id;
    if (current) delete saved[current];
    storeRef.current = saved;
    setStore(saved);
    setError(null);
  }, [storeKey, seasons]);

  // Scan manglende sæsoner én ad gangen, nyeste først
  useEffect(() => {
    if (!rankedSeasons.length) return;
    let alive = true;
    let timer: number | undefined;

    const next = async () => {
      const todo = rankedSeasons.find((s) => !(s.id in storeRef.current));
      if (!todo || !alive) return;
      try {
        const r = await fetch(`/api/ranked?shard=${shard}&account=${accountId}&season=${encodeURIComponent(todo.id)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
        const best = bestOfSeason(todo, j.ranked as RankedStats[]);
        storeRef.current = { ...storeRef.current, [todo.id]: best };
        if (!alive) return;
        setStore(storeRef.current);
        setError(null);
        try {
          const toSave = { ...storeRef.current };
          const current = seasons.find((s) => s.current)?.id;
          if (current) delete toSave[current];
          localStorage.setItem(storeKey, JSON.stringify(toSave));
        } catch {
          /* ignorer */
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Error");
      }
      if (alive) timer = window.setTimeout(next, SCAN_EVERY_MS);
    };

    timer = window.setTimeout(next, 1500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [rankedSeasons, shard, accountId, storeKey, seasons]);

  const found = Object.values(store).filter((b): b is Best => Boolean(b));
  const ranked = [...found].sort(compare);
  const best = ranked[0];
  const scanned = rankedSeasons.filter((s) => s.id in store).length;
  const done = scanned >= rankedSeasons.length;

  if (!rankedSeasons.length) return null;

  return (
    <div className="ath">
      <button
        type="button"
        className="ath-main"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={best ? { ["--tier" as string]: TIER_COLORS[best.tier] ?? TIER_COLORS.Unranked } : undefined}
      >
        <span className="ath-label">All-time high</span>
        {best && <RankIcon tier={best.tier} subTier={best.subTier} size={34} />}
        {best ? (
          <span className="ath-value">
            <strong className="ath-tier">{tierText(best)}</strong>
            <span className="ath-meta">
              {best.label} · {num(best.rp)} RP · K/D {num(best.kd, 2)} · {num(best.avgDmg)} dmg
            </span>
          </span>
        ) : (
          <span className="ath-meta">{done ? "No ranked matches found" : "Scanning seasons…"}</span>
        )}
        {!done && (
          <span className="ath-progress" title="PUBG allows 10 requests per minute, so seasons are scanned one at a time">
            {scanned}/{rankedSeasons.length}
          </span>
        )}
      </button>

      {open && (
        <div className="ath-pop" role="dialog" aria-label="Best ranked seasons">
          <p className="muted small">
            Ranked by best rank reached, then K/D, then avg. damage.
            {!done && ` Scanning ${scanned} of ${rankedSeasons.length} seasons (about ${Math.ceil(((rankedSeasons.length - scanned) * SCAN_EVERY_MS) / 60000)} min left).`}
            {error && ` Last error: ${error}`}
          </p>
          {ranked.length === 0 ? (
            <p className="muted small">Nothing yet.</p>
          ) : (
            <table className="ath-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Season</th>
                  <th scope="col">Best rank</th>
                  <th scope="col">RP</th>
                  <th scope="col" className="t-kills">K/D</th>
                  <th scope="col" className="t-dmg">Avg. dmg</th>
                  <th scope="col">Matches</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 10).map((b, i) => (
                  <tr
                    key={b.seasonId}
                    className={i === 0 ? "ath-top" : ""}
                    onClick={() => {
                      onPick(b.seasonId);
                      setOpen(false);
                    }}
                  >
                    <td>{i + 1}</td>
                    <th scope="row">
                      {b.label} <span className="muted small">{modeText(b.mode)}</span>
                    </th>
                    <td style={{ color: TIER_COLORS[b.tier] ?? undefined }}>
                      <span className="ath-rank">
                        <RankIcon tier={b.tier} subTier={b.subTier} size={22} />
                        {tierText(b)}
                      </span>
                    </td>
                    <td>{num(b.rp)}</td>
                    <td className="t-kills">{num(b.kd, 2)}</td>
                    <td className="t-dmg">{num(b.avgDmg)}</td>
                    <td>{b.rounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
