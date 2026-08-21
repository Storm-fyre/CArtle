const MAX_GUESSES = 5;
const LOCKED_CLUE_TEXT = "🔒 Classified Auditor Notes: ██████████ ████████ █████████ ████. (Redactions will lift after your 2nd attempt).";

let metricsData = [];
let factsData = [];
let targetMetric = null;
let targetFact = null;
let currentPuzzleIndex = 0; // Endless mode index
let guesses = [];
let gameOver = false;

// DOM Elements
const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const gridRows = document.getElementById('grid-rows');
const clueText = document.getElementById('clue-text');
const puzzleCounter = document.getElementById('puzzle-counter');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const targetCompanyName = document.getElementById('target-company-name');
const nextPuzzleBtn = document.getElementById('next-puzzle-btn');

// 1. Initialize Game
async function init() {
    try {
        const [metricsRes, factsRes] = await Promise.all([
            fetch('metrics.json'),
            fetch('facts.json')
        ]);
        
        metricsData = await metricsRes.json();
        factsData = await factsRes.json();
        
        loadState();
        setupCurrentPuzzle();
        
    } catch (error) {
        puzzleCounter.innerText = "Error loading data.";
        console.error("Initialization error:", error);
    }
}

// 2. Setup the target for the current puzzle
function setupCurrentPuzzle() {
    puzzleCounter.innerText = `#Puzzle ${currentPuzzleIndex + 1}`;
    
    // Modulo math ensures we loop through facts endlessly if we run out
    const factIndex = currentPuzzleIndex % factsData.length;
    targetFact = factsData[factIndex];
    targetMetric = metricsData.find(m => m.ticker === targetFact.ticker);

    // Reset UI
    gridRows.innerHTML = '';
    searchInput.disabled = false;
    searchInput.placeholder = "🔍 Type a company name or ticker...";
    searchInput.value = '';
    gameOver = false;
    modal.classList.add('hidden');
    updateClueUI();

    // Re-render saved guesses if any
    guesses.forEach((guess, idx) => {
        renderRow(guess, false, idx); 
    });
    
    if (guesses.length > 0) {
        checkGameStatus();
    }
}

// 3. Search & Autocomplete
searchInput.addEventListener('input', function() {
    let val = this.value;
    autocompleteList.innerHTML = '';
    if (!val) return;

    const matches = metricsData.filter(m => 
        m.company_name.toLowerCase().includes(val.toLowerCase()) || 
        m.ticker.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 5); 

    matches.forEach(match => {
        let div = document.createElement('div');
        div.innerHTML = `<strong>${match.ticker}</strong> - ${match.company_name}`;
        div.addEventListener('click', () => {
            searchInput.value = '';
            autocompleteList.innerHTML = '';
            handleGuess(match);
        });
        autocompleteList.appendChild(div);
    });
});

document.addEventListener('click', function (e) {
    if (e.target !== searchInput) {
        autocompleteList.innerHTML = '';
    }
});

// 4. Game Logic
function handleGuess(guessData) {
    if (gameOver || guesses.length >= MAX_GUESSES) return;

    guesses.push(guessData);
    saveState();
    renderRow(guessData, true, guesses.length - 1);
    checkGameStatus();
    updateClueUI();
}

function renderRow(guess, animate = false, rowIndex) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    
    // Words (Strict Green/Red)
    const isTickerMatch = guess.ticker === targetMetric.ticker;
    const tickerDiv = createCell({ text: guess.ticker, cls: isTickerMatch ? 'correct' : 'wrong', arrow: '' }, animate, 0);
    
    const isSectorMatch = guess.sector === targetMetric.sector;
    const sectorDiv = createCell({ text: guess.sector, cls: isSectorMatch ? 'correct' : 'wrong', arrow: '' }, animate, 1);
    
    // Numbers Math: Green (exact), Yellow (±10%), Red (outside)
    const mcapInfo = compareNumbers(guess.market_cap_cr, targetMetric.market_cap_cr);
    const mcapDiv = createCell(mcapInfo, animate, 2);

    const peInfo = compareNumbers(guess.pe_ratio, targetMetric.pe_ratio);
    const peDiv = createCell(peInfo, animate, 3);

    const promInfo = compareNumbers(guess.promoter_pct, targetMetric.promoter_pct);
    const promDiv = createCell(promInfo, animate, 4);

    const debtInfo = compareNumbers(guess.debt_to_equity, targetMetric.debt_to_equity);
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

function compareNumbers(guessVal, targetVal) {
    if (guessVal === targetVal) return { text: guessVal, cls: 'correct', arrow: '' };
    
    // Check if within +/- 10%
    const isYellow = Math.abs(guessVal - targetVal) <= Math.abs(targetVal * 0.1);
    const cls = isYellow ? 'close' : 'wrong';
    
    // Determine arrow
    const arrow = guessVal > targetVal ? '⬇️' : '⬆️';
    
    return { text: guessVal, cls: cls, arrow: arrow };
}

// 5. Clue Mechanics (Progressive Un-Redaction)
function updateClueUI() {
    const fails = guesses.length;
    
    // If they win, don't update to a new clue string, keep what they had
    if (guesses.length > 0 && guesses[guesses.length - 1].ticker === targetMetric.ticker) {
        return; 
    }

    if (fails === 0 || fails === 1) {
        clueText.innerText = LOCKED_CLUE_TEXT;
    } else if (fails === 2) {
        clueText.innerText = targetFact.clues[0]; // Heavy redact
    } else if (fails === 3) {
        clueText.innerText = targetFact.clues[1]; // Single redact
    } else if (fails === 4) {
        clueText.innerText = targetFact.clues[2]; // Full text (Final blind guess)
    }
}

// 6. Win / Loss Status
function checkGameStatus() {
    const lastGuess = guesses[guesses.length - 1];
    const isWin = lastGuess.ticker === targetMetric.ticker;

    if (isWin) {
        endGame(true);
    } else if (guesses.length >= MAX_GUESSES) {
        endGame(false);
    }
}

function endGame(isWin) {
    gameOver = true;
    searchInput.disabled = true;
    searchInput.placeholder = "Audit Complete.";
    
    setTimeout(() => {
        modalTitle.innerText = isWin ? "🎉 AUDIT PASSED 🎉" : "❌ AUDIT FAILED ❌";
        modalTitle.style.color = isWin ? "var(--neon-green)" : "var(--harsh-red)";
        modalMessage.innerText = isWin 
            ? `You figured it out in ${guesses.length}/${MAX_GUESSES} attempts!` 
            : `The books were too messy.`;
        targetCompanyName.innerText = targetMetric.company_name;
        
        nextPuzzleBtn.classList.remove('hidden');
        modal.classList.remove('hidden');
    }, 1200);
}

// 7. Endless Progression
nextPuzzleBtn.addEventListener('click', () => {
    // Increment puzzle, wipe guesses, save, and reload
    currentPuzzleIndex++;
    guesses = [];
    saveState();
    setupCurrentPuzzle();
});

// 8. Local Storage Save/Load
function saveState() {
    const state = {
        puzzleIndex: currentPuzzleIndex,
        guesses: guesses.map(g => g.ticker)
    };
    localStorage.setItem('CArtle_State', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('CArtle_State');
    if (!saved) return;

    const state = JSON.parse(saved);
    currentPuzzleIndex = state.puzzleIndex || 0;
    
    state.guesses.forEach(ticker => {
        const fullGuess = metricsData.find(m => m.ticker === ticker);
        if (fullGuess) {
            guesses.push(fullGuess);
        }
    });
}

// Boot up
window.onload = init;