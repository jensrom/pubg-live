# PUBG Live

Reklamefri PUBG-statside, der henter direkte fra PUBG's officielle API og selv tjekker for nye kampe hvert 20./30./60. sekund. Bygget som en hurtigere og mere dybdegående erstatning for pubg.op.gg.

## Funktioner

**Sæsonstats**
- Sæsonvælger med alle sæsoner (1 til nuværende) + Lifetime
- FPP/TPP-skift
- Ranked-kort: tier, RP, bedste tier, K/D, gns. placering, win %, top 10 %, KDA, HS %, flest kills, længste kill
- Kort for Solo/Duo/Squad: K/D, gns. skade, win %, top 10 %, KDA, HS %, kills/kamp, flest kills, længste kill, gns. overlevet, knocks, revives

**Kampe (seneste 30, "Hent flere" op til 100)**
- Filtre: periode (seneste session, i dag, 24 t, 7 dage), mode og map. Alle tal på siden følger filtrene
- Opsummering: kampe, wins, top 10, K/D, skade, kills, gns. placering, HS-andel, overlevet, distance
- Form-graf: én søjle pr. kamp (skade), farvet efter wins/top 10, placering under søjlen, hover for detaljer, klik for at åbne kampen
- Sidepanel: hvem du har spillet med (kampe, wins, gns. placering, deres skade mod din), stats pr. map, rekorder

**Kampdetaljer (klik på en kamp)**
- Overblik: dødsårsag og hvem der dræbte dig med hvad og på hvilken afstand, skade taget, landingstid, tid til første kamp, distancer, køretøjer
- Kort & rute: dit holds ruter på det officielle kort, landing, kills, knocks, død og alle zoner. Afspil kampen eller træk i tidslinjen
- Kills & død: kill-feed med våben, afstand og headshots
- Våben: skade givet pr. våben (træf, HS %, knocks, kills) og skade taget pr. kilde
- Holdet og Alle hold (hele scoreboardet). Alle spillernavne er klikbare

**Live**
- Automatisk opdatering, pause, "Opdater nu", "Ny"-markering og antal nye kampe i fanetitlen
- Browser-notifikation når en ny kamp dukker op (slå til med knappen)
- Stopper med at spørge PUBG når fanen er skjult, og henter med det samme når du kommer tilbage
- Favoritter og seneste søgninger gemmes i browseren

## 1. Hent en API-nøgle (gratis, 2 min)
1. Gå til https://developer.pubg.com og log ind.
2. Opret en app og kopiér API-nøglen.

## 2. Kør lokalt (Windows/PowerShell)
```powershell
npm install
copy .env.example .env.local   # indsæt din nøgle i .env.local
npm run dev
```
Åbn http://localhost:3000

## 3. Deploy til Vercel
**Via GitHub:** push mappen til et repo → vercel.com → Add New Project → vælg repo →
under Environment Variables tilføj `PUBG_API_KEY` → Deploy.

**Via CLI:**
```powershell
npm i -g vercel
vercel
vercel env add PUBG_API_KEY production
vercel --prod
```

Direkte link til en spiller: `https://din-app.vercel.app/?p=Spillernavn&s=steam`

## Hvorfor den er hurtigere end pubg.op
- op.gg viser "Last updated: a month ago" og kræver et klik på Renew. Her spørges PUBG's API direkte hver gang timeren løber ud.
- Grænsen: PUBG's API opdaterer selv kamplisten et par minutter efter kampen slutter. Hurtigere end det kan ingen side være.

## Rate limit
Gratis nøgle = 10 kald/min. Kun spilleropslag, sæsonstats og ranked tæller; kampe (`/matches`) og telemetri er ikke begrænset.
Cache på serveren: spilleropslag 15 s, nuværende sæson 2 min, afsluttede sæsoner 24 t, sæsonliste 6 t, kampe og telemetri-analyse 24 t.
Ét åbent dashboard bruger derfor højst ca. 6 kald/min.

## Struktur
- `lib/pubg.ts` – API-klient + cache (kun server, nøglen forlader aldrig serveren)
- `lib/telemetry.ts` – læser telemetri-filen (5–30 MB) og koger den ned til få KB: kill-feed, våbenskade, ruter, zoner
- `lib/maps.ts` – kortstørrelser og officielle kortbilleder (github.com/pubg/api-assets)
- `lib/weapons.json` – PUBG's officielle oversættelse af våben-/køretøjs-id'er til navne
- `lib/analysis.ts` – opsummering, sessioner, pr. map, spillet med
- `app/api/player` – spiller + kampe · `app/api/stats` – sæson/lifetime/ranked · `app/api/seasons` · `app/api/match/[id]` – kampdetaljer + telemetri
- `components/` – Dashboard, SeasonPanel, FormChart, MatchDetail, MapView
