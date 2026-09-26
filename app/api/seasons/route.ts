import { NextRequest } from "next/server";
import { getSeasons } from "@/lib/pubg";
import { fail, handle, ok, parseShard } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shard = parseShard(req.nextUrl.searchParams.get("shard"));
  if (!shard) return fail(400, "Unknown platform.");
  try {
    return ok(await getSeasons(shard));
  } catch (e) {
    return handle(e);
  }
}
