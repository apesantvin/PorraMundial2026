// State variables
let porraData = null;
let results = null;
let officialResults = null;
const provisionalMatches = new Set(); // Track matches loaded dynamically from the API
let activeTab = 'clasificacion';
let currentFilter = 'all';
let evolutionChart = null;

// Initial load
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    setupEventListeners();
});

// Initialize application data
async function initApp() {
    try {
        // Load static porra configuration
        const dataResponse = await fetch('porra_data.json');
        porraData = await dataResponse.json();
        
        // Load officialResults draft from localStorage if it exists, otherwise fetch results.json
        const draft = localStorage.getItem('porra_results_draft');
        if (draft) {
            try {
                officialResults = JSON.parse(draft);
                console.log("Loaded official results from localStorage draft");
            } catch (e) {
                console.error("Error parsing localStorage draft", e);
            }
        }
        
        if (!officialResults) {
            const resResponse = await fetch('results.json');
            officialResults = await resResponse.json();
            console.log("Loaded official results from results.json");
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
}

// Calculate the detailed points and ranking for all players
function calculateStandings() {
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
            breakdown: [] // match by match details
        };
    });

    // 1. Group Stage matches points (divisor 2)
    let rawGroupStagePoints = {};
    porraData.players.forEach(p => rawGroupStagePoints[p] = 0.0);

    porraData.matches.forEach(m => {
        const matchKey = `${m.casa}-${m.fuera}`;
        const actualScore = results.matches[m.id];
        
        if (actualScore && actualScore.trim() !== "") {
            porraData.players.forEach(p => {
                const pred = porraData.predictions[p].group_stage[matchKey];
                const outcome = calcOutcomePoints(actualScore, pred);
                
                rawGroupStagePoints[p] += outcome.points;
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
                    outcomeClass: outcome.class
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
        playersPoints[p].group_stage = rawGroupStagePoints[p] / 2.0;
    });

    // 2. Group Standings Positions points (divisor 2)
    porraData.players.forEach(p => {
        let rawPoints = 0.0;
        const preds = porraData.predictions[p].group_standings || {};
        
        Object.entries(preds).forEach(([item, teamPred]) => {
            const actual = results.group_standings[item];
            if (actual && actual.trim() !== "") {
                const isCorrect = String(actual).toLowerCase() === String(teamPred).toLowerCase();
                if (isCorrect) {
                    // 1º and 2º give 2 pts, 3º and 4º give 1 pt
                    const rulePoint = (item.startsWith("1º") || item.startsWith("2º")) ? 2.0 : 1.0;
                    rawPoints += rulePoint;
                }
            }
        });
        playersPoints[p].group_standings = rawPoints / 2.0;
    });

    // 3. K.O. Stages points (divisor 2)
    porraData.players.forEach(p => {
        let rawKOPoints = 0.0;
        const playerPreds = porraData.predictions[p];

        // -- Round of 32 Teams --
        const r32_teams_pred = playerPreds.r32_teams || {};
        const r32_actual = results.r32_teams || [];
        Object.values(r32_teams_pred).forEach(team => {
            if (r32_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.r32_qualified || 1.0);
            }
        });

        // -- Round of 32 Matches --
        const r32_matches_pred = playerPreds.r32_matches || {};
        const r32_actual_matches = results.r32_matches || {};
        Object.entries(r32_matches_pred).forEach(([matchKey, predVal]) => {
            if (predVal && predVal.includes('·')) {
                const parts = predVal.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                
                const actual = r32_actual_matches[matchKey];
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    // Matchup occurred! Evaluate score
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    rawKOPoints += outcome.points;
                }
            }
        });

        // -- Round of 16 Teams --
        const r16_teams_pred = playerPreds.r16_teams || {};
        const r16_actual = results.r16_teams || [];
        Object.values(r16_teams_pred).forEach(team => {
            if (r16_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.r16_qualified || 1.0);
            }
        });

        // -- Round of 16 Matches --
        const r16_matches_pred = playerPreds.r16_matches || {};
        const r16_actual_matches = results.r16_matches || {};
        Object.entries(r16_matches_pred).forEach(([matchKey, predVal]) => {
            if (predVal && predVal.includes('·')) {
                const parts = predVal.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                
                const actual = r16_actual_matches[matchKey];
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    rawKOPoints += outcome.points;
                }
            }
        });

        // -- Quarterfinals Teams --
        const r8_teams_pred = playerPreds.r8_teams || {};
        const r8_actual = results.r8_teams || [];
        Object.values(r8_teams_pred).forEach(team => {
            if (r8_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.r8_qualified || 1.0);
            }
        });

        // -- Quarterfinals Matches --
        const r8_matches_pred = playerPreds.r8_matches || {};
        const r8_actual_matches = results.r8_matches || {};
        Object.entries(r8_matches_pred).forEach(([matchKey, predVal]) => {
            if (predVal && predVal.includes('·')) {
                const parts = predVal.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                
                const actual = r8_actual_matches[matchKey];
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    rawKOPoints += outcome.points;
                }
            }
        });

        // -- Semifinals Teams --
        const r4_teams_pred = playerPreds.r4_teams || {};
        const r4_actual = results.r4_teams || [];
        Object.values(r4_teams_pred).forEach(team => {
            if (r4_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.r4_qualified || 1.0);
            }
        });

        // -- Semifinals Matches --
        const r4_matches_pred = playerPreds.r4_matches || {};
        const r4_actual_matches = results.r4_matches || {};
        Object.entries(r4_matches_pred).forEach(([matchKey, predVal]) => {
            if (predVal && predVal.includes('·')) {
                const parts = predVal.split('·');
                const predMatchup = parts[0];
                const predScore = parts[1];
                
                const actual = r4_actual_matches[matchKey];
                if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                    const outcome = calcOutcomePoints(actual.score, predScore);
                    rawKOPoints += outcome.points;
                }
            }
        });

        // -- 3rd/4th Teams --
        const r3_4_teams_pred = playerPreds.r3_4_teams || {};
        const r3_4_actual = results.r3_4_teams || [];
        Object.values(r3_4_teams_pred).forEach(team => {
            if (r3_4_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.r3_4_qualified || 1.0);
            }
        });

        // -- Finalists Teams --
        const final_teams_pred = playerPreds.final_teams || {};
        const final_actual = results.final_teams || [];
        Object.values(final_teams_pred).forEach(team => {
            if (final_actual.includes(team)) {
                rawKOPoints += Number(porraData.rules.final_qualified || 2.0);
            }
        });

        // -- 3rd/4th Match --
        const r3_4_match_pred = playerPreds.r3_4_match;
        if (r3_4_match_pred && r3_4_match_pred.includes('·')) {
            const parts = r3_4_match_pred.split('·');
            const predMatchup = parts[0];
            const predScore = parts[1];
            const actual = results.r3_4_match;
            if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                const outcome = calcOutcomePoints(actual.score, predScore);
                rawKOPoints += outcome.points;
            }
        }

        // -- Final Match --
        const final_match_pred = playerPreds.final_match;
        if (final_match_pred && final_match_pred.includes('·')) {
            const parts = final_match_pred.split('·');
            const predMatchup = parts[0];
            const predScore = parts[1];
            const actual = results.final_match;
            if (actual && actual.matchup === predMatchup && actual.score && actual.score.trim() !== "") {
                const outcome = calcOutcomePoints(actual.score, predScore);
                rawKOPoints += outcome.points;
            }
        }

        playersPoints[p].ko_stages = rawKOPoints / 2.0;
    });

    // 4. Honor List points (divisor 2)
    porraData.players.forEach(p => {
        let rawHonorPoints = 0.0;
        const preds = porraData.predictions[p].honor_list || {};

        const mappings = {
            'Campeón': { key: 'honor_champ', ruleKey: 'honor_champ' },
            'Subcampeón': { key: 'honor_runner', ruleKey: 'honor_runner' },
            'Tercero': { key: 'honor_3rd', ruleKey: 'honor_3rd' },
            'Cuarto': { key: 'honor_4th', ruleKey: 'honor_4th' },
            'Goleador': { key: 'honor_scorer', ruleKey: 'honor_scorer' },
            'Asistente': { key: 'honor_assists', ruleKey: 'honor_assists' },
            'M.V.P.': { key: 'honor_mvp', ruleKey: 'honor_mvp' },
            'Portero': { key: 'honor_gk', ruleKey: 'honor_gk' },
            'Joven': { key: 'honor_young', ruleKey: 'honor_young' }
        };

        Object.entries(preds).forEach(([item, teamPred]) => {
            // Check if item contains one of the mapping labels
            let matchedMapping = null;
            for (const [label, mapObj] of Object.entries(mappings)) {
                if (item.toLowerCase().includes(label.toLowerCase())) {
                    matchedMapping = mapObj;
                    break;
                }
            }

            if (matchedMapping) {
                const actual = results[matchedMapping.key];
                if (actual && actual.trim() !== "") {
                    const isCorrect = String(actual).toLowerCase() === String(teamPred).toLowerCase();
                    if (isCorrect) {
                        const rulePoints = Number(porraData.rules[matchedMapping.ruleKey] || 1.0);
                        rawHonorPoints += rulePoints;
                    }
                }
            }
        });

        playersPoints[p].honor_list = rawHonorPoints / 2.0;
    });

    // Calculate Grand Total for each player
    porraData.players.forEach(p => {
        playersPoints[p].total = playersPoints[p].group_stage + 
                                  playersPoints[p].group_standings + 
                                  playersPoints[p].ko_stages + 
                                  playersPoints[p].honor_list;
    });

    // Return as array sorted by rank
    return Object.values(playersPoints).sort((a, b) => {
        if (b.total !== a.total) {
            return b.total - a.total; // highest points first
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
    const actualScoreParts = actualScoreStr.split('-');
    
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

        tr.innerHTML = `
            <td class="text-center ${rankClass}">${rankVal}</td>
            <td class="player-row-name">${player.name}</td>
            <td class="text-center bold-score">${player.total.toFixed(1)}</td>
            <td class="text-center hide-on-mobile">${player.group_stage.toFixed(1)}</td>
            <td class="text-center hide-on-mobile">${player.group_standings.toFixed(1)}</td>
            <td class="text-center hide-on-mobile">${player.ko_stages.toFixed(1)}</td>
            <td class="text-center hide-on-mobile">${player.honor_list.toFixed(1)}</td>
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
            
            const badgeHtml = isPlayed ? 
                `<span class="prediction-badge ${badgeClass}">${badgeText}</span>` : 
                `<span class="prediction-badge badge-miss" style="background:rgba(255,255,255,0.03); color:var(--text-muted); border:1px solid rgba(255,255,255,0.08);">Pendiente</span>`;
            
            const ptsColor = (badgeClass === 'badge-exact' || badgeClass === 'badge-diff' || badgeClass === 'badge-sign') ? 'var(--color-success)' : 'var(--text-muted)';
            const pointsDisplay = isPlayed ? `<span class="pred-player-pts" style="font-weight: 700; min-width: 52px; text-align: right; color: ${ptsColor}; font-size: 0.82rem;">${pointsText}</span>` : '';
            
            predictionsHtml += `
                <div class="pred-player-row">
                    <span class="pred-player-name">${p}</span>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
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
function scrollToNextMatch() {
    const nextMatchEl = document.querySelector('.match-card.next-match-highlight');
    if (nextMatchEl) {
        nextMatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    // Filters for matches
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
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
                location.reload();
            }
        });
    }
}

// Modal management
function openPlayerModal(playerName) {
    const player = calculateStandings().find(p => p.name === playerName);
    if (!player) return;

    document.getElementById('modal-player-name').innerText = `Desglose - ${player.name}`;
    document.getElementById('modal-total-score').innerText = `${player.total.toFixed(1)} pts`;
    document.getElementById('modal-fase-score').innerText = `F. Grupos: ${player.group_stage.toFixed(1)} | Posiciones: ${player.group_standings.toFixed(1)} | Eliminatorias: ${(player.ko_stages + player.honor_list).toFixed(1)}`;

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
            scoreBadge = `<span class="prediction-badge badge-miss">Pendiente</span>`;
        } else {
            let badgeText = "Fallo (0)";
            let badgeClass = "badge-miss";
            if (item.outcomeClass === 'exact') {
                badgeText = "Exacto (2.0)";
                badgeClass = "badge-exact";
            } else if (item.outcomeClass === 'diff') {
                badgeText = "Dif. Goles (1.0)";
                badgeClass = "badge-diff";
            } else if (item.outcomeClass === 'sign') {
                badgeText = "Signo 1X2 (0.5)";
                badgeClass = "badge-sign";
            }
            scoreBadge = `<span class="prediction-badge ${badgeClass}">${badgeText}</span>`;
        }

        const flagHome = getFlagHtml(item.casa, false);
        const flagAway = getFlagHtml(item.fuera, false);

        tr.innerHTML = `
            <td><small class="text-muted">${item.jor}</small> ${flagHome} ${item.casa} - ${item.fuera} ${flagAway}</td>
            <td class="text-center">${item.pred}</td>
            <td class="text-center"><strong>${item.actual}</strong></td>
            <td class="text-center text-muted">${item.points.toFixed(0)}</td>
            <td class="text-center">${scoreBadge}</td>
        `;
        groupsBody.appendChild(tr);
    });

    // Render K.O. stages and Specials predictions
    const koList = document.getElementById('modal-ko-list');
    koList.innerHTML = '';
    
    // Add sections for Special predictions
    const playerPreds = porraData.predictions[player.name];

    // Standings Predictions
    const standingsCard = createKOCard("Predicciones de Grupos (1º al 4º)");
    Object.entries(playerPreds.group_standings || {}).forEach(([item, teamPred]) => {
        const actual = results.group_standings[item] || '';
        const isCorrect = actual && actual.toLowerCase() === teamPred.toLowerCase();
        const pts = isCorrect ? (item.startsWith("1º") || item.startsWith("2º") ? 1.0 : 0.5) : 0.0;
        
        addKOItem(standingsCard, item, teamPred, actual, pts);
    });
    koList.appendChild(standingsCard);

    // Advancing teams lists
    const r32Card = createKOCard("Equipos clasificados a Dieciseisavos (1/16)");
    Object.entries(playerPreds.r32_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r32_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 0.5 : 0.0;
        addKOItem(r32Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(r32Card);

    const r16Card = createKOCard("Equipos clasificados a Octavos (1/8)");
    Object.entries(playerPreds.r16_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r16_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 0.5 : 0.0;
        addKOItem(r16Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(r16Card);

    const r8Card = createKOCard("Equipos clasificados a Cuartos (1/4)");
    Object.entries(playerPreds.r8_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r8_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 0.5 : 0.0;
        addKOItem(r8Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(r8Card);

    const r4Card = createKOCard("Equipos clasificados a Semifinales (1/2)");
    Object.entries(playerPreds.r4_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r4_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 0.5 : 0.0;
        addKOItem(r4Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(r4Card);

    const finalCard = createKOCard("Equipos Finalistas");
    Object.entries(playerPreds.final_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.final_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 1.0 : 0.0;
        addKOItem(finalCard, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(finalCard);

    const r3_4Card = createKOCard("Equipos en 3er/4to puesto");
    Object.entries(playerPreds.r3_4_teams || {}).forEach(([key, teamPred]) => {
        const qualified = results.r3_4_teams || [];
        const isCorrect = qualified.includes(teamPred);
        const pts = isCorrect ? 0.5 : 0.0;
        addKOItem(r3_4Card, key, teamPred, isCorrect ? "Clasificado" : (qualified.length > 0 ? "Eliminado" : "-"), pts);
    });
    koList.appendChild(r3_4Card);

    // K.O. Bracket Matchups and Scores
    const bracketsCard = createKOCard("Enfrentamientos directos (K.O.)");
    
    // Dieciseisavos
    Object.entries(playerPreds.r32_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(bracketsCard, "Dieciseisavos", key, predVal, results.r32_matches);
    });
    // Octavos
    Object.entries(playerPreds.r16_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(bracketsCard, "Octavos", key, predVal, results.r16_matches);
    });
    // Cuartos
    Object.entries(playerPreds.r8_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(bracketsCard, "Cuartos", key, predVal, results.r8_matches);
    });
    // Semifinales
    Object.entries(playerPreds.r4_matches || {}).forEach(([key, predVal]) => {
        evaluateKOBracketMatch(bracketsCard, "Semifinales", key, predVal, results.r4_matches);
    });

    // Partido 3º y 4º puesto
    if (playerPreds.r3_4_match) {
        evaluateSingleKOMatch(bracketsCard, "Tercer y Cuarto Puesto", playerPreds.r3_4_match, results.r3_4_match);
    }
    // Final
    if (playerPreds.final_match) {
        evaluateSingleKOMatch(bracketsCard, "Gran Final", playerPreds.final_match, results.final_match);
    }

    koList.appendChild(bracketsCard);

    // Cuadro de honor
    const honorCard = createKOCard("Cuadro de Honor y Premios Especiales");
    const mappings = {
        'Campeón': { key: 'honor_champ', label: 'Campeón Mundial', pts: 5.0 },
        'Subcampeón': { key: 'honor_runner', label: 'Subcampeón', pts: 3.0 },
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
        for (const [label, mapObj] of Object.entries(mappings)) {
            if (item.toLowerCase().includes(label.toLowerCase())) {
                matched = mapObj;
                break;
            }
        }
        if (matched) {
            const actual = results[matched.key] || '';
            const isCorrect = actual && actual.toLowerCase() === teamPred.toLowerCase();
            const pts = isCorrect ? matched.pts : 0.0;
            addKOItem(honorCard, matched.label, teamPred, actual, pts);
        }
    });
    koList.appendChild(honorCard);

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
    div.style.marginBottom = '0.5rem';
    
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

    const container = card.querySelector('.ko-items-container');
    const div = document.createElement('div');
    div.classList.add('ko-pred-item');
    div.style.marginBottom = '0.5rem';
    
    let ptsLabel = '';
    if (pts > 0) {
        ptsLabel = `<span class="ko-points-won" style="color:var(--color-success)">+${pts.toFixed(1)} pts</span>`;
    } else {
        ptsLabel = `<span class="ko-points-won" style="color:var(--text-muted)">0.0 pts</span>`;
    }

    div.innerHTML = `
        <div class="ko-pred-label">
            <strong>${stageLabel} - ${matchKey}</strong><br>
            <span style="font-size:0.8rem; color:#fff">Predicción: ${getMatchupFlagsHtml(predMatchup)} (${predScore})</span>
        </div>
        <div class="ko-pred-val">
            <span style="font-size:0.8rem; color:var(--text-muted)">Real: ${actualMatchup ? getMatchupFlagsHtml(actualMatchup) : 'Pendiente'} ${actualScore ? '('+actualScore+')' : ''}</span>
            ${ptsLabel}
        </div>
    `;
    container.appendChild(div);
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

    const container = card.querySelector('.ko-items-container');
    const div = document.createElement('div');
    div.classList.add('ko-pred-item');
    div.style.marginBottom = '0.5rem';
    
    let ptsLabel = '';
    if (pts > 0) {
        ptsLabel = `<span class="ko-points-won" style="color:var(--color-success)">+${pts.toFixed(1)} pts</span>`;
    } else {
        ptsLabel = `<span class="ko-points-won" style="color:var(--text-muted)">0.0 pts</span>`;
    }

    div.innerHTML = `
        <div class="ko-pred-label">
            <strong>${label}</strong><br>
            <span style="font-size:0.8rem; color:#fff">Predicción: ${getMatchupFlagsHtml(predMatchup)} (${predScore})</span>
        </div>
        <div class="ko-pred-val">
            <span style="font-size:0.8rem; color:var(--text-muted)">Real: ${actualMatchup ? getMatchupFlagsHtml(actualMatchup) : 'Pendiente'} ${actualScore ? '('+actualScore+')' : ''}</span>
            ${ptsLabel}
        </div>
    `;
    container.appendChild(div);
}

function closePlayerModal() {
    document.getElementById('player-modal').classList.remove('open');
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
    if (!code) return "";

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

// Fetch live World Cup match results dynamically from football-data.org API via CORS proxy
const TEAM_TRANSLATIONS = {
    'mexico': 'México',
    'south africa': 'Sudáfrica',
    'south korea': 'Corea del Sur',
    'korea republic': 'Corea del Sur',
    'czech republic': 'República Checa',
    'czechia': 'República Checa',
    'canada': 'Canadá',
    'bosnia & herzegovina': 'Bosnia y Herzegovina',
    'bosnia and herzegovina': 'Bosnia y Herzegovina',
    'qatar': 'Catar',
    'switzerland': 'Suiza',
    'brazil': 'Brasil',
    'morocco': 'Marruecos',
    'haiti': 'Haití',
    'scotland': 'Escocia',
    'united states': 'Estados Unidos',
    'usa': 'Estados Unidos',
    'paraguay': 'Paraguay',
    'australia': 'Australia',
    'turkiye': 'Turquía',
    'turkey': 'Turquía',
    'germany': 'Alemania',
    'curacao': 'Curazao',
    'curaçao': 'Curazao',
    'cote d\'ivoire': 'Costa de Marfil',
    'ivory coast': 'Costa de Marfil',
    'ecuador': 'Ecuador',
    'netherlands': 'Países Bajos',
    'japan': 'Japón',
    'sweden': 'Suecia',
    'tunisia': 'Túnez',
    'belgium': 'Bélgica',
    'egypt': 'Egipto',
    'ir iran': 'Irán',
    'iran': 'Irán',
    'new zealand': 'Nueva Zelanda',
    'spain': 'España',
    'cabo verde': 'Cabo Verde',
    'cape verde': 'Cabo Verde',
    'saudi arabia': 'Arabia Saudita',
    'uruguay': 'Uruguay',
    'france': 'Francia',
    'senegal': 'Senegal',
    'iraq': 'Irak',
    'norway': 'Noruega',
    'argentina': 'Argentina',
    'algeria': 'Argelia',
    'austria': 'Austria',
    'jordan': 'Jordania',
    'portugal': 'Portugal',
    'congo dr': 'RD Congo',
    'dr congo': 'RD Congo',
    'uzbekistan': 'Uzbekistán',
    'colombia': 'Colombia',
    'england': 'Inglaterra',
    'croatia': 'Croacia',
    'ghana': 'Ghana',
    'panama': 'Panamá'
};

function translateTeam(name) {
    if (!name) return "";
    const clean = name.trim().toLowerCase();
    return TEAM_TRANSLATIONS[clean] || name;
}

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

async function fetchAndProcessLiveResults() {
    const apiKey = 'fca19012e1774fee9c2d4382feb0325b';
    const targetUrl = 'https://api.football-data.org/v4/competitions/WC/matches';
    const reqHeadersStr = `X-Auth-Token:${apiKey}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}&reqHeaders=${encodeURIComponent(reqHeadersStr)}`;

    console.log("Fetching live results from football-data.org via corsproxy.io...");
    try {
        const response = await fetch(proxyUrl);
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
            const home = translateTeam(item.homeTeam.shortName || item.homeTeam.name);
            const away = translateTeam(item.awayTeam.shortName || item.awayTeam.name);
            
            const goalsHome = item.score && item.score.fullTime ? item.score.fullTime.home : null;
            const goalsAway = item.score && item.score.fullTime ? item.score.fullTime.away : null;
            
            const status = item.status;
            const roundLower = (item.stage || "").toLowerCase();
            const matchDate = new Date(item.utcDate).getTime();

            const isLive = LIVE_STATUSES.has(status);
            const isFinished = (status === 'FINISHED');
            const isPlayedOrLive = (goalsHome !== null && goalsAway !== null);
            const scoreStr = isPlayedOrLive ? `${goalsHome}-${goalsAway}` : "";

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
            const shouldProcess = (currentScore.trim() === "") || isLive || wasProvisional || isRecentFinished;

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
                    addQualified(results.r32_teams, home);
                    addQualified(results.r32_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r32_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r16_teams, home);
                        if (awayWon) addQualified(results.r16_teams, away);
                    }
                } else if (roundLower.includes('16') || roundLower.includes('last_16')) {
                    addQualified(results.r16_teams, home);
                    addQualified(results.r16_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r16_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r8_teams, home);
                        if (awayWon) addQualified(results.r8_teams, away);
                    }
                } else if (roundLower.includes('quarter')) {
                    addQualified(results.r8_teams, home);
                    addQualified(results.r8_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r8_matches, home, away, scoreStr);
                        koKey = matchId;
                        if (homeWon) addQualified(results.r4_teams, home);
                        if (awayWon) addQualified(results.r4_teams, away);
                    }
                } else if (roundLower.includes('semi')) {
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
                }

                // Track K.O. match as provisional if currently in progress
                if (koKey && isLive) {
                    provisionalMatches.add(koKey);
                }
            }
        });

        // Set the provisionalMatches list in results object so it matches
        results.provisionalMatches = Array.from(provisionalMatches);

        // Check if anything changed in results JSON to avoid drawing
        if (JSON.stringify(results) !== prevResultsJSON) {
            console.log("Results changed. Redrawing UI...");
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
        "ALVARO": "hsl(328, 80%, 55%)",
        "Imanol": "hsl(200, 90%, 55%)",
        "André": "hsl(280, 80%, 65%)",
        "Raul": "hsl(15, 90%, 55%)"
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
    
    // Clear provisional matches (since they are now official)
    provisionalMatches.clear();
    
    // Save officialResults to localStorage draft
    localStorage.setItem('porra_results_draft', JSON.stringify(officialResults));
    
    // Synchronize results to match officialResults
    results = JSON.parse(JSON.stringify(officialResults));
    
    updateAppUI();
    alert("Los resultados de la API se han guardado como oficiales localmente. Ahora puedes descargar el archivo results.json.");
}

// Admin: Download official results as JSON file
function downloadResultsJSON() {
    if (!officialResults) {
        alert("No hay resultados cargados para descargar.");
        return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(officialResults, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", "results.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// --- 🔴 AUTOMATIC LIVE UPDATES & POLLING LOGIC ---
let liveRefreshInterval = null;

// Check if any match is currently playing (live window: [fecha - 15 min, fecha + 4 hours])
function isAnyMatchLive() {
    if (!porraData || !porraData.matches) return false;
    
    // Check if there are any matches currently marked as provisional in results.json
    if (results && results.provisionalMatches && results.provisionalMatches.length > 0) {
        return true;
    }
    
    const now = Date.now();
    const SPAIN_OFFSET = '+02:00'; // Spain time offset (CEST during June/July)
    
    return porraData.matches.some(m => {
        const dateISO = m.fecha.trim().replace(/\s+/g, 'T').replace(/\//g, '-');
        const matchTime = new Date(dateISO + SPAIN_OFFSET).getTime();
        if (isNaN(matchTime)) return false;
        // 15 minutes before to 4 hours after
        return now >= (matchTime - 15 * 60 * 1000) && now <= (matchTime + 4 * 60 * 60 * 1000);
    });
}

// Function to refresh results from football-data.org API or server results.json
async function refreshResults() {
    const refreshBtn = document.getElementById('live-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('spinning');
    
    try {
        if (isAnyMatchLive()) {
            console.log("Live matches active. Refreshing live results from API...");
            await fetchAndProcessLiveResults();
        } else {
            console.log("No live matches active. Refreshing results.json from server...");
            // Add cache buster query parameter to bypass browser caching
            const response = await fetch(`results.json?t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch results.json");
            
            const freshResults = await response.json();
            if (freshResults && freshResults.matches) {
                // Compare the JSON representations to prevent DOM flicker if nothing has changed
                if (JSON.stringify(freshResults) === JSON.stringify(results)) {
                    console.log("results.json is identical. Skipping UI redraw.");
                    return;
                }
                
                results = freshResults;
                
                // Repopulate provisionalMatches Set
                provisionalMatches.clear();
                if (results.provisionalMatches && Array.isArray(results.provisionalMatches)) {
                    results.provisionalMatches.forEach(id => provisionalMatches.add(String(id)));
                }
                
                updateAppUI();
                console.log("results.json updated and UI redrawn.");
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
            refreshResults();
        });
        refreshBtn.dataset.listenerBound = 'true';
    }
}

