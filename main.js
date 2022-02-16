var api = require('unofficial-valorant-api')
const readline = require('readline');



function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(">" + query, ans => {
        rl.close();
        resolve(ans);
    }))
}


async function getId(myName, myTag, theirName, theirTag) {
    let myId = await api.getAccount(myName, myTag)
    let findId = await api.getAccount(theirName, theirTag)
    return [myId.data.puuid, findId.data.puuid]
}


async function main() {
    const myName = await askQuestion("First Player's Name: ");
    const myTag = await askQuestion("First Player's Tag: ");
    const theirName = await askQuestion("Second Player's Name: ");
    const theirTag = await askQuestion("Second Player's Tag: ");
    console.log("Finding player ids")
    let ids = await getId(myName, myTag, theirName, theirTag)
    console.log("Found!")
    let myId = ids[0]
    let theirId = ids[1]
    console.log('Player 1 Id - ', myId)
    console.log('Player 2 Id - ', theirId)
    let foundMatches = new Set();
    console.log('Searching for a shared match')
    await api.getMatchesByPUUID('na', myId, "10", "competitive").then(res => {
        parsePlayerMatches(myId, theirId, res.data,1).forEach(match => foundMatches.add(match))
    })
    await api.getMatchesByPUUID('na', theirId, "10", "competitive").then(res => {
        parsePlayerMatches(theirId, myId, res.data,2).forEach(match => foundMatches.add(match))
    })
    if (foundMatches.length === 0) return "No shared matches found"

    foundMatches.forEach(match => printGameDetails(match, myId, theirId))

}

function printGameDetails(foundMatch, myId, theirId) {
    console.log('--------------------')
    console.log("Map:", foundMatch.metadata.map)
    console.log("Match Date:", foundMatch.metadata.game_start_patched)
    console.log("Match UNIX time:", foundMatch.metadata.game_start)
    console.log("Winning Team:", (foundMatch.teams.red.has_won) ? "Red" : "Blue")
    console.log(`Score: R-${foundMatch.teams.red.rounds_won}, B-${foundMatch.teams.blue.rounds_won}`)

    let roundsTotal = parseInt(foundMatch.teams.red.rounds_won, 10) + parseInt(foundMatch.teams.red.rounds_lost, 10)
    let firstPlayer = { 'puuid': myId, 'team': null, 'agent': null }
    let secondPlayer = { 'puuid': theirId, 'team': null, 'agent': null };
    let playerList = foundMatch.players.all_players
    for (let i = 0; i < playerList.length; i++) {
        if (firstPlayer.name && secondPlayer.name)
            break;
        if (playerList[i].puuid === myId) {
            firstPlayer = getPlayerStats(playerList[i], roundsTotal)
        }
        else if (playerList[i].puuid === theirId) {
            secondPlayer = getPlayerStats(playerList[i], roundsTotal)
        }
    }

    // Getting party members for each player
    let parties = [[], []]
    let partyLeader = [firstPlayer, secondPlayer]
    for (let i = 0; i < partyLeader.length; i++) {

        for (let j = 0; j < playerList.length; j++) {
            let player = playerList[j]
            if (player.party_id && player.party_id === partyLeader[i].partyId && player.puuid !== partyLeader[i].puuid) {
                parties[i].push(getPlayerStats(player, roundsTotal))
            }
        }
        if (firstPlayer.partyId === secondPlayer.partyId) break;
    }

    for (let z = 0; z < parties.length; z++) {
        if (parties[z].length > 0) {
            for (let key in parties[z][0]) {
                let maxIndex = 0
                for (let i = 0; i < parties[z].length; i++) // find max length for this key
                    maxIndex = (parties[z][maxIndex][key].length > parties[z][i][key].length) ? maxIndex : i
                for (let i = 0; i < parties[z].length; i++) { // expand for all party members
                    let str = alignText(parties[z][maxIndex][key], parties[z][i][key])
                    parties[z][i][key] = str[1]
                }
            }
        }
    }
    // Aligning outputs for better reading
    for (let key in firstPlayer) {
        let alignedStrings = alignText(firstPlayer[key], secondPlayer[key])
        firstPlayer[key] = alignedStrings[0]
        secondPlayer[key] = alignedStrings[1]
    }

    console.log(`${firstPlayer.name}: Team - ${firstPlayer.team}, Agent - ${firstPlayer.agent}, K/D/A - ${firstPlayer.KDA}, Rank - ${firstPlayer.rank}, ACS - ${firstPlayer.ACS}`)
    if (parties[0].length > 0) {
        parties[0].forEach(player => console.log(`            Party 1 - ${player.name} Agent - ${player.agent}, K/D/A - ${player.KDA}, Rank - ${player.rank}, ACS - ${player.ACS}`))
        console.log('')
    }

    console.log(`${secondPlayer.name}: Team - ${secondPlayer.team}, Agent - ${secondPlayer.agent}, K/D/A - ${secondPlayer.KDA}, Rank - ${secondPlayer.rank}, ACS - ${secondPlayer.ACS}`)
    if (parties[1].length > 0) parties[1].forEach(player => console.log(`            Party 2 - ${player.name} Agent - ${player.agent}, K/D/A - ${player.KDA}, Rank - ${player.rank}, ACS - ${player.ACS}`))
}

function alignText(str1, str2) {
    if (str1.length > str2.length) {
        let diff = str1.length - str2.length
        str2 = str2 + ' '.repeat(diff)
    }
    else if (str1.length < str2.length) {
        let diff = str2.length - str1.length
        str1 = str1 + ' '.repeat(diff)
    }
    return [str1, str2]
}

function getPlayerStats(player, rounds) {
    return {
        'puuid': player.puuid,
        'name': `${player.name}#${player.tag}`,
        'team': player.team,
        'agent': player.character,
        "KDA": `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`,
        "rank": player.currenttier_patched,
        "ACS": String(parseInt(player.stats.score, 10) / rounds).split('.')[0],
        "partyId": player.party_id
    }
}

function parsePlayerMatches(id1, id2, matches, num) {
    let foundMatches = []
    let isMatchFound = false
    console.log(`Retrieved ${matches.length} previous matches from Player ${num}`)
    for (let i = 0; i < matches.length; i++) {
        let foundP1 = false;
        let foundP2 = false
        let { all_players } = matches[i].players
        for (let j = 0; j < all_players.length; j++) {
            let playerId = all_players[j].puuid

            if(playerId === id1) foundP1 = true
            else if(playerId === id2) foundP2 = true
            if (foundP1 && foundP2) {
                if (!isMatchFound) {
                    console.log(`Found a match in Player ${num}'s history`)
                    isMatchFound = true
                }
                foundMatches.push(matches[i])
            }
        }
    }
    return foundMatches
}
main()


