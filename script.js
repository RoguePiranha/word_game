/** === CONFIG === */
const WORKER_BASE = "wordguess-sync.super-glade-bb1d.workers.dev";
const DAILY_CAP_ENABLED = false; // placeholder
const DAILY_CAP_LIMIT = 5; // Not used unless the above is true

// Attempts per word length & difficulty
const ATTEMPTS = {
    4: { base: 6, hard: 5, expert: 4, impossible: 3 },
    5: { base: 6, hard: 5, expert: 4, impossible: 3 },
    6: { base: 7, hard: 6, expert: 5, impossible: 4 },
    7: { base: 8, hard: 7, expert: 6, impossible: 5 },
    8: { base: 8, hard: 6, expert: 5, impossible: 4 },
};

/** === State === */
let wordLen = 5;
let difficulty = "base";
let maxRows = ATTEMPTS[wordLen][difficulty];
let target = "";
let row = 0,
    col = 0,
    grid = [],
    hardMode = false,
    kbState = {},
    currentGameHints = 0;
let completedGuesses = []; // Track guesses for daily word restoration
let isDailyWord = false; // Flag to indicate if current game is daily word
let WORDS = {}; // loaded lists per length
let VALID = {}; // same as WORDS by default

// New game mode state
let gameMode = "standard"; // standard, timed, scored, multiplayer
let timerInterval = null;
let startTime = null;
let timeLimit = 300; // 5 minutes default
let timeRemaining = timeLimit;
let selectedMode = null;
let selectedLength = null;
let selectedDifficulty = null;

// Helper functions to get DOM elements (called when needed)
const getBoard = () => document.getElementById("board");
const getStatus = () => document.getElementById("status");

/** === Identity === */
const userId = (() => {
    const k = "wg-user-id";
    let v = localStorage.getItem(k);
    if (!v) {
        v = crypto.getRandomValues(new Uint32Array(4)).join("-");
        localStorage.setItem(k, v);
    }
    return v;
})();

/** === Async loader for word lists (4–8) === */
const wordCache = {};
async function loadWords(len) {
    if (wordCache[len]) return wordCache[len];

    // Try these in order; first one that loads wins
    const candidates = [`words/words-${len}.json`, `words/words-clean-${len}.json`, `words/words-base-${len}.json`];

    let arr = [];
    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res.ok) {
                arr = await res.json();
                break;
            }
        } catch (_) { }
    }

    if (!arr.length) {
        setStatus(`Couldn't load any word list for ${len}. Place one in ./words/`);
        return [];
    }

    // normalize
    const list = arr.map((w) => String(w).toLowerCase());
    wordCache[len] = list;
    return list;
}

/** === Seen/History (local) === */
function loadSeen(len) {
    try {
        return JSON.parse(localStorage.getItem(`wg-seen-${len}`)) || { seen: [], max: 500 };
    } catch {
        return { seen: [], max: 500 };
    }
}
function saveSeen(len, obj) {
    localStorage.setItem(`wg-seen-${len}`, JSON.stringify(obj));
}
function clearSeen(len) {
    const cur = loadSeen(len);
    saveSeen(len, { seen: [], max: cur.max });
}
function getSeenCount(len) {
    return loadSeen(len).seen.length;
}
function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem("wg-history")) || [];
    } catch {
        return [];
    }
}
function saveHistory(h) {
    localStorage.setItem("wg-history", JSON.stringify(h));
}
function loadHintsUsed() {
    try {
        return parseInt(localStorage.getItem("wg-hints-used")) || 0;
    } catch {
        return 0;
    }
}
function saveHintsUsed(count) {
    localStorage.setItem("wg-hints-used", count.toString());
}
function incrementHintsUsed() {
    const current = loadHintsUsed();
    saveHintsUsed(current + 1);
    return current + 1;
}

/** === Theme === */
function loadTheme() {
    try {
        return localStorage.getItem("wg-theme") || "dark";
    } catch {
        return "dark";
    }
}
function saveTheme(theme) {
    localStorage.setItem("wg-theme", theme);
}
function applyTheme(theme) {
    const root = document.documentElement;
    const lightBtn = document.getElementById("lightBtn");
    const darkBtn = document.getElementById("darkBtn");

    if (theme === "light") {
        root.classList.add("light-theme");
        if (lightBtn) {
            lightBtn.setAttribute("aria-pressed", "true");
            lightBtn.classList.add("active");
        }
        if (darkBtn) {
            darkBtn.setAttribute("aria-pressed", "false");
            darkBtn.classList.remove("active");
        }
    } else {
        root.classList.remove("light-theme");
        if (lightBtn) {
            lightBtn.setAttribute("aria-pressed", "false");
            lightBtn.classList.remove("active");
        }
        if (darkBtn) {
            darkBtn.setAttribute("aria-pressed", "true");
            darkBtn.classList.add("active");
        }
    }

    // Update meta theme-color for mobile browsers
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = theme === "light" ? "#ffffff" : "#1a1a1a";
    }
}

/** === Mountain Time Utility === */
function getMountainTimeInfo() {
    const now = new Date();
    const year = now.getUTCFullYear();

    // DST in US: Second Sunday in March to First Sunday in November
    const dstStart = new Date(Date.UTC(year, 2, 1));
    dstStart.setUTCDate(1 + (7 - dstStart.getUTCDay() + 7) % 7 + 7);
    dstStart.setUTCHours(9);

    const dstEnd = new Date(Date.UTC(year, 10, 1));
    dstEnd.setUTCDate(1 + (7 - dstEnd.getUTCDay()) % 7);
    dstEnd.setUTCHours(8);

    const inDST = now >= dstStart && now < dstEnd;
    const mountainOffset = inDST ? -6 : -7;
    const mountainTime = new Date(now.getTime() + mountainOffset * 3600000);
    const dateKey = `${mountainTime.getUTCFullYear()}-${mountainTime.getUTCMonth() + 1}-${mountainTime.getUTCDate()}`;

    return { mountainTime, dateKey, mountainOffset, inDST };
}

function setTheme(theme) {
    // Enable transitions only when user actively changes theme
    document.body.classList.add('transitions-enabled');

    // Add theme-transitioning class for slow transitions on interactive elements
    document.body.classList.add('theme-transitioning');

    saveTheme(theme);
    applyTheme(theme);
    setStatus(`Switched to ${theme} mode`);

    // Remove theme-transitioning after theme change completes (2.5s desktop, 1.5s mobile)
    const transitionDuration = window.innerWidth <= 768 ? 1500 : 2500;
    setTimeout(() => {
        document.body.classList.remove('theme-transitioning');
    }, transitionDuration);
}

function toggleTheme() {
    const currentTheme = loadTheme();
    const newTheme = currentTheme === "light" ? "dark" : "light";
    setTheme(newTheme);
}

/** === Sync (KV Worker) === */
async function serverGet() {
    const r = await fetch(`${WORKER_BASE}/sync`, { headers: { "X-WordGuess-User": userId } });
    if (!r.ok) throw new Error("sync GET failed");
    return r.json();
}
async function serverPost(payload) {
    const r = await fetch(`${WORKER_BASE}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-WordGuess-User": userId },
        body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error("sync POST failed");
    return r.json();
}
async function syncPull() {
    if (!WORKER_BASE || !WORKER_BASE.startsWith("http")) {
        console.log("[sync] No worker configured, skipping pull");
        return;
    }
    try {
        const remote = await serverGet();
        for (const len of [4, 5, 6, 7, 8]) {
            const local = loadSeen(len);
            const merged = [...(local.seen || []), ...(remote.seenByLen?.[len] || [])];
            const uniq = Array.from(new Set(merged)).slice(-500);
            saveSeen(len, { seen: uniq, max: local.max || 500 });
        }
        // history
        const hist = [...loadHistory(), ...(remote.history || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const keys = new Set(),
            uniq = [];
        for (const h of hist) {
            const k = `${h.word}|${h.len}|${h.ts}`;
            if (!keys.has(k)) {
                keys.add(k);
                uniq.push(h);
            }
        }
        saveHistory(uniq.slice(-5000));
        updateStats(remote.stats || computeStats(uniq));
        setStatus("Synced.");
    } catch (error) {
        console.warn("[sync] Pull failed:", error);
        setStatus("Sync failed (pull). Playing offline.");
    }
}
async function syncPush() {
    if (!WORKER_BASE || !WORKER_BASE.startsWith("http")) {
        console.log("[sync] No worker configured, skipping push");
        return;
    }
    try {
        const seenByLen = {};
        for (const len of [4, 5, 6, 7, 8]) seenByLen[len] = loadSeen(len).seen;
        const server = await serverPost({ seenByLen, history: loadHistory() });
        updateStats(server.stats || {});
    } catch (error) {
        console.warn("[sync] Push failed:", error);
        // Don't show error message for push failures to avoid interrupting gameplay
    }
}

/** === Stats === */
function computeStats(history) {
    if (!history.length) return { total: 0, wins: 0, winRate: 0, currentStreak: 0, maxStreak: 0, totalGuesses: 0, perLen: {} };
    let cur = 0,
        max = 0,
        total = history.length,
        wins = 0,
        totalGuesses = 0;
    for (const h of history) {
        totalGuesses += (h.guesses || 0); // Add number of guesses from each game
        if (h.won) {
            wins++;
            cur++;
            max = Math.max(max, cur);
        } else cur = 0;
    }
    const perLen = {};
    for (const len of [4, 5, 6, 7, 8]) {
        const items = history.filter((h) => h.len === len);
        const w = items.filter((h) => h.won).length;
        perLen[len] = { total: items.length, wins: w, winRate: items.length ? Math.round((100 * w) / items.length) : 0 };
    }
    const hintsUsed = loadHintsUsed();
    return { total, wins, winRate: Math.round((100 * wins) / total), currentStreak: cur, maxStreak: max, totalGuesses, perLen, hintsUsed };
}
function updateStats(stats) {
    const hist = loadHistory();
    const s = stats && stats.total !== undefined ? stats : computeStats(hist);
    document.getElementById("stTotal").textContent = s.total || 0;
    document.getElementById("stWinRate").textContent = (s.winRate || 0) + "%";
    document.getElementById("stCurrent").textContent = s.currentStreak || 0;
    document.getElementById("stMax").textContent = s.maxStreak || 0;
    document.getElementById("stHints").textContent = s.hintsUsed || 0;

    // Update per-length stats with win rate and games played
    for (const len of [4, 5, 6, 7, 8]) {
        const lenStats = s.perLen?.[len];
        const winRate = lenStats?.winRate || 0;
        const total = lenStats?.total || 0;
        document.getElementById(`stL${len}`).textContent = `${winRate}% (${total})`;
    }
}

/** === Daily cap placeholder === */
function checkDailyCap() {
    if (!DAILY_CAP_ENABLED) return true;
    const k = "wg-dcap",
        today = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem(k) || "{}");
    if (raw.day !== today) {
        raw.day = today;
        raw.count = 0;
    }
    if (raw.count >= DAILY_CAP_LIMIT) {
        setStatus(`Daily cap reached (${DAILY_CAP_LIMIT}).`);
        return false;
    }
    raw.count++;
    localStorage.setItem(k, JSON.stringify(raw));
    return true;
}

/** === Responsive layout === */
function updateLayout() {
    const wrap = document.querySelector(".wrap");
    const header = document.querySelector("header");
    const rows = maxRows,
        cols = wordLen,
        gap = 8;
    const vw = innerWidth,
        vh = innerHeight,
        wrapRect = wrap.getBoundingClientRect();
    const headerH = header?.getBoundingClientRect().height || 0;
    const diffH = [...document.querySelectorAll(".controls")].slice(1, 3).reduce((h, el) => h + (el?.getBoundingClientRect().height || 0), 0);
    const statsPanel = document.getElementById("statsPanel");
    const statsH = (statsPanel?.open ? statsPanel.getBoundingClientRect().height : 40) || 0;
    const verticalChrome = headerH + diffH + statsH + 80;
    const availH = Math.max(180, vh - verticalChrome);
    const availW = Math.max(220, wrapRect.width - 16);
    const totalGapW = (cols - 1) * gap,
        totalGapH = (rows - 1) * gap;
    const maxTileW = Math.floor((availW - totalGapW) / cols);
    const maxTileH = Math.floor((availH - totalGapH) / rows);
    const tile = Math.max(36, Math.min(96, Math.min(maxTileW, maxTileH)));
    document.documentElement.style.setProperty("--tile", tile + "px");
    const keyW = Math.max(28, Math.min(52, Math.floor(tile * 0.65)));
    document.documentElement.style.setProperty("--key-w", keyW + "px");

    // Show/hide hint button based on word length
    const hintBtn = document.getElementById("hint");
    if (hintBtn) {
        if (wordLen >= 6) {
            hintBtn.classList.remove("btn-hint-hidden");
        } else {
            hintBtn.classList.add("btn-hint-hidden");
        }
    }
}

/** === Board & Input === */
function buildBoard() {
    const board = getBoard();
    board.innerHTML = "";
    board.style.gridTemplateRows = `repeat(${maxRows}, 1fr)`;
    board.style.display = "grid";
    board.style.opacity = "1";
    board.style.visibility = "visible";

    // Hide game over section when building a new board
    hideGameOver();

    for (let r = 0; r < maxRows; r++) {
        const rowEl = document.createElement("div");
        rowEl.className = "row";
        rowEl.style.gridTemplateColumns = `repeat(${wordLen}, 1fr)`;
        rowEl.style.display = "grid";
        rowEl.style.opacity = "1";
        rowEl.style.visibility = "visible";
        for (let c = 0; c < wordLen; c++) {
            const t = document.createElement("div");
            t.className = "tile";
            t.dataset.r = r;
            t.dataset.c = c;
            rowEl.appendChild(t);
        }
        board.appendChild(rowEl);
    }
    grid = Array.from({ length: maxRows }, () => Array(wordLen).fill(""));
    row = 0;
    col = 0;
    kbState = {};
    renderKeyboardHints();
    updateLayout();
}
function buildKeyboard() {
    const wrap = document.querySelector(".wrap");
    let kb = document.getElementById("keyboard");
    if (!kb) {
        kb = document.createElement("div");
        kb.id = "keyboard";
        kb.className = "keyboard";
        wrap.appendChild(kb); // ⬅️ append as LAST child
    } else if (kb.parentElement !== wrap) {
        wrap.appendChild(kb); // ensure it's last
    }

    const rows = ["QWERTYUIOP", "ASDFGHJKL", "⏎ZXCVBNM←"];
    kb.innerHTML = "";
    rows.forEach((r) => {
        const div = document.createElement("div");
        div.className = "kb-row";
        [...r].forEach((ch) => {
            const b = document.createElement("button");
            b.className = "key";
            b.textContent = ch === "⏎" ? "Enter" : ch === "←" ? "←" : ch;
            b.dataset.key = ch;
            b.onclick = () => onPress(ch);
            div.appendChild(b);
        });
        kb.appendChild(div);
    });
}
addEventListener("keydown", (e) => {
    if (e.key === "Enter") return onPress("⏎");
    if (e.key === "Backspace") return onPress("←");
    const k = e.key.toUpperCase();
    if (/^[A-Z]$/.test(k)) onPress(k);
});
function onPress(k) {
    // Don't accept input if game is over (either won or lost)
    if (row >= maxRows) return;

    if (k === "←") {
        if (col > 0) {
            col--;
            setCell(row, col, "");
        }
        return;
    }
    if (k === "⏎") {
        handleEnter();
        return;
    }
    if (/^[A-Z]$/.test(k) && col < wordLen) {
        setCell(row, col, k);
        col++;
    }
}
function setCell(r, c, letter) {
    grid[r][c] = (letter || "").toUpperCase();
    const t = getTile(r, c);
    t.textContent = grid[r][c];
    t.classList.toggle("filled", !!letter);
}
function getTile(r, c) {
    return getBoard().children[r].children[c];
}
function wiggleRow(r) {
    const re = getBoard().children[r];
    re.style.transform = "translateX(4px)";
    setTimeout(() => (re.style.transform = ""), 100);
}
function renderKeyboardHints() {
    document.querySelectorAll(".key").forEach((k) => {
        const ch = k.dataset.key;
        if (!/^[A-Z]$/.test(ch)) return;
        k.classList.remove("ok", "maybe", "no");
        const st = kbState[ch];
        if (st) k.classList.add(st);
    });
}

/** === Game logic === */
function isValid(word) {
    const list = VALID[word.length] || [];
    return list?.includes(word.toLowerCase());
}
function score(guess, answer) {
    // normalize to the same case so comparisons work
    const g = [...guess.toLowerCase()];
    const a = [...answer.toLowerCase()];

    const res = Array(wordLen).fill("no");
    const used = Array(wordLen).fill(false);

    // greens
    for (let i = 0; i < wordLen; i++) {
        if (g[i] === a[i]) {
            res[i] = "ok";
            used[i] = true;
        }
    }
    // yellows
    for (let i = 0; i < wordLen; i++) {
        if (res[i] === "ok") continue;
        const idx = a.findIndex((ch, j) => !used[j] && ch === g[i]);
        if (idx > -1) {
            res[i] = "maybe";
            used[idx] = true;
        }
    }
    return res;
}
function updateKeyboard(guess, res) {
    for (let i = 0; i < guess.length; i++) {
        const ch = guess[i],
            st = res[i],
            prev = kbState[ch];
        if (!prev || (prev === "maybe" && st === "ok") || (prev === "no" && (st === "ok" || st === "maybe"))) kbState[ch] = st;
    }
    renderKeyboardHints();
}
function respectsHardMode(guess) {
    if (!hardMode || row === 0) return true;
    const prevGuess = grid[row - 1].join("");
    const prevRes = score(prevGuess, target);
    for (let i = 0; i < wordLen; i++) {
        if (prevRes[i] === "ok" && guess[i] !== prevGuess[i]) {
            setStatus(`Strict: keep ${prevGuess[i]} at ${i + 1}.`);
            return false;
        }
    }
    const needed = {};
    for (let i = 0; i < wordLen; i++) {
        if (prevRes[i] === "maybe") {
            needed[prevGuess[i]] = (needed[prevGuess[i]] || 0) + 1;
        }
    }
    for (const ch of guess) {
        if (needed[ch]) needed[ch]--;
    }
    for (const k in needed) {
        if (needed[k] > 0) {
            setStatus(`Strict: include ${k}.`);
            return false;
        }
    }
    return true;
}
function handleEnter() {
    // Don't submit if we've run out of attempts
    if (row >= maxRows) return;

    if (col < wordLen) {
        wiggleRow(row);
        return setStatus("Not enough letters.");
    }
    const guess = grid[row].join("");
    if (!isValid(guess)) {
        wiggleRow(row);
        return setStatus("Not in word list.");
    }
    if (hardMode && !respectsHardMode(guess)) {
        wiggleRow(row);
        return;
    }
    const res = score(guess, target);
    paintRow(row, res);
    updateKeyboard(guess, res);

    // Track this guess
    completedGuesses.push(guess.toLowerCase());

    if (guess.toLowerCase() === target.toLowerCase()) {
        const currentrow = row + 1;
        setStatus(`Nice! You got it in ${currentrow}/${maxRows}.`);

        // Save daily attempt if this is the daily word
        if (isDailyWord) {
            saveDailyAttempt(target, completedGuesses, true);
        }

        setTimeout(() => {
            markCompleted(wordLen, target, true, currentrow, /*showModal=*/ true);
            showGameOver("Great job! 🎉");
        }, wordLen * 200 + 1400); // Wait for water-fill animation to complete
        row = maxRows;
        return;
    }
    row++;
    col = 0;
    if (row === maxRows) {
        setStatus(`Answer was ${target.toUpperCase()}.`);

        // Save daily attempt if this is the daily word
        if (isDailyWord) {
            saveDailyAttempt(target, completedGuesses, false);
        }

        // Let markCompleted open a modal for loss too, after animation completes
        setTimeout(() => {
            markCompleted(wordLen, target, /*won=*/ false, maxRows, /*showModal=*/ true);
            showGameOver("Better luck next time!");
        }, wordLen * 200 + 1400); // Wait for water-fill animation to complete
    } else {
        setStatus("");
    }
}
function paintRow(r, res) {
    for (let c = 0; c < wordLen; c++) {
        const t = getTile(r, c);
        t.classList.remove("filled");

        // Add water-fill animation with staggered delay
        setTimeout(() => {
            t.classList.add("water-fill", res[c]);

            // Clean up animation class after animation completes (longer for mobile)
            const cleanupDelay = window.innerWidth <= 768 ? 1400 : 1200;
            setTimeout(() => {
                t.classList.remove("water-fill");
            }, cleanupDelay);
        }, c * 200); // 200ms delay between each tile
    }
}

/** === Reveal Answer Animation === */
function revealAnswer() {
    // Close settings panel
    const settingsPanel = document.getElementById("settings");
    if (settingsPanel) {
        settingsPanel.removeAttribute("open");
    }
    
    // Mark game as over immediately to prevent further input
    row = maxRows;

    // Set status to show the answer
    setStatus(`Answer: ${target.toUpperCase()}`);

    // Clear the board
    const board = getBoard();
    board.innerHTML = '';

    // Set board to show only 1 row
    board.style.gridTemplateRows = '1fr';

    // Create a single row for the reveal
    const revealRow = document.createElement('div');
    revealRow.className = 'row';
    revealRow.style.gridTemplateColumns = `repeat(${target.length}, 1fr)`;
    revealRow.style.display = 'grid';

    // Create tiles for the answer
    for (let i = 0; i < target.length; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile filled';
        tile.textContent = '';
        revealRow.appendChild(tile);
    }

    board.appendChild(revealRow);

    // Animate the tiles flipping to reveal the answer
    for (let i = 0; i < target.length; i++) {
        const tile = revealRow.children[i];
        setTimeout(() => {
            tile.textContent = target[i].toUpperCase();
            tile.classList.add('water-fill', 'revealed');

            setTimeout(() => {
                tile.classList.remove('water-fill');
            }, 1200);
        }, i * 200);
    }

    // Show "Better luck next time!" message after animation
    setTimeout(() => {
        showGameOver("Better luck next time!");
    }, target.length * 200 + 1400);

    // Mark as completed (loss) - this will save to history and update stats
    setTimeout(() => {
        markCompleted(wordLen, target, /*won=*/ false, maxRows, /*showModal=*/ false);

        // Save daily attempt if this is the daily word (with revealed flag)
        if (isDailyWord) {
            saveDailyAttempt(target, completedGuesses, false, true); // revealed = true
        }
    }, target.length * 200 + 1400);
}

/** === Game Over Display === */
function showGameOver(message) {
    const gameOverSection = document.getElementById('gameOverSection');
    const gameOverMessage = document.getElementById('gameOverMessage');

    if (gameOverSection && gameOverMessage) {
        gameOverMessage.textContent = message;
        gameOverSection.hidden = false;
    }
}

function hideGameOver() {
    const gameOverSection = document.getElementById('gameOverSection');
    if (gameOverSection) {
        gameOverSection.hidden = true;
    }
}

/** === Word selection with no repeats === */
async function pickTarget(len) {
    const list = await loadWords(len);
    WORDS[len] = list;
    VALID[len] = list;
    const seen = new Set(loadSeen(len).seen);
    const candidates = list.filter((w) => !seen.has(w));
    if (!candidates.length) {
        clearSeen(len);
        return list[(Math.random() * list.length) | 0];
    }
    return candidates[(Math.random() * candidates.length) | 0];
}
function restoreCurrent() {
    const s = localStorage.getItem(`wg-current-${wordLen}`);
    const list = wordCache[wordLen];
    return s && list?.includes(s) ? s : "";
}

/** === Round completion === */
function markCompleted(len, word, won, guesses, showModal = false) {
    const data = loadSeen(len);
    if (!data.seen.includes(word)) data.seen.push(word);
    if (data.seen.length > data.max) data.seen.splice(0, data.seen.length - data.max);
    saveSeen(len, data);

    const hist = loadHistory();
    hist.push({ word, len, won, guesses, ts: Date.now() });
    if (hist.length > 5000) hist.splice(0, hist.length - 5000);
    saveHistory(hist);
    updateStats();
    syncPush();

    if (showModal) {
        openResultModal({ len, word, guesses, won });
    }
    // Don't auto-reset anymore - user clicks "New Word" button instead
}

// ---- Modal & fireworks ----
function openResultModal({ len, word, guesses, won }) {
    const title = document.getElementById("winTitle");
    const sub = document.getElementById("winSub");

    // Stats snapshot
    const s = computeStats(loadHistory());
    document.getElementById("mTotal").textContent = s.total || 0;
    document.getElementById("mWinRate").textContent = (s.winRate || 0) + "%";
    document.getElementById("mCurrent").textContent = s.currentStreak || 0;
    document.getElementById("mMax").textContent = s.maxStreak || 0;
    document.getElementById("mHints").textContent = s.hintsUsed || 0;
    document.getElementById("mGuesses").textContent = s.totalGuesses || 0;

    const tries = `${guesses}/${ATTEMPTS[len][difficulty]}`;

    if (won) {
        title.textContent = "Congratulations! You got it!";
        sub.textContent = `Answer: ${word.toUpperCase()}\nSolved ${len}-letter in ${tries} guesses.\nHints used: ${currentGameHints}\nMode: ${difficulty}, Strict: ${hardMode ? "On" : "Off"}`;
    } else {
        title.textContent = "So close!";
        sub.textContent = `Answer was ${word.toUpperCase()}.\nOut of tries (${ATTEMPTS[len][difficulty]}).\nHints used: ${currentGameHints}\nMode: ${difficulty}, Strict: ${hardMode ? "On" : "Off"}`;
    }

    const modal = document.getElementById("winModal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    // focus
    document.getElementById("playAgainBtn")?.focus();

    // Fireworks only on win
    if (won) {
        startFireworks(3000);
    } else {
        stopFireworks();
    }
}

function closeWinModal() {
    const modal = document.getElementById("winModal");
    modal.hidden = true;
    document.body.style.overflow = "";
    stopFireworks();
}

// Simple confetti / fireworks
let fxRAF = null,
    fxRunning = false,
    fxParts = [];
function startFireworks(durationMs = 1500) {
    const cvs = document.getElementById("fx");
    if (!cvs) {
        console.error("Canvas element 'fx' not found!");
        return;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) {
        console.error("Could not get 2d context!");
        return;
    }
    const DPR = Math.max(1, window.devicePixelRatio || 1);
    function resize() {
        cvs.width = innerWidth * DPR;
        cvs.height = innerHeight * DPR;
        cvs.style.width = innerWidth + 'px';
        cvs.style.height = innerHeight + 'px';
    }
    resize();
    addEventListener("resize", resize, { once: true });

    fxParts = [];
    const colors = ["#00ff00", "#ffff00", "#00ffff", "#ff0040", "#ff00ff", "#ff8000"];

    // spawn particles from 3 bursts
    function burst() {
        const cx = Math.random() * innerWidth * DPR,
            cy = (Math.random() * innerHeight * 0.4 + innerHeight * 0.1) * DPR;
        for (let i = 0; i < 120; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 4 + 2) * DPR;
            fxParts.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 120 + ((Math.random() * 40) | 0),
                color: colors[(Math.random() * colors.length) | 0],
            });
        }
    }
    burst();
    setTimeout(burst, 200);
    setTimeout(burst, 400);
    setTimeout(burst, 600);
    setTimeout(burst, 800);

    fxRunning = true;
    const start = performance.now();
    (function tick() {
        fxRAF = requestAnimationFrame(tick);
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        // gravity
        for (const p of fxParts) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08 * DPR;
            p.life--;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0.1, p.life / 120);
            ctx.fillRect(p.x, p.y, 6 * DPR, 6 * DPR);
        }
        fxParts = fxParts.filter((p) => p.life > 0);
        if (performance.now() - start > durationMs && fxParts.length === 0) {
            stopFireworks();
        }
    })();
}
function stopFireworks() {
    if (fxRAF) cancelAnimationFrame(fxRAF);
    fxRAF = null;
    fxRunning = false;
    fxParts = [];
    const cvs = document.getElementById("fx");
    if (cvs) {
        const ctx = cvs.getContext("2d");
        ctx && ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
}

/** === Controls === */
document.querySelectorAll(".diffL").forEach((b) => {
    b.addEventListener("click", async () => {
        document.querySelectorAll(".diffL").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        await resetGame(+b.dataset.len);
    });
});
document.querySelectorAll(".diffA").forEach((b) => {
    b.addEventListener("click", async () => {
        document.querySelectorAll(".diffA").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        difficulty = b.dataset.diff;
        await resetGame(wordLen);
    });
});
document.getElementById("hard")?.addEventListener("click", (e) => {
    hardMode = !hardMode;
    e.currentTarget.setAttribute("aria-checked", String(hardMode));
    e.currentTarget.textContent = `Strict: ${hardMode ? "On" : "Off"}`;
    e.currentTarget.style.outline = hardMode ? "2px solid var(--accent)" : "none";
    setStatus(hardMode ? "Strict mode enabled." : "Strict mode disabled.");
});
const newBtn = document.getElementById("new");
if (newBtn) newBtn.onclick = () => resetGame(wordLen);

const revealBtn = document.getElementById("reveal");
if (revealBtn) revealBtn.onclick = () => revealAnswer();

const newWordBtn = document.getElementById("newWordBtn");
if (newWordBtn) newWordBtn.onclick = () => resetGame(wordLen);

document.getElementById("copy").onclick = () => {
    const emoji = renderShare();
    navigator.clipboard.writeText(emoji).then(() => setStatus("Result copied to clipboard."));
};
document.getElementById("hint").onclick = () => {
    useHint();
};
// Theme buttons are handled by inline onclick in HTML
// document.getElementById("themeToggle").onclick = () => {
// 	toggleTheme();
// };
const resetSeenBtn = document.getElementById("resetSeen");
if (resetSeenBtn) {
    resetSeenBtn.onclick = () => {
        clearSeen(wordLen);
        setStatus(`Cleared seen for ${wordLen}-letter.`);
    };
}

const exportBtnOld = document.getElementById("exportBtn");
if (exportBtnOld) {
    exportBtnOld.onclick = async () => {
        try {
            const r = await fetch(`${WORKER_BASE}/export`, { headers: { "X-WordGuess-User": userId } });
            const blob = await r.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `wordguess-${userId}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            setStatus("Exported.");
        } catch {
            setStatus("Export failed.");
        }
    };
}

const importFileOld = document.getElementById("importFile");
if (importFileOld) {
    importFileOld.onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
        const data = JSON.parse(await f.text());
        if (data?.seenByLen)
            for (const len of [4, 5, 6, 7, 8]) {
                const local = loadSeen(len);
                const merged = Array.from(new Set([...(local.seen || []), ...(data.seenByLen[len] || [])]));
                saveSeen(len, { seen: merged.slice(-500), max: local.max || 500 });
            }
        if (data?.history?.length) {
            const combo = [...loadHistory(), ...data.history].sort((a, b) => a.ts - b.ts);
            const uniq = [],
                keys = new Set();
            for (const h of combo) {
                const k = `${h.word}|${h.len}|${h.ts}`;
                if (!keys.has(k)) {
                    keys.add(k);
                    uniq.push(h);
                }
            }
            saveHistory(uniq.slice(-5000));
        }
        await syncPush();
        setStatus("Imported & synced.");
    } catch {
        setStatus("Import failed.");
    }
    };
}

/** === PWA Installation === */
let deferredPrompt;
const installBtn = document.getElementById("installBtn");

// Listen for beforeinstallprompt event
window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    // Show the install button
    if (installBtn) installBtn.classList.remove("btn-hidden");
});

// Handle install button click
const installBtnHandler = document.getElementById("installBtn");
if (installBtnHandler) {
    installBtnHandler.onclick = async () => {
    if (!deferredPrompt) {
        // Fallback for iOS and other browsers
        setStatus("To install: tap Share → Add to Home Screen");
        return;
    }

    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
        setStatus("App installed! 📱");
    } else {
        setStatus("Installation cancelled.");
    }

    // Clear the saved prompt since it can't be used again
    deferredPrompt = null;
    if (installBtn) installBtn.classList.add("btn-hidden");
    };
}

// Handle successful installation
window.addEventListener("appinstalled", () => {
    setStatus("Word Guess installed successfully! 🎉");
    if (installBtn) installBtn.classList.add("btn-hidden");
    deferredPrompt = null;
});

/** === Share === */
function renderShare() {
    let lines = [];
    let actualRows = 0;

    // Count actual guesses in grid (rows with content)
    for (let r = 0; r < maxRows; r++) {
        if (grid[r] && grid[r].some(cell => cell !== "")) {
            actualRows++;
            const guess = grid[r].join("");
            const res = score(guess, target);
            lines.push(res.map((v) => (v === "ok" ? "🟩" : v === "maybe" ? "🟨" : "⬛")).join(""));
        }
    }

    // Check if last guess was correct
    const lastGuess = grid[actualRows - 1]?.join("").toLowerCase();
    const won = lastGuess === target.toLowerCase();
    const header = `WordGuess ${won ? actualRows : "X"}/${maxRows} • ${wordLen}-letter`;
    return `${header}\n` + lines.join("\n");
}

/** === Hint === */
function useHint() {
    if (wordLen < 6 || !target) return; // Only for 6, 7, 8 letter words

    // Get all letters from target word that haven't been revealed yet
    const targetLetters = [...target.toLowerCase()];
    const unrevealedTargetLetters = targetLetters.filter(letter => !kbState[letter.toUpperCase()]);

    // Get all letters that haven't been used at all
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const unusedLetters = [...alphabet].filter(letter => !kbState[letter]);

    // If we have unrevealed letters from the target, reveal one as yellow (maybe)
    if (unrevealedTargetLetters.length > 0) {
        const randomIndex = Math.floor(Math.random() * unrevealedTargetLetters.length);
        const letterToReveal = unrevealedTargetLetters[randomIndex].toUpperCase();
        kbState[letterToReveal] = 'maybe'; // Yellow hint
    }

    // If we have unused letters not in target, mark one as gray (no)
    const unusedNotInTarget = unusedLetters.filter(letter =>
        !targetLetters.includes(letter.toLowerCase())
    );
    if (unusedNotInTarget.length > 0) {
        const randomIndex = Math.floor(Math.random() * unusedNotInTarget.length);
        const letterToRemove = unusedNotInTarget[randomIndex];
        kbState[letterToRemove] = 'no'; // Gray out
    }

    renderKeyboardHints();

    // Track hint usage
    currentGameHints++; // Increment current game hints
    const newCount = incrementHintsUsed();
    updateStats(); // Refresh stats display

    setStatus("Hint used! One letter revealed, one eliminated.");
}

/** === Status === */
function setStatus(msg) {
    getStatus().textContent = msg || "";
}

/** === Modal Helper === */
function wireModalHandlers() {
    const modal = document.getElementById("winModal");
    modal?.addEventListener("click", (e) => {
        if (e.target.matches("[data-close]")) closeWinModal();
    });

    document.getElementById("closeModalBtn")?.addEventListener("click", closeWinModal);
    document.getElementById("playAgainBtn")?.addEventListener("click", () => {
        closeWinModal();
        resetGame(wordLen);
    });
    document.getElementById("modalSettingsBtn")?.addEventListener("click", () => {
        closeWinModal();
        // Open settings modal
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.classList.remove('hidden');
            updateSettingsUI();
        }
    });
    document.getElementById("modalShareBtn")?.addEventListener("click", () => {
        const emoji = renderShare();
        navigator.clipboard.writeText(emoji).then(() => setStatus("Result copied to clipboard."));
    });
}
wireModalHandlers();

/** === Theme Toggle === */
function wireThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    themeToggle.addEventListener('click', () => {
        const currentTheme = loadTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    });
}
wireThemeToggle();

/** === Settings Modal === */
function wireSettingsModal() {
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsModal = document.getElementById('settingsModal');
    
    if (!settingsToggle || !settingsModal) return;

    // Open modal
    settingsToggle.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        updateSettingsUI();
    });

    // Close modal
    const closeButtons = settingsModal.querySelectorAll('[data-close]');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    });

    // Close on backdrop click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsModal.classList.contains('hidden')) {
            settingsModal.classList.add('hidden');
        }
    });

    // Word length buttons
    const lengthButtons = settingsModal.querySelectorAll('.btn-length');
    lengthButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const len = parseInt(btn.dataset.length);
            if (len === wordLen) return;
            
            lengthButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            resetGame(len);
            settingsModal.classList.add('hidden');
        });
    });

    // Strict mode toggle
    const strictToggle = settingsModal.querySelector('#strictModeToggle');
    if (strictToggle) {
        strictToggle.addEventListener('change', (e) => {
            hardMode = e.target.checked;
            localStorage.setItem('wg-strict', hardMode);
            setStatus(`Strict Mode: ${hardMode ? 'ON' : 'OFF'}`);
        });
    }

    // Difficulty buttons
    const difficultyButtons = settingsModal.querySelectorAll('.btn-difficulty');
    difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const diff = btn.dataset.difficulty;
            if (diff === difficulty) return;
            
            difficultyButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            difficulty = diff;
            localStorage.setItem('wg-difficulty', difficulty);
            resetGame(wordLen);
            settingsModal.classList.add('hidden');
        });
    });

    // Reveal button
    const revealBtn = settingsModal.querySelector('#revealBtn');
    if (revealBtn) {
        revealBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reveal the answer? This will end the game.')) {
                revealAnswer();
                settingsModal.classList.add('hidden');
            }
        });
    }

    // Reset seen words
    const resetSeenBtn = settingsModal.querySelector('#resetSeenBtn');
    if (resetSeenBtn) {
        resetSeenBtn.addEventListener('click', () => {
            if (confirm('Reset all seen words? This will allow you to replay words you\'ve already seen.')) {
                for (let len = 4; len <= 8; len++) {
                    localStorage.removeItem(`wg-used-${len}`);
                }
                setStatus('Seen words reset!');
            }
        });
    }

    // Export data
    const exportBtn = settingsModal.querySelector('#exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('wg-')) {
                    data[key] = localStorage.getItem(key);
                }
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'word-game-data.json';
            a.click();
            URL.revokeObjectURL(url);
            setStatus('Data exported!');
        });
    }

    // Import data
    const importBtn = settingsModal.querySelector('#importBtn');
    const importFile = settingsModal.querySelector('#importFile');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
        
        importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    Object.keys(data).forEach(key => {
                        if (key.startsWith('wg-')) {
                            localStorage.setItem(key, data[key]);
                        }
                    });
                    setStatus('Data imported! Refreshing...');
                    setTimeout(() => location.reload(), 1000);
                } catch (err) {
                    setStatus('Import failed: Invalid file');
                }
            };
            reader.readAsText(file);
        });
    }

    // Install app button
    const installBtn = settingsModal.querySelector('#installBtn');
    const installSection = settingsModal.querySelector('#installSection');
    
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installSection) installSection.classList.remove('hidden');
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setStatus('App installed!');
            }
            deferredPrompt = null;
            if (installSection) installSection.classList.add('hidden');
        });
    }

    // Reset stats button
    const resetStatsBtn = settingsModal.querySelector('#resetStatsBtn');
    if (resetStatsBtn) {
        resetStatsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
                localStorage.removeItem('wg-stats');
                stats = { played: 0, wins: 0, current: 0, max: 0, hints: 0 };
                updateStats();
                setStatus('Statistics reset!');
            }
        });
    }
}

function updateSettingsUI() {
    const settingsModal = document.getElementById('settingsModal');
    if (!settingsModal) return;

    // Update word length buttons
    const lengthButtons = settingsModal.querySelectorAll('.btn-length');
    lengthButtons.forEach(btn => {
        const len = parseInt(btn.dataset.length);
        btn.classList.toggle('active', len === wordLen);
    });

    // Update strict mode toggle
    const strictToggle = settingsModal.querySelector('#strictModeToggle');
    if (strictToggle) {
        strictToggle.checked = hardMode;
    }

    // Update difficulty buttons
    const difficultyButtons = settingsModal.querySelectorAll('.btn-difficulty');
    difficultyButtons.forEach(btn => {
        const isActive = btn.dataset.difficulty === difficulty;
        btn.classList.toggle('active', isActive);
    });

    // Show/hide reveal section
    const revealSection = settingsModal.querySelector('#revealSection');
    if (revealSection) {
        if (row > 0 && !gameOver) {
            revealSection.classList.remove('hidden');
        } else {
            revealSection.classList.add('hidden');
        }
    }

    // Update stats
    const currentStats = computeStats(loadHistory());
    const statsElements = {
        sPlayed: currentStats.total || 0,
        sWins: currentStats.wins || 0,
        sCurrent: currentStats.currentStreak || 0,
        sMax: currentStats.maxStreak || 0,
        sHints: currentStats.hintsUsed || 0,
        sGuesses: currentStats.totalGuesses || 0
    };

    Object.entries(statsElements).forEach(([id, value]) => {
        const el = settingsModal.querySelector(`#${id}`);
        if (el) el.textContent = value;
    });
}

wireSettingsModal();

/** === Init / Reset === */
async function resetGame(len = wordLen) {
    if (!checkDailyCap()) return;
    wordLen = len;
    maxRows = ATTEMPTS[wordLen][difficulty];
    target = await pickTarget(wordLen);
    row = 0;
    col = 0;
    grid = [];
    kbState = {};
    currentGameHints = 0;
    buildBoard(); // This will hide the game over section
    buildKeyboard();
    setStatus(`New ${wordLen}-letter word • Attempts: ${maxRows}. Go!`);
    localStorage.setItem(`wg-current-${wordLen}`, target);
    updateLayout();
}

/** === Screen Navigation System === */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.hidden = true);
    document.getElementById(screenId).hidden = false;
}

function slideToScreen(screenId, direction = 'forward') {
    const currentScreen = document.querySelector('.screen:not([hidden])');
    const nextScreen = document.getElementById(screenId);

    if (currentScreen) {
        currentScreen.style.animation = direction === 'forward' ? 'slideOutLeft 0.3s ease' : 'slideOutRight 0.3s ease';
        setTimeout(() => {
            currentScreen.hidden = true;
            currentScreen.style.animation = '';
        }, 300);
    }

    setTimeout(() => {
        nextScreen.hidden = false;
        nextScreen.style.animation = direction === 'forward' ? 'slideInRight 0.3s ease' : 'slideInLeft 0.3s ease';
        setTimeout(() => {
            nextScreen.style.animation = '';
        }, 300);
    }, currentScreen ? 150 : 0);
}

// Timer functions
function startTimer() {
    startTime = Date.now();
    timeRemaining = timeLimit;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        timeRemaining = timeLimit - elapsed;

        if (timeRemaining <= 0) {
            timeRemaining = 0;
            stopTimer();
            endGameTimeout();
        }
        updateTimerDisplay();
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('timerDisplay');
    if (!timerEl) return;

    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Add urgency styling
    if (timeRemaining <= 30) {
        timerEl.classList.add('timer-critical');
    } else if (timeRemaining <= 60) {
        timerEl.classList.add('timer-warning');
    }
}

function endGameTimeout() {
    setStatus(`⏰ Time's up! The word was: ${target.toUpperCase()}`);
    recordLoss();
    updateStats();
    setTimeout(() => showWinModal(false), 500);
}

// Daily word generation
function getDailyWord(wordList) {
    const { mountainTime, dateKey } = getMountainTimeInfo();
    const daysSinceEpoch = Math.floor(mountainTime.getTime() / 86400000);

    // Check if we've already picked today's word
    const lastDailyPick = localStorage.getItem('wg-daily-pick-date');
    const lastDailyWord = localStorage.getItem('wg-daily-pick-word');

    // If we already picked a word today, return it
    if (lastDailyPick === dateKey && lastDailyWord && wordList.includes(lastDailyWord)) {
        return lastDailyWord;
    }

    // New day - pick a new word
    // Load or initialize the used words tracking for daily rotation
    let usedWords = [];
    try {
        const stored = localStorage.getItem('wg-daily-used');
        if (stored) {
            usedWords = JSON.parse(stored);
        }
    } catch (e) {
        usedWords = [];
    }

    // Filter out words that have been used
    let availableWords = wordList.filter(w => !usedWords.includes(w));

    // If all words have been used, reset the rotation
    if (availableWords.length === 0) {
        usedWords = [];
        availableWords = [...wordList];
        localStorage.setItem('wg-daily-used', JSON.stringify([]));
    }

    // Pick a word from available words using the day index
    const index = daysSinceEpoch % availableWords.length;
    const selectedWord = availableWords[index];

    // Mark this word as used for future days
    if (!usedWords.includes(selectedWord)) {
        usedWords.push(selectedWord);
        localStorage.setItem('wg-daily-used', JSON.stringify(usedWords));
    }

    // Store today's pick so we don't change it during the day
    localStorage.setItem('wg-daily-pick-date', dateKey);
    localStorage.setItem('wg-daily-pick-word', selectedWord);

    return selectedWord;
}

// Save daily word attempt
function saveDailyAttempt(word, guesses, won, revealed = false) {
    const { dateKey } = getMountainTimeInfo();

    const data = {
        word,
        guesses,
        won,
        revealed,
        dateKey,
        ts: Date.now()
    };
    localStorage.setItem('wg-daily-attempt', JSON.stringify(data));
}

// Load daily word attempt
function loadDailyAttempt() {
    try {
        const stored = localStorage.getItem('wg-daily-attempt');
        if (!stored) return null;
        return JSON.parse(stored);
    } catch {
        return null;
    }
}


// Check if today's daily word has been completed
function getTodaysDailyCompletion(dailyWord) {
    const { dateKey } = getMountainTimeInfo();

    const attempt = loadDailyAttempt();
    if (!attempt) return null;

    // Check if it's today's attempt and matches the daily word
    if (attempt.dateKey === dateKey && attempt.word === dailyWord) {
        return attempt;
    }

    return null;
}

// Restore a completed game state
function restoreCompletedGame(completion) {
    // Check if this was a revealed answer
    if (completion.revealed) {
        // Restore the revealed state (pass the word from completion)
        restoreRevealedGame(completion.word);
        return;
    }

    // Ensure guesses is an array
    const guesses = Array.isArray(completion.guesses) ? completion.guesses : [];

    // Restore the grid from the guesses
    grid = [];
    for (let i = 0; i < maxRows; i++) {
        grid[i] = Array(wordLen).fill("");
    }
    guesses.forEach((guess, idx) => {
        grid[idx] = guess.toUpperCase().split('');
    });
    row = guesses.length;
    col = 0;

    // Build the board first
    buildBoard();

    // Restore each guess with proper coloring
    guesses.forEach((guess, r) => {
        // Set the letters in cells
        for (let c = 0; c < guess.length; c++) {
            setCell(r, c, guess[c]);
        }
        // Score and paint the row
        const res = score(guess.toUpperCase(), target.toUpperCase());
        paintRow(r, res);
        // Update keyboard
        updateKeyboard(guess.toUpperCase(), res);
    });

    buildKeyboard();

    // Show game over section since this is a completed game
    const message = completion.won ? "Great job! 🎉" : "Better luck next time!";
    setTimeout(() => {
        showGameOver(message);
    }, 100);
}

// Restore a revealed game (same display as when reveal was clicked)
function restoreRevealedGame(word) {
    // Use the passed word parameter
    const answerWord = word || target;
    
    if (!answerWord) {
        console.error("No word available for reveal restoration!");
        return;
    }
    
    // Mark game as over
    row = maxRows;
    col = 0;
    
    // Initialize grid to prevent any rebuild attempts
    grid = Array.from({ length: maxRows }, () => Array(wordLen).fill(""));

    // Clear the board
    const board = getBoard();
    if (!board) {
        console.error("Board element not found!");
        return;
    }
    console.log("Board element found:", board);
    board.innerHTML = '';
    
    // Make board visible
    board.style.display = 'grid';
    board.style.opacity = '1';
    board.style.visibility = 'visible';

    // Set board to show only 1 row (CRITICAL for reveal state)
    board.style.gridTemplateRows = '1fr';

    // Create a single row for the reveal
    const revealRow = document.createElement('div');
    revealRow.className = 'row';
    revealRow.style.gridTemplateColumns = `repeat(${answerWord.length}, 1fr)`;
    revealRow.style.display = 'grid';
    revealRow.style.opacity = '1';
    revealRow.style.visibility = 'visible';

    // Create tiles with the answer already shown (NO animation, just static reveal)
    for (let i = 0; i < answerWord.length; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile filled revealed';
        tile.textContent = answerWord[i].toUpperCase();
        revealRow.appendChild(tile);
    }

    board.appendChild(revealRow);
    console.log("Board rebuilt with 1 row, tiles:", revealRow.children.length);
    console.log("Board children count:", board.children.length);
    console.log("Board innerHTML length:", board.innerHTML.length);

    // Build keyboard
    buildKeyboard();
    
    // Set status
    setStatus(`Answer: ${answerWord.toUpperCase()}`);

    // Show game over section immediately
    showGameOver("Better luck next time!");
}

// Setup navigation event listeners
function setupNavigationListeners() {
    const dailyWordBtn = document.getElementById('dailyWordBtn');
    const quickStartBtn = document.getElementById('quickStartBtn');

    // Daily Word button - today's daily word
    dailyWordBtn?.addEventListener('click', async () => {
        gameMode = "standard";
        wordLen = 5;
        difficulty = "base";
        localStorage.setItem('wg-difficulty', difficulty);
        maxRows = ATTEMPTS[wordLen][difficulty];

        const list = await loadWords(wordLen);
        WORDS[wordLen] = list;
        VALID[wordLen] = list;
        target = getDailyWord(list);
        localStorage.setItem(`wg-current-${wordLen}`, target);

        // Check if today's daily word has already been completed
        const todaysCompletion = getTodaysDailyCompletion(target);

        if (todaysCompletion) {
            // Restore the completed game
            isDailyWord = false; // Don't save again
            completedGuesses = todaysCompletion.guesses || [];
            
            // Restore the game state BEFORE changing screens
            restoreCompletedGame(todaysCompletion);
            
            // Wait a moment for the DOM to update before transitioning
            setTimeout(() => {
                updateLayout();
                slideToScreen('gameScreen');
                // Don't override status if it was a revealed game (status set in restoreRevealedGame)
                if (!todaysCompletion.revealed) {
                    setStatus(`Today's daily word (completed)`);
                }
                
                // Open the result modal after screen transition completes
                setTimeout(() => {
                    openResultModal({
                        len: wordLen,
                        word: target,
                        guesses: todaysCompletion.guesses.length,
                        won: todaysCompletion.won
                    });
                }, 400);
            }, 50);
        } else {
            // Start fresh game
            isDailyWord = true; // This is a daily word
            completedGuesses = []; // Reset guesses tracker
            row = 0;
            col = 0;
            grid = [];
            kbState = {};
            currentGameHints = 0;
            buildBoard();
            buildKeyboard();
            updateLayout();
            slideToScreen('gameScreen');
            setStatus(`Daily 5-letter word • Attempts: ${maxRows}. Good luck!`);
        }
    });

    // Quick Start button - random word
    quickStartBtn?.addEventListener('click', async () => {
        gameMode = "standard";
        wordLen = 5;
        difficulty = "base";
        localStorage.setItem('wg-difficulty', difficulty);
        maxRows = ATTEMPTS[wordLen][difficulty];

        const list = await loadWords(wordLen);
        WORDS[wordLen] = list;
        VALID[wordLen] = list;
        target = await pickTarget(wordLen); // Random word
        localStorage.setItem(`wg-current-${wordLen}`, target);

        // Start fresh game
        isDailyWord = false; // Not a daily word
        completedGuesses = [];
        row = 0;
        col = 0;
        grid = [];
        kbState = {};
        currentGameHints = 0;
        buildBoard();
        buildKeyboard();
        updateLayout();
        slideToScreen('gameScreen');
        setStatus(`Random 5-letter word • Attempts: ${maxRows}. Good luck!`);
    });

    document.getElementById('selectModeBtn')?.addEventListener('click', () => {
        slideToScreen('modeScreen');
    });

    document.getElementById('modeBackBtn')?.addEventListener('click', () => {
        slideToScreen('homeScreen', 'backward');
    });

    document.getElementById('lengthBackBtn')?.addEventListener('click', () => {
        slideToScreen('modeScreen', 'backward');
    });

    document.getElementById('difficultyBackBtn')?.addEventListener('click', () => {
        slideToScreen('lengthScreen', 'backward');
    });

    document.getElementById('homeBtn')?.addEventListener('click', () => {
        stopTimer();
        slideToScreen('homeScreen', 'backward');
    });

    // Mode selection
    document.querySelectorAll('.mode-card:not(.mode-card-disabled)').forEach(card => {
        card.addEventListener('click', () => {
            selectedMode = card.dataset.mode;
            gameMode = selectedMode;

            // Update difficulty attempt counts based on default length (5)
            updateDifficultyAttempts(5);

            slideToScreen('lengthScreen');
        });
    });

    // Length selection
    document.querySelectorAll('#lengthScreen .selection-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedLength = parseInt(card.dataset.length);
            wordLen = selectedLength;

            // Update difficulty attempt counts
            updateDifficultyAttempts(wordLen);

            slideToScreen('difficultyScreen');
        });
    });

    // Difficulty selection
    document.querySelectorAll('#difficultyScreen .selection-card').forEach(card => {
        card.addEventListener('click', async () => {
            selectedDifficulty = card.dataset.difficulty;
            difficulty = selectedDifficulty;
            maxRows = ATTEMPTS[wordLen][difficulty];

            // Set time limit for timed mode
            if (gameMode === 'timed') {
                timeLimit = getTimeLimitForLength(wordLen, difficulty);
            }

            // Load words and start game
            await loadWords(wordLen);
            target = await pickTarget(wordLen);
            localStorage.setItem(`wg-current-${wordLen}`, target);

            // Reset game state
            isDailyWord = false; // Not a daily word
            completedGuesses = []; // Reset guesses tracker
            row = 0;
            col = 0;
            grid = [];
            kbState = {};
            currentGameHints = 0;
            buildBoard();
            buildKeyboard();
            updateLayout();

            slideToScreen('gameScreen');

            if (gameMode === 'timed') {
                addTimerDisplay();
                startTimer();
                setStatus(`Timed ${wordLen}-letter word • Attempts: ${maxRows}. Beat the clock!`);
            } else {
                removeTimerDisplay();
                setStatus(`${wordLen}-letter word • Attempts: ${maxRows}. Good luck!`);
            }
        });
    });
}

function updateDifficultyAttempts(length) {
    document.getElementById('baseAttempts').textContent = `${ATTEMPTS[length].base} Attempts`;
    document.getElementById('hardAttempts').textContent = `${ATTEMPTS[length].hard} Attempts`;
    document.getElementById('expertAttempts').textContent = `${ATTEMPTS[length].expert} Attempts`;
    document.getElementById('impossibleAttempts').textContent = `${ATTEMPTS[length].impossible} Attempts`;
}

function getTimeLimitForLength(length, diff) {
    // Base time limits in seconds
    const baseTimes = { 4: 180, 5: 240, 6: 300, 7: 360, 8: 420 };
    const multipliers = { base: 1, hard: 0.85, expert: 0.7, impossible: 0.6 };
    return Math.floor(baseTimes[length] * multipliers[diff]);
}

function addTimerDisplay() {
    if (document.getElementById('timerDisplay')) return;
    const timerEl = document.createElement('div');
    timerEl.id = 'timerDisplay';
    timerEl.className = 'timer-display';
    document.querySelector('.controls').prepend(timerEl);
}

function removeTimerDisplay() {
    document.getElementById('timerDisplay')?.remove();
}

async function init() {
    try {
        // Initialize theme first
        const savedTheme = loadTheme();
        applyTheme(savedTheme);

        // Show home screen instead of game
        showScreen('homeScreen');

        // Setup navigation event listeners
        setupNavigationListeners();

        // Preload 5-letter words for quick start
        await loadWords(5);

        addEventListener("resize", updateLayout);
        document.getElementById("statsPanel")?.addEventListener("toggle", updateLayout);
    } catch (e) {
        console.error("Init error:", e);
        showScreen('homeScreen'); // Show home even on error
    }
}
init();
