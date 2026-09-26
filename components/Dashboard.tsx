"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { byMap, inRange, playedWith, summarize, TIME_LABELS, unique, type TimeRange } from "@/lib/analysis";
import { ago, clock, km, mmss, num, pct } from "@/lib/format";
import { isFpp, modeLabel, SHARDS, SHARD_LABELS, type ApiResponse, type MatchSummary, type Shard } from "@/lib/types";
import FormChart from "./FormChart";
import MatchDetail from "./MatchDetail";
import SeasonPanel from "./SeasonPanel";

const INTERVALS = [20, 30, 60];
const ALL = "alle";
const STORE_KEY = "pubg-live:v1";

interface Stored {
  recent: { name: string; shard: Shard }[];
  favorites: { name: string; shard: Shard }[];
  interval: number;
  notify: boolean;
}

function readStore(): Stored {
  const empty: Stored = { recent: [], favorites: [], interval: 30, notify: false };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function writeStore(s: Stored) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* privat vindue o.l. – ignorer */
  }
}

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const qName = params.get("p")?.trim() ?? "";
  const rawShard = params.get("s") as Shard | null;
  const qShard: Shard = rawShard && SHARDS.includes(rawShard) ? rawShard : "steam";

  const [nameInput, setNameInput] = useState(qName);
  const [shardInput, setShardInput] = useState<Shard>(qShard);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [intervalSec, setIntervalSec] = useState(30);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [modeFilter, setModeFilter] = useState(ALL);
  const [mapFilter, setMapFilter] = useState(ALL);
  const [range, setRange] = useState<TimeRange>("alle");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(30);
  const [store, setStore] = useState<Stored>({ recent: [], favorites: [], interval: 30, notify: false });

  const dataRef = useRef<ApiResponse | null>(null);
  const busy = useRef(false);

  // Lokale indstillinger (kun i denne browser)
  useEffect(() => {
    const s = readStore();
    setStore(s);
    setIntervalSec(s.interval);
  }, []);
  const updateStore = useCallback((fn: (s: Stored) => Stored) => {
    setStore((prev) => {
      const next = fn(prev);
      writeStore(next);
      return next;
    });
  }, []);

  const load = useCallback(
    async (silent: boolean, lim = limit) => {
      if (!qName || busy.current) return;
      busy.current = true;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/player?name=${encodeURIComponent(qName)}&shard=${qShard}&limit=${lim}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Fejl ${res.status}`);
        const next = json as ApiResponse;

        const prev = dataRef.current;
        if (prev && prev.player.id === next.player.id) {
          const known = new Set(prev.matches.map((m) => m.id));
          const newest = prev.matches[0] ? Date.parse(prev.matches[0].createdAt) : 0;
          const fresh = next.matches.filter((m) => !known.has(m.id) && Date.parse(m.createdAt) > newest);
          if (fresh.length) {
            setNewIds((s) => new Set([...s, ...fresh.map((m) => m.id)]));
            notifyNew(fresh[0], next.player.name);
          }
        } else {
          setNewIds(new Set());
          setOpen(null);
          updateStore((s) => ({
            ...s,
            recent: [
              { name: next.player.name, shard: qShard },
              ...s.recent.filter((r) => !(r.name.toLowerCase() === next.player.name.toLowerCase() && r.shard === qShard)),
            ].slice(0, 8),
          }));
        }
        dataRef.current = next;
        setData(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error.");
      } finally {
        busy.current = false;
        setLoading(false);
        setLastFetch(Date.now());
      }
    },
    [qName, qShard, limit, updateStore]
  );

  // Ny søgning
  useEffect(() => {
    dataRef.current = null;
    setData(null);
    setError(null);
    setModeFilter(ALL);
    setMapFilter(ALL);
    setRange("alle");
    setLimit(30);
    setNameInput(qName);
    setShardInput(qShard);
    if (qName) load(false, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qName, qShard]);

  // Ur
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  // Skjult fane: stop med at spørge PUBG. Når fanen vises igen hentes der med det samme.
  useEffect(() => {
    const onVis = () => {
      const h = document.visibilityState === "hidden";
      setHidden(h);
      if (!h && dataRef.current && Date.now() - lastFetch > 10_000) load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, lastFetch]);

  // Auto-opdatering
  useEffect(() => {
    if (!qName || paused || hidden || lastFetch === 0 || busy.current) return;
    if (now - lastFetch >= intervalSec * 1000) load(true);
  }, [now, lastFetch, intervalSec, paused, hidden, qName, load]);

  // Fanetitel viser nye kampe
  useEffect(() => {
    const base = data ? `${data.player.name} – PUBG Live` : "PUBG Live";
    document.title = newIds.size ? `(${newIds.size}) ${base}` : base;
  }, [newIds, data]);

  function notifyNew(m: MatchSummary, name: string) {
    if (!store.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(`${name}: #${m.placement}/${m.teams} on ${m.map}`, {
        body: `${m.kills} kills · ${m.damage} damage · ${modeLabel(m.mode)}`,
        tag: m.id,
      });
    } catch {
      /* ignorer */
    }
  }

  async function toggleNotify() {
    if (store.notify) return updateStore((s) => ({ ...s, notify: false }));
    if (typeof Notification === "undefined") return;
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (p === "granted") updateStore((s) => ({ ...s, notify: true }));
  }

  function go(name: string, shard: Shard = qShard) {
    router.push(`${pathname}?p=${encodeURIComponent(name)}&s=${shard}`);
    window.scrollTo({ top: 0 });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nameInput.trim();
    if (!n) return;
    if (n === qName && shardInput === qShard) return void load(false);
    router.replace(`${pathname}?p=${encodeURIComponent(n)}&s=${shardInput}`);
  }

  function pick(id: string) {
    setModeFilter(ALL);
    setMapFilter(ALL);
    setRange("alle");
    setOpen(id);
    setNewIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    requestAnimationFrame(() => document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const matches = useMemo(() => data?.matches ?? [], [data]);
  const inTime = useMemo(() => inRange(matches, range, now), [matches, range, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const modes = useMemo(() => unique(matches.map((m) => m.mode)), [matches]);
  const maps = useMemo(() => unique(matches.map((m) => m.map)), [matches]);
  const filtered = useMemo(
    () =>
      inTime.filter(
        (m) => (modeFilter === ALL || m.mode === modeFilter) && (mapFilter === ALL || m.map === mapFilter)
      ),
    [inTime, modeFilter, mapFilter]
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const mapRows = useMemo(() => byMap(filtered), [filtered]);
  const mates = useMemo(() => playedWith(filtered), [filtered]);
  const preferFpp = useMemo(() => matches.filter((m) => isFpp(m.mode)).length >= matches.length / 2, [matches]);

  const remaining = Math.max(0, intervalSec * 1000 - (now - lastFetch));
  const fraction = paused || hidden ? 1 : remaining / (intervalSec * 1000);
  const isFav = data ? store.favorites.some((f) => f.name === data.player.name && f.shard === data.shard) : false;
  const quick = [
    ...store.favorites.map((f) => ({ ...f, fav: true })),
    ...store.recent.filter((r) => !store.favorites.some((f) => f.name === r.name && f.shard === r.shard)).map((r) => ({ ...r, fav: false })),
  ];

  return (
    <main className="shell">
      <div className={`topbar ${qName ? "" : "topbar-home"}`}>
        {qName && (
          <a className="brand" href={pathname}>
            PUBG <span>Live</span>
          </a>
        )}
        <form className="search" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="name">
            Player name
          </label>
          <input
            id="name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Player name"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <select aria-label="Platform" value={shardInput} onChange={(e) => setShardInput(e.target.value as Shard)}>
            {SHARDS.map((s) => (
              <option key={s} value={s}>
                {SHARD_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Loading…" : "Get stats"}
          </button>
        </form>
      </div>

      {!qName && (
        <section className="intro">
          <h1>
            PUBG <span>Live</span>
          </h1>
          <p>
            Your matches straight from PUBG&apos;s official API. No ads, no &quot;Renew&quot; button: the page checks
            for new matches every 30 seconds on its own and shows telemetry, your route on the map, weapon damage and
            who killed you.
          </p>
          {quick.length > 0 && (
            <div className="quick">
              <span className="muted small">Quick pick</span>
              {quick.map((q) => (
                <button key={`${q.shard}:${q.name}`} type="button" className="chip" onClick={() => go(q.name, q.shard)}>
                  {q.fav ? "★ " : ""}
                  {q.name}
                  {q.shard !== "steam" && <span className="muted"> · {SHARD_LABELS[q.shard]}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {qName && !data && loading && <p className="muted loading-line">Loading {qName}…</p>}

      {data && (
        <>
          <header className="player">
            <div className="player-id">
              <p className="eyebrow">{SHARD_LABELS[data.shard]}</p>
              <h1>
                {data.player.name}
                <button
                  type="button"
                  className={`star ${isFav ? "on" : ""}`}
                  aria-pressed={isFav}
                  aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
                  onClick={() =>
                    updateStore((s) => ({
                      ...s,
                      favorites: isFav
                        ? s.favorites.filter((f) => !(f.name === data.player.name && f.shard === data.shard))
                        : [...s.favorites, { name: data.player.name, shard: data.shard }],
                    }))
                  }
                >
                  {isFav ? "★" : "☆"}
                </button>
              </h1>
              <p className="muted">
                {data.matchCount} matches in the last 14 days · {matches.length} loaded
                {matches[0] && <> · latest {ago(matches[0].createdAt, now)}</>}
              </p>
            </div>

            <div className="live" aria-live="polite">
              <ZoneTimer fraction={fraction} />
              <div className="live-text">
                <strong>
                  {paused
                    ? "Auto-refresh paused"
                    : hidden
                      ? "Paused while tab is hidden"
                      : loading
                        ? "Refreshing…"
                        : `Checking again in ${Math.ceil(remaining / 1000)} s`}
                </strong>
                <span className="muted">Last fetched {clock(data.fetchedAt)}</span>
              </div>
              <div className="live-controls">
                <select
                  aria-label="Refresh interval"
                  value={intervalSec}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setIntervalSec(v);
                    updateStore((s) => ({ ...s, interval: v }));
                  }}
                >
                  {INTERVALS.map((s) => (
                    <option key={s} value={s}>
                      Every {s} s
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setPaused((p) => !p)}>
                  {paused ? "Resume" : "Pause"}
                </button>
                <button type="button" onClick={() => load(false)} disabled={loading}>
                  Refresh now
                </button>
                <button type="button" aria-pressed={store.notify} onClick={toggleNotify} title="Notify me when a new match appears">
                  {store.notify ? "🔔 On" : "🔕 Notifications"}
                </button>
              </div>
            </div>
          </header>

          <SeasonPanel
            shard={data.shard}
            accountId={data.player.id}
            refreshKey={matches[0]?.id ?? ""}
            preferFpp={preferFpp}
          />

          <section className="filters" aria-label="Filters">
            <FilterRow
              label="Period"
              value={range}
              options={Object.keys(TIME_LABELS).filter((k) => k !== ALL)}
              render={(v) => TIME_LABELS[v as TimeRange]}
              onChange={(v) => setRange(v as TimeRange)}
            />
            <FilterRow label="Mode" value={modeFilter} options={modes} render={modeLabel} onChange={setModeFilter} />
            <FilterRow label="Map" value={mapFilter} options={maps} render={(m) => m} onChange={setMapFilter} />
          </section>

          <section className="summary" aria-label="Summary of shown matches">
            <Stat value={summary.n} label="matches" />
            <Stat value={summary.wins} label="chicken dinners" tone="gold" />
            <Stat value={`${summary.top10}`} label={`top 10 (${pct(summary.n ? summary.top10 / summary.n : 0)})`} />
            <Stat value={num(summary.kd, 2)} label="K/D" />
            <Stat value={num(summary.avgDmg)} label="damage per match" tone="red" />
            <Stat value={num(summary.avgKills, 1)} label="kills per match" />
            <Stat value={`#${num(summary.avgPlace, 1)}`} label="avg. placement" />
            <Stat value={pct(summary.hs)} label="headshot rate" />
            <Stat value={mmss(summary.avgSurvived)} label="avg. survived" />
            <Stat value={km(summary.avgDistance)} label="avg. distance" />
          </section>

          <div className="layout">
            <div className="main-col">
              <FormChart matches={filtered} onPick={pick} />

              <section aria-label="Matches">
                {filtered.length === 0 ? (
                  <p className="muted empty">
                    {matches.length === 0
                      ? "No matches in the last 14 days. PUBG only keeps matches for 14 days."
                      : "No matches match the filters."}
                  </p>
                ) : (
                  <>
                    <div className="list-head" aria-hidden="true">
                      <span>Place</span>
                      <span>Match</span>
                      <span>Kills</span>
                      <span>Damage</span>
                      <span>Assists</span>
                      <span>Knocks</span>
                      <span>HS</span>
                      <span>Longest</span>
                      <span>Survived</span>
                    </div>
                    <ol className="matches">
                      {filtered.map((m) => (
                        <MatchRow
                          key={m.id}
                          m={m}
                          now={now}
                          isNew={newIds.has(m.id)}
                          open={open === m.id}
                          onToggle={() => {
                            setOpen((o) => (o === m.id ? null : m.id));
                            if (newIds.has(m.id))
                              setNewIds((s) => {
                                const n = new Set(s);
                                n.delete(m.id);
                                return n;
                              });
                          }}
                        >
                          {open === m.id && (
                            <MatchDetail m={m} shard={data.shard} accountId={data.player.id} onPlayer={(n) => go(n)} />
                          )}
                        </MatchRow>
                      ))}
                    </ol>
                  </>
                )}
                {data.matchCount > matches.length && limit < 100 && (
                  <button
                    type="button"
                    className="more"
                    disabled={loading}
                    onClick={() => {
                      const next = Math.min(100, limit + 30);
                      setLimit(next);
                      load(false, next);
                    }}
                  >
                    {loading ? "Loading…" : `Load more matches (${data.matchCount - matches.length} left)`}
                  </button>
                )}
              </section>
            </div>

            <aside className="side-col">
              {mates.length > 0 && (
                <section className="side-card">
                  <h2>Played with</h2>
                  <table className="side-table">
                    <thead>
                      <tr>
                        <th scope="col">Player</th>
                        <th scope="col">Games</th>
                        <th scope="col">W</th>
                        <th scope="col">Avg #</th>
                        <th scope="col" title="Average damage: theirs / yours">
                          Damage
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mates.map((r) => (
                        <tr key={r.name}>
                          <th scope="row">
                            <button type="button" className="linkish" onClick={() => go(r.name)}>
                              {r.name}
                            </button>
                          </th>
                          <td>{r.games}</td>
                          <td>{r.wins}</td>
                          <td>{num(r.avgPlace, 1)}</td>
                          <td>
                            {num(r.theirDmg)} <span className="muted">/ {num(r.myDmg)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted small">Damage: their average / yours in the same matches.</p>
                </section>
              )}

              {mapRows.length > 0 && (
                <section className="side-card">
                  <h2>By map</h2>
                  <table className="side-table">
                    <thead>
                      <tr>
                        <th scope="col">Map</th>
                        <th scope="col">Games</th>
                        <th scope="col">W</th>
                        <th scope="col">Avg #</th>
                        <th scope="col">K/D</th>
                        <th scope="col">Damage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapRows.map((r) => (
                        <tr key={r.map}>
                          <th scope="row">
                            <button type="button" className="linkish" onClick={() => setMapFilter(r.map)}>
                              {r.map}
                            </button>
                          </th>
                          <td>{r.games}</td>
                          <td>{r.wins}</td>
                          <td>{num(r.avgPlace, 1)}</td>
                          <td>{num(r.kd, 2)}</td>
                          <td>{num(r.avgDmg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="side-card">
                <h2>Records in selection</h2>
                <dl className="kv">
                  <div>
                    <dt>Most kills</dt>
                    <dd>{summary.mostKills}</dd>
                  </div>
                  <div>
                    <dt>Most damage</dt>
                    <dd>{num(summary.bestDmg)}</dd>
                  </div>
                  <div>
                    <dt>Longest kill</dt>
                    <dd>{num(summary.longest)} m</dd>
                  </div>
                  <div>
                    <dt>KDA</dt>
                    <dd>{num(summary.kda, 2)}</dd>
                  </div>
                  <div>
                    <dt>Knocks</dt>
                    <dd>{summary.knocks}</dd>
                  </div>
                  <div>
                    <dt>Assists</dt>
                    <dd>{summary.assists}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

/* ---------- Små komponenter ---------- */

function ZoneTimer({ fraction }: { fraction: number }) {
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg className="zone" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <circle cx="28" cy="28" r="26" className="zone-blue" />
      <circle cx="28" cy="28" r={3 + 21 * f} className="zone-safe" />
    </svg>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "gold" | "red" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function FilterRow({
  label,
  value,
  options,
  render,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  render: (v: string) => string;
  onChange: (v: string) => void;
}) {
  if (options.length < 2 && label !== "Period") return null;
  return (
    <div className="filter-row" role="group" aria-label={label}>
      <span className="filter-label">{label}</span>
      {[ALL, ...options].map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o === ALL ? "All" : render(o)}
        </button>
      ))}
    </div>
  );
}

function MatchRow({
  m,
  now,
  isNew,
  open,
  onToggle,
  children,
}: {
  m: MatchSummary;
  now: number;
  isNew: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const tier = m.placement === 1 ? "won" : m.placement <= 10 ? "top" : "";
  return (
    <li id={`m-${m.id}`} className={`match ${tier} ${isNew ? "is-new" : ""} ${open ? "is-open" : ""}`}>
      <button type="button" className="match-head" onClick={onToggle} aria-expanded={open}>
        <span className="c-place">
          <span className="place">
            {m.placement === 1 ? "WIN" : `#${m.placement}`}
            <span className="of">/{m.teams}</span>
          </span>
          <PlacementBar placement={m.placement} teams={m.teams} />
        </span>
        <span className="c-meta">
          <span className="map">
            {m.map}
            {isNew && <span className="tag tag-new">Ny</span>}
            {m.matchType === "competitive" && <span className="tag">Ranked</span>}
          </span>
          <span className="sub">
            {ago(m.createdAt, now)} · {modeLabel(m.mode)} · {m.team.length > 1 ? m.team.filter((t) => !t.isMe).map((t) => t.name).join(", ") : "solo"}
          </span>
        </span>
        <Cell v={m.kills} l="kills" strong />
        <Cell v={m.damage} l="damage" strong />
        <Cell v={m.assists} l="assists" />
        <Cell v={m.dbnos} l="knocks" />
        <Cell v={m.headshots} l="headshots" />
        <Cell v={m.longestKill ? `${Math.round(m.longestKill)} m` : "–"} l="longest kill" />
        <Cell v={mmss(m.timeSurvived)} l="survived" />
      </button>
      {children}
    </li>
  );
}

function Cell({ v, l, strong }: { v: string | number; l: string; strong?: boolean }) {
  return (
    <span className={`cell ${strong ? "cell-strong" : ""}`}>
      <span className="cell-v">{v}</span>
      <span className="cell-l">{l}</span>
    </span>
  );
}

function PlacementBar({ placement, teams }: { placement: number; teams: number }) {
  const pos = teams > 1 ? (placement - 1) / (teams - 1) : 0;
  return (
    <span className="pbar" aria-hidden="true">
      <span className="pbar-dot" style={{ left: `${pos * 100}%` }} />
    </span>
  );
}
