# Feuille de route

Critère unique pour ajouter une fonction : **est-ce que ça fait gagner des parties à Celian, sur Mac, dans un mode 5v5 ?**
L'app couvre l'ARAM, ARAM: Mayhem et la Faille de l'invocateur (classée, normale, Swiftplay), à la demande de Celian.

Prendre le premier item non coché de la priorité la plus haute, sauf s'il est bloqué. Chaque item a sa
« preuve de fini ». Ajouter en bas ce qu'on découvre.

## Ce qui existe (v1.61)

Champ select (cartes + banc classés, compo, synergies, stats perso, prendre en un clic) · import runes / sorts /
item set · onglet Build avec icônes (runes, sorts, 3 builds à 2 items + 3e item, bottes) · augments par rareté avec
tes stats perso · fenêtre second écran / overlay · notifications champ select · Mes stats · Historique (filtres,
KPI, forme, détail des 10 joueurs) · items contre l'équipe adverse · badges d'équilibrage ARAM · acceptation auto · stats adversaires / alliés / duos · winrate par semaine et par rang dans la session · export de l'historique · pièges d'augments, types d'augments, autres items gagnants · pool complet d'augments avec recherche · rechargement au changement de patch · ⌘⇧S · prochain achat (or + items via Live Client, composant achetable) · page champion perso · bilan de la dernière partie · headliner Mayhem reconnu en partie (bannière / cartes) avec conseils.

## Priorité 0 — valider sur les vraies parties (avant toute nouvelle fonction)

Beaucoup de fonctions v1.10 → v1.23 n'ont été testées que contre le faux client. À chaque session :
- [x] (v1.53, 29 oct.) Captures `probe-output/` vérifiées (11 parties Mayhem) : `gameData.teamOne/teamTwo`
  (puuid, championId), `activeplayer.level`, `currentGold`, `riotId` existent sous ces noms. **Aucun champ
  headliner** : gameflow (`map.gameMutator` et `queue.assetMutator` vides), champ select et Live Client
  (`gamestats` : gameMode KIWI, mapTerrain Default ; sorts « Mark/Flash » inchangés) → le headliner ne se lira qu'à
  l'écran (OCR) ou après coup (augments marqueurs).
- [x] (v1.53) `historique.json` : 119 parties, les 66 détaillées ont `items`, `allies`, `allyNames`, `enemies`.
  Échantillon trop petit pour régler les seuils (pièges, contre-équipe, maîtrise) : à refaire à 150 parties
  détaillées. Parties à 5 augments (9) en plus des 7 Pentakill (6 augments, marqueur 3176) : sans doute K/DA
  (augment en plus) — à confirmer avec une partie où le headliner est noté.
- [x] (v1.53) `champselect-*.json` : `myTeam[].gameName/tagLine` présents ; `trades[]` = `{cellId, id, state}`
  (seul state vu : INVALID).
- [x] (2 nov.) **Lecture des cartes mesurée sur les vrais choix, pas sur les captures** : 47 des 51 augments réellement
  pris (13 parties Mayhem depuis la v1.39) ont eu une lecture complète ; sur 53 tirages, 48 ont fini complets, délai
  médian 2 s. Les « 58 sur 173 » comptaient chaque capture, dont celles prises pendant l'animation des cartes et les
  lectures d'une seule carte en plein combat (filtrées depuis). **Ne pas relancer de chantier OCR sur ce chiffre.**
  Reste 4 choix non couverts : 2 sur la 1re partie (`championId` 44 dans `usage.json`), 2 sur des
  parties à 5 augments (l'augment en plus n'a sans doute pas son propre `round`, voir `offersThisGame`).
- [ ] Noms jamais reconnus : « Stats on Stats on Stats! », « Anti-Magic », « Magical Opus » (absents de la page
  ARAM: Mayhem/Augments du wiki le 2 nov. : sans doute pas de vrais augments Mayhem à chaque fois, à confirmer avec
  `cherry-augments.json` sur le client). Priorité basse : 3 textes sur 195 lectures.
- [ ] Parties à 5 augments : enregistrer aussi le choix en plus dans `card_picked`.

### Constats sur l'historique réel (28 oct., 108 parties Mayhem, 55 détaillées)
- **Headliner visible après coup** : les parties Pentakill ont un augment marqueur **3176** (nom client
  « GoH_PentakillAug_Generic_BlankName ») + un choix parmi HEAVY 3170 / POWER 3171 / THRASH 3172 (6 augments au lieu de
  4). Les autres headliners ont sans doute un marqueur `GoH_*Aug*` du même type → `GameData.isHeadlinerMarker`.
  En direct, rien encore : à chercher dans les captures `probe-output/` (une partie Pentakill suffit).
- Le winrate global du champion prédit ses résultats : 60 % (35 parties, champion ≥ 52 %) contre 42 % (33, < 49 %).
  → le poids du winrate dans le score du champ select est justifié ; ne pas le réduire.
- Pas d'effet fatigue visible selon le rang dans la session (1re 55 %, 5e et + 58 %).
- Morts moyennes identiques en victoire et en défaite (13,3 / 13,4) : les morts ne sont pas un bon indicateur en
  Mayhem ; ne pas en faire un conseil.

### Interface (v1.37)
Navigation par moment : `views/NowView.vue` (Home / ChampSelectView / `ingame/InGameView.vue`), `PrepareView`,
`GamesView`, `SettingsView`. En partie, tout passe par `ingame/AugmentChooser.vue` (liste unique) + `NextBuy` +
`Counters`. La fenêtre second écran et le téléphone affichent `InGameView`. Les anciennes vues `AugmentsView.vue`
et `AugmentFinder.vue` ne sont plus utilisées (peuvent rester sur le Mac, `rm` interdit).
Règle visuelle : le liseré prismatique (`--prism`) est réservé à LA recommandation (meilleur augment, décision du
champ select). Ne pas l'utiliser ailleurs.

## Priorité 1 — ce que les concurrents font et qui manque

- [x] (v1.60) **Revue des choix d'augments** (`src/core/review.ts`, `ui/ReviewPanel.vue`) : note chaque décision avec les
  stats globales, ne juge jamais une carte estimée. Limite : ça mesure l'écart aux stats, pas la meilleure décision réelle.
- [ ] À relire après 10 parties : la part de « coûteux » est-elle crédible ? Si presque tout est « proche », revoir
  `MIN_LOST` / `CONFIDENCE_Z` (review.ts).
- [ ] Revue des achats : `item_bought` garde le conseil mais pas sa valeur en winrate, à enregistrer d'abord.
- [ ] **Conseiller de reroll** : espérance de gain de relancer une carte. Étape 1 : mesurer les vraies règles et
  probabilités de tirage ; ne pas inventer de chiffre. Aucun concurrent ne l'annonce (comparatif Hexgate, 2 nov.).
- [ ] Augments nouveaux au patch : LLM local (Ollama) sur description + kit. À faire seulement si un test à stats
  cachées bat les mots-clés d'`augfit.ts`.
- [ ] Simulateur de dégâts sur les 3 cartes : limiter aux augments chiffrés ; gros coût de maintenance, à décider avec Celian.
- Pas de payant pour l'instant, décision de Celian (2 nov.) : pas d'API LLM facturée.

- [x] **Items situationnels selon l'équipe adverse** (v1.6, via `/lol-gameflow/v1/session` teamOne/teamTwo plutôt que la Live API ; seuils calibrés sur 173 champions : anti-soins ~35 % des parties) (Hexgate le fait). En partie, la Live Client Data API
  (`https://127.0.0.1:2999/liveclientdata/allgamedata` → `allPlayers`) donne les 10 champions. Calculer le profil
  adverse (part AD/AP, soins, tanks, CC) depuis les tags/stats des champions (CDragon champion data ou arammeta
  `comp`) et ajouter à l'onglet Build / fenêtre second écran : « anti-soins conseillé (Soraka, Aatrox…) »,
  « 3 sources AD → armure », etc., avec les items correspondants (icônes). Preuve : test moteur avec un faux
  `allgamedata` + capture de la fenêtre.
- [x] ~~Sets d'augments Mayhem~~ : **abandonné**, les sets ont été retirés de Mayhem au patch 16.12 (source : tests du dépôt ARAM-Mayhem-Database, `test_legacy_augment_sets.py`). Les guides qui en parlent sont périmés.
- [x] **Modificateurs d'équilibrage ARAM par champion** (v1.6 — confirmé sur le Mac : le wiki est lu en direct, 161 champions. Le wiki n'a peut-être pas de table Mayhem distincte : les valeurs Mayhem ont un peu divergé depuis le 26.15, ex. Ahri soins, Ekko dégâts) (dégâts infligés/subis, soins, accélération) affichés au
  champ select à côté de chaque carte. Source : wiki LoL (`Module:ChampionData/data`, champ `stats.aram`) ou
  CDragon. Cache 24 h, repli silencieux. Preuve : test de parsing + badge visible dans le champ select.
- [x] **Acceptation automatique de la partie** (v1.6) (option, désactivée par défaut) :
  `POST /lol-matchmaking/v1/ready-check/accept` quand la phase est `ReadyCheck` et la file ARAM/Mayhem. Preuve :
  test mock.

- [x] (v1.8) **Types d'augments par champion** (Mayhem) : arammeta `champions/{id}.json` → `augTypes.top/bot`
  (ex. « Ability Power » sur Jinx, avec wr, lift, g). Afficher dans l'onglet Augments et la fenêtre second écran :
  « types qui marchent / à éviter » — utile quand aucun des 3 augments proposés n'est dans le top. Preuve : fixture
  + capture.
- [x] (v1.8) **Items seuls les plus gagnants** (Mayhem) : `singleItems.top` (déjà dans le détail arammeta, slug = id).
  Section compacte dans Build, sous les builds à 2 items, en excluant ceux déjà affichés. Preuve : test + capture.
- [x] (v1.8) **Augments du pool du champion** : `poolAugments` (wr, pick) → marquer dans l'onglet Augments ceux qui sont
  très choisis mais perdants (pick haut, wr bas) : « piège fréquent ».

- [x] (v1.10) **Prochain achat** via l'API Live Client (`activeplayer.currentGold`, `playerlist[].items`). À vérifier
  en vraie partie : correspondance `riotId` entre activeplayer et playerlist, prix (`priceTotal` de items.json du client).
- [x] (v1.11) **Composants** : quand l'item conseillé n'est pas achetable, proposer le composant le plus cher achetable
  (items.json du client : champ `from` = composants). Preuve : test sur un arbre d'items simulé.
- [x] (v1.56) J2 : les améliorations de composants déduisent les sous-composants possédés. Le conseil affiche
  l’achat immédiat et son coût de combinaison, distincts de l’objectif final, sur fenêtre / téléphone / overlay
  (dont minimal). Régressions moteur et recettes ; scénario Electron `test/purchase-smoke.cjs`.
- [x] (v1.11) **Bilan de fin de partie** : à la fin, comparer la partie à ta moyenne sur ce champion (dégâts/min, morts,
  KP) et afficher 2-3 constats dans Mes stats (« 40 % de dégâts en moins que d'habitude sur Jinx »).
- [x] (v1.11, comparaison arammeta en v1.21) **Page champion perso** : clic sur un champion dans Mes stats → tes parties dessus, tes augments et items avec
  leur winrate perso, comparés aux stats globales arammeta.

- [x] (étapes 1 et 2 faites, v1.53 / v1.55 ; la suite est dans les items ci-dessous) **Headliners Mayhem (patch 26.21, « Journey to Stardom »)** : un headliner par partie (K/DA : cartes → augment
  en plus ; HEARTSTEEL : augments avec modificateurs ; True Damage : enclumes ; Pentakill : sort renforcé au début
  et niveau 18 ; Disco / Space Groove : or sous la boule disco ; Cafe Cuties : reliques de soin renforcées ; Bees ;
  Command Line : le 1er reroll de chaque choix monte la rareté). Étape 1 : lire les fichiers
  `probe-output/gameflow-session-*.json` et `probe-output/liveclient-*.json` (écrits par l'app en partie Mayhem depuis v1.12 / v1.15) pour trouver le champ du
  headliner (mutators, gameData…). Étape 2 : afficher le headliner et 2-3 conseils dans la fenêtre second écran
  (ex. Command Line → « reroll une carte Or pour viser du Prismatique »). Ne pas inventer le champ : sans capture, ne
  rien faire. **Étape 1 faite (v1.53) : aucun champ dans le client ni la Live API.** Reste : lire le headliner à
  l'écran (bannière de début de partie / cartes HEAVY-POWER-THRASH via l'OCR existant), ou au minimum l'afficher
  après coup dans l'historique (marqueur 3176 = Pentakill ; 5 augments = K/DA probable).
  **Étape 2, 1re tranche faite (v1.55)** : `src/core/headliner.ts` — nom lu à l'écran (ligne exacte, sans « ! »),
  cartes Pentakill 3170-3173, conseils dans `InGameView` (bandeau), enregistré dans `HistoryGame.headliner` ;
  « K/DA (probable) » = 5 augments depuis le 21 oct.
- [ ] **Headliner : vérifier en vraie partie** (29 oct. soir : 1 sur 2 — « Space Groove » lu 5 s après la
  détection de la fenêtre, partie Nasus ; rien sur la partie Hwei, aucun faux headliner. v1.59 : tolérance d'une
  lettre (noms ≥ 9 lettres), « Bees » seul pendant les 90 premières secondes hors écran de cartes, et événement
  `headliner_miss` (lectures + textes approchants) dans `usage.json` / journal → à relire : si les ratés n'ont
  aucun texte approchant, la bannière est hors de `cardsArea()` ou finie avant la 1re lecture.) Critère : bannière lue (journal « Headliner : … lu à l'écran »,
  `usage.json` → `headliner_seen`). Si rien en 5 parties Mayhem : la bannière est hors de `cardsArea()` ou
  disparaît avant la 1re lecture → capturer le haut de l'écran les 20 premières secondes. Vérifier aussi qu'aucun
  faux headliner n'apparaît (texte du chat). Confirmer K/DA = 5 augments sur une partie où la bannière est lue.
- [ ] Headliner : compter dans « Mes parties » le taux de lecture (headliner_seen / parties Mayhem depuis v1.55)
  une fois 10 parties avec `headliner_miss` possible — pour savoir s'il faut agrandir la zone lue.
- [ ] Headliner, tranche suivante : conseils propres au headliner dans le classement (Command Line : signaler la
  carte à reroller ; HEARTSTEEL : bonus des augments) — seulement une fois la lecture validée.
- [x] (v1.13) **Augments nouveaux du 26.21** (35 ajouts) : peu de parties dans arammeta. Les signaler « nouveau, peu de
  données » (g < 300) plutôt que les classer comme les autres.

- [x] (v1.16) **Panneau sur téléphone** (serveur HTTP local lecture seule + QR code). À vérifier sur le vrai
  réseau : pare-feu macOS, IP détectée (`lanAddress`), affichage iPhone/Android.

- [x] (v1.17) **Winrate par moment du choix** (arammeta `slots` : par champion dans `top/bot`, global dans
  `tier-list.augs[].slots` = [g, wr, lift, exact]). Choix détecté via `activeplayer.level` (1 + niv≥7 + niv≥11 + niv≥15).
  À vérifier en vraie partie : que `level` est bien présent dans activeplayer.

- [x] (v1.19) **Échanges avec les alliés** (`session.trades[]` state AVAILABLE → POST `/lol-champ-select/v1/session/trades/{id}/request`).
  À vérifier sur le vrai client : format de `trades` et réponse du POST.

## Priorité 2 — tirer plus des données perso

- [x] (v1.7) Dans l'historique : stats par **coéquipier récurrent** (duo) et par **champion adverse** (contre qui tu perds).
  Nécessite d'enregistrer les noms des alliés (déjà dans le détail des 10 joueurs) dans `HistoryGame`.
- [x] (v1.7, sans l'heure de jeu) Courbe de winrate dans le temps (par semaine) et winrate par **heure de jeu** / longueur de session (tilt).
- [ ] « Tes meilleurs champions Mayhem » utilisés comme bonus dans le classement du champ select (déjà partiel via
  `personal`) : vérifier le poids sur les vraies données. **29 oct. (119 parties Mayhem, 75 champions)** : les
  champions reviennent rarement (cartes aléatoires) ; seules 8 parties avaient ≥ 3 parties antérieures sur le
  champion (seuil du bonus), 44 en avaient ≥ 1 (bilan perso ≥ 50 % : 16V/30 ; < 50 % : 6V/14). Impossible de
  conclure : garder le poids actuel (0,5, lissage 5 parties) et refaire vers 300 parties.
- [x] (v1.7) Export / sauvegarde de `history.json` (bouton) — les données perso n'existent que là.

- [ ] **Poids de la maîtrise** : quand l'historique local aura assez de parties (≥ 150), mesurer si ton winrate
  dépend de la maîtrise (jamais joué / < 50 k / ≥ 50 k) avant de l'ajouter au score. Sinon laisser en affichage.

## Priorité 3 — confort

- [x] (v1.58) Fiabilité des transitions : `Engine.readContext()` (n° de situation + champion + choix) pris avant
  chaque capture, lecture jetée si périmée (`isCurrentRead`, setOffered / setHeadliner) ; boucle du moteur
  numérotée (`loopGen`), plus de reprise après `stop()`. Tests : `test/engine-loop.test.ts` + scénario moteur.
  À surveiller en vraie partie : « Lecture des cartes ignorée » dans le journal ne doit apparaître qu'aux
  transitions (si elle apparaît à chaque choix, le contexte change trop souvent → retirer le choix du contexte).
- [ ] Empaqueter l'app (⚠ modifier l'Info.plist d'Electron casse sa signature : sur Mac Apple Silicon il faut re-signer avec `codesign --force --deep -s -`, ce qu'on ne peut faire que dans un Terminal du Mac, pas depuis le shell Linux. Nécessite Celian ou la commande à distance de l'ordinateur) (nom « ARAM Companion » dans le Dock au lieu d'« Electron », icône) avec electron-builder,
  sans signature (usage perso). Garder le lanceur actuel tant que ce n'est pas validé.
- [x] (v1.9) Mise à jour des données arammeta automatique au changement de patch (comparer la version du client).
- [x] (v1.9) Raccourci global pour afficher la fenêtre second écran (⌘⇧S).

## À trancher avec Celian (ne pas faire sans son accord)

- (rien en attente)

## Lecture des cartes d'augments (validée par Celian le 28 oct. 2026, voir docs/ux-discovery/)

- [x] (v1.55) J1 : cartes reconnues avant les filtres, position dans le jeu conservée après classement, lecture
  partielle sans classement, accès manuel conservé. L’achat ne concurrence plus le cadre des augments en vue
  large. Régressions de présentation et scénarios Electron dans `test/augment-chooser-smoke.cjs` (fixtures).
  Reste à mesurer la rapidité de décision et à vérifier le rendu sur le vrai setup macOS.
- [x] (v1.39) Capture de la fenêtre du jeu + Vision (JXA) + correspondance stricte (`src/core/cardmatch.ts`), cartes
  en tête de la vue en jeu, notification « Prends … », télémétrie locale `probe-output/usage.json`.
- [x] (28 oct.) Autorisation accordée ; capture + Vision validées sur le Mac (« Tester la lecture » : 28 lignes lues, accents compris).
- [ ] **À valider en vraie partie** : la capture marche-t-elle en plein écran ? les 3 titres sont-ils reconnus ?
  Regarder `probe-output/usage.json` (`cards_seen` avec `unsure`, `ocr_miss` = textes presque reconnus) et ajuster
  `cardsArea()` (electron/cardreader.ts) et `MATCH_MIN` (cardmatch.ts) en conséquence.
- [ ] Indicateur principal (Mes parties → « Reco d'augment suivie ») : relire après 30 choix suivis.
  Au 29 oct. : 41 choix, 28 suivis (8 gagnés), 13 non suivis (4 gagnés) — trop tôt pour conclure. Achats : 25
  conseils suivis sur 47.
- [x] (v1.53) Titres coupés au bord (« th Haste », « n College », « Jinxed ») et titres lus en deux morceaux côte à
  côte reconnus (`partialName`, cardmatch.ts), seulement en complément d'un nom entier.
- [ ] Plus tard : rareté et headliner lus à l'écran ; aide au reroll.

## Écarté

- Timers (relics, sorts ennemis), lecture mémoire, scripts de gameplay : interdits par Riot.
- Clips vidéo des morts (Hexgate Pro+) : lourd, peu de valeur pour gagner.
