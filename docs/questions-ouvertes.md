# Questions à trancher avant de coder

Mises à jour le 27/10/2026 après analyse du code de queuePop, ARAM-Mayhem-Database, Ryot et UP!
(détails : `analyse-projets.md`). Le probe sert maintenant à **confirmer** sur ton client, pas à découvrir.

| # | Question | Réponse | Statut |
|---|---|---|---|
| 1 | `allgamedata` (Live Client) contient-il tes augments / les augments proposés ? | **Très probablement non** : arammeta a dû passer par Overwolf (Windows) pour les augments proposés | ⚠️ à confirmer : `*-ingame-allgamedata.json` |
| 2 | Où sont les cartes proposées et le banc ? | `GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list` → tableau d'IDs (404 hors fenêtre) ; banc dans `session.benchChampions` | ✅ code qui tourne (queuePop) |
| 3 | Peut-on récupérer les augments de ses parties Mayhem ? | **Oui** : `GET /lol-match-history/v1/games/{gameId}` → `participants[].stats.playerAugment1..6`, `gameMode: "KIWI"` | ✅ **confirmé sur ton client le 27/10** : 50 parties Mayhem importées avec leurs augments par la V1 |
| 4 | Y a-t-il encore des runes en Mayhem ? | arammeta et UP! extraient encore les champs `perk*` des parties Mayhem, et OP.GG publie des pages de runes pour Mayhem → probablement oui | ⚠️ à confirmer : `*-perks-current.json` en champ select Mayhem |

## Seule action qui demande ton client League

`npm run probe` pendant une partie ARAM et une partie Mayhem. Je ne peux pas le faire à ta place : ton client League
n'est pas accessible depuis mon environnement, même via le lien avec ton Mac.
