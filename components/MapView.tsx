"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mmss } from "@/lib/format";
import type { MatchDetail, Point } from "@/lib/types";

type Tele = NonNullable<MatchDetail["telemetry"]>;

// Mig først (orange), derefter holdkammerater. Hver rute har også navn direkte på kortet.
const ROUTE_COLORS = ["#e8894a", "#39c6ff", "#ff5cd6", "#ffffff"];
const S = 1000; // SVG-koordinater: 0..1000

export default function MapView({ detail, tele }: { detail: MatchDetail; tele: Tele }) {
  const end = useMemo(
    () =>
      Math.max(
        1,
        ...tele.routes.map((r) => r.path[r.path.length - 1]?.t ?? 0),
        ...tele.events.map((e) => e.t)
      ),
    [tele]
  );
  const [t, setT] = useState(end);
  const [playing, setPlaying] = useState(false);
  const [whole, setWhole] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => setT(end), [end]);

  // Afspilning: hele kampen på ~25 sekunder
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + (dt * end) / 25;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, end]);

  // Zoom ind på det område hvor der skete noget (efter landing), medmindre "hele kortet" er valgt
  const view = useMemo(() => {
    if (whole) return { x: 0, y: 0, w: S, h: S };
    const pts: { x: number; y: number }[] = [];
    for (const r of tele.routes) {
      const from = r.landedAt ?? 0;
      pts.push(...r.path.slice(from));
    }
    for (const e of tele.events) if (e.at) pts.push(e.at);
    const last = tele.zones[tele.zones.length - 1];
    if (last) pts.push({ x: last.x - last.r, y: last.y - last.r }, { x: last.x + last.r, y: last.y + last.r });
    if (!pts.length) return { x: 0, y: 0, w: S, h: S };
    const xs = pts.map((p) => p.x * S);
    const ys = pts.map((p) => p.y * S);
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    const size = Math.max(x1 - x0, y1 - y0, 120) * 1.25;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    x0 = Math.max(0, Math.min(S - size, cx - size / 2));
    y0 = Math.max(0, Math.min(S - size, cy - size / 2));
    return { x: x0, y: y0, w: Math.min(S, size), h: Math.min(S, size) };
  }, [tele, whole]);

  const k = view.w / S; // skalering så streger/markører har samme visuelle størrelse ved zoom
  const zonesNow = tele.zones.filter((z) => z.t <= t);

  return (
    <div className="mapview">
      <div className="map-frame">
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label={`Route on ${detail.map}`}>
          {detail.mapImage ? (
            <image href={detail.mapImage} x="0" y="0" width={S} height={S} preserveAspectRatio="none" />
          ) : (
            <rect width={S} height={S} fill="#252320" />
          )}
          <rect width={S} height={S} fill="rgba(13,12,11,0.28)" />

          {zonesNow.map((z, i) => (
            <circle
              key={i}
              cx={z.x * S}
              cy={z.y * S}
              r={z.r * S}
              fill="none"
              stroke="#fff"
              strokeOpacity={i === zonesNow.length - 1 ? 0.95 : 0.35}
              strokeWidth={(i === zonesNow.length - 1 ? 2 : 1.2) * k}
            />
          ))}

          {tele.routes.map((r, ri) => {
            const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
            const upto = r.path.filter((p) => p.t <= t);
            if (!upto.length) return null;
            const land = r.landedAt ?? 0;
            const air = upto.slice(0, land + 1);
            const ground = upto.slice(land);
            const head = upto[upto.length - 1];
            return (
              <g key={r.name}>
                {air.length > 1 && (
                  <polyline
                    points={pts(air)}
                    fill="none"
                    stroke={color}
                    strokeOpacity="0.55"
                    strokeWidth={1.4 * k}
                    strokeDasharray={`${5 * k} ${5 * k}`}
                  />
                )}
                {ground.length > 1 && (
                  <>
                    <polyline points={pts(ground)} fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth={4.5 * k} strokeLinejoin="round" strokeLinecap="round" />
                    <polyline points={pts(ground)} fill="none" stroke={color} strokeWidth={(r.isMe ? 2.6 : 2) * k} strokeLinejoin="round" strokeLinecap="round" />
                  </>
                )}
                <circle cx={head.x * S} cy={head.y * S} r={5 * k} fill={color} stroke="#000" strokeWidth={1.5 * k} />
                <text
                  x={head.x * S + 8 * k}
                  y={head.y * S + 4 * k}
                  fontSize={12 * k}
                  className="map-label"
                  strokeWidth={3 * k}
                >
                  {r.name}
                </text>
              </g>
            );
          })}

          {tele.landing && (
            <g transform={`translate(${tele.landing.x * S} ${tele.landing.y * S})`}>
              <path d={`M0 ${-9 * k} L${7 * k} ${5 * k} L${-7 * k} ${5 * k}Z`} fill="#e8894a" stroke="#000" strokeWidth={1.2 * k} />
            </g>
          )}

          {tele.events
            .filter((e) => e.at && e.t <= t)
            .map((e, i) => {
              const x = e.at!.x * S;
              const y = e.at!.y * S;
              const r = 6 * k;
              if (e.kind === "kill")
                return (
                  <g key={i} stroke="#000" strokeWidth={4.5 * k}>
                    <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} />
                    <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} stroke="#d9634f" strokeWidth={2.4 * k} />
                  </g>
                );
              if (e.kind === "knock")
                return <circle key={i} cx={x} cy={y} r={r * 0.8} fill="none" stroke="#d9634f" strokeWidth={2 * k} />;
              if (e.kind === "death")
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={r * 1.3} fill="#000" stroke="#fff" strokeWidth={2 * k} />
                    <path d={`M${x - r * 0.6} ${y - r * 0.6}L${x + r * 0.6} ${y + r * 0.6}M${x + r * 0.6} ${y - r * 0.6}L${x - r * 0.6} ${y + r * 0.6}`} stroke="#fff" strokeWidth={2 * k} />
                  </g>
                );
              return <circle key={i} cx={x} cy={y} r={r * 0.7} fill="#fff" stroke="#000" strokeWidth={1.5 * k} />;
            })}
        </svg>
      </div>

      <div className="map-controls">
        <button type="button" onClick={() => (t >= end ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))}>
          {playing ? "Pause" : t >= end ? "Replay match" : "Resume"}
        </button>
        <input
          type="range"
          min={0}
          max={end}
          step={1}
          value={Math.round(t)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Time in match"
        />
        <span className="map-time">{mmss(t)}</span>
        <label className="check">
          <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole map
        </label>
      </div>

      <ul className="legend map-legend">
        {tele.routes.map((r, i) => (
          <li key={r.name}>
            <span className="sw" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} /> {r.name}
          </li>
        ))}
        <li>
          <span className="lg-ico lg-kill">✕</span> Kill
        </li>
        <li>
          <span className="lg-ico lg-knock">○</span> Knock
        </li>
        <li>
          <span className="lg-ico lg-death">⊗</span> Death
        </li>
        <li>
          <span className="lg-ico lg-land">▲</span> Landing
        </li>
        <li>
          <span className="lg-ico lg-zone">◯</span> Zones
        </li>
      </ul>
    </div>
  );
}

function pts(p: Point[]) {
  return p.map((q) => `${(q.x * S).toFixed(1)},${(q.y * S).toFixed(1)}`).join(" ");
}
