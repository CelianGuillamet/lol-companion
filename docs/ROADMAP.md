# Feuille de route

Critère unique pour ajouter une fonction : **est-ce que ça fait gagner des parties à Celian, sur Mac, dans un mode 5v5 ?**
L'app couvre l'ARAM, ARAM: Mayhem et la Faille de l'invocateur (classée, normale, Swiftplay), à la demande de Celian.

Prendre le premier item non coché de la priorité la plus haute, sauf s'il est bloqué. Chaque item a sa
« preuve de fini ». Ajouter en bas ce qu'on découvre.

## Ce qui existe (v1.88)

Champ select (cartes + banc classés, compo, synergies, stats perso, prendre en un clic) · import runes / sorts /
item set · onglet Build avec icônes (runes, sorts, 3 builds à 2 items + 3e item, bottes) · augments par rareté avec
tes stats perso · fenêtre second écran / overlay · notifications champ select · Mes stats · Historique (filtres,
KPI, forme, détail des 10 joueurs) · items contre l'équipe adverse · badges d'équilibrage ARAM · acceptation auto · stats adversaires / alliés / duos · winrate par semaine et par rang dans la session · export de l'historique · pièges d'augments, types d'augments, autres items gagnants · pool complet d'augments avec recherche · rechargement au changement de patch · ⌘⇧S · prochain achat (or + items via Live Client, composant achetable) · page champion perso · bilan de la dernière partie · headliner Mayhem reconnu en partie (bannière / cartes) avec conseils · revue des augments, des relances et des achats · conseiller de reroll · options d'achat Faille au rang de l'item · bans conseillés · prochain sort à monter en partie, tous modes en Faille · achat et notation des augments liés à un item (Upgrade …) · Superfans (26.22) et tirages hors paliers lus · timers des sorts ennemis (ultime + invocateur), démarrés à la main · écart d'objets · build qui suit les augments entre builds proches · sac plein (quoi vendre, quoi terminer) · revente comptée dans l'or · combos et pièges connus sur les cartes · élixir quand le build est fini.

## Priorité 0 — valider sur les vraies parties (avant toute nouvelle fonction)

**Avant de lire une mesure, vérifier la version qui tournait** (dernier `app_start` de `usage.json`). **Relance le 3 nov. à 14 h 41 UTC, en v1.86** : les items « après N parties » ci-dessous comptent à partir de là (2 parties à la v1.87 : Tahm Kench 8034657052 défaite, Jhin 8034673285 victoire).

Beaucoup de fonctions v1.10 → v1.23 n'ont été testées que contre le faux client. À chaque session :
- [x] (v1.79, 3 nov.) **Répétition générale** (`test/rehearsal.test.ts`, voir AGENT.md) : 136 parties sans perte, 25 revues d'augments et 22 d'achats refaites, 21 parties (89 lectures Live Client) et 27 champ select rejoués, interface parcourue sur l'historique réel, 0 erreur. Pris à la place d'une nouvelle fonction parce que cette section passe avant, que tous ses items attendent une partie, et que 16 versions s'appliqueront d'un coup. 2 écarts trouvés et corrigés : objets Mayhem sans prix, sorts donnés par un augment.
- [x] (v1.87, 3 nov.) Répétition avec les vrais `players` de `liveclient-choix*` : 23 parties, 97 lectures, 30 champ select, sans casse, 0 objet sans prix. Les joueurs sont placés par équipe (le nom n'y donne pas l'id) : les totaux sont justes, pas le champion de chaque ligne.
- [x] (v1.87, 3 nov.) **Lecture des 2 premières parties en version récente, qui a donné la correction de la revente** : 10 ventes conseillées, 7 sur un composant terminé dans les 5 min, 1 suivie au mieux (Giant's Belt, or +632, sac plein). Voir « Revente » plus bas.
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
  Les 4 choix non couverts sont expliqués (2 nov., v1.63) : 2 sur la 1re partie, avant que toutes les cartes du jeu
  soient reconnues ; 2 écrasés par le tirage suivant du même palier (corrigé).
- [x] (2 nov.) Noms jamais reconnus : **fausse piste**. « Stats on Stats on Stats! » est un vrai augment (id 1402,
  prismatique, 3 fois dans l'historique) ; « Anti-Magic » et lui datent de la 1re partie (28 oct. 15 h 30), avant que
  toutes les cartes du jeu soient reconnues, et n'ont plus été notés. « Magical Opus » : une seule fois, hors tirage,
  absent des 1res entrées de CDragon (liste complète non lisible d'ici). Rien à changer.
- [x] (v1.63) Parties à 5 augments : le choix en plus est gardé dans `card_picked` (`choice: 1`) et dans la revue
  (`src/core/offers.ts`). Le palier ne suffit pas à séparer deux tirages : ceux-ci n'ont aucune carte commune.
  **K/DA confirmé** : partie 8033630326, K/DA lu à l'écran, 2e tirage 207 s après le 1er au même palier ; 4 augments
  seulement car la partie a fini pendant le dernier choix. L'augment en plus arrive donc à n'importe quel moment.
- [ ] Après 5 parties K/DA : compter les lignes `choice: 1` de `card_picked`. Une ligne hors K/DA = cartes laissées
  ouvertes d'un palier à l'autre (règle à revoir). Ne pas déduire K/DA d'un 2e tirage tant que ce n'est pas mesuré. Depuis le 26.22, `choice: 1` au choix 4 peut aussi être l'augment du niveau 21 (Superfans).

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
- [x] (2 nov.) Revue relue sur 10 vraies parties (39 choix) : 31 meilleure carte, 5 proches, 1 coûteux, 2 non notés ; 13
  parties refaites après coup (47 choix) : 31 / 13 / 3. Pas « presque tout proche », et les 18 écarts « proches » vont de
  0,3 à 4,1 pts, tous sous le bruit ou sous 1 pt. `MIN_LOST` et `CONFIDENCE_Z` ne changent pas.
- [ ] Résistances urgentes (v1.61) : pas encore déclenchées, aucune des 3 parties du 2 nov. n'avait 60 % de dégâts d'un type.
- [ ] Synergie + compo plafonnées à 5 points (v1.62, choix prudent, pas une mesure). Après 100 événements `champ_scored`
  dans `usage.json`, comparer le winrate selon synergie + compo et ajuster `TEAM_BONUS_CAP` (advisor.ts).
- [x] (v1.62) Conseil d'achat gardé tant que l'inventaire ne change pas (option `keep` de `nextBuys`).
- [x] (v1.64) Revue des achats (`src/core/buyreview.ts`, `ui/BuyReviewPanel.vue`) : `item_bought` garde la raison et les
  winrates ; verdicts suivi / plan / contre leur équipe / proche / coûteux.
- [ ] Revue des achats, couverture : après 20 parties, compter dans `item_bought` les achats hors plan avec `value` et
  `recoValue`. Si c'est rare (`singleItems.top` = 6 items par champion dans les fixtures), chercher une autre source
  comparable. Ne pas mélanger avec les `options` des clusters : leur winrate est mesuré dans le cluster, pas sur le champion.
- [x] (v1.67) Revue des achats en Faille : winrates OP.GG au même rang (`fourth_items`, `fifth_items`, `sixth_items` → `BuildPanel.slotStats`),
  et le conseil classe ses options au rang à acheter (`optionsForSlot`, nextbuy.ts). Rien avant le 4e item.
- [x] (v1.69) **Bans conseillés Faille** (`src/core/bans.ts`, section en tête de `SrSelectPanel`, bouton Survoler). Manque repéré le 3 nov. : l'app ne disait rien pendant la
  phase de ban, alors que Blitz, Mobalytics et consorts en font un service de base. Pris parce que tous les items au-dessus attendaient de nouvelles parties (aucune depuis le 2 nov. 19 h 42).
- [ ] Bans, vérifier sur une vraie draft ou classée : journal « · bans : … », `champselect-*.json` (aucune capture n'a encore de vraie action `ban`), et que Survoler
  marche pendant ton tour. Le PATCH sans `completed: true` suit l'usage connu de la LCU, pas une capture. Regarder aussi si `win` arrive dans `lol_list_lane_meta_champions` (cache 6 h).
- [ ] Bans, plus tard : ajouter tes bêtes noires (`vsEnemies`) une fois assez de parties Faille (3 en historique le 3 nov., toutes Swiftplay, sans bans). Ne pas compter le taux de ban : à 50 %, il ne change
  la chance de croiser le champion que de 10 % (raisonnement dans bans.ts). Ne pas élargir aux rôles dont l'allié n'a rien montré : le ban y vaut 0 en moyenne.
- [x] (v1.70) **Prochain sort à monter** (`src/core/skills.ts`, `ingame/SkillNext.vue`), tous modes : ordre OP.GG (`aram` pour ARAM et Mayhem) + rangs de `activeplayer.abilities`. Pris parce que tous les items au-dessus
  attendaient des parties avec une version récente, et qu'en Mayhem l'app ne donnait aucun ordre alors que Celian y joue 75 champions et plus. Mesuré sur 81 captures : Celian ne laisse jamais de point dormant (écart niveau − points = 1, l'instant du passage de niveau),
  donc le conseil porte sur **quel** sort, pas sur « mets ton point ».
- (v1.87) Prochain sort en vrai : `skills_taken` a un `plan` en Mayhem sur les 2 parties (Tahm Kench `off` 2, Jhin `off` 0).
- [ ] Prochain sort, vérifier en vraie partie : le bon sort ? OP.GG couvre-t-il tous les champions en `aram` ? Après 20 parties, lire `skills_taken` : si `off` reste près de 0,
  le conseil ne change rien, le passer en affichage replié. Si `off` est élevé, comparer le winrate selon `off` (à 60 parties minimum, même prudence que « Reco suivie »).
- [x] (v1.71) **Augments liés à un item** (`src/core/itembound.ts`) : « Upgrade X » n'améliore que l'item X, 16 de tes 133 parties Mayhem en ont un, et le conseil d'achat l'ignorait (Taric, 2 nov. : Upgrade Immolate conseillé, Hollow Radiance absent du plan, Celian l'a acheté seul). L'item passe en tête, la carte est notée selon le plan.
  Pris parce que tout ce qui est au-dessus attend des parties sur une version récente (aucune depuis la v1.69, app non relancée depuis le 2 nov. 16 h 55 UTC).
- [ ] Augments liés, vérifier en vraie partie : aucun champ ne dit l'augment pris avant la fin (`activeplayer`, `allPlayers`, captures du 3 nov.), l'app suppose la carte conseillée. Après 20 événements `item_bound` : part de `picked` faux (achat conseillé pour rien), `bought`. Si `picked` est souvent faux, chercher une lecture du choix à l'écran. Vérifier aussi `Upgrade Hubris` (id 6697 absent de la table des fixtures) et Ultra Hydra (effet déduit des notes 26.17-26.18, pas de texte lu ; partie 8027749531 sans hydra, perdue).
- [x] (v1.72) Augments liés, à compléter : Upgrade Cutlass = Spectral Cutlass, item 4004 de `itemLut` (le wiki décrit son actif Soul Anchor ; [seemeta](https://seemeta.com/en/lol/items/spectral-cutlass) le confirme). Nouvel « Upgrade X » signalé : journal + `bound_unknown`.
- [ ] Au 26.22 : lire `bound_unknown` dans `usage.json` et ajouter les cartes à `BOUND`. Le serveur de test n'ajoute aucun « Upgrade » (2 cartes : One Hit Wonder, RISE). Le texte du wiki se lit sur [ARAM_Mayhem/Augments](https://wiki.leagueoflegends.com/en-us/ARAM_Mayhem/Augments), les noms d'items y manquent : chercher le nom de l'actif.
- [x] (v1.72) Carte déjà vue à un choix précédent retirée d'une lecture complète (`ghostCards`, offers.ts). Mesuré sur 333 lectures : 1 cas complet (Giant Slayer, Caitlyn, 3 nov.), 6 cartes seules de possédés sur lectures partielles, déjà sans conseil.
- [ ] Carte déjà vue, vérifier : « Carte déjà vue retirée de la lecture » dans le journal doit rester rare et ne jamais toucher une vraie carte. Si ça sort sur des tirages complets répétés, la règle « une carte ne revient pas » est fausse (headliner ?) : retirer le filtre.
- [x] (v1.76) **Build qui suit les types d'augments** (`src/core/buildchoice.ts`) : tant que rien n'est investi, un augment peut faire passer à un build à moins de 2 pts (≥ 1 000 parties), et la carte n'a plus de malus si ce build proche lui va. La mesure attendue existait déjà : `card_picked` donne 74 choix suivis sur 96, 19 sur 26 au choix 1. Pris parce que tout le reste attend des parties.
- [ ] Build et augments, à mesurer : sur les 3 champions des fixtures (Malphite, Leona, Yasuo), aucun changement possible (Malphite : Tank 51,1 %, AP 46,7 %). L'effet se limite sans doute aux champions hybrides. Après 20 événements `build_lean` : `picked`, `bought`, winrate. Si l'événement reste quasi absent après 50 parties, ne pas élargir le seuil de 2 pts sans donnée croisée augment × build, retirer le code.
- [ ] Prochain sort, plus tard : ordre propre à Mayhem. Aucune source lue à ce jour (arammeta n'a pas de champ compétences dans `champions/{id}.json`). Augments qui changent un sort (Back To Basics) : ignorés.
- [ ] Faille, vérifier en vraie partie : la ligne dit-elle « 4e item » au bon moment (`slot` dans `item_bought`) ? Un item de support
  ou de quête fini peut décaler le rang (`itemSlot`). Le fichier `opgg-sample-analysis.json` n'a que 3 items par rang : relire
  ce que renvoie OP.GG sur plusieurs champions avant d'élargir la revue aux items du plan.
- [ ] Bilan des achats sur plusieurs parties dans « Toutes les parties », à faire si la couverture ci-dessus est bonne.
- [x] (v1.65) **Conseiller de reroll** (`src/core/reroll.ts`, suivi dans `Engine.rerollAdvice`). Règles mesurées sur 92 tirages
  (usage.json, 2 nov.) et confirmées par le wiki : une relance par carte à chaque choix, gratuite ; 0 carte revue dans un tirage ;
  pas de changement de rareté hors Command Line (79 tirages sur 89 de rareté connue ; 9 écarts à la 1re relance, dont 4 sur la
  partie Command Line du 2 nov. ; 1 écart inexpliqué, sans doute une rareté périmée de la fixture). Cartes vues : 176 ids pour
  445 cartes, compatible avec un tirage uniforme, pas prouvé. Rareté par choix (partiel) : A 24, O 33, P 22, aucune garantie.
- [ ] Reroll, vérifier en vraie partie : les relances sont-elles bien suivies (`left` qui baisse, cartes « À relancer » justes) ?
  Après 30 tirages, lire `reroll` dans `cards_seen` : part de `risky`, gain moyen, et ce que donnent les relances `risky` suivies.
  `rarity` est aussi noté : refaire le compte des raretés par choix avec des données complètes.
- [x] (v1.66) Relances notées dans la revue (`reviewDraw`, reroll.ts ; `drawFromSeen`, offers.ts pour les anciennes parties).
  Au plus une note par tirage : `costly`, `unused` ou `good`. Reconstruction vérifiée sur usage.json réel : 85/85 tirages,
  78 avec relances ; valeurs non rejouées (arammeta injoignable, tier-list de fixture : 6 tirages sur 85 seulement).
- [ ] Revue des relances, relire sur les vraies parties (Toutes les parties → Tes choix d'augments) : si `unused` sort sur la
  plupart des tirages, le pool est trop optimiste ou des relances échappent à la 1re lecture. Remonter alors son seuil
  (`RISKY_MIN` dans `reviewDraw`) ou le retirer. Vérifier aussi que `costly` ne dépasse pas les 18 tirages sur 83 du constat.
- [x] (v1.68) Reroll : pool sans les cartes vues aux choix précédents, pas seulement les augments pris. Mesuré sur 23 parties : 0 carte
  répétée sur 439 entre deux tirages, environ 17 attendues (5,5 même avec 600 cartes au pool) ; le wiki n'en parle pas. Seuls les Pentakill 3170-3173 reviennent.
- [ ] Reroll : augments impossibles sur le champion. Depuis le 26.13, les augments de sort ne vont qu'aux sorts qui en profitent
  ([arammayhem.com](https://arammayhem.com/patch/26-13/), site tiers). Aucune liste lue. Estimateur Chao1 sur 172 ids vus : environ 195 cartes tirables, soit 65 par rareté.
  Après 20 tirages, comparer `reroll.pool` (`cards_seen`) à ce chiffre : très au-dessus = pool trop large, pondérer ou couper les cartes estimées.
  (v1.88, 3 nov.) 21 lectures : Or médiane 87 (85 à 91, 13 lectures), Argent 64 (59 à 64, 8). L'Or dépasse déjà les 65 estimés, à recompter à 20 tirages complets. Piste : `augments.json` du même dépôt que ci-dessus a des tags `ranged_only` (Draw Your Sword), `needs_cc`, `needs_dash`, `needs_channel`, `champion_specific` sur 223 cartes : assez pour retirer du pool ce qu'un champion ne peut pas tirer, si on sait lire son kit. Dépôt tiers, sans licence vérifiée : à relire avant tout usage, et seulement si le pool se confirme trop large.
- [ ] Reroll, hypothèse à mesurer (recherche du 2 nov., [arammayhem.com](https://arammayhem.com/patch-notes), site tiers, à confirmer) :
  depuis le 26.18 les offres viennent de groupes propres au champion, le 26.14 réduit la répétition des types d'offres, et au 26.21 une
  partie des augments se débloque par la progression de bande. Si Celian n'a pas tout débloqué, `poolValues` compte des cartes qu'il ne
  peut pas tirer. Mesure : augments du pool jamais vus dans `cards_seen` après 150 tirages. Rien à changer avant.
- [ ] Command Line reconnu par les cartes : une carte relancée d'un cran au-dessus des 2 autres identifie le headliner quand la
  bannière est ratée. Attendre d'avoir les raretés à jour, celles de la fixture sont anciennes.
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
- [ ] **Headliner : vérifier en vraie partie** (2 nov. : 6 `headliner_seen`, 1 `headliner_miss`. 29 oct. soir : 1 sur 2 — « Space Groove » lu 5 s après la
  détection de la fenêtre, partie Nasus ; rien sur la partie Hwei, aucun faux headliner. v1.59 : tolérance d'une
  lettre (noms ≥ 9 lettres), « Bees » seul pendant les 90 premières secondes hors écran de cartes, et événement
  `headliner_miss` (lectures + textes approchants) dans `usage.json` / journal → à relire : si les ratés n'ont
  aucun texte approchant, la bannière est hors de `cardsArea()` ou finie avant la 1re lecture.) Critère : bannière lue (journal « Headliner : … lu à l'écran »,
  `usage.json` → `headliner_seen`). Si rien en 5 parties Mayhem : la bannière est hors de `cardsArea()` ou
  disparaît avant la 1re lecture → capturer le haut de l'écran les 20 premières secondes. Vérifier aussi qu'aucun
  faux headliner n'apparaît (texte du chat).
- [ ] (3 nov.) 13 `headliner_seen`, 2 `headliner_miss` en tout ; les 2 parties de la nuit lues (Command Line, True Damage).
- [x] (3 nov.) Taux de lecture du headliner : 13 lus, 2 ratés. Pas besoin d'agrandir la zone lue. Un des 2 ratés (2 nov. 15 h 40) a été lu 1 s plus tard : c'est la partie du faux headliner possible ci-dessous.
- [ ] Faux headliner possible (2 nov.) : « Space Groove » lu 90 s après le début d'une partie où Vision a aussi lu
  « HEARTSTEEL Sett » : ce sont peut-être des noms de skins. v1.62 : retiré si le `skinName` d'un joueur commence par ce
  texte. À relire dans le journal (« Headliner … retiré ») avant d'utiliser le headliner dans le classement.
- [ ] Headliner, tranche suivante : Command Line fait (conseiller de reroll, v1.65). Reste HEARTSTEEL : **bloqué** (3 nov., revu le soir). Seul fait nouveau : les membres du groupe posent des « Stickers » sur des augments, chacun avec son bonus, liste non publiée ([Hexgate](https://hexgate.app/blog/aram-mayhem-season-3/)). Aucune source ne dit quelles cartes changent ni comment ([Inven](https://www.invenglobal.com/articles/27480/35-new-augments-kda-and-pentakill-arrive-in-lol-aram-mayhem), [boostroom](https://boostroom.com/blog/lol-aram-mayhem-patch-2621-guide-best-augments-headliners-and-rewards), wiki) et Vision ne lit que les titres. Pour avancer : capturer le texte d'une carte sur une partie HEARTSTEEL.
- [ ] Command Line, à mesurer : les notes disent « one rerolled Augment » à chaque choix, pas « la 1re relance » ([arammayhem.com](https://arammayhem.com/patch-notes), site tiers). L'app suppose la 1re (`!draw.rolled.size`), d'après 9 écarts à la 1re relance. Sur 5 parties Command Line avec `rarity` dans `cards_seen` : quelle relance monte ? Une carte montée au hasard change `adviseReroll`.
- [x] (v1.73) **Superfans (26.22) et tirages hors paliers** (`extraDrawAt`, headliner.ts). Trouvé le 3 nov. dans les données PBE publiées par [DeepARAM](https://github.com/nicothomas02/DeepARAM/pull/384) : niveau max 21, plus d'XP, augment en plus au niveau 21. Pris parce que tout le reste attend des parties, et que le patch sort le 4 nov. En lisant le lecteur de cartes : il dort après le choix 4 + 3 min, donc niveau 21, Pentakill niveau 18 et K/DA n'étaient lus que par chance.
- [ ] Superfans, statut (3 nov.) : pas d'annonce de Riot, notes du 26.22 pas encore lisibles, sortie possible au 26.23 seulement ([Hexgate](https://hexgate.app/blog/aram-mayhem-season-3/)). Relire les notes après le 4 nov. avant de conclure à un raté de lecture.
- (3 nov., 16 h 30 UTC, v1.88) Notes officielles toujours absentes de la recherche, page officielle refusée d'ici.
- (3 nov., 15 h 30 UTC, v1.87) Notes officielles toujours absentes de la recherche.
- (3 nov., 14 h 30 UTC, v1.86) Notes officielles toujours absentes, Dot Esports et nerfplz (figée au 26.17) illisibles ou périmés.
- (3 nov., 13 h 30 UTC, v1.85) Notes officielles toujours absentes de la recherche.
- (3 nov., 12 h 30 UTC, v1.84) Notes officielles toujours absentes, Dot Esports illisible d'ici. [epinpay](https://www.epinpay.com/en/blog/lol-patch-26-22-notes), d'après l'aperçu : RISE et One Hit Wonder arrivent bien au 26.22, Superfans non cité. Reconnaissance des 2 titres testée (`cardmatch.test.ts`). Effets toujours à lire pour `augfit.ts`.
- (3 nov., 11 h 30 UTC, v1.83) Notes officielles toujours absentes ; arammayhem.com s'arrête au 26.21 (fichiers ouverts à jour du 2 nov.).
- (3 nov., 10 h 30 UTC, v1.82) Notes officielles toujours absentes. [arammayhem.com](https://arammayhem.com/articles/aram-mayhem-4-0/), site tiers : Worlds Band Track au 26.22, cohérent avec l'id « Worlds » de Superfans ; Butcher's Bridge et Koeshin's Crossing absents de Mayhem au 26.21, retour prévu au patch suivant.
- (3 nov., 9 h 30 UTC, v1.81) Notes officielles du 26.22 toujours absentes, Dot Esports illisible d'ici, wiki ARAM: Mayhem sans Superfans. Le rythme horaire des sessions est le choix de Celian : ne plus proposer de le ralentir.
- (3 nov., v1.79) Aperçus du 26.22 ([Hotspawn](https://www.hotspawn.com/league-of-legends/news/league-of-legends-patch-26-22-preview-mel-rework-and-item-changes)) : Mel le 4 nov., rien sur Mayhem ni Superfans. Notes officielles toujours pas sorties.
- [ ] Superfans, vérifier en vraie partie : journal « Headliner : Superfans », texte exact de la bannière (sinon `headliner_miss`, `near` vide car les formes attendues sont fausses : capturer et ajouter la forme), cartes lues au niveau 21 (`cards_seen` round 4, `card_picked` `choice: 1`), et niveau 21 atteint sur quelle part des parties. Vérifier aussi dans les notes officielles que Superfans est bien sorti au 26.22.
- [ ] Superfans, à mesurer : stats du choix 4 pour un 5e choix, faute de mieux. L'XP en plus avance aussi les paliers 7, 11, 15 : si arammeta sépare ces parties, le dire.
- [ ] K/DA, coût de la lecture toutes les 5 s : vérifier dans le journal que le 5e augment est lu (2 parties suffisent) et que le jeu ne saccade pas. Sinon passer à 10 s (`KDA_SCAN_MS`, cardreader.ts).
- [ ] Niveau 19 à 21 hors Superfans : 3 parties d'oct. (8022350911, 8022289994, 8021825913). Deux ont Infinite Recursion (1388), la 3e non : cause inconnue. Texte lu (v1.86, wiki de juin 2026) : Infinite Recursion = 60 d'accélération, +3 par élimination, rien sur les niveaux. Cause toujours inconnue : ne pas se servir du niveau pour reconnaître Superfans.
- (3 nov., v1.86) One Hit Wonder : « Ability Haste » dans le texte donne bien le tag `haste`, testé sur l'effet lu au PBE, à refaire sur le vrai texte. RISE : aucun tag, donc aucune correction.
- [ ] Refonte de Mel au 26.22 : pendant quelques jours, ses stats arammeta décrivent l'ancien kit. À signaler seulement si elle sort souvent aux cartes, un cas sur 170 environ par carte. Effets lus au PBE, à relire aux notes : One Hit Wonder (or) = un sort choisi gagne des dégâts selon l'accélération de compétence, qui ne réduit plus son délai ; RISE (prismatique) = un sort choisi qui tue se relance 2 fois, +25 % de dégâts à chaque fois. Vérifier que `augfit.ts` les classe bien : « Ability Haste » dans le texte de One Hit Wonder peut pousser la carte sur les champions à accélération, ce qui est le bon sens.
- [x] (v1.13) **Augments nouveaux du 26.21** (35 ajouts) : peu de parties dans arammeta. Les signaler « nouveau, peu de
  données » (g < 300) plutôt que les classer comme les autres.

- [x] (v1.16) **Panneau sur téléphone** (serveur HTTP local lecture seule + QR code). À vérifier sur le vrai
  réseau : pare-feu macOS, IP détectée (`lanAddress`), affichage iPhone/Android.

- [x] (v1.17) **Winrate par moment du choix** (arammeta `slots` : par champion dans `top/bot`, global dans
  `tier-list.augs[].slots` = [g, wr, lift, exact]). Choix détecté via `activeplayer.level` (1 + niv≥7 + niv≥11 + niv≥15).
  À vérifier en vraie partie : que `level` est bien présent dans activeplayer.

- [x] (v1.19) **Échanges avec les alliés** (`session.trades[]` state AVAILABLE → POST `/lol-champ-select/v1/session/trades/{id}/request`).
  À vérifier sur le vrai client : format de `trades` et réponse du POST.
- [x] (v1.74) **Timers des sorts ennemis, démarrés à la main** (`src/core/cooldowns.ts`, `src/core/enemyspells.ts`, `ingame/EnemySpells.vue`, onglet Sorts du téléphone). Demandé par Celian le 3 nov. Ultime + 2 sorts d'invocateur, cooldown calculé (Data Dragon, rang par niveau, haste des objets), jamais démarré tout seul (règle 1 d'AGENT.md). Seule action en écriture du téléphone : `POST /api/spell`.
- [ ] Sorts ennemis, vérifier en vraie partie : la haste lue dans les descriptions Data Dragon (bottes de Lucidité = 10 haste d'invocateur, Malignance = haste d'ultime) est-elle juste ? Les descriptions des tests sont reconstruites, pas copiées. `runes` de `playerlist` : `null` en Mayhem (captures), à confirmer en Faille (`primaryRuneTree` / `secondaryRuneTree`). Délai réel entre le clic sur le téléphone et le lancement vu en jeu : si les timers sont souvent corrigés de −10 s, proposer un décalage par défaut.
- [x] (v1.75) **Écart d'objets** (`src/core/goldgap.ts`, `ingame/GoldGap.vue`, `ingame/GoldGapTable.vue`), tous modes. Hexgate l'a gratuit (« Scoreboard gold » sur Tab, [hexgate.app](https://hexgate.app/blog/aram-mayhem-season-3/)), l'app n'avait rien sur l'état des forces. Pris parce que tous les items au-dessus attendent des parties, le 26.22 ou un accord (3 nov.). Affichage seul, jamais de conseil d'engager ou de reculer.
- [x] (v1.87) Objets adverses de `playerlist` : ils suivent les achats. Les captures sont prises mort ou en base, et les 10 inventaires changent à chaque choix. `position` = `NONE` en Mayhem, `runes` = `null`. 0 objet sans prix en répétition (catalogue simulé : `unknown` réel à lire dans `gold_gap`, non noté).
- [ ] Écart d'objets, `position` en Swiftplay : remplie ?
- (v1.79) `unknown` en partie : dans tes objets capturés, seuls 228002 Wooglet's Witchcap (6 000) et 220013 Poro-Snax (0) sont hors catalogue probable, couverts par le repli sur `price`. Reste à voir sur les objets des autres joueurs.
- [ ] Écart d'objets, à calibrer : après 30 événements `gold_gap`, winrate selon l'écart à 10 et 15 minutes, et par mode. Remplacer `EVEN_SHARE` et `EVEN_MIN` (goldgap.ts, 3 % et 500 or, choix prudents). Ne pas en faire un conseil.
- [x] (v1.84) **Timers justes en ARAM et Mayhem** (`ARAM_SUMMONER_HASTE`, cooldowns.ts ; `Engine.balanceHaste`). +70 haste d'invocateur ([wiki ARAM](https://wiki.leagueoflegends.com/en-us/ARAM), aura de l'Abîme hurlant), jamais comptée depuis la v1.74 : Flash à 300 s au lieu de 176 s. Plus l'accélération d'équilibrage sur les ultimes, et plus de rune cachée en Mayhem ([wiki Mayhem](https://wiki.leagueoflegends.com/en-us/ARAM:_Mayhem) : runes désactivées). Pris parce que tout le reste attend des parties.
- [ ] Timers v1.84, vérifier en vraie partie : signaler un Flash adverse et regarder s'il revient à 176 s. Rien dans l'API ne le confirme. Vrai aussi sur Koeshin's Crossing ? (supposé : Mayhem garde les règles de l'ARAM). Malus d'accélération (Ziggs −20) : traité sans allonger le cooldown, d'après le 0 affiché par `abilityHaste` en captures, à recouper avec un Ziggs ennemi. `abilityHaste` de `activeplayer` inclut l'équilibrage : Hecarim à 10 aux 2 captures du choix 2, ce qui colle sans le prouver (objets inconnus de la fixture).
- [x] (3 nov., écarté après mesure) Rappel « augment en attente » : le choix ne s'ouvre que mort ou en base depuis le 26.06 ([guide](https://guides-factory.com/guides/lol-aram-mayhem-guide)). Sur 59 choix aux niveaux 7, 11, 15 : médianes 28, 8 et 10 s entre le palier et la 1re lecture, p75 50 s, max 165 s. Celian choisit vite, rien à gagner. Compter les paliers sans lecture si ce chiffre sert ailleurs : la lecture dort 180 s après le palier, les retards plus longs ne se voient pas.
- [ ] Sorts ennemis, plus tard : Téléportation selon le niveau (Unleashed), charges de Châtiment, augments Mayhem qui changent la haste (seulement si une source les liste).

- [x] (v1.77) **Collection de champions** (`src/core/pool.ts`, `ui/PoolPanel.vue`). Trouvé le 3 nov. sur le [wiki ARAM](https://wiki.leagueoflegends.com/en-us/ARAM) : cartes tirées dans ta collection + rotations, banc limité à ta collection, 3e carte 5 à 30 % selon le nombre de champions. Plus de relance de champion depuis la V25.13 (`rerollsRemaining` 0 sur 27 captures). Pris parce que tout le reste attend des parties, et que le winrate du champion est le levier mesuré le plus fort (60 % contre 42 %).
- [x] (v1.87) Collection vue en vrai : 254 sur 254, 0 gratuit, `pool_outside` vide, rien de filtré. 254 dépasse le nombre de champions du jeu : la liste contient autre chose (ids de modes ?), sans effet tant que tout est possédé. Ne compter que si Celian a un jour des champions manquants.
- [ ] Collection, plus tard : prix en essences (endpoint non identifié) pour classer par gain / coût. Hypothèse à vérifier : le wiki dit « up to 100 total » pour les champions proposés ; si c'est un plafond du pool tiré, le calcul de `poolReport` change.
- [x] (v1.78) **Mise à jour prête, relance en un clic** (`src/core/appversion.ts`, bloc en bas à gauche de `App.vue`). Pris parce que tous les items au-dessus attendent une partie sur une version récente : 14 versions non lancées depuis le 2 nov. 16 h 55 UTC. Plus `app_start` et les 10 joueurs dans `liveclient-choix*`.
- [ ] Relance, vérifier sur le Mac : le bouton rouvre-t-elle l'app (lanceur .app, puis agent launchd) ? La position des fenêtres et le panneau téléphone reviennent-ils ? La notification sort-elle au salon ? Après 10 versions : délai entre le dépôt et le `app_start` suivant. Testé seulement sous Linux.
- [x] (v1.87) Écart d'objets et sorts ennemis lus dans `players` : voir plus haut. Hubris vaut 126697 chez tous les joueurs en Mayhem (Jarvan IV aussi) : cet id ne dit pas qu'« Upgrade Hubris » a été pris.
- [ ] Repéré chez Hexgate le 3 nov. : « Lane Scouting » (habitudes de début de partie de l'adversaire de lane, écran de chargement, offre payante) et « Match Breakdown » (pourquoi tu as gagné ou perdu). Le premier suppose l'historique d'autres joueurs : à relire contre la politique Riot avant tout travail, et seulement quand Celian jouera la Faille en classée (3 parties Swiftplay à ce jour). Le second recoupe la revue de partie existante.
- [x] (v1.80, écarté après mesure) « Loading Screen Scouting » de [Blitz](https://blitz.gg/lol/overlays), limité à ton historique contre ces champions. Rejoué dans l'ordre sur 80 parties Mayhem détaillées, avec le bilan d'avant chaque partie et 4 parties minimum : 47 lignes, 33 parties touchées, 12 lignes avec un signal (Wilson 80 %), « mauvais » 4 V sur 8, « bon » 3 V sur 4, base 47,5 %. Avec les alliés : 15 lignes, 5 signaux. Rien de prédictif, et 140 champions différents pour 80 parties. À relire à 300 parties. Ennemis, profil et menaces sont déjà dans `Counters`, le matchup Faille au champ select.
- [ ] « Benchmarking » de Blitz (repères en direct, utile surtout en Faille) : pas avant des parties Faille. Le reste de leur liste existe déjà, ou est interdit (timers de relics et de camps automatiques), ou inutile en ARAM (rappel de balise).
- [x] (v1.80) **Jour de patch**, 3 trous vus en relisant `checkPatch` à la veille du 26.22 : timers sur le Data Dragon d'arammeta (`ddragonCandidates`, `CooldownData.loadAny`), détail d'un champion gardé 12 h sur disque après un rechargement forcé (`Arammeta.freshDetails`), retard des stats visible seulement dans Réglages (`statsBehind`, store.ts, bandeau au champ select). Pris parce que tout le reste attend des parties.
- [ ] Jour de patch, vérifier le 4 nov. ou après : « Client en … » dans le journal et Réglages, format réel de `/lol-patch/v1/game-version` (supposé 16.22.x, jamais capturé), délai réel d'arammeta et de Data Dragon. Si l'app reste longtemps avec un patch de retard, voir si les stats du patch d'avant peuvent peser moins sur les champions modifiés (notes du patch à lire, rien d'automatique aujourd'hui). Échantillon d'arammeta dans la fixture du 26.21 : 30 000 à 50 000 parties par champion ; à mesurer sur les premiers jours du 26.22 avant de penser à un lissage.

- [x] (v1.81) **Sac plein** (`consumedBy`, `itemToSell`, nextbuy.ts). Trouvé en relisant les captures : 8 sur 20 au niveau 15 ont 6 places prises (toutes avec au moins un composant), 23 conseils sur 128 du journal sur sac plein, or inutilisé jusqu'à 3 996. Pris parce que tout le reste attend des parties, et que ça touche Mayhem à chaque fin de partie. Mesure sur des captures, le gain en parties reste inconnu.
- [ ] Sac plein, vérifier en vraie partie : le conseil vendre / terminer tombe-t-il juste (journal « sac plein ») ? Une potion ou un objet Mayhem proposé à tort ? Après 20 parties, lire `bag_full` : part de `blocked`, or moyen, part avec `sell: null`.
- [ ] Sac plein, à mesurer : `sell: null` fréquent = 6 items finis avec de l'or qui dort. Ce serait la question suivante (quel item remplacer, bottes comprises), à étudier seulement avec une source qui compare des builds à 6 items. Rien aujourd'hui.
- [x] (v1.82) **Revente dans l'or disponible** (`resaleFor`, nextbuy.ts ; `CooldownData.sellValue`). Taux jamais supposé : `gold.sell` de Data Dragon, objet par objet. Pris parce que tout le reste attend des parties, et qu'on n'achète qu'en base : combler 200 or avance un item d'une mort. Fréquence non mesurée : les captures n'ont ni le plan ni l'or à chaque mort.
- [ ] Revente, vérifier en vraie partie : journal « Revente : … », valeur affichée par l'app contre celle de la boutique (Data Dragon lu de nulle part depuis les sessions : `gold.sell` jamais vu en vrai, ni sur un objet Mayhem). Après 20 événements `resale` : `full`, écart moyen, et l'item acheté juste après dans `item_bought`. S'il sort presque jamais, le laisser tel quel, il ne coûte rien.
- [x] (v1.87) Revente limitée, après mesure : le cas redouté est sorti dès la 1re partie (Last Whisper vendu 1 015 or pour un Executioner's Calling à 800, puis Dominik's terminé). Vente seulement vers un item fini ; avec de la place, seulement un objet de moins de 200 or (`SPARE_MAX`) ; jamais l'item qui couvre une menace (`guard`). Sac plein : une menace ne passe devant que ce qui tient (`rank`), `room.held` quand un composant attend, `upgrade` propose Mortal Reminder quand Executioner's est dans le sac.
- [ ] Revente v1.87, vérifier en vraie partie : lire `resale` (ne devrait plus viser que des sacs pleins et des potions), et le journal « sac plein, composants gardés ». Si `held` sort souvent avec beaucoup d'or, chercher quel item finir : l'app ne le sait que s'il est dans `seq` (cores, options, menaces).
- [ ] Menaces, à compter : 5 achats conseillés « contre leur équipe » sur 5 non suivis sur les 2 parties du 3 nov. (bottes à part). Tahm Kench : Iceborn Gauntlet 50,6 % sur 1 090 parties imposé devant Riftmaker 56,9 % sur 22 411, que Celian a pris. Après 20 parties, compter dans `item_bought` (`why` commence par « contre leur équipe », `followed`, `value`, `recoValue`) et le winrate. Si ces conseils restent ignorés, ne garder `urgent` que si l'écart de winrate est faible : la menace bouscule aujourd'hui le build sans regarder ce qu'elle coûte.
- [ ] Lecture : Jhin, choix 2, « Upgrade Collector · escAPADe » lu une seule fois, 2 cartes sur 3, pas de `card_picked` round 2. 1 choix sur 8 sur ces parties. Voir si ça se répète (`Upgrade` long en largeur ?).

- [x] (v1.83) **Combos champion + augment** (`src/core/combos.ts`, [arammayhem.com/data](https://arammayhem.com/data/), CC BY 4.0, 457 lignes). Seule source d'interactions de kit et d'augment × augment lue à ce jour, arammeta n'en a aucune. Mesuré sur le journal (23 parties, 220 tirages) : 25 tirages touchés, 3 combos solo tous non conseillés, 0 piège, 2 plans utiles. Pris parce que tout le reste attend des parties.
- [x] (v1.85, 3 nov.) **Élixir quand il ne reste rien à acheter** (`src/core/elixir.ts`, `ui/ElixirLine.vue`). Pris parce que tout le reste attend des parties, et que « sac plein, à mesurer » ouvrait la question de l'or qui dort : 55 parties Mayhem sur 80 finissent à 6 items finis, surplus médian environ 3 600 or (prix estimés).
- [x] (v1.86, 3 nov.) **Tags des augments sur le vrai texte** (`plainText`, `tagsOf`, augfit.ts). Parti de « vérifier que `augfit.ts` classe bien One Hit Wonder ». Les regex n'avaient été testées que sur des descriptions écrites à la main : `\bheal` prenait `health`, le gras `'''bonus'''` cachait `bonus armor`, `attacks? ` prenait `attack damage`, `crit` prenait `critters`, `cooldown` prenait tous les délais. Malus jusqu'à −4 pts à tort. 80 lectures sur 235 touchées, effet réel sur le conseil non mesuré. Pris parce que tout le reste attend des parties.
- [ ] Tags, à mesurer : après 50 tirages avec `fit` dans `cards_seen`, part des tirages où `fit` change le `best`, et winrate de ces choix. Nouveauté à surveiller : 37 cartes de tank au lieu de 11, +1,5 à +2,5 pts sur build tank, alors que leur winrate reflète déjà des tanks. Si les tanks prennent toujours la même carte, baisser ce bonus.
- [x] (v1.88, 3 nov.) Tags, reste faux : Get Excited et Critical Healing corrigés, 65 textes de plus relus (`data/augments.json` de `kiwiiiii-eth/aram-mayhem-analyzer`, 223 cartes). 12 cartes changent, 15 lectures sur 771 du journal. Pris parce que tout le reste attend des parties.
- [ ] Tags, cartes sans texte : 24 cartes du journal (129 lectures sur 771) absentes des 2 copies : Get Jinxed, Sap Magic, Lonely Warrior, Brass Blast, BEES!, CRIMSON COBALT, The Boom and the Bass, Take'em Down Down Down… Lire `noText` dans `cards_seen` à la 1re partie en v1.88. Vide : la copie du Mac les a, relire leurs tags dans une copie récente. Non vide : ces cartes n'ont aucune correction, chercher un texte ailleurs (noms à vérifier contre le wiki, certaines peuvent avoir un autre nom).
- [ ] Élixirs, vérifier en vraie partie : la boutique Mayhem les vend-elle (`maps` 12 ne prouve que l'ARAM) ? Journal « Élixir conseillé » / « Élixir acheté », effet affiché, sac plein bu à l'achat. Bu mort : le wiki dit que Sorcery attend la réapparition, l'app suppose la même chose pour les 3. Un seul effet à la fois, achat bloqué 5 s après un autre.
- [ ] Élixirs, à mesurer : après 20 parties, événements `elixir` de `usage.json` : part de conseils suivis, or au conseil, winrate des parties à 6 items finis avec ou sans. Niveau 9 en Mayhem : atteint bien avant la fin du build, à confirmer. Élixir gardé dans le sac (pas sac plein) : non suivi, l'app n'en reconseille pas tant qu'il y est.
- [ ] Élixirs, plus tard : à 6 items et beaucoup d'or, remplacer les bottes ou un item ? Toujours aucune source qui compare des builds à 6 items.
- [ ] Combos, vérifier au 1er lancement : Réglages dit-il « arammayhem.com, N combos » ou l'instantané ? (téléchargement jamais vu : `curl` bloqué depuis le conteneur et le shell du Mac, fichier lu par WebFetch seulement.) Le nom anglais des cartes joint-il bien les ids (`purist___caster`, `light_em_up!`) ? 43 ids sur 122 jamais vus au journal.
- [ ] Combos, à mesurer : après 50 tirages avec `combos` dans `cards_seen`, joindre `card_picked` : pris ou non, winrate, part de `À prendre` sur un piège. Si un piège sort souvent en tête ou si les combos forts gagnent nettement, décider avec des chiffres d'un effet sur le classement. Aujourd'hui zéro effet : c'est un avis, pas une stat.
- [ ] Combos, plus tard : la raison (« Q can't proc Marksmage ») n'est que dans les pages du site, pas dans le fichier. Ne pas scraper : le fichier ouvert exclut exprès les winrates et les textes. `bug` : peut déjà être corrigé, jamais présenté comme un bon choix.
- [ ] Repéré sur [arammayhem.com](https://arammayhem.com/build/ezreal/) le 3 nov. : ordres de sorts et items de départ Mayhem avec pick et winrate (Ezreal : Tear › Guardian's Blade 50,4 %, Sheen › Tear 48,0 %). Ça répondrait à « Prochain sort, ordre propre à Mayhem ». Pas dans les fichiers ouverts (CC BY = pick rates seulement), à ne pas récupérer sans accord du site. Écart des ordres de sorts minime sur Ezreal (45,7 contre 45,2 %) ; les items de départ seraient le vrai gain, sous réserve de biais de sélection.

## Priorité 2 — tirer plus des données perso

- Constat du 3 nov., **ne pas en faire un conseil** : Flash + Marque 12 V sur 33, Flash + Fantôme 14 V sur 21 sur tes parties détaillées. arammeta donne le même winrate aux deux à 0,2 pt près sur les 3 champions lus, et l'écart ne vient pas de l'arrivée de l'app (Marque 3 V sur 14 avant, 11 sur 22 après). À relire à 150 parties détaillées (80 ce jour), en comparant au winrate attendu de chaque champion.
- Constat du 3 nov., **ne pas en faire un conseil** : par classe principale (130 parties Mayhem, classes notées à la main) : mages 9 V sur 24, tireurs 20/34, combattants 16/27, tanks 7/14, supports 12/24, assassins 4/7. Aucun intervalle de Wilson à 95 % n'exclut 50 %, 6 classes comparées. À relire à 300 parties : c'est le seul moyen d'avoir des stats perso qui servent à un champion peu joué.
- Parties de moins de 15 min : 8 V sur 23, contre 61 V sur 110 au-delà. Rien à en tirer pour l'instant, à garder en tête pour le bilan de partie.

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

- [ ] Faille : chemin de jungle avant la partie (Blitz a un overlay `junglePath`, [blitz.gg](https://blitz.gg/overlays/lol?select=junglePath)). À garder pour le champ select seulement, jamais de conseil de déplacement en partie (règle Riot).
  Ne pas faire avant d'avoir des parties Faille en jungle : 3 parties Faille en historique, toutes Swiftplay.

## À trancher avec Celian (ne pas faire sans son accord)

- Relance automatique : l'app pourrait se relancer seule quand une version attend et que le client League est fermé. Aucune partie à couper, et les mesures n'attendraient plus. Mais la fenêtre peut réapparaître pendant que tu fais autre chose, et ça assouplit la règle « l'app ne se relance pas sans toi ». Pas fait sans ton accord.

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
- [x] (2 nov.) Indicateur principal (« Reco d'augment suivie ») relu : 86 choix sur 23 parties, 68 suivis (22 gagnés, 32 %), 18 non
  suivis (9 gagnés, 50 %). Par partie : 5 V sur 17 en suivant au moins 75 % des recos, 3 V sur 6 sinon. **Aucune conclusion** : trop peu de
  parties, les choix d'une partie ne sont pas indépendants, et une carte non suivie vient souvent d'un build déjà différent. À relire à 60 parties.
  Ne pas s'en servir pour changer le classement ; la revue juge mieux les choix un par un.
- [x] (v1.53) Titres coupés au bord (« th Haste », « n College », « Jinxed ») et titres lus en deux morceaux côte à
  côte reconnus (`partialName`, cardmatch.ts), seulement en complément d'un nom entier.
- [ ] Plus tard : rareté lue à l'écran. Headliner et aide au reroll sont faits. Faible valeur : la rareté vient de la tier list du patch, l'écran ne l'apporte que pour Command Line (voir plus haut).

## Écarté

- Timers automatiques (relics, sorts ennemis détectés sans toi), lecture mémoire, scripts de gameplay : interdits par Riot. Les timers démarrés à la main existent depuis la v1.74, à la demande de Celian.
- Clips vidéo des morts (Hexgate Pro+) : lourd, peu de valeur pour gagner.
