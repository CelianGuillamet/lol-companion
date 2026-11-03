# Passation pour les sessions automatiques

Ce fichier est lu en premier par chaque session planifiée qui améliore l'app. Elle n'a **aucun souvenir** des
sessions précédentes : tout ce qu'il faut savoir est ici, dans `docs/ROADMAP.md` et dans `CHANGELOG.md`.

## Le projet

App compagnon League of Legends pour tous les modes 5v5 (ARAM, ARAM: Mayhem, Faille), **macOS uniquement**, usage perso de Celian (dev Vue/TS).
Electron 44 + Vue 3 + Vite + TypeScript, tests vitest. Source de vérité : ce dossier sur le Mac de Celian
(`~/Documents/aram-companion`), qui est un clone git du dépôt public GitHub `CelianGuillamet/lol-companion`
(branche `main`). L'historique, ce sont git, les archives `.install/aram-companion-vX.Y.tgz` et `CHANGELOG.md`.
Ne jamais mettre `probe-output/` sur GitHub.

Code :
- `src/core/` : logique sans Electron (LCU, arammeta, conseiller, champ select, runes/sorts, historique, moteur).
- `electron/` : fenêtres (principale, overlay, second écran), notifications, IPC, écrans.
- `src/renderer/` : interface Vue (onglets dans `App.vue`, vues dans `views/`).
- `test/` : `mock-lcu.ts` (faux client HTTPS), `engine.test.ts` (scénario complet), fixtures arammeta.

## Règles non négociables

1. **Politique Riot** : API officielles seulement (LCU locale, Live Client Data API port 2999, Data Dragon,
   CommunityDragon). Pas de lecture mémoire, pas d'injection, pas de timers automatiques (relics, sorts ennemis),
   pas d'automatisation de gameplay. La lecture de l'écran (OCR des 3 cartes d'augments) est autorisée par Celian
   depuis le 28 oct. 2026 (v1.39), en lecture seule, sans rien garder ni envoyer. Toute décision produit suit
   docs/ux-discovery/2026-10-28-aram-companion-discovery.md (job prioritaire J1, principes de design).
2. **Ne jamais casser l'app installée** : on ne déploie que si `npm test`, `npm run typecheck` et `npm run build`
   passent. Toujours garder l'archive précédente dans `.install/` pour revenir en arrière.
3. **Ne jamais toucher aux données perso de Celian** dans le client (pages de runes perso, item sets perso) : l'app
   n'écrit que dans ses propres pages « ARAM Companion ».
4. **Ne pas quitter / relancer l'app** depuis une session planifiée : Celian peut être en partie. Les changements
   s'appliquent à son prochain lancement. Le dire dans le résumé.
5. Une session = **une amélioration finie** (ou deux petites), testée, déployée, documentée. Pas de chantier à
   moitié fini déployé. Si c'est trop gros, découper dans ROADMAP et livrer la première tranche.
6. Interface et textes en **français**. Style : direct, pas de remplissage.

## Verrou (une seule session à la fois)

Plusieurs sessions peuvent tourner (tâche planifiée toutes les heures + session interactive avec Celian).
- Au début : lire `.install/LOCK` sur le Mac. S'il existe et que son horodatage (première ligne, ISO 8601 UTC) date
  de **moins de 3 h**, une autre session travaille : **ne rien modifier**, terminer en disant « session en cours
  ailleurs, rien fait ».
- Sinon : écrire `.install/LOCK` (`date -u +%Y-%m-%dT%H:%M:%SZ` puis une ligne qui décrit la session), et le
  rafraîchir (réécrire l'horodatage) au moins toutes les heures pendant le travail.
- À la fin (déployé ou abandonné) : écrire `LIBRE` comme première ligne de `.install/LOCK` (pas de `rm`, interdit).

## Procédure d'une session

Le Mac est accessible par les outils `mcp__remote-devices__*` (shell Linux sur les dossiers connectés : le projet est
dans `$HOME/mnt/Documents/aram-companion` ou `$HOME/mnt/aram-companion` selon le dossier connecté). Les `node_modules` du Mac sont des binaires macOS : **on build et on teste
dans le conteneur cloud**, pas sur le Mac.

1. Lire `docs/AGENT.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
2. Snapshot des sources côté Mac :
   `cd ~/mnt/Documents/aram-companion && tar czf .install/src-snapshot.tgz --exclude=.git --exclude=node_modules --exclude=dist --exclude=.install --exclude='ARAM Companion.app' --exclude=probe-output .`
   puis `device_stage_files` sur ce fichier, et extraction dans un dossier de travail du conteneur.
3. Dans le conteneur : `npm ci` (ou `npm install`), puis `npm test && npm run typecheck && npm run build` pour
   partir d'une base verte.
4. Implémenter l'item de ROADMAP choisi + ses tests (étendre `test/mock-lcu.ts` si besoin d'un nouvel endpoint).
   Vérifier l'interface avec un rendu Electron sous xvfb si l'UI change :
   `ARAM_SMOKE=1 ARAM_SMOKE_SHOW=1 ARAM_SMOKE_TAB=<onglet> ARAM_SMOKE_SHOT=out.png ARAM_DEMO_PORT=<port du faux client> ARAM_DEMO_TOKEN=demo ARAM_FIXTURES=test/fixtures ARAM_DATA_DIR=$(mktemp -d) xvfb-run -a -s "-screen 0 1400x900x24" ./node_modules/.bin/electron . --no-sandbox --disable-gpu`
   (faux client : bundler `test/demo.ts` avec esbuild et le lancer, il affiche `{port, token}`).
   Électron dans le conteneur : si `npm ci` n'arrive pas à télécharger le binaire, le récupérer avec curl depuis
   les releases GitHub d'Electron (version de package.json), vérifier SHASUMS256, dézipper dans
   `node_modules/electron/dist` et écrire `node_modules/electron/path.txt`.
5. Tests, typecheck, build verts → archive `tar czf aram-companion-vX.Y.tgz dist src test electron docs CHANGELOG.md package.json`
   (ajouter `build`, `scripts`, configs si modifiés), copie vers `/mnt/user-data/outputs/` **sous un nom jamais
   utilisé** (le pont peut resservir un ancien fichier du même nom : vérifier après extraction qu'une chaîne nouvelle
   est bien dans `dist/`),
   `device_commit_files` vers `~/Documents/aram-companion/.install/`, puis sur le Mac :
   `tar --overwrite -xzf .install/aram-companion-vX.Y.tgz` (jamais `rm`, interdit dans ce dossier).
   **Si `package.json` gagne une dépendance d'exécution** : la bundler (esbuild pour main, Vite pour l'interface)
   plutôt que dépendre d'un `npm install` sur le Mac.
6. Mettre à jour `CHANGELOG.md` (version, date, ce qui change pour Celian) et `docs/ROADMAP.md` (cocher, ajuster,
   ajouter ce qu'on a appris). Ces deux fichiers font partie de l'archive.
7. Publier sur GitHub **depuis le conteneur**, jamais avec git sur le Mac (les suppressions y sont interdites pendant
   les sessions planifiées, git y laisserait des `.lock` qui bloquent aussi Celian) :
   `add_repo` `CelianGuillamet/lol-companion` en accès `push`, cloner dans le conteneur, y copier les sources du
   dossier de travail (`rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude=.install --exclude=probe-output --exclude='ARAM Companion.app' --exclude=launch.log`),
   relire `git diff --stat` (aucun `probe-output`, aucun pseudo, aucun jeton), puis commit `vX.Y : <résumé>` et push
   sur `main`. Si le push échoue, le dire dans le résumé, sans annuler le déploiement.
8. Résumé final en français, court : ce qui a été ajouté, comment le voir, ce qu'il doit vérifier en partie.

Pour aligner le git du Mac sur GitHub après une session (à faire par Celian, pas par une session planifiée) :
`git fetch && git reset origin/main`. Les fichiers ne bougent pas, seul l'historique local est mis à jour.

## Données réelles disponibles pour calibrer

Dans `probe-output/` (écrits par l'app sur le Mac, lisibles depuis le shell du Mac) :
- `historique.json` : toutes les parties ARAM / Mayhem de Celian (format `HistoryGame`, depuis v1.22).
- `gameflow-session-<id>.json`, `liveclient-<id>.json` : captures brutes d'une partie Mayhem, sans identifiants
  (depuis v1.12 / v1.15) — pour vérifier les champs supposés (teamOne/teamTwo, level, headliner…).
Toujours regarder ces fichiers avant de deviner un format ou de régler un seuil.

## Ce qui est confirmé sur le vrai client (oct. 2026)

- Connexion LCU via les arguments du process `LeagueClientUx`, repli lockfile.
- Champ select Mayhem : cartes via `/lol-lobby-team-builder/champ-select/v1/subset-champion-list`, banc et
  échange OK, import runes/sorts OK.
- Historique : `/lol-match-history/v1/products/lol/current-summoner/matches` (liste, toi seul) et
  `/lol-match-history/v1/games/{id}` (10 joueurs, `stats.playerAugment1..6`, items, dégâts…). Le client ne garde le
  détail que des parties récentes.
- Fin de partie : enregistrement direct via eog-stats-block ou l'ID de la session gameflow.
- L'overlay par-dessus le jeu en plein écran / sans bordure ne s'affiche pas chez Celian (3 écrans) → mode par défaut :
  fenêtre sur un autre écran (`panelMode: 'window'`).
- Mayhem : gameMode `KIWI`, files 2400/2401/2403/2405/2410/2450/3240/3270/3280. ARAM : 450.
- Client en anglais chez Celian (noms d'augments et de runes en anglais).

## Faille de l'invocateur (v1.52)
- Mode `sr` (modes.ts : SR_QUEUES). Données : serveur MCP public d'OP.GG (`src/core/opgg.ts`, cache disque 6 h).
  Appel d'analyse vérifié en vrai : nom anglais, `desired_output_fields: ["data"]`. La méta des rôles
  (`lol_list_lane_meta_champions`) n'est pas encore vue en vrai : `probe-output/opgg-sample-lanemeta.json`.
- Rôle : `assignedPosition` au champ select, `position` du Live Client en partie. Les rôles adverses au champ
  select sont devinés (OP.GG role_rate), affichés « rôle deviné ».
- Confiance : `src/core/stats.ts` (Wilson 95 %). Counter-pick gardé seulement si la borne basse > 50 %.
- Les stats perso (history.stats / personal(null)) excluent la Faille.

## Composants partagés (v1.54)
- `src/renderer/ui/Confidence.vue` + `confidenceOf()` (store.ts) : fiabilité d'un winrate, 3 crans selon la
  demi-largeur de Wilson 95 % (≤ 1,5 pt fiable, ≤ 4 pts indicatif). À utiliser pour TOUT winrate affiché comme reco.
- `tone(wins, games)` (store.ts) : vert / rouge d'un résultat perso seulement si Wilson 80 % exclut 50 %.
- `ui/CommandSearch.vue` (⌘K), `ui/PlayerCard.vue` (identité + rangs, LCU `/lol-ranked/v1/current-ranked-stats`).
- Les écrans sont enveloppés dans un `div.page` pour la transition (certains écrans ont plusieurs racines).

## Design system (v1.57)
- Tokens dans `src/renderer/styles.css` : `--surface-1/2/3`, `--border`, `--border-strong`, `--ok/--warn/--danger/--info`,
  `--fs-xs…--fs-2xl`, `--sp-1…6`, `--page-x`, `--ctl-h`, `--dur`. Classes globales : `.page`, `.page-head`,
  `.card` (surface sobre, plus de cadre d'or), `.btn` / `.btn.primary` (un seul par écran) / `.btn.ghost`,
  `.seg`, `.input`, `.select`, `.notice.n-*`, `.skeleton`, `.kpi`, `.eyebrow`, `kbd`, `.sr-only`.
- Composants : `ui/PageHeader.vue`, `ui/Segmented.vue`, `ui/Notice.vue`, `ui/Confidence.vue`, `ui/CommandSearch.vue`,
  `ui/PlayerCard.vue`, `ui/PurchaseLine.vue`. Ne pas recréer de segmented / message d'état local.
- Règle de hiérarchie : une seule mise en avant forte par surface (`.reco` = cristal + or). Les autres blocs sont des
  surfaces sobres. Couleurs vertes / rouges = significatives (`tone`) ou signées (le signe porte l'info).
- Attention : la classe globale `.empty` (écran vide centré) existe ; d'où le préfixe `n-` des messages d'état.
- Vérifier : `npm test`, `npm run typecheck`, `npm run build`, puis les scénarios Electron (README).

## Design (v1.50, « Atelier Hextech »)
Jetons dans src/renderer/styles.css : encre --bg #050d16, panneaux --panel/--panel-2, or patiné --gold #c8aa6e,
parchemin --text, cristal --blue #0ac8b9 (réservé au vivant / focus). Titres Marcellus (h1 en capitales), interface
Barlow. Coins vifs (--radius 2px), cadres .card à filet d'or. **Une seule chose brille : la recommandation (.reco)**
— ne pas réutiliser ce cadre ailleurs. Pas de logos / polices / images de Riot (hors icônes CDragon déjà utilisées).

## Headliner (v1.55)
- `src/core/headliner.ts` : 8 headliners + conseils. Reconnu en direct par `CardReader` (ligne exacte lue dans
  `cardsArea()`, lignes avec « ! » ignorées) ou par les cartes Pentakill 3170-3173 (`Engine.setOffered`) →
  `state.headliner`, remis à zéro au champ select, noté dans `HistoryGame.headliner` (clé). Capture de test :
  `ARAM_SMOKE_HEADLINER="Command Line"`.
- v1.59 : une lettre d'écart tolérée pour les noms ≥ 9 lettres ; « Bees » seul accepté pendant `BANNER_MS` (90 s,
  cardreader.ts) hors écran de cartes. Bannière ratée → `Engine.headlinerMissed` (journal + `usage.json`
  `headliner_miss` : lectures, textes approchants via `headlinerNearMisses`).

## Revue des choix (v1.60)
- `src/core/review.ts` est pur et testé. `Engine.reviewCards` garde au moment du tirage la valeur affichée en partie
  (même calcul que `bestOffered`), `reviewOfGame` la range dans `HistoryGame.review` à la fin de partie.
- `Engine.backfillReviews` note les anciennes parties depuis `usage.json` (`approx: true`), au démarrage et au
  rechargement des stats. Sans détail arammeta pour un champion, la partie reste sans revue.

## Tirages d'augments (v1.63)
- `src/core/offers.ts` est pur et testé. `offersThisGame` a pour clé `round:type:rang`. Un tirage sans carte commune avec
  le précédent du même palier = nouveau choix (`choice` > 0 dans `card_picked` et la revue). `settleOffers` écarte les
  tirages fantômes (3 relances d'affilée) et les doublons (cartes restées ouvertes au palier suivant).

## Revue des achats (v1.64)
- `src/core/buyreview.ts` est pur et testé. `Engine.withValues` complète l'événement `item_bought`, `buysThisGame` donne
  `HistoryGame.buys` à la fin de partie. `backfillBuys` (appelé par `backfillReviews`) note les anciennes parties Mayhem et
  retrouve leur partie par champion et date (`gameOfBuy`), marqué `approx`.
- Seule source de valeur : `BuildPanel.itemStats` (`singleItems.top`). arammeta.com n'est joignable ni du conteneur ni du
  shell du Mac : la couverture réelle se lit dans `usage.json`, pas en téléchargeant les stats.

## Conseiller de reroll (v1.65)
- `src/core/reroll.ts` est pur et testé. `adviseReroll` calcule la valeur finale espérée sur toutes les suites de relances ; pool
  résumé à 24 valeurs (`thin`). `free` = carte non prise, `risky` = meilleure carte, seulement si le gain ≥ 1 pt.
- `Engine.rerollAdvice` suit le tirage (`draw` : cartes vues, relancées) en comparant les lectures complètes ; l'absence de carte
  commune = nouveau tirage (même règle qu'`offers.ts`). `poolValues` = `all` du champion + cartes de la rareté absentes de ce pool,
  estimées avec `estimatedRows`. Mêmes valeurs que le classement (`rowValue`).

## Revue des relances (v1.66)
- `reviewDraw` (reroll.ts, pur et testé) rejoue les lectures d'un tirage (`DrawTrack.steps`, gardé sur l'entrée de `offersThisGame`)
  et donne au plus une note, posée sur `ReviewChoice.reroll`. Les points vont dans `GameReview.rerollLost`, jamais dans `lost`.
- `Engine.withOldRerolls` reprend une fois les parties d'avant (`rerollsDone`, `rerollsApprox`) depuis `cards_seen`, sans `fit`.
  `cards_seen` n'avait pas de rareté avant la v1.65 : `drawRarity` la prend dans la tier list (majorité des 3 cartes).
- Extraction : `tar --overwrite` sort en erreur sur `test/fixtures/opgg/*.json` (Permission denied, 4 fichiers) ; ils n'ont pas changé. Contrôler avec `tar --diff -zf <archive>`, et ne pas enchaîner la libération du verrou avec `&&`.

## Faille : rang des items (v1.67)
- `BuildPanel.slotStats[4|5|6]` vient de `fourth_items`, `fifth_items`, `sixth_items` d'OP.GG. Ne comparer que des items du même rang : le
  winrate monte avec le rang. `itemSlot` compte les items finis hors bottes, `optionsForSlot` retombe sur les options fusionnées s'il reste
  moins de 2 items (50 parties minimum). `item_bought.slot` n'existe que si les valeurs viennent d'un rang.

## Pool de relance (v1.68)
- `DrawTrack.seen` couvre toute la partie : un nouveau tirage reprend le `seen` du précédent, `draw` n'est remis à zéro qu'au champ select et en
  fin de partie. Anciennes parties : `seenBefore` (offers.ts). `cards_seen.reroll.pool` = taille du pool à la 1re lecture du tirage.

## Bans Faille (v1.69)
- `src/core/bans.ts` est pur et testé. Gain = part du rôle (`games` / somme du rôle) × écart prudent (`mine.winRate` − borne haute du matchup, sinon borne basse du winrate − 50 %).
  Rôles comptés : le tien + ceux où l'allié a montré un champion (un ban retire le champion des deux équipes). `Engine.srBans` lit les actions `ban`, `null` s'il n'y en a pas à toi.
- `Engine.hoverBan` : PATCH avec `completed: false`, seulement si `isInProgress`. Ne jamais valider un ban à la place de Celian.
- `play` des counters OP.GG est un sous-échantillon (Lux contre Ahri : 2 515 sur 142 656) : il ne donne pas la fréquence du matchup, d'où les parts de `laneMeta`.

## Prochain sort (v1.70)
- `src/core/skills.ts` est pur et testé. `nextSkill` rejoue l'ordre OP.GG (15 étapes), chaque rang pris valide une étape. `Engine.attachAramSkills` remplit `BuildPanel.skills` sans attendre (OP.GG ne doit pas retarder le build) ; `skillPanel` tourne à chaque tick en partie.
- Mayhem : niveau 1 sans point pris au 1er choix, puis niveaux 7, 11, 15 (captures). `level − points` vaut 1 juste après un niveau. `skillTrack` donne `skills_taken` à la fin de partie (`partial` si l'app est lancée en cours de partie).
- Capture de test : `ARAM_SMOKE_SKILLS=QWEWWRWQWQRQEEE` (OP.GG injoignable depuis le conteneur). Le binaire Electron se télécharge bien depuis GitHub.

## Augments liés à un item (v1.71)
- `src/core/itembound.ts` est pur et testé. `BOUND` : nom de l'augment → items. `Engine.boundBuys` suppose pris le `best` de chaque tirage d'`offersThisGame` (un tirage relancé remplace son entrée), car rien ne donne l'augment pris avant la fin de partie.
- `nextBuys` reçoit `bound` : en tête de `seq`, désactive `keep`, départage les builds. `buildFit.planned` retire l'item ajouté à cause de la carte, sinon la carte se justifierait toute seule. Événement `item_bound` en fin de partie.

## Cartes déjà vues et « Upgrade X » (v1.72)
- `ghostCards` (offers.ts, pur et testé) est appelé dans `Engine.withoutGhosts`, au début de `setOffered`, sur les lectures complètes. `DrawTrack.before` = cartes des tirages précédents. 2 cartes communes avec le tirage = même tirage, même si le palier a changé : ne pas remplacer ce test par le numéro du choix, des cartes restent ouvertes au palier suivant.
- `unknownBound` (itembound.ts) : nom commençant par « Upgrade » absent de `BOUND`. `Ultra Hydra` et tout autre nom sans ce préfixe ne sont pas détectés.
- Depuis le conteneur : wiki et Data Dragon souvent refusés (WebFetch 4xx, curl 403). `itemLut` de `test/fixtures/tier-list.json` donne les ids d'items.

## Tirages hors paliers (v1.73)
- Le lecteur de cartes (`electron/cardreader.ts`) ne lit pas en continu : fenêtre de 150 s au début, 180 s à chaque changement de `augRound`, prolongée de 30 s par une lecture. `extraDrawAt` (headliner.ts, pur et testé) ajoute le niveau 21 et le niveau 18 sur Pentakill, via `state.liveLevel`. K/DA : lecture toutes les 5 s en plus. Toute nouvelle carte hors paliers doit passer par là, sinon elle n'est jamais lue.
- `augRound` reste 4 après le niveau 15 : l'augment du niveau 21 suit le chemin de K/DA (`choice: 1`, stats du choix 4). Ne pas passer à 5 : `ROUND_LABEL`, les boutons 1 à 4 et `rounds[]` n'ont que 4 cases.
- Le niveau dépasse déjà 18 hors Superfans (3 parties d'oct.) : ne pas déduire le headliner du niveau seul.
- `pkill -f motif` dans le shell du conteneur tue le shell lui-même si le motif est dans la commande : garder le PID (`$!`). `test/demo.ts` se bundle en esm avec `--packages=external`, à lancer depuis la racine du projet. GitHub : `gh api` refusé sur les dépôts tiers, sauf `search/code` ; WebFetch passe.

## Écart d'objets (v1.75)
- `src/core/goldgap.ts` est pur et testé. `Engine.goldGapPanel` tourne à chaque tick en partie, sur la même lecture `playerlist` que le reste. `items[].price` du Live Client = coût de la dernière recette, ne pas s'en servir : `GameData.itemPrice`, puis `itemLut`, puis `id % 10000` pour les ids Mayhem ≥ 100000 (`itemValue`).
- `Engine.lastGameTime` vient de `enemySpellPanel`, appelé juste avant. `goldSamples` (une entrée par tranche de 300 s) donne l'événement `gold_gap` à la fin de partie, vidé au champ select.
- Rendu téléphone sous Linux : `settings.json` avec `phone`, `phonePort`, `phoneToken` dans `ARAM_DATA_DIR`, `ARAM_SMOKE_WAIT` long, puis Playwright sur `http://<hostname -I>:<port>/?t=<jeton>#second`. `ARAM_SMOKE_SIZE` ne descend pas sous 900 px. Faux client : `ARAM_DEMO_GAP=1` (`ingame`) ou `roles` (`sringame`).

## Build et augments (v1.76)
- `src/core/buildchoice.ts` est pur et testé. `preferredCore` donne `prefer` à `nextBuys` (+0,25 au recoupement, sous les 0,5 d'un augment lié, sous tout item possédé). `openCores` : builds encore possibles, `invested` compte les composants, ce que `nextBuys` ne fait pas.
- `fitWithAlternatives` retire le malus d'une carte, jamais de bonus. `Engine.takenAugments` reprend le `best` d'`offersThisGame`, sans les augments liés. `leanCore` coupe `keep` au changement de build.

## Version lancée (v1.78)
- `src/core/appversion.ts` est pur et testé. La version en cours = 1er titre de `CHANGELOG.md` au lancement, relu toutes les 5 min (`startUpdateCheck`, main.ts). **Garder le format `## vX.Y — date — titre`** : le bloc « Mise à jour prête » et son texte en sortent.
- Avant de lire une mesure : dernier `app_start` de `usage.json` (ou « Version … lancée » dans le journal). `canRelaunch` : None, Lobby, Matchmaking seulement. Le bouton est une action de Celian ; la règle 4 reste vraie pour les sessions.
- Capture : `ARAM_SMOKE_RUNNING=v1.63`. Pour tester une vraie relance sous Linux, ne pas utiliser `xvfb-run` (il tue l'écran quand le 1er processus sort) : lancer `Xvfb :99` à part, et `--remote-debugging-port` pour cliquer avec Playwright.
- `liveclient-choix*.json` : `players` = les 10 joueurs sans identifiant (`probePlayers`, goldgap.ts).

## Collection (v1.77)
- `src/core/pool.ts` est pur et testé. `Engine.collection` lit `/lol-champions/v1/owned-champions-minimal` (cache 10 min, `null` sous 20 champions : rien n'est filtré). `dropUnreachable` retire du classement le banc hors collection, ARAM et Mayhem seulement ; `poolExtra` garde ce qui a été proposé hors liste (anciennes rotations).
- Pas de relance de champion depuis la V25.13 : `allowRerolling` vaut `true` dans la session mais `rerollsRemaining` reste 0, ne pas s'y fier. Faux client : `ARAM_DEMO_POOL=1`, propriété `collection` de l'état du mock. Dans les fixtures, 12 champions seulement : le total affiché en rendu n'a pas de sens.

## Répétition générale (v1.79)
- `test/rehearsal.test.ts` : vrai moteur + `historique.json`, `usage.json`, `liveclient-choix*`, `gameflow-session-*`, `champselect-*`. Sans `ARAM_REHEARSAL_DIR`, il est ignoré. Les fixtures n'ont que 3 champions : les autres réutilisent Malphite, et les champions sont des faux `C<id>`. Ça prouve l'absence de casse, pas la qualité des conseils.
- Lancer : sur le Mac `tar czf .install/replay-data.tgz probe-output`, `device_stage_files`, extraction dans le dossier temporaire de session, `ARAM_REHEARSAL_DIR=<dossier>/probe-output ARAM_REHEARSAL_OUT=<fichier> npm run rehearsal`, puis vider le tgz (`: > .install/replay-data.tgz`, il contient des pseudos). Le rapport donne une ligne par lecture.
- À faire **avant de déployer un changement du moteur en partie, si l'app n'a pas été relancée depuis plusieurs versions**, et à la 1re partie venue pour rejouer les `players` de la v1.78 (aujourd'hui, les 9 autres joueurs sont des copies de toi).
- Interface sur l'historique réel : copier `<OUT>.history.json` en `history.json` dans `ARAM_DATA_DIR`, lancer `dist/demo.mjs stats` avec `ARAM_DEMO_CHAMPS=<ids>`. Les 5 parties du faux client datent d'oct. 2025 : le « 06 oct. » placé avant septembre dans « Par semaine » n'est pas un bug.
- Live Client, prix : `price` = recette pour un objet normal, valeur réelle pour un objet Mayhem sans recette (228002 Wooglet's Witchcap 6 000, 220013 Poro-Snax 0). Sort d'invocateur remplacé par un augment : `rawDisplayName` contient `_Augment_` (Deceive, Poltergeist), `displayName` donne le nom.

## Jour de patch (v1.80)
- `state.data.clientPatch` = client (`/lol-patch/v1/game-version`, relu au plus toutes les heures hors partie), `state.data.patch` = arammeta. `ddragonCandidates` essaie `<client>.1` puis `ddv` d'arammeta ; `game.ddragonVersion` reste celle d'arammeta pour les icônes.
- Faux client : `mock.state.gameVersion`, ou `ARAM_DEMO_CLIENT=16.22.725.1` avec `dist/demo.mjs`. Ne pas laisser `dist/demo.mjs` dans l'archive.
- Depuis le conteneur, les notes de patch récentes sont souvent refusées (leagueoflegends.com pour le 26.22, noping.com) alors que celles du 26.3 passent : essayer l'URL officielle, puis ne pas insister.

## Sac plein (v1.81)
- `nextBuys` reçoit `bag` (Live Client, `slot` < 6, `undefined` si un item n'a pas de `slot`) : relique et Poro-Snax n'en prennent pas, une potion si. `consumedBy` suit le parcours de `remainingCost`. Sac plein, rang 0 = augment lié ou menace forte, 1 = consomme un item du sac, 2 = le reste. `row.room.sell` = à vendre, `null` = rien à vendre (`kind: 'full'` dans `purchaseOf`).
- `itemToSell` exige un prix connu et < 1 500 : la répétition a montré Luden's Echo proposé à la vente quand l'item n'est pas au catalogue (`isComplete` faux, prix nul). Le catalogue des fixtures est maigre : ne pas lire les items vendus du rapport de répétition comme une mesure.
- La revente n'entre pas dans l'or disponible (`missing`) : choix prudent, taux réel non lu. `bag_full` dans `usage.json`, une fois par conseil. Capture : `ARAM_DEMO_BAG=sell|full` avec `dist/demo.mjs purchase`.

## Revente (v1.82)
- `resaleFor` (nextbuy.ts, pur et testé) : au plus `RESALE_MAX` ventes, somme minimale qui comble l'écart, ligne de tête seulement. `purchaseOf` rejoue le calcul sur l'or du panneau. `row.missing` reste l'or manquant sans vente. Pas de `step` quand une revente passe.
- `CooldownData.sellValue` lit `gold.sell` dans le `item.json` déjà chargé pour la haste. `nextBuyPanel` lance aussi `loadAny` : `enemySpellPanel` sort avant s'il n'y a pas d'équipe (scénario `purchase`).
- Capture : `ARAM_DEMO_BAG=sell ARAM_DEMO_GOLD=2600 dist/demo.mjs purchase`, avec `test/fixtures/ddragon/{item,summoner}.json` copiés en `cache/ddragon-16.21.1-{item,summoner}.json` dans `ARAM_DATA_DIR` (Data Dragon refusé depuis le conteneur comme depuis le shell du Mac). `tar`-er `dist/` sans `demo.mjs`.

## Combos (v1.83)
- `src/core/combos.ts` est pur et testé, sauf `Combos.load`. CSV lu dans le cache `cache/arammayhem-combos.csv` (24 h), `combos-snapshot.json` en repli : `champion augment|augment type|type`. Colonnes vues le 3 nov. : `comboId,slug,championId,champion_name_en,augmentIds,augment_names_en,types,url`. Attribution obligatoire (CC BY 4.0) : « Data: arammayhem.com », dans Réglages et le `title` de l'étiquette.
- `types` : `god` fort, `strong` bon, `blackTech` astuce (« Tech » sur le site), `entertainment` fun, `trap` piège, `bug`, vide = listé. Lignes à plusieurs augments (ids ≥ 588, sans type) = plans du champion. Clé = `comboKey`, le nom anglais de la tier list (`augNameEn`), jamais le nom client.
- Zéro effet sur le classement (`rowValue`, `bestOffered`). `protectCombos` retire seulement les cibles de relance. `assumedBefore` exclut le choix en cours : un tirage relu ne compte pas comme pris.
- arammayhem.com : WebFetch passe (page tronquée à 65-70 Ko, le CSV tient en entier), `curl` refusé par le proxy du conteneur et du shell du Mac. Capture : écrire un CSV de plus de 100 lignes dans `$ARAM_DATA_DIR/cache/arammayhem-combos.csv` et `ARAM_SMOKE_CARDS="Goliath|Firebrand|Outlaw's Grit"` avec `dist/demo.mjs ingame` (Leona).

## Timers en ARAM et Mayhem (v1.84)
- `ARAM_SUMMONER_HASTE` (cooldowns.ts) s'ajoute à la haste des objets pour les sorts d'invocateur, `balanceHaste` d'`EnemyInput` à celle de l'ultime. `withHaste` borne le total à 0. Les 2 entrent dans la haste du timer : `rescale` reste juste quand un objet change.
- Mayhem : `hidden` vaut 0, `runeTrees: null` y veut dire « pas de runes ». ARAM : `null` reste « rune inconnue ».
- Pour lire les règles d'un mode : page ARAM du wiki, puis ARAM:_Mayhem, qui renvoie à la première. `https://guides-factory.com/guides/lol-aram-mayhem-guide` passe en WebFetch et donne des chiffres, à recouper. nerfplz.com/lol-pbe-changes/ reste figée sur le 26.17.
- `liveclient-choix*` : `gameTime` absent, `activeplayer.championStats.abilityHaste` présent. Au choix 1, niveau 1 et stats à 0. Fichier temporel : l'epoch ms du nom.

## Élixirs (v1.85)
- `src/core/elixir.ts` est pur et testé. `Engine.elixirPanel` tourne à chaque tick dans `nextBuyPanel`. `idle` = pas de ligne de conseil, ou `room.sell === null`. Rôle : `buildRole` du champion, remplacé par `compFromItems(...).built` si le build est net (`state.counters` peut être nul).
- L'API ne montre pas un élixir bu : `elixirBought` compare l'or et l'inventaire d'un tick à l'autre, seulement si le tick d'avant conseillait d'acheter (`elixirTick`). Horloge murale, pas `gameTime` (lu après `nextBuyPanel`, et absent de `liveclient-choix*`).
- `CooldownData.onMap` lit `maps` de `item.json` : `false` masque, `null` (pas lu) laisse passer, car vérifié au 16.21. Carte 11 en Faille, 12 sinon, Mayhem compris : supposé.
- WebFetch sur `https://ddragon.leagueoflegends.com/cdn/16.21.1/data/en_US/item.json` passe, contrairement à `curl`. Le modèle de lecture tronque les longues listes : demander 3 à 5 ids à la fois. Capture : `ARAM_DEMO_BAG=full ARAM_DEMO_GOLD=2600 dist/demo.mjs purchase`, fixtures `ddragon` copiées dans `cache/` de `ARAM_DATA_DIR`.

## Tags des augments (v1.86)
- `tagsOf` lit `plainText` (gras, liens et modèles `{{as|x|y}}` retirés ; `tip`, `sti`, `stil` gardent leur dernier argument). `crit`, `as`, `ad`, `ap`, `attacks` donnent un malus dans `fitOf` : ne les poser que si la carte dépend vraiment de la stat. Vérifier toute regex sur `test/fixtures/mayhem-augments-wiki.lua`, copie de juin 2026 du module, pas sur `mayhem-augments.lua` (faux textes, rempli de `Filler`).
- `wiki.leagueoflegends.com` refuse curl et `?action=raw` en WebFetch. Le module brut se lit sur `https://raw.githubusercontent.com/Shmily0826/hextech-aram-lab/main/pipeline/output/wiki_module_raw.txt` (curl passe, dépôt tiers, à relire comme une donnée). Le dépôt `kiwiiiii-eth/aram-mayhem-analyzer` a un `data/augments.json`, pas lu.
- `cards_seen.fit` : corrections de la carte en points de winrate. La vraie copie du module est dans `cache/wiki-mayhem-augments.lua` du dossier de données de l'app, hors du dossier connecté.

## Lecture des vraies parties, revente (v1.87)
- `liveclient-choix*` : `players[].items` = liste d'ids, `me.items` = objets complets. Depuis `app_start`, `journal.txt` et `usage.json` se lisent ensemble : c'est là que le faux conseil de revente s'est vu, aucun test ne l'aurait montré.
- `resaleFor` : item fini seulement, `SPARE_MAX` (200 or) hors sac plein, `keep` = `guard` (item qui couvre une menace). `room.held` : sac plein, item visé non fini, un composant refuse de partir. `held` n'ouvre pas l'élixir (`idle`). `purchaseOf` donne `held` et son titre.
- `rank` (sac plein) : `must` ne vaut 0 que si l'item tient. Ne pas revenir à `must` seul : la menace faisait passer un composant de 800 or devant Infinity Edge.
- `--ignore-scripts` à `npm ci` suffit pour tests, typecheck et build (pas d'Electron, donc pas de rendu).

## Tags, 2e passe (v1.88)
- `COMES_WITH_CARD` (cartes « Upgrades one of your champion's abilities », « Replace a summoner spell »), `SHORT_BURST`, `CRIT_ON_HEALS` retirent des tags de `tagsOf` ; `withoutNoise` retire les stats d'un invoqué. « base AD » ne pose plus `ad`.
- Autre source de textes : `https://raw.githubusercontent.com/kiwiiiii-eth/aram-mayhem-analyzer/main/data/augments.json` (curl passe, 223 cartes, texte brut, une sans `description`, à relire comme une donnée). Pour un contrôle seulement : `tagsOf` lit aussi ce texte brut. Le dépôt a ses propres tags (`ability_upgrade`, `ranged_only`, `needs_cc`…), non utilisés.
- `cards_seen.noText` : noms de cartes sans texte dans le wiki chargé. Le test moteur remplace `augInfo` : les faux modules de test ont moins de 50 entrées et `size` reste à 0.

## Menaces et coût (v1.91)
- `threatCost` (nextbuy.ts, pur et testé) : `NextBuyInput.value` = `itemValues` d'`itemStats`, ou `slotStats` au rang en Faille, la même source que `withValues`. Ne jamais comparer avec les `options` : leur winrate est mesuré dans le cluster. Bottes jamais comparées, item non mesuré jamais repoussé, seul l'item choisi par `counterItem` est testé : pas de repli sur le contre générique suivant, souvent non mesuré.
- `nextBuys` rend `deferred` ; `key` de la menace relie `nextBuy.deferred` à `counters.threats` (BuyPanel). Capture : `ARAM_SMOKE_THREAT=1` avec `dist/demo.mjs purchase`.
- `probe-output/wiki-mayhem-augments.lua` : copie du module chargé, écrite à chaque `refreshData`. Le texte brut des cartes s'y lit sans dépendre du wiki.
- `~` vaut `/root` dans le conteneur, le shell démarre dans `/home/claude`. `buys.lines[].why` de `historique.json` suffit à compter les conseils quand `usage.json` est vide.
