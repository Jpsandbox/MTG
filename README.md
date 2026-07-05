# Foil & Folio — MTG Collection Ticker

All files sit flat at the root of this project on purpose — no `src` folder —
to make uploading to GitHub on mobile foolproof (nested folders often get
flattened by mobile upload flows, which breaks the build).

## Fresh setup on GitHub (recommended: start clean)

1. Go to your existing repo and **delete every file** currently in it
   (open each file, trash icon, commit). Get it down to completely empty,
   or just delete the repo and create a new one.
2. Click **Add file → Upload files**.
3. Select ALL of these files at once from this folder and upload them
   together in one go: `main.jsx`, `App.jsx`, `index.css`, `index.html`,
   `package.json`, `vite.config.js`, `tailwind.config.js`,
   `postcss.config.js`, `README.md`.
4. Commit.
5. Go to Vercel → your project → it should auto-redeploy. If it doesn't
   trigger automatically, click "Redeploy" on the latest deployment.

Since there's no subfolder involved, there's nothing for the upload to
flatten incorrectly — every file just goes straight to the repo root,
which is exactly where the build expects them now.

## Notes

- CSV upload expects a ManaBox-style export (Name, Set, Foil, Rarity,
  Quantity, Purchase price columns).
- Pricing comes from Scryfall's public API (tracks TCGPlayer market price).
- The Buy Watchlist tab uses EDHREC popularity among recent cards as a
  trending proxy — a research starting point, not a guarantee.
