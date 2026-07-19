// Data version — increment this whenever porra_data.json match IDs are reindexed
// so that any stale localStorage draft is automatically discarded.
const RESULTS_DATA_VERSION = 3;

// State variables
let porraData = null;
let results = null;
let officialResults = null;
const provisionalMatches = new Set(); // Track matches loaded dynamically from the API
let activeTab = 'clasificacion';
let currentFilter = 'all';
let evolutionChart = null;

// Global Match Number to Match Key mappings
const MATCH_KEYS_BY_NUMBER = {
    // R32
    '73': '2A-2B',
    '74': '1C-2F',
    '75': '1E-3ABCDF',
    '76': '1F-2C',
    '77': '2E-2I',
    '78': '1I-3CDFGH',
    '79': '1A-3CEFHI',
    '80': '1L-3EHIJK',
    '81': '1G-3AEHIJ',
    '82': '1D-3BEFIJ',
    '83': '1H-2J',
    '84': '2K-2L',
    '85': '1B-3EFGIJ',
    '86': '2D-2G',
    '87': '1J-2H',
    '88': '1K-3DEIJL',
    // R16
    '89': 'W74-W77',
    '90': 'W73-W75',
    '91': 'W76-W78',
    '92': 'W79-W80',
    '93': 'W83-W84',
    '94': 'W81-W82',
    '95': 'W86-W88',
    '96': 'W85-W87',
    // R8
    '97': 'W89-W90',
    '98': 'W93-W94',
    '99': 'W91-W92',
    '100': 'W95-W96',
    // R4
    '101': 'W97-W98',
    '102': 'W99-W100'
};

// Global KO match dates
const koMatchDates = {
    '2A-2B': '28 Jun 21:00',
    '1C-2F': '29 Jun 19:00',
    '1E-3ABCDF': '29 Jun 22:30',
    '1F-2C': '30 Jun 03:00',
    '2E-2I': '30 Jun 19:00',
    '1I-3CDFGH': '30 Jun 23:00',
    '1A-3CEFHI': '01 Jul 03:00',
    '1L-3EHIJK': '01 Jul 18:00',
    '1G-3AEHIJ': '01 Jul 22:00',
    '1D-3BEFIJ': '02 Jul 02:00',
    '1H-2J': '02 Jul 21:00',
    '2K-2L': '03 Jul 01:00',
    '1B-3EFGIJ': '03 Jul 05:00',
    '2D-2G': '03 Jul 20:00',
    '1J-2H': '04 Jul 00:00',
    '1K-3DEIJL': '04 Jul 03:30',
    'W74-W77': '04 Jul 19:00',
    'W73-W75': '04 Jul 23:00',
    'W76-W78': '05 Jul 22:00',
    'W79-W80': '06 Jul 02:00',
    'W83-W84': '06 Jul 21:00',
    'W81-W82': '07 Jul 02:00',
    'W86-W88': '07 Jul 18:00',
    'W85-W87': '07 Jul 22:00',
    'W89-W90': '09 Jul 22:00',
    'W93-W94': '10 Jul 21:00',
    'W91-W92': '11 Jul 23:00',
    'W95-W96': '12 Jul 03:00',
    'W97-W98': '14 Jul 21:00',
    'W99-W100': '15 Jul 21:00',
    'r3_4_match': '18 Jul 23:00',
    'final_match': '19 Jul 21:00'
};

// Merges cached live results into the in-memory results object
function mergeLiveCache() {
    const liveCache = localStorage.getItem('porra_live_results_cache');
    if (!liveCache) return;
    
    try {
        const parsedCache = JSON.parse(liveCache);
        
        // Merge group stage matches
        if (parsedCache.matches) {
            for (const [matchId, score] of Object.entries(parsedCache.matches)) {
                // If official score is empty, use the live cached score
                if ((!officialResults.matches[matchId] || officialResults.matches[matchId].trim() === "") && score && score.trim() !== "") {
                    results.matches[matchId] = score;
                }
            }
        }
        
        // Merge K.O. stages
        const stages = ['r32_matches', 'r16_matches', 'r8_matches', 'r4_matches'];
        stages.forEach(stage => {
            if (typeof isStageActive === 'function' && !isStageActive(stage)) return;
            if (parsedCache[stage]) {
                for (const [key, matchObj] of Object.entries(parsedCache[stage])) {
                    if (matchObj && matchObj.score && matchObj.score.trim() !== "") {
                        if (results[stage] && results[stage][key] && (!officialResults[stage] || !officialResults[stage][key] || !officialResults[stage][key].score || officialResults[stage][key].score.trim() === "")) {
                            results[stage][key].score = matchObj.score;
                            if (matchObj.matchup) {
                                results[stage][key].matchup = matchObj.matchup;
                            }
                        }
                    }
                }
            }
        });
        
        // Single matches (final and 3-4 place)
        const singleMatches = ['r3_4_match', 'final_match'];
        singleMatches.forEach(key => {
            if (typeof isStageActive === 'function' && !isStageActive(key)) return;
            if (parsedCache[key] && parsedCache[key].score && parsedCache[key].score.trim() !== "") {
                if (results[key] && (!officialResults[key] || !officialResults[key].score || officialResults[key].score.trim() === "")) {
                    results[key].score = parsedCache[key].score;
                    if (parsedCache[key].matchup) {
                        results[key].matchup = parsedCache[key].matchup;
                    }
                }
            }
        });
        
        // Qualified teams lists (r32_teams, r16_teams, etc.)
        const teamLists = ['r32_teams', 'r16_teams', 'r8_teams', 'r4_teams', 'r3_4_teams', 'final_teams'];
        teamLists.forEach(listKey => {
            if (typeof isStageActive === 'function' && !isStageActive(listKey)) return;
            if (parsedCache[listKey] && Array.isArray(parsedCache[listKey])) {
                parsedCache[listKey].forEach(team => {
                    if (results[listKey] && !results[listKey].includes(team)) {
                        results[listKey].push(team);
                    }
                });
            }
        });

        // Honor list honors
        const honors = ['honor_champ', 'honor_runner', 'honor_3rd', 'honor_4th'];
        honors.forEach(honorKey => {
            if (parsedCache[honorKey] && parsedCache[honorKey].trim() !== "" && (!officialResults[honorKey] || officialResults[honorKey].trim() === "")) {
                results[honorKey] = parsedCache[honorKey];
            }
        });

        // Provisional matches list
        if (parsedCache.provisionalMatches && Array.isArray(parsedCache.provisionalMatches)) {
            parsedCache.provisionalMatches.forEach(id => provisionalMatches.add(String(id)));
            results.provisionalMatches = Array.from(provisionalMatches);
        }
    } catch (e) {
        console.error("Error parsing live results cache:", e);
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    setupEventListeners();
});

// Initialize application data
async function initApp() {
    try {
        // Load static porra configuration
        const dataResponse = await fetch(`porra_data.json?t=${Date.now()}`);
        porraData = await dataResponse.json();
        
        // Clean up spreadsheet artifact group labels (e.g. "Pos", 1, 2, 3, 4) in-place
        let currentGroup = "";
        porraData.matches.forEach(m => {
            if (m.grupo && typeof m.grupo === 'string' && m.grupo.startsWith("Grupo ")) {
                currentGroup = m.grupo;
            }
            m.grupo = currentGroup;
        });
        
        // Load officialResults draft from localStorage if it exists, otherwise fetch results.json
        const draft = localStorage.getItem('porra_results_draft');
        if (draft) {
            try {
                const parsedDraft = JSON.parse(draft);

                // Version check: discard draft if it was saved with an older data version
                if (parsedDraft._dataVersion !== RESULTS_DATA_VERSION) {
                    console.warn(`localStorage draft version mismatch (draft v${parsedDraft._dataVersion || 'unknown'} vs current v${RESULTS_DATA_VERSION}). Discarding stale draft.`);
                    localStorage.removeItem('porra_results_draft');
                } else {
                    officialResults = parsedDraft;

                    // Migrate old K.O. keys if present in the draft
                    if (officialResults.r8_matches && officialResults.r8_matches["W89-W93"]) {
                        console.log("Migrating results draft with old K.O. keys to new official structure...");

                        const r8Mapping = {
                            "W89-W93": "W89-W90",
                            "W90-W94": "W93-W94",
                            "W91-W95": "W91-W92",
                            "W92-W96": "W95-W96"
                        };
                        const newR8Matches = {};
                        Object.entries(officialResults.r8_matches).forEach(([oldKey, matchObj]) => {
                            const newKey = r8Mapping[oldKey] || oldKey;
                            newR8Matches[newKey] = matchObj;
                        });
                        officialResults.r8_matches = newR8Matches;

                        const r4Mapping = {
                            "W97-W99": "W97-W98",
                            "W98-W100": "W99-W100"
                        };
                        const newR4Matches = {};
                        Object.entries(officialResults.r4_matches).forEach(([oldKey, matchObj]) => {
                            const newKey = r4Mapping[oldKey] || oldKey;
                            newR4Matches[newKey] = matchObj;
                        });
                        officialResults.r4_matches = newR4Matches;

                        // Save the migrated draft back to localStorage
                        localStorage.setItem('porra_results_draft', JSON.stringify(officialResults));
                    }

                    console.log("Loaded official results from localStorage draft (v" + RESULTS_DATA_VERSION + ")");
                }
            } catch (e) {
                console.error("Error parsing localStorage draft", e);
                localStorage.removeItem('porra_results_draft');
            }
        }
        
        // Always fetch the server's results.json for group stage match scores.
        // This makes results.json the single source of truth for group stage data,
        // regardless of what the localStorage draft may contain.
        // The localStorage draft is only used for KO stages and admin bonus entries.
        const resResponse = await fetch(`results.json?t=${Date.now()}`);
        const serverResults = await resResponse.json();
        console.log("Loaded group stage results from results.json (server)");

        if (!officialResults) {
            officialResults = serverResults;
        } else {
            // Merge: always use server's group stage scores and standings
            officialResults.matches = serverResults.matches;
            officialResults.group_standings = serverResults.group_standings;

            // Merge K.O. matches: if server has a score/matchup, use it to update the draft
            const koStages = ['r32_matches', 'r16_matches', 'r8_matches', 'r4_matches'];
            koStages.forEach(stage => {
                if (serverResults[stage]) {
                    if (!officialResults[stage]) officialResults[stage] = {};
                    for (const [key, matchObj] of Object.entries(serverResults[stage])) {
                        if (!officialResults[stage][key]) {
                            officialResults[stage][key] = { ...matchObj };
                        } else {
                            if (matchObj.matchup && matchObj.matchup.trim() !== "") {
                                officialResults[stage][key].matchup = matchObj.matchup;
                            }
                            if (matchObj.score && matchObj.score.trim() !== "") {
                                officialResults[stage][key].score = matchObj.score;
                            }
                        }
                    }
                }
            });

            // Merge single matches (final, 3rd place)
            ['r3_4_match', 'final_match'].forEach(key => {
                if (serverResults[key]) {
                    if (!officialResults[key]) officialResults[key] = { matchup: '', score: '' };
                    if (serverResults[key].matchup && serverResults[key].matchup.trim() !== "") {
                        officialResults[key].matchup = serverResults[key].matchup;
                    }
                    if (serverResults[key].score && serverResults[key].score.trim() !== "") {
                        officialResults[key].score = serverResults[key].score;
                    }
                }
            });

            // Merge team lists
            const teamLists = ['r32_teams', 'r16_teams', 'r8_teams', 'r4_teams', 'r3_4_teams', 'final_teams'];
            teamLists.forEach(listKey => {
                if (serverResults[listKey] && Array.isArray(serverResults[listKey]) && serverResults[listKey].length > 0) {
                    officialResults[listKey] = [...serverResults[listKey]];
                }
            });

            // Merge honors list
            const honors = ['honor_champ', 'honor_runner', 'honor_3rd', 'honor_4th', 'honor_scorer', 'honor_assists', 'honor_mvp', 'honor_gk', 'honor_young'];
            honors.forEach(honorKey => {
                if (serverResults[honorKey] && serverResults[honorKey].trim() !== "") {
                    officialResults[honorKey] = serverResults[honorKey];
                }
            });
        }

        // Clean officialResults template if some keys are missing
        if (!officialResults.matches) officialResults.matches = {};
        if (!officialResults.group_standings) officialResults.group_standings = {};
        if (!officialResults.r32_teams) officialResults.r32_teams = [];
        if (!officialResults.r32_matches) officialResults.r32_matches = {};
        if (!officialResults.r16_teams) officialResults.r16_teams = [];
        if (!officialResults.r16_matches) officialResults.r16_matches = {};
        if (!officialResults.r8_teams) officialResults.r8_teams = [];
        if (!officialResults.r8_matches) officialResults.r8_matches = {};
        if (!officialResults.r4_teams) officialResults.r4_teams = [];
        if (!officialResults.r4_matches) officialResults.r4_matches = {};
        if (!officialResults.r3_4_teams) officialResults.r3_4_teams = [];
        if (!officialResults.final_teams) officialResults.final_teams = [];
        if (!officialResults.r3_4_match) officialResults.r3_4_match = { matchup: '', score: '' };
        if (!officialResults.final_match) officialResults.final_match = { matchup: '', score: '' };

        // Clone officialResults into results
        results = JSON.parse(JSON.stringify(officialResults));

        // 1. Populate provisionalMatches from results.json (if present)
        provisionalMatches.clear();
        if (results.provisionalMatches && Array.isArray(results.provisionalMatches)) {
            results.provisionalMatches.forEach(id => provisionalMatches.add(String(id)));
        }

        // 2. Merge dynamic live scores cache
        mergeLiveCache();

        // 3. Process points and render UI immediately
        updateAppUI();

        // 4. Setup live matches check and auto-refresh
        setupLiveRefresh();
        // Check periodically if matches have started to enable/disable live refreshes
        setInterval(setupLiveRefresh, 5 * 60 * 1000);

    } catch (e) {
        console.error("Error loading application files", e);
        alert("Error al cargar los datos de la porra. Asegúrate de que porra_data.json y results.json estén en la misma carpeta.");
    }
}

// Calculate points and render sections
function updateAppUI() {
    if (!porraData || !results) return;
    
    // 1. Calculate player standings
    const standings = calculateStandings();
    
    // 2. Render classification table
    renderStandings(standings);
    
    // 3. Render matches calendar
    renderMatches();
    
    // 4. Update Header badge with total matches played
    const playedCount = Object.values(results.matches).filter(val => val && val.trim() !== "").length;
    document.getElementById('matches-played-badge').innerText = `${playedCount} / 72 Partidos Jugados`;

    // 5. Render Points Evolution Chart
    renderEvolutionChart();

    // 6. Render K.O. Rounds
    renderKORounds();

    // 7. Render Group Standings Tables
    renderGroupTables();
}

// Completion check helpers for tournament stages
function isGroupStageCompleted() {
    if (!porraData || !porraData.matches || !results || !results.matches) return false;
    const groupMatches = porraData.matches.filter(m => m.jor === 'J1' || m.jor === 'J2' || m.jor === 'J3');
    if (groupMatches.length === 0) return false;
    return groupMatches.every(m => {
        const score = results.matches[m.id];
        return score && score.trim() !== "";
    });
}

function isR32Completed() {
    if (!isGroupStageCompleted()) return false;
    if (!results || !results.r32_matches) return false;
    const keys = Object.keys(results.r32_matches);
    if (keys.length < 16) return false;
    return keys.every(key => {
        const m = results.r32_matches[key];
        return m && m.score && m.score.trim() !== "";
    });
}

function isR16Completed() {
    if (!isR32Completed()) return false;
    if (!results || !results.r16_matches) return false;
    const keys = Object.keys(results.r16_matches);
    if (keys.length < 8) return false;
    return keys.every(key => {
        const m = results.r16_matches[key];
        return m && m.score && m.score.trim() !== "";
    });
}

function isR8Completed() {
    if (!isR16Completed()) return false;
    if (!results || !results.r8_matches) return false;
    const keys = Object.keys(results.r8_matches);
    if (keys.length < 4) return false;
    return keys.every(key => {
        const m = results.r8_matches[key];
        return m && m.score && m.score.trim() !== "";
    });
}

function isR4Completed() {
    if (!isR8Completed()) return false;
    if (!results || !results.r4_matches) return false;
    const keys = Object.keys(results.r4_matches);
    if (keys.length < 2) return false;
    return keys.every(key => {
        const m = results.r4_matches[key];
        return m && m.score && m.score.trim() !== "";
    });
}

function isStageActive(stageName) {
    if (stageName === 'group_stage' || stageName === 'group_standings') {
        return true;
    }
    // Todas las fases eliminatorias (K.O.) se activan una vez que la fase de grupos está completada,
    // de modo que se puedan ir sumando provisionalmente los puntos de los equipos clasificados y partidos disputados.
    return isGroupStageCompleted();
}

// Fill Round of 32 matchups and qualified teams provisionally based on group standings
function fillProvisionalR32Matchups() {
    if (!results || !results.r32_matches) return;
    
    // Calculate standings dynamically
    const data = calculateGroupStandings();
    const standingsByGroup = data.standingsByGroup;
    const thirds = data.thirds;
    
    if (!standingsByGroup || !thirds) return;

    // Slots for the 8 best thirds
    const slotsInfo = [
        { key: '1E-3ABCDF', allowed: ['A', 'B', 'C', 'D', 'F'] },
        { key: '1I-3CDFGH', allowed: ['C', 'D', 'F', 'G', 'H'] },
        { key: '1A-3CEFHI', allowed: ['C', 'E', 'F', 'H', 'I'] },
        { key: '1L-3EHIJK', allowed: ['E', 'H', 'I', 'J', 'K'] },
        { key: '1G-3AEHIJ', allowed: ['A', 'E', 'H', 'I', 'J'] },
        { key: '1D-3BEFIJ', allowed: ['B', 'E', 'F', 'I', 'J'] },
        { key: '1B-3EFGIJ', allowed: ['E', 'F', 'G', 'I', 'J'] },
        { key: '1K-3DEIJL', allowed: ['D', 'E', 'I', 'J', 'L'] }
    ];

    const qualifiedThirds = thirds.slice(0, 8);
    const thirdsAssignment = {};
    const usedTeams = new Set();

    function backtrack(slotIdx) {
        if (slotIdx === slotsInfo.length) {
            return true;
        }
        const slot = slotsInfo[slotIdx];
        for (let i = 0; i < qualifiedThirds.length; i++) {
            const team = qualifiedThirds[i];
            if (!usedTeams.has(team.name) && slot.allowed.includes(team.group)) {
                thirdsAssignment[slot.key] = team.name;
                usedTeams.add(team.name);
                if (backtrack(slotIdx + 1)) {
                    return true;
                }
                usedTeams.delete(team.name);
                delete thirdsAssignment[slot.key];
            }
        }
        return false;
    }

    if (!backtrack(0)) {
        // Fallback greedy
        const assigned = new Set();
        slotsInfo.forEach(slot => {
            const match = qualifiedThirds.find(t => !assigned.has(t.name) && slot.allowed.includes(t.group));
            if (match) {
                thirdsAssignment[slot.key] = match.name;
                assigned.add(match.name);
            } else {
                const anyUnassigned = qualifiedThirds.find(t => !assigned.has(t.name));
                if (anyUnassigned) {
                    thirdsAssignment[slot.key] = anyUnassigned.name;
                    assigned.add(anyUnassigned.name);
                }
            }
        });
    }

    // Help resolve placeholder: e.g. "1A" -> Winner of Group A
    function resolveTeamPlaceholder(code, standingsByGroup) {
        const match = code.match(/^(\d)([A-L])$/);
        if (match) {
            const pos = parseInt(match[1]); // 1 or 2
            const group = match[2]; // 'A'..'L'
            const teams = standingsByGroup[group];
            if (teams && teams[pos - 1]) {
                return teams[pos - 1].name;
            }
        }
        return null;
    }

    // Now resolve each of the 16 matches in results.r32_matches
    Object.keys(results.r32_matches).forEach(key => {
        // Check if matchup is already officially set in officialResults.r32_matches
        if (officialResults.r32_matches[key] && officialResults.r32_matches[key].matchup && officialResults.r32_matches[key].matchup.trim() !== "") {
            // Keep official matchup
            results.r32_matches[key].matchup = officialResults.r32_matches[key].matchup;
            return;
        }

        // Otherwise resolve it provisionally
        const parts = key.split('-');
        if (parts.length === 2) {
            let t1 = resolveTeamPlaceholder(parts[0], standingsByGroup);
            let t2 = resolveTeamPlaceholder(parts[1], standingsByGroup);

            // If it's a best thirds slot, look up the assignment
            if (parts[1].startsWith('3')) {
                t2 = thirdsAssignment[key];
            }

            if (t1 && t2) {
                results.r32_matches[key].matchup = `${t1}-${t2}`;
            } else {
                results.r32_matches[key].matchup = "";
            }
        }
    });

    // Populate results.r32_teams provisionally if both official and current live results are empty
    if ((!officialResults.r32_teams || officialResults.r32_teams.length === 0) &&
        (!results.r32_teams || results.r32_teams.length === 0)) {
        const provR32Teams = [];
        Object.keys(standingsByGroup).forEach(group => {
            const teams = standingsByGroup[group];
            if (teams[0]) provR32Teams.push(teams[0].name);
            if (teams[1]) provR32Teams.push(teams[1].name);
        });
        qualifiedThirds.forEach(t => {
            provR32Teams.push(t.name);
        });
        results.r32_teams = provR32Teams;
    }

    // Dynamic propagation of winners/losers for later K.O. stages
    fillProvisionalKOMatchups();
}

// Dynamically propagate winners through K.O. stages based on match scores
function fillProvisionalKOMatchups() {


    const matchWinner = {};
    const matchLoser = {};

    const provR16Teams = [];
    const provR8Teams = [];
    const provR4Teams = [];
    const provFinalTeams = [];
    const provR34Teams = [];

    // Helper to get winner/loser of a specific stage match
    // Helper to get winner/loser of a specific stage match
    function resolveWinnerAndLoser(matchObj) {
        if (!matchObj || !matchObj.matchup || !matchObj.score) return null;
        const teams = matchObj.matchup.split('-').map(t => t.trim());
        if (teams.length !== 2) return null;

        const scoreStr = matchObj.score.trim();
        if (scoreStr === "") return null;

        // Split main score (handles "1-1 (4-3)" or "2-2")
        const mainPart = scoreStr.split(' ')[0];
        const parts = mainPart.split('-');
        if (parts.length === 2) {
            const h = parseInt(parts[0]);
            const a = parseInt(parts[1]);
            if (!isNaN(h) && !isNaN(a)) {
                if (h > a) return { winner: teams[0], loser: teams[1] };
                if (h < a) return { winner: teams[1], loser: teams[0] };
                
                // Shootout tie-breaker
                const matchPenalties = scoreStr.match(/\((\d+)-(\d+)\)/);
                if (matchPenalties && matchPenalties.length === 3) {
                    const penH = parseInt(matchPenalties[1]);
                    const penA = parseInt(matchPenalties[2]);
                    if (penH > penA) return { winner: teams[0], loser: teams[1] };
                    if (penH < penA) return { winner: teams[1], loser: teams[0] };
                }
            }
        }
        return null;
    }

    // 1. Process R32
    Object.entries(results.r32_matches || {}).forEach(([key, m]) => {
        const num = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === key && parseInt(n) >= 73 && parseInt(n) <= 88);
        if (num) {
            const res = resolveWinnerAndLoser(m);
            if (res) {
                matchWinner[`W${num}`] = res.winner;
                matchLoser[`L${num}`] = res.loser;
                provR16Teams.push(res.winner);
            }
        }
    });

    // Explicit predecessors for R16 matches because the keys W73-W75, etc. are named after official slots
    // but the match numbers are mapped to different keys in the user's custom database.
    const r16Predecessors = {
        "W73-W75": ["W73", "W76"],
        "W74-W77": ["W75", "W78"],
        "W76-W78": ["W74", "W77"],
        "W79-W80": ["W79", "W80"],
        "W83-W84": ["W84", "W83"],
        "W81-W82": ["W82", "W81"],
        "W86-W88": ["W87", "W86"],
        "W85-W87": ["W85", "W88"]
    };

    // 2. Populate R16
    Object.keys(results.r16_matches || {}).forEach(key => {
        if (officialResults.r16_matches[key] && officialResults.r16_matches[key].matchup && officialResults.r16_matches[key].matchup.trim() !== "") {
            results.r16_matches[key].matchup = officialResults.r16_matches[key].matchup;
            return;
        }
        const preds = r16Predecessors[key];
        if (preds && preds.length === 2) {
            const t1 = matchWinner[preds[0]] || "Por determinar";
            const t2 = matchWinner[preds[1]] || "Por determinar";
            results.r16_matches[key].matchup = `${t1}-${t2}`;
        }
    });

    // 3. Process R16
    Object.entries(results.r16_matches || {}).forEach(([key, m]) => {
        const num = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === key && parseInt(n) >= 89 && parseInt(n) <= 96);
        if (num) {
            const res = resolveWinnerAndLoser(m);
            if (res) {
                matchWinner[`W${num}`] = res.winner;
                matchLoser[`L${num}`] = res.loser;
                provR8Teams.push(res.winner);
            }
        }
    });

    // 4. Populate R8
    Object.keys(results.r8_matches || {}).forEach(key => {
        if (officialResults.r8_matches[key] && officialResults.r8_matches[key].matchup && officialResults.r8_matches[key].matchup.trim() !== "") {
            results.r8_matches[key].matchup = officialResults.r8_matches[key].matchup;
            return;
        }
        const parts = key.split('-');
        if (parts.length === 2) {
            const t1 = matchWinner[parts[0]] || "Por determinar";
            const t2 = matchWinner[parts[1]] || "Por determinar";
            results.r8_matches[key].matchup = `${t1}-${t2}`;
        }
    });

    // 5. Process R8
    Object.entries(results.r8_matches || {}).forEach(([key, m]) => {
        const num = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === key && parseInt(n) >= 97 && parseInt(n) <= 100);
        if (num) {
            const res = resolveWinnerAndLoser(m);
            if (res) {
                matchWinner[`W${num}`] = res.winner;
                matchLoser[`L${num}`] = res.loser;
                provR4Teams.push(res.winner);
            }
        }
    });

    // 6. Populate R4
    Object.keys(results.r4_matches || {}).forEach(key => {
        if (officialResults.r4_matches[key] && officialResults.r4_matches[key].matchup && officialResults.r4_matches[key].matchup.trim() !== "") {
            results.r4_matches[key].matchup = officialResults.r4_matches[key].matchup;
            return;
        }
        const parts = key.split('-');
        if (parts.length === 2) {
            const t1 = matchWinner[parts[0]] || "Por determinar";
            const t2 = matchWinner[parts[1]] || "Por determinar";
            results.r4_matches[key].matchup = `${t1}-${t2}`;
        }
    });

    // 7. Process R4
    Object.entries(results.r4_matches || {}).forEach(([key, m]) => {
        const num = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === key && parseInt(n) >= 101 && parseInt(n) <= 102);
        if (num) {
            const res = resolveWinnerAndLoser(m);
            if (res) {
                matchWinner[`W${num}`] = res.winner;
                matchLoser[`L${num}`] = res.loser;
                provFinalTeams.push(res.winner);
                provR34Teams.push(res.loser);
            }
        }
    });

    // 8. Populate final_match and r3_4_match
    if (!officialResults.final_match || !officialResults.final_match.matchup || officialResults.final_match.matchup.trim() === "") {
        const t1 = matchWinner['W101'] || "Por determinar";
        const t2 = matchWinner['W102'] || "Por determinar";
        results.final_match.matchup = `${t1}-${t2}`;
    } else {
        results.final_match.matchup = officialResults.final_match.matchup;
    }

    if (!officialResults.r3_4_match || !officialResults.r3_4_match.matchup || officialResults.r3_4_match.matchup.trim() === "") {
        const t1 = matchLoser['L101'] || "Por determinar";
        const t2 = matchLoser['L102'] || "Por determinar";
        results.r3_4_match.matchup = `${t1}-${t2}`;
    } else {
        results.r3_4_match.matchup = officialResults.r3_4_match.matchup;
    }

    // 9. Update team arrays in results dynamically if official list is empty
    if (!officialResults.r16_teams || officialResults.r16_teams.length === 0) {
        results.r16_teams = provR16Teams;
    } else {
        results.r16_teams = officialResults.r16_teams;
    }

    if (!officialResults.r8_teams || officialResults.r8_teams.length === 0) {
        results.r8_teams = provR8Teams;
    } else {
        results.r8_teams = officialResults.r8_teams;
    }

    if (!officialResults.r4_teams || officialResults.r4_teams.length === 0) {
        results.r4_teams = provR4Teams;
    } else {
        results.r4_teams = officialResults.r4_teams;
    }

    if (!officialResults.final_teams || officialResults.final_teams.length === 0) {
        results.final_teams = provFinalTeams;
    } else {
        results.final_teams = officialResults.final_teams;
    }

    if (!officialResults.r3_4_teams || officialResults.r3_4_teams.length === 0) {
        results.r3_4_teams = provR34Teams;
    } else {
        results.r3_4_teams = officialResults.r3_4_teams;
    }
}

/// Calculate the detailed points and ranking for all players
function calculateStandings() {
    // Fill provisional R32 matchups and qualified teams first
    fillProvisionalR32Matchups();

    const playersPoints = {};

    // Initialize scores
    porraData.players.forEach(p => {
        playersPoints[p] = {
            name: p,
            total: 0.0,
            group_stage: 0.0,
            group_standings: 0.0,
            ko_stages: 0.0,
            honor_list: 0.0,
            breakdown: [], // match by match details
            fixed: {
                total: 0.0,
                group_stage: 0.0,
                group_standings: 0.0,
                ko_stages: 0.0,
                honor_list: 0.0
            },
            provisional: {
                total: 0.0,
                group_stage: 0.0,
                group_standings: 0.0,
                ko_stages: 0.0,
                honor_list: 0.0
            }
        };
    });

    // 1. Group Stage matches points (divisor 2)
    let rawGroupStagePointsFixed = {};
    let rawGroupStagePointsProvisional = {};
    porraData.players.forEach(p => {
        rawGroupStagePointsFixed[p] = 0.0;
        rawGroupStagePointsProvisional[p] = 0.0;
    });

    porraData.matches.forEach(m => {
        const matchKey = `${m.casa}-${m.fuera}`;
        const actualScore = results.matches[m.id];
        
        if (actualScore && actualScore.trim() !== "") {
            const isProv = provisionalMatches && provisionalMatches.has(String(m.id));
            porraData.players.forEach(p => {
                const pred = porraData.predictions[p].group_stage[matchKey];
                const outcome = calcOutcomePoints(actualScore, pred);
                
                if (isProv) {
                    rawGroupStagePointsProvisional[p] += outcome.points;
                } else {
                    rawGroupStagePointsFixed[p] += outcome.points;
                    rawGroupStagePointsProvisional[p] += outcome.points;
                }
                
                playersPoints[p].breakdown.push({
                    type: 'group_match',
                    matchId: m.id,
                    casa: m.casa,
                    fuera: m.fuera,
                    jor: m.jor,
                    actual: actualScore,
                    pred: pred,
                    points: outcome.points,
                    netPoints: outcome.points / 2.0,
                    details: outcome.details,
                    outcomeClass: outcome.class,
                    isProvisional: isProv
                });
            });
        } else {
            // Still add pending matches for details view
            porraData.players.forEach(p => {
                const pred = porraData.predictions[p].group_stage[matchKey];
                playersPoints[p].breakdown.push({
                    type: 'group_match',
                    matchId: m.id,
                    casa: m.casa,
                    fuera: m.fuera,
                    jor: m.jor,
                    actual: '-',
                    pred: pred || '-',
                    points: 0.0,
                    netPoints: 0.0,
                    details: ['Pendiente'],
                    outcomeClass: 'miss'
                });
            });
        }
    });

    // Set group stage net points
    porraData.players.forEach(p => {
        playersPoints[p].fixed.group_stage = rawGroupStagePointsFixed[p] / 2.0;
        playersPoints[p].provisional.group_stage = rawGroupStagePointsProvisional[p] / 2.0;
    });

    // 2. Group Standings Positions points (divisor 2)
    const dynamicStandingsData = calculateGroupStandings();
    
    porraData.players.forEach(p => {
        let rawPointsFixed = 0.0;
        let rawPointsProvisional = 0.0;
        const preds = porraData.predictions[p].group_standings || {};
        
        Object.entries(preds).forEach(([item, teamPred]) => {
            const official = results.group_standings[item];
            const rulePoint = (item.startsWith("1º") || item.startsWith("2º")) ? 2.0 : 1.0;
            
            if (official && official.trim() !== "") {
                const isCorrect = String(official).toLowerCase() === String(teamPred).toLowerCase();
                if (isCorrect) {
                    rawPointsFixed += rulePoint;
                    rawPointsProvisional += rulePoint;
                }
            } else {
                const match = item.match(/^(\d)º GRUPO ([A-L])$/);
                if (match) {
                    const posNum = parseInt(match[1]);
                    const groupLetter = match[2];
                    const groupTeams = dynamicStandingsData.standingsByGroup[groupLetter] || [];
                    const provisionalTeam = groupTeams[posNum - 1] ? groupTeams[posNum - 1].name : '';
                    
                    if (provisionalTeam && provisionalTeam.trim() !== "") {
                        const isCorrectProv = String(provisionalTeam).toLowerCase() === String(teamPred).toLowerCase();
                        if (isCorrectProv) {
                            rawPointsProvisional += rulePoint;
                        }
                    }
                }
            }
        });
        
        playersPoints[p].fixed.group_standings = rawPointsFixed / 2.0;
        playersPoints[p].provisional.group_standings = rawPointsProvisional / 2.0;
    });

    // 3. K.O. Stages points (divisor 2)
    porraData.players.forEach(p => {
        let rawKOPointsFixed = 0.0;
        let rawKOPointsProvisional = 0.0;
        const playerPreds = porraData.predictions[p];

        // -- Round of 32 Teams --
        if (isStageActive('r32_teams')) {
            const r32_teams_pred = playerPreds.r32_teams || {};
            const r32_actual = results.r32_teams || [];
            let r32_official = officialResults.r32_teams || [];
            if ((!r32_official || r32_official.length === 0) && isGroupStageCompleted()) {
                r32_official = r32_actual;
            }
            Object.values(r32_teams_pred).forEach(team => {
                if (r32_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.r32_qualified || 2.0);
                    if (r32_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- Round of 32 Matches --
        if (isStageActive('r32_matches')) {
            const r32_matches_pred = playerPreds.r32_matches || {};
            const r32_actual_matches = results.r32_matches || {};
            Object.entries(r32_matches_pred).forEach(([matchKey, predVal]) => {
                if (predVal && predVal.includes('·')) {
                    const parts = predVal.split('·');
                    const predMatchup = parts[0];
                    const predScore = parts[1];
                    
                    const actual = r32_actual_matches[matchKey];
                    if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                        const outcome = calcOutcomePoints(actual.score, predScore);
                        const isProv = provisionalMatches && (provisionalMatches.has(matchKey) || provisionalMatches.has("r32_matches:" + matchKey));
                        if (isProv) {
                            rawKOPointsProvisional += outcome.points;
                        } else {
                            rawKOPointsFixed += outcome.points;
                            rawKOPointsProvisional += outcome.points;
                        }
                    }
                }
            });
        }

        // -- Round of 16 Teams --
        if (isStageActive('r16_teams')) {
            const r16_teams_pred = playerPreds.r16_teams || {};
            const r16_actual = results.r16_teams || [];
            let r16_official = officialResults.r16_teams || [];
            if ((!r16_official || r16_official.length === 0) && isR32Completed()) {
                r16_official = r16_actual;
            }
            Object.values(r16_teams_pred).forEach(team => {
                if (r16_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.r16_qualified || 2.0);
                    if (r16_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- Round of 16 Matches --
        if (isStageActive('r16_matches')) {
            const r16_matches_pred = playerPreds.r16_matches || {};
            const r16_actual_matches = results.r16_actual_matches || results.r16_matches || {};
            Object.entries(r16_matches_pred).forEach(([matchKey, predVal]) => {
                if (predVal && predVal.includes('·')) {
                    const parts = predVal.split('·');
                    const predMatchup = parts[0];
                    const predScore = parts[1];
                    
                    const actual = r16_actual_matches[matchKey];
                    if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                        const outcome = calcOutcomePoints(actual.score, predScore);
                        const isProv = provisionalMatches && (provisionalMatches.has(matchKey) || provisionalMatches.has("r16_matches:" + matchKey));
                        if (isProv) {
                            rawKOPointsProvisional += outcome.points;
                        } else {
                            rawKOPointsFixed += outcome.points;
                            rawKOPointsProvisional += outcome.points;
                        }
                    }
                }
            });
        }

        // -- Quarterfinals Teams --
        if (isStageActive('r8_teams')) {
            const r8_teams_pred = playerPreds.r8_teams || {};
            const r8_actual = results.r8_teams || [];
            let r8_official = officialResults.r8_teams || [];
            if (!r8_official || r8_official.length === 0) {
                r8_official = r8_actual;
            }
            Object.values(r8_teams_pred).forEach(team => {
                if (r8_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.r8_qualified || 2.0);
                    if (r8_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- Quarterfinals Matches --
        if (isStageActive('r8_matches')) {
            const r8_matches_pred = playerPreds.r8_matches || {};
            const r8_actual_matches = results.r8_actual_matches || results.r8_matches || {};
            Object.entries(r8_matches_pred).forEach(([matchKey, predVal]) => {
                if (predVal && predVal.includes('·')) {
                    const parts = predVal.split('·');
                    const predMatchup = parts[0];
                    const predScore = parts[1];
                    
                    const actual = r8_actual_matches[matchKey];
                    if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                        const outcome = calcOutcomePoints(actual.score, predScore);
                        const isProv = provisionalMatches && (provisionalMatches.has(matchKey) || provisionalMatches.has("r8_matches:" + matchKey));
                        if (isProv) {
                            rawKOPointsProvisional += outcome.points;
                        } else {
                            rawKOPointsFixed += outcome.points;
                            rawKOPointsProvisional += outcome.points;
                        }
                    }
                }
            });
        }

        // -- Semifinals Teams --
        if (isStageActive('r4_teams')) {
            const r4_teams_pred = playerPreds.r4_teams || {};
            const r4_actual = results.r4_teams || [];
            let r4_official = officialResults.r4_teams || [];
            if (!r4_official || r4_official.length === 0) {
                r4_official = r4_actual;
            }
            Object.values(r4_teams_pred).forEach(team => {
                if (r4_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.r4_qualified || 2.0);
                    if (r4_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- Semifinals Matches --
        if (isStageActive('r4_matches')) {
            const r4_matches_pred = playerPreds.r4_matches || {};
            const r4_actual_matches = results.r4_actual_matches || results.r4_matches || {};
            Object.entries(r4_matches_pred).forEach(([matchKey, predVal]) => {
                if (predVal && predVal.includes('·')) {
                    const parts = predVal.split('·');
                    const predMatchup = parts[0];
                    const predScore = parts[1];
                    
                    const actual = r4_actual_matches[matchKey];
                    if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                        const outcome = calcOutcomePoints(actual.score, predScore);
                        const isProv = provisionalMatches && (provisionalMatches.has(matchKey) || provisionalMatches.has("r4_matches:" + matchKey));
                        if (isProv) {
                            rawKOPointsProvisional += outcome.points;
                        } else {
                            rawKOPointsFixed += outcome.points;
                            rawKOPointsProvisional += outcome.points;
                        }
                    }
                }
            });
        }

        // -- 3rd/4th Teams --
        if (isStageActive('r3_4_teams')) {
            const r3_4_teams_pred = playerPreds.r3_4_teams || {};
            const r3_4_actual = results.r3_4_teams || [];
            let r3_4_official = officialResults.r3_4_teams || [];
            if (!r3_4_official || r3_4_official.length === 0) {
                r3_4_official = r3_4_actual;
            }
            Object.values(r3_4_teams_pred).forEach(team => {
                if (r3_4_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.r3_4_qualified || 2.0);
                    if (r3_4_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- Finalists Teams --
        if (isStageActive('final_teams')) {
            const final_teams_pred = playerPreds.final_teams || {};
            const final_actual = results.final_teams || [];
            let final_official = officialResults.final_teams || [];
            if (!final_official || final_official.length === 0) {
                final_official = final_actual;
            }
            Object.values(final_teams_pred).forEach(team => {
                if (final_actual.includes(team)) {
                    const ruleVal = Number(porraData.rules.final_qualified || 2.0);
                    if (final_official.includes(team)) {
                        rawKOPointsFixed += ruleVal;
                    }
                    rawKOPointsProvisional += ruleVal;
                }
            });
        }

        // -- 3rd/4th Match --
        if (isStageActive('r3_4_match')) {
            const r3_4_match_pred = playerPreds.r3_4_match;
            if (r3_4_match_pred && r3_4_match_pred.includes('·')) {
                const parts = r3_4_match_pred.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                const actual = results.r3_4_match;
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    const isProv = provisionalMatches && (provisionalMatches.has("r3-4") || provisionalMatches.has("single:r3_4_match"));
                    if (isProv) {
                        rawKOPointsProvisional += outcome.points;
                    } else {
                        rawKOPointsFixed += outcome.points;
                        rawKOPointsProvisional += outcome.points;
                    }
                }
            }
        }

        // -- Final Match --
        if (isStageActive('final_match')) {
            const final_match_pred = playerPreds.final_match;
            if (final_match_pred && final_match_pred.includes('·')) {
                const parts = final_match_pred.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                const actual = results.final_match;
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    const isProv = provisionalMatches && (provisionalMatches.has("final") || provisionalMatches.has("single:final_match"));
                    if (isProv) {
                        rawKOPointsProvisional += outcome.points;
                    } else {
                        rawKOPointsFixed += outcome.points;
                        rawKOPointsProvisional += outcome.points;
                    }
                }
            }
        }

        playersPoints[p].fixed.ko_stages = rawKOPointsFixed / 2.0;
        playersPoints[p].provisional.ko_stages = rawKOPointsProvisional / 2.0;
    });

    // 4. Honor List points (divisor 2)
    porraData.players.forEach(p => {
        let rawHonorPoints = 0.0;
        const preds = porraData.predictions[p].honor_list || {};

        const mappings = {
            'Subcampeón': { key: 'honor_runner', ruleKey: 'honor_runner' },
            'Campeón': { key: 'honor_champ', ruleKey: 'honor_champ' },
            'Tercero': { key: 'honor_3rd', ruleKey: 'honor_3rd' },
            'Cuarto': { key: 'honor_4th', ruleKey: 'honor_4th' },
            'Goleador': { key: 'honor_scorer', ruleKey: 'honor_scorer' },
            'Asistente': { key: 'honor_assists', ruleKey: 'honor_assists' },
            'M.V.P.': { key: 'honor_mvp', ruleKey: 'honor_mvp' },
            'Portero': { key: 'honor_gk', ruleKey: 'honor_gk' },
            'Joven': { key: 'honor_young', ruleKey: 'honor_young' }
        };

        Object.entries(preds).forEach(([item, teamPred]) => {
            let matchedMapping = null;
            const itemLower = item.toLowerCase();
            for (const [label, mapObj] of Object.entries(mappings)) {
                let match = false;
                if (label === 'Tercero') {
                    match = itemLower.includes('tercero') || itemLower.includes('3º');
                } else if (label === 'M.V.P.') {
                    match = itemLower.includes('m.v.p.') || (itemLower.includes('balón de oro') && !itemLower.includes('plata') && !itemLower.includes('bronce'));
                } else if (label === 'Goleador') {
                    match = itemLower.includes('goleador') && !itemLower.includes('plata') && !itemLower.includes('bronce');
                } else {
                    match = itemLower.includes(label.toLowerCase());
                }
                
                if (match) {
                    matchedMapping = mapObj;
                    break;
                }
            }

            if (matchedMapping) {
                const actual = results[matchedMapping.key];
                if (actual && actual.trim() !== "") {
                    const normalizeString = s => {
                        if (!s) return "";
                        return s.toString().toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .trim();
                    };
                    const actualNorm = normalizeString(actual);
                    const predNorm = normalizeString(teamPred);
                    const isCorrect = actualNorm === predNorm || 
                                      (actualNorm.includes(predNorm) && predNorm.length > 3) || 
                                      (predNorm.includes(actualNorm) && actualNorm.length > 3);
                    if (isCorrect) {
                        const rulePoints = Number(porraData.rules[matchedMapping.ruleKey] || 1.0);
                        rawHonorPoints += rulePoints;
                    }
                }
            }
        });

        playersPoints[p].fixed.honor_list = rawHonorPoints / 2.0;
        playersPoints[p].provisional.honor_list = rawHonorPoints / 2.0;
    });

    // Calculate Grand Total for each player
    porraData.players.forEach(p => {
        playersPoints[p].fixed.total = playersPoints[p].fixed.group_stage + 
                                       playersPoints[p].fixed.group_standings + 
                                       playersPoints[p].fixed.ko_stages + 
                                       playersPoints[p].fixed.honor_list;
                                       
        playersPoints[p].provisional.total = playersPoints[p].provisional.group_stage + 
                                             playersPoints[p].provisional.group_standings + 
                                             playersPoints[p].provisional.ko_stages + 
                                             playersPoints[p].provisional.honor_list;

        // Backwards compatibility and default values
        playersPoints[p].total = playersPoints[p].fixed.total;
        playersPoints[p].group_stage = playersPoints[p].fixed.group_stage;
        playersPoints[p].group_standings = playersPoints[p].fixed.group_standings;
        playersPoints[p].ko_stages = playersPoints[p].fixed.ko_stages;
        playersPoints[p].honor_list = playersPoints[p].fixed.honor_list;
    });

    // Return as array sorted by rank based on fixed.total
    return Object.values(playersPoints).sort((a, b) => {
        if (b.fixed.total !== a.fixed.total) {
            return b.fixed.total - a.fixed.total; // highest points first
        }
        // Tie-breaker: sort alphabetically by name if points are equal
        return a.name.localeCompare(b.name);
    });
}

// Calculate the points for a match given its actual result and prediction
function calcOutcomePoints(actualScoreStr, predStr) {
    if (!actualScoreStr || !predStr) return { points: 0.0, class: 'miss', details: ['Fallo'] };

    // Format check for prediction: "sign|score" (e.g. "1|2-1")
    if (!predStr.includes('|')) return { points: 0.0, class: 'miss', details: ['Predicción incompleta'] };
    
    const parts = predStr.split('|');
    const predSign = parts[0].trim();
    const predScore = parts[1].trim();

    const predScoreParts = predScore.split('-');
    const actualMainPart = actualScoreStr.split(' ')[0];
    const actualScoreParts = actualMainPart.split('-');
    
    if (predScoreParts.length !== 2 || actualScoreParts.length !== 2) {
        return { points: 0.0, class: 'miss', details: ['Formato incorrecto'] };
    }

    const predHome = parseInt(predScoreParts[0]);
    const predAway = parseInt(predScoreParts[1]);
    const actHome = parseInt(actualScoreParts[0]);
    const actAway = parseInt(actualScoreParts[1]);

    if (isNaN(predHome) || isNaN(predAway) || isNaN(actHome) || isNaN(actAway)) {
        return { points: 0.0, class: 'miss', details: ['Formato no numérico'] };
    }

    const actSign = actHome > actAway ? '1' : (actAway > actHome ? '2' : 'X');

    let points = 0.0;
    let details = [];
    let outcomeClass = 'miss';

    // 1. Sign Check (1X2)
    if (predSign === actSign) {
        points += 1.0;
        details.push("Signo 1X2 (+1)");
        outcomeClass = 'sign';

        // 2. Goal Difference Check
        const actDiff = actHome - actAway;
        const predDiff = predHome - predAway;
        if (actDiff === predDiff) {
            points += 1.0;
            details.push("Diferencia (+1)");
            outcomeClass = 'diff';
        }

        // 3. Exact Score Check
        if (actHome === predHome && actAway === predAway) {
            points += 2.0;
            details.push("Resultado exacto (+2)");
            outcomeClass = 'exact';
        }
    } else {
        details.push("Fallo");
    }

    return {
        points: points,
        class: outcomeClass,
        details: details
    };
}

// Render the classification standings table
function renderStandings(standings) {
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = '';
    
    // Check if there are any live matches
    const hasLiveMatch = (provisionalMatches && provisionalMatches.size > 0);
    const liveDisclaimer = document.getElementById('standings-live-disclaimer');
    if (liveDisclaimer) {
        liveDisclaimer.style.display = hasLiveMatch ? 'flex' : 'none';
    }

    // Determine which columns have active/pending matches or predictions to display on mobile
    const table = document.getElementById('standings-table');
    if (table) {
        // Show group stage if there's any group match that is not officially completed
        const showGroupStage = porraData.matches.some(m => 
            (m.jor === 'J1' || m.jor === 'J2' || m.jor === 'J3') && 
            (!officialResults.matches[m.id] || officialResults.matches[m.id].trim() === "" || provisionalMatches.has(String(m.id)))
        );

        // Show group standings if the official standings are not fully decided yet
        const showGroupStandings = Object.values(officialResults.group_standings || {}).some(val => !val || val.trim() === "");

        // Show K.O. stages if K.O. matches have started/been defined but not all are finished
        const hasKOMatchesStarted = Object.values(officialResults.r32_matches || {}).some(m => m.matchup && m.matchup.trim() !== "");
        const hasKOMatchesPending = Object.values(officialResults.r32_matches || {}).some(m => !m.score || m.score.trim() === "") ||
                                     Object.values(officialResults.r16_matches || {}).some(m => !m.score || m.score.trim() === "") ||
                                     Object.values(officialResults.r8_matches || {}).some(m => !m.score || m.score.trim() === "") ||
                                     Object.values(officialResults.r4_matches || {}).some(m => !m.score || m.score.trim() === "") ||
                                     (!officialResults.r3_4_match || !officialResults.r3_4_match.score || officialResults.r3_4_match.score.trim() === "") ||
                                     (!officialResults.final_match || !officialResults.final_match.score || officialResults.final_match.score.trim() === "");
        const showKoStages = hasKOMatchesStarted && hasKOMatchesPending;

        // Show honor list if the final match is defined but the honor list is not fully filled
        const hasFinalsStarted = officialResults.final_match && officialResults.final_match.matchup && officialResults.final_match.matchup.trim() !== "";
        const hasHonorListPending = [
            'honor_champ', 'honor_runner', 'honor_3rd', 'honor_4th',
            'honor_scorer', 'honor_assists', 'honor_mvp', 'honor_gk', 'honor_young'
        ].some(key => !officialResults[key] || officialResults[key].trim() === "");
        const showHonorList = hasFinalsStarted && hasHonorListPending;

        table.classList.toggle('show-group-stage-mobile', showGroupStage);
        table.classList.toggle('show-group-standings-mobile', showGroupStandings);
        table.classList.toggle('show-ko-stages-mobile', showKoStages);
        table.classList.toggle('show-honor-list-mobile', showHonorList);
    }
    
    standings.forEach((player, index) => {
        const tr = document.createElement('tr');
        tr.classList.add('clickable-row');
        tr.addEventListener('click', () => openPlayerModal(player.name));
        
        let rankClass = '';
        let rankVal = `${index + 1}º`;
        if (index === 0) {
            rankClass = 'player-rank-gold';
            rankVal = `<i class="fa-solid fa-trophy"></i> 1º`;
        } else if (index === 1) {
            rankClass = 'player-rank-silver';
            rankVal = `2º`;
        } else if (index === 2) {
            rankClass = 'player-rank-bronze';
            rankVal = `3º`;
        }

        // Helper to format category points: if provisional, show in green with asterisk
        const formatCell = (fixedVal, provVal) => {
            const diff = provVal - fixedVal;
            if (diff > 0) {
                return `<span class="provisional-score" style="color:var(--color-success); font-weight:700;">${provVal.toFixed(1)}*</span>`;
            }
            return fixedVal.toFixed(1);
        };

        tr.innerHTML = `
            <td class="text-center ${rankClass}">${rankVal}</td>
            <td class="player-row-name">${player.name}</td>
            <td class="text-center bold-score" title="Puntos oficiales consolidados de ${player.name} (no incluye provisionales)">${player.fixed.total.toFixed(1)}</td>
            <td class="text-center hide-on-mobile col-group-stage" title="Puntos Fase de Grupos de ${player.name}: ${player.fixed.group_stage.toFixed(1)} oficiales (provisionales: ${player.provisional.group_stage.toFixed(1)})">${formatCell(player.fixed.group_stage, player.provisional.group_stage)}</td>
            <td class="text-center hide-on-mobile col-group-standings" title="Puntos Posiciones de Grupos de ${player.name}: ${player.fixed.group_standings.toFixed(1)} oficiales (provisionales: ${player.provisional.group_standings.toFixed(1)})">${formatCell(player.fixed.group_standings, player.provisional.group_standings)}</td>
            <td class="text-center hide-on-mobile col-ko-stages" title="Puntos Fase K.O. de ${player.name}: ${player.fixed.ko_stages.toFixed(1)} oficiales (provisionales: ${player.provisional.ko_stages.toFixed(1)})">${formatCell(player.fixed.ko_stages, player.provisional.ko_stages)}</td>
            <td class="text-center hide-on-mobile col-honor-list" title="Puntos Cuadro de Honor de ${player.name}: ${player.fixed.honor_list.toFixed(1)} oficiales (provisionales: ${player.provisional.honor_list.toFixed(1)})">${formatCell(player.fixed.honor_list, player.provisional.honor_list)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Render matches calendar grid
function renderMatches() {
    const grid = document.getElementById('matches-grid');
    
    // Save currently expanded match IDs to preserve state on redraw
    const expandedMatchIds = new Set();
    grid.querySelectorAll('.match-card.expanded').forEach(card => {
        if (card.dataset.matchId) {
            expandedMatchIds.add(String(card.dataset.matchId));
        }
    });

    grid.innerHTML = '';

    const filteredMatches = porraData.matches.filter(m => {
        if (currentFilter === 'all') return true;
        return m.jor === currentFilter;
    }).sort((a, b) => {
        const dateA = new Date(a.fecha.replace(/-/g, "/"));
        const dateB = new Date(b.fecha.replace(/-/g, "/"));
        return dateA - dateB;
    });

    // Find the next unplayed match chronologically
    const nextMatch = filteredMatches.find(m => {
        const score = results.matches[m.id];
        return !score || score.trim() === "";
    });
    const nextMatchId = nextMatch ? nextMatch.id : null;

    let lastRound = null;

    filteredMatches.forEach(m => {
        // Check if round changed to insert header divider
        if (m.jor !== lastRound) {
            lastRound = m.jor;
            
            const divider = document.createElement('div');
            divider.classList.add('round-divider-card');
            
            let roundName = '';
            let roundDesc = '';
            if (m.jor === 'J1') {
                roundName = 'Jornada 1';
                roundDesc = 'Fase de Grupos - Inicio del Torneo ⚽';
            } else if (m.jor === 'J2') {
                roundName = 'Jornada 2';
                roundDesc = 'Fase de Grupos - Partidos Clave ⚔️';
            } else if (m.jor === 'J3') {
                roundName = 'Jornada 3';
                roundDesc = 'Fase de Grupos - Decisiones Finales 🏆';
            } else {
                roundName = m.jor;
                roundDesc = 'Eliminatorias';
            }
            
            divider.innerHTML = `
                <h3><i class="fa-solid fa-calendar-days"></i> ${roundName}</h3>
                <span class="round-info">${roundDesc}</span>
            `;
            grid.appendChild(divider);
        }

        const actualScore = results.matches[m.id] || '';
        const isPlayed = actualScore.trim() !== "";
        
        const card = document.createElement('div');
        card.classList.add('match-card');
        card.dataset.matchId = m.id;
        
        const isLive = provisionalMatches.has(String(m.id));
        if (isLive) {
            card.classList.add('live-match-highlight');
        } else if (m.id === nextMatchId) {
            card.classList.add('next-match-highlight');
        }
        
        // Restore expanded state if it was expanded before refresh
        if (expandedMatchIds.has(String(m.id))) {
            card.classList.add('expanded');
        }
        
        // Split actual score if it exists
        let homeScore = '';
        let awayScore = '';
        if (isPlayed) {
            const parts = actualScore.split('-');
            homeScore = parts[0] || '';
            awayScore = parts[1] || '';
        }

        // Generate flags (images)
        const flagHome = getFlagHtml(m.casa, true);
        const flagAway = getFlagHtml(m.fuera, true);

        const dateStr = formatMatchDate(m.fecha);

        const cardHeader = `
            <div class="match-header">
                <span>Partido ${m.id}</span>
                <span class="match-date" style="font-size: 0.75rem; opacity: 0.8; font-weight: 500;">${dateStr}</span>
                <span>${m.grupo || ''} - ${m.jor}</span>
            </div>
        `;

        const scoreContent = `
            <div class="score-display">
                <span class="score-number">${isPlayed ? homeScore : '-'}</span>
                <span class="score-hyphen">-</span>
                <span class="score-number">${isPlayed ? awayScore : '-'}</span>
            </div>
        `;

        const cardBody = `
            <div class="match-body">
                <div class="team-display">
                    ${flagHome}
                    <span class="team-name" title="${m.casa}">${m.casa}</span>
                </div>
                ${scoreContent}
                <div class="team-display">
                    ${flagAway}
                    <span class="team-name" title="${m.fuera}">${m.fuera}</span>
                </div>
            </div>
        `;

        let statusLabel = '';
        if (isPlayed) {
            if (provisionalMatches.has(String(m.id))) {
                statusLabel = `<span class="provisional-match-label"><i class="fa-solid fa-arrows-rotate"></i> Provisional (API)</span>`;
            } else {
                statusLabel = `<span class="played-match-label"><i class="fa-solid fa-circle-check"></i> Finalizado</span>`;
            }
        } else {
            statusLabel = `<span class="pending-match-label"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
        }

        const cardFooter = `
            <div class="match-footer" style="margin-bottom:0.4rem;">
                ${statusLabel}
                <span class="expand-icon" style="margin-left:auto; color:var(--text-muted); font-size:0.85rem;"><i class="fa-solid fa-chevron-down"></i></span>
            </div>
        `;

        // Build predictions HTML list
        const matchKey = `${m.casa}-${m.fuera}`;
        let predictionsHtml = '';
        
        porraData.players.forEach(p => {
            const pred = porraData.predictions[p].group_stage[matchKey] || '';
            let predDisplay = '-';
            let badgeText = "Fallo";
            let badgeClass = "badge-miss";
            let pointsText = "0.0 pts";
            
            if (pred && pred.includes('|')) {
                const parts = pred.split('|');
                predDisplay = parts[1];
                
                if (isPlayed) {
                    const outcome = calcOutcomePoints(actualScore, pred);
                    if (outcome.class === 'exact') {
                        badgeText = "Exacto";
                        badgeClass = "badge-exact";
                        pointsText = "+2.0 pts";
                    } else if (outcome.class === 'diff') {
                        badgeText = "Dif. Goles";
                        badgeClass = "badge-diff";
                        pointsText = "+1.0 pt";
                    } else if (outcome.class === 'sign') {
                        badgeText = "Signo 1X2";
                        badgeClass = "badge-sign";
                        pointsText = "+0.5 pts";
                    }
                }
            }
            
            let tooltip = '';
            if (isPlayed) {
                if (badgeClass === 'badge-exact') tooltip = 'Resultado exacto (+2.0 puntos netos)';
                else if (badgeClass === 'badge-diff') tooltip = 'Diferencia de goles (+1.0 punto neto)';
                else if (badgeClass === 'badge-sign') tooltip = 'Signo 1X2 (+0.5 puntos netos)';
                else tooltip = 'Fallo (0.0 puntos)';
            } else {
                tooltip = 'Partido pendiente de jugar oficialmente';
            }
            
            const badgeHtml = isPlayed ? 
                `<span class="prediction-badge ${badgeClass}" title="${tooltip}">${badgeText}</span>` : 
                `<span class="prediction-badge badge-miss" title="${tooltip}" style="background:rgba(255,255,255,0.03); color:var(--text-muted); border:1px solid rgba(255,255,255,0.08);">Pendiente</span>`;
            
            const ptsColor = (badgeClass === 'badge-exact' || badgeClass === 'badge-diff' || badgeClass === 'badge-sign') ? 'var(--color-success)' : 'var(--text-muted)';
            const pointsDisplay = isPlayed ? `<span class="pred-player-pts" style="color: ${ptsColor};">${pointsText}</span>` : `<span class="pred-player-pts"></span>`;
            
            predictionsHtml += `
                <div class="pred-player-row">
                    <span class="pred-player-name">${p}</span>
                    <div class="pred-player-values">
                        <span class="pred-player-score">${predDisplay}</span>
                        ${badgeHtml}
                        ${pointsDisplay}
                    </div>
                </div>
            `;
        });

        const predictionsDrawer = `
            <div class="match-predictions-drawer">
                <div style="font-size:0.75rem; color:var(--color-accent); font-weight:700; text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:0.5px;">Pronósticos de los Participantes</div>
                <div class="predictions-list">
                    ${predictionsHtml}
                </div>
            </div>
        `;

        card.innerHTML = cardHeader + cardBody + cardFooter + predictionsDrawer;
        card.addEventListener('click', () => toggleMatchCard(card));
        grid.appendChild(card);
    });
}

// Render K.O. rounds matchups and scores in a horizontal bracket tree layout
function renderKORounds() {
    const container = document.getElementById('ko-bracket-container');
    if (!container) return;

    container.innerHTML = '';

    const rounds = [
        {
            key: 'r32',
            name: 'Dieciseisavos de Final',
            desc: '32 Equipos - Eliminatoria a partido único ⚔️',
            prefix: 'r32_matches',
            orderedKeys: [
                '1E-3ABCDF', '1I-3CDFGH',
                '2A-2B', '1F-2C',
                '2K-2L', '1H-2J',
                '1D-3BEFIJ', '1G-3AEHIJ',
                '1C-2F', '2E-2I',
                '1A-3CEFHI', '1L-3EHIJK',
                '1J-2H', '2D-2G',
                '1B-3EFGIJ', '1K-3DEIJL'
            ]
        },
        {
            key: 'r16',
            name: 'Octavos de Final',
            desc: '16 Equipos - Camino a la gloria 🏆',
            prefix: 'r16_matches',
            orderedKeys: [
                'W74-W77', 'W73-W75',
                'W83-W84', 'W81-W82',
                'W76-W78', 'W79-W80',
                'W86-W88', 'W85-W87'
            ]
        },
        {
            key: 'r8',
            name: 'Cuartos de Final',
            desc: '8 Equipos - La tensión aumenta 🔥',
            prefix: 'r8_matches',
            orderedKeys: [
                'W89-W90', 'W93-W94',
                'W91-W92', 'W95-W96'
            ]
        },
        {
            key: 'r4',
            name: 'Semifinales',
            desc: '4 Equipos - A un paso de la Final 🌟',
            prefix: 'r4_matches',
            orderedKeys: [
                'W97-W98', 'W99-W100'
            ]
        },
        {
            key: 'finales',
            name: 'Finales y Tercer Puesto',
            desc: 'Los encuentros definitivos por la copa 🏆',
            prefix: 'single',
            orderedKeys: [
                'final_match',
                'r3_4_match'
            ]
        }
    ];

    // koMatchDates is declared globally at the top level

    const fifaCodes = {
        'México': 'MEX',
        'Sudáfrica': 'RSA',
        'Corea del Sur': 'KOR',
        'República Checa': 'CZE',
        'Canadá': 'CAN',
        'Bosnia y Herzegovina': 'BIH',
        'Catar': 'QAT',
        'Suiza': 'SUI',
        'Brasil': 'BRA',
        'Marruecos': 'MAR',
        'Haití': 'HAI',
        'Escocia': 'SCO',
        'Estados Unidos': 'USA',
        'Paraguay': 'PAR',
        'Australia': 'AUS',
        'Turquía': 'TUR',
        'Alemania': 'GER',
        'Curazao': 'CUW',
        'Costa de Marfil': 'CIV',
        'Ecuador': 'ECU',
        'Países Bajos': 'NED',
        'Japón': 'JPN',
        'Suecia': 'SWE',
        'Túnez': 'TUN',
        'Bélgica': 'BEL',
        'Egipto': 'EGY',
        'Irán': 'IRN',
        'Nueva Zelanda': 'NZL',
        'España': 'ESP',
        'Cabo Verde': 'CPV',
        'Arabia Saudita': 'KSA',
        'Uruguay': 'URU',
        'Francia': 'FRA',
        'Senegal': 'SEN',
        'Irak': 'IRQ',
        'Noruega': 'NOR',
        'Argentina': 'ARG',
        'Argelia': 'ALG',
        'Austria': 'AUT',
        'Jordania': 'JOR',
        'Portugal': 'POR',
        'RD Congo': 'COD',
        'Uzbekistán': 'UZB',
        'Colombia': 'COL',
        'Inglaterra': 'ENG',
        'Croacia': 'CRO',
        'Ghana': 'GHA',
        'Panamá': 'PAN'
    };

    function getFifaCode(countryName) {
        if (!countryName || countryName.trim() === "" || countryName === "Por determinar") return "TBD";
        const clean = countryName.trim();
        if (fifaCodes[clean]) return fifaCodes[clean];
        if (clean.length <= 6) return clean;
        return clean.substring(0, 3).toUpperCase();
    }



    function parseR32SlotCode(slotCode) {
        const match = slotCode.match(/^(\d)([A-L])$/);
        if (match) {
            const pos = match[1] === '1' ? '1º' : '2º';
            const group = match[2];
            return `${pos} del Grupo ${group}`;
        }
        if (slotCode.startsWith('3')) {
            const groups = slotCode.substring(1).split('').join('/');
            return `Mejor 3º de los Grupos ${groups}`;
        }
        return slotCode;
    }

    function parseWinnerSlotCode(slotCode) {
        const match = slotCode.match(/^W(\d+)$/);
        if (match) {
            const num = match[1];
            const key = MATCH_KEYS_BY_NUMBER[num];
            let roundName = "";
            const numVal = parseInt(num);
            if (numVal >= 73 && numVal <= 88) roundName = "Dieciseisavos";
            else if (numVal >= 89 && numVal <= 96) roundName = "Octavos";
            else if (numVal >= 97 && numVal <= 100) roundName = "Cuartos";
            else if (numVal >= 101 && numVal <= 102) roundName = "Semifinal";
            
            return `Ganador de ${roundName} (${key})`;
        }
        return slotCode;
    }

    function parseLoserSlotCode(slotCode) {
        const match = slotCode.match(/^L(\d+)$/);
        if (match) {
            const num = match[1];
            const key = MATCH_KEYS_BY_NUMBER[num];
            return `Perdedor de Semifinal (${key})`;
        }
        return slotCode;
    }

    function getTeamTooltip(roundKey, matchKey, teamIndex, teamName, isProvisional) {
        if (teamName === "Por determinar") {
            return "Por determinar";
        }
        
        let originDesc = "";
        if (roundKey === 'r32') {
            const parts = matchKey.split('-');
            if (parts.length === 2) {
                const slotCode = parts[teamIndex];
                originDesc = parseR32SlotCode(slotCode);
            }
        } else if (roundKey === 'r16' || roundKey === 'r8' || roundKey === 'r4') {
            const parts = matchKey.split('-');
            if (parts.length === 2) {
                const slotCode = parts[teamIndex];
                originDesc = parseWinnerSlotCode(slotCode);
            }
        } else if (roundKey === 'finales') {
            if (matchKey === 'final_match') {
                const slotCode = teamIndex === 0 ? 'W101' : 'W102';
                originDesc = parseWinnerSlotCode(slotCode);
            } else if (matchKey === 'r3_4_match') {
                const slotCode = teamIndex === 0 ? 'L101' : 'L102';
                originDesc = parseLoserSlotCode(slotCode);
            }
        }
        
        if (isProvisional) {
            return `${teamName} (Provisional, ${originDesc})`;
        } else {
            return `${teamName} (${originDesc})`;
        }
    }



    // Helper function to create a match card
    function createMatchCard(r, matchKey) {
        let matchObj = null;
        if (r.prefix === 'single') {
            matchObj = (results && results[matchKey]) || { matchup: '', score: '' };
        } else {
            matchObj = (results && results[r.prefix] && results[r.prefix][matchKey]) || { matchup: '', score: '' };
        }

        const matchup = matchObj.matchup || '';
        const score = matchObj.score || '';
        const isPlayed = score.trim() !== "";

        let t1 = "Por determinar";
        let t2 = "Por determinar";
        if (matchup.includes('-')) {
            const parts = matchup.split('-');
            t1 = parts[0].trim() || "Por determinar";
            t2 = parts[1].trim() || "Por determinar";
        } else if (matchup.trim() !== "") {
            t1 = matchup.trim();
        }

        const lookupId = (r.prefix === 'single') ? `single:${matchKey}` : `${r.prefix}:${matchKey}`;
        const isLive = provisionalMatches.has(String(lookupId));

        const card = document.createElement('div');
        card.classList.add('ko-bracket-match');
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Haz clic para ver los pronósticos de todos los participantes');
        
        if (isLive) {
            card.classList.add('live-match-highlight');
        }

        let homeScore = '';
        let awayScore = '';
        if (isPlayed) {
            const mainPart = score.split(' ')[0];
            const parts = mainPart.split('-');
            homeScore = parts[0] || '';
            awayScore = parts[1] || '';
            
            const matchPenalties = score.match(/\((\d+)-(\d+)\)/);
            if (matchPenalties && matchPenalties.length === 3) {
                const penH = matchPenalties[1];
                const penA = matchPenalties[2];
                homeScore += ` <span class="penalty-score" style="font-size:0.72rem; color:var(--text-muted); font-weight:normal;">(${penH})</span>`;
                awayScore += ` <span class="penalty-score" style="font-size:0.72rem; color:var(--text-muted); font-weight:normal;">(${penA})</span>`;
            }
        }

        // Use small flags (isLarge = false)
        const flagHome = getFlagHtml(t1, false);
        const flagAway = getFlagHtml(t2, false);

        const fifaHome = getFifaCode(t1);
        const fifaAway = getFifaCode(t2);

        // Check if matchup is provisional (calculated dynamically from group standings or previous active stages)
        let isProvisionalMatchup = false;
        let officialMatchObj = null;
        if (r.prefix === 'r32_matches') officialMatchObj = officialResults.r32_matches[matchKey];
        else if (r.prefix === 'r16_matches') officialMatchObj = officialResults.r16_matches[matchKey];
        else if (r.prefix === 'r8_matches') officialMatchObj = officialResults.r8_matches[matchKey];
        else if (r.prefix === 'r4_matches') officialMatchObj = officialResults.r4_matches[matchKey];
        else if (r.prefix === 'single') {
            if (matchKey === 'r3_4_match') officialMatchObj = officialResults.r3_4_match;
            else if (matchKey === 'final_match') officialMatchObj = officialResults.final_match;
        }

        if (matchup) {
            if (!officialMatchObj || !officialMatchObj.matchup || officialMatchObj.matchup.trim() === "" || officialMatchObj.matchup.match(/\d/)) {
                isProvisionalMatchup = true;
            }
        }
        const isMatchupResolved = matchup && matchup.trim() !== "" && !matchup.includes("Por determinar") && !matchup.match(/\d/);

        if (r.prefix === 'r32_matches') {
            if (!isGroupStageCompleted()) {
                isProvisionalMatchup = true;
            }
        } else if (r.prefix === 'r16_matches') {
            const hasPrevRoundStarted = isGroupStageCompleted();
            if (!hasPrevRoundStarted || (!isR32Completed() && !isMatchupResolved)) {
                isProvisionalMatchup = true;
            }
        } else if (r.prefix === 'r8_matches') {
            const hasPrevRoundStarted = isR32Completed();
            if (!hasPrevRoundStarted || (!isR16Completed() && !isMatchupResolved)) {
                isProvisionalMatchup = true;
            }
        } else if (r.prefix === 'r4_matches') {
            const hasPrevRoundStarted = isR16Completed();
            if (!hasPrevRoundStarted || (!isR8Completed() && !isMatchupResolved)) {
                isProvisionalMatchup = true;
            }
        } else if (r.prefix === 'single') {
            const hasPrevRoundStarted = isR8Completed();
            if (!hasPrevRoundStarted || (!isR4Completed() && !isMatchupResolved)) {
                isProvisionalMatchup = true;
            }
        }

        const provAsterisk = isProvisionalMatchup ? ' <span style="color:var(--color-success); font-weight:bold; font-size:0.9rem; line-height:0;" title="Cruce provisional (Fase de grupos o ronda previa activa)">*</span>' : '';

        let slotLabel = "";
        let slotTitle = "";
        const matchNum = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === matchKey);

        if (r.key === 'r32') {
            slotLabel = matchNum ? `#${matchNum}` : matchKey;
            slotTitle = `Dieciseisavos: Partido ${matchNum || matchKey} (Cruce: ${matchKey})`;
        } else if (r.key === 'r16') {
            slotLabel = matchNum ? `#${matchNum}` : matchKey;
            slotTitle = `Octavos: Partido ${matchNum || matchKey} (Cruce: ${matchKey})`;
        } else if (r.key === 'r8') {
            slotLabel = matchNum ? `#${matchNum}` : matchKey;
            slotTitle = `Cuartos: Partido ${matchNum || matchKey} (Cruce: ${matchKey})`;
        } else if (r.key === 'r4') {
            slotLabel = matchNum ? `#${matchNum}` : matchKey;
            slotTitle = `Semifinal: Partido ${matchNum || matchKey} (Cruce: ${matchKey})`;
        } else if (matchKey === 'r3_4_match') {
            slotLabel = `3º Puesto`;
            slotTitle = `Tercer y Cuarto Puesto`;
        } else if (matchKey === 'final_match') {
            slotLabel = `Final`;
            slotTitle = `Gran Final`;
        }

        const provHomeAsterisk = isProvisionalMatchup && t1 !== 'Por determinar' ? ' <span style="color:var(--color-success); font-weight:700;" title="Equipo provisional">*</span>' : '';
        const provAwayAsterisk = isProvisionalMatchup && t2 !== 'Por determinar' ? ' <span style="color:var(--color-success); font-weight:700;" title="Equipo provisional">*</span>' : '';

        // Retrieve date and format header
        const matchDateStr = koMatchDates[matchKey] || '';

        const tooltipHome = getTeamTooltip(r.key, matchKey, 0, t1, isProvisionalMatchup);
        const tooltipAway = getTeamTooltip(r.key, matchKey, 1, t2, isProvisionalMatchup);

        card.innerHTML = `
            <div class="ko-match-card-header">
                <span style="font-weight: 600; color: var(--color-primary-hover);" title="${slotTitle}">${slotLabel}${provAsterisk}</span>
                <span title="Fecha de juego">${matchDateStr} <span class="expand-icon" style="margin-left:0.25rem; color:var(--text-muted); font-size:0.75rem;"><i class="fa-regular fa-eye"></i></span></span>
            </div>
            <div class="ko-match-card-body">
                <div class="ko-match-team-row">
                    <div class="ko-match-team-info" title="${tooltipHome}">
                        ${flagHome}
                        <span class="team-name">${fifaHome}${provHomeAsterisk}</span>
                    </div>
                    <div class="ko-match-team-score">${isPlayed ? homeScore : '-'}</div>
                </div>
                <div class="ko-match-team-row">
                    <div class="ko-match-team-info" title="${tooltipAway}">
                        ${flagAway}
                        <span class="team-name">${fifaAway}${provAwayAsterisk}</span>
                    </div>
                    <div class="ko-match-team-score">${isPlayed ? awayScore : '-'}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openMatchPredictionsModal(r, matchKey));

        return card;
    }

    rounds.forEach(r => {
        const col = document.createElement('div');
        col.classList.add('ko-bracket-column');
        col.setAttribute('data-round', r.key);

        const colHeader = document.createElement('div');
        colHeader.classList.add('ko-column-header');
        colHeader.innerHTML = `
            <h3>${r.name}</h3>
            <span>${r.desc}</span>
        `;
        col.appendChild(colHeader);

        const colMatches = document.createElement('div');
        colMatches.classList.add('ko-column-matches');

        if (r.key === 'finales') {
            // Special layout for Final and 3rd place
            colMatches.style.justifyContent = 'center';

            // Gran Final
            const finalPair = document.createElement('div');
            finalPair.classList.add('ko-match-pair');
            const finalCard = createMatchCard(r, 'final_match');
            finalPair.appendChild(finalCard);
            colMatches.appendChild(finalPair);

            // Tercer Puesto (placed absolutely at the bottom)
            const thirdPlaceWrapper = document.createElement('div');
            thirdPlaceWrapper.classList.add('ko-3rd-place');
            thirdPlaceWrapper.style.position = 'absolute';
            thirdPlaceWrapper.style.bottom = '1.5rem';
            thirdPlaceWrapper.style.left = '0';
            thirdPlaceWrapper.style.right = '0';

            const thirdCard = createMatchCard(r, 'r3_4_match');
            thirdCard.classList.add('no-connectors');
            thirdPlaceWrapper.appendChild(thirdCard);
            colMatches.appendChild(thirdPlaceWrapper);
        } else {
            // Standard layout grouped in pairs of 2
            for (let i = 0; i < r.orderedKeys.length; i += 2) {
                const key1 = r.orderedKeys[i];
                const key2 = r.orderedKeys[i + 1];

                const pairDiv = document.createElement('div');
                pairDiv.classList.add('ko-match-pair');

                const card1 = createMatchCard(r, key1);
                pairDiv.appendChild(card1);

                if (key2) {
                    const card2 = createMatchCard(r, key2);
                    pairDiv.appendChild(card2);
                }

                colMatches.appendChild(pairDiv);
            }
        }

        col.appendChild(colMatches);
        container.appendChild(col);
    });
}

// Expand/Collapse match card prediction details drawer (along with all cards in the same row)
function toggleMatchCard(cardElement) {
    const isExpanded = cardElement.classList.contains('expanded');
    const targetState = !isExpanded; // true = expand, false = collapse
    
    const clickedTop = cardElement.offsetTop;
    
    // Find all match cards in the grid
    const allCards = document.querySelectorAll('#matches-grid .match-card');
    allCards.forEach(card => {
        // Check if they are in the same visual row (same offsetTop within 10px tolerance)
        if (Math.abs(card.offsetTop - clickedTop) < 10) {
            if (targetState) {
                card.classList.add('expanded');
            } else {
                card.classList.remove('expanded');
            }
        }
    });
}

// Scroll page to next upcoming match
// Scroll page to the live match (highest priority) or the next upcoming match
function scrollToNextMatch() {
    // Try to find a match currently in progress
    let targetMatchEl = document.querySelector('.match-card.live-match-highlight');
    
    // Fall back to the next upcoming match if none is live
    if (!targetMatchEl) {
        targetMatchEl = document.querySelector('.match-card.next-match-highlight');
    }
    
    if (targetMatchEl) {
        targetMatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Tab navigation handler
function setupEventListeners() {
    // Nav tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            
            // Remove active states
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Set active states
            e.currentTarget.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            activeTab = targetTab;

            if (targetTab === 'partidos') {
                setTimeout(scrollToNextMatch, 150);
            }
        });
    });

    // Filters for matches (scoped to #partidos tab)
    document.querySelectorAll('#partidos .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#partidos .filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.getAttribute('data-filter');
            renderMatches();
        });
    });



    // Modal Close
    document.getElementById('modal-close-btn').addEventListener('click', closePlayerModal);
    document.getElementById('player-modal').addEventListener('click', (e) => {
        if (e.target.id === 'player-modal') closePlayerModal();
    });
    
    document.getElementById('match-modal-close-btn').addEventListener('click', closeMatchPredictionsModal);
    document.getElementById('match-predictions-modal').addEventListener('click', (e) => {
        if (e.target.id === 'match-predictions-modal') closeMatchPredictionsModal();
    });
    


    // Modal sub-tabs
    document.querySelectorAll('.tab-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-sub-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
            
            e.currentTarget.classList.add('active');
            const subtabId = e.currentTarget.getAttribute('data-subtab');
            document.getElementById(subtabId).classList.add('active');
        });
    });

    // Admin buttons
    const downloadJsonBtn = document.getElementById('download-json-btn');
    if (downloadJsonBtn) {
        downloadJsonBtn.addEventListener('click', downloadResultsJSON);
    }
    
    const approveProvisionalBtn = document.getElementById('approve-provisional-btn');
    if (approveProvisionalBtn) {
        approveProvisionalBtn.addEventListener('click', approveProvisionalScores);
    }

    const clearDraftBtn = document.getElementById('clear-draft-btn');
    if (clearDraftBtn) {
        clearDraftBtn.addEventListener('click', () => {
            if (confirm("¿Seguro que quieres borrar el borrador local? Se volverán a cargar los datos oficiales del servidor (results.json).")) {
                localStorage.removeItem('porra_results_draft');
                localStorage.removeItem('porra_live_results_cache');
                location.reload();
            }
        });
    }
}

// Modal management
function openPlayerModal(playerName) {
    document.body.classList.add('modal-open');
    const standings = calculateStandings();
    const player = standings.find(p => p.name === playerName);
    if (!player) return;

    // Helper to format category points in modal: if provisional, show in green with asterisk
    const formatModalScore = (fixedVal, provVal) => {
        const diff = provVal - fixedVal;
        if (diff > 0) {
            return `<span class="provisional-score" style="color:var(--color-success); font-weight:700;">${provVal.toFixed(1)}*</span>`;
        }
        return fixedVal.toFixed(1);
    };

    document.getElementById('modal-player-name').innerText = `Desglose - ${player.name}`;
    
    // Total score
    const totalScoreHtml = `${formatModalScore(player.fixed.total, player.provisional.total)} <span style="font-size: 1.1rem; font-weight: 500; color: var(--text-muted);">pts</span>`;
    document.getElementById('modal-total-score').innerHTML = totalScoreHtml;
    
    const gsText = formatModalScore(player.fixed.group_stage, player.provisional.group_stage);
    const posText = formatModalScore(player.fixed.group_standings, player.provisional.group_standings);
    
    const elimFixed = player.fixed.ko_stages + player.fixed.honor_list;
    const elimProv = player.provisional.ko_stages + player.provisional.honor_list;
    const elimText = formatModalScore(elimFixed, elimProv);
    
    document.getElementById('modal-fase-score').innerHTML = `F. Grupos: ${gsText} | Posiciones: ${posText} | Eliminatorias: ${elimText}`;

    // Render Group Matches predictions table
    const groupsBody = document.getElementById('modal-groups-body');
    groupsBody.innerHTML = '';
    
    // Sort player's group predictions by match ID
    const groupMatches = player.breakdown.filter(item => item.type === 'group_match').sort((a,b) => a.matchId - b.matchId);
    
    groupMatches.forEach(item => {
        const tr = document.createElement('tr');
        tr.classList.add('prediction-row');
        
        let scoreBadge = '';
        if (item.actual === '-') {
            scoreBadge = `<span class="prediction-badge badge-miss" title="Partido pendiente de jugar oficialmente">Pendiente</span>`;
        } else {
            let badgeText = "Fallo (0)";
            let badgeClass = "badge-miss";
            let tooltipText = "Fallo: predicción incorrecta (0.0 puntos)";
            
            if (item.outcomeClass === 'exact') {
                badgeText = "Exacto (2.0)";
                badgeClass = "badge-exact";
                tooltipText = "Resultado exacto: acertó marcador y signo (2.0 puntos netos)";
            } else if (item.outcomeClass === 'diff') {
                badgeText = "Dif. Goles (1.0)";
                badgeClass = "badge-diff";
                tooltipText = "Diferencia de goles: acertó diferencia y signo (1.0 punto neto)";
            } else if (item.outcomeClass === 'sign') {
                badgeText = "Signo 1X2 (0.5)";
                badgeClass = "badge-sign";
                tooltipText = "Signo 1X2: acertó ganador o empate (0.5 puntos netos)";
            }
            
            if (item.isProvisional) {
                badgeText += "*";
                tooltipText += " (Provisional: partido en directo)";
            }
            
            scoreBadge = `<span class="prediction-badge ${badgeClass}" title="${tooltipText}">${badgeText}</span>`;
        }

        const flagHome = getFlagHtml(item.casa, false);
        const flagAway = getFlagHtml(item.fuera, false);

        // Parse prediction to display it cleanly (e.g. "2-1 (1)" instead of "1|2-1")
        let predDisplay = item.pred;
        if (item.pred && item.pred.includes('|')) {
            const parts = item.pred.split('|');
            predDisplay = `${parts[1]} <span class="text-muted" style="font-size:0.75rem;">(${parts[0]})</span>`;
        }

        const casaAbbr = getCountryAbbreviation(item.casa);
        const fueraAbbr = getCountryAbbreviation(item.fuera);

        tr.innerHTML = `
            <td class="text-center"><small class="text-muted">${item.jor}</small></td>
            <td style="white-space: nowrap;">
                ${flagHome} 
                <span class="modal-team-name" title="${item.casa}">${casaAbbr}</span> 
                - 
                <span class="modal-team-name" title="${item.fuera}">${fueraAbbr}</span> 
                ${flagAway}
            </td>
            <td class="text-center">${predDisplay}</td>
            <td class="text-center"><strong>${item.actual}</strong></td>
            <td class="text-center">${scoreBadge}</td>
        `;
        groupsBody.appendChild(tr);
    });

    // Reset active subtabs to first one when modal opens
    document.querySelectorAll('.tab-sub-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    const firstSubTab = document.querySelector('.tab-sub-btn');
    if (firstSubTab) {
        firstSubTab.classList.add('active');
        const firstContent = document.getElementById(firstSubTab.getAttribute('data-subtab'));
        if (firstContent) firstContent.classList.add('active');
    }

    // Reference and clear all the subtab container lists
    const r32List = document.getElementById('modal-r32-list');
    r32List.innerHTML = '';
    
    const r16List = document.getElementById('modal-r16-list');
    r16List.innerHTML = '';
    
    const r8List = document.getElementById('modal-r8-list');
    r8List.innerHTML = '';
    
    const finalSemisList = document.getElementById('modal-final-semis-list');
    finalSemisList.innerHTML = '';
    
    const specialsList = document.getElementById('modal-specials-list');
    specialsList.innerHTML = '';

    const playerPreds = porraData.predictions[player.name];

    // --- Tab 6: Posiciones / Honor (Posiciones de Grupo y Cuadro de Honor) ---
    
    // Standings Predictions (Positions 1º to 4º)
    const standingsCard = createKOCard("Predicciones de Grupos (1º al 4º)");
    const dynamicStandingsData = calculateGroupStandings();
    
    Object.entries(playerPreds.group_standings || {}).forEach(([item, teamPred]) => {
        const official = results.group_standings[item] || '';
        let actual = official;
        let isCorrect = official && official.toLowerCase() === teamPred.toLowerCase();
        let pts = isCorrect ? (item.startsWith("1º") || item.startsWith("2º") ? 1.0 : 0.5) : 0.0;
        let isProv = false;
        
        if (!official || official.trim() === "") {
            const match = item.match(/^(\d)º GRUPO ([A-L])$/);
            if (match) {
                const posNum = parseInt(match[1]);
                const groupLetter = match[2];
                const groupTeams = dynamicStandingsData.standingsByGroup[groupLetter] || [];
                const provisionalTeam = groupTeams[posNum - 1] ? groupTeams[posNum - 1].name : '';
                
                if (provisionalTeam && provisionalTeam.trim() !== "") {
                    actual = provisionalTeam;
                    isCorrect = String(provisionalTeam).toLowerCase() === String(teamPred).toLowerCase();
                    pts = isCorrect ? (item.startsWith("1º") || item.startsWith("2º") ? 1.0 : 0.5) : 0.0;
                    isProv = true;
                }
            }
        }
        
        const label = item + (isProv ? " *" : "");
        const actualVal = actual ? actual + (isProv ? " (Prov.)" : "") : "-";
        addKOItem(standingsCard, label, teamPred, actualVal, pts);
    });
    specialsList.appendChild(standingsCard);

    // Cuadro de honor (Campeón, Subcampeón, MVP, etc.)
    const honorCard = createKOCard("Cuadro de Honor y Premios Especiales");
    const mappings = {
        'Subcampeón': { key: 'honor_runner', label: 'Subcampeón', pts: 3.0 },
        'Campeón': { key: 'honor_champ', label: 'Campeón Mundial', pts: 5.0 },
        'Tercero': { key: 'honor_3rd', label: 'Tercero', pts: 2.0 },
        'Cuarto': { key: 'honor_4th', label: 'Cuarto', pts: 1.0 },
        'Goleador': { key: 'honor_scorer', label: 'Máximo Goleador', pts: 0.5 },
        'Asistente': { key: 'honor_assists', label: 'Máximo Asistente', pts: 0.5 },
        'M.V.P.': { key: 'honor_mvp', label: 'M.V.P. del Torneo', pts: 0.5 },
        'Portero': { key: 'honor_gk', label: 'Mejor Portero', pts: 0.5 },
        'Joven': { key: 'honor_young', label: 'Mejor Jugador Joven', pts: 0.5 }
    };

    Object.entries(playerPreds.honor_list || {}).forEach(([item, teamPred]) => {
        let matched = null;
        const itemLower = item.toLowerCase();
        for (const [label, mapObj] of Object.entries(mappings)) {
            let match = false;
            if (label === 'Tercero') {
                match = itemLower.includes('tercero') || itemLower.includes('3º');
            } else if (label === 'M.V.P.') {
                match = itemLower.includes('m.v.p.') || (itemLower.includes('balón de oro') && !itemLower.includes('plata') && !itemLower.includes('bronce'));
            } else if (label === 'Goleador') {
                match = itemLower.includes('goleador') && !itemLower.includes('plata') && !itemLower.includes('bronce');
            } else {
                match = itemLower.includes(label.toLowerCase());
            }
            
            if (match) {
                matched = mapObj;
                break;
            }
        }
        if (matched) {
            const actual = results[matched.key] || '';
            const normalizeString = s => {
                if (!s) return "";
                return s.toString().toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .trim();
            };
            const actualNorm = normalizeString(actual);
            const predNorm = normalizeString(teamPred);
            const isCorrect = actual && (actualNorm === predNorm || 
                              (actualNorm.includes(predNorm) && predNorm.length > 3) || 
                              (predNorm.includes(actualNorm) && actualNorm.length > 3));
            const pts = isCorrect ? matched.pts : 0.0;
            addKOItem(honorCard, matched.label, teamPred, actual, pts);
        }
    });
    specialsList.appendChild(honorCard);

    // --- Tab 2: Dieciseisavos ---
    
    // Qualified teams R32 Card
    const r32Card = createKOCard("Equipos clasificados a Dieciseisavos (1/16)");
    Object.entries(playerPreds.r32_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r32_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.r32_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(r32Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    r32List.appendChild(r32Card);

    // R32 Matches Table
    const r32MatchesCard = createKOTableCard("Partidos - Dieciseisavos (1/16)", ["Nº", "Predicción", "Real", "Puntos"]);
    Object.entries(playerPreds.r32_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(r32MatchesCard, "Dieciseisavos", key, predVal, results.r32_matches);
    });
    r32List.appendChild(r32MatchesCard);

    // --- Tab 3: Octavos ---
    
    // Qualified teams R16 Card
    const r16Card = createKOCard("Equipos clasificados a Octavos (1/8)");
    Object.entries(playerPreds.r16_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r16_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.r16_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(r16Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    r16List.appendChild(r16Card);

    // R16 Matches Table
    const r16MatchesCard = createKOTableCard("Partidos - Octavos (1/8)", ["Nº", "Predicción", "Real", "Puntos"]);
    Object.entries(playerPreds.r16_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(r16MatchesCard, "Octavos", key, predVal, results.r16_matches);
    });
    r16List.appendChild(r16MatchesCard);

    // --- Tab 4: Cuartos ---
    
    // Qualified teams R8 Card
    const r8Card = createKOCard("Equipos clasificados a Cuartos (1/4)");
    Object.entries(playerPreds.r8_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r8_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.r8_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(r8Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    r8List.appendChild(r8Card);

    // R8 Matches Table
    const r8MatchesCard = createKOTableCard("Partidos - Cuartos (1/4)", ["Nº", "Predicción", "Real", "Puntos"]);
    Object.entries(playerPreds.r8_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(r8MatchesCard, "Cuartos", key, predVal, results.r8_matches);
    });
    r8List.appendChild(r8MatchesCard);

    // --- Tab 5: Semifinales / Finales ---
    
    // Qualified teams Semifinals (1/2) Card
    const r4Card = createKOCard("Equipos clasificados a Semifinales (1/2)");
    Object.entries(playerPreds.r4_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r4_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.r4_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(r4Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    finalSemisList.appendChild(r4Card);

    // Qualified Finalists Card
    const finalCard = createKOCard("Equipos Finalistas");
    Object.entries(playerPreds.final_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.final_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.final_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(finalCard, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    finalSemisList.appendChild(finalCard);

    // Qualified 3rd/4th place Card
    const r3_4Card = createKOCard("Equipos en 3er/4to puesto");
    Object.entries(playerPreds.r3_4_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r3_4_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? (Number(porraData.rules.r3_4_qualified || 2.0) / 2.0) : 0.0;
        addKOItem(r3_4Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    finalSemisList.appendChild(r3_4Card);

    // Semifinals Matches Table
    const r4MatchesCard = createKOTableCard("Partidos - Semifinales (1/2)", ["Nº", "Predicción", "Real", "Puntos"]);
    Object.entries(playerPreds.r4_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(r4MatchesCard, "Semifinales", key, predVal, results.r4_matches);
    });
    finalSemisList.appendChild(r4MatchesCard);
    
    // Finals Matches Table
    const finalMatchesCard = createKOTableCard("Partidos - Finales", ["Fase", "Predicción", "Real", "Puntos"]);
    if (playerPreds.r3_4_match) {
        evaluateSingleKOMatch(finalMatchesCard, "3º y 4º Puesto", playerPreds.r3_4_match, results.r3_4_match);
    }
    if (playerPreds.final_match) {
        evaluateSingleKOMatch(finalMatchesCard, "Gran Final", playerPreds.final_match, results.final_match);
    }
    finalSemisList.appendChild(finalMatchesCard);

    // Open modal
    document.getElementById('player-modal').classList.add('open');
}

function createKOCard(title) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.style.marginBottom = '1rem';
    card.innerHTML = `<h4 style="font-family:var(--font-heading); color:var(--color-accent); margin-bottom:0.75rem; font-size:1.1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.4rem;">${title}</h4><div class="ko-items-container"></div>`;
    return card;
}

function addKOItem(card, label, pred, actual, pts) {
    const container = card.querySelector('.ko-items-container');
    const div = document.createElement('div');
    div.classList.add('ko-pred-item');
    
    let ptsLabel = '';
    if (pts > 0) {
        ptsLabel = `<span class="ko-points-won" style="color:var(--color-success)">+${pts.toFixed(1)} pts</span>`;
    } else {
        ptsLabel = `<span class="ko-points-won" style="color:var(--text-muted)">0.0 pts</span>`;
    }

    const flagPred = getFlagHtml(pred);
    const flagActual = (actual && actual !== '-' && actual !== 'Eliminado' && actual !== 'Clasificado') ? getFlagHtml(actual) : '';

    div.innerHTML = `
        <div class="ko-pred-label">
            <strong>${label}</strong><br>
            <span style="font-size:0.8rem">Predicho: ${flagPred} ${pred}</span>
        </div>
        <div class="ko-pred-val">
            <span style="font-size:0.85rem; color:var(--text-muted)">Real: ${flagActual} ${actual || '-'}</span>
            ${ptsLabel}
        </div>
    `;
    container.appendChild(div);
}

function evaluateKOBracketMatch(card, stageLabel, matchKey, predVal, actualMatchesList) {
    if (!predVal || !predVal.includes('·')) return;
    const parts = predVal.split('·');
    const predMatchup = parts[0];
    const predScore = parts[1];
    
    const actual = actualMatchesList[matchKey];
    let actualMatchup = '';
    let actualScore = '';
    let pts = 0.0;
    
    if (actual) {
        actualMatchup = actual.matchup || '';
        actualScore = actual.score || '';
    }

    const isMatchupCorrect = actualMatchup && actualMatchup.toLowerCase() === predMatchup.toLowerCase();
    
    if (isMatchupCorrect && actualScore) {
        const outcome = calcOutcomePoints(actualScore, predScore);
        pts = outcome.points / 2.0; // Net points
    }

    let isProvisionalMatchup = false;
    let officialMatchObj = null;
    if (actualMatchesList === results.r32_matches) officialMatchObj = officialResults.r32_matches[matchKey];
    else if (actualMatchesList === results.r16_matches) officialMatchObj = officialResults.r16_matches[matchKey];
    else if (actualMatchesList === results.r8_matches) officialMatchObj = officialResults.r8_matches[matchKey];
    else if (actualMatchesList === results.r4_matches) officialMatchObj = officialResults.r4_matches[matchKey];
    
    if (actualMatchup) {
        if (!officialMatchObj || !officialMatchObj.matchup || officialMatchObj.matchup.trim() === "" || officialMatchObj.matchup.match(/\d/)) {
            isProvisionalMatchup = true;
        }
    }
    const isMatchupResolved = actualMatchup && actualMatchup.trim() !== "" && !actualMatchup.includes("Por determinar") && !actualMatchup.match(/\d/);

    if (actualMatchesList === results.r32_matches) {
        if (!isGroupStageCompleted()) {
            isProvisionalMatchup = true;
        }
    } else if (actualMatchesList === results.r16_matches) {
        const hasPrevRoundStarted = isGroupStageCompleted();
        if (!hasPrevRoundStarted || (!isR32Completed() && !isMatchupResolved)) {
            isProvisionalMatchup = true;
        }
    } else if (actualMatchesList === results.r8_matches) {
        const hasPrevRoundStarted = isR32Completed();
        if (!hasPrevRoundStarted || (!isR16Completed() && !isMatchupResolved)) {
            isProvisionalMatchup = true;
        }
    } else if (actualMatchesList === results.r4_matches) {
        const hasPrevRoundStarted = isR16Completed();
        if (!hasPrevRoundStarted || (!isR8Completed() && !isMatchupResolved)) {
            isProvisionalMatchup = true;
        }
    }

    const provLabel = isProvisionalMatchup ? ' <span style="color:var(--color-success); font-weight:700;" title="Cruces provisionales">*</span>' : '';
    
    let displayMatchupHtml = '';
    if (actualMatchup) {
        displayMatchupHtml = formatMatchupHtml(actualMatchup) + provLabel;
        if (actualScore) {
            displayMatchupHtml += ` <strong>(${actualScore})</strong>`;
        }
    } else {
        displayMatchupHtml = '<span class="text-muted">Pendiente</span>';
    }

    let ptsLabel = '';
    let badgeClass = 'badge-miss';
    if (pts > 0) {
        badgeClass = pts === 2.0 ? 'badge-exact' : (pts === 1.0 ? 'badge-diff' : 'badge-sign');
        ptsLabel = `<span class="prediction-badge ${badgeClass}">+${pts.toFixed(1)} pts</span>`;
    } else {
        if (!actualMatchup || actualMatchup.trim() === "") {
            ptsLabel = `<span class="prediction-badge badge-miss" title="El cruce real aún está pendiente de decidir">Pendiente</span>`;
        } else if (!isMatchupCorrect) {
            ptsLabel = `<span class="prediction-badge badge-miss" style="background:rgba(239, 68, 68, 0.12); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.2);" title="No puntúa por no haber acertado el enfrentamiento exacto">Cruce inc. (0.0)</span>`;
        } else if (!actualScore || actualScore.trim() === "") {
            ptsLabel = `<span class="prediction-badge badge-miss" style="background:rgba(59, 130, 246, 0.12); color:#3b82f6; border:1px solid rgba(59, 130, 246, 0.2);" title="Enfrentamiento acertado. Esperando a que se juegue el partido">Cruce ok (0.0)</span>`;
        } else {
            ptsLabel = `<span class="prediction-badge badge-miss" title="Fallo en la predicción del resultado (1X2/marcador/diferencia) sobre un cruce acertado">Fallo (0.0)</span>`;
        }
    }

    const matchNum = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === matchKey);
    const labelText = matchNum ? `#${matchNum}` : matchKey;

    const tbody = card.querySelector('tbody');
    if (tbody) {
        const tr = document.createElement('tr');
        tr.classList.add('prediction-row');
        
        tr.innerHTML = `
            <td class="text-center"><small class="text-muted" title="Cruce original: ${matchKey}">${labelText}</small></td>
            <td>${formatMatchupHtml(predMatchup)} <strong>(${predScore})</strong></td>
            <td>${displayMatchupHtml}</td>
            <td class="text-center">${ptsLabel}</td>
        `;
        tbody.appendChild(tr);
    }
}

function evaluateSingleKOMatch(card, label, predVal, actualMatchObj) {
    if (!predVal || !predVal.includes('·')) return;
    const parts = predVal.split('·');
    const predMatchup = parts[0];
    const predScore = parts[1];
    
    let actualMatchup = '';
    let actualScore = '';
    let pts = 0.0;
    
    if (actualMatchObj) {
        actualMatchup = actualMatchObj.matchup || '';
        actualScore = actualMatchObj.score || '';
    }

    const isMatchupCorrect = actualMatchup && actualMatchup.toLowerCase() === predMatchup.toLowerCase();
    
    if (isMatchupCorrect && actualScore) {
        const outcome = calcOutcomePoints(actualScore, predScore);
        pts = outcome.points / 2.0; // Net points
    }

    let isProvisionalMatchup = false;
    let officialMatchObj = null;
    if (actualMatchObj === results.r3_4_match) officialMatchObj = officialResults.r3_4_match;
    else if (actualMatchObj === results.final_match) officialMatchObj = officialResults.final_match;

    if (actualMatchup && (!officialMatchObj || !officialMatchObj.matchup || officialMatchObj.matchup.trim() === "")) {
        isProvisionalMatchup = true;
    }

    const provLabel = isProvisionalMatchup ? ' <span style="color:var(--color-success); font-weight:700;" title="Cruces provisionales">*</span>' : '';
    
    let displayMatchupHtml = '';
    if (actualMatchup) {
        displayMatchupHtml = formatMatchupHtml(actualMatchup) + provLabel;
        if (actualScore) {
            displayMatchupHtml += ` <strong>(${actualScore})</strong>`;
        }
    } else {
        displayMatchupHtml = '<span class="text-muted">Pendiente</span>';
    }

    let ptsLabel = '';
    let badgeClass = 'badge-miss';
    if (pts > 0) {
        badgeClass = pts === 2.0 ? 'badge-exact' : (pts === 1.0 ? 'badge-diff' : 'badge-sign');
        ptsLabel = `<span class="prediction-badge ${badgeClass}">+${pts.toFixed(1)} pts</span>`;
    } else {
        if (!actualMatchup || actualMatchup.trim() === "") {
            ptsLabel = `<span class="prediction-badge badge-miss" title="El cruce real aún está pendiente de decidir">Pendiente</span>`;
        } else if (!isMatchupCorrect) {
            ptsLabel = `<span class="prediction-badge badge-miss" style="background:rgba(239, 68, 68, 0.12); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.2);" title="No puntúa por no haber acertado el enfrentamiento exacto">Cruce inc. (0.0)</span>`;
        } else if (!actualScore || actualScore.trim() === "") {
            ptsLabel = `<span class="prediction-badge badge-miss" style="background:rgba(59, 130, 246, 0.12); color:#3b82f6; border:1px solid rgba(59, 130, 246, 0.2);" title="Enfrentamiento acertado. Esperando a que se juegue el partido">Cruce ok (0.0)</span>`;
        } else {
            ptsLabel = `<span class="prediction-badge badge-miss" title="Fallo en la predicción del resultado (1X2/marcador/diferencia) sobre un cruce acertado">Fallo (0.0)</span>`;
        }
    }

    const tbody = card.querySelector('tbody');
    if (tbody) {
        const tr = document.createElement('tr');
        tr.classList.add('prediction-row');
        
        tr.innerHTML = `
            <td class="text-center"><small class="text-muted">${label}</small></td>
            <td>${formatMatchupHtml(predMatchup)} <strong>(${predScore})</strong></td>
            <td>${displayMatchupHtml}</td>
            <td class="text-center">${ptsLabel}</td>
        `;
        tbody.appendChild(tr);
    }
}

function createKOTableCard(title, headers = ["Cruce", "Predicción", "Real", "Puntos"]) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.style.gridColumn = '1 / -1'; // Spans full width in CSS grid
    card.style.marginBottom = '1.5rem';
    
    const cardHeader = document.createElement('div');
    cardHeader.classList.add('card-header');
    cardHeader.style.paddingBottom = '0.5rem';
    cardHeader.style.borderBottom = '1px solid var(--border-color)';
    cardHeader.innerHTML = `<h4 style="font-family:var(--font-heading); color:var(--color-accent); font-size:1.15rem; font-weight:700; margin:0;"><i class="fa-solid fa-circle-nodes"></i> ${title}</h4>`;
    card.appendChild(cardHeader);
    
    const tableResp = document.createElement('div');
    tableResp.classList.add('table-responsive');
    tableResp.style.marginTop = '0.5rem';
    
    const table = document.createElement('table');
    table.classList.add('table', 'table-compact');
    
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        if (h === "Puntos" || h === "Cruce" || h === "Nº" || h === "Fase") {
            th.classList.add('text-center');
        }
        th.innerText = h;
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableResp.appendChild(table);
    card.appendChild(tableResp);
    
    return card;
}

function formatMatchupHtml(matchupStr) {
    if (!matchupStr || !matchupStr.includes('-')) {
        return `<span class="text-muted">${matchupStr || '-'}</span>`;
    }
    const teams = matchupStr.split('-');
    if (teams.length !== 2) return matchupStr;
    const t1 = teams[0].trim();
    const t2 = teams[1].trim();
    const flag1 = getFlagHtml(t1, false);
    const flag2 = getFlagHtml(t2, false);
    const abbr1 = getCountryAbbreviation(t1);
    const abbr2 = getCountryAbbreviation(t2);
    return `<span style="white-space: nowrap;">${flag1} <span class="modal-team-name" title="${t1}">${abbr1}</span> - <span class="modal-team-name" title="${t2}">${abbr2}</span> ${flag2}</span>`;
}

function formatMatchupFlagsOnlyHtml(matchupStr) {
    if (!matchupStr || !matchupStr.includes('-')) {
        return `<span class="text-muted">${matchupStr || '-'}</span>`;
    }
    const teams = matchupStr.split('-');
    if (teams.length !== 2) return matchupStr;
    const t1 = teams[0].trim();
    const t2 = teams[1].trim();
    const flag1 = getFlagHtml(t1, false);
    const flag2 = getFlagHtml(t2, false);
    return `<span style="white-space: nowrap;" title="${t1} vs ${t2}">${flag1} - ${flag2}</span>`;
}

function closePlayerModal() {
    document.getElementById('player-modal').classList.remove('open');
    document.body.classList.remove('modal-open');
}

function openMatchPredictionsModal(r, matchKey) {
    let matchObj = null;
    if (r.prefix === 'single') {
        matchObj = (results && results[matchKey]) || { matchup: '', score: '' };
    } else {
        matchObj = (results && results[r.prefix] && results[r.prefix][matchKey]) || { matchup: '', score: '' };
    }

    const matchup = matchObj.matchup || '';
    const score = matchObj.score || '';
    const isPlayed = score.trim() !== "";

    let t1 = "Por determinar";
    let t2 = "Por determinar";
    if (matchup.includes('-')) {
        const parts = matchup.split('-');
        t1 = parts[0].trim() || "Por determinar";
        t2 = parts[1].trim() || "Por determinar";
    } else if (matchup.trim() !== "") {
        t1 = matchup.trim();
    }

    const matchNum = Object.keys(MATCH_KEYS_BY_NUMBER).find(n => MATCH_KEYS_BY_NUMBER[n] === matchKey);
    let roundName = "";
    if (r.key === 'r32') roundName = "Dieciseisavos (1/16)";
    else if (r.key === 'r16') roundName = "Octavos (1/8)";
    else if (r.key === 'r8') roundName = "Cuartos (1/4)";
    else if (r.key === 'r4') roundName = "Semifinal (1/2)";
    else if (matchKey === 'r3_4_match') roundName = "3º y 4º Puesto";
    else if (matchKey === 'final_match') roundName = "Gran Final";

    const matchTitle = matchNum ? `${roundName} - Partido #${matchNum}` : roundName;

    // Set title
    document.getElementById('modal-match-title').innerText = matchTitle;

    // Set match details (Teams, scores, date)
    const matchDateStr = koMatchDates[matchKey] || '';
    const flagHomeHtml = getFlagHtml(t1, false);
    const flagAwayHtml = getFlagHtml(t2, false);

    let homeScore = '-';
    let awayScore = '-';
    if (isPlayed) {
        const mainPart = score.split(' ')[0];
        const parts = mainPart.split('-');
        homeScore = parts[0] || '-';
        awayScore = parts[1] || '-';
        
        const matchPenalties = score.match(/\((\d+)-(\d+)\)/);
        if (matchPenalties && matchPenalties.length === 3) {
            const penH = matchPenalties[1];
            const penA = matchPenalties[2];
            homeScore += ` <span class="penalty-score" style="font-size:1.1rem; color:var(--text-muted); font-weight:normal;">(${penH})</span>`;
            awayScore += ` <span class="penalty-score" style="font-size:1.1rem; color:var(--text-muted); font-weight:normal;">(${penA})</span>`;
        }
    }

    document.getElementById('modal-match-details').innerHTML = `
        <!-- Line 1: Schedule -->
        <div style="color: var(--text-muted); font-size: 0.82rem; margin-top: 0.5rem; margin-bottom: 0.8rem; text-align: center;">
            <i class="fa-regular fa-clock"></i> ${matchDateStr}
        </div>
        
        <!-- Line 2 & 3: Matchup and Scores -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 1.25rem;">
            <!-- Home Team info & Score aligned underneath -->
            <div style="display: flex; flex-direction: column; align-items: center; width: 140px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
                    ${flagHomeHtml}
                    <strong style="font-size: 1rem; max-width: 100px; overflow: hidden; text-overflow: ellipsis;" title="${t1}">${t1}</strong>
                </div>
                <div style="font-size: 1.8rem; font-weight: 800; color: var(--color-success); margin-top: 0.25rem;">
                    ${homeScore}
                </div>
            </div>

            <!-- VS Middle Separator -->
            <div style="font-size: 1rem; color: var(--text-muted); font-weight: 700; height: 100%; display: flex; align-items: center; padding-bottom: 1.8rem;">
                VS
            </div>

            <!-- Away Team info & Score aligned underneath -->
            <div style="display: flex; flex-direction: column; align-items: center; width: 140px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
                    <strong style="font-size: 1rem; max-width: 100px; overflow: hidden; text-overflow: ellipsis;" title="${t2}">${t2}</strong>
                    ${flagAwayHtml}
                </div>
                <div style="font-size: 1.8rem; font-weight: 800; color: var(--color-success); margin-top: 0.25rem;">
                    ${awayScore}
                </div>
            </div>
        </div>
    `;

    // Populate predictions table
    const tbody = document.getElementById('modal-match-preds-body');
    tbody.innerHTML = '';

    porraData.players.forEach(p => {
        const playerPreds = porraData.predictions[p] || {};
        let pred = '';
        if (r.prefix === 'single') {
            pred = playerPreds[matchKey] || '';
        } else {
            pred = (playerPreds[r.prefix] && playerPreds[r.prefix][matchKey]) || '';
        }

        let predDisplay = '-';
        let badgeText = "Fallo";
        let badgeClass = "badge-miss";
        let pointsText = "0.0 pts";
        let isMatchupCorrect = false;

        if (pred && pred.includes('·')) {
            const parts = pred.split('·');
            const predMatchup = parts[0];
            const predScore = parts[1];

            predDisplay = `${formatMatchupFlagsOnlyHtml(predMatchup)} <strong>(${predScore})</strong>`;

            if (isPlayed) {
                isMatchupCorrect = matchup && matchup.toLowerCase() === predMatchup.toLowerCase();
                if (isMatchupCorrect) {
                    const outcome = calcOutcomePoints(score, predScore);
                    const pts = outcome.points / 2.0; // Net points in KO
                    if (pts > 0) {
                        badgeText = pts === 2.0 ? "Exacto" : (pts === 1.0 ? "Dif. Goles" : "Signo 1X2");
                        badgeClass = pts === 2.0 ? "badge-exact" : (pts === 1.0 ? "badge-diff" : "badge-sign");
                        pointsText = `+${pts.toFixed(1)} pts`;
                    } else {
                        badgeText = "Fallo";
                        badgeClass = "badge-miss";
                        pointsText = "0.0 pts";
                    }
                } else {
                    badgeText = "Cruce inc.";
                    badgeClass = "badge-miss";
                    pointsText = "0.0 pts";
                }
            }
        }

        let tooltip = '';
        if (isPlayed) {
            if (!isMatchupCorrect) {
                tooltip = 'Fallo por cruce incorrecto (0.0 puntos)';
            } else if (badgeClass === 'badge-exact') {
                tooltip = 'Resultado exacto (+2.0 puntos netos)';
            } else if (badgeClass === 'badge-diff') {
                tooltip = 'Diferencia de goles (+1.0 punto neto)';
            } else if (badgeClass === 'badge-sign') {
                tooltip = 'Signo 1X2 (+0.5 puntos netos)';
            } else {
                tooltip = 'Fallo en resultado (0.0 puntos)';
            }
        } else {
            tooltip = 'Partido pendiente de jugar';
        }

        const badgeHtml = isPlayed ? 
            `<span class="prediction-badge ${badgeClass}" title="${tooltip}">${badgeText}</span>` : 
            `<span class="prediction-badge badge-miss" title="${tooltip}" style="background:rgba(255,255,255,0.03); color:var(--text-muted); border:1px solid rgba(255,255,255,0.08);">Pendiente</span>`;
        
        const ptsColor = (badgeClass === 'badge-exact' || badgeClass === 'badge-diff' || badgeClass === 'badge-sign') ? 'var(--color-success)' : 'var(--text-muted)';
        const pointsDisplay = isPlayed ? `<span class="pred-player-pts" style="color: ${ptsColor}; font-weight: 700;">${pointsText}</span>` : `<span class="pred-player-pts" style="color: var(--text-muted); font-size: 0.8rem;">0.0 pts</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #fff; vertical-align: middle;">${p}</td>
            <td class="text-center" style="vertical-align: middle; white-space: nowrap;">${predDisplay}</td>
            <td class="text-center" style="vertical-align: middle; white-space: nowrap;">
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    ${badgeHtml}
                    ${pointsDisplay}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('match-predictions-modal').classList.add('open');
    document.body.classList.add('modal-open');
}

function closeMatchPredictionsModal() {
    document.getElementById('match-predictions-modal').classList.remove('open');
    document.body.classList.remove('modal-open');
}




// Helper: get 3-letter abbreviation for Spanish country names (FIFA codes)
function getCountryAbbreviation(name) {
    if (!name) return "";
    const cleanName = name.trim();
    const abbreviations = {
        'México': 'MEX',
        'Sudáfrica': 'RSA',
        'Corea del Sur': 'KOR',
        'República Checa': 'CZE',
        'Canadá': 'CAN',
        'Bosnia y Herzegovina': 'BIH',
        'Catar': 'QAT',
        'Suiza': 'SUI',
        'Brasil': 'BRA',
        'Marruecos': 'MAR',
        'Haití': 'HAI',
        'Escocia': 'SCO',
        'Estados Unidos': 'USA',
        'Paraguay': 'PAR',
        'Australia': 'AUS',
        'Turquía': 'TUR',
        'Alemania': 'GER',
        'Curazao': 'CUW',
        'Costa de Marfil': 'CIV',
        'Ecuador': 'ECU',
        'Países Bajos': 'NED',
        'Japón': 'JPN',
        'Suecia': 'SWE',
        'Túnez': 'TUN',
        'Bélgica': 'BEL',
        'Egipto': 'EGY',
        'Irán': 'IRN',
        'Nueva Zelanda': 'NZL',
        'España': 'ESP',
        'Cabo Verde': 'CPV',
        'Arabia Saudita': 'KSA',
        'Uruguay': 'URU',
        'Francia': 'FRA',
        'Senegal': 'SEN',
        'Irak': 'IRQ',
        'Noruega': 'NOR',
        'Argentina': 'ARG',
        'Argelia': 'ALG',
        'Austria': 'AUT',
        'Jordania': 'JOR',
        'Portugal': 'POR',
        'RD Congo': 'COD',
        'Uzbekistán': 'UZB',
        'Colombia': 'COL',
        'Inglaterra': 'ENG',
        'Croacia': 'CRO',
        'Ghana': 'GHA',
        'Panamá': 'PAN'
    };
    return abbreviations[cleanName] || cleanName;
}

// Helper: get HTML for country flag image from flagcdn
function getFlagHtml(countryName, isLarge = false) {
    if (!countryName) return "";
    
    // Map Spanish country name to ISO 2-letter code
    const isoCodes = {
        'México': 'mx',
        'Sudáfrica': 'za',
        'Corea del Sur': 'kr',
        'República Checa': 'cz',
        'Canadá': 'ca',
        'Bosnia y Herzegovina': 'ba',
        'Catar': 'qa',
        'Suiza': 'ch',
        'Brasil': 'br',
        'Marruecos': 'ma',
        'Haití': 'ht',
        'Escocia': 'gb-sct',
        'Estados Unidos': 'us',
        'Paraguay': 'py',
        'Australia': 'au',
        'Turquía': 'tr',
        'Alemania': 'de',
        'Curazao': 'cw',
        'Costa de Marfil': 'ci',
        'Ecuador': 'ec',
        'Países Bajos': 'nl',
        'Japón': 'jp',
        'Suecia': 'se',
        'Túnez': 'tn',
        'Bélgica': 'be',
        'Egipto': 'eg',
        'Irán': 'ir',
        'Nueva Zelanda': 'nz',
        'España': 'es',
        'Cabo Verde': 'cv',
        'Arabia Saudita': 'sa',
        'Uruguay': 'uy',
        'Francia': 'fr',
        'Senegal': 'sn',
        'Irak': 'iq',
        'Noruega': 'no',
        'Argentina': 'ar',
        'Argelia': 'dz',
        'Austria': 'at',
        'Jordania': 'jo',
        'Portugal': 'pt',
        'RD Congo': 'cd',
        'Uzbekistán': 'uz',
        'Colombia': 'co',
        'Inglaterra': 'gb-eng',
        'Croacia': 'hr',
        'Ghana': 'gh',
        'Panamá': 'pa'
    };

    const code = isoCodes[countryName.trim()];
    if (!code) {
        if (isLarge) {
            return `<div class="team-flag-img placeholder-flag" title="${countryName}"><i class="fa-solid fa-circle-question"></i></div>`;
        } else {
            return `<span class="flag-img placeholder-flag" title="${countryName}"><i class="fa-solid fa-circle-question"></i></span>`;
        }
    }

    if (isLarge) {
        return `<img src="https://flagcdn.com/48x36/${code}.png" alt="${countryName}" class="team-flag-img">`;
    } else {
        return `<img src="https://flagcdn.com/20x15/${code}.png" alt="${countryName}" class="flag-img">`;
    }
}

// Helper to render flags for matchups like "España-Alemania"
function getMatchupFlagsHtml(matchupStr) {
    if (!matchupStr || !matchupStr.includes('-')) return matchupStr;
    const teams = matchupStr.split('-');
    if (teams.length !== 2) return matchupStr;
    const t1 = teams[0].trim();
    const t2 = teams[1].trim();
    return `${getFlagHtml(t1)} ${t1} - ${t2} ${getFlagHtml(t2)}`;
}

const EN_TO_ES_TEAMS = {
    'Mexico': 'México',
    'South Africa': 'Sudáfrica',
    'South Korea': 'Corea del Sur',
    'Czech Republic': 'República Checa',
    'Canada': 'Canadá',
    'Bosnia & Herzegovina': 'Bosnia y Herzegovina',
    'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
    'Qatar': 'Catar',
    'Switzerland': 'Suiza',
    'Brazil': 'Brasil',
    'Morocco': 'Marruecos',
    'Haiti': 'Haití',
    'Scotland': 'Escocia',
    'United States': 'Estados Unidos',
    'Paraguay': 'Paraguay',
    'Australia': 'Australia',
    'Turkey': 'Turquía',
    'Germany': 'Alemania',
    'Curaçao': 'Curazao',
    'Curacao': 'Curazao',
    'Ivory Coast': 'Costa de Marfil',
    'Ecuador': 'Ecuador',
    'Netherlands': 'Países Bajos',
    'Japan': 'Japón',
    'Sweden': 'Suecia',
    'Tunisia': 'Túnez',
    'Belgium': 'Bélgica',
    'Egypt': 'Egipto',
    'Iran': 'Irán',
    'New Zealand': 'Nueva Zelanda',
    'Spain': 'España',
    'Cape Verde': 'Cabo Verde',
    'Saudi Arabia': 'Arabia Saudita',
    'Uruguay': 'Uruguay',
    'France': 'Francia',
    'Senegal': 'Senegal',
    'Iraq': 'Irak',
    'Norway': 'Noruega',
    'Argentina': 'Argentina',
    'Algeria': 'Argelia',
    'Austria': 'Austria',
    'Jordan': 'Jordania',
    'Portugal': 'Portugal',
    'Democratic Republic of the Congo': 'RD Congo',
    'DR Congo': 'RD Congo',
    'Uzbekistan': 'Uzbekistán',
    'Colombia': 'Colombia',
    'England': 'Inglaterra',
    'Croatia': 'Croacia',
    'Ghana': 'Ghana',
    'Panama': 'Panamá'
};

function translateENToESTeam(enName) {
    if (!enName) return "";
    const clean = enName.trim();
    if (EN_TO_ES_TEAMS[clean]) return EN_TO_ES_TEAMS[clean];
    return clean;
}

// Fetch live World Cup match results dynamically from football-data.org API via CORS proxy
const TLA_TRANSLATIONS = {
    'NOR': 'Noruega',
    'HAI': 'Haití',
    'IRN': 'Irán',
    'EGY': 'Egipto',
    'CUW': 'Curazao',
    'CUR': 'Curazao',
    'CAN': 'Canadá',
    'GER': 'Alemania',
    'ESP': 'España',
    'PAR': 'Paraguay',
    'ALG': 'Argelia',
    'JOR': 'Jordania',
    'URY': 'Uruguay',
    'SEN': 'Senegal',
    'RSA': 'Sudáfrica',
    'FRA': 'Francia',
    'KSA': 'Arabia Saudita',
    'TUN': 'Túnez',
    'TUR': 'Turquía',
    'COL': 'Colombia',
    'QAT': 'Catar',
    'MEX': 'México',
    'ARG': 'Argentina',
    'MAR': 'Marruecos',
    'AUT': 'Austria',
    'NZL': 'Nueva Zelanda',
    'BEL': 'Bélgica',
    'UZB': 'Uzbekistán',
    'COD': 'RD Congo',
    'CIV': 'Costa de Marfil',
    'AUS': 'Australia',
    'BIH': 'Bosnia y Herzegovina',
    'CZE': 'República Checa',
    'CRO': 'Croacia',
    'SUI': 'Suiza',
    'ECU': 'Ecuador',
    'SWE': 'Suecia',
    'POR': 'Portugal',
    'JPN': 'Japón',
    'PAN': 'Panamá',
    'IRQ': 'Irak',
    'GHA': 'Ghana',
    'BRA': 'Brasil',
    'KOR': 'Corea del Sur',
    'CPV': 'Cabo Verde',
    'SCO': 'Escocia',
    'NED': 'Países Bajos',
    'ENG': 'Inglaterra',
    'USA': 'Estados Unidos'
};

function translateTeam(teamObj) {
    if (!teamObj) return "";
    const tla = (teamObj.tla || "").toUpperCase();
    if (TLA_TRANSLATIONS[tla]) {
        return TLA_TRANSLATIONS[tla];
    }
    return teamObj.shortName || teamObj.name || "";
}

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED", "LIVE"]);

// Builds a cache object containing only scores that are NOT already confirmed in officialResults.
// This prevents the live cache from ever overwriting official results stored in results.json.
function buildLiveOnlyCache() {
    const cache = { matches: {}, provisionalMatches: Array.from(provisionalMatches) };

    // Group stage: only cache scores that are provisional (live) and absent in officialResults
    for (const [matchId, score] of Object.entries(results.matches || {})) {
        const officialScore = officialResults && officialResults.matches ? (officialResults.matches[matchId] || "") : "";
        if (officialScore.trim() === "" && score && score.trim() !== "") {
            cache.matches[matchId] = score;
        }
    }

    // K.O. stages: only cache scores absent in officialResults
    const koStages = ['r32_matches', 'r16_matches', 'r8_matches', 'r4_matches'];
    koStages.forEach(stage => {
        if (!results[stage]) return;
        cache[stage] = {};
        for (const [key, matchObj] of Object.entries(results[stage])) {
            const officialScore = (officialResults && officialResults[stage] && officialResults[stage][key])
                ? (officialResults[stage][key].score || "")
                : "";
            if (officialScore.trim() === "" && matchObj && matchObj.score && matchObj.score.trim() !== "") {
                cache[stage][key] = { ...matchObj };
            }
        }
    });

    // Single matches (final, 3rd/4th)
    ['r3_4_match', 'final_match'].forEach(key => {
        if (!results[key]) return;
        const officialScore = (officialResults && officialResults[key]) ? (officialResults[key].score || "") : "";
        if (officialScore.trim() === "" && results[key].score && results[key].score.trim() !== "") {
            cache[key] = { ...results[key] };
        }
    });

    return cache;
}

async function fetchAndProcessLiveResults() {
    const apiKey = 'fca19012e1774fee9c2d4382feb0325b';
    const targetUrl = `https://api.football-data.org/v4/competitions/WC/matches?t=${Date.now()}`;
    const reqHeadersStr = `X-Auth-Token:${apiKey}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}&reqHeaders=${encodeURIComponent(reqHeadersStr)}`;

    console.log("Fetching live results from football-data.org via corsproxy.io...");
    try {
        const response = await fetch(proxyUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const resData = await response.json();
        const matches = resData.matches;
        if (!matches || matches.length === 0) {
            console.log("No matches returned by the API.");
            return false;
        }

        console.log(`Retrieved ${matches.length} matches from API. Processing...`);

        // Fill provisional R32 matchups first so K.O. live match checks will match the teams
        fillProvisionalR32Matchups();

        // Capture previous JSON state to check if anything changed
        const prevResultsJSON = JSON.stringify(results);

        // Keep track of previously marked provisional matches
        const prevProvisionalMatches = Array.from(provisionalMatches);
        provisionalMatches.clear();

        const now = Date.now();
        let changed = false;

        // Helper to add qualified teams if missing
        function addQualified(arr, team) {
            if (team && !arr.includes(team)) {
                arr.push(team);
                changed = true;
                return true;
            }
            return false;
        }

        // Helper to update K.O. match scores
        function updateKOStageMatches(stageMatches, t1, t2, score) {
            let updated = false;
            for (const [key, matchObj] of Object.entries(stageMatches)) {
                if (matchObj && matchObj.matchup) {
                    const teams = matchObj.matchup.split('-').map(t => t.trim());
                    if (teams.length === 2) {
                        if ((teams[0] === t1 && teams[1] === t2) || (teams[0] === t2 && teams[1] === t1)) {
                            if (matchObj.score !== score) {
                                matchObj.score = score;
                                updated = true;
                                changed = true;
                            }
                        }
                    }
                }
            }
            return updated;
        }

        matches.forEach(item => {
            const home = translateTeam(item.homeTeam);
            const away = translateTeam(item.awayTeam);
            const roundLower = (item.stage || "").toLowerCase();
            
            let goalsHome = item.score && item.score.fullTime ? item.score.fullTime.home : null;
            let goalsAway = item.score && item.score.fullTime ? item.score.fullTime.away : null;
            
            // Subtract penalties from fullTime score (API includes them in fullTime)
            if (!roundLower.includes('group') && item.score && item.score.penalties && item.score.penalties.home !== null && item.score.penalties.away !== null) {
                if (goalsHome !== null) goalsHome -= item.score.penalties.home;
                if (goalsAway !== null) goalsAway -= item.score.penalties.away;
            }
            
            const status = item.status;
            const matchDate = new Date(item.utcDate).getTime();

            const isLive = LIVE_STATUSES.has(status);
            const isFinished = (status === 'FINISHED');
            const isPlayedOrLive = (goalsHome !== null && goalsAway !== null);
            const scoreStr = (() => {
                if (!isPlayedOrLive) return "";
                let base = `${goalsHome}-${goalsAway}`;
                if (!roundLower.includes('group') && item.score && item.score.penalties && item.score.penalties.home !== null && item.score.penalties.away !== null) {
                    base += ` (${item.score.penalties.home}-${item.score.penalties.away})`;
                }
                return base;
            })();

            // Check if the match has finished very recently (within last 4 hours)
            const isRecentFinished = isFinished && ((now - matchDate) <= 4 * 60 * 60 * 1000);

            let matchId = "";
            let currentScore = "";

            if (roundLower.includes('group')) {
                const localMatch = porraData.matches.find(m => 
                    (m.casa === home && m.fuera === away) || (m.casa === away && m.fuera === home)
                );
                if (localMatch) {
                    matchId = String(localMatch.id);
                    currentScore = (officialResults && officialResults.matches) ? (officialResults.matches[matchId] || "") : "";
                }
            } else {
                let stageMatches = null;
                let keyPrefix = "";
                if (roundLower.includes('32') || roundLower.includes('last_32')) { stageMatches = results.r32_matches; keyPrefix = "r32_matches"; }
                else if (roundLower.includes('16') || roundLower.includes('last_16')) { stageMatches = results.r16_matches; keyPrefix = "r16_matches"; }
                else if (roundLower.includes('quarter')) { stageMatches = results.r8_matches; keyPrefix = "r8_matches"; }
                else if (roundLower.includes('semi')) { stageMatches = results.r4_matches; keyPrefix = "r4_matches"; }
                else if (roundLower.includes('third') || roundLower.includes('bronze') || roundLower.includes('3')) { stageMatches = { "r3_4_match": results.r3_4_match }; keyPrefix = "single"; }
                else if (roundLower.includes('final')) { stageMatches = { "final_match": results.final_match }; keyPrefix = "single"; }

                if (stageMatches) {
                    for (const [key, matchObj] of Object.entries(stageMatches)) {
                        if (matchObj && matchObj.matchup) {
                            const teams = matchObj.matchup.split('-').map(t => t.trim());
                            if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                                matchId = (keyPrefix === "single") ? `single:${key}` : `${keyPrefix}:${key}`;
                                if (officialResults) {
                                    if (keyPrefix === "single") {
                                        currentScore = (officialResults[key] && officialResults[key].score) || "";
                                    } else if (officialResults[keyPrefix] && officialResults[keyPrefix][key]) {
                                        currentScore = officialResults[keyPrefix][key].score || "";
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }

            if (!matchId) return;

            const wasProvisional = prevProvisionalMatches.includes(matchId);

            // We update the score in memory if:
            // 1. We don't have a score loaded officially yet (currentScore is empty)
            // 2. OR the match is currently live
            // 3. OR the match was marked as provisional (so we need to capture the final score if it transitioned to finished)
            // 4. OR the match finished recently
            const shouldProcess = (currentScore.trim() === "");

            if (!shouldProcess) {
                return;
            }

            const homeWon = item.score && item.score.winner === 'HOME_TEAM';
            const awayWon = item.score && item.score.winner === 'AWAY_TEAM';

            if (roundLower.includes('group')) {
                if (results.matches[matchId] !== scoreStr && scoreStr !== "") {
                    results.matches[matchId] = scoreStr;
                    console.log(`Updated Match ${matchId} (${home} ${scoreStr} ${away}) [Status: ${status}]`);
                    changed = true;
                }

                // Track as provisional if currently in progress
                if (isLive) {
                    provisionalMatches.add(matchId);
                }
            } else {
                // K.O. stages
                let isStageMatchUpdated = false;
                let koKey = "";

                if (roundLower.includes('32') || roundLower.includes('last_32')) {
                    if (!isStageActive('r32_matches')) return;
                    addQualified(results.r32_teams, home);
                    addQualified(results.r32_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r32_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r16_teams, home);
                        if (awayWon) addQualified(results.r16_teams, away);
                    }
                } else if (roundLower.includes('16') || roundLower.includes('last_16')) {
                    if (!isStageActive('r16_matches')) return;
                    addQualified(results.r16_teams, home);
                    addQualified(results.r16_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r16_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r8_teams, home);
                        if (awayWon) addQualified(results.r8_teams, away);
                    }
                } else if (roundLower.includes('quarter')) {
                    if (!isStageActive('r8_matches')) return;
                    addQualified(results.r8_teams, home);
                    addQualified(results.r8_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r8_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r4_teams, home);
                        if (awayWon) addQualified(results.r4_teams, away);
                    }
                } else if (roundLower.includes('semi')) {
                    if (!isStageActive('r4_matches')) return;
                    addQualified(results.r4_teams, home);
                    addQualified(results.r4_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r4_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) {
                            addQualified(results.final_teams, home);
                            addQualified(results.r3_4_teams, away);
                        }
                        if (awayWon) {
                            addQualified(results.final_teams, away);
                            addQualified(results.r3_4_teams, home);
                        }
                    }
                } else if (roundLower.includes('third') || roundLower.includes('bronze') || roundLower.includes('3')) {
                    if (!isStageActive('r3_4_match')) return;
                    addQualified(results.r3_4_teams, home);
                    addQualified(results.r3_4_teams, away);
                    if (isPlayedOrLive) {
                        const matchupStr = results.r3_4_match.matchup;
                        const teams = matchupStr.split('-').map(t => t.trim());
                        if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                            if (results.r3_4_match.score !== scoreStr) {
                                results.r3_4_match.score = scoreStr;
                                isStageMatchUpdated = true;
                                changed = true;
                            }
                            koKey = matchId;
                        }
                        if (isFinished) {
                            if (homeWon) {
                                results.honor_3rd = home;
                                results.honor_4th = away;
                                changed = true;
                            } else if (awayWon) {
                                results.honor_3rd = away;
                                results.honor_4th = home;
                                changed = true;
                            }
                        }
                    }
                } else if (roundLower.includes('final')) {
                    if (!isStageActive('final_match')) return;
                    addQualified(results.final_teams, home);
                    addQualified(results.final_teams, away);
                    if (isPlayedOrLive) {
                        const matchupStr = results.final_match.matchup;
                        const teams = matchupStr.split('-').map(t => t.trim());
                        if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                            if (results.final_match.score !== scoreStr) {
                                results.final_match.score = scoreStr;
                                isStageMatchUpdated = true;
                                changed = true;
                            }
                            koKey = matchId;
                        }
                        if (isFinished) {
                            if (homeWon) {
                                  results.honor_champ = home;
                                  results.honor_runner = away;
                                  changed = true;
                            } else if (awayWon) {
                                  results.honor_champ = away;
                                  results.honor_runner = home;
                                  changed = true;
                            }
                        }
                    }
                }

                if (isStageMatchUpdated) {
                    console.log(`Updated K.O. Match [${item.stage}]: ${home} ${scoreStr} ${away} [Status: ${status}]`);
                    changed = true;
                }

                // Track K.O. match as provisional if currently in progress
                if (koKey && isLive) {
                    provisionalMatches.add(koKey);
                }
            }
        });

        // Fill provisional K.O. matchups so team names are resolved for matching
        fillProvisionalKOMatchups();

        // Set the provisionalMatches list in results object so it matches
        results.provisionalMatches = Array.from(provisionalMatches);

        // Check if anything changed in results JSON or provisional matches to avoid drawing
        const provisionalMatchesChanged = (JSON.stringify(Array.from(provisionalMatches).sort()) !== JSON.stringify(prevProvisionalMatches.sort()));
        if (JSON.stringify(results) !== prevResultsJSON || provisionalMatchesChanged) {
            console.log("Results or provisional matches changed. Redrawing UI and saving to live cache...");
            // Only save provisional (live) scores to cache, not scores already in officialResults
            const liveOnlyCache = buildLiveOnlyCache();
            localStorage.setItem('porra_live_results_cache', JSON.stringify(liveOnlyCache));
            updateAppUI();
            return true;
        } else {
            console.log("No score changes detected. Skipping UI redraw.");
            return false;
        }

    } catch (error) {
        console.error("Error fetching live results from football-data API:", error);
        return false;
    }
}

// Calculate points evolution data for the chart
function getPointsEvolutionData() {
    if (!porraData || !results) return null;

    // 1. Get all matches that have a recorded score in results.matches
    const playedMatches = porraData.matches
        .filter(m => results.matches[m.id] && results.matches[m.id].trim() !== "")
        .sort((a, b) => {
            const dateA = new Date(a.fecha.replace(/-/g, "/"));
            const dateB = new Date(b.fecha.replace(/-/g, "/"));
            return dateA - dateB;
        });

    if (playedMatches.length === 0) return null;

    // 2. Initialize cumulative points array for each player
    const playersEvolution = {};
    porraData.players.forEach(p => {
        playersEvolution[p] = [0.0]; // Starts at 0 points
    });

    // 3. For each played match, calculate cumulative points
    const runningScores = {};
    porraData.players.forEach(p => {
        runningScores[p] = 0.0;
    });

    playedMatches.forEach(m => {
        const matchKey = `${m.casa}-${m.fuera}`;
        const actualScore = results.matches[m.id];

        porraData.players.forEach(p => {
            const pred = porraData.predictions[p].group_stage[matchKey];
            const outcome = calcOutcomePoints(actualScore, pred);
            const netPointsWon = outcome.points / 2.0;

            runningScores[p] += netPointsWon;
            playersEvolution[p].push(Number(runningScores[p].toFixed(1)));
        });
    });

    // 4. Generate labels: "Inicio", "P1", "P2", ...
    const labels = ["Inicio"];
    playedMatches.forEach((m, idx) => {
        labels.push(`P${idx + 1}`);
    });

    return {
        labels: labels,
        playersEvolution: playersEvolution,
        playedMatches: playedMatches
    };
}

// Get player unique color for evolution line chart
function getPlayerColor(name, index) {
    const predefined = {
        "Endika": "hsl(190, 95%, 45%)",
        "Rodri": "hsl(263, 90%, 60%)",
        "Koldo": "hsl(142, 72%, 45%)",
        "Joel": "hsl(38, 92%, 50%)",
        "Álvaro": "hsl(328, 80%, 55%)",
        "Imanol": "hsl(200, 90%, 55%)",
        "André": "hsl(280, 80%, 65%)",
        "Raúl": "hsl(15, 90%, 55%)"
    };
    if (predefined[name]) return predefined[name];
    // Fallback: cycle through HSL colors
    const hue = (index * 45) % 360;
    return `hsl(${hue}, 85%, 55%)`;
}

// Render the Points Evolution Chart using Chart.js
function renderEvolutionChart() {
    const chartData = getPointsEvolutionData();
    const ctx = document.getElementById('points-evolution-chart');
    if (!ctx) return;

    if (!chartData) {
        // Show a message on the canvas if no matches have been played yet
        ctx.style.display = 'none';
        let emptyMsg = document.getElementById('chart-empty-message');
        if (!emptyMsg) {
            emptyMsg = document.createElement('div');
            emptyMsg.id = 'chart-empty-message';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.padding = '3rem';
            emptyMsg.style.color = 'var(--text-muted)';
            emptyMsg.style.fontFamily = 'var(--font-heading)';
            emptyMsg.innerHTML = '<i class="fa-solid fa-chart-line" style="font-size: 2.5rem; margin-bottom: 1rem; display: block; color: var(--border-color)"></i>No hay partidos jugados aún para mostrar la evolución de puntos.';
            ctx.parentNode.appendChild(emptyMsg);
        } else {
            emptyMsg.style.display = 'block';
        }
        return;
    }

    // Hide empty message if it exists
    const emptyMsg = document.getElementById('chart-empty-message');
    if (emptyMsg) emptyMsg.style.display = 'none';
    ctx.style.display = 'block';

    // Destroy old instance if it exists to prevent canvas reuse issues
    if (evolutionChart) {
        evolutionChart.destroy();
    }

    // Build datasets
    const datasets = Object.entries(chartData.playersEvolution).map(([playerName, scores], idx) => {
        const color = getPlayerColor(playerName, idx);
        return {
            label: playerName,
            data: scores,
            borderColor: color,
            backgroundColor: color.replace(')', ', 0.05)').replace('hsl', 'hsla'),
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 6,
            tension: 0.3, // Soft curves
            fill: false
        };
    });

    // Configure Chart.js options
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#94a3b8',
                    font: {
                        family: 'Outfit',
                        weight: '600',
                        size: 11
                    },
                    padding: 12,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#fff',
                titleFont: {
                    family: 'Outfit',
                    weight: 'bold',
                    size: 12
                },
                bodyColor: '#f8fafc',
                bodyFont: {
                    family: 'Inter',
                    size: 12
                },
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                    title: function(context) {
                        const idx = context[0].dataIndex;
                        if (idx === 0) return "Inicio del Torneo";
                        const match = chartData.playedMatches[idx - 1];
                        return `P${idx}: ${match.casa} vs ${match.fuera}`;
                    },
                    label: function(context) {
                        return ` ${context.dataset.label}: ${context.raw.toFixed(1)} pts`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.04)',
                    drawBorder: false
                },
                ticks: {
                    color: '#94a3b8',
                    font: {
                        family: 'Inter',
                        size: 10
                    }
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.04)',
                    drawBorder: false
                },
                ticks: {
                    color: '#94a3b8',
                    font: {
                        family: 'Inter',
                        size: 10
                    }
                },
                title: {
                    display: true,
                    text: 'Puntos Netos',
                    color: '#94a3b8',
                    font: {
                        family: 'Outfit',
                        weight: '600',
                        size: 11
                    }
                }
            }
        }
    };

    evolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: datasets
        },
        options: options
    });
}

// Format date string to Spanish readable format
function formatMatchDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr.replace(/-/g, "/"));
        if (isNaN(d.getTime())) return dateStr;
        
        // E.g., "jue, 11 jun - 21:00"
        const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
        const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        // Capitalize first letter
        return day.charAt(0).toUpperCase() + day.slice(1) + " - " + time;
    } catch (e) {
        return dateStr;
    }
}

// Admin: Merge provisional API results into official results
function approveProvisionalScores() {
    if (!results || !officialResults) return;
    
    if (provisionalMatches.size === 0) {
        alert("No hay resultados provisionales de la API para hacer oficiales.");
        return;
    }
    
    // Copy all provisional matches from results to officialResults
    provisionalMatches.forEach(key => {
        if (!key.includes(':')) {
            // Group stage match
            officialResults.matches[key] = results.matches[key];
        } else {
            const parts = key.split(':');
            const prefix = parts[0];
            const matchKey = parts[1];
            
            if (prefix === 'single') {
                if (officialResults[matchKey]) {
                    officialResults[matchKey].score = results[matchKey].score;
                }
            } else {
                if (officialResults[prefix] && officialResults[prefix][matchKey]) {
                    officialResults[prefix][matchKey].score = results[prefix][matchKey].score;
                }
            }
        }
    });
    
    // Copy qualified teams lists to official results so they are persisted
    const teamLists = ['r32_teams', 'r16_teams', 'r8_teams', 'r4_teams', 'r3_4_teams', 'final_teams'];
    teamLists.forEach(listKey => {
        if (results[listKey] && Array.isArray(results[listKey]) && results[listKey].length > 0) {
            officialResults[listKey] = [...results[listKey]];
        }
    });

    // Clear provisional matches (since they are now official)
    provisionalMatches.clear();
    
    // Save officialResults to localStorage draft (with version stamp)
    officialResults._dataVersion = RESULTS_DATA_VERSION;
    localStorage.setItem('porra_results_draft', JSON.stringify(officialResults));
    
    // Clear the live scores cache since they are now official in the draft
    localStorage.removeItem('porra_live_results_cache');
    
    // Synchronize results to match officialResults
    results = JSON.parse(JSON.stringify(officialResults));
    
    updateAppUI();
    alert("Los resultados de la API se han guardado como oficiales localmente. Ahora puedes descargar el archivo results.json.");
}

// Admin: Download official results as JSON file (includes provisional scores)
function downloadResultsJSON() {
    const resultsToDownload = results || officialResults;
    if (!resultsToDownload) {
        alert("No hay resultados cargados para descargar.");
        return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(resultsToDownload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", "results.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// --- 🔴 AUTOMATIC LIVE UPDATES & POLLING LOGIC ---
let liveRefreshInterval = null;

// Check if any match is currently playing (live window: [fecha - 15 min, fecha + 4 hours] or World Cup period)
function isAnyMatchLive() {
    if (!porraData || !porraData.matches) return false;
    
    // Check if there are any matches currently marked as provisional in results.json
    if (results && results.provisionalMatches && results.provisionalMatches.length > 0) {
        return true;
    }
    
    const now = Date.now();
    const SPAIN_OFFSET = '+02:00'; // Spain time offset (CEST during June/July)
    
    // 1. Range check for World Cup 2026 period (June 10 to July 21, 2026)
    const wcStart = new Date('2026-06-10T00:00:00+02:00').getTime();
    const wcEnd = new Date('2026-07-21T23:59:59+02:00').getTime();
    if (now >= wcStart && now <= wcEnd) {
        return true;
    }
    
    // 2. Fallback check for individual group stage matches active hours
    return porraData.matches.some(m => {
        const dateISO = m.fecha.trim().replace(/\s+/g, 'T').replace(/\//g, '-');
        const matchTime = new Date(dateISO + SPAIN_OFFSET).getTime();
        if (isNaN(matchTime)) return false;
        // 15 minutes before to 4 hours after
        return now >= (matchTime - 15 * 60 * 1000) && now <= (matchTime + 4 * 60 * 60 * 1000);
    });
}

// Function to refresh results from football-data.org API or server results.json
async function refreshResults(forceAPI = false) {
    const refreshBtn = document.getElementById('live-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('spinning');
    
    try {
        if (forceAPI || isAnyMatchLive()) {
            console.log("Refreshing live results from API...");
            await fetchAndProcessLiveResults();
        } else {
            console.log("No live matches active. Refreshing results.json from server...");
            // Add cache buster query parameter to bypass browser caching
            const response = await fetch(`results.json?t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch results.json");
            
            const freshResults = await response.json();
            if (freshResults && freshResults.matches) {
                // Compare the JSON representations to prevent DOM flicker if nothing has changed
                if (JSON.stringify(freshResults) === JSON.stringify(officialResults)) {
                    console.log("results.json is identical on server. Skipping UI redraw.");
                    return;
                }
                
                officialResults = freshResults;
                
                // Clean officialResults template if some keys are missing
                if (!officialResults.matches) officialResults.matches = {};
                if (!officialResults.group_standings) officialResults.group_standings = {};
                if (!officialResults.r32_teams) officialResults.r32_teams = [];
                if (!officialResults.r32_matches) officialResults.r32_matches = {};
                if (!officialResults.r16_teams) officialResults.r16_teams = [];
                if (!officialResults.r16_matches) officialResults.r16_matches = {};
                if (!officialResults.r8_teams) officialResults.r8_teams = [];
                if (!officialResults.r8_matches) officialResults.r8_matches = {};
                if (!officialResults.r4_teams) officialResults.r4_teams = [];
                if (!officialResults.r4_matches) officialResults.r4_matches = {};
                if (!officialResults.r3_4_teams) officialResults.r3_4_teams = [];
                if (!officialResults.final_teams) officialResults.final_teams = [];
                if (!officialResults.r3_4_match) officialResults.r3_4_match = { matchup: '', score: '' };
                if (!officialResults.final_match) officialResults.final_match = { matchup: '', score: '' };
                
                // Clone officialResults into results
                results = JSON.parse(JSON.stringify(officialResults));
                
                // Repopulate provisionalMatches Set
                provisionalMatches.clear();
                if (results.provisionalMatches && Array.isArray(results.provisionalMatches)) {
                    results.provisionalMatches.forEach(id => provisionalMatches.add(String(id)));
                }
                
                // Merge dynamic live scores cache
                mergeLiveCache();
                
                updateAppUI();
                console.log("results.json updated, merged with live cache, and UI redrawn.");
            }
        }
    } catch (e) {
        console.error("Error refreshing results:", e);
    } finally {
        if (refreshBtn) {
            // Give it a tiny delay to ensure the spinning animation is visible
            setTimeout(() => {
                refreshBtn.classList.remove('spinning');
            }, 500);
        }
    }
}

// Setup live refresh interval and UI indicator
function setupLiveRefresh() {
    const liveIndicator = document.getElementById('live-indicator-container');
    const refreshBtn = document.getElementById('live-refresh-btn');
    
    if (isAnyMatchLive()) {
        if (liveIndicator) liveIndicator.style.display = 'inline-flex';
        
        // Setup automatic polling every 45 seconds
        if (!liveRefreshInterval) {
            console.log("Live matches detected. Enabling auto-refresh every 45 seconds.");
            // Refresh once immediately
            refreshResults();
            liveRefreshInterval = setInterval(refreshResults, 45 * 1000);
        }
    } else {
        if (liveIndicator) liveIndicator.style.display = 'none';
        if (liveRefreshInterval) {
            console.log("No live matches. Disabling auto-refresh.");
            clearInterval(liveRefreshInterval);
            liveRefreshInterval = null;
        }
    }
    
    // Bind click event once if button exists and doesn't have it
    if (refreshBtn && !refreshBtn.dataset.listenerBound) {
        refreshBtn.addEventListener('click', () => {
            refreshResults(true); // Force API call on manual click!
        });
        refreshBtn.dataset.listenerBound = 'true';
    }
}

// Calculate the actual group standings and best thirds dynamically based on matches played
function calculateGroupStandings() {
    const teamToGroup = {};
    const groupTeams = {};
    let currentGroup = null;
    
    // Parse matches to determine team-to-group mappings
    porraData.matches.forEach(m => {
        if (m.jor === "J1") {
            if (m.grupo && typeof m.grupo === 'string' && m.grupo.startsWith("Grupo ")) {
                currentGroup = m.grupo.replace("Grupo ", ""); // "A", "B", etc.
            }
            if (currentGroup) {
                if (!groupTeams[currentGroup]) groupTeams[currentGroup] = [];
                if (!groupTeams[currentGroup].includes(m.casa)) groupTeams[currentGroup].push(m.casa);
                if (!groupTeams[currentGroup].includes(m.fuera)) groupTeams[currentGroup].push(m.fuera);
                teamToGroup[m.casa] = currentGroup;
                teamToGroup[m.fuera] = currentGroup;
            }
        }
    });

    // Initialize standings structure for each team
    const teamStats = {};
    Object.keys(teamToGroup).forEach(team => {
        teamStats[team] = {
            name: team,
            group: teamToGroup[team],
            pj: 0,
            g: 0,
            e: 0,
            p: 0,
            gf: 0,
            gc: 0,
            dg: 0,
            pts: 0
        };
    });

    // Process matches and calculate stats, tracking live/provisional groups
    const groupLiveMatches = {};
    Object.keys(groupTeams).forEach(g => {
        groupLiveMatches[g] = false;
    });

    porraData.matches.forEach(m => {
        const score = results.matches[m.id];
        const group = teamToGroup[m.casa];
        if (!group) return;

        if (provisionalMatches && provisionalMatches.has(String(m.id))) {
            groupLiveMatches[group] = true;
        }

        if (score && score.trim() !== "") {
            const parts = score.split("-");
            if (parts.length === 2) {
                const h = parseInt(parts[0]);
                const a = parseInt(parts[1]);
                if (!isNaN(h) && !isNaN(a)) {
                    const statsH = teamStats[m.casa];
                    const statsA = teamStats[m.fuera];
                    
                    statsH.pj++;
                    statsA.pj++;
                    statsH.gf += h;
                    statsH.gc += a;
                    statsA.gf += a;
                    statsA.gc += h;
                    statsH.dg = statsH.gf - statsH.gc;
                    statsA.dg = statsA.gf - statsA.gc;

                    if (h > a) {
                        statsH.pts += 3;
                        statsH.g++;
                        statsA.p++;
                    } else if (h < a) {
                        statsA.pts += 3;
                        statsA.g++;
                        statsH.p++;
                    } else {
                        statsH.pts += 1;
                        statsA.pts += 1;
                        statsH.e++;
                        statsA.e++;
                    }
                }
            }
        }
    });

    // Sort teams within each group (Pts, DG, GF, Name)
    const standingsByGroup = {};
    Object.keys(groupTeams).forEach(g => {
        const teams = groupTeams[g].map(name => teamStats[name]);
        teams.sort((a, b) => {
            // Sort by official group standings if defined in results.group_standings
            let posA = 99;
            let posB = 99;
            for (let i = 1; i <= 4; i++) {
                const officialTeam = results.group_standings[`${i}º GRUPO ${g}`];
                if (officialTeam && officialTeam.toLowerCase() === a.name.toLowerCase()) posA = i;
                if (officialTeam && officialTeam.toLowerCase() === b.name.toLowerCase()) posB = i;
            }
            if (posA !== 99 && posB !== 99) {
                return posA - posB;
            }

            // Fallback to calculated stats
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.dg !== a.dg) return b.dg - a.dg;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return a.name.localeCompare(b.name);
        });
        standingsByGroup[g] = teams;
    });

    // Calculate best thirds
    const thirds = [];
    Object.keys(standingsByGroup).forEach(g => {
        const team = standingsByGroup[g][2]; // 3rd placed team (index 2)
        if (team) {
            thirds.push(team);
        }
    });

    // Sort 3rd placed teams (Pts, DG, GF, Name)
    thirds.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.dg !== a.dg) return b.dg - a.dg;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name);
    });

    return {
        standingsByGroup: standingsByGroup,
        groupLiveMatches: groupLiveMatches,
        thirds: thirds
    };
}

// Get predicted position of a team for a player (e.g. "1º", "2º", etc.)
function getPlayerPredictedPosition(playerName, teamName, groupLetter) {
    if (!playerName || playerName === 'none') return '';
    const playerPreds = porraData.predictions[playerName];
    if (!playerPreds || !playerPreds.group_standings) return '';
    
    let predictedPos = '';
    Object.entries(playerPreds.group_standings).forEach(([key, val]) => {
        if (val && val.toLowerCase() === teamName.toLowerCase() && key.includes(`GRUPO ${groupLetter}`)) {
            predictedPos = key.split(" ")[0]; // "1º", "2º", etc.
        }
    });
    return predictedPos;
}

// Render dynamic group standings tables and best thirds table
function renderGroupTables() {
    const grid = document.getElementById('groups-grid');
    const thirdsBody = document.getElementById('thirds-body');
    const thirdsLiveIndicator = document.getElementById('thirds-live-indicator');
    
    if (!grid || !thirdsBody) return;

    // Calculate positions
    const data = calculateGroupStandings();
    const groupStandings = data.standingsByGroup;
    const groupLiveMatches = data.groupLiveMatches;
    const thirds = data.thirds;

    // Render group cards
    grid.innerHTML = '';
    
    // Check if there are any live matches in any group stage match
    let anyLiveMatch = false;
    Object.values(groupLiveMatches).forEach(val => {
        if (val) anyLiveMatch = true;
    });

    if (thirdsLiveIndicator) {
        thirdsLiveIndicator.style.display = anyLiveMatch ? 'inline-block' : 'none';
    }

    // Iterate through groups A to L
    const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    groupLetters.forEach(letter => {
        const teams = groupStandings[letter] || [];
        const isGroupLive = groupLiveMatches[letter] || false;
        
        const card = document.createElement('div');
        card.classList.add('group-card');
        card.dataset.groupLetter = letter;
        if (isGroupLive) {
            card.classList.add('live-group-highlight');
        }

        const liveLabel = isGroupLive ? 
            `<span class="provisional-match-label" style="font-size: 0.72rem; animation: pulseLabel 2s infinite;"><i class="fa-solid fa-arrows-rotate"></i> Temporal (API)</span>` : 
            '';

        let tableRowsHtml = '';
        teams.forEach((team, index) => {
            const pos = index + 1;
            const flag = getFlagHtml(team.name, false);
            const teamAbbr = getCountryAbbreviation(team.name);

            // Highlighting qualification positions (1st and 2nd qualify for R32)
            let posClass = '';
            if (pos <= 2) {
                posClass = 'style="border-left: 3px solid var(--color-success); padding-left: 0.5rem;"';
            } else if (pos === 3) {
                posClass = 'style="border-left: 3px solid var(--color-accent); padding-left: 0.5rem;"';
            } else {
                posClass = 'style="border-left: 3px solid transparent; padding-left: 0.5rem;"';
            }

            tableRowsHtml += `
                <tr>
                    <td class="text-center" ${posClass}><strong>${pos}º</strong></td>
                    <td style="white-space: nowrap;">
                        ${flag}
                        <span class="full-country-name group-team-name" title="${team.name}">${team.name}</span>
                        <span class="short-country-name" title="${team.name}">${teamAbbr}</span>
                    </td>
                    <td class="text-center bold-score">${team.pts}</td>
                    <td class="text-center" style="color:${team.dg > 0 ? 'var(--color-success)' : (team.dg < 0 ? 'var(--color-danger)' : 'inherit')}">${team.dg > 0 ? '+' : ''}${team.dg}</td>
                    <td class="text-center">${team.pj}</td>
                </tr>
            `;
        });

        // Build predictions drawer for all players (similar to match card)
        let predictionsHtml = '';
        porraData.players.forEach(p => {
            const playerPreds = porraData.predictions[p];
            const pred1 = playerPreds.group_standings[`1º GRUPO ${letter}`] || '';
            const pred2 = playerPreds.group_standings[`2º GRUPO ${letter}`] || '';
            const pred3 = playerPreds.group_standings[`3º GRUPO ${letter}`] || '';
            const pred4 = playerPreds.group_standings[`4º GRUPO ${letter}`] || '';

            const getActualTeam = (posNum) => {
                const official = results.group_standings[`${posNum}º GRUPO ${letter}`];
                if (official && official.trim() !== "") return official;
                return teams[posNum - 1] ? teams[posNum - 1].name : '';
            };

            const actual1 = getActualTeam(1);
            const actual2 = getActualTeam(2);
            const actual3 = getActualTeam(3);
            const actual4 = getActualTeam(4);

            const isCorrect1 = pred1 && actual1 && pred1.toLowerCase() === actual1.toLowerCase();
            const isCorrect2 = pred2 && actual2 && pred2.toLowerCase() === actual2.toLowerCase();
            const isCorrect3 = pred3 && actual3 && pred3.toLowerCase() === actual3.toLowerCase();
            const isCorrect4 = pred4 && actual4 && pred4.toLowerCase() === actual4.toLowerCase();

            let groupPoints = 0.0;
            if (actual1) {
                if (isCorrect1) groupPoints += 1.0;
                if (isCorrect2) groupPoints += 1.0;
                if (isCorrect3) groupPoints += 0.5;
                if (isCorrect4) groupPoints += 0.5;
            }

            const abbr1 = getCountryAbbreviation(pred1);
            const abbr2 = getCountryAbbreviation(pred2);
            const abbr3 = getCountryAbbreviation(pred3);
            const abbr4 = getCountryAbbreviation(pred4);

            const bubbleHtml1 = `<span class="pred-group-team ${isCorrect1 ? 'correct' : ''}" title="1º: ${pred1}">${abbr1}</span>`;
            const bubbleHtml2 = `<span class="pred-group-team ${isCorrect2 ? 'correct' : ''}" title="2º: ${pred2}">${abbr2}</span>`;
            const bubbleHtml3 = `<span class="pred-group-team ${isCorrect3 ? 'correct' : ''}" title="3º: ${pred3}">${abbr3}</span>`;
            const bubbleHtml4 = `<span class="pred-group-team ${isCorrect4 ? 'correct' : ''}" title="4º: ${pred4}">${abbr4}</span>`;

            const ptsColor = groupPoints > 0 ? 'var(--color-success)' : 'var(--text-muted)';
            const pointsDisplay = `<span class="pred-player-pts" style="color: ${ptsColor}; font-size: 0.82rem; font-weight: 700; width: 60px; text-align: right; flex-shrink: 0;">+${groupPoints.toFixed(1)} pts</span>`;

            predictionsHtml += `
                <div class="pred-player-row">
                    <span class="pred-player-name">${p}</span>
                    <div class="pred-player-values" style="width: 250px; justify-content: flex-end; gap: 0.4rem; display: flex; align-items: center; flex-shrink: 0;">
                        ${bubbleHtml1}
                        ${bubbleHtml2}
                        ${bubbleHtml3}
                        ${bubbleHtml4}
                        ${pointsDisplay}
                    </div>
                </div>
            `;
        });

        const predictionsDrawer = `
            <div class="group-predictions-drawer">
                <div style="font-size:0.75rem; color:var(--color-accent); font-weight:700; text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:0.5px;">Pronósticos de Posiciones</div>
                <div class="predictions-list">
                    ${predictionsHtml}
                </div>
            </div>
        `;

        card.innerHTML = `
            <div class="group-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                <h3 style="font-family:var(--font-heading); font-size:1.15rem; font-weight:700; color:#fff; display:flex; align-items:center; gap:0.5rem;">
                    Grupo ${letter}
                    <span class="expand-icon" style="font-size:0.85rem; color:var(--text-muted);"><i class="fa-solid fa-chevron-down"></i></span>
                </h3>
                ${liveLabel}
            </div>
            <div class="table-responsive">
                <table class="table table-compact" style="width:100%;">
                    <thead>
                        <tr>
                            <th class="text-center" style="width:40px;">Pos</th>
                            <th>Equipo</th>
                            <th class="text-center" style="width:35px;">Pts</th>
                            <th class="text-center" style="width:35px;">DG</th>
                            <th class="text-center" style="width:30px;">PJ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
            ${predictionsDrawer}
        `;

        card.addEventListener('click', () => toggleGroupCard(card));
        grid.appendChild(card);
    });

    // Render Best Thirds table
    thirdsBody.innerHTML = '';
    thirds.forEach((team, index) => {
        const pos = index + 1;
        const flag = getFlagHtml(team.name, false);
        const teamAbbr = getCountryAbbreviation(team.name);
        const isLive = groupLiveMatches[team.group] || false;
        
        let rowClass = '';
        let posBadge = '';
        
        if (pos <= 8) {
            // Qualify zone
            rowClass = 'style="background: rgba(16, 185, 129, 0.05);"';
            posBadge = `<span class="badge badge-exact" style="font-size:0.75rem; padding: 0.15rem 0.4rem;">${pos}</span>`;
        } else {
            // Eliminated zone
            rowClass = 'style="background: rgba(239, 68, 68, 0.02); opacity: 0.85;"';
            posBadge = `<span class="badge badge-miss" style="font-size:0.75rem; padding: 0.15rem 0.4rem;">${pos}</span>`;
        }

        const liveAsterisk = isLive ? `<span style="color:#ef4444; font-weight:bold;" title="Grupo con partido en directo">*</span>` : '';

        thirdsBody.innerHTML += `
            <tr ${rowClass}>
                <td class="text-center">${posBadge}</td>
                <td class="text-center"><strong>${team.group}${liveAsterisk}</strong></td>
                <td style="white-space: nowrap;">
                    ${flag}
                    <span class="full-country-name group-team-name" title="${team.name}">${team.name}</span>
                    <span class="short-country-name" title="${team.name}">${teamAbbr}</span>
                </td>
                <td class="text-center bold-score">${team.pts}</td>
                <td class="text-center" style="color:${team.dg > 0 ? 'var(--color-success)' : (team.dg < 0 ? 'var(--color-danger)' : 'inherit')}">${team.dg > 0 ? '+' : ''}${team.dg}</td>
                <td class="text-center">${team.pj}</td>
                <td class="text-center">${team.gf}</td>
                <td class="text-center">${team.gc}</td>
            </tr>
        `;
    });
}

// Toggle group card predictions drawer (and synchronize row heights/expansion)
function toggleGroupCard(card) {
    const isExpanded = card.classList.contains('expanded');
    
    // Find all group cards in the same visual row (within a 15px threshold)
    const targetOffsetTop = card.offsetTop;
    const cardsInRow = [];
    
    document.querySelectorAll('.group-card').forEach(other => {
        if (Math.abs(other.offsetTop - targetOffsetTop) < 15) {
            cardsInRow.push(other);
        }
    });

    if (isExpanded) {
        cardsInRow.forEach(c => c.classList.remove('expanded'));
    } else {
        // Collapse all group cards first
        document.querySelectorAll('.group-card').forEach(c => c.classList.remove('expanded'));
        // Expand row cards
        cardsInRow.forEach(c => c.classList.add('expanded'));
    }
}

