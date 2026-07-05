import React, { useState, useMemo, useCallback } from "react";
import Papa from "papaparse";
import { Upload, TrendingUp, TrendingDown, Minus, Loader2, ArrowUpRight, ArrowDownRight, Eye, RefreshCw } from "lucide-react";

const INK = "#12110F";
const PARCHMENT = "#EDE6D6";
const GOLD = "#B8923A";
const FOREST = "#3F6B4A";
const RUST = "#A8462F";
const SLATE = "#8B8578";

function classify(changePct, isRecent) {
  if (changePct >= 35) return { label: "SELL", tone: "sell", note: "Up sharply — hype may be near its peak" };
  if (changePct <= -25) return { label: "SELL", tone: "sell", note: "Declining trend — unlikely to rebound soon" };
  if (changePct >= 10 && isRecent) return { label: "WATCH", tone: "watch", note: "Recent gains — keep an eye on momentum" };
  if (changePct < 10 && changePct > -25) return { label: "HOLD", tone: "hold", note: "Stable — no strong signal either way" };
  return { label: "HOLD", tone: "hold", note: "Stable" };
}

function ToneBadge({ tone, label }) {
  const styles = {
    sell: { bg: "rgba(168,70,47,0.15)", fg: RUST, border: RUST },
    watch: { bg: "rgba(184,146,58,0.15)", fg: GOLD, border: GOLD },
    hold: { bg: "rgba(63,107,74,0.15)", fg: FOREST, border: FOREST },
  }[tone];
  return (
    <span
      className="px-2 py-0.5 rounded-sm text-xs font-semibold tracking-wide uppercase"
      style={{ backgroundColor: styles.bg, color: styles.fg, border: `1px solid ${styles.border}` }}
    >
      {label}
    </span>
  );
}

function guessColumn(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().trim() === c);
    if (hit) return hit;
  }
  return null;
}

async function fetchScryfallBatch(identifiers) {
  const res = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers }),
  });
  if (!res.ok) throw new Error("Scryfall request failed");
  return res.json();
}

export default function MTGTicker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("portfolio");
  const [sortKey, setSortKey] = useState("changePct");
  const [sortDir, setSortDir] = useState("desc");
  const [watchlist, setWatchlist] = useState([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState(null);

  const handleFile = useCallback((file) => {
    setError(null);
    setLoading(true);
    setRows([]);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data;
          if (!data.length) throw new Error("No rows found in file");

          const sample = data[0];
          const nameCol = guessColumn(sample, ["name", "card name"]);
          const setCol = guessColumn(sample, ["set code", "set", "edition code"]);
          const setNameCol = guessColumn(sample, ["set name", "edition"]);
          const foilCol = guessColumn(sample, ["foil"]);
          const rarityCol = guessColumn(sample, ["rarity"]);
          const qtyCol = guessColumn(sample, ["quantity", "qty"]);
          const priceCol = guessColumn(sample, ["purchase price", "price"]);

          if (!nameCol) throw new Error("Couldn't find a card name column in this file");

          const parsed = data
            .filter((r) => r[nameCol] && r[nameCol].trim())
            .map((r) => ({
              name: r[nameCol].trim(),
              setCode: setCol ? (r[setCol] || "").toLowerCase().trim() : "",
              setName: setNameCol ? r[setNameCol] : "",
              foil: foilCol ? /foil/i.test(r[foilCol] || "") : false,
              rarity: rarityCol ? r[rarityCol] : "",
              qty: qtyCol ? parseFloat(r[qtyCol]) || 1 : 1,
              paid: priceCol ? parseFloat(r[priceCol]) || 0 : 0,
            }));

          // Batch fetch current prices from Scryfall (max 75 identifiers per call)
          const BATCH = 65;
          const enriched = [];
          for (let i = 0; i < parsed.length; i += BATCH) {
            const slice = parsed.slice(i, i + BATCH);
            const identifiers = slice.map((c) =>
              c.setCode ? { name: c.name, set: c.setCode } : { name: c.name }
            );
            let found = [];
            try {
              const resp = await fetchScryfallBatch(identifiers);
              found = resp.data || [];
            } catch (e) {
              // continue without prices for this batch rather than failing everything
            }
            slice.forEach((c) => {
              const match = found.find(
                (f) => f.name.toLowerCase() === c.name.toLowerCase()
              );
              const current = match
                ? parseFloat(c.foil ? match.prices?.usd_foil : match.prices?.usd) ||
                  parseFloat(match.prices?.usd) ||
                  null
                : null;
              const releasedAt = match?.released_at || null;
              const isRecent = releasedAt
                ? (Date.now() - new Date(releasedAt).getTime()) / (1000 * 3600 * 24) < 150
                : false;
              const changePct = current && c.paid > 0 ? ((current - c.paid) / c.paid) * 100 : 0;
              enriched.push({
                ...c,
                current,
                total: current ? current * c.qty : null,
                changePct,
                signal: current && c.paid > 0 ? classify(changePct, isRecent) : null,
                colorId: match?.color_identity || [],
                imageUrl: match?.image_uris?.small || match?.card_faces?.[0]?.image_uris?.small || null,
              });
            });
            setProgress(Math.min(100, Math.round(((i + BATCH) / parsed.length) * 100)));
          }
          setRows(enriched);
        } catch (e) {
          setError(e.message || "Something went wrong reading this file");
        } finally {
          setLoading(false);
          setProgress(0);
        }
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      },
    });
  }, []);

  const fetchTrending = useCallback(async () => {
    setWatchLoading(true);
    setWatchError(null);
    try {
      const ownedNames = new Set(rows.map((r) => r.name.toLowerCase()));
      const res = await fetch(
        "https://api.scryfall.com/cards/search?q=game%3Apaper+-is%3Adigital+order%3Aedhrec+date%3E2025-11-01&order=edhrec"
      );
      if (!res.ok) throw new Error("Trending lookup failed");
      const json = await res.json();
      const candidates = (json.data || [])
        .filter((c) => !ownedNames.has(c.name.toLowerCase()))
        .filter((c) => c.prices?.usd)
        .slice(0, 30)
        .map((c) => ({
          name: c.name,
          set: c.set_name,
          released: c.released_at,
          price: parseFloat(c.prices.usd),
          edhrecRank: c.edhrec_rank,
          imageUrl: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
          scryfallUrl: c.scryfall_uri,
          colorId: c.color_identity || [],
        }));
      setWatchlist(candidates);
    } catch (e) {
      setWatchError("Couldn't load trending cards right now — try again in a moment.");
    } finally {
      setWatchLoading(false);
    }
  }, [rows]);

  const sortedRows = useMemo(() => {
    const withPrices = rows.filter((r) => r.current !== null);
    const withoutPrices = rows.filter((r) => r.current === null);
    const sorted = [...withPrices].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return av > bv ? dir * -1 : av < bv ? dir * 1 : 0;
    });
    return [...sorted, ...withoutPrices];
  }, [rows, sortKey, sortDir]);

  const summary = useMemo(() => {
    const priced = rows.filter((r) => r.current !== null);
    const totalPaid = rows.reduce((s, r) => s + r.paid * r.qty, 0);
    const totalNow = priced.reduce((s, r) => s + (r.total || 0), 0);
    const sellCount = priced.filter((r) => r.signal?.label === "SELL").length;
    const topMover = priced.length
      ? priced.reduce((a, b) => (b.changePct > a.changePct ? b : a), priced[0])
      : null;
    return { totalPaid, totalNow, gain: totalNow - totalPaid, sellCount, topMover, count: rows.length };
  }, [rows]);

  const tickerItems = useMemo(() => {
    return [...rows]
      .filter((r) => r.current !== null && r.paid > 0)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 12);
  }, [rows]);

  return (
    <div style={{ backgroundColor: INK, minHeight: "100vh", color: PARCHMENT, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .display { font-family: 'Fraunces', serif; }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker-scroll 40s linear infinite;
          display: flex;
          width: max-content;
        }
        .ticker-track:hover { animation-play-state: paused; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 10px 14px; }
        tbody tr { border-top: 1px solid rgba(237,230,214,0.08); }
        tbody tr:hover { background: rgba(237,230,214,0.03); }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(237,230,214,0.2); border-radius: 3px; }
      `}</style>

      {/* Ticker tape */}
      <div style={{ borderBottom: `1px solid rgba(237,230,214,0.15)`, overflow: "hidden", backgroundColor: "#0A0908" }}>
        {tickerItems.length > 0 ? (
          <div className="ticker-track py-2">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-6 mono text-sm whitespace-nowrap">
                <span style={{ color: SLATE }}>{item.name}</span>
                <span style={{ color: item.changePct >= 0 ? FOREST : RUST, fontWeight: 600 }}>
                  {item.changePct >= 0 ? "▲" : "▼"} {Math.abs(item.changePct).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-2 px-6 mono text-sm" style={{ color: SLATE }}>
            Upload your collection to see live movers scroll here.
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <header className="mb-8">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="display text-4xl" style={{ color: PARCHMENT }}>Foil &amp; Folio</h1>
            <span className="mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>Collection Ticker</span>
          </div>
          <p className="text-sm" style={{ color: SLATE }}>
            Your cards, priced like a portfolio. Live pricing pulled from Scryfall on each upload.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 mb-6" style={{ borderBottom: `1px solid rgba(237,230,214,0.15)` }}>
          {[
            { id: "portfolio", label: "Portfolio" },
            { id: "watchlist", label: "Buy Watchlist" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-semibold uppercase tracking-wide"
              style={{
                color: tab === t.id ? GOLD : SLATE,
                borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "portfolio" && (
          <>
            {rows.length === 0 && !loading && (
              <div
                className="border-2 border-dashed rounded-lg p-12 text-center"
                style={{ borderColor: "rgba(237,230,214,0.25)" }}
              >
                <Upload className="mx-auto mb-3" size={28} color={SLATE} />
                <p className="mb-4" style={{ color: PARCHMENT }}>Upload your ManaBox (or similar) collection CSV</p>
                <label
                  className="inline-block px-5 py-2 rounded-sm cursor-pointer text-sm font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: GOLD, color: INK }}
                >
                  Choose file
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                  />
                </label>
                {error && <p className="mt-3 text-sm" style={{ color: RUST }}>{error}</p>}
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center py-16 gap-3">
                <Loader2 className="animate-spin" size={28} color={GOLD} />
                <p className="mono text-sm" style={{ color: SLATE }}>Fetching current prices from Scryfall… {progress}%</p>
              </div>
            )}

            {rows.length > 0 && !loading && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                  {[
                    { label: "Cards Tracked", value: summary.count, format: "int" },
                    { label: "Paid", value: summary.totalPaid, format: "usd" },
                    { label: "Current Value", value: summary.totalNow, format: "usd" },
                    { label: "Net Change", value: summary.gain, format: "usd", signed: true },
                  ].map((s, i) => (
                    <div key={i} className="p-4 rounded-sm" style={{ backgroundColor: "#191713", border: "1px solid rgba(237,230,214,0.1)" }}>
                      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: SLATE }}>{s.label}</p>
                      <p
                        className="mono text-xl font-semibold"
                        style={{ color: s.signed ? (s.value >= 0 ? FOREST : RUST) : PARCHMENT }}
                      >
                        {s.format === "usd" ? `${s.value >= 0 && s.signed ? "+" : ""}$${s.value.toFixed(2)}` : s.value}
                      </p>
                    </div>
                  ))}
                </div>

                {summary.sellCount > 0 && (
                  <div className="mb-6 p-3 rounded-sm text-sm" style={{ backgroundColor: "rgba(168,70,47,0.1)", border: `1px solid ${RUST}` }}>
                    <span style={{ color: RUST, fontWeight: 600 }}>{summary.sellCount} card{summary.sellCount > 1 ? "s" : ""}</span>{" "}
                    flagged SELL — either up sharply (hype may be peaking) or trending down.
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto rounded-sm" style={{ border: "1px solid rgba(237,230,214,0.1)" }}>
                  <table>
                    <thead style={{ backgroundColor: "#191713" }}>
                      <tr className="text-xs uppercase tracking-wide" style={{ color: SLATE }}>
                        <th>Card</th>
                        <th>Set</th>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => { setSortKey("paid"); setSortDir(sortDir === "desc" ? "asc" : "desc"); }}
                        >Paid</th>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => { setSortKey("current"); setSortDir(sortDir === "desc" ? "asc" : "desc"); }}
                        >Now</th>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => { setSortKey("changePct"); setSortDir(sortDir === "desc" ? "asc" : "desc"); }}
                        >Change</th>
                        <th>Signal</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {sortedRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: PARCHMENT }}>
                            {r.name}
                            {r.foil && <span className="ml-1 text-xs" style={{ color: GOLD }}>✦foil</span>}
                          </td>
                          <td className="text-xs" style={{ color: SLATE }}>{r.setName || r.setCode}</td>
                          <td className="mono">${r.paid.toFixed(2)}</td>
                          <td className="mono">{r.current !== null ? `$${r.current.toFixed(2)}` : "—"}</td>
                          <td className="mono">
                            {r.current !== null && r.paid > 0 ? (
                              <span style={{ color: r.changePct >= 0 ? FOREST : RUST }} className="flex items-center gap-1">
                                {r.changePct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(1)}%
                              </span>
                            ) : (
                              <span style={{ color: SLATE }}>—</span>
                            )}
                          </td>
                          <td>
                            {r.signal ? <ToneBadge tone={r.signal.tone} label={r.signal.label} /> : <span className="text-xs" style={{ color: SLATE }}>no data</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs mt-3" style={{ color: SLATE }}>
                  Signals are simple rules based on price change since purchase — not financial advice. Verify on TCGPlayer before listing.
                </p>
              </>
            )}
          </>
        )}

        {tab === "watchlist" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm" style={{ color: SLATE }}>
                Cards from recent sets gaining Commander/EDHREC traction that aren't already in your collection.
              </p>
              <button
                onClick={fetchTrending}
                disabled={watchLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-semibold uppercase tracking-wide shrink-0"
                style={{ backgroundColor: GOLD, color: INK }}
              >
                {watchLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Refresh
              </button>
            </div>

            {watchError && <p className="text-sm mb-4" style={{ color: RUST }}>{watchError}</p>}

            {watchlist.length === 0 && !watchLoading && !watchError && (
              <div className="text-center py-16" style={{ color: SLATE }}>
                <Eye className="mx-auto mb-3" size={28} />
                <p className="text-sm">Click Refresh to pull the current trending list.</p>
                {rows.length === 0 && <p className="text-xs mt-2">Tip: upload your collection first so we can exclude cards you already own.</p>}
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {watchlist.map((c, i) => (
                <a
                  key={i}
                  href={c.scryfallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-sm flex gap-3"
                  style={{ backgroundColor: "#191713", border: "1px solid rgba(237,230,214,0.1)" }}
                >
                  {c.imageUrl && <img src={c.imageUrl} alt={c.name} className="w-12 rounded-sm shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: PARCHMENT }}>{c.name}</p>
                    <p className="text-xs truncate" style={{ color: SLATE }}>{c.set}</p>
                    <p className="mono text-sm mt-1" style={{ color: GOLD }}>${c.price.toFixed(2)}</p>
                  </div>
                </a>
              ))}
            </div>
            <p className="text-xs mt-5" style={{ color: SLATE }}>
              Ranked by EDHREC popularity among recent releases — a starting point for research, not a prediction. Prices and Commander demand can move fast; double check current listings before buying.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
