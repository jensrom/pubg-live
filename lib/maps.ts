// Kortstørrelser i centimeter (telemetriens koordinatsystem, origo øverst til venstre).
// Kilde: PUBG's API-dokumentation og kortenes officielle km-størrelser.
const MAP_SIZE_CM: Record<string, number> = {
  Baltic_Main: 816000,
  Erangel_Main: 816000,
  Desert_Main: 816000,
  Tiger_Main: 816000,
  Kiki_Main: 816000,
  Neon_Main: 816000,
  DihorOtok_Main: 816000, // Vikendi Reborn er 8x8 km
  Savage_Main: 408000,
  Chimera_Main: 306000,
  Summerland_Main: 204000,
  Range_Main: 204000,
  Heaven_Main: 102000,
};

// Officielle kortbilleder fra PUBG's eget api-assets-repo.
const MAP_IMAGE_KEY: Record<string, string> = {
  Baltic_Main: "Erangel",
  Erangel_Main: "Erangel",
  Desert_Main: "Miramar",
  Tiger_Main: "Taego",
  Kiki_Main: "Deston",
  Neon_Main: "Rondo",
  DihorOtok_Main: "Vikendi",
  Savage_Main: "Sanhok",
  Chimera_Main: "Paramo",
  Summerland_Main: "Karakin",
  Range_Main: "Camp_Jackal",
  Heaven_Main: "Haven",
};

const ASSETS = "https://raw.githubusercontent.com/pubg/api-assets/master/Assets/Maps";

export function mapSizeCm(raw: string): number {
  return MAP_SIZE_CM[raw] ?? 816000;
}

export function mapImage(raw: string): string | null {
  const key = MAP_IMAGE_KEY[raw];
  return key ? `${ASSETS}/${key}_Main_Low_Res.png` : null;
}
