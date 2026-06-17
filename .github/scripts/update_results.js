const fs = require('fs');
const path = require('path');

// Timezone offset for Spain (CEST is UTC+2 during June/July)
const SPAIN_OFFSET = '+02:00';

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

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P"]);

function translateTeam(name) {
    if (!name) return "";
    const clean = name.trim().toLowerCase();
    return TEAM_TRANSLATIONS[clean] || name;
}

async function run() {
    console.log("Starting results update script...");

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
    
    // Clear and initialize provisionalMatches array in results.json
    results.provisionalMatches = [];

    const forceRun = process.argv.includes('--force');
    const now = Date.now();

    // 2. Check if a match is currently active (live window: [fecha - 15 min, fecha + 3 hours])
    let activeMatchFound = false;
    for (const match of porraData.matches) {
        const matchTime = new Date(match.fecha.replace(' ', 'T') + SPAIN_OFFSET).getTime();
        // 15 minutes before kick-off to 3 hours after
        if (now >= (matchTime - 15 * 60 * 1000) && now <= (matchTime + 3 * 60 * 60 * 1000)) {
            activeMatchFound = true;
            console.log(`Active match window found: Match ${match.id} (${match.casa} vs ${match.fuera}) starts at ${match.fecha}`);
            break;
        }
    }

    if (!activeMatchFound && !forceRun) {
        console.log("No active matches scheduled at this time. Skipping external API call to save quota.");
        return;
    }

    // 3. Fetch data from API-Football
    const apiKey = process.env.TOKENAPIMUNDIAL2026;
    if (!apiKey) {
        console.error("TOKENAPIMUNDIAL2026 environment variable is not defined.");
        process.exit(1);
    }

    console.log("Fetching World Cup 2026 matches from API-Football...");
    try {
        const response = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026', {
            headers: {
                'x-apisports-key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const resData = await response.json();
        if (resData.errors && Object.keys(resData.errors).length > 0) {
            console.error("API returned errors:", resData.errors);
            process.exit(1);
        }

        const fixtures = resData.response;
        if (!fixtures || fixtures.length === 0) {
            console.log("No fixtures returned by the API.");
            return;
        }

        console.log(`Retrieved ${fixtures.length} fixtures from the API. Processing...`);

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

        fixtures.forEach(item => {
            const home = translateTeam(item.teams.home.name);
            const away = translateTeam(item.teams.away.name);
            const goalsHome = item.goals.home;
            const goalsAway = item.goals.away;
            const status = item.fixture.status.short;
            const round = item.league.round;
            const matchDate = new Date(item.fixture.date).getTime();

            // We only collect score if match has goals recorded (i.e. is live or finished)
            const isPlayedOrLive = (goalsHome !== null && goalsAway !== null);
            const scoreStr = isPlayedOrLive ? `${goalsHome}-${goalsAway}` : "";

            // Check if the match is in the active update window (within last 4 hours) or has no score in results.json yet
            const isRecent = (now - matchDate) <= 4 * 60 * 60 * 1000;

            if (round.includes('Group Stage')) {
                // Find corresponding match in porraData.matches
                const localMatch = porraData.matches.find(m => 
                    (m.casa === home && m.fuera === away) || (m.casa === away && m.fuera === home)
                );

                if (localMatch) {
                    const matchId = String(localMatch.id);
                    const currentScore = results.matches[matchId] || "";

                    // Overwrite if it's empty, OR if it's active/recent and the score changed
                    if (currentScore === "" || (isRecent && currentScore !== scoreStr && scoreStr !== "")) {
                        results.matches[matchId] = scoreStr;
                        console.log(`Updated Match ${matchId} (${home} ${scoreStr} ${away}) [Status: ${status}]`);
                        updatedCount++;
                    }

                    // Track as provisional if currently in progress
                    if (LIVE_STATUSES.has(status)) {
                        results.provisionalMatches.push(matchId);
                    }
                }
            } else {
                // K.O. stages
                let isStageMatchUpdated = false;
                let koKey = "";

                if (round.includes('Round of 32')) {
                    addQualified(results.r32_teams, home);
                    addQualified(results.r32_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r32_matches, home, away, scoreStr);
                        // Find the match key for provisional tracking
                        for (const [key, matchObj] of Object.entries(results.r32_matches)) {
                            const teams = (matchObj.matchup || "").split('-').map(t => t.trim());
                            if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                                koKey = `r32_matches:${key}`;
                                break;
                            }
                        }
                        // Propagate winner to Round of 16
                        if (item.teams.home.winner) addQualified(results.r16_teams, home);
                        if (item.teams.away.winner) addQualified(results.r16_teams, away);
                    }
                } else if (round.includes('Round of 16')) {
                    addQualified(results.r16_teams, home);
                    addQualified(results.r16_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r16_matches, home, away, scoreStr);
                        for (const [key, matchObj] of Object.entries(results.r16_matches)) {
                            const teams = (matchObj.matchup || "").split('-').map(t => t.trim());
                            if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                                koKey = `r16_matches:${key}`;
                                break;
                            }
                        }
                        // Propagate winner to Quarter-finals
                        if (item.teams.home.winner) addQualified(results.r8_teams, home);
                        if (item.teams.away.winner) addQualified(results.r8_teams, away);
                    }
                } else if (round.includes('Quarter-finals')) {
                    addQualified(results.r8_teams, home);
                    addQualified(results.r8_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r8_matches, home, away, scoreStr);
                        for (const [key, matchObj] of Object.entries(results.r8_matches)) {
                            const teams = (matchObj.matchup || "").split('-').map(t => t.trim());
                            if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                                koKey = `r8_matches:${key}`;
                                break;
                            }
                        }
                        // Propagate winner to Semi-finals
                        if (item.teams.home.winner) addQualified(results.r4_teams, home);
                        if (item.teams.away.winner) addQualified(results.r4_teams, away);
                    }
                } else if (round.includes('Semi-finals')) {
                    addQualified(results.r4_teams, home);
                    addQualified(results.r4_teams, away);
                    if (isPlayedOrLive) {
                        isStageMatchUpdated = updateKOStageMatches(results.r4_matches, home, away, scoreStr);
                        for (const [key, matchObj] of Object.entries(results.r4_matches)) {
                            const teams = (matchObj.matchup || "").split('-').map(t => t.trim());
                            if (teams.length === 2 && ((teams[0] === home && teams[1] === away) || (teams[0] === away && teams[1] === home))) {
                                koKey = `r4_matches:${key}`;
                                break;
                            }
                        }
                        // Propagate winner to Final, loser to 3rd place match
                        if (item.teams.home.winner) {
                            addQualified(results.final_teams, home);
                            addQualified(results.r3_4_teams, away);
                        }
                        if (item.teams.away.winner) {
                            addQualified(results.final_teams, away);
                            addQualified(results.r3_4_teams, home);
                        }
                    }
                } else if (round.includes('Match for 3rd Place')) {
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
                            koKey = "single:r3_4_match";
                        }
                        // Assign 3rd and 4th place
                        const isFinished = (status === 'FT' || status === 'AET' || status === 'PEN');
                        if (isFinished) {
                            if (item.teams.home.winner) {
                                results.honor_3rd = home;
                                results.honor_4th = away;
                            } else if (item.teams.away.winner) {
                                results.honor_3rd = away;
                                results.honor_4th = home;
                            }
                        }
                    }
                } else if (round.includes('Final')) {
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
                            koKey = "single:final_match";
                        }
                        // Assign Champion and Runner-up
                        const isFinished = (status === 'FT' || status === 'AET' || status === 'PEN');
                        if (isFinished) {
                            if (item.teams.home.winner) {
                                  results.honor_champ = home;
                                  results.honor_runner = away;
                            } else if (item.teams.away.winner) {
                                  results.honor_champ = away;
                                  results.honor_runner = home;
                            }
                        }
                    }
                }

                if (isStageMatchUpdated) {
                    console.log(`Updated K.O. Match [${round}]: ${home} ${scoreStr} ${away} [Status: ${status}]`);
                    updatedCount++;
                }

                // Track K.O. match as provisional if currently in progress
                if (koKey && LIVE_STATUSES.has(status)) {
                    results.provisionalMatches.push(koKey);
                }
            }
        });

        // 4. Save results back to results.json (if changes were detected OR if provisional list changed)
        // Since we clear results.provisionalMatches, we always overwrite to keep them accurate
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`Saved results.json with updates. ${updatedCount} match scores changed. ${results.provisionalMatches.length} matches currently live/provisional.`);

    } catch (error) {
        console.error("Error occurred while executing results update:", error);
        process.exit(1);
    }
}

run();
