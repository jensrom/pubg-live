import { NextResponse } from "next/server";
import { PubgError } from "./pubg";
import { SHARDS, type Shard } from "./types";

export function parseShard(v: string | null): Shard | null {
  const s = (v ?? "steam") as Shard;
  return SHARDS.includes(s) ? s : null;
}

export function ok(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function handle(e: unknown) {
  if (e instanceof PubgError) return fail(e.status, e.message);
  console.error(e);
  return fail(500, "Unexpected error while fetching from PUBG.");
}
