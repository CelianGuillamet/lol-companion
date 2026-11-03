/** Données SYNTHÉTIQUES de transport/UI. Ne valide aucune observation en vraie partie. */
export function intelligenceFixture(gameTime = 120) {
  return {
    activePlayer: { riotId: 'Celian#EUW' },
    allPlayers: [
      { riotId: 'Celian#EUW', summonerName: 'Celian', championName: 'Leona', team: 'ORDER', level: 8 },
      ...['Ahri', 'Yasuo', 'Malphite', 'Leona', 'Jinx'].map((championName, index) => ({
        riotId: `Enemy${index}#TEST`, summonerName: `Enemy${index}`, championName,
        rawChampionName: `game_character_displayname_${championName}`,
        team: 'CHAOS', level: 8, isDead: index === 4,
        // Le champ position de Live Client décrit un rôle, jamais des coordonnées.
        position: index === 0 ? 'MIDDLE' : '',
        summonerSpells: {
          summonerSpellOne: { displayName: 'Flash', rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' },
          summonerSpellTwo: { displayName: index === 0 ? 'Teleport' : 'Ignite' },
        },
      })),
    ],
    gameData: { gameTime, gameMode: 'CLASSIC', mapNumber: 11 },
    events: { Events: [
      { EventID: 0, EventName: 'GameStart', EventTime: 0 },
      { EventID: 1, EventName: 'ChampionKill', EventTime: 100.125, KillerName: 'Enemy0', VictimName: 'Celian' },
      { EventID: 2, EventName: 'DragonKill', EventTime: 119.75, KillerName: 'Enemy1' },
    ] },
  };
}
