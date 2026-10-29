# Analyse du code des projets existants

_Analyse faite le 27/10/2026 en clonant et en lisant le code source des 4 projets._

## Résumé : ce que ça règle

| Problème | Réponse trouvée dans le code | Source |
|---|---|---|
| Où sont les cartes ARAM proposées ? | `GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list` → **tableau d'IDs de champions** (2-3), **404 hors de la fenêtre de choix** | queuePop |
| Comment choisir une carte ? | `PATCH /lol-champ-select/v1/session/actions/{actionId}` avec `{ championId, completed: true }` quand `phase === "BAN_PICK"` et ton action `isInProgress` | queuePop |
| Prendre sur le banc | `session.benchChampions` (objets `{championId}` ou IDs bruts) → `POST /lol-champ-select/v1/session/bench/swap/{id}` | queuePop |
| Échanges | `session.championSwaps` (anciens clients : `session.trades`) → `POST .../champion-swaps/{id}/request|accept|decline|cancel`, repli sur `/trades/` en cas de 404 | queuePop |
| **Augments Mayhem de tes parties** | **`GET /lol-match-history/v1/games/{gameId}`** → 10 participants, `stats.playerAugment1` à `playerAugment6`. `gameMode` = **`KIWI`** pour Mayhem. Historique local ≈ 20 dernières parties | ARAM-Mayhem-Database |
| **Stats Mayhem globales (le « point dur »)** | **arammeta.com publie des JSON publics** : 413 752 parties sur le patch 16.21, winrate des augments par champion et par rareté, items, sorts, synergies | ARAM-Mayhem-Database |
| Liste et pools d'augments Mayhem | CommunityDragon : `game/maps/modespecificdata/kiwi.bin.json` (ID public des augments), `augmentgroups.bin.json` (pools), `augmentoperators.bin.json` (depuis 26.18), `plugins/rcp-be-lol-game-data/global/{locale}/v1/cherry-augments.json` (noms et icônes) | ARAM-Mayhem-Database |
| Augments **proposés** en direct | Aucun projet ne les lit via les API officielles. arammeta les obtient via un pont **Overwolf** (Windows uniquement) → **impossible sur Mac en l'état** | ARAM-Mayhem-Database |
| Overlay au-dessus du jeu sur Mac | `NSPanel` non-activant, niveau `screenSaver + 1` (détails §4) | UP! |
| Savoir si le jeu est au premier plan sur Mac | Bundle ID du jeu : **`com.riotgames.LeagueofLegends.GameClient`** + notification `NSWorkspace.didActivateApplicationNotification` | UP! |
| IDs des files Mayhem | `2400, 2401, 2403, 2405, 2410, 2450, 3240, 3270, 3280` (2400 = file principale) | UP! |

---

## 1. queuePop — doughknee/queuePop (MIT)

Python + JS. Bot qui automatise le champ select, dont l'ARAM moderne.

- Ordre d'exécution à chaque tick : **choix de carte → banc → échanges → runes/sorts/skins**.
- Le choix de carte compare les cartes proposées à une liste de priorité, puis à la maîtrise du champion.
- Les échanges sont traités comme des offres permanentes : une seule demande active à la fois, annulée dès qu'elle
  n'est plus un gain, et vérification au moment d'accepter.
- Le code utile pour toi : `app/champ-select.js` (port JS, lignes ~250-280 et ~555-790).

## 2. ARAM-Mayhem-Database / arammeta — Lanternko (MIT)

Python. Le seul projet qui a résolu le problème des données Mayhem.

### Comment ils obtiennent les données
- Riot ne fournit pas Mayhem (file 2400) via l'API publique → ils collectent via la **LCU** sur des PC de joueurs.
- À la fin de chaque partie : `eog-stats-block` donne le `gameId`, puis `GET /lol-match-history/v1/games/{gameId}` donne
  les 10 joueurs avec leurs augments. Ils étendent ensuite la collecte via l'historique d'autres joueurs (« snowball »).
- Pour toi, **seul ton propre historique** compte : c'est suffisant pour ta base perso, et c'est sans ambiguïté côté règles.

### Les JSON publics (le plus utile)
- `https://arammeta.com/api/tier-list.json` (≈ 1 Mo) : 173 champions, 230 augments (noms FR absents, EN présents),
  `patch_prefix`, catégories d'augments (AD, AP, tank, support…), modèle de score d'équipe (`team_score`, `draftModel`).
- `https://arammeta.com/api/champions/{id}.json` (≈ 90 Ko) : pour un champion, `top` et `bot` par rareté
  (`kPrismatic`, `kGold`, `kSilver`) avec `wr`, `g` (parties), `lift` (gain vs moyenne), `lcb` (borne basse), `pick` ;
  plus `items`, `boots`, `spells`, `itemClusters`, `augTypes`.
- `https://arammeta.com/api/augment-pools.json` : pools d'augments par champion.
- Vérifié en ligne le 27/10 : données du patch **16.21**.

### Limites
- Données majoritairement issues du **serveur taïwanais** (la page indique « TW · Mayhem · queue 2400 ») : la méta EUW peut différer.
- Dépendance à un site tiers : le script met les fichiers en cache (12 h) et accepte une copie locale (`--file`).

→ Branché dans **`scripts/mayhem-stats.mjs`** (`npm run mayhem -- Yasuo`).

## 3. Ryot — ryanpolasky/Ryot (MIT)

Electron + pnpm monorepo, Next.js, Fastify. Installeurs macOS.

- **Overlay** (`apps/desktop/src/main.ts`, `createOverlay`) : fenêtre de la taille de l'écran, `transparent`, `frame:false`,
  `focusable:false`, `hasShadow:false`, `skipTaskbar`, puis `setAlwaysOnTop(true, "screen-saver")`,
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setIgnoreMouseEvents(true, { forward: true })`.
  Mode interactif : bascule `setIgnoreMouseEvents(false)` à la demande, raccourci pour masquer. Réapparition avec
  `showInactive()` pour ne jamais voler le focus au jeu.
- **Détection du jeu au premier plan** : Windows uniquement (PowerShell). Sur Mac, ça « échoue ouvert » : l'overlay reste
  toujours affiché. → Prendre la méthode d'UP! (bundle ID, §4) via un petit module natif ou `osascript`.
- **LCU** (`apps/desktop/src/lcu.ts`) : chemins du lockfile Windows + `/Applications/League of Legends.app/Contents/LoL/lockfile`.
- **Crawler** (`apps/server/src/stats/crawler.ts`) : ladders → matchs récents → dédoublonnage → agrégation, pour l'ARAM
  (file 450) via match-v5. Désactivé par défaut tant qu'il n'y a pas de clé de production.

## 4. UP! — sajmonekk191/UP (Swift, **aucune licence = tous droits réservés**)

Companion macOS natif. **On peut s'en inspirer, pas copier son code.** Ce qui est appris :

- **HUD en jeu** : `NSPanel` avec style `[.nonactivatingPanel, .borderless]`, niveau `screenSaver + 1`,
  `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]`, fond transparent,
  `hidesOnDeactivate = false`, `becomesKeyOnlyIfNeeded = true`, affichage avec `orderFrontRegardless()`.
  → C'est exactement ce que `tauri-nspanel` permet de reproduire si Electron ne suffit pas.
- **Écran du jeu** : retrouve la fenêtre du jeu via `CGWindowListCopyWindowInfo` filtré sur le PID de
  `com.riotgames.LeagueofLegends.GameClient`, puis place le HUD sur cet écran (utile en multi-écran).
- **Mode ARAM** : affiche ton champion + le banc, classés selon la tier list du mode, prise en un clic.
- **Données de builds et d'augments** : appelle l'**API interne d'OP.GG** (`lol-api-champion.op.gg`), y compris pour
  Mayhem (`aram_mayhem_classic`). → **À ne pas reproduire** : API privée, non documentée, contraire aux CGU d'OP.GG.
  arammeta est l'alternative propre.
- Augments Arena : `https://raw.communitydragon.org/latest/cdragon/arena/en_us.json`.

---

## Conséquences pour le projet

1. **Le point dur des données Mayhem est réglé** pour une V1 : arammeta pour les stats globales, ta propre LCU pour ta base perso.
2. **Le conseiller cartes/banc est faisable** à 100 % : endpoints et logique confirmés par un code qui tourne.
3. **Le panneau d'augments en jeu reste manuel** sur Mac (pas d'accès aux augments proposés) : il affiche les meilleurs
   augments de ton champion pour la rareté du moment, tu fais la correspondance à l'écran.
4. **Overlay** : commencer avec la config Electron de Ryot, jeu en fenêtré sans bordure. Repli : Tauri + NSPanel avec les
   réglages d'UP!.
