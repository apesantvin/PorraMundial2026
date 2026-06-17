const fs = require('fs');
const path = require('path');

const TEAM_TRANSLATIONS = {
    'mexico': 'México',
    'south africa': 'Sudáfrica',
    'south korea': 'Corea del Sur',
    'korea republic': 'Corea del Sur',
    'czech republic': 'República Checa',
    'czechia': 'República Checa',
    'canada': 'Canadá',
    'bosnia & herzegovina': 'Bosnia y Herzegovina',
    'bosnia andPipe': 'Bosnia y Herzegovina',
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

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

function translateTeam(name) {
    if (!name) return "";
    const clean = name.trim().toLowerCase();
    return TEAM_TRANSLATIONS[clean] || name;
}

async function run() {
    console.log("Starting live results update script (football-data.org)...");

    // 1. Load configuration and current results files
    const porraDataPath = path.join(process.cwd(), 'porra_data.json');
    const resultsPath = path.join(process.cwd(), 'results.json');

    if (!fs.existsSync(porraDataPath) || !fs.existsSync(resultsPath)) {
        console.error("Missing porra_data.json or results.json in the current working directory.");
        process.exit(1);
    }

    const porraData = JSON.parse(fs.readFileSync(porraDataPath, 'utf8'));
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Ensure K.O. fields are initialized in results
    if (!results.matches) results.matches = {};
    if (!results.r32_teams) results.r32_teams = [];
    if (!results.r32_matches) results.r32_matches = {};
    if (!results.r16_teams) results.r16_teams = [];
    if (!results.r16_matches) results.r16_matches = {};
    if (!results.r8_teams) results.r8_teams = [];
    if (!results.r8_matches) results.r8_matches = {};
    if (!results.r4_teams) results.r4_teams = [];
    if (!results.r4_matches) results.r4_matches = {};
    if (!results.r3_4_teams) results.r3_4_teams = [];
    if (!results.final_teams) results.final_teams = [];
    if (!results.r3_4_match) results.r3_4_match = { matchup: '', score: '' };
    if (!results.final_match) results.final_match = { matchup: '', score: '' };
    
    // Maintain a list of previous provisional matches before clearing
    const prevProvisionalMatches = Array.isArray(results.provisionalMatches) ? [...results.provisionalMatches] : [];
    results.provisionalMatches = [];

    const now = Date.now();

    // 2. Fetch data from football-data.org
    const apiKey = process.env.TOKENAPIMUNDIAL2026;
    if (!apiKey) {
        console.error("TOKENAPIMUNDIAL2026 environment variable is not defined.");
        process.exit(1);
    }

    console.log("Fetching World Cup matches from football-data.org...");
    try {
        const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
            headers: {
                'X-Auth-Token': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const resData = await response.json();
        const matches = resData.matches;
        if (!matches || matches.length === 0) {
            console.log("No matches returned by the API.");
            return;
        }

        console.log(`Retrieved ${matches.length} matches from the API. Processing...`);

        let updatedCount = 0;

        // Helper to add qualified teams if missing
        function addQualified(arr, team) {
            if (team && !arr.includes(team)) {
                arr.push(team);
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

            // Determine local match ID or key in results.json
            let matchId = "";
            let currentScore = "";

            if (roundLower.includes('group')) {
                const localMatch = porraData.matches.find(m => 
                    (m.casa === home && m.fuera === away) || (m.casa === away && m.fuera === home)
                );
                if (localMatch) {
                    matchId = String(localMatch.id);
                    currentScore = results.matches[matchId] || "";
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
                                currentScore = matchObj.score || "";
                                break;
                            }
                        }
                    }
                }
            }

            if (!matchId) return; // Skip if we can't map this match

            const wasProvisional = prevProvisionalMatches.includes(matchId);

            // We update the score if:
            // 1. We don't have a score loaded yet (currentScore is empty)
            // 2. OR the match is currently live
            // 3. OR the match was marked as provisional (so we need to capture the final score if it transitioned to finished)
            // 4. OR the match finished recently (to allow corrections)
            const shouldProcess = (currentScore.trim() === "") || isLive || wasProvisional || isRecentFinished;

            if (!shouldProcess) {
                return;
            }

            const homeWon = item.score && item.score.winner === 'HOME_TEAM';
            const awayWon = item.score && item.score.winner === 'AWAY_TEAM';

            if (roundLower.includes('group')) {
                if (currentScore !== scoreStr && scoreStr !== "") {
                    results.matches[matchId] = scoreStr;
                    console.log(`Updated Match ${matchId} (${home} ${scoreStr} ${away}) [Status: ${status}]`);
                    updatedCount++;
                }

                // Track as provisional if currently in progress
                if (isLive) {
                    results.provisionalMatches.push(matchId);
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
                        // Propagate winner
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
                            }
                            koKey = matchId;
                        }
                        // Assign 3rd and 4th place
                        if (isFinished) {
                            if (homeWon) {
                                results.honor_3rd = home;
                                results.honor_4th = away;
                            } else if (awayWon) {
                                results.honor_3rd = away;
                                results.honor_4th = home;
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
                            }
                            koKey = matchId;
                        }
                        // Assign Champion and Runner-up
                        if (isFinished) {
                            if (homeWon) {
                                  results.honor_champ = home;
                                  results.honor_runner = away;
                            } else if (awayWon) {
                                  results.honor_champ = away;
                                  results.honor_runner = home;
                            }
                        }
                    }
                }

                if (isStageMatchUpdated) {
                    console.log(`Updated K.O. Match [${item.stage}]: ${home} ${scoreStr} ${away} [Status: ${status}]`);
                    updatedCount++;
                }

                // Track K.O. match as provisional if currently in progress
                if (koKey && isLive) {
                    results.provisionalMatches.push(koKey);
                }
            }
        });

        // 4. Save results back to results.json
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`Saved results.json with updates. ${updatedCount} match scores changed. ${results.provisionalMatches.length} matches currently live/provisional.`);

    } catch (error) {
        console.error("Error occurred while executing results update:", error);
        process.exit(1);
    }
}

run();
