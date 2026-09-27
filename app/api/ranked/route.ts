import { NextRequest } from "next/server";
import { getRanked, getSeasons } from "@/lib/pubg";
import { fail, handle, ok, parseShard } from "@/lib/http";

export const dynamic = "force-dynamic";

// Ranked-stats for én sæson. Bruges af "All-time high", som scanner sæsonerne én ad gangen.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const shard = parseShard(p.get("shard"));
  const account = p.get("account") ?? "";
  const season = p.get("season") ?? "";
  if (!shard) return fail(400, "Unknown platform.");
  if (!/^account\.[0-9a-f]+$/i.test(account)) return fail(400, "Invalid account id.");
  if (!/^division\.bro\.official\.[\w.-]+$/.test(season)) return fail(400, "Unknown season.");
  try {
    const seasons = await getSeasons(shard);
    const info = seasons.find((s) => s.id === season);
    if (!info?.ranked) return ok({ season, ranked: [] });
    return ok({ season, ranked: await getRanked(shard, account, season, info.current ? 120_000 : 24 * 3600_000) });
  } catch (e) {
    return handle(e);
  }
}
