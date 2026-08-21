const MAX_GUESSES = 5;
const LAUNCH_DATE_STR = "2026-08-20T00:00:00+05:30"; // Set to 1 day prior to launch to make launch date 'Day 1'

let metricsData = [];
let factsData = [];
let targetMetric = null;
let targetFact = null;
let currentDay = 1;
let guesses = [];
let gameOver = false;

// DOM Elements
const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const gridRows = document.getElementById('grid-rows');
const clueContainer = document.getElementById('clue-container');
const clueText = document.getElementById('clue-text');
const dayCounter = document.getElementById('day-counter');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const targetCompanyName = document.getElementById('target-company-name');

// 1. Initialize Game
async function init() {
    try {
        const [metricsRes, factsRes] = await Promise.all([
            fetch('metrics.json'),
            fetch('facts.json')
        ]);
        
        metricsData = await metricsRes.json();
        factsData = await factsRes.json();
        
        calculateDayAndTarget();
        loadState();
        searchInput.disabled = false; // Enable gameplay
        
    } catch (error) {
        dayCounter.innerText = "Error loading data. Are you on a local server?";
        console.error("Initialization error:", error);
    }
}

// 2. Timezone & Target Math
function calculateDayAndTarget() {
    const getISTDate = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayIST = getISTDate();
    todayIST.setHours(0,0,0,0);
    
    const launchDate = new Date(LAUNCH_DATE_STR);
    launchDate.setHours(0,0,0,0);
    
    const diffTime = todayIST - launchDate;
    currentDay = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    dayCounter.innerText = `#Day ${currentDay}`;

    // Select target based on day (modulo 30 for loop)
    const factIndex = (currentDay - 1) % factsData.length;
    targetFact = factsData[factIndex];
    targetMetric = metricsData.find(m => m.ticker === targetFact.ticker);
}

// 3. Search & Autocomplete
searchInput.addEventListener('input', function() {
    let val = this.value;
    autocompleteList.innerHTML = '';
    if (!val) return;

    const matches = metricsData.filter(m => 
        m.company_name.toLowerCase().includes(val.toLowerCase()) || 
        m.ticker.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 5); // Limit dropdown size

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

// Close dropdown if clicked outside
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
    renderRow(guessData, true); // true = animate
    checkGameStatus();
    updateClue();
}

function renderRow(guess, animate = false) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    
    // Ticker
    const isTickerMatch = guess.ticker === targetMetric.ticker;
    const tickerDiv = createCell(guess.ticker, isTickerMatch ? 'correct' : 'wrong', animate, 0);
    
    // Sector
    const isSectorMatch = guess.sector === targetMetric.sector;
    const sectorDiv = createCell(guess.sector, isSectorMatch ? 'correct' : 'wrong', animate, 1);
    
    // Numbers Math: higher means guess is smaller than target
    const mcapInfo = compareMetrics(guess.market_cap_cr, targetMetric.market_cap_cr);
    const mcapDiv = createCell(mcapInfo.text, mcapInfo.cls, animate, 2);

    const peInfo = compareMetrics(guess.pe_ratio, targetMetric.pe_ratio);
    const peDiv = createCell(peInfo.text, peInfo.cls, animate, 3);

    const promInfo = compareMetrics(guess.promoter_pct, targetMetric.promoter_pct);
    const promDiv = createCell(promInfo.text, promInfo.cls, animate, 4);

    const debtInfo = compareMetrics(guess.debt_to_equity, targetMetric.debt_to_equity);
    const debtDiv = createCell(debtInfo.text, debtInfo.cls, animate, 5);

    row.append(tickerDiv, sectorDiv, mcapDiv, peDiv, promDiv, debtDiv);
    gridRows.appendChild(row);
}

function createCell(text, className, animate, delayIndex) {
    const div = document.createElement('div');
    div.innerText = text;
    div.className = className;
    if (animate) {
        div.style.opacity = '0';
        div.classList.add('animate-flip');
        div.style.animationDelay = `${delayIndex * 0.15}s`;
    }
    return div;
}

function compareMetrics(guessVal, targetVal) {
    if (guessVal === targetVal) return { text: guessVal, cls: 'correct' };
    if (guessVal > targetVal) return { text: `⬇️\n${guessVal}`, cls: 'wrong' };
    return { text: `⬆️\n${guessVal}`, cls: 'wrong' };
}

// 5. Clue Mechanics
function updateClue() {
    if (guesses.length === 0 || gameOver) return;
    
    const isWin = guesses[guesses.length - 1].ticker === targetMetric.ticker;
    if (isWin) return; // Don't show new clue if they just won
    
    // 1 fail = clue[0], 2 fails = clue[1], 3 or 4 fails = clue[2]
    const clueIndex = Math.min(guesses.length - 1, 2);
    clueText.innerText = targetFact.clues[clueIndex];
    clueContainer.classList.remove('hidden');
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
    searchInput.placeholder = "Game Over for today.";
    
    setTimeout(() => {
        modalTitle.innerText = isWin ? "🎉 AUDIT PASSED 🎉" : "❌ AUDIT FAILED ❌";
        modalTitle.style.color = isWin ? "var(--neon-green)" : "var(--harsh-red)";
        modalMessage.innerText = isWin 
            ? `You figured it out in ${guesses.length}/${MAX_GUESSES} attempts!` 
            : `Better luck tomorrow.`;
        targetCompanyName.innerText = targetMetric.company_name;
        modal.classList.remove('hidden');
    }, 1200); // Wait for animations to finish
}

// 7. Local Storage Save/Load
function saveState() {
    const state = {
        day: currentDay,
        guesses: guesses.map(g => g.ticker)
    };
    localStorage.setItem('CArtle_State', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('CArtle_State');
    if (!saved) return;

    const state = JSON.parse(saved);
    if (state.day === currentDay) {
        // Re-hydrate the board from saved tickers
        state.guesses.forEach(ticker => {
            const fullGuess = metricsData.find(m => m.ticker === ticker);
            if (fullGuess) {
                guesses.push(fullGuess);
                renderRow(fullGuess, false); // false = no animation on load
            }
        });
        checkGameStatus();
        updateClue();
    } else {
        localStorage.removeItem('CArtle_State'); // clear old state
    }
}

// Boot up
window.onload = init;