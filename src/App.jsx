import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const VIEWS = { HOME: "home", NEW_GAME: "new_game", ACTIVE: "active", HISTORY: "history", LEADERBOARD: "leaderboard", PLAYER_PROFILE: "player_profile" };
const STORAGE_KEY = "homegame:data";

async function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.log("No saved data found, starting fresh"); }
  return null;
}

async function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { console.error("Failed to save:", e); return false; }
}

function simplifyDebts(players) {
  const balances = {};
  players.forEach(p => { balances[p.name] = (p.cashOut ?? 0) - p.totalBuyIn; });
  const transactions = [], debtors = [], creditors = [];
  Object.entries(balances).forEach(([name, bal]) => {
    if (bal < 0) debtors.push({ name, amount: -bal });
    else if (bal > 0) creditors.push({ name, amount: bal });
  });
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const payment = Math.min(debtors[i].amount, creditors[j].amount);
    if (payment > 0.01) transactions.push({ from: debtors[i].name, to: creditors[j].name, amount: payment });
    debtors[i].amount -= payment;
    creditors[j].amount -= payment;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return transactions;
}

function formatMoney(amount) {
  const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}
function formatMoneyPlain(amount) { return `$${Math.abs(amount).toFixed(2)}`; }

// Phase 5: Generate shareable settlement text
function generateSettlementText(game) {
  const transactions = simplifyDebts(game.players);
  const sorted = [...game.players].sort((a, b) => ((b.cashOut ?? 0) - b.totalBuyIn) - ((a.cashOut ?? 0) - a.totalBuyIn));
  let text = `\u2660\u2665\u2666\u2663 ${game.name}\n`;
  text += `${game.date} \u2022 ${game.gameType} ${game.stakes} \u2022 ${game.players.length} players\n`;
  text += `${"\u2014".repeat(30)}\n\n`;
  text += `RESULTS\n`;
  sorted.forEach(p => {
    const profit = (p.cashOut ?? 0) - p.totalBuyIn;
    const sign = profit > 0 ? "+" : profit < 0 ? "-" : " ";
    text += `${sign}$${Math.abs(profit).toFixed(2).padStart(8)}  ${p.name}\n`;
  });
  if (transactions.length > 0) {
    text += `\nSETTLE UP (${transactions.length} payment${transactions.length !== 1 ? "s" : ""})\n`;
    transactions.forEach(t => { text += `${t.from} \u2192 ${t.to}: $${t.amount.toFixed(2)}\n`; });
  } else { text += `\nEveryone broke even!\n`; }
  if (game.notes) text += `\nNotes: ${game.notes}\n`;
  return text;
}

let _id = Date.now();
const uid = () => `id_${++_id}`;

const font = `'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`;
const displayFont = `'Playfair Display', Georgia, serif`;

const theme = {
  bg: "#0a0f0d", surface: "#111916", surfaceHover: "#182019",
  border: "#1e2b23", borderLight: "#2a3d30",
  text: "#e8efe9", textMuted: "#7a9882", textDim: "#4a6550",
  green: "#22c55e", greenDark: "#166534", greenGlow: "rgba(34,197,94,0.15)",
  red: "#ef4444", redDark: "#7f1d1d",
  gold: "#eab308", accent: "#34d399",
};

// --- Stable UI Components (defined outside to prevent remounting on re-render) ---
const Chip = ({ children, color = theme.green, small }) => (
  <span style={{ display: "inline-block", padding: small ? "2px 8px" : "4px 12px", borderRadius: "999px", fontSize: small ? 10 : 11, fontFamily: font, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30`, letterSpacing: "0.02em" }}>{children}</span>
);

const Button = ({ children, onClick, variant = "primary", disabled, style: extraStyle }) => {
  const styles = {
    primary: { background: `linear-gradient(135deg, ${theme.green}, ${theme.accent})`, color: "#000", fontWeight: 700 },
    secondary: { background: theme.surface, color: theme.text, border: `1px solid ${theme.border}` },
    danger: { background: `${theme.red}15`, color: theme.red, border: `1px solid ${theme.red}30` },
    ghost: { background: "transparent", color: theme.textMuted },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontFamily: font, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all 0.2s", letterSpacing: "0.02em", minHeight: 44, ...styles[variant], ...extraStyle }}>{children}</button>
  );
};

const Input = ({ value, onChange, placeholder, style: extraStyle, type = "text", onKeyDown, onFocusCapture }) => (
  <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
    onFocus={onFocusCapture || undefined}
    placeholder={placeholder}
    className="hg-input"
    style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 14, fontFamily: font, outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color 0.2s", minHeight: 44, ...extraStyle }}
  />
);

const Card = ({ children, style: extraStyle, onClick }) => (
  <div onClick={onClick} className={onClick ? "hg-card-clickable" : undefined}
    style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 20, cursor: onClick ? "pointer" : "default", transition: "border-color 0.2s, background 0.2s", ...extraStyle }}>
    {children}
  </div>
);

export default function PokerHomeGame() {
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const saveTimeoutRef = useRef(null);
  const hasLoadedRef = useRef(false);

  const [view, setView] = useState(VIEWS.HOME);
  const [games, setGames] = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [newGame, setNewGame] = useState({ name: "", gameType: "NL Hold'em", stakes: "$0.50/$1" });
  const [newPlayerName, setNewPlayerName] = useState("");
  const [buyInAmount, setBuyInAmount] = useState("100");
  const [showSettlement, setShowSettlement] = useState(false);
  const [settledGameId, setSettledGameId] = useState(null);
  const [selectedHistoryGame, setSelectedHistoryGame] = useState(null);

  // Phase 2 state
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [editBuyInModal, setEditBuyInModal] = useState(null);
  const [editBuyInValue, setEditBuyInValue] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const autocompleteRef = useRef(null);

  // Phase 3 state
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [h2hOpponent, setH2hOpponent] = useState(null);

  // Phase 4 state
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const [calcModal, setCalcModal] = useState(null); // { playerId, playerName }
  const [calcValue, setCalcValue] = useState("0");
  const [sessionNotes, setSessionNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  // Phase 5 state
  const [leaderboardSort, setLeaderboardSort] = useState("profit");
  const [editGameModal, setEditGameModal] = useState(null);
  const [copiedSettlement, setCopiedSettlement] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [profileReturnView, setProfileReturnView] = useState(VIEWS.LEADERBOARD);
  const [showAbout, setShowAbout] = useState(false);

  // Phase 5: Smooth view transitions
  const navigateViewRef = useRef(null);
  const currentViewRef = useRef(view);
  currentViewRef.current = view;
  const navigateView = useCallback((newView) => {
    if (currentViewRef.current === newView) return;
    setIsTransitioning(true);
    setCopiedSettlement(false);
    // Clear any pending transition to avoid race conditions
    if (navigateViewRef.current) clearTimeout(navigateViewRef.current);
    // After fade-out, swap view and fade in
    navigateViewRef.current = setTimeout(() => {
      setView(newView);
      setIsTransitioning(false);
      navigateViewRef.current = null;
    }, 100);
  }, []);

  // Cleanup transition timeout on unmount
  useEffect(() => {
    return () => { if (navigateViewRef.current) clearTimeout(navigateViewRef.current); };
  }, []);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await loadData();
        if (cancelled) return;
        if (data) {
          setGames(data.games || []);
          setActiveGameId(data.activeGameId || null);
          if (data.activeGameId) setView(VIEWS.ACTIVE);
        }
        else {
          setShowOnboarding(true);
        }
      } catch (e) {
        console.error("Load error:", e);
        if (!cancelled) { setSaveError("Failed to load saved data. Starting fresh."); setTimeout(() => setSaveError(null), 4000); }
      } finally {
        if (!cancelled) { hasLoadedRef.current = true; setIsLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Auto-save debounce
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const success = await saveData({ games, activeGameId });
      if (success) { setLastSaved(new Date()); setSaveError(null); }
      else { setSaveError("Failed to save. Your changes may be lost."); setTimeout(() => setSaveError(null), 5000); }
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [games, activeGameId]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) setShowAutocomplete(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeGame = games.find(g => g.id === activeGameId);
  const pastGames = games.filter(g => !g.active);

  // Phase 4: Session timer — use refs to avoid restarting interval on every games mutation
  const activeStartedAtRef = useRef(null);
  activeStartedAtRef.current = activeGame?.active ? activeGame?.startedAt : null;

  useEffect(() => {
    const startedAt = activeStartedAtRef.current;
    if (startedAt) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        setElapsedTime(Math.max(0, elapsed));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { clearInterval(timerRef.current); timerRef.current = null; };
    } else {
      setElapsedTime(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [activeGameId, !!activeGame?.active, activeGame?.startedAt]);

  // Phase 4: Sync session notes from active game
  useEffect(() => {
    if (activeGame) setSessionNotes(activeGame.notes || "");
  }, [activeGame?.id]);

  // Autocomplete: all known player names
  const allPastPlayerNames = useMemo(() => {
    const names = new Set();
    games.forEach(g => g.players.forEach(p => names.add(p.name)));
    return [...names].sort();
  }, [games]);

  const autocompleteSuggestions = useMemo(() => {
    if (!newPlayerName.trim()) return allPastPlayerNames;
    const q = newPlayerName.trim().toLowerCase();
    return allPastPlayerNames.filter(n => n.toLowerCase().includes(q));
  }, [newPlayerName, allPastPlayerNames]);

  const leaderboard = useMemo(() => {
    const stats = {};
    pastGames.forEach(g => {
      g.players.forEach(p => {
        if (!stats[p.name]) stats[p.name] = { name: p.name, sessions: 0, totalProfit: 0, totalBuyIn: 0, wins: 0 };
        const profit = (p.cashOut ?? 0) - p.totalBuyIn;
        stats[p.name].sessions++;
        stats[p.name].totalProfit += profit;
        stats[p.name].totalBuyIn += p.totalBuyIn;
        if (profit > 0) stats[p.name].wins++;
      });
    });
    return Object.values(stats).sort((a, b) => {
      switch (leaderboardSort) {
        case "roi": {
          const roiA = a.totalBuyIn > 0 ? a.totalProfit / a.totalBuyIn : 0;
          const roiB = b.totalBuyIn > 0 ? b.totalProfit / b.totalBuyIn : 0;
          return roiB - roiA;
        }
        case "sessions": return b.sessions - a.sessions || b.totalProfit - a.totalProfit;
        case "winRate": {
          const wrA = a.sessions > 0 ? a.wins / a.sessions : 0;
          const wrB = b.sessions > 0 ? b.wins / b.sessions : 0;
          return wrB - wrA || b.totalProfit - a.totalProfit;
        }
        default: return b.totalProfit - a.totalProfit;
      }
    });
  }, [pastGames, leaderboardSort]);

  // Export all data as JSON backup
  const exportData = () => {
    const data = JSON.stringify({ games, activeGameId }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homegame-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import data from JSON backup
  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported.games || !Array.isArray(imported.games)) {
          setSaveError("Invalid backup file — no games found.");
          setTimeout(() => setSaveError(null), 4000);
          return;
        }
        setConfirmDialog({
          type: "import_data", title: "Import Backup",
          message: `This will replace all your current data with ${imported.games.length} game(s) from the backup. This cannot be undone. Continue?`,
          onConfirm: () => {
            setGames(imported.games);
            setActiveGameId(imported.activeGameId || null);
            if (imported.activeGameId) setView(VIEWS.ACTIVE);
            setConfirmDialog(null);
          },
        });
      } catch (err) {
        setSaveError("Could not read backup file. Make sure it's a valid .json file.");
        setTimeout(() => setSaveError(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const startGame = () => {
    if (!newGame.name.trim()) return;
    const game = { id: uid(), name: newGame.name.trim(), date: new Date().toISOString().split("T")[0], startedAt: new Date().toISOString(), gameType: newGame.gameType, stakes: newGame.stakes, active: true, players: [], notes: "" };
    setGames(prev => [...prev, game]);
    setActiveGameId(game.id);
    setNewGame({ name: "", gameType: "NL Hold'em", stakes: "$0.50/$1" });
    setShowOnboarding(false);
    navigateView(VIEWS.ACTIVE);
  };

  // Phase 2: duplicate check on add
  const addPlayer = () => {
    if (!newPlayerName.trim() || !activeGame) return;
    const trimmedName = newPlayerName.trim();
    if (activeGame.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      setDuplicateWarning(`"${trimmedName}" is already in this game`);
      setTimeout(() => setDuplicateWarning(null), 3000);
      return;
    }
    // Use existing canonical name if one exists (case-insensitive match) to prevent "Alice" vs "alice" split
    const existingName = allPastPlayerNames.find(n => n.toLowerCase() === trimmedName.toLowerCase());
    const canonicalName = existingName || trimmedName;
    const amount = Math.min(Math.max(parseFloat(buyInAmount) || 100, 0.01), 99999);
    const player = { id: uid(), name: canonicalName, totalBuyIn: amount, cashOut: null, buyIns: [amount] };
    setGames(prev => prev.map(g => g.id === activeGameId ? { ...g, players: [...g.players, player] } : g));
    setNewPlayerName("");
    setShowAutocomplete(false);
  };

  // Rebuy with a specific amount
  const addRebuy = (playerId, amount) => {
    if (!amount || amount <= 0 || amount > 99999 || isNaN(amount)) return;
    setGames(prev => prev.map(g => g.id === activeGameId ? {
      ...g, players: g.players.map(p => p.id === playerId ? { ...p, totalBuyIn: p.totalBuyIn + amount, buyIns: [...p.buyIns, amount] } : p)
    } : g));
  };

  // Phase 4: Quick rebuy (same as player's last buy-in)
  const quickRebuy = (playerId) => {
    setGames(prev => prev.map(g => {
      if (g.id !== activeGameId) return g;
      return { ...g, players: g.players.map(p => {
        if (p.id !== playerId) return p;
        const lastAmount = p.buyIns[p.buyIns.length - 1];
        return { ...p, totalBuyIn: p.totalBuyIn + lastAmount, buyIns: [...p.buyIns, lastAmount] };
      })};
    }));
  };

  // Remove a specific rebuy (cannot remove the initial buy-in at index 0)
  const removeRebuy = (playerId, buyInIndex) => {
    if (buyInIndex === 0) return;
    const player = activeGame?.players.find(p => p.id === playerId);
    if (!player) return;
    const amount = player.buyIns[buyInIndex];
    setConfirmDialog({
      type: "remove_rebuy", title: "Remove Rebuy",
      message: `Remove the $${amount.toFixed(2)} rebuy from ${player.name}?`,
      onConfirm: () => {
        setGames(prev => prev.map(g => {
          if (g.id !== activeGameId) return g;
          return { ...g, players: g.players.map(p => {
            if (p.id !== playerId) return p;
            const newBuyIns = p.buyIns.filter((_, i) => i !== buyInIndex);
            return { ...p, buyIns: newBuyIns, totalBuyIn: newBuyIns.reduce((s, b) => s + b, 0) };
          })};
        }));
        setConfirmDialog(null);
      },
    });
  };

  const setCashOut = (playerId, value) => {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount < 0 || amount > 9999999) return;
    setGames(prev => prev.map(g => g.id === activeGameId ? {
      ...g, players: g.players.map(p => p.id === playerId ? { ...p, cashOut: amount } : p)
    } : g));
    setCalcModal(null);
    setCalcValue("0");
  };

  // Phase 4: Save session notes
  const saveSessionNotes = useCallback((text) => {
    setSessionNotes(text);
    setGames(prev => prev.map(g => g.id === activeGameId ? { ...g, notes: text } : g));
  }, [activeGameId]);

  // Phase 2: undo/edit cash-out
  const undoCashOut = (playerId) => {
    setGames(prev => prev.map(g => g.id === activeGameId ? {
      ...g, players: g.players.map(p => p.id === playerId ? { ...p, cashOut: null } : p)
    } : g));
  };

  // Phase 2: remove player with confirmation
  const removePlayer = (playerId, playerName) => {
    setConfirmDialog({
      type: "remove_player", title: "Remove Player",
      message: `Remove ${playerName} from this game? Their buy-ins and data will be lost.`,
      onConfirm: () => {
        setGames(prev => prev.map(g => g.id === activeGameId ? { ...g, players: g.players.filter(p => p.id !== playerId) } : g));
        setConfirmDialog(null);
      },
    });
  };

  // Phase 2: edit buy-in
  const openEditBuyIn = (playerId, buyInIndex, currentAmount) => {
    setEditBuyInModal({ playerId, buyInIndex });
    setEditBuyInValue(String(currentAmount));
  };

  const saveEditBuyIn = () => {
    if (!editBuyInModal) return;
    const newAmount = parseFloat(editBuyInValue);
    if (isNaN(newAmount) || newAmount <= 0 || newAmount > 99999) return;
    const { playerId, buyInIndex } = editBuyInModal;
    // Verify player still exists
    const targetPlayer = activeGame?.players.find(p => p.id === playerId);
    if (!targetPlayer || buyInIndex >= targetPlayer.buyIns.length) {
      setEditBuyInModal(null);
      setEditBuyInValue("");
      return;
    }
    setGames(prev => prev.map(g => g.id === activeGameId ? {
      ...g, players: g.players.map(p => {
        if (p.id !== playerId) return p;
        const newBuyIns = [...p.buyIns];
        newBuyIns[buyInIndex] = newAmount;
        return { ...p, buyIns: newBuyIns, totalBuyIn: newBuyIns.reduce((s, b) => s + b, 0) };
      })
    } : g));
    setEditBuyInModal(null);
    setEditBuyInValue("");
  };

  // Phase 2: end game with confirmation
  const endGame = () => {
    if (!activeGame) return;
    setConfirmDialog({
      type: "end_game", title: "End Game",
      message: `End "${activeGame.name}" and settle up? This cannot be undone.`,
      onConfirm: () => {
        const endedId = activeGameId;
        setGames(prev => prev.map(g => g.id === endedId ? { ...g, active: false } : g));
        setSettledGameId(endedId);
        setShowSettlement(true);
        setActiveGameId(null);
        setConfirmDialog(null);
      },
    });
  };

  // Phase 2: delete past game
  const deleteGame = (gameId, gameName) => {
    setConfirmDialog({
      type: "delete_game", title: "Delete Game",
      message: `Permanently delete "${gameName}"? This removes all player data from this session.`,
      onConfirm: () => {
        setGames(prev => prev.filter(g => g.id !== gameId));
        setSelectedHistoryGame(null);
        setConfirmDialog(null);
      },
    });
  };

  const allCashedOut = activeGame?.players.length > 0 && activeGame?.players.every(p => p.cashOut !== null);
  const totalInPlay = activeGame?.players.reduce((s, p) => s + p.totalBuyIn, 0) ?? 0;
  const totalCashedOut = activeGame?.players.reduce((s, p) => s + (p.cashOut ?? 0), 0) ?? 0;

  // Phase 5: Edit past game details
  const openEditGame = (game) => {
    setEditGameModal({ gameId: game.id, name: game.name, gameType: game.gameType, stakes: game.stakes, date: game.date });
  };
  const saveEditGame = () => {
    if (!editGameModal || !editGameModal.name.trim()) return;
    const { gameId, name, gameType, stakes, date } = editGameModal;
    // Validate date: must be a valid YYYY-MM-DD string, otherwise keep original
    const originalGame = games.find(g => g.id === gameId);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime()) ? date : (originalGame?.date || date);
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, name: name.trim(), gameType, stakes, date: validDate } : g));
    setEditGameModal(null);
  };

  // Phase 5: Share/copy settlement summary
  const shareSettlement = async (game) => {
    const text = generateSettlementText(game);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSettlement(true);
      setTimeout(() => setCopiedSettlement(false), 2500);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setCopiedSettlement(true); setTimeout(() => setCopiedSettlement(false), 2500); } catch (e2) { console.error("Copy failed", e2); }
      document.body.removeChild(ta);
    }
  };

  // Phase 3: Navigate to player profile
  const navigateToPlayer = useCallback((name) => {
    setSelectedPlayerName(name);
    setH2hOpponent(null);
    // When navigating from settlement (ACTIVE view with no live game), return to HOME instead
    const current = currentViewRef.current;
    const returnTo = current === VIEWS.PLAYER_PROFILE ? VIEWS.LEADERBOARD : current;
    setProfileReturnView(returnTo);
    navigateView(VIEWS.PLAYER_PROFILE);
  }, [navigateView]);

  // Phase 3: Compute full player profile data
  const playerProfile = useMemo(() => {
    if (!selectedPlayerName) return null;
    const sessions = pastGames
      .filter(g => g.players.some(pl => pl.name === selectedPlayerName))
      .map(g => {
        const player = g.players.find(pl => pl.name === selectedPlayerName);
        const profit = (player.cashOut ?? 0) - player.totalBuyIn;
        return { gameId: g.id, gameName: g.name, date: g.date, gameType: g.gameType, stakes: g.stakes, buyIn: player.totalBuyIn, cashOut: player.cashOut ?? 0, profit, playerCount: g.players.length };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalProfit = sessions.reduce((s, x) => s + x.profit, 0);
    const totalBuyIn = sessions.reduce((s, x) => s + x.buyIn, 0);
    const wins = sessions.filter(x => x.profit > 0).length;
    const losses = sessions.filter(x => x.profit < 0).length;

    // Running profit for chart
    let running = 0;
    const chartData = sessions.map(s => { running += s.profit; return { date: s.date, name: s.gameName, profit: s.profit, cumulative: running }; });

    // Streaks
    let currentStreak = 0, bestWinStreak = 0, bestLossStreak = 0, tempStreak = 0, lastSign = 0;
    sessions.forEach(s => {
      const sign = s.profit > 0 ? 1 : s.profit < 0 ? -1 : 0;
      if (sign === lastSign && sign !== 0) { tempStreak++; }
      else { tempStreak = sign !== 0 ? 1 : 0; }
      if (sign === 1 && tempStreak > bestWinStreak) bestWinStreak = tempStreak;
      if (sign === -1 && tempStreak > bestLossStreak) bestLossStreak = tempStreak;
      lastSign = sign;
    });
    // Current streak from end
    if (sessions.length > 0) {
      const lastProfit = sessions[sessions.length - 1].profit;
      const sign = lastProfit > 0 ? 1 : lastProfit < 0 ? -1 : 0;
      currentStreak = sign;
      for (let i = sessions.length - 2; i >= 0; i--) {
        const pSign = sessions[i].profit > 0 ? 1 : sessions[i].profit < 0 ? -1 : 0;
        if (pSign === sign && sign !== 0) currentStreak += sign;
        else break;
      }
    }

    const biggestWin = sessions.length > 0 ? Math.max(...sessions.map(s => s.profit)) : 0;
    const biggestLoss = sessions.length > 0 ? Math.min(...sessions.map(s => s.profit)) : 0;
    const avgProfit = sessions.length > 0 ? totalProfit / sessions.length : 0;
    const roi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;

    // Head-to-head data against all opponents
    const opponents = {};
    pastGames.forEach(g => {
      const me = g.players.find(p => p.name === selectedPlayerName);
      if (!me) return;
      const myProfit = (me.cashOut ?? 0) - me.totalBuyIn;
      g.players.forEach(p => {
        if (p.name === selectedPlayerName) return;
        if (!opponents[p.name]) opponents[p.name] = { name: p.name, gamesPlayed: 0, myWins: 0, theirWins: 0, myTotalProfit: 0, theirTotalProfit: 0 };
        const theirProfit = (p.cashOut ?? 0) - p.totalBuyIn;
        opponents[p.name].gamesPlayed++;
        opponents[p.name].myTotalProfit += myProfit;
        opponents[p.name].theirTotalProfit += theirProfit;
        if (myProfit > theirProfit) opponents[p.name].myWins++;
        else if (theirProfit > myProfit) opponents[p.name].theirWins++;
      });
    });

    return {
      name: selectedPlayerName, sessions, totalProfit, totalBuyIn, wins, losses,
      chartData, biggestWin, biggestLoss, avgProfit, roi, currentStreak,
      bestWinStreak, bestLossStreak, opponents: Object.values(opponents).sort((a, b) => b.gamesPlayed - a.gamesPlayed),
    };
  }, [selectedPlayerName, pastGames]);

  // --- UI Components are defined outside the component (see top-level definitions) ---

  // Phase 2: Confirmation Dialog
  const ConfirmDialog = () => {
    if (!confirmDialog) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, animation: "fadeIn 0.15s ease", backdropFilter: "blur(4px)" }} onClick={() => setConfirmDialog(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <h3 style={{ fontFamily: displayFont, fontSize: 20, color: theme.text, marginBottom: 8, marginTop: 0 }}>{confirmDialog.title}</h3>
          <p style={{ fontFamily: font, fontSize: 13, color: theme.textMuted, lineHeight: 1.6, marginBottom: 24 }}>{confirmDialog.message}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={() => setConfirmDialog(null)} variant="secondary" style={{ padding: "8px 16px", fontSize: 12 }}>Cancel</Button>
            <Button onClick={confirmDialog.onConfirm} variant={confirmDialog.type === "end_game" ? "primary" : "danger"} style={{ padding: "8px 16px", fontSize: 12 }}>
              {confirmDialog.type === "end_game" ? "End Game" : confirmDialog.type === "delete_game" ? "Delete" : confirmDialog.type === "import_data" ? "Import" : "Remove"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Phase 2: Edit Buy-In Modal
  const EditBuyInModal = () => {
    if (!editBuyInModal) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, animation: "fadeIn 0.15s ease", backdropFilter: "blur(4px)" }} onClick={() => setEditBuyInModal(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <h3 style={{ fontFamily: displayFont, fontSize: 18, color: theme.text, marginBottom: 16, marginTop: 0 }}>Edit Buy-In</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: font, fontSize: 14, color: theme.green }}>$</span>
            <Input value={editBuyInValue} onChange={setEditBuyInValue} placeholder="Amount" type="number" style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && saveEditBuyIn()} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Button onClick={() => setEditBuyInModal(null)} variant="secondary" style={{ padding: "8px 16px", fontSize: 12 }}>Cancel</Button>
            <Button onClick={saveEditBuyIn} style={{ padding: "8px 16px", fontSize: 12 }}>Save</Button>
          </div>
        </div>
      </div>
    );
  };

  // Phase 5: Edit Past Game Modal
  const EditGameModal = () => {
    if (!editGameModal) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, animation: "fadeIn 0.15s ease", backdropFilter: "blur(4px)" }} onClick={() => setEditGameModal(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <h3 style={{ fontFamily: displayFont, fontSize: 20, color: theme.text, marginBottom: 16, marginTop: 0 }}>Edit Game Details</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontFamily: font, fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Game Name</label>
              <Input value={editGameModal.name} onChange={v => setEditGameModal(prev => ({ ...prev, name: v }))} placeholder="Game name" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontFamily: font, fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Type</label>
                <select value={editGameModal.gameType} onChange={e => setEditGameModal(prev => ({ ...prev, gameType: e.target.value }))}
                  style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 14, fontFamily: font, width: "100%", boxSizing: "border-box", outline: "none", minHeight: 44 }}>
                  <option>NL Hold'em</option><option>PLO</option><option>PLO5</option><option>Mixed</option><option>Dealer's Choice</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: font, fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Stakes</label>
                <Input value={editGameModal.stakes} onChange={v => setEditGameModal(prev => ({ ...prev, stakes: v }))} placeholder="$0.50/$1" />
              </div>
            </div>
            <div>
              <label style={{ fontFamily: font, fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Date</label>
              <Input value={editGameModal.date} onChange={v => setEditGameModal(prev => ({ ...prev, date: v }))} type="date" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <Button onClick={() => setEditGameModal(null)} variant="secondary" style={{ padding: "8px 16px", fontSize: 12 }}>Cancel</Button>
            <Button onClick={saveEditGame} disabled={!editGameModal.name.trim()} style={{ padding: "8px 16px", fontSize: 12 }}>Save Changes</Button>
          </div>
        </div>
      </div>
    );
  };

  // Phase 5: Onboarding overlay for new users
  const OnboardingOverlay = () => {
    if (!showOnboarding) return null;
    const steps = [
      { icon: "\u2660\u2665\u2666\u2663", title: "Welcome to Home Game", desc: "Track your poker home games with ease. Manage buy-ins, rebuys, cash-outs, and settle up at the end of the night." },
      { icon: "+", title: "Start a Session", desc: "Tap \"Start New Game\" to create a session. Give it a name, pick the game type and stakes, then add players as they sit down." },
      { icon: "\u2666", title: "During the Game", desc: "Add rebuys with a single tap. When someone leaves, use the calculator to enter their cash-out. The app tracks the running chip count in real time." },
      { icon: "\u2605", title: "After the Game", desc: "End the session to see optimized settlements. Over time, the leaderboard and player profiles track lifetime stats, streaks, and head-to-head records." },
    ];
    const step = steps[onboardingStep];
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20, animation: "fadeIn 0.3s ease", backdropFilter: "blur(6px)" }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 20, animation: "pulse 2s ease-in-out infinite" }}>{step.icon}</div>
          <h2 style={{ fontFamily: displayFont, fontSize: 24, color: theme.text, marginBottom: 8 }}>{step.title}</h2>
          <p style={{ fontFamily: font, fontSize: 13, color: theme.textMuted, lineHeight: 1.7, marginBottom: 32, padding: "0 10px" }}>{step.desc}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === onboardingStep ? theme.green : theme.border, transition: "all 0.3s", transform: i === onboardingStep ? "scale(1.3)" : "scale(1)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {onboardingStep > 0 && <Button onClick={() => setOnboardingStep(s => s - 1)} variant="secondary" style={{ padding: "12px 24px" }}>Back</Button>}
            {onboardingStep < steps.length - 1 ? (
              <Button onClick={() => setOnboardingStep(s => s + 1)} style={{ padding: "12px 32px" }}>Next</Button>
            ) : (
              <Button onClick={() => { setShowOnboarding(false); setOnboardingStep(0); }} style={{ padding: "12px 32px" }}>{"\u2660"} Let's Play</Button>
            )}
          </div>
          {onboardingStep < steps.length - 1 && (
            <button onClick={() => { setShowOnboarding(false); setOnboardingStep(0); }} style={{ marginTop: 16, background: "none", border: "none", fontFamily: font, fontSize: 11, color: theme.textDim, cursor: "pointer", minHeight: 44 }}>Skip intro</button>
          )}
        </div>
      </div>
    );
  };

  // Phase 4: Format elapsed time
  const formatElapsed = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  // Phase 4: Auto-close calc modal if game ends or player removed
  useEffect(() => {
    if (calcModal && (!activeGame || !activeGame.players.find(p => p.id === calcModal.playerId))) {
      setCalcModal(null);
      setCalcValue("0");
    }
  }, [calcModal, activeGame]);

  // Phase 4: Calculator-style cash-out modal
  const CalcModal = () => {
    if (!calcModal) return null;
    const { playerId, playerName } = calcModal;
    const player = activeGame?.players.find(p => p.id === playerId);
    if (!activeGame || !player) return null;
    const calcPress = (key) => {
      if (key === "C") { setCalcValue("0"); return; }
      if (key === "\u232B") { setCalcValue(prev => prev.length <= 1 ? "0" : prev.slice(0, -1)); return; }
      if (key === ".") {
        setCalcValue(prev => prev.includes(".") ? prev : prev + ".");
        return;
      }
      // Prevent excessively long input (max 10 chars) and cap at 2 decimal places
      setCalcValue(prev => {
        if (prev.length >= 10) return prev;
        const dotIdx = prev.indexOf(".");
        if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev; // already 2 decimal places
        return prev === "0" ? key : prev + key;
      });
    };
    const calcAmount = parseFloat(calcValue) || 0;
    const profit = player ? calcAmount - player.totalBuyIn : 0;

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", zIndex: 1000, animation: "fadeIn 0.15s ease" }}>
        <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: displayFont, fontSize: 20, color: theme.text }}>Cash Out</div>
            <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim, marginTop: 2 }}>{playerName} {"\u2022"} Buy-in: ${player?.totalBuyIn.toFixed(2)}</div>
          </div>
          <button onClick={() => { setCalcModal(null); setCalcValue("0"); }} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 24, cursor: "pointer", padding: 8, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 20px 0" }}>
          <div style={{ fontFamily: font, fontSize: 14, color: theme.gold, marginBottom: 8 }}>$</div>
          <div style={{ fontFamily: font, fontSize: 48, fontWeight: 700, color: theme.text, marginBottom: 8, letterSpacing: "-0.02em", minHeight: 58 }}>{calcValue}</div>
          {player && (
            <div style={{ fontFamily: font, fontSize: 16, fontWeight: 600, color: profit > 0 ? theme.green : profit < 0 ? theme.red : theme.textMuted }}>
              {formatMoney(profit)}
            </div>
          )}
        </div>

        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, maxWidth: 380, margin: "0 auto", width: "100%" }}>
          {["7","8","9","C","4","5","6","\u232B","1","2","3","."].map((key) => (
            <button key={key} data-calc="true" onClick={() => calcPress(key)}
              style={{ padding: "16px 0", borderRadius: 12, border: `1px solid ${theme.border}`, background: key === "\u232B" ? `${theme.red}15` : key === "C" ? `${theme.gold}10` : theme.surface, color: key === "\u232B" ? theme.red : key === "C" ? theme.gold : theme.text, fontFamily: font, fontSize: 20, fontWeight: 600, cursor: "pointer", transition: "all 0.1s" }}
              onMouseDown={e => { e.currentTarget.style.background = theme.surfaceHover; e.currentTarget.style.transform = "scale(0.96)"; }}
              onMouseUp={e => { e.currentTarget.style.background = key === "\u232B" ? `${theme.red}15` : key === "C" ? `${theme.gold}10` : theme.surface; e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = key === "\u232B" ? `${theme.red}15` : key === "C" ? `${theme.gold}10` : theme.surface; e.currentTarget.style.transform = "scale(1)"; }}
            >{key}</button>
          ))}
          <button key="0" data-calc="true" onClick={() => calcPress("0")}
            style={{ padding: "16px 0", borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, fontFamily: font, fontSize: 20, fontWeight: 600, cursor: "pointer", transition: "all 0.1s", gridColumn: "2 / 4" }}
            onMouseDown={e => { e.currentTarget.style.background = theme.surfaceHover; e.currentTarget.style.transform = "scale(0.96)"; }}
            onMouseUp={e => { e.currentTarget.style.background = theme.surface; e.currentTarget.style.transform = "scale(1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = theme.surface; e.currentTarget.style.transform = "scale(1)"; }}
          >0</button>
        </div>

        <div style={{ padding: "8px 20px 20px", display: "flex", gap: 8, maxWidth: 380, margin: "0 auto", width: "100%" }}>
          <Button onClick={() => { setCalcModal(null); setCalcValue("0"); }} variant="secondary" style={{ flex: 1, padding: "14px 0", fontSize: 14 }}>Cancel</Button>
          <Button onClick={() => setCashOut(playerId, calcValue)} disabled={calcValue === "" || calcValue === "."} style={{ flex: 2, padding: "14px 0", fontSize: 14 }}>{"\u2666"} Confirm ${calcValue}</Button>
        </div>
      </div>
    );
  };

  const Toast = () => {
    const isError = !!saveError;
    const isWarn = !isError && !!duplicateWarning;
    const isSuccess = !isError && !isWarn && copiedSettlement;
    const msg = saveError || duplicateWarning || (copiedSettlement ? "Settlement copied to clipboard!" : null);
    if (!msg) return null;
    return (
      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: isSuccess ? `${theme.green}20` : isWarn ? `${theme.gold}20` : theme.redDark, color: isSuccess ? theme.green : isWarn ? theme.gold : theme.text, padding: "12px 20px", borderRadius: 10, fontFamily: font, fontSize: 12, border: `1px solid ${isSuccess ? theme.green + "40" : isWarn ? theme.gold + "40" : theme.red + "40"}`, zIndex: 1000, animation: "fadeIn 0.3s ease", maxWidth: "90vw", textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
        {isSuccess ? "\u2713" : "\u26A0"} {msg}
      </div>
    );
  };

  const SaveIndicator = () => {
    if (!lastSaved) return null;
    return <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim, textAlign: "right", marginBottom: 4, opacity: 0.6 }}>{"\u2713"} saved</div>;
  };

  const Nav = () => (
    <div style={{ display: "flex", gap: 4, padding: "6px", background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}`, marginBottom: 24, flexWrap: "wrap" }}>
      {[
        { key: VIEWS.HOME, label: "\u2302 Home" },
        ...(activeGame ? [{ key: VIEWS.ACTIVE, label: "\u2660 Active Game" }] : showSettlement && settledGameId ? [{ key: VIEWS.ACTIVE, label: "\u2660 Settlement" }] : []),
        { key: VIEWS.HISTORY, label: "\u2630 History" },
        { key: VIEWS.LEADERBOARD, label: "\u2605 Leaderboard" },
      ].map(tab => (
        <button key={tab.key} onClick={() => { navigateView(tab.key); if (tab.key !== VIEWS.ACTIVE) { setShowSettlement(false); setSettledGameId(null); } setSelectedHistoryGame(null); }}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", fontFamily: font, fontSize: 12, fontWeight: view === tab.key ? 700 : 400, color: view === tab.key ? "#000" : theme.textMuted, background: view === tab.key ? theme.green : "transparent", cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.02em", minHeight: 44 }}>
          {tab.label}
        </button>
      ))}
    </div>
  );

  const SettlementView = ({ game }) => {
    const transactions = simplifyDebts(game.players);
    return (
      <div style={{ animation: "fadeIn 0.3s ease" }}>
        <h3 style={{ fontFamily: displayFont, fontSize: 22, color: theme.text, marginBottom: 4 }}>Settlement {"\u2014"} {game.name}</h3>
        <p style={{ color: theme.textDim, fontFamily: font, fontSize: 12, marginBottom: 20 }}>{game.date} {"\u2022"} {game.gameType} {game.stakes}</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
          {[...game.players].sort((a, b) => ((b.cashOut ?? 0) - b.totalBuyIn) - ((a.cashOut ?? 0) - a.totalBuyIn)).map(p => {
            const profit = (p.cashOut ?? 0) - p.totalBuyIn;
            return (
              <Card key={p.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span onClick={() => navigateToPlayer(p.name)} style={{ fontFamily: font, fontSize: 14, color: theme.text, fontWeight: 600, cursor: "pointer", borderBottom: `1px dashed ${theme.textDim}40` }}>{p.name}</span>
                  <span style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginLeft: 10 }}>In: ${p.totalBuyIn.toFixed(2)} {"\u2192"} Out: ${(p.cashOut ?? 0).toFixed(2)}</span>
                </div>
                <span style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: profit > 0 ? theme.green : profit < 0 ? theme.red : theme.textMuted }}>{formatMoney(profit)}</span>
              </Card>
            );
          })}
        </div>
        <h4 style={{ fontFamily: displayFont, fontSize: 17, color: theme.gold, marginBottom: 12 }}>{"\u2666"} Settle Up ({transactions.length} payment{transactions.length !== 1 ? "s" : ""})</h4>
        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          {transactions.map((t, i) => (
            <Card key={i} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, borderColor: `${theme.gold}30`, background: `${theme.gold}06` }}>
              <span style={{ fontFamily: font, fontSize: 14, color: theme.red, fontWeight: 600 }}>{t.from}</span>
              <span style={{ fontFamily: font, fontSize: 11, color: theme.textDim }}>{"\u2192"}</span>
              <span style={{ fontFamily: font, fontSize: 14, color: theme.green, fontWeight: 600 }}>{t.to}</span>
              <span style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: theme.gold, marginLeft: "auto" }}>{formatMoneyPlain(t.amount)}</span>
            </Card>
          ))}
          {transactions.length === 0 && (
            <p style={{ fontFamily: font, fontSize: 13, color: theme.textDim, textAlign: "center", padding: 20 }}>Everyone broke even {"\u2014"} no payments needed!</p>
          )}
        </div>
        {game.notes && (
          <Card style={{ marginBottom: 16, padding: 14, borderColor: `${theme.accent}20` }}>
            <div style={{ fontFamily: font, fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{"\u270E"} Session Notes</div>
            <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{game.notes}</div>
          </Card>
        )}
        {/* Phase 5: Share settlement + edit past game */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button onClick={() => shareSettlement(game)} variant="secondary" style={{ flex: 1, fontSize: 12, minWidth: 140 }}>
            {copiedSettlement ? "\u2713 Copied!" : "\u2398 Copy Settlement"}
          </Button>
          {!game.active && (
            <Button onClick={() => openEditGame(game)} variant="secondary" style={{ flex: 1, fontSize: 12, minWidth: 140 }}>
              {"\u270E"} Edit Details
            </Button>
          )}
        </div>
        <Button onClick={() => { setShowSettlement(false); setSettledGameId(null); setSelectedHistoryGame(null); navigateView(VIEWS.HOME); }} variant="secondary" style={{ width: "100%" }}>{"\u2190"} Back to Home</Button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        `}</style>
        <div style={{ fontSize: 40, animation: "pulse 1.5s ease-in-out infinite" }}>{"\u2660\u2665\u2666\u2663"}</div>
        <div style={{ width: 32, height: 32, border: `3px solid ${theme.border}`, borderTopColor: theme.green, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontFamily: font, fontSize: 13, color: theme.textDim, letterSpacing: "0.08em" }}>Loading your games...</div>
      </div>
    );
  }

  // --- VIEWS ---
  const renderHome = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u2660\u2665\u2666\u2663"}</div>
        <h1 style={{ fontFamily: displayFont, fontSize: 32, color: theme.text, marginBottom: 6, fontWeight: 700 }}>Home Game</h1>
        <p style={{ fontFamily: font, fontSize: 13, color: theme.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Poker Session Manager</p>
      </div>
      <Card onClick={() => navigateView(VIEWS.NEW_GAME)} style={{ textAlign: "center", padding: 28, cursor: "pointer", borderStyle: "dashed", marginBottom: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>+</div>
        <div style={{ fontFamily: font, fontSize: 14, color: theme.green, fontWeight: 600 }}>Start New Game</div>
        <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 4 }}>Create a session and invite players</div>
      </Card>
      {activeGame && (
        <Card onClick={() => navigateView(VIEWS.ACTIVE)} style={{ marginBottom: 16, borderColor: `${theme.green}40`, background: `linear-gradient(135deg, ${theme.greenGlow}, ${theme.surface})` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Chip color={theme.green}>LIVE</Chip>
              <div style={{ fontFamily: displayFont, fontSize: 18, color: theme.text, marginTop: 8 }}>{activeGame.name}</div>
              <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 4 }}>{activeGame.players.length} players {"\u2022"} ${totalInPlay.toFixed(2)} in play</div>
            </div>
            <div style={{ fontSize: 28, color: theme.green }}>{"\u2192"}</div>
          </div>
        </Card>
      )}
      {games.length === 0 && (
        <div style={{ marginTop: 24 }}>
          <Card style={{ textAlign: "center", padding: 28, borderStyle: "dashed", borderColor: theme.textDim + "30", marginBottom: 12 }}>
            <div style={{ fontFamily: font, fontSize: 13, color: theme.textDim, lineHeight: 1.8 }}>
              Welcome! Tap <span style={{ color: theme.green, fontWeight: 600 }}>Start New Game</span> above to create your first poker session.
              Track buy-ins, rebuys, cash out with the numpad calculator, and see optimized settlements at the end of the night.
            </div>
          </Card>
          <button onClick={() => { setShowOnboarding(true); setOnboardingStep(0); }}
            style={{ display: "block", margin: "0 auto", background: "none", border: "none", fontFamily: font, fontSize: 12, color: theme.accent, cursor: "pointer", padding: "8px 16px", minHeight: 44 }}>
            {"\u2139"} How it works
          </button>
        </div>
      )}
      {games.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Card onClick={() => navigateView(VIEWS.HISTORY)} style={{ flex: 1, textAlign: "center", cursor: "pointer", padding: 16 }}>
            <div style={{ fontFamily: font, fontSize: 22, color: theme.text, fontWeight: 700 }}>{pastGames.length}</div>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 2 }}>Past Games</div>
          </Card>
          <Card onClick={() => navigateView(VIEWS.LEADERBOARD)} style={{ flex: 1, textAlign: "center", cursor: "pointer", padding: 16 }}>
            <div style={{ fontFamily: font, fontSize: 22, color: theme.gold, fontWeight: 700 }}>{leaderboard.length}</div>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 2 }}>Players</div>
          </Card>
        </div>
      )}
      {/* About & Disclaimer */}
      <div style={{ marginTop: 32, textAlign: "center" }}>
        <button onClick={() => setShowAbout(!showAbout)}
          style={{ background: "none", border: "none", fontFamily: font, fontSize: 11, color: theme.textDim, cursor: "pointer", padding: "8px 16px", minHeight: 44, letterSpacing: "0.02em" }}>
          {showAbout ? "\u25B2" : "\u2660"} About & Disclaimer
        </button>
        {showAbout && (
          <div style={{ marginTop: 8, padding: 16, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, textAlign: "left", animation: "fadeIn 0.2s ease" }}>
            <div style={{ fontFamily: displayFont, fontSize: 15, color: theme.text, marginBottom: 10, fontWeight: 600 }}>{"\u2660\u2665\u2666\u2663"} Home Game</div>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, lineHeight: 1.8, marginBottom: 12 }}>
              Home Game is a tracking tool for friendly poker games. It does not facilitate gambling, process payments, or handle real money. Users are responsible for ensuring compliance with local laws regarding poker home games.
            </div>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, lineHeight: 1.8, marginBottom: 12 }}>
              All data is stored locally on your device using your browser's storage. No personal information is collected, transmitted, or accessible by anyone else. No cookies, analytics, or third-party tracking.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <a href="https://homegame-eight.vercel.app/privacy.html" target="_blank" rel="noopener noreferrer" style={{ fontFamily: font, fontSize: 11, color: theme.accent, textDecoration: "none", borderBottom: `1px dashed ${theme.accent}40`, padding: "4px 0" }}>Privacy Policy</a>
              <span style={{ color: theme.textDim, fontSize: 11 }}>{"\u2022"}</span>
              <a href="mailto:GreenfieldStudio@pm.me" style={{ fontFamily: font, fontSize: 11, color: theme.accent, textDecoration: "none", borderBottom: `1px dashed ${theme.accent}40`, padding: "4px 0" }}>Contact</a>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Button onClick={exportData} variant="secondary" style={{ fontSize: 11, padding: "8px 14px" }}>{"\u2913"} Export Backup</Button>
              <label style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 8, fontSize: 11, fontFamily: font, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, cursor: "pointer", minHeight: 44, letterSpacing: "0.02em" }}>
                {"\u2912"} Import Backup
                <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim, opacity: 0.6 }}>v1.9 {"\u2022"} Built by Greenfield Studio</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderNewGame = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <h2 style={{ fontFamily: displayFont, fontSize: 24, color: theme.text, marginBottom: 24 }}>New Game</h2>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Game Name</label>
          <Input value={newGame.name} onChange={v => setNewGame(p => ({ ...p, name: v }))} placeholder="Friday Night Poker" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Game Type</label>
            <select value={newGame.gameType} onChange={e => setNewGame(p => ({ ...p, gameType: e.target.value }))} style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 14, fontFamily: font, width: "100%", boxSizing: "border-box", outline: "none", minHeight: 44 }}>
              <option>NL Hold'em</option><option>PLO</option><option>PLO5</option><option>Mixed</option><option>Dealer's Choice</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Stakes</label>
            <Input value={newGame.stakes} onChange={v => setNewGame(p => ({ ...p, stakes: v }))} placeholder="$0.50/$1" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button onClick={startGame} disabled={!newGame.name.trim()} style={{ flex: 1 }}>{"\u2660"} Start Game</Button>
          <Button onClick={() => navigateView(VIEWS.HOME)} variant="ghost">Cancel</Button>
        </div>
      </div>
    </div>
  );

  const renderActiveGame = () => {
    // Show settlement for a game that was just ended
    if (showSettlement && settledGameId) {
      const settledGame = games.find(g => g.id === settledGameId);
      if (settledGame) return <SettlementView game={settledGame} />;
    }
    if (!activeGame) return null;
    if (showSettlement) return <SettlementView game={activeGame} />;

    return (
      <div style={{ animation: "fadeIn 0.3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontFamily: displayFont, fontSize: 22, color: theme.text, margin: 0 }}>{activeGame.name}</h2>
              <Chip color={theme.green} small>LIVE</Chip>
            </div>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim }}>{activeGame.gameType} {"\u2022"} {activeGame.stakes} {"\u2022"} {activeGame.date}</div>
          </div>
          {/* Phase 4: Session timer */}
          {activeGame.startedAt && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: font, fontSize: 20, fontWeight: 700, color: theme.accent, letterSpacing: "-0.02em" }}>{formatElapsed(elapsedTime)}</div>
              <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Elapsed</div>
            </div>
          )}
        </div>

        {/* Stats bar with running chip count */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 20 }}>
          <Card style={{ padding: 10, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 16, color: theme.text, fontWeight: 700 }}>{activeGame.players.length}</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Players</div>
          </Card>
          <Card style={{ padding: 10, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 16, color: theme.green, fontWeight: 700 }}>${totalInPlay.toFixed(2)}</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total In</div>
          </Card>
          <Card style={{ padding: 10, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 16, color: theme.gold, fontWeight: 700 }}>${totalCashedOut.toFixed(2)}</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Out</div>
          </Card>
          <Card style={{ padding: 10, textAlign: "center", borderColor: totalCashedOut > 0 && Math.abs(totalCashedOut - totalInPlay) > 0.01 ? `${theme.red}30` : theme.border }}>
            <div style={{ fontFamily: font, fontSize: 16, fontWeight: 700, color: totalCashedOut === 0 ? theme.textDim : Math.abs(totalCashedOut - totalInPlay) < 0.01 ? theme.green : theme.red }}>
              {totalCashedOut === 0 ? "\u2014" : formatMoney(totalCashedOut - totalInPlay)}
            </div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Diff</div>
          </Card>
        </div>

        {/* Add player with autocomplete */}
        <Card style={{ marginBottom: 16, padding: 14 }}>
          <div style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Add Player</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 2, position: "relative" }} ref={autocompleteRef}>
              <Input value={newPlayerName} onChange={(v) => { setNewPlayerName(v); setShowAutocomplete(true); setDuplicateWarning(null); }} placeholder="Player name" style={{ width: "100%" }}
                onKeyDown={e => { if (e.key === "Enter") addPlayer(); if (e.key === "Escape") setShowAutocomplete(false); }}
                onFocusCapture={() => { if (allPastPlayerNames.length > 0) setShowAutocomplete(true); }}
              />
              {showAutocomplete && autocompleteSuggestions.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: theme.surface, border: `1px solid ${theme.borderLight}`, borderRadius: 8, maxHeight: 160, overflowY: "auto", zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                  {autocompleteSuggestions.map(name => {
                    const isInGame = activeGame?.players.some(p => p.name.toLowerCase() === name.toLowerCase());
                    return (
                      <div key={name} onMouseDown={(e) => { e.preventDefault(); if (!isInGame) { setNewPlayerName(name); setShowAutocomplete(false); } }}
                        style={{ padding: "10px 12px", fontFamily: font, fontSize: 13, color: isInGame ? theme.textDim : theme.text, cursor: isInGame ? "not-allowed" : "pointer", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: isInGame ? 0.5 : 1, transition: "background 0.1s", minHeight: 44 }}
                        onMouseEnter={e => { if (!isInGame) e.currentTarget.style.background = theme.surfaceHover; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                        <span>{name}</span>
                        {isInGame && <span style={{ fontSize: 10, color: theme.textDim }}>already in game</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <Input value={buyInAmount} onChange={setBuyInAmount} placeholder="Buy-in" type="number" style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && addPlayer()} />
            <Button onClick={addPlayer} disabled={!newPlayerName.trim()} style={{ whiteSpace: "nowrap" }}>+ Add</Button>
          </div>
        </Card>

        {/* Player list */}
        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          {activeGame.players.map(p => {
            const profit = p.cashOut !== null ? (p.cashOut - p.totalBuyIn) : null;
            return (
              <Card key={p.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: "50%", background: p.cashOut !== null ? `${theme.textDim}30` : theme.greenGlow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, fontSize: 14, fontWeight: 700, color: p.cashOut !== null ? theme.textDim : theme.green, border: `1px solid ${p.cashOut !== null ? theme.textDim + "30" : theme.green + "40"}`, flexShrink: 0 }}>
                      {p.name[0].toUpperCase()}
                    </span>
                    <div>
                      <div onClick={() => { if (pastGames.some(g => g.players.some(pl => pl.name === p.name))) navigateToPlayer(p.name); }} style={{ fontFamily: font, fontSize: 14, color: theme.text, fontWeight: 600, cursor: pastGames.some(g => g.players.some(pl => pl.name === p.name)) ? "pointer" : "default", borderBottom: pastGames.some(g => g.players.some(pl => pl.name === p.name)) ? `1px dashed ${theme.textDim}40` : "none", display: "inline" }}>{p.name}</div>
                      <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
                        <span>Buy-ins: </span>
                        {p.buyIns.map((b, idx) => (
                          <span key={idx} style={{ display: "inline-flex", alignItems: "center" }}>
                            {idx > 0 && <span> + </span>}
                            <span onClick={(e) => { e.stopPropagation(); if (p.cashOut === null) openEditBuyIn(p.id, idx, b); }}
                              style={{ cursor: p.cashOut === null ? "pointer" : "default", borderBottom: p.cashOut === null ? `1px dashed ${theme.textDim}` : "none", transition: "color 0.2s" }}
                              onMouseEnter={e => { if (p.cashOut === null) e.target.style.color = theme.green; }}
                              onMouseLeave={e => { e.target.style.color = theme.textDim; }}
                              title={p.cashOut === null ? "Click to edit" : ""}>
                              ${b.toFixed(2)}
                            </span>
                            {idx > 0 && p.cashOut === null && (
                              <span onClick={(e) => { e.stopPropagation(); removeRebuy(p.id, idx); }}
                                style={{ cursor: "pointer", color: theme.red, fontSize: 9, marginLeft: 2, opacity: 0.6, transition: "opacity 0.2s", lineHeight: 1 }}
                                onMouseEnter={e => { e.target.style.opacity = "1"; }}
                                onMouseLeave={e => { e.target.style.opacity = "0.6"; }}
                                title="Remove this rebuy">{"\u2715"}</span>
                            )}
                          </span>
                        ))}
                        <span> = ${p.totalBuyIn.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  {profit !== null && (
                    <span style={{ fontFamily: font, fontSize: 16, fontWeight: 700, color: profit > 0 ? theme.green : profit < 0 ? theme.red : theme.textMuted }}>{formatMoney(profit)}</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.cashOut === null && (
                    <>
                      <Button onClick={() => quickRebuy(p.id)} variant="secondary" style={{ fontSize: 11, padding: "8px 14px" }}>{"\u21BB"} Rebuy ${p.buyIns[p.buyIns.length - 1].toFixed(2)}</Button>
                      <Button onClick={() => addRebuy(p.id, Math.min(Math.max(parseFloat(buyInAmount) || 100, 0.01), 99999))} variant="secondary" style={{ fontSize: 11, padding: "8px 14px" }}>+ ${Math.min(Math.max(parseFloat(buyInAmount) || 100, 0.01), 99999)}</Button>
                      <Button onClick={() => { setCalcModal({ playerId: p.id, playerName: p.name }); setCalcValue("0"); }} variant="secondary" style={{ fontSize: 11, padding: "8px 14px", borderColor: `${theme.gold}40`, color: theme.gold }}>Cash Out</Button>
                      <Button onClick={() => removePlayer(p.id, p.name)} variant="ghost" style={{ fontSize: 11, padding: "8px 12px", color: theme.red, marginLeft: "auto" }}>{"\u2715"}</Button>
                    </>
                  )}
                  {p.cashOut !== null && (
                    <>
                      <Chip color={theme.textDim} small>Cashed out: ${p.cashOut.toFixed(2)}</Chip>
                      <Button onClick={(e) => { e.stopPropagation(); setCalcModal({ playerId: p.id, playerName: p.name }); setCalcValue(String(p.cashOut)); }} variant="secondary" style={{ fontSize: 11, padding: "8px 14px" }}>Edit</Button>
                      <Button onClick={(e) => { e.stopPropagation(); undoCashOut(p.id); }} variant="secondary" style={{ fontSize: 11, padding: "8px 14px", borderColor: `${theme.red}30`, color: theme.red }}>Undo</Button>
                    </>
                  )}
                </div>

              </Card>
            );
          })}
        </div>

        {/* Phase 4: Session notes */}
        <Card style={{ marginBottom: 16, padding: 14 }}>
          <div onClick={() => setShowNotes(!showNotes)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", minHeight: 44, paddingTop: 4, paddingBottom: 4 }}>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{"\u270E"} Session Notes</div>
            <span style={{ fontFamily: font, fontSize: 11, color: theme.textDim }}>{showNotes ? "\u25B2" : "\u25BC"} {sessionNotes ? `(${sessionNotes.length} chars)` : "(empty)"}</span>
          </div>
          {showNotes && (
            <textarea value={sessionNotes} onChange={e => saveSessionNotes(e.target.value)} placeholder="Add notes about this session... (bad beats, rule changes, memorable hands)"
              style={{ marginTop: 10, width: "100%", minHeight: 80, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 14px", color: theme.text, fontSize: 13, fontFamily: font, outline: "none", resize: "vertical", boxSizing: "border-box", transition: "border-color 0.2s", lineHeight: 1.5 }}
              onFocus={e => e.target.style.borderColor = theme.green}
              onBlur={e => e.target.style.borderColor = theme.border}
            />
          )}
        </Card>

        {activeGame.players.length > 0 && (
          <Button onClick={endGame} disabled={!allCashedOut} variant={allCashedOut ? "primary" : "secondary"} style={{ width: "100%" }}>
            {allCashedOut ? `${"\u2666"} End Game & Settle Up` : `Waiting for ${activeGame.players.filter(p => p.cashOut === null).length} player(s) to cash out`}
          </Button>
        )}

        {allCashedOut && Math.abs(totalCashedOut - totalInPlay) > 0.01 && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: `${theme.red}10`, border: `1px solid ${theme.red}30`, fontFamily: font, fontSize: 12, color: theme.red, textAlign: "center" }}>
            {"\u26A0"} Chip count mismatch: ${totalInPlay.toFixed(2)} in {"\u2192"} ${totalCashedOut.toFixed(2)} out (diff: {formatMoney(totalCashedOut - totalInPlay)})
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => {
    if (selectedHistoryGame) {
      const game = pastGames.find(g => g.id === selectedHistoryGame);
      if (game) return (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Button onClick={() => setSelectedHistoryGame(null)} variant="ghost" style={{ padding: "6px 0" }}>{"\u2190"} Back to History</Button>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => openEditGame(game)} variant="secondary" style={{ fontSize: 11, padding: "8px 14px" }}>{"\u270E"} Edit</Button>
              <Button onClick={() => deleteGame(game.id, game.name)} variant="danger" style={{ fontSize: 11, padding: "8px 14px" }}>Delete</Button>
            </div>
          </div>
          <SettlementView game={game} />
        </div>
      );
    }
    return (
      <div style={{ animation: "fadeIn 0.3s ease" }}>
        <h2 style={{ fontFamily: displayFont, fontSize: 24, color: theme.text, marginBottom: 20 }}>Game History</h2>
        {pastGames.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>{"\u2660"}</div>
            <div style={{ fontFamily: font, fontSize: 13, color: theme.textDim }}>No completed games yet.</div>
            <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim, marginTop: 4 }}>Complete your first session and it will appear here.</div>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {[...pastGames].reverse().map(g => {
              const bigWinner = [...g.players].sort((a, b) => ((b.cashOut ?? 0) - b.totalBuyIn) - ((a.cashOut ?? 0) - a.totalBuyIn))[0];
              const bigProfit = (bigWinner?.cashOut ?? 0) - (bigWinner?.totalBuyIn ?? 0);
              return (
                <Card key={g.id} onClick={() => setSelectedHistoryGame(g.id)} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: displayFont, fontSize: 16, color: theme.text }}>{g.name}</div>
                      <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 2 }}>{g.date} {"\u2022"} {g.gameType} {g.stakes} {"\u2022"} {g.players.length} players</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: font, fontSize: 14, color: bigProfit > 0 ? theme.green : bigProfit < 0 ? theme.red : theme.textMuted, fontWeight: 700 }}>{bigWinner?.name} {formatMoney(bigProfit)}</div>
                      <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim }}>biggest winner</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderLeaderboard = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <h2 style={{ fontFamily: displayFont, fontSize: 24, color: theme.text, marginBottom: 6 }}>Leaderboard</h2>
      <p style={{ fontFamily: font, fontSize: 12, color: theme.textDim, marginBottom: 20 }}>Lifetime stats across {pastGames.length} game{pastGames.length !== 1 ? "s" : ""}</p>
      {/* Phase 5: Sort controls */}
      {leaderboard.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[{ key: "profit", label: "Profit" }, { key: "roi", label: "ROI" }, { key: "sessions", label: "Sessions" }, { key: "winRate", label: "Win %" }].map(opt => (
            <button key={opt.key} onClick={() => setLeaderboardSort(opt.key)}
              style={{ padding: "8px 14px", borderRadius: 20, border: `1px solid ${leaderboardSort === opt.key ? theme.green + "60" : theme.border}`, background: leaderboardSort === opt.key ? `${theme.green}15` : "transparent", color: leaderboardSort === opt.key ? theme.green : theme.textMuted, fontFamily: font, fontSize: 11, fontWeight: leaderboardSort === opt.key ? 700 : 400, cursor: "pointer", transition: "all 0.2s", minHeight: 44, letterSpacing: "0.02em" }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {leaderboard.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>{"\u2605"}</div>
          <div style={{ fontFamily: font, fontSize: 13, color: theme.textDim }}>No stats yet.</div>
          <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim, marginTop: 4 }}>Complete a game to see the leaderboard.</div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((p, i) => {
            const roi = p.totalBuyIn > 0 ? ((p.totalProfit / p.totalBuyIn) * 100).toFixed(1) : "0";
            const winRate = p.sessions > 0 ? ((p.wins / p.sessions) * 100).toFixed(0) : "0";
            const medal = i === 0 ? "\uD83E\uDD47" : i === 1 ? "\uD83E\uDD48" : i === 2 ? "\uD83E\uDD49" : `#${i + 1}`;
            const primaryMetric = leaderboardSort === "roi" ? `${roi}% ROI` :
              leaderboardSort === "sessions" ? `${p.sessions} session${p.sessions !== 1 ? "s" : ""}` :
              leaderboardSort === "winRate" ? `${winRate}% win rate` :
              formatMoney(p.totalProfit);
            const primaryColor = leaderboardSort === "profit" ? (p.totalProfit > 0 ? theme.green : p.totalProfit < 0 ? theme.red : theme.textMuted) :
              leaderboardSort === "roi" ? (parseFloat(roi) > 0 ? theme.green : parseFloat(roi) < 0 ? theme.red : theme.textMuted) :
              theme.accent;
            return (
              <Card key={p.name} onClick={() => navigateToPlayer(p.name)} style={{ padding: 16, cursor: "pointer", borderColor: i === 0 ? `${theme.gold}40` : theme.border, background: i === 0 ? `${theme.gold}06` : theme.surface }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: i < 3 ? 20 : 14, fontFamily: font, color: theme.textDim, width: 32, textAlign: "center" }}>{medal}</span>
                    <div>
                      <div style={{ fontFamily: font, fontSize: 15, color: theme.text, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontFamily: font, fontSize: 11, color: theme.textDim, marginTop: 2 }}>{p.sessions} session{p.sessions !== 1 ? "s" : ""} {"\u2022"} {p.wins}W-{p.sessions - p.wins}L {"\u2022"} {roi}% ROI</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: primaryColor }}>{primaryMetric}</div>
                    <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim }}>{leaderboardSort === "profit" ? `$${p.totalBuyIn.toFixed(2)} invested` : formatMoney(p.totalProfit)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPlayerProfile = () => {
    if (!playerProfile) return null;
    const pp = playerProfile;
    const streakText = pp.currentStreak > 0 ? `${pp.currentStreak}W streak` : pp.currentStreak < 0 ? `${Math.abs(pp.currentStreak)}L streak` : "\u2014";
    const streakColor = pp.currentStreak > 0 ? theme.green : pp.currentStreak < 0 ? theme.red : theme.textDim;

    // Simple SVG sparkline for profit over time
    const SparklineChart = () => {
      if (pp.chartData.length < 2) return <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim, textAlign: "center", padding: 20 }}>Need at least 2 sessions for chart</div>;
      const width = 460, height = 160, padX = 40, padY = 20;
      const values = pp.chartData.map(d => d.cumulative);
      const minVal = Math.min(0, ...values);
      const maxVal = Math.max(0, ...values);
      const range = maxVal - minVal || 1;
      const toX = (i) => padX + (i / (values.length - 1)) * (width - padX * 2);
      const toY = (v) => padY + (1 - (v - minVal) / range) * (height - padY * 2);
      const zeroY = toY(0);

      // Build path
      let pathD = `M ${toX(0)} ${toY(values[0])}`;
      for (let i = 1; i < values.length; i++) pathD += ` L ${toX(i)} ${toY(values[i])}`;

      // Fill area under curve
      let areaD = pathD + ` L ${toX(values.length - 1)} ${zeroY} L ${toX(0)} ${zeroY} Z`;

      const gradId = `sparkGrad-${pp.name.replace(/\W/g, '')}`;
      const lastVal = values[values.length - 1];
      const lineColor = lastVal >= 0 ? theme.green : theme.red;

      return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* Zero line */}
          <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} stroke={theme.border} strokeWidth="1" strokeDasharray="4 4" />
          <text x={padX - 6} y={zeroY + 3} fill={theme.textDim} fontSize="9" fontFamily={font} textAnchor="end">$0</text>
          {/* Area fill */}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#${gradId})`} />
          {/* Line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Dots */}
          {values.map((v, i) => (
            <g key={i}>
              <circle cx={toX(i)} cy={toY(v)} r="4" fill={theme.bg} stroke={lineColor} strokeWidth="2" />
              <text x={toX(i)} y={height - 2} fill={theme.textDim} fontSize="7" fontFamily={font} textAnchor="middle">
                {pp.chartData[i].date.slice(5)}
              </text>
            </g>
          ))}
          {/* End label */}
          <text x={toX(values.length - 1) + 6} y={toY(lastVal) + 4} fill={lineColor} fontSize="10" fontFamily={font} fontWeight="700">
            {formatMoney(lastVal)}
          </text>
          {/* Max label */}
          {maxVal > 0 && <text x={padX - 6} y={toY(maxVal) + 3} fill={theme.green} fontSize="8" fontFamily={font} textAnchor="end">{formatMoney(maxVal)}</text>}
          {minVal < 0 && <text x={padX - 6} y={toY(minVal) + 3} fill={theme.red} fontSize="8" fontFamily={font} textAnchor="end">{formatMoney(minVal)}</text>}
        </svg>
      );
    };

    // Head-to-head detail
    const h2hSessions = h2hOpponent ? pastGames
      .filter(g => g.players.some(p => p.name === selectedPlayerName) && g.players.some(p => p.name === h2hOpponent))
      .map(g => {
        const me = g.players.find(p => p.name === selectedPlayerName);
        const them = g.players.find(p => p.name === h2hOpponent);
        return { date: g.date, gameName: g.name, myProfit: (me.cashOut ?? 0) - me.totalBuyIn, theirProfit: (them.cashOut ?? 0) - them.totalBuyIn };
      })
      .sort((a, b) => b.date.localeCompare(a.date)) : [];

    return (
      <div style={{ animation: "fadeIn 0.3s ease" }}>
        {/* Back button */}
        <Button onClick={() => { setSelectedPlayerName(null); navigateView(profileReturnView); }} variant="ghost" style={{ padding: "6px 0", marginBottom: 16 }}>{"\u2190"} Back</Button>

        {/* Player header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: pp.totalProfit >= 0 ? theme.greenGlow : `${theme.red}15`, border: `2px solid ${pp.totalProfit >= 0 ? theme.green : theme.red}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontFamily: font, fontSize: 28, fontWeight: 700, color: pp.totalProfit >= 0 ? theme.green : theme.red }}>
            {pp.name[0].toUpperCase()}
          </div>
          <h2 style={{ fontFamily: displayFont, fontSize: 26, color: theme.text, margin: "0 0 4px" }}>{pp.name}</h2>
          <div style={{ fontFamily: font, fontSize: 12, color: theme.textDim }}>{pp.sessions.length} session{pp.sessions.length !== 1 ? "s" : ""} played</div>
        </div>

        {/* Key stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 20, fontWeight: 700, color: pp.totalProfit >= 0 ? theme.green : theme.red }}>{formatMoney(pp.totalProfit)}</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Lifetime P/L</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 20, fontWeight: 700, color: theme.text }}>{pp.wins}W-{pp.losses}L</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Record</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 20, fontWeight: 700, color: pp.roi >= 0 ? theme.green : theme.red }}>{pp.roi.toFixed(1)}%</div>
            <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>ROI</div>
          </Card>
        </div>

        {/* Secondary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
          {[
            { label: "Avg P/L", value: formatMoney(pp.avgProfit), color: pp.avgProfit >= 0 ? theme.green : theme.red },
            { label: "Best Win", value: pp.biggestWin > 0 ? formatMoney(pp.biggestWin) : "\u2014", color: theme.green },
            { label: "Worst Loss", value: pp.biggestLoss < 0 ? formatMoney(pp.biggestLoss) : "\u2014", color: theme.red },
            { label: "Streak", value: streakText, color: streakColor },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "8px 4px" }}>
              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontFamily: font, fontSize: 8, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Profit over time chart */}
        <Card style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{"\u2660"} Profit Over Time</div>
          {SparklineChart()}
        </Card>

        {/* Session-by-session breakdown */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{"\u2663"} Session History</div>
          <div style={{ display: "grid", gap: 6 }}>
            {[...pp.sessions].reverse().map((s, i) => (
              <Card key={i} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: font, fontSize: 13, color: theme.text, fontWeight: 500 }}>{s.gameName}</div>
                  <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim, marginTop: 2 }}>{s.date} {"\u2022"} {s.gameType} {s.stakes} {"\u2022"} In: ${s.buyIn.toFixed(2)} {"\u2192"} Out: ${s.cashOut.toFixed(2)}</div>
                </div>
                <span style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: s.profit > 0 ? theme.green : s.profit < 0 ? theme.red : theme.textMuted, whiteSpace: "nowrap" }}>{formatMoney(s.profit)}</span>
              </Card>
            ))}
          </div>
        </div>

        {/* Head-to-head section */}
        {pp.opponents.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: font, fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{"\u2665"} Head-to-Head</div>

            {/* Opponent list */}
            <div style={{ display: "grid", gap: 6 }}>
              {pp.opponents.map(opp => {
                const isSelected = h2hOpponent === opp.name;
                return (
                  <div key={opp.name}>
                    <Card onClick={() => setH2hOpponent(isSelected ? null : opp.name)}
                      style={{ padding: 12, cursor: "pointer", borderColor: isSelected ? `${theme.accent}40` : theme.border, background: isSelected ? `${theme.accent}08` : theme.surface }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 28, height: 28, borderRadius: "50%", background: theme.greenGlow, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, fontSize: 12, fontWeight: 700, color: theme.green, border: `1px solid ${theme.green}30` }}>{opp.name[0].toUpperCase()}</span>
                          <div>
                            <div style={{ fontFamily: font, fontSize: 13, color: theme.text, fontWeight: 600 }}>{opp.name}</div>
                            <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim }}>{opp.gamesPlayed} game{opp.gamesPlayed !== 1 ? "s" : ""} together</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: font, fontSize: 14, fontWeight: 700, color: opp.myWins > opp.theirWins ? theme.green : opp.theirWins > opp.myWins ? theme.red : theme.textMuted }}>
                            {opp.myWins}W-{opp.theirWins}L{opp.gamesPlayed - opp.myWins - opp.theirWins > 0 ? `-${opp.gamesPlayed - opp.myWins - opp.theirWins}T` : ""}
                          </div>
                          <div style={{ fontFamily: font, fontSize: 10, color: theme.textDim }}>{isSelected ? "tap to close" : "tap to expand"}</div>
                        </div>
                      </div>
                    </Card>

                    {/* Expanded H2H detail */}
                    {isSelected && h2hSessions.length > 0 && (
                      <div style={{ marginTop: 4, marginLeft: 16, borderLeft: `2px solid ${theme.accent}30`, paddingLeft: 12, display: "grid", gap: 4, animation: "fadeIn 0.2s ease" }}>
                        {h2hSessions.map((s, si) => (
                          <div key={si} style={{ padding: "8px 10px", background: theme.bg, borderRadius: 6, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontFamily: font, fontSize: 11, color: theme.text }}>{s.gameName}</div>
                              <div style={{ fontFamily: font, fontSize: 9, color: theme.textDim }}>{s.date}</div>
                            </div>
                            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: s.myProfit > s.theirProfit ? theme.green : s.myProfit < s.theirProfit ? theme.red : theme.textMuted }}>{formatMoney(s.myProfit)}</div>
                                <div style={{ fontFamily: font, fontSize: 8, color: theme.textDim }}>You</div>
                              </div>
                              <span style={{ fontFamily: font, fontSize: 9, color: theme.textDim }}>vs</span>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: s.theirProfit > s.myProfit ? theme.green : s.theirProfit < s.myProfit ? theme.red : theme.textMuted }}>{formatMoney(s.theirProfit)}</div>
                                <div style={{ fontFamily: font, fontSize: 8, color: theme.textDim }}>{h2hOpponent}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: "20px", paddingBottom: "env(safe-area-inset-bottom, 20px)", maxWidth: 520, margin: "0 auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { -webkit-text-size-adjust: 100%; }
        ::selection { background: ${theme.green}40; }
        input::placeholder { color: ${theme.textDim}; }
        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .hg-input:focus { border-color: ${theme.green} !important; }
        select option { background: ${theme.bg}; color: ${theme.text}; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${theme.bg}; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
        button:active:not([data-calc]) { transform: scale(0.97); }
        .hg-card-clickable:hover { border-color: ${theme.borderLight} !important; filter: brightness(1.1); }
      `}</style>
      {SaveIndicator()}
      {Nav()}
      <div style={{ opacity: isTransitioning ? 0 : 1, transform: isTransitioning ? "translateY(4px)" : "translateY(0)", transition: "opacity 0.1s ease, transform 0.1s ease" }}>
      {view === VIEWS.HOME && renderHome()}
      {view === VIEWS.NEW_GAME && renderNewGame()}
      {view === VIEWS.ACTIVE && renderActiveGame()}
      {view === VIEWS.HISTORY && renderHistory()}
      {view === VIEWS.LEADERBOARD && renderLeaderboard()}
      {view === VIEWS.PLAYER_PROFILE && renderPlayerProfile()}
      </div>
      {Toast()}
      {ConfirmDialog()}
      {EditBuyInModal()}
      {EditGameModal()}
      {CalcModal()}
      {OnboardingOverlay()}
    </div>
  );
}
