"use client";

import { useState } from "react";
import { TIER_COLORS } from "@/lib/types";

/* Rank-emblem fra /public/ranks (hentes én gang med `node scripts/fetch-ranks.mjs`).
   Mangler en fil, vises et tegnet emblem i tier-farven i stedet. */

const FILES: Record<string, number> = {
  bronze: 5,
  silver: 5,
  gold: 5,
  platinum: 5,
  crystal: 4,
  diamond: 5,
};

export function rankIconSrc(tier: string, subTier: string): string | null {
  const t = tier.toLowerCase();
  if (t === "unranked" || !t) return "/ranks/unranked.webp";
  if (t === "master" || t === "survivor") return `/ranks/${t}-1.webp`;
  const max = FILES[t];
  if (!max) return null;
  const n = Math.min(max, Math.max(1, Number(subTier) || 1));
  return `/ranks/${t}-${n}.webp`;
}

export default function RankIcon({ tier, subTier, size = 44 }: { tier: string; subTier: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = rankIconSrc(tier, subTier);
  const color = TIER_COLORS[tier] ?? TIER_COLORS.Unranked;

  if (!src || failed) {
    return (
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="rank-icon">
        <path d="M22 3 39 12v20L22 41 5 32V12Z" fill="none" stroke={color} strokeWidth="2.5" />
        <path d="M22 11 31 16v12l-9 5-9-5V16Z" fill={color} opacity="0.85" />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={`${tier} ${subTier}`.trim()}
      className="rank-icon"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
