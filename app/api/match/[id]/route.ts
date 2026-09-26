import { NextRequest } from "next/server";
import { getMatchDetail } from "@/lib/pubg";
import { fail, handle, ok, parseShard } from "@/lib/http";

export const dynamic = "force-dynamic";
// Telemetri-filer er 5-30 MB. Giv funktionen tid nok på Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = req.nextUrl.searchParams;
  const shard = parseShard(p.get("shard"));
  const account = p.get("account") ?? "";
  if (!shard) return fail(400, "Unknown platform.");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid match id.");
  if (!/^account\.[0-9a-f]+$/i.test(account)) return fail(400, "Invalid account id.");
  try {
    return ok(await getMatchDetail(shard, id, account));
  } catch (e) {
    return handle(e);
  }
}
