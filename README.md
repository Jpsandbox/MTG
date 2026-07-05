# Foil & Folio — MTG Collection Ticker

A collection tracker that pulls live prices from Scryfall and flags cards to
hold, watch, or sell based on price movement since purchase. Includes a
"Buy Watchlist" tab showing recently trending cards you don't already own.

## Run it locally (optional, to test before deploying)

```
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

## Deploy for free (GitHub + Vercel)

1. Create a free GitHub account at github.com if you don't have one.
2. Create a new repository (e.g. "mtg-ticker") — keep it Public or Private,
   either works.
3. Upload every file in this folder to that repository. Easiest way:
   on the repo page, click "Add file" → "Upload files", then drag in
   this whole folder's contents (keep the src/ folder structure intact).
4. Create a free account at vercel.com and sign in with your GitHub account.
5. Click "Add New" → "Project", then select the mtg-ticker repository.
6. Vercel will auto-detect this as a Vite project. Leave settings as
   default and click "Deploy".
7. In about a minute you'll get a live URL like
   https://mtg-ticker-yourname.vercel.app — that's your working app,
   usable from any browser or phone.

No API keys are needed — Scryfall's API is free and public.

## Notes

- CSV upload expects a ManaBox-style export (Name, Set, Foil, Rarity,
  Quantity, Purchase price columns). Column names are matched loosely,
  so slightly different headers should still work.
- Pricing is pulled from Scryfall, which tracks TCGPlayer market price.
  It's a close approximation, not a live TCGPlayer listing feed.
- The Buy Watchlist tab uses EDHREC popularity ranking among recently
  released cards as a "trending" proxy — a research starting point,
  not a price prediction.
