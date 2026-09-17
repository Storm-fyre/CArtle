// --- THEME TOGGLE LOGIC ---
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

let metricsData = [];
let factsData = [];
let openingCluesData = [];

let targetMetric = null;
let targetFact = null;
let targetOpeningFact = null;

let puzzleOrder = []; 
let currentOrderIndex = 0; 
let guesses = [];
let gameOver = false;
let modalShown = false;

// Autocomplete Keyboard Navigation State
let activeAutocompleteIndex = -1;
let currentAutocompleteMatches = [];

// DOM Elements
const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const gridRows = document.getElementById('grid-rows');
const clueText = document.getElementById('clue-text');
const clueTitleSpan = document.querySelector('.clue-number');
const puzzleCounter = document.getElementById('puzzle-counter');

// Modal & Navigation Elements
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const targetCompanyName = document.getElementById('target-company-name');
const modalNextBtn = document.getElementById('modal-next-btn');
const mainNextBtn = document.getElementById('main-next-btn');
const closeModalBtn = document.getElementById('close-modal');

// 1. Initialize Game
async function init() {
    initTheme();
    try {
        const [metricsRes, factsRes, openingRes] = await Promise.all([
            fetch('metrics.json'),
            fetch('facts.json'),
            fetch('opening_clues.json')
        ]);
        
        metricsData = await metricsRes.json();
        factsData = await factsRes.json();
        openingCluesData = await openingRes.json();
        
        initPuzzleOrder();
        loadState();
        setupCurrentPuzzle();
        
    } catch (error) {
        puzzleCounter.innerText = "Error loading data.";
        console.error("Initialization error:", error);
    }
}

// 2. Randomized Endless Order Management (No Predictable Repeating Sequences)
function initPuzzleOrder() {
    const savedOrder = localStorage.getItem('CArtle_Order');
    if (savedOrder) {
        try {
            const parsed = JSON.parse(savedOrder);
            if (Array.isArray(parsed) && parsed.length === factsData.length) {
                puzzleOrder = parsed;
                return;
            }
        } catch (e) {
            console.error("Could not parse saved puzzle order, generating fresh sequence.", e);
        }
    }
    generateNewShuffle();
}

function generateNewShuffle() {
    puzzleOrder = factsData.map((_, i) => i);
    // Fisher-Yates Shuffle
    for (let i = puzzleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [puzzleOrder[i], puzzleOrder[j]] = [puzzleOrder[j], puzzleOrder[i]];
    }
    localStorage.setItem('CArtle_Order', JSON.stringify(puzzleOrder));
}

// 3. Setup Current Puzzle
function setupCurrentPuzzle() {
    if (currentOrderIndex >= puzzleOrder.length) {
        generateNewShuffle();
        currentOrderIndex = 0;
    }

    puzzleCounter.innerText = `Puzzle ${currentOrderIndex + 1}`;
    
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
    
    // Check if current puzzle is already completed
    const isCompleted = gameOver || guesses.length >= MAX_GUESSES || (guesses.length > 0 && guesses[guesses.length - 1].ticker === targetMetric.ticker);

    if (isCompleted) {
        gameOver = true;
        searchInput.disabled = true;
        searchInput.placeholder = "Audit Complete.";
        mainNextBtn.classList.remove('hidden');
        modalNextBtn.classList.remove('hidden');

        // Render previous guesses statically without animation
        guesses.forEach((guess, idx) => {
            renderRow(guess, false, idx);
        });

        // Show full forensic clue payoff
        revealFullAuditorClue();
    } else {
        gameOver = false;
        modalShown = false;
        searchInput.disabled = false;
        searchInput.placeholder = "Guess a company name or ticker...";
        searchInput.value = '';
        modal.classList.add('hidden');
        mainNextBtn.classList.add('hidden');
        modalNextBtn.classList.add('hidden');

        guesses.forEach((guess, idx) => {
            renderRow(guess, false, idx);
        });

        updateClueUI();

        if (window.innerWidth > 768) {
            searchInput.focus();
        }
    }
}

// 4. Search, Autocomplete & Keyboard Navigation
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

    // Ranked match: Ticker exact -> Ticker prefix -> Name prefix -> Substring
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
        div.addEventListener('click', () => {
            selectCandidate(match);
        });
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

// 5. Toast Feedback for Duplicate Guesses
function showToast(message) {
    let existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 6. Game Logic & Validation
function handleGuess(guessData) {
    if (gameOver || guesses.length >= MAX_GUESSES) return;

    // Prevent duplicate entries
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
    
    const mcapInfo = compareNumbers(guess.market_cap_cr, targetMetric.market_cap_cr, 'mcap');
    const mcapDiv = createCell(mcapInfo, animate, 2);

    const peInfo = compareNumbers(guess.pe_ratio, targetMetric.pe_ratio, 'pe');
    const peDiv = createCell(peInfo, animate, 3);

    const promInfo = compareNumbers(guess.promoter_pct, targetMetric.promoter_pct, 'promoter');
    const promDiv = createCell(promInfo, animate, 4);

    const debtInfo = compareNumbers(guess.debt_to_equity, targetMetric.debt_to_equity, 'debt');
    const debtDiv = createCell(debtInfo, animate, 5);

    row.append(tickerDiv, sectorDiv, mcapDiv, peDiv, promDiv, debtDiv);
    gridRows.appendChild(row);
}

function createCell(info, animate, delayIndex) {
    const div = document.createElement('div');
    div.className = info.cls;
    
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

// 7. Valuation Comparison Engine (Zero Value & Absolute Fallbacks)
function compareNumbers(guessVal, targetVal, metricType) {
    // Exact floating-point match check
    const diff = Math.abs(guessVal - targetVal);
    if (diff < 0.001) {
        return { text: guessVal, cls: 'correct', arrow: '' };
    }

    // Absolute tolerances for zero / near-zero targets
    let absoluteBuffer = 0;
    if (metricType === 'debt') {
        absoluteBuffer = 0.2;     // Within 0.2 D/E is close (yellow)
    } else if (metricType === 'promoter') {
        absoluteBuffer = 5.0;     // Within 5.0% promoter holding is close (yellow)
    } else if (metricType === 'pe') {
        absoluteBuffer = 3.0;     // Within 3.0 P/E points is close (yellow)
    }

    const percentageTolerance = Math.abs(targetVal * 0.10);
    const effectiveTolerance = Math.max(percentageTolerance, absoluteBuffer);

    let isYellow = false;
    // Suppress proximity if signs differ unless within absolute buffer
    if ((guessVal < 0 && targetVal > 0) || (guessVal > 0 && targetVal < 0)) {
        isYellow = diff <= absoluteBuffer;
    } else {
        isYellow = diff <= effectiveTolerance;
    }

    const cls = isYellow ? 'close' : 'wrong';
    const arrow = guessVal > targetVal ? '⬇️' : '⬆️';
    
    return { text: guessVal, cls: cls, arrow: arrow };
}

// 8. Progressive 5-Stage Clue Routing
function updateClueUI() {
    const fails = guesses.length;

    if (fails === 0) {
        // Turn 1 (Opening Screen): Sentence 1 (Redacted)
        if (clueTitleSpan) clueTitleSpan.innerText = "Engagement Scope:";
        clueText.innerText = targetOpeningFact ? targetOpeningFact.clues[0] : "Searching records...";
    } else if (fails === 1) {
        // Turn 2: Sentence 1 (Unredacted)
        if (clueTitleSpan) clueTitleSpan.innerText = "Engagement Scope:";
        clueText.innerText = targetOpeningFact ? targetOpeningFact.clues[1] : targetFact.clues[0];
    } else if (fails === 2) {
        // Turn 3: Sentence 2 (Heavy Redaction)
        if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
        clueText.innerText = targetFact.clues[0];
    } else if (fails === 3) {
        // Turn 4: Sentence 2 (Moderate Redaction)
        if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
        clueText.innerText = targetFact.clues[1];
    } else {
        // Turn 5 / Win: Sentence 2 (Fully Revealed)
        revealFullAuditorClue();
    }
}

function revealFullAuditorClue() {
    if (clueTitleSpan) clueTitleSpan.innerText = "Notes to Accounts:";
    if (targetFact && targetFact.clues && targetFact.clues.length > 0) {
        clueText.innerText = targetFact.clues[targetFact.clues.length - 1];
    }
}

// 9. Win / Loss Status & Modal Flow
function endGame(isWin) {
    searchInput.disabled = true;
    searchInput.placeholder = "Audit Complete.";
    revealFullAuditorClue();
    
    setTimeout(() => {
        modalTitle.innerText = isWin ? "🎯 Target Identified" : "❌ Due Diligence Failed";
        modalTitle.style.color = isWin ? "var(--tile-correct)" : "var(--accent-gold)";
        modalMessage.innerText = isWin 
            ? `You figured it out in ${guesses.length}/${MAX_GUESSES} attempts!` 
            : `The books were too messy.`;
        targetCompanyName.innerText = targetMetric.company_name;
        
        modalNextBtn.classList.remove('hidden');
        mainNextBtn.classList.remove('hidden');
        
        if (!modalShown) {
            modal.classList.remove('hidden');
            modalShown = true;
            saveState();
        }
    }, 1100);
}

// 10. Modal Navigation & Progression
closeModalBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});

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

// 11. Local Storage Persistence
function saveState() {
    const state = {
        currentOrderIndex: currentOrderIndex,
        guesses: guesses.map(g => g.ticker),
        gameOver: gameOver,
        modalShown: modalShown
    };
    localStorage.setItem('CArtle_State', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('CArtle_State');
    if (!saved) return;

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
        console.error("Failed to load saved state:", e);
    }
}

window.onload = init;