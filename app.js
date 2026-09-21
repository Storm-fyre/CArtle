// --- THEME MANAGEMENT ---
const themeToggleBtn = document.getElementById("theme-toggle");

function initTheme() {
    const savedTheme = localStorage.getItem('cartleTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("cartleTheme", next);
    themeToggleBtn.textContent = next === "dark" ? "☀️" : "🌙";
});

// --- CORE GAME STATE & CONSTANTS ---
const MAX_GUESSES = 5;

// Active Market: 'india' (Dalal St) vs 'global' (Wall Street)
let currentMarket = localStorage.getItem('CArtle_Market') || 'india';

// Difficulty Mode: 'fundamentalist' (default, metrics only) vs 'analyst' (guided clues)
let gameMode = localStorage.getItem('CArtle_Mode') || 'fundamentalist';

// Data stores for active market
let metricsData = [];
let factsData = [];
let openingCluesData = [];

// Targets
let targetMetric = null;
let targetFact = null;
let targetOpeningFact = null;

// Progression
let puzzleOrder = [];
let currentOrderIndex = 0;
let guesses = [];
let gameOver = false;
let modalShown = false;

// Autocomplete Keyboard Navigation State
let activeAutocompleteIndex = -1;
let currentAutocompleteMatches = [];

// --- DOM ELEMENTS ---
const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const gridRows = document.getElementById('grid-rows');
const clueContainer = document.getElementById('clue-container');
const clueText = document.getElementById('clue-text');
const clueTitleSpan = document.querySelector('.clue-number');
const puzzleCounter = document.getElementById('puzzle-counter');

// Header Column Elements for Dynamic Units
const colMcap = document.getElementById('col-mcap');
const colPromoter = document.getElementById('col-promoter');

// Buttons & Actions
const marketToggleBtn = document.getElementById('market-toggle-btn');
const concedeBtn = document.getElementById('concede-btn');
const mainNextBtn = document.getElementById('main-next-btn');

// Mode Selection Elements
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const modeModal = document.getElementById('mode-modal');
const closeModeModalBtn = document.getElementById('close-mode-modal');
const btnModeAnalyst = document.getElementById('btn-mode-analyst');
const btnModeFundamentalist = document.getElementById('btn-mode-fundamentalist');

// Post-Game Modal Elements
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const targetCompanyName = document.getElementById('target-company-name');
const targetStatsCard = document.getElementById('target-stats-card');
const modalNextBtn = document.getElementById('modal-next-btn');
const closeModalBtn = document.getElementById('close-modal');

// --- 1. INITIALIZATION ---
async function init() {
    initTheme();
    applyModeUI(gameMode);
    updateHeaderLabels();

    const success = await loadMarketData(currentMarket);
    if (!success) {
        // Fallback to Indian market if Global files aren't ready yet
        currentMarket = 'india';
        localStorage.setItem('CArtle_Market', 'india');
        updateHeaderLabels();
        await loadMarketData('india');
    }

    initPuzzleOrder();
    loadState();
    setupCurrentPuzzle();

    // Check if mode was explicitly set previously, else offer modal
    if (!localStorage.getItem('CArtle_Mode')) {
        modeModal.classList.remove('hidden');
        setMode('fundamentalist', false);
    }
}

// --- 2. MARKET DATA LOADER & SWITCHER ---
async function loadMarketData(market) {
    const isGlobal = market === 'global';
    const metricsFile = isGlobal ? 'global_metrics.json' : 'metrics.json';
    const factsFile = isGlobal ? 'global_facts.json' : 'facts.json';
    const openingFile = isGlobal ? 'global_opening_clues.json' : 'opening_clues.json';

    try {
        const [mRes, fRes, oRes] = await Promise.all([
            fetch(metricsFile),
            fetch(factsFile),
            fetch(openingFile)
        ]);

        if (!mRes.ok || !fRes.ok || !oRes.ok) {
            throw new Error(`Data files not found for ${market}`);
        }

        metricsData = await mRes.json();
        factsData = await fRes.json();
        openingCluesData = await oRes.json();
        return true;
    } catch (err) {
        console.warn(`Failed loading market '${market}':`, err);
        return false;
    }
}

function updateHeaderLabels() {
    if (currentMarket === 'global') {
        marketToggleBtn.textContent = '🌎 Global';
        if (colMcap) colMcap.textContent = 'MC($B)';
        if (colPromoter) colPromoter.textContent = 'INSIDER%';
    } else {
        marketToggleBtn.textContent = '🇮🇳 Dalal St';
        if (colMcap) colMcap.textContent = 'MC(Cr)';
        if (colPromoter) colPromoter.textContent = 'PROM%';
    }
}

marketToggleBtn.addEventListener('click', async () => {
    const nextMarket = currentMarket === 'india' ? 'global' : 'india';
    
    // Save current market state before switching
    saveState();

    const success = await loadMarketData(nextMarket);
    if (!success) {
        showToast("⚠️ Global dataset files not yet found. Reverting to Dalal St.");
        return;
    }

    currentMarket = nextMarket;
    localStorage.setItem('CArtle_Market', currentMarket);
    updateHeaderLabels();

    // Initialize market-specific sequence & restore state
    initPuzzleOrder();
    loadState();
    setupCurrentPuzzle();

    showToast(`Switched to ${currentMarket === 'global' ? 'Global / Wall St' : 'Dalal St'} market!`);
});

// --- 3. MODE MANAGEMENT ---
function setMode(mode, save = true) {
    gameMode = mode;
    if (save) {
        localStorage.setItem('CArtle_Mode', mode);
        modeModal.classList.add('hidden');
    }
    applyModeUI(mode);
    updateClueUI();
}

function applyModeUI(mode) {
    if (mode === 'fundamentalist') {
        modeToggleBtn.textContent = '📈 Fundamentalist';
        btnModeFundamentalist.classList.add('active');
        btnModeAnalyst.classList.remove('active');
    } else {
        modeToggleBtn.textContent = '🎓 Analyst';
        btnModeAnalyst.classList.add('active');
        btnModeFundamentalist.classList.remove('active');
    }
}

modeToggleBtn.addEventListener('click', () => modeModal.classList.remove('hidden'));
closeModeModalBtn.addEventListener('click', () => {
    if (!localStorage.getItem('CArtle_Mode')) {
        setMode('fundamentalist', true);
    } else {
        modeModal.classList.add('hidden');
    }
});

btnModeAnalyst.addEventListener('click', () => setMode('analyst', true));
btnModeFundamentalist.addEventListener('click', () => setMode('fundamentalist', true));

// --- 4. RANDOMIZED PUZZLE SEQUENCING ---
function getOrderStorageKey() {
    return `CArtle_Order_${currentMarket}`;
}

function getStateStorageKey() {
    return `CArtle_State_${currentMarket}`;
}

function initPuzzleOrder() {
    const savedOrder = localStorage.getItem(getOrderStorageKey());
    if (savedOrder) {
        try {
            const parsed = JSON.parse(savedOrder);
            if (Array.isArray(parsed) && parsed.length === factsData.length) {
                puzzleOrder = parsed;
                return;
            }
        } catch (e) {
            console.error("Order parse error, generating fresh sequence.", e);
        }
    }
    generateNewShuffle();
}

function generateNewShuffle() {
    puzzleOrder = factsData.map((_, i) => i);
    for (let i = puzzleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [puzzleOrder[i], puzzleOrder[j]] = [puzzleOrder[j], puzzleOrder[i]];
    }
    localStorage.setItem(getOrderStorageKey(), JSON.stringify(puzzleOrder));
}

// --- 5. SETUP CURRENT PUZZLE ---
function setupCurrentPuzzle() {
    if (!factsData || factsData.length === 0) return;

    if (currentOrderIndex >= puzzleOrder.length) {
        generateNewShuffle();
        currentOrderIndex = 0;
    }

    const marketLabel = currentMarket === 'global' ? 'GLOBAL' : 'DALAL STREET';
    puzzleCounter.innerText = `Puzzle ${currentOrderIndex + 1} • ${marketLabel}`;
    
    const factIndex = puzzleOrder[currentOrderIndex];
    targetFact = factsData[factIndex];
    targetMetric = metricsData.find(m => m.ticker === targetFact.ticker);
    targetOpeningFact = openingCluesData.find(c => c.ticker === targetFact.ticker);

    if (!targetMetric) {
        console.error(`Metric data missing for ticker: ${targetFact.ticker}`);
        return;
    }

    // Reset UI
    gridRows.innerHTML = '';
    autocompleteList.innerHTML = '';
    autocompleteList.classList.add('hidden');
    targetStatsCard.classList.add('hidden');
    targetStatsCard.innerHTML = '';
    
    const isCompleted = gameOver || guesses.length >= MAX_GUESSES || (guesses.length > 0 && guesses[guesses.length - 1].ticker === targetMetric.ticker);

    if (isCompleted) {
        gameOver = true;
        searchInput.disabled = true;
        searchInput.placeholder = "Audit Complete.";
        mainNextBtn.classList.remove('hidden');
        modalNextBtn.classList.remove('hidden');
        concedeBtn.classList.add('hidden');

        guesses.forEach((guess, idx) => {
            renderRow(guess, false, idx);
        });

        // Strict Clue Rule: Only Analyst mode sees clues post-game
        if (gameMode === 'analyst') {
            clueContainer.classList.remove('hidden');
            revealFullAuditorClue();
        } else {
            clueContainer.classList.add('hidden');
        }
    } else {
        gameOver = false;
        modalShown = false;
        searchInput.disabled = false;
        searchInput.placeholder = "Guess a company name or ticker...";
        searchInput.value = '';
        modal.classList.add('hidden');
        mainNextBtn.classList.add('hidden');
        modalNextBtn.classList.add('hidden');
        concedeBtn.classList.remove('hidden');

        guesses.forEach((guess, idx) => {
            renderRow(guess, false, idx);
        });

        updateClueUI();

        if (window.innerWidth > 768) {
            setTimeout(() => searchInput.focus(), 50);
        }
    }
}

// --- 6. SEARCH, AUTOCOMPLETE & KEYBOARD NAVIGATION ---
searchInput.addEventListener('input', function() {
    let val = this.value.trim();
    autocompleteList.innerHTML = '';
    activeAutocompleteIndex = -1;

    if (!val) {
        autocompleteList.classList.add('hidden');
        currentAutocompleteMatches = [];
        return;
    }

    const query = val.toLowerCase();

    const matches = metricsData.filter(m => 
        m.ticker.toLowerCase().includes(query) || 
        m.company_name.toLowerCase().includes(query)
    ).sort((a, b) => {
        const aTicker = a.ticker.toLowerCase();
        const bTicker = b.ticker.toLowerCase();
        const aName = a.company_name.toLowerCase();
        const bName = b.company_name.toLowerCase();

        if (aTicker === query) return -1;
        if (bTicker === query) return 1;
        if (aTicker.startsWith(query) && !bTicker.startsWith(query)) return -1;
        if (bTicker.startsWith(query) && !aTicker.startsWith(query)) return 1;
        if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
        if (bName.startsWith(query) && !aName.startsWith(query)) return 1;
        return 0;
    }).slice(0, 5);

    currentAutocompleteMatches = matches;

    if (matches.length > 0) {
        autocompleteList.classList.remove('hidden');
    } else {
        autocompleteList.classList.add('hidden');
        return;
    }

    matches.forEach((match, index) => {
        let div = document.createElement('div');
        div.setAttribute('data-index', index);
        div.innerHTML = `<strong>${match.ticker}</strong> - ${match.company_name}`;
        div.addEventListener('click', () => selectCandidate(match));
        autocompleteList.appendChild(div);
    });
});

searchInput.addEventListener('keydown', function(e) {
    if (autocompleteList.classList.contains('hidden') || currentAutocompleteMatches.length === 0) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = this.value.trim().toUpperCase();
            const exactMatch = metricsData.find(m => m.ticker === val);
            if (exactMatch) selectCandidate(exactMatch);
        }
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeAutocompleteIndex = (activeAutocompleteIndex + 1) % currentAutocompleteMatches.length;
        updateAutocompleteHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeAutocompleteIndex = (activeAutocompleteIndex - 1 + currentAutocompleteMatches.length) % currentAutocompleteMatches.length;
        updateAutocompleteHighlight();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeAutocompleteIndex >= 0 && activeAutocompleteIndex < currentAutocompleteMatches.length) {
            selectCandidate(currentAutocompleteMatches[activeAutocompleteIndex]);
        } else if (currentAutocompleteMatches.length > 0) {
            selectCandidate(currentAutocompleteMatches[0]);
        }
    } else if (e.key === 'Escape') {
        autocompleteList.classList.add('hidden');
        activeAutocompleteIndex = -1;
    }
});

function updateAutocompleteHighlight() {
    const items = autocompleteList.querySelectorAll('div');
    items.forEach((item, idx) => {
        if (idx === activeAutocompleteIndex) {
            item.classList.add('autocomplete-active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('autocomplete-active');
        }
    });
}

function selectCandidate(match) {
    searchInput.value = '';
    autocompleteList.innerHTML = '';
    autocompleteList.classList.add('hidden');
    activeAutocompleteIndex = -1;
    currentAutocompleteMatches = [];
    handleGuess(match);
}

document.addEventListener('click', function(e) {
    if (e.target !== searchInput && !autocompleteList.contains(e.target)) {
        autocompleteList.innerHTML = '';
        autocompleteList.classList.add('hidden');
        activeAutocompleteIndex = -1;
    }
});

// Toast notification helper
function showToast(message) {
    let existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// --- 7. GUESS HANDLING & ROW RENDERING ---
function getMcap(item) {
    return item.market_cap_usd_b !== undefined ? item.market_cap_usd_b : item.market_cap_cr;
}

function getOwnership(item) {
    return item.insider_pct !== undefined ? item.insider_pct : item.promoter_pct;
}

function handleGuess(guessData) {
    if (gameOver || guesses.length >= MAX_GUESSES) return;

    const isDuplicate = guesses.some(g => g.ticker === guessData.ticker);
    if (isDuplicate) {
        showToast("⚠️ Company already audited!");
        return;
    }

    guesses.push(guessData);
    renderRow(guessData, true, guesses.length - 1);
    
    const isWin = guessData.ticker === targetMetric.ticker;
    const isLoss = guesses.length >= MAX_GUESSES && !isWin;

    if (isWin || isLoss) {
        gameOver = true;
        saveState();
        endGame(isWin);
    } else {
        saveState();
        updateClueUI();
    }
}

function renderRow(guess, animate = false, rowIndex) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    
    const isTickerMatch = guess.ticker === targetMetric.ticker;
    const tickerDiv = createCell({ text: guess.ticker, cls: isTickerMatch ? 'correct' : 'wrong', arrow: '' }, animate, 0);
    
    const isSectorMatch = guess.sector === targetMetric.sector;
    const sectorDiv = createCell({ text: guess.sector, cls: isSectorMatch ? 'correct' : 'wrong', arrow: '' }, animate, 1);
    
    const mcapInfo = compareNumbers(getMcap(guess), getMcap(targetMetric), 'mcap');
    const mcapDiv = createCell(mcapInfo, animate, 2);

    const peInfo = compareNumbers(guess.pe_ratio, targetMetric.pe_ratio, 'pe');
    const peDiv = createCell(peInfo, animate, 3);

    const promInfo = compareNumbers(getOwnership(guess), getOwnership(targetMetric), 'promoter');
    const promDiv = createCell(promInfo, animate, 4);

    const debtInfo = compareNumbers(guess.debt_to_equity, targetMetric.debt_to_equity, 'debt');
    const debtDiv = createCell(debtInfo, animate, 5);

    row.append(tickerDiv, sectorDiv, mcapDiv, peDiv, promDiv, debtDiv);
    gridRows.appendChild(row);
}

function createCell(info, animate, delayIndex) {
    const div = document.createElement('div');
    div.className = info.cls;
    if (info.isLoss) div.classList.add('loss-cell');
    
    if (info.arrow) {
        div.innerHTML = `<span class="arrow">${info.arrow}</span><span>${info.text}</span>`;
    } else {
        div.innerText = info.text;
    }

    if (animate) {
        div.style.opacity = '0';
        div.classList.add('animate-flip');
        div.style.animationDelay = `${delayIndex * 0.15}s`;
    }
    return div;
}

// --- 8. VALUATION COMPARISON ENGINE (SMART DIRECTION ARROWS & LOSS LOGIC) ---
function compareNumbers(guessVal, targetVal, metricType) {
    const isGuessLoss = metricType === 'pe' && guessVal < 0;
    const isTargetLoss = metricType === 'pe' && targetVal < 0;

    let displayText = guessVal;
    if (isGuessLoss) displayText = 'N/A (Loss)';

    // Exact Match
    if (Math.abs(guessVal - targetVal) < 0.001) {
        return { text: displayText, cls: 'correct', arrow: '', isLoss: isGuessLoss };
    }

    // Absolute Tolerances for near-zero thresholds
    let absoluteBuffer = 0;
    if (metricType === 'debt') absoluteBuffer = 0.2;
    else if (metricType === 'promoter') absoluteBuffer = 5.0;
    else if (metricType === 'pe') absoluteBuffer = 3.0;

    const percentageTolerance = Math.abs(targetVal * 0.10);
    const effectiveTolerance = Math.max(percentageTolerance, absoluteBuffer);
    const diff = Math.abs(guessVal - targetVal);

    let isYellow = false;
    if ((guessVal < 0 && targetVal > 0) || (guessVal > 0 && targetVal < 0)) {
        isYellow = diff <= absoluteBuffer;
    } else {
        isYellow = diff <= effectiveTolerance;
    }

    // Directional Arrow Logic
    let arrow = '';
    if (isGuessLoss && !isTargetLoss) {
        // Target is profitable, guess is loss-making -> target is higher
        arrow = '⬆️';
    } else if (!isGuessLoss && isTargetLoss) {
        // Target is loss-making, guess is profitable -> target is lower
        arrow = '⬇️';
    } else {
        arrow = guessVal > targetVal ? '⬇️' : '⬆️';
    }

    return {
        text: displayText,
        cls: isYellow ? 'close' : 'wrong',
        arrow: arrow,
        isLoss: isGuessLoss
    };
}

// --- 9. CONCEDE AUDIT LINK ---
concedeBtn.addEventListener('click', () => {
    if (gameOver || guesses.length >= MAX_GUESSES) return;
    
    if (confirm("Concede this audit and issue a Disclaimer of Opinion?")) {
        gameOver = true;
        saveState();
        endGame(false, true);
    }
});

// --- 10. CLUE ROUTING & STRICT FUNDAMENTALIST SUPPRESSION ---
function updateClueUI() {
    if (gameMode === 'fundamentalist') {
        clueContainer.classList.add('hidden');
        return;
    }

    clueContainer.classList.remove('hidden');
    const fails = guesses.length;

    if (fails === 0) {
        if (clueTitleSpan) clueTitleSpan.innerText = "Engagement Scope:";
        clueText.innerText = targetOpeningFact ? targetOpeningFact.clues[0] : "Searching records...";
    } else if (fails === 1) {
        if (clueTitleSpan) clueTitleSpan.innerText = "Engagement Scope:";
        clueText.innerText = targetOpeningFact ? targetOpeningFact.clues[1] : targetFact.clues[0];
    } else if (fails === 2) {
        if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
        clueText.innerText = targetFact.clues[0];
    } else if (fails === 3) {
        if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
        clueText.innerText = targetFact.clues[1];
    } else {
        revealFullAuditorClue();
    }
}

function revealFullAuditorClue() {
    if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
    if (targetFact && targetFact.clues && targetFact.clues.length > 0) {
        clueText.innerText = targetFact.clues[targetFact.clues.length - 1];
    }
}

// --- 11. WIN / LOSS / CONCEDE MODAL FLOW ---
function endGame(isWin, isConceded = false) {
    searchInput.disabled = true;
    searchInput.placeholder = "Audit Complete.";
    concedeBtn.classList.add('hidden');

    // Reveal clue only if in Analyst mode
    if (gameMode === 'analyst') {
        clueContainer.classList.remove('hidden');
        revealFullAuditorClue();
    } else {
        clueContainer.classList.add('hidden');
    }

    // Populate Exact Target Multiples Card
    renderTargetStatsCard();
    
    setTimeout(() => {
        if (isWin) {
            modalTitle.innerText = "🎯 Target Identified";
            modalTitle.style.color = "var(--tile-correct)";
            modalMessage.innerText = `You figured it out in ${guesses.length}/${MAX_GUESSES} attempts!`;
        } else if (isConceded) {
            modalTitle.innerText = "📑 Audit Conceded";
            modalTitle.style.color = "var(--accent-gold)";
            modalMessage.innerText = "Disclaimer of opinion issued. Target revealed below.";
        } else {
            modalTitle.innerText = "❌ Due Diligence Failed";
            modalTitle.style.color = "var(--accent-gold)";
            modalMessage.innerText = "The books were too messy.";
        }

        targetCompanyName.innerText = targetMetric.company_name;
        modalNextBtn.classList.remove('hidden');
        mainNextBtn.classList.remove('hidden');
        
        if (!modalShown) {
            modal.classList.remove('hidden');
            modalShown = true;
            saveState();
        }
    }, isConceded ? 300 : 1100);
}

function renderTargetStatsCard() {
    const mcapVal = getMcap(targetMetric);
    const mcapStr = currentMarket === 'global' ? `$${mcapVal.toLocaleString()}B` : `₹${mcapVal.toLocaleString()}Cr`;
    const peStr = targetMetric.pe_ratio < 0 ? 'N/A (Loss)' : targetMetric.pe_ratio;
    const ownVal = getOwnership(targetMetric);
    const ownLabel = currentMarket === 'global' ? 'INSIDER' : 'PROM%';

    targetStatsCard.innerHTML = `
        <div class="stat-box">
            <span class="stat-label">MCAP</span>
            <span class="stat-value">${mcapStr}</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">P/E</span>
            <span class="stat-value">${peStr}</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">${ownLabel}</span>
            <span class="stat-value">${ownVal}%</span>
        </div>
        <div class="stat-box">
            <span class="stat-label">D/E</span>
            <span class="stat-value">${targetMetric.debt_to_equity}</span>
        </div>
    `;
    targetStatsCard.classList.remove('hidden');
}

// --- 12. NAVIGATION & POWER-USER KEYBOARD SHORTCUTS ---
closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

function goToNextPuzzle() {
    currentOrderIndex++;
    guesses = [];
    gameOver = false;
    modalShown = false;
    saveState();
    setupCurrentPuzzle();
}

modalNextBtn.addEventListener('click', goToNextPuzzle);
mainNextBtn.addEventListener('click', goToNextPuzzle);

// Global Keyboard Shortcuts (Enter for Next Puzzle, Escape to close modals)
window.addEventListener('keydown', (e) => {
    // If post-game modal is open
    if (!modal.classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            goToNextPuzzle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            modal.classList.add('hidden');
        }
        return;
    }

    // If mode selection modal is open
    if (!modeModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (!localStorage.getItem('CArtle_Mode')) {
                setMode('fundamentalist', true);
            } else {
                modeModal.classList.add('hidden');
            }
        }
    }
});

// --- 13. LOCAL STORAGE PERSISTENCE (INDEPENDENT PER MARKET) ---
function saveState() {
    const state = {
        currentOrderIndex: currentOrderIndex,
        guesses: guesses.map(g => g.ticker),
        gameOver: gameOver,
        modalShown: modalShown
    };
    localStorage.setItem(getStateStorageKey(), JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem(getStateStorageKey());
    if (!saved) {
        currentOrderIndex = 0;
        guesses = [];
        gameOver = false;
        modalShown = false;
        return;
    }

    try {
        const state = JSON.parse(saved);
        currentOrderIndex = state.currentOrderIndex || 0;
        gameOver = Boolean(state.gameOver);
        modalShown = Boolean(state.modalShown);
        
        guesses = [];
        if (Array.isArray(state.guesses)) {
            state.guesses.forEach(ticker => {
                const fullGuess = metricsData.find(m => m.ticker === ticker);
                if (fullGuess) guesses.push(fullGuess);
            });
        }
    } catch (e) {
        console.error("Failed to load state:", e);
    }
}

window.onload = init;