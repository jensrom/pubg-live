"use client";

import { useState } from "react";
import { ago, num } from "@/lib/format";
import { modeLabel, type MatchSummary } from "@/lib/types";

/* Form-graf: én søjle pr. kamp (ældst til venstre). Højde = skade, farve = placeringsniveau,
   tallet under søjlen = placering. Erstatter op.gg's "Avg. Rank in Recent 20"-felter. */

export default function FormChart({
  matches,
  onPick,
}: {
  matches: MatchSummary[];
  onPick: (id: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const list = matches.slice(0, 30).reverse();
  if (list.length < 2) return null;

  const max = Math.max(...list.map((m) => m.damage), 100);
  const top = Math.ceil(max / 250) * 250;
  const avg = list.reduce((a, m) => a + m.damage, 0) / list.length;
  const h = hover !== null ? list[hover] : null;

  return (
    <section className="form" aria-label="Form over recent matches">
      <div className="form-head">
        <h2>Form</h2>
        <ul className="legend">
          <li>
            <span className="sw sw-win" /> Chicken dinner
          </li>
          <li>
            <span className="sw sw-top" /> Top 10
          </li>
          <li>
            <span className="sw sw-rest" /> Other
          </li>
          <li>
            <span className="sw sw-avg" /> Avg. {num(avg)} damage
          </li>
        </ul>
      </div>

      <div className="form-plot">
        <div className="form-axis" aria-hidden="true">
          <span>{num(top)}</span>
          <span>{num(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="form-area" onMouseLeave={() => setHover(null)}>
          <div className="form-grid" aria-hidden="true">
            <span />
            <span />
            <span />
            <i className="form-avg" style={{ bottom: `${(avg / top) * 100}%` }} />
          </div>
          <ol className="form-bars">
            {list.map((m, i) => {
              const tier = m.placement === 1 ? "win" : m.placement <= 10 ? "top" : "rest";
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`fbar fbar-${tier}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => onPick(m.id)}
                    aria-label={`${m.map}, ${modeLabel(m.mode)}: placed ${m.placement} of ${m.teams}, ${m.kills} kills, ${m.damage} damage`}
                  >
                    <span className="fbar-col">
                      <span className="fbar-fill" style={{ height: `${Math.max(1.5, (m.damage / top) * 100)}%` }} />
                    </span>
                    <span className="fbar-place">{m.placement === 1 ? "W" : m.placement}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {h && hover !== null && (
            <div
              className="tip"
              style={{
                left: `${((hover + 0.5) / list.length) * 100}%`,
                transform: `translateX(${hover / list.length > 0.7 ? "-100%" : hover / list.length < 0.3 ? "0" : "-50%"})`,
              }}
              role="status"
            >
              <strong>
                #{h.placement}/{h.teams} · {h.map}
              </strong>
              <span>
                {modeLabel(h.mode)}, {ago(h.createdAt)}
              </span>
              <span>
                {h.kills} kills · {num(h.damage)} damage · {h.dbnos} knocks
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
