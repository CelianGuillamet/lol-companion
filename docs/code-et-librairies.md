# Code, librairies et données utilisables — spécial Mac

_Recherche du 26/10/2026. Légende : ✅ confirmé par la source · ⚠️ à vérifier sur ton client avec le probe._

---

## 0. TL;DR — stack recommandée

| Couche | Choix recommandé | Alternative |
|---|---|---|
| App desktop | **Electron + Vue 3 + TS** (ton stack, overlay simple) | **Tauri 2 + tauri-nspanel** (léger, meilleur overlay plein écran) |
| Connexion LCU | **`@hasagi/core`** (types auto-générés, lockfile + args du process, WebSocket) | `league-connect`, `hexgate` |
| Doc LCU | Swagger `dysolix/hasagi-types` + LCU Explorer | KebsCS/lcu-and-riotclient-api |
| Live Client (en jeu) | `fetch` maison sur `127.0.0.1:2999` (12 endpoints, trivial) | `galeforce` (inclut Live Client) |
| API web Riot | **`@fightmegg/riot-api`** (rate limit + retries + cache intégrés) | `twisted`, `galeforce` |
| Données statiques | Data Dragon + CommunityDragon + Meraki + Wiki LoL | — |
| Stockage local | SQLite (`better-sqlite3`) | — |

**Pourquoi Electron d'abord** : tout en TypeScript, et des projets Electron récents (Ryot) livrent déjà des installeurs macOS
avec overlay via la Live Client Data API. **Pourquoi garder Tauri en tête** : sur macOS, seule une fenêtre de type
**NSPanel non-activante** passe au-dessus d'une app en plein écran natif (cf. §4). Si l'overlay Electron ne tient pas
au-dessus du jeu, Tauri + tauri-nspanel est la porte de sortie.

---

## 1. Connexion au client (LCU)

### Ce qu'il faut savoir ✅
- La LCU (League Client Update) expose une API locale REST + WebSocket : tout ce que fait le client est faisable via l'API.
- **Non supportée officiellement** par Riot, documentation 100 % communautaire.
- Riot recommande de **créer une application sur le Developer Portal** en décrivant ton usage de la LCU.
- Certificat auto-signé : utiliser le certificat Riot fourni ou ignorer les erreurs SSL.
- Identifiants : `lockfile` (`/Applications/League of Legends.app/Contents/LoL/lockfile` sur Mac) **ou** arguments du
  process `LeagueClientUx` (`--app-port`, `--remoting-auth-token`) — c'est ce que fait déjà `scripts/probe.mjs`.

### Librairies TypeScript / Node
| Lib | Points forts | Lien |
|---|---|---|
| **@hasagi/core** | Types auto-générés pour chaque requête, WebSocket, lockfile **et** args du process | github.com/dysolix/hasagi-core |
| @hasagi/types | `swagger.json` + types TS de toute la LCU (régénérés) | github.com/dysolix/hasagi-types |
| hasagi-extended | Événements et requêtes prêtes pour les usages courants | github.com/dysolix |
| hasagi-cli | CLI : requêtes, écoute d'événements, génération du swagger | github.com/dysolix/hasagi-cli |
| **league-connect** | Classique, polling d'auth, WebSocket avec abonnements par endpoint, listener connexion/déconnexion du client, cert Riot par défaut | github.com/junlarsen/league-connect |
| hexgate | Wrapper TS, `Connection` qui gère les redémarrages du client, « recipes », cache `LcuValue` | github.com/cuppachino/hexgate |
| lcu-connector | Ancien, simple (EventEmitter connect/disconnect) | github.com/Pupix/lcu-connector |

### Autres langages (pour lire du code)
- **Rust** (si Tauri) : `irelia` (LCU + Live Client), `rusty-lcu` (client généré depuis le swagger hasagi), `lol-game-client-api`.
- **Python** : `lcu-driver` (exemple d'écoute de `/lol-champ-select/v1/session` en WebSocket).
- **C#** : `PoniLCU`, `lcu-sharp`, `GlassLCU`. **Go** : `go-lcu`.

### Explorer / documenter les endpoints
- **Swagger hasagi** : `https://raw.githubusercontent.com/dysolix/hasagi-types/main/swagger.json` (OpenAPI, régénéré).
- **LCU Explorer** (HextechDocs) — remplaçant de Rift Explorer (plus maintenu, mais tournait sur macOS).
- **LCU Schema** de MingweiSamuel (swagger en ligne) : mingweisamuel.com/lcu-schema/tool
- **KebsCS/lcu-and-riotclient-api** : doc LCU + Riot Client.
- **Needlework** : explorateur LCU (.NET).
- Le client lui-même expose sa doc via swagger et `/help` (le probe le sauvegarde, cf. §8).

---

## 2. Endpoints LCU utiles pour l'app

_Chemins vérifiés dans le swagger communautaire hasagi, **version client 16.20** (1 293 endpoints)._

| Besoin | Endpoint | Statut |
|---|---|---|
| Phase en cours | `GET /lol-gameflow/v1/gameflow-phase` | ✅ |
| File / mode de jeu | `GET /lol-gameflow/v1/session` (`gameData.queue`) | ✅ |
| Session champ select | `GET /lol-champ-select/v1/session` (+ WebSocket) | ✅ |
| Session côté team-builder | `GET /lol-lobby-team-builder/champ-select/v1/session` — contient `benchEnabled`, `benchChampions`, **`allowSubsetChampionPicks`** | ✅ swagger |
| **Cartes champion proposées (ARAM)** | **`GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list`** (candidat n°1) ; aussi `pickable-champion-ids` | ✅ existe · ⚠️ contenu à confirmer avec le probe |
| Prendre un champion du banc | `POST /lol-champ-select/v1/session/bench/swap/{championId}` (existe aussi sous `/lol-lobby-team-builder/...`) | ✅ swagger |
| Échanges entre joueurs | `GET /lol-champ-select/v1/session/champion-swaps` + `POST .../champion-swaps/{id}/request|accept|decline|cancel` | ✅ swagger |
| Reroll (ancien système) | `POST /lol-champ-select/v1/session/my-selection/reroll` | ✅ swagger (probablement inactif avec les cartes) |
| Sorts d'invocateur | `GET/PATCH /lol-champ-select/v1/session/my-selection` | ✅ swagger |
| Pages de runes | `GET/POST/DELETE /lol-perks/v1/pages`, `GET/PUT /lol-perks/v1/currentpage` | ✅ swagger |
| Item sets | `GET/POST/PUT /lol-item-sets/v1/item-sets/{summonerId}/sets` (+ `POST .../validate`) | ✅ swagger |
| Stats de fin de partie | `GET /lol-end-of-game/v1/eog-stats-block` et `GET /lol-end-of-game/v1/gameclient-eog-stats-block` | ✅ swagger · ⚠️ augments Mayhem dans le bloc `stats` à vérifier |
| Historique local | `GET /lol-match-history/v1/products/lol/current-summoner/matches` | ⚠️ |

Aucun endpoint du swagger 16.20 ne contient « augment », « mayhem » ou « kiwi » pour LoL (seulement TFT) : les augments
Mayhem ne sont pas exposés par un endpoint dédié côté client. Il reste la piste du bloc `stats` de fin de partie.

**Piège découvert par queuePop** ✅ : en ARAM moderne, la liste des 2-3 champions proposés n'est **pas** dans la session
champ select mais côté `lol-lobby-team-builder`, et choisir un champion non proposé « réussit » silencieusement sans rien
faire. Leur ordre d'opérations : choix d'ouverture → prise sur le banc → échanges → runes/sorts.

---

## 3. Live Client Data API (en partie)

- Base : `https://127.0.0.1:2999/liveclientdata/` (certificat auto-signé). Ne répond **qu'en partie**, pas dans le lobby.
- 12 endpoints ✅ : `allgamedata`, `activeplayer`, `activeplayername`, `activeplayerabilities`, `activeplayerrunes`,
  `playerlist`, `playeritems`, `playerscores`, `playersummonerspells`, `playermainrunes`, `eventdata`, `gamestats`.
- `playerlist?teamID=ORDER|CHAOS` pour filtrer une équipe ✅.
- Identifiants joueurs : Riot ID (`?riotId=`) depuis le patch 14.10 ✅.
- **Augments Mayhem dans cette API** : aucune source ne le confirme ⚠️ → question n°1 du probe.
- Pas besoin de librairie : 12 GET JSON. `galeforce` la couvre si tu veux des types.

---

## 4. Overlay sur macOS

### Le fait clé ✅
macOS ne place pas une fenêtre d'app normale au-dessus de l'espace plein écran d'une autre app. Il faut un **NSPanel**
avec le style **non-activant**, niveau `screenSaver` et un `collectionBehavior` adapté (testé sur macOS 26 selon un
fil des Apple Developer Forums).

### Option A — Electron
- Fenêtre `transparent: true`, `frame: false`, `hasShadow: false`, `focusable: false`, `alwaysOnTop: true`.
- `win.setAlwaysOnTop(true, 'screen-saver')` + `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
- `win.setIgnoreMouseEvents(true, { forward: true })` pour laisser passer les clics, en le désactivant au survol
  d'un panneau interactif.
- `app.dock.hide()` pour un utilitaire sans icône dans le Dock.
- Limites ✅ : une fenêtre transparente n'est pas redimensionnable, et la transparence saute quand DevTools est ouvert.
- Exemple de référence : **drawverlay** (overlay Electron macOS au-dessus des apps plein écran avec cette config).
- ⚠️ Electron propose un `type: 'panel'` sur macOS dans ses versions récentes : à tester si l'overlay passe sous le jeu.
- **Conseil pratique** : jouer en **fenêtré sans bordure** évite le problème des Spaces plein écran.

### Option B — Tauri 2 + tauri-nspanel ✅
- Plugin `tauri-nspanel` (ahkohd) : convertit une fenêtre en **NSPanel** ou en crée une via un `PanelBuilder`.
- Gère `CollectionBehavior` (Spaces, plein écran), le suivi souris, etc.
- Utilisé par des overlays existants (ex. Overlayed). Front en Vue possible, logique LCU en Rust (`irelia`).
- Piège connu : un NSPanel non-activant peut « avaler » les clics synthétiques → gérer le clic au `mouseup`.

### Option C — Swift natif
- C'est l'approche de **UP!** (companion macOS natif). Le plus robuste, mais hors de ton stack.

---

## 5. API web Riot (match-v5, etc.)

| Clé | Limites | Usage |
|---|---|---|
| Dev (auto) | expire toutes les 24 h | tests |
| **Personal** | **20 req/s et 100 req/2 min**, pas d'augmentation possible | ton cas : produit perso / petite communauté |
| Production | 500 req/10 s et 30 000 req/10 min | produit public, validation Riot |

- 100 req / 2 min ≈ **72 000 requêtes/jour max** → un crawler ARAM (queue 450) est jouable sur quelques jours.
- **Mayhem (queue 2400)** : Mobalytics indique que Riot ne fournit pas de données Mayhem via l'API → ⚠️ vérifier ce que
  renvoie match-v5 pour une de tes parties Mayhem (présence des champs `playerAugment1..n` comme en Arena ?).

### Librairies TS
- **@fightmegg/riot-api** : rate limiting intégré, retries auto, types, 100 % des endpoints (dont DDragon), cache
  mémoire ou Redis, priorisation des requêtes. → **recommandée pour le crawler.**
- **twisted** : wrapper complet avec concurrence configurable.
- **galeforce** : interface fluide, DTO TS de toutes les réponses, inclut Data Dragon **et** Live Client Data API.

---

## 6. Données statiques

| Source | Ce qu'elle apporte | URL |
|---|---|---|
| **Data Dragon** (Riot) | Champions, items, runes, sorts, icônes par patch | ddragon.leagueoflegends.com |
| **CommunityDragon** | Tout le contenu client : `queues.json`, `maps.json`, augments Arena (`cherry-augments.json`), icônes. Listing JSON des dossiers via le préfixe `/json/` | raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/ |
| **Meraki Analytics** (lolstaticdata) | Champions et items plus précis que DDragon : type adaptatif, style de dégâts, rôles | cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json |
| **Wiki LoL — Module:ChampionData/data** | **Modificateurs ARAM par champion** (`dmg_dealt`, `dmg_taken`, etc.), style de dégâts 0-100, type adaptatif | wiki.leagueoflegends.com/en-us/Module:ChampionData/data |
| **Wiki LoL — Module:MayhemAugmentData/data** | Liste des augments Mayhem (nom, effet, tier) | wiki.leagueoflegends.com/en-us/ARAM_Mayhem/Augments |

- Mayhem s'appelle **`kiwi`** en interne chez Riot ✅ → chercher « kiwi » dans le listing JSON de CommunityDragon pour
  trouver un éventuel fichier d'augments Mayhem ⚠️.
- Contenu du wiki sous licence CC BY-SA : citer la source si tu redistribues.

### Volatilité des augments Mayhem ✅ (à intégrer au design)
- 26.03 : +40 augments, sets d'augments, piste de progression.
- 26.12 : +50 augments, -30, suppression des sets/traits.
- Hotfix : **450+ combinaisons d'« augments de compétence » retirées** sans mise à jour client.
- 26.14 : RNG des offres ajustée.
- Riot annonce des mises à jour Mayhem jusqu'en 2027.
→ **Ne jamais coder les augments en dur** : les charger depuis une source mise à jour (CDragon / wiki) avec un cache par patch.

---

## 7. Projets existants (analysés)

| Projet | Plateforme / stack | Ce qu'il y a à prendre |
|---|---|---|
| **UP!** (sajmonekk191/UP) | **macOS natif**, macOS 14+, Apple Silicon + Intel | Assistant champ select, builds **ARAM + Arena (augments par rareté)**, HUD en jeu. Code analysé → `analyse-projets.md` §4 (config NSPanel du HUD, détection du jeu). Sans licence : inspiration seulement. Ses données viennent de l'API privée d'OP.GG (à ne pas reproduire). |
| **Ryot** (ryanpolasky/Ryot) | **Electron**, monorepo pnpm, Next.js 15, Fastify, installeurs **macOS** | Architecture complète : suite champ select, import runes via LCU, overlay via Live Client, tier list ARAM. Code analysé → `analyse-projets.md` §3 (overlay Electron, lockfile Mac). MIT. |
| **queuePop** (doughknee/queuePop) | Desktop | Code analysé → `analyse-projets.md` §1 : `subset-champion-list`, choix de carte, banc, échanges. MIT. |
| **League Akari** (LeagueAkari/LeagueAkari) | Electron, Windows 10+ | Toolkit LCU très complet (auto-pick ARAM, analyse). Code à lire, pas à faire tourner sur Mac |
| **Seraphine** (Zzaphkiel/Seraphine) | Python | Requêtes LCU personnalisées, intégration multi-outils |
| **lcu-mcp** (Triggered0) | MCP | Liste d'actions LCU documentées (dont swap de banc ARAM) |
| **ARAM-Mayhem-Database** (Lanternko) | Python, PyTorch | Code analysé → `analyse-projets.md` §2 : augments via `/lol-match-history/v1/games/{id}`, JSON publics arammeta (~414k parties en 16.21). MIT. |
| **Legendary Rune Maker** | Desktop | Import runes / item sets / ordre des compétences |
| **Rift Companion** | macOS natif | Overlay Mac (panneaux à côté du jeu) |
| **awesome-league / awesome-lcu** | Listes | Catalogues de tout l'écosystème |

---

## 8. Ce que ça change pour le probe

Le probe sauvegarde maintenant aussi :
- `/help` du client (liste de tous les endpoints et événements) ;
- pendant le champ select, **les 22 endpoints GET `lol-lobby-team-builder`** listés par le swagger hasagi (dont
  `subset-champion-list`), pour identifier celui qui contient tes cartes proposées.

---

## 9. Pièges et règles

- **Pas de lecture mémoire** : Riot la coupe depuis octobre 2026 pour les apps tierces ; seules les API officielles restent permises.
- **Cooldowns ennemis et timers automatiques** : Riot a jugé les timers automatiques inacceptables dès 2014. Des apps
  récentes (UP!, Ryot) affichent pourtant des timers dragon/baron basés sur l'horloge de la Live Client API : zone
  grise, à ne pas reproduire sans vérifier la politique Riot du moment.
- **Les endpoints LCU changent sans prévenir** (ex. renommage `champion-swaps`) : vérifier sur ton client en direct
  plutôt que de faire confiance à une doc figée (leçon de queuePop).
- **Scraping u.gg / OP.GG / Mobalytics** : non.
