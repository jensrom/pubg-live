"use client";

import { useEffect, useState } from "react";
import { dayTime, km, mmss, num, pct } from "@/lib/format";
import {
  DEATH_LABELS,
  type MatchDetail as Detail,
  type MatchSummary,
  type Shard,
} from "@/lib/types";
import MapView from "./MapView";

type Tab = "overblik" | "kort" | "fights" | "vaaben" | "hold" | "alle";
const TABS: [Tab, string][] = [
  ["overblik", "Overview"],
  ["kort", "Map & route"],
  ["fights", "Kills & death"],
  ["vaaben", "Weapons"],
  ["hold", "Team"],
  ["alle", "All teams"],
];

// Detaljer caches i browseren, så det er gratis at åbne/lukke den samme kamp igen
const clientCache = new Map<string, Detail>();

export default function MatchDetail({
  m,
  shard,
  accountId,
  onPlayer,
}: {
  m: MatchSummary;
  shard: Shard;
  accountId: string;
  onPlayer: (name: string) => void;
}) {
  const key = `${shard}:${m.id}:${accountId}`;
  const [tab, setTab] = useState<Tab>("overblik");
  const [detail, setDetail] = useState<Detail | null>(
    clientCache.get(key) ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientCache.has(key)) return;
    let alive = true;
    fetch(`/api/match/${m.id}?shard=${shard}&account=${accountId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
        return j as Detail;
      })
      .then((d) => {
        if (d.telemetry || !d.telemetryError) clientCache.set(key, d);
        if (alive) setDetail(d);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Error"));
    return () => {
      alive = false;
    };
  }, [key, m.id, shard, accountId]);

  const tele = detail?.telemetry ?? null;
  const needsTele = tab === "kort" || tab === "fights" || tab === "vaaben";

  return (
    <div className="detail">
      <div className="tabs" role="tablist" aria-label="Match details">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {needsTele && !detail && !error && (
        <p className="muted loading-line">
          Loading telemetry (5–30 MB from PUBG)…
        </p>
      )}
      {needsTele && error && <p className="error small">{error}</p>}
      {needsTele && detail && !tele && (
        <p className="muted">{detail.telemetryError ?? "No telemetry."}</p>
      )}

      {tab === "overblik" && <Overview m={m} detail={detail} />}
      {tab === "kort" && detail && tele && (
        <MapView detail={detail} tele={tele} />
      )}
      {tab === "fights" && tele && <Fights tele={tele} onPlayer={onPlayer} />}
      {tab === "vaaben" && tele && <Weapons tele={tele} />}
      {tab === "hold" && <Team m={m} onPlayer={onPlayer} />}
      {tab === "alle" &&
        (detail ? (
          <Roster detail={detail} onPlayer={onPlayer} />
        ) : error ? (
          <p className="error small">{error}</p>
        ) : (
          <p className="muted loading-line">Loading…</p>
        ))}
    </div>
  );
}

function Overview({ m, detail }: { m: MatchSummary; detail: Detail | null }) {
  const tele = detail?.telemetry;
  const death = tele?.events.find((e) => e.kind === "death");
  const facts: [string, string | number][] = [
    ["Result", DEATH_LABELS[m.deathType] ?? m.deathType],
    ...(death
      ? ([
          [
            "Killed by",
            `${death.other} (${death.weapon}${death.distance ? `, ${death.distance} m` : ""})`,
          ],
        ] as [string, string][])
      : []),
    ["Kill place", `#${m.killPlace}`],
    ["Damage taken", tele ? num(tele.damageTaken) : "…"],
    [
      "Landed",
      tele?.landingTime != null ? mmss(tele.landingTime) : tele ? "–" : "…",
    ],
    [
      "First fight",
      tele?.firstFight != null ? mmss(tele.firstFight) : tele ? "None" : "…",
    ],
    ["Walked", km(m.walkDistance)],
    ["Drove", km(m.rideDistance)],
    ["Swam", km(m.swimDistance)],
    ["Revives", m.revives],
    ["Heals / boosts", `${m.heals} / ${m.boosts}`],
    ["Weapons picked up", m.weaponsAcquired],
    ["Vehicles destroyed", m.vehicleDestroys],
    ["Road kills", m.roadKills],
    ["Team kills", m.teamKills],
    ["Match length", mmss(m.duration)],
    ["Players / teams", `${m.players} / ${m.teams}`],
    ["Started", dayTime(m.createdAt)],
  ];
  if (tele?.vehicles.length)
    facts.push(["Vehicles used", tele.vehicles.join(", ")]);

  return (
    <dl className="facts">
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const KIND_LABEL = {
  kill: "Kill",
  knock: "Knock",
  death: "Death",
  knocked: "Knocked",
} as const;

function Fights({
  tele,
  onPlayer,
}: {
  tele: NonNullable<Detail["telemetry"]>;
  onPlayer: (n: string) => void;
}) {
  if (!tele.events.length)
    return <p className="muted">No kills, knocks or death this match.</p>;
  return (
    <ol className="feed">
      {tele.events.map((e, i) => (
        <li key={i} className={`feed-row feed-${e.kind}`}>
          <span className="feed-t">{mmss(e.t)}</span>
          <span className={`feed-kind k-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
          <span className="feed-who">
            {e.kind === "kill" || e.kind === "knock" ? "You → " : ""}
            {e.other === "Yourself" ? (
              e.other
            ) : (
              <button
                type="button"
                className="linkish"
                onClick={() => onPlayer(e.other)}
              >
                {e.other}
              </button>
            )}
            {e.kind === "death" || e.kind === "knocked" ? " → you" : ""}
          </span>
          <span className="feed-w">
            {e.weapon}
            {e.headshot && <span className="tag tag-hs">HS</span>}
          </span>
          <span className="feed-d">{e.distance ? `${e.distance} m` : "–"}</span>
        </li>
      ))}
    </ol>
  );
}

function Weapons({ tele }: { tele: NonNullable<Detail["telemetry"]> }) {
  const max = Math.max(
    1,
    ...tele.dealt.map((w) => w.damage),
    ...tele.taken.map((w) => w.damage),
  );
  return (
    <div className="weapons">
      <div>
        <h3>Damage dealt</h3>
        {tele.dealt.length === 0 ? (
          <p className="muted small">No damage.</p>
        ) : (
          <table className="wtable">
            <thead>
              <tr>
                <th scope="col">Weapon</th>
                <th scope="col">Damage</th>
                <th scope="col">Hits</th>
                <th scope="col">HS</th>
                <th scope="col">Knocks</th>
                <th scope="col">Kills</th>
              </tr>
            </thead>
            <tbody>
              {tele.dealt.map((w) => (
                <tr key={w.weapon}>
                  <th scope="row">{w.weapon}</th>
                  <td className="bar-cell">
                    <div className="barwrap">
                      <span className="hbar-track">
                        <span
                          className="hbar"
                          style={{ width: `${(w.damage / max) * 100}%` }}
                        />
                      </span>
                      <span className="barnum">{num(w.damage)}</span>
                    </div>
                  </td>
                  <td>{w.hits}</td>
                  <td>{w.hits ? pct(w.headshots / w.hits) : "–"}</td>
                  <td>{w.knocks}</td>
                  <td>{w.kills}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h3>Damage taken</h3>
        {tele.taken.length === 0 ? (
          <p className="muted small">No damage taken.</p>
        ) : (
          <table className="wtable">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Damage</th>
                <th scope="col">Hits</th>
              </tr>
            </thead>
            <tbody>
              {tele.taken.map((w) => (
                <tr key={w.weapon}>
                  <th scope="row">{w.weapon}</th>
                  <td className="bar-cell">
                    <div className="barwrap">
                      <span className="hbar-track">
                        <span
                          className="hbar hbar-taken"
                          style={{ width: `${(w.damage / max) * 100}%` }}
                        />
                      </span>
                      <span className="barnum">{num(w.damage)}</span>
                    </div>
                  </td>
                  <td>{w.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Team({
  m,
  onPlayer,
}: {
  m: MatchSummary;
  onPlayer: (n: string) => void;
}) {
  const max = Math.max(1, ...m.team.map((t) => t.damage));
  const tot = m.team.reduce(
    (a, t) => ({
      k: a.k + t.kills,
      d: a.d + t.damage,
      as: a.as + t.assists,
      kn: a.kn + t.dbnos,
    }),
    { k: 0, d: 0, as: 0, kn: 0 },
  );
  return (
    <div className="scroll-x">
      <table className="team">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Kills</th>
            <th scope="col">Damage</th>
            <th scope="col">Assists</th>
            <th scope="col">Knocks</th>
            <th scope="col">HS</th>
            <th scope="col">Longest</th>
            <th scope="col">Revives</th>
            <th scope="col">Distance</th>
            <th scope="col">Survived</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {m.team.map((t) => (
            <tr key={t.playerId} className={t.isMe ? "me" : ""}>
              <th scope="row">
                {t.isMe ? (
                  t.name
                ) : (
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => onPlayer(t.name)}
                  >
                    {t.name}
                  </button>
                )}
              </th>
              <td>{t.kills}</td>
              <td className="bar-cell">
                <div className="barwrap">
                  <span className="hbar-track">
                    <span
                      className="hbar"
                      style={{ width: `${(t.damage / max) * 100}%` }}
                    />
                  </span>
                  <span className="barnum">{t.damage}</span>
                </div>
              </td>
              <td>{t.assists}</td>
              <td>{t.dbnos}</td>
              <td>{t.headshots}</td>
              <td>{t.longestKill ? `${t.longestKill} m` : "–"}</td>
              <td>{t.revives}</td>
              <td>{km(t.distance)}</td>
              <td>{mmss(t.timeSurvived)}</td>
              <td>{DEATH_LABELS[t.deathType] ?? t.deathType}</td>
            </tr>
          ))}
        </tbody>
        {m.team.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">Team total</th>
              <td>{tot.k}</td>
              <td>{num(tot.d)}</td>
              <td>{tot.as}</td>
              <td>{tot.kn}</td>
              <td colSpan={6} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Roster({ detail, onPlayer }: { detail: Detail; onPlayer: (n: string) => void }) {
  // Hold man har klikket på for at se spillernes individuelle stats
  const [openTeams, setOpenTeams] = useState<Set<number>>(new Set());
  const [onlyFought, setOnlyFought] = useState(false);
  const fights = new Map((detail.telemetry?.fights ?? []).map((f) => [f.teamId, f]));
  const rows = onlyFought ? detail.roster.filter((r) => fights.has(r.teamId) || r.isMine) : detail.roster;
  const toggle = (id: number) =>
    setOpenTeams((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="scroll-x roster-wrap">
      <div className="roster-hint">
        <span className="muted small">Click a team to see each player&apos;s stats for the match.</span>
        {fights.size > 0 && (
          <span className="roster-legend small">
            <span className="fought-dot" /> Fought {fights.size} {fights.size === 1 ? "team" : "teams"}
            <button type="button" className="chip chip-toggle" aria-pressed={onlyFought} onClick={() => setOnlyFought((v) => !v)}>
              {onlyFought ? "✓ " : ""}Only teams I fought
            </button>
          </span>
        )}
        {!detail.telemetry && <span className="muted small">Fight highlights need telemetry.</span>}
      </div>
      <table className="roster">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Team</th>
            <th scope="col" className="t-kills">Kills</th>
            <th scope="col" className="t-dmg">Damage</th>
            <th scope="col">Avg. dmg / player</th>
            <th scope="col">Avg. distance</th>
          </tr>
        </thead>
        {rows.map((r) => {
          const isOpen = openTeams.has(r.teamId);
          const f = r.isMine ? undefined : fights.get(r.teamId);
          const size = Math.max(1, r.members.length);
          return (
            <tbody key={`${r.rank}-${r.teamId}`} className={`team-group ${isOpen ? "open" : ""} ${r.isMine ? "mine" : ""} ${r.rank === 1 ? "winner" : ""} ${f ? "fought" : ""} ${f?.killedBy ? "killer" : ""}`}>
              <tr className={`team-row ${r.isMine ? "me" : ""}`} onClick={() => toggle(r.teamId)}>
                <td>
                  <button
                    type="button"
                    className="expander"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Hide" : "Show"} player stats for team #${r.rank}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.teamId);
                    }}
                  >
                    <span className="chev" aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {r.rank}
                  </button>
                </td>
                <th scope="row" className="names">
                  {r.names.join(", ")}
                  {f && (
                    <span className="fight-tags">
                      {f.killedBy && <span className="ftag ftag-killer">Killed you</span>}
                      {!f.killedBy && f.knockedBy > 0 && <span className="ftag ftag-killer">Knocked you</span>}
                      {f.kills > 0 && <span className="ftag ftag-kill">{f.kills} kill{f.kills > 1 ? "s" : ""}</span>}
                      {f.knocks > 0 && <span className="ftag">{f.knocks} knock{f.knocks > 1 ? "s" : ""}</span>}
                      <span className="ftag ftag-dmg">
                        {num(f.dealt)} dealt / {num(f.taken)} taken
                      </span>
                      <span className="ftag ftag-time">{mmss(f.first)}</span>
                    </span>
                  )}
                </th>
                <td className="t-kills">{r.kills}</td>
                <td className="t-dmg">{num(r.damage)}</td>
                <td>{num(r.damage / size)}</td>
                <td>{km(r.distance)}</td>
              </tr>
              {isOpen && (
                <tr className="team-players">
                  <td colSpan={6}>
                    <table className="players">
                      <thead>
                        <tr>
                          <th scope="col">Player</th>
                          <th scope="col" className="t-kills">Kills</th>
                          <th scope="col">Assists</th>
                          <th scope="col" className="t-dmg">Damage</th>
                          <th scope="col">Knocks</th>
                          <th scope="col" className="t-hs">HS</th>
                          <th scope="col">Longest</th>
                          <th scope="col">Revives</th>
                          <th scope="col">Distance</th>
                          <th scope="col" className="t-time">Survived</th>
                          <th scope="col">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.members.map((p) => (
                          <tr key={p.playerId} className={p.isMe ? "me" : ""}>
                            <th scope="row">
                              {p.isMe ? (
                                p.name
                              ) : (
                                <button type="button" className="linkish" onClick={() => onPlayer(p.name)}>
                                  {p.name}
                                </button>
                              )}
                            </th>
                            <td className="t-kills">{p.kills}</td>
                            <td>{p.assists}</td>
                            <td className="t-dmg">{num(p.damage)}</td>
                            <td>{p.dbnos}</td>
                            <td className="t-hs">{p.headshots}</td>
                            <td>{p.longestKill ? `${p.longestKill} m` : "–"}</td>
                            <td>{p.revives}</td>
                            <td>{km(p.distance)}</td>
                            <td className="t-time">{mmss(p.timeSurvived)}</td>
                            <td>{DEATH_LABELS[p.deathType] ?? p.deathType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
