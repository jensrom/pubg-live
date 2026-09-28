// Henter rank-emblemerne (inkl. Crystal og Survivor fra sæson 36+) ind i public/ranks/.
// Kør én gang:  node scripts/fetch-ranks.mjs   – og commit derefter mappen public/ranks.
// Kilde: uofficiel kopi af op.gg's ikoner på pubgtracker.top (PUBG's officielle api-assets mangler Crystal/Survivor).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.pubgtracker.top/images/ranks/opgg";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ranks");

const names = [];
for (const t of ["bronze", "silver", "gold", "platinum", "diamond"]) for (let i = 1; i <= 5; i++) names.push(`${t}-${i}`);
for (let i = 1; i <= 4; i++) names.push(`crystal-${i}`);
names.push("master-1", "survivor-1", "unranked");

await mkdir(OUT, { recursive: true });
let ok = 0;
for (const n of names) {
  const res = await fetch(`${BASE}/${n}.webp`);
  if (!res.ok) {
    console.log(`✗ ${n} (${res.status})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(OUT, `${n}.webp`), buf);
  ok++;
  console.log(`✓ ${n} (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`\n${ok}/${names.length} emblemer gemt i public/ranks`);
