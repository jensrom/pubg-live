import { NextRequest } from "next/server";
import { getMatchSummary, getPlayer } from "@/lib/pubg";
import { fail, handle, ok, parseShard } from "@/lib/http";
import type { ApiResponse, MatchSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const name = params.get("name")?.trim();
  const shard = parseShard(params.get("shard"));
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 30) || 30, 1), 100);

  if (!name) return fail(400, "Enter a player name.");
  if (!shard) return fail(400, "Unknown platform.");

  try {
    const player = await getPlayer(shard, name);
    const ids = player.matchIds.slice(0, limit);
    const matches = await Promise.all(
      ids.map((id) => getMatchSummary(shard, id, player.id).catch(() => null))
    );

    const body: ApiResponse = {
      player: { id: player.id, name: player.name },
      shard,
      fetchedAt: new Date().toISOString(),
      matchCount: player.matchIds.length,
      matches: matches.filter((m): m is MatchSummary => m !== null),
    };
    return ok(body);
  } catch (e) {
    return handle(e);
  }
}
