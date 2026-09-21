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

// Active Settings (Loaded from storage or set via onboarding)
let currentMarket = localStorage.getItem('CArtle_Market') || null;
let gameMode = localStorage.getItem('CArtle_Mode') || null;

// Staged Settings for Next Puzzle (Modified via post-game modal)
let pendingMarket = currentMarket || 'india';
let pendingMode = gameMode || 'fundamentalist';

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

// Header Read-Only Status Badges
const headerMarketBadge = document.getElementById('header-market-badge');
const headerModeBadge = document.getElementById('header-mode-badge');

// Action Buttons
const concedeBtn = document.getElementById('concede-btn');
const mainNextBtn = document.getElementById('main-next-btn');

// Onboarding Modal Elements
const marketModal = document.getElementById('market-modal');
const btnMarketIndia = document.getElementById('btn-market-india');
const btnMarketGlobal = document.getElementById('btn-market-global');

const modeModal = document.getElementById('mode-modal');
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

// Post-Game Settings Toggles (Below Next Puzzle Button)
const postMarketIndia = document.getElementById('post-market-india');
const postMarketGlobal = document.getElementById('post-market-global');
const postModeFund = document.getElementById('post-mode-fund');
const postModeAnalyst = document.getElementById('post-mode-analyst');

// --- 1. INITIALIZATION & SEQUENTIAL ONBOARDING ---
async function init() {
    initTheme();

    // Step 1: Check if Market Jurisdiction is chosen
    if (!currentMarket) {
        marketModal.classList.remove('hidden');
        return; // Halt until Step 1 completes
    }

    // Step 2: Check if Audit Grade / Mode is chosen
    if (!gameMode) {
        modeModal.classList.remove('hidden');
        return; // Halt until Step 2 completes
    }

    // Both chosen: Launch Game
    await bootGameSession();
}

async function bootGameSession() {
    pendingMarket = currentMarket;
    pendingMode = gameMode;

    updateHeaderDisplay();

    const success = await loadMarketData(currentMarket);
    if (!success && currentMarket === 'global') {
        currentMarket = 'india';
        pendingMarket = 'india';
        localStorage.setItem('CArtle_Market', 'india');
        updateHeaderDisplay();
        await loadMarketData('india');
    }

    initPuzzleOrder();
    loadState();
    setupCurrentPuzzle();
}

// --- 2. ONBOARDING MODAL EVENT LISTENERS ---
// Step 1: Market Jurisdiction Selection
btnMarketIndia.addEventListener('click', () => {
    currentMarket = 'india';
    pendingMarket = 'india';
    localStorage.setItem('CArtle_Market', 'india');
    marketModal.classList.add('hidden');

    // Transition smoothly to Step 2 if mode is not set
    if (!gameMode) {
        modeModal.classList.remove('hidden');
    } else {
        bootGameSession();
    }
});

btnMarketGlobal.addEventListener('click', () => {
    currentMarket = 'global';
    pendingMarket = 'global';
    localStorage.setItem('CArtle_Market', 'global');
    marketModal.classList.add('hidden');

    // Transition smoothly to Step 2 if mode is not set
    if (!gameMode) {
        modeModal.classList.remove('hidden');
    } else {
        bootGameSession();
    }
});

// Step 2: Audit Grade Selection
btnModeFundamentalist.addEventListener('click', () => {
    gameMode = 'fundamentalist';
    pendingMode = 'fundamentalist';
    localStorage.setItem('CArtle_Mode', 'fundamentalist');
    modeModal.classList.add('hidden');
    bootGameSession();
});

btnModeAnalyst.addEventListener('click', () => {
    gameMode = 'analyst';
    pendingMode = 'analyst';
    localStorage.setItem('CArtle_Mode', 'analyst');
    modeModal.classList.add('hidden');
    bootGameSession();
});

// --- 3. MARKET DATA LOADER & HEADER FORMATTING ---
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
            throw new Error(`Data files missing for ${market}`);
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

function updateHeaderDisplay() {
    if (headerMarketBadge) {
        headerMarketBadge.textContent = currentMarket === 'global' ? '🌎 Global' : '🇮🇳 Dalal St';
    }
    if (headerModeBadge) {
        headerModeBadge.textContent = gameMode === 'fundamentalist' ? '📈 Fundamentalist' : '🎓 Analyst';
    }

    if (currentMarket === 'global') {
        if (colMcap) colMcap.textContent = 'MC($B)';
        if (colPromoter) colPromoter.textContent = 'INSIDER%';
    } else {
        if (colMcap) colMcap.textContent = 'MC(Cr)';
        if (colPromoter) colPromoter.textContent = 'PROM%';
    }
}

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

        // Strict Clue Rule: Clues are only unhidden in Analyst mode
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

// --- 8. VALUATION COMPARISON ENGINE (LOSS BADGING & DIRECTION ARROWS) ---
function compareNumbers(guessVal, targetVal, metricType) {
    const isGuessLoss = metricType === 'pe' && guessVal < 0;
    const isTargetLoss = metricType === 'pe' && targetVal < 0;

    let displayText = guessVal;
    if (isGuessLoss) displayText = 'N/A (Loss)';

    if (Math.abs(guessVal - targetVal) < 0.001) {
        return { text: displayText, cls: 'correct', arrow: '', isLoss: isGuessLoss };
    }

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

    let arrow = '';
    if (isGuessLoss && !isTargetLoss) {
        arrow = '⬆️';
    } else if (!isGuessLoss && isTargetLoss) {
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

// --- 11. WIN / LOSS / CONCEDE MODAL & POST-GAME TOGGLES ---
function endGame(isWin, isConceded = false) {
    searchInput.disabled = true;
    searchInput.placeholder = "Audit Complete.";
    concedeBtn.classList.add('hidden');

    if (gameMode === 'analyst') {
        clueContainer.classList.remove('hidden');
        revealFullAuditorClue();
    } else {
        clueContainer.classList.add('hidden');
    }

    renderTargetStatsCard();
    syncPostGameSettingsUI();
    
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

// Sync the post-game settings UI with staged preferences
function syncPostGameSettingsUI() {
    pendingMarket = currentMarket;
    pendingMode = gameMode;

    if (pendingMarket === 'india') {
        postMarketIndia.classList.add('active');
        postMarketGlobal.classList.remove('active');
    } else {
        postMarketGlobal.classList.add('active');
        postMarketIndia.classList.remove('active');
    }

    if (pendingMode === 'fundamentalist') {
        postModeFund.classList.add('active');
        postModeAnalyst.classList.remove('active');
    } else {
        postModeAnalyst.classList.add('active');
        postModeFund.classList.remove('active');
    }
}

// Post-Game Setting Switchers
postMarketIndia.addEventListener('click', () => {
    pendingMarket = 'india';
    postMarketIndia.classList.add('active');
    postMarketGlobal.classList.remove('active');
});

postMarketGlobal.addEventListener('click', () => {
    pendingMarket = 'global';
    postMarketGlobal.classList.add('active');
    postMarketIndia.classList.remove('active');
});

postModeFund.addEventListener('click', () => {
    pendingMode = 'fundamentalist';
    postModeFund.classList.add('active');
    postModeAnalyst.classList.remove('active');
});

postModeAnalyst.addEventListener('click', () => {
    pendingMode = 'analyst';
    postModeAnalyst.classList.add('active');
    postModeFund.classList.remove('active');
});

// --- 12. NAVIGATION & NEXT PUZZLE ADVANCEMENT ---
closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

async function goToNextPuzzle() {
    modal.classList.add('hidden');
    
    const marketChanged = pendingMarket !== currentMarket;
    const modeChanged = pendingMode !== gameMode;

    // Apply Mode change
    if (modeChanged) {
        gameMode = pendingMode;
        localStorage.setItem('CArtle_Mode', gameMode);
    }

    // Apply Market change
    if (marketChanged) {
        currentMarket = pendingMarket;
        localStorage.setItem('CArtle_Market', currentMarket);
        updateHeaderDisplay();
        
        await loadMarketData(currentMarket);
        initPuzzleOrder();
        loadState();
        setupCurrentPuzzle();
        return;
    }

    // Standard advancement within the same market
    updateHeaderDisplay();
    currentOrderIndex++;
    guesses = [];
    gameOver = false;
    modalShown = false;
    saveState();
    setupCurrentPuzzle();
}

modalNextBtn.addEventListener('click', goToNextPuzzle);
mainNextBtn.addEventListener('click', goToNextPuzzle);

// Keyboard controls
window.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('hidden')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            goToNextPuzzle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            modal.classList.add('hidden');
        }
    }
});

// --- 13. LOCAL STORAGE PERSISTENCE ---
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