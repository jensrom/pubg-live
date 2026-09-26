import { NextRequest } from "next/server";
import { getStats } from "@/lib/pubg";
import { fail, handle, ok, parseShard } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const shard = parseShard(p.get("shard"));
  const account = p.get("account") ?? "";
  const season = p.get("season") ?? "current";
  if (!shard) return fail(400, "Unknown platform.");
  if (!/^account\.[0-9a-f]+$/i.test(account)) return fail(400, "Invalid account id.");
  if (!/^(current|lifetime|division\.bro\.official\.[\w.-]+)$/.test(season)) return fail(400, "Unknown season.");
  try {
    return ok(await getStats(shard, account, season));
  } catch (e) {
    return handle(e);
  }
}
