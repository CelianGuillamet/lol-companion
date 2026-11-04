# Feuille de route

Critère unique pour ajouter une fonction : **est-ce que ça fait gagner des parties à Celian, sur Mac, dans un mode 5v5 ?**
L'app couvre l'ARAM, ARAM: Mayhem et la Faille de l'invocateur (classée, normale, Swiftplay), à la demande de Celian.

Prendre le premier item non coché de la priorité la plus haute, sauf s'il est bloqué. Chaque item a sa
« preuve de fini ». Ajouter en bas ce qu'on découvre.

## Ce qui existe (v1.112)

Champ select (cartes + banc classés, compo, synergies, stats perso, prendre en un clic) · import runes / sorts /
item set · onglet Build avec icônes (runes, sorts, 3 builds à 2 items + 3e item, bottes) · augments par rareté avec
tes stats perso · fenêtre second écran / overlay · notifications champ select · Mes stats · Historique (filtres,
KPI, forme, détail des 10 joueurs) · items contre l'équipe adverse · badges d'équilibrage ARAM · acceptation auto · stats adversaires / alliés / duos · winrate par semaine et par rang dans la session · export de l'historique · pièges d'augments, types d'augments, autres items gagnants · pool complet d'augments avec recherche · rechargement au changement de patch · ⌘⇧S · prochain achat (or + items via Live Client, composant achetable) · page champion perso · bilan de la dernière partie · headliner Mayhem reconnu en partie (bannière / cartes) avec conseils · revue des augments, des relances et des achats · conseiller de reroll · options d'achat Faille au rang de l'item · bans conseillés · prochain sort à monter en partie, tous modes en Faille · achat et notation des augments liés à un item (Upgrade …) · Superfans et tirages hors paliers lus · cartes et champions modifiés au patch signalés · écart d'objets · build qui suit les augments entre builds proches · sac plein (quoi vendre, quoi terminer) · revente comptée dans l'or · combos et pièges connus sur les cartes · élixir quand le build est fini · enclume de stats en Mayhem.

## Priorité 0 — valider sur les vraies parties (avant toute nouvelle fonction)

### Observations ennemies (v1.89, 3 nov. 2026 ; timers retirés en v1.93)

- [x] Recaler les fenêtres sauvegardées dans la zone utile après changement d’écran ou de résolution.
- [x] Ajouter le pipeline Live Client, la provenance, le journal d’événements borné et le diagnostic local. Les informations non acquises restent inconnues.
- [x] Après fusion : 515 tests passés, 4 répétitions réelles ignorées faute de données, typage/build et scénarios Electron grand écran/390 px réussis.
- [x] Fournir une mise à jour Mac précompilée avec empreintes, sauvegarde et installateur testé sur fichiers réels sous Linux. Installation native macOS non encore validée.
- [ ] Exécuter `scripts/intelligence-probe.ts` sur le Mac en partie et examiner son schéma local.
- **Abandonné, interdit par Riot** : positions hors vision, lancements et cooldowns ennemis (« information not present in the game client », « automatically or manually allowing tracking enemy ultimate cooldowns »). Timers manuels retirés en v1.93. Ne pas reprendre.

Audit : `docs/intelligence-investigation.md`. Les scénarios synthétiques ne valident pas une acquisition en partie réelle.

**`usage.json` et `journal.txt` repartent de zéro le 3 nov. à 17 h 43 UTC (dossier refait en clone git)** : 1 partie à la v1.89. Les comptes « après N parties » repartent de là ; ce fichier garde les chiffres d'avant. `buys` et `review` de `historique.json` restent complets. Répétition générale pauvre tant que les captures ne sont pas revenues.

**Avant de lire une mesure, vérifier la version qui tournait** (dernier `app_start` de `usage.json`). **Relance le 3 nov. à 14 h 41 UTC, en v1.86** : les items « après N parties » ci-dessous comptent à partir de là (2 parties à la v1.87 : Tahm Kench 8034657052 défaite, Jhin 8034673285 victoire).

Beaucoup de fonctions v1.10 → v1.23 n'ont été testées que contre le faux client. À chaque session :
- [x] (v1.79, 3 nov.) **Répétition générale** (`test/rehearsal.test.ts`, voir AGENT.md) : 136 parties sans perte, 25 revues d'augments et 22 d'achats refaites, 21 parties (89 lectures Live Client) et 27 champ select rejoués, interface parcourue sur l'historique réel, 0 erreur. Pris à la place d'une nouvelle fonction parce que cette section passe avant, que tous ses items attendent une partie, et que 16 versions s'appliqueront d'un coup. 2 écarts trouvés et corrigés : objets Mayhem sans prix, sorts donnés par un augment.
- [x] (v1.102, 4 nov.) **Répétition Faille** (`test/rehearsal-sr.test.ts`, même `ARAM_REHEARSAL_DIR`) : 2 Swiftplay de Lillia (8035167130, 8035198994), salon, vrai champ select fantôme, 5 lectures, fin de partie, `position` remplie, vide, `NONE`. 0 casse, 0 écriture dans le client. La partie de 88 s est écartée. Pris parce que tout attend des parties (aucune depuis le 3 nov., 22 h 03 UTC, app en v1.93) et que la répétition ne rejouait que du Mayhem. Salon et joueurs reconstitués, OP.GG = capture d'Ahri : à refaire avec `liveclient-faille*` dès qu'ils existent.
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
- (3 nov., v1.89, Yasuo) 1re partie K/DA suivie : `choice: 1` au choix 2, tirage 164 s après le 1er, conforme. Reste 4 parties.
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
- [x] (v1.108, 4 nov.) **Parties annulées hors des chiffres** (`src/core/remake.ts`, < 240 s) : 4 sur 147, gardées dans la liste. Rôle Faille par Châtiment ou rôle du salon (4 parties sur 6 sans rôle). Bilan et accueil suivent `stats.recorded`, Faille comprise. Trouvé en lisant le journal : « Lillia (victoire, 0 augments) » sur une partie de 88 s. Pris parce que tout le reste attend des parties.
- [ ] Partie annulée, à vérifier : depuis la v1.109, l'événement `game_end` de `usage.json` note `early`, `surrender`, `teamEarly` à chaque fin de partie (clé absente = champ inexistant). À lire après 20 parties et au 1er remake : `early` vrai sur les parties annulées seulement ? `isRemake` n'en tient pas compte tant que ce n'est pas lu : `early` pourrait aussi marquer une vraie reddition rapide. `gameEndedInEarlySurrender` existe-t-il dans `stats` de `/lol-match-history/v1/games/{id}` ? Aucune capture brute à ce jour. S'il existe, il vaut mieux que la durée, surtout pour une reddition très rapide en Mayhem. Aucune partie entre 131 et 498 s aujourd'hui : le seuil de 240 s n'a jamais été éprouvé.
- [x] (v1.109, 4 nov.) **Place du champion dans le rôle au salon Swiftplay** (`slotFit`, quickplay.ts ; `History.roleRecord`). Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC), et que le salon est le seul moment où Swiftplay laisse choisir le champion : la tier list existait, mais pas à cet endroit. Tous les outils de méta (OP.GG, U.GG) donnent ce repère. Affichage seul.
- [x] (v1.110, 4 nov.) **Matchups complets et duels de la partie** (`guideRate`, laneguide.ts ; `src/core/lanemap.ts`, `ingame/LaneMap.vue`). Trouvé en relisant la capture : l'analyse OP.GG ne donne que 3 `strong_counters` et 3 `weak_counters`, donc `matchupFrom` tombait presque toujours sur « Pas assez de parties », alors que `data.counters` du guide liste tout le rôle (56 matchups sur Ahri). Le jungler adverse vient du Châtiment. Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC) et que les 6 parties Faille de Celian sont en jungle : le bloc « Jungler adverse » ne lui disait rien.
- [x] (v1.111, 4 nov.) **Counter-picks, dangers et bans sur tous les matchups** (`roleGuide`, `guideCounters`, `dangersFrom`). Counter-picks filtrés par collection. Fait malgré la priorité basse : 1er item non bloqué, tout le reste attend des parties. Sans effet tant que Celian ne joue pas de draft.
- [ ] Matchups complets, vérifier sur une vraie draft : journal « Counter-picks contre … (N matchups lus) », N proche de 50 ? La liste est-elle la même quel que soit l'adversaire demandé (`counters` des `opgg-matchup-*.json`, vu sur Ahri contre Ahri seulement) ? Survoler un autre champion refait 1 appel par nouveau champion : à regarder si OP.GG limite.
- [ ] Matchups complets, à mesurer : après 20 événements `counter_picks`, part sans aucun choix, part avec `mastery` nul. Si les choix sont surtout « jamais joué », classer d'abord les champions que Celian joue. `PrepareView` (hors partie) garde les 6 matchups de l'analyse : à reprendre seulement si Celian s'en sert.
- [ ] Duels, vérifier en vraie partie : journal « Duels de la partie : … », rôles alliés justes (`allyLanes`, salon) ? Rôles ennemis devinés justes, à comparer à la fin de partie (`position` dans le détail) ? `summonerSpells` : lire le vrai `rawDisplayName` du Châtiment dans une capture, `hasSmite` suppose `SummonerSmite`. `players` de `liveclient-faille*` ne garde pas les sorts : les y ajouter si la jungle adverse sort « deviné ».
- [ ] Duels, à mesurer : après 20 événements `lane_map`, winrate selon la somme des écarts (somme de `rate` − 0,5) et selon le duel le plus faible. Si rien ne sépare, passer le bloc en replié. Swiftplay peut différer : chiffres de classée, tous niveaux confondus. `win` de `data.counters` = champion demandé, vérifié sur Ahri seulement (6 lignes communes avec l'analyse) : à relire sur `opgg-matchup-*.json`.
- [ ] Place dans le rôle, vérifier au salon : ligne « Rôle » sur Lillia et sur un champion hors rôle, nom de « Plus forts ici » juste (`idOf`), `rank` et `of` dans `swiftplay_slots`. Après 20 événements : Celian change-t-il de champion après une ligne faible (événement suivant du même type) ? Si jamais, garder le rang seul. Le classement est celui de la classée : Swiftplay peut différer.
- [ ] Place dans le rôle, plus tard : à reprendre au champ select de classée seulement si Celian y joue (le contre-pick y pèse plus que le rang, déjà là) ; pondérer par `mine` quand un rôle aura 10 parties.
- [ ] Lecture du bilan Faille : `recap` compare à tes autres parties du champion, sinon du mode, sans tenir compte du rôle. À revoir quand plusieurs rôles auront 3 parties.
- [ ] Résistances urgentes (v1.61) : pas encore déclenchées, aucune des 3 parties du 2 nov. n'avait 60 % de dégâts d'un type.
- [ ] Synergie + compo plafonnées à 5 points (v1.62, choix prudent, pas une mesure). Après 100 événements `champ_scored`
  dans `usage.json`, comparer le winrate selon synergie + compo et ajuster `TEAM_BONUS_CAP` (advisor.ts).
- [x] (v1.62) Conseil d'achat gardé tant que l'inventaire ne change pas (option `keep` de `nextBuys`).
- [x] (v1.64) Revue des achats (`src/core/buyreview.ts`, `ui/BuyReviewPanel.vue`) : `item_bought` garde la raison et les
  winrates ; verdicts suivi / plan / contre leur équipe / proche / coûteux.
- (4 nov., 32 parties, 176 achats) Couverture lue : hors plan et hors contre, 6 `costly`, 4 `close`, 41 `unknown` (34 sans `value`, dont 20 bottes). 23 des 32 parties sont refaites après coup (`approx`). À recompter sur des parties récentes seulement.
- [ ] Revue des achats, couverture : après 20 parties, compter dans `item_bought` les achats hors plan avec `value` et
  `recoValue`. Si c'est rare (`singleItems.top` = 6 items par champion dans les fixtures), chercher une autre source
  comparable. Ne pas mélanger avec les `options` des clusters : leur winrate est mesuré dans le cluster, pas sur le champion.
- [x] (v1.67) Revue des achats en Faille : winrates OP.GG au même rang (`fourth_items`, `fifth_items`, `sixth_items` → `BuildPanel.slotStats`),
  et le conseil classe ses options au rang à acheter (`optionsForSlot`, nextbuy.ts). Rien avant le 4e item.
- [x] (v1.69) **Bans conseillés Faille** (`src/core/bans.ts`, section en tête de `SrSelectPanel`, bouton Survoler). Manque repéré le 3 nov. : l'app ne disait rien pendant la
  phase de ban, alors que Blitz, Mobalytics et consorts en font un service de base. Pris parce que tous les items au-dessus attendaient de nouvelles parties (aucune depuis le 2 nov. 19 h 42).
- [ ] Bans, vérifier sur une vraie draft ou classée : journal « · bans : … », `champselect-*.json` (aucune capture n'a encore de vraie action `ban`), et que Survoler
  marche pendant ton tour. Le PATCH sans `completed: true` suit l'usage connu de la LCU, pas une capture. (`winRate` lu dans `opgg-sample-lanemeta.json` du 3 nov. : 173 champions, 0,4868 à 0,5170 sur l'échantillon, format conforme.)
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
- [x] (v1.105, 4 nov.) Au 26.22, cartes liées relues sur tout le module du 3 nov., sans attendre `bound_unknown` (vide, aucune partie sur le 26.22). Les 10 « Upgrade » tirables sont dans `BOUND` (test). Corrigé : Upgrade Zhonya's (Witchcap), composants améliorés (`parts`), Void Immolation (`done`, par le nom, id jamais lu), Tiamat non vendable sous Ultra Hydra (`noSell`), id 126697 de Hubris. Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC, app en v1.93).
- [ ] 26.22, à relire au 1er `bound_unknown` non vide. One Hit Wonder et RISE! ne sont pas des « Upgrade » mais leur texte manque au module du 3 nov. Le texte du wiki se lit sur [ARAM_Mayhem/Augments](https://wiki.leagueoflegends.com/en-us/ARAM_Mayhem/Augments), les noms d'items y manquent : chercher le nom de l'actif.
- [x] (v1.105) Weapon of Destiny, King Me : l'item visé est le 1er légendaire du sac, cases 1 à 6 (wiki). Ligne `hints` sur la carte (`legendaryHint`), aucun effet sur le classement.
- [ ] Weapon of Destiny, King Me, vérifier en vraie partie : l'item visé est-il bien le 1er de `slot` (Live Client 0 à 5) ? Sans item légendaire, que devient Weapon of Destiny ? Si la carte passe au 1er item acheté ensuite, remplacer le texte. Un item Mayhem (Hubris 126697, Witchcap) compte-t-il comme légendaire ? 0 tirage de Weapon of Destiny, 1 de King Me dans les 33 revues de `historique.json`.
- [ ] King Me, à regarder : rien ne rappelle d'entrer dans la porte une fois la carte prise. Ne pas ajouter de rappel avant d'avoir vu Celian la prendre (D chez arammayhem.com au 26.21, 1 tirage en 33 parties revues).
- [x] (v1.72) Carte déjà vue à un choix précédent retirée d'une lecture complète (`ghostCards`, offers.ts). Mesuré sur 333 lectures : 1 cas complet (Giant Slayer, Caitlyn, 3 nov.), 6 cartes seules de possédés sur lectures partielles, déjà sans conseil.
- [ ] Carte déjà vue, vérifier : « Carte déjà vue retirée de la lecture » dans le journal doit rester rare et ne jamais toucher une vraie carte. Si ça sort sur des tirages complets répétés, la règle « une carte ne revient pas » est fausse (headliner ?) : retirer le filtre.
- [x] (v1.76) **Build qui suit les types d'augments** (`src/core/buildchoice.ts`) : tant que rien n'est investi, un augment peut faire passer à un build à moins de 2 pts (≥ 1 000 parties), et la carte n'a plus de malus si ce build proche lui va. La mesure attendue existait déjà : `card_picked` donne 74 choix suivis sur 96, 19 sur 26 au choix 1. Pris parce que tout le reste attend des parties.
- [ ] Build et augments, à mesurer : sur les 3 champions des fixtures (Malphite, Leona, Yasuo), aucun changement possible (Malphite : Tank 51,1 %, AP 46,7 %). L'effet se limite sans doute aux champions hybrides. Après 20 événements `build_lean` : `picked`, `bought`, winrate. Si l'événement reste quasi absent après 50 parties, ne pas élargir le seuil de 2 pts sans donnée croisée augment × build, retirer le code.
- [ ] Prochain sort, plus tard : ordre propre à Mayhem. Aucune source lue à ce jour (arammeta n'a pas de champ compétences dans `champions/{id}.json`). Augments qui changent un sort (Back To Basics) : ignorés.
- [ ] (v1.96 : `gameflow-session-*` et `liveclient-faille*` écrits en Faille aussi, à croiser avec `item_bought`.) Faille, vérifier en vraie partie : la ligne dit-elle « 4e item » au bon moment (`slot` dans `item_bought`) ? Un item de support
  ou de quête fini peut décaler le rang (`itemSlot`). Le fichier `opgg-sample-analysis.json` n'a que 3 items par rang : relire
  ce que renvoie OP.GG sur plusieurs champions avant d'élargir la revue aux items du plan.
- [x] (v1.102, 4 nov.) **Part des dégâts adverses** (`damageSplit`, `damageText`, counters.ts), tous modes, sous « Contre leur équipe ». Vu en lisant les overlays d'OP.GG Desktop (écran de chargement : ratio AD/AP) : l'app calculait déjà ce chiffre pour les menaces sans le montrer, et le Swiftplay n'a pas de champ select. Affichage seul.
- [ ] Part des dégâts, vérifier en vraie partie : le chiffre paraît-il juste contre le récap de fin de partie ? `comp` vient d'arammeta (ARAM) : à regarder en Faille sur un champion hybride. Sans doute à rapprocher de « Menaces, faux profil possible » (1 item fini).
- [ ] OP.GG, à lire au 1er lancement : `opgg-sample-aram-augments.json` (`lol_list_aram_augments`, jamais lu). Ids Mayhem ou ARAM ? `performance` et `tier` plus à jour qu'arammeta après un patch ? Si oui : 2e avis sur les cartes pendant les jours de retard, marqué comme tel, jamais mélangé à `rowValue`.
- [x] (v1.100, 4 nov.) Bilan des achats sur plusieurs parties : **écarté pour l'instant**. 6 achats coûteux sur 32 parties, aucun qui se répète (Thornmail 2 fois, avec 2 conseils différents). À revoir à 100 parties notées.
- [x] (v1.100) **Guide de lane Faille** (`src/core/laneguide.ts`, `ui/LaneGuide.vue`). Pris parce que tout le reste attend des parties, que Celian joue maintenant la Faille (6 Swiftplay, 5 des 30 dernières parties), et qu'en relisant `opgg-sample-matchup.json` les champs du guide étaient nuls à cause de notre appel, Ahri contre Ahri. Rejoint Mobalytics et le « Lane Scouting » de Hexgate par les stats du champion, sans historique d'autres joueurs.
- [ ] Guide de lane, à lire au 1er lancement : `opgg-sample-matchup-ahri-zed.json`. Les conseils sont-ils remplis ? Le `lang: fr_FR` passe-t-il ? `game_lengths` du 1er champion, différent entre les 2 appels ? Si `core_items`, `runes`, `single_items` sont remplis : runes et items propres au matchup, à comparer au build général au champ select.
- [ ] Guide de lane, à mesurer : après 20 événements `lane_guide`, part avec `pace`, `tips`, et `unread` (format d'avantage illisible). Si `pace` sort presque toujours, le seuil est trop bas. Vérifier que `game_length: 0` veut bien dire « moins de 25 min » sur la page OP.GG d'un champion. Jungle : « Jungler adverse » depuis la v1.102, le rythme reste à relire sur une vraie partie.
- [ ] Swiftplay, `position` vide en partie : vérifier sur `liveclient-faille1-*.json`. Si elle est remplie, `guessOpponent` ne sert jamais.
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
  (v1.94, 3 nov.) **Le pool n'est pas trop large** : le module du wiki compte 97 Or, 68 Argent et 71 Prismatiques tirables, contre 87 à 91, 59 à 64 et 66 lus dans `reroll.pool` (cartes déjà vues en moins). Le Chao1 à 65 par rareté était trop bas. Draw Your Sword retirée des mêlées en v1.96 (« only available for ranged champions », seule carte de ce genre au module ; portée lue en partie, 0 au niveau 1, donc pas au 1er choix). Les groupes par champion restent sans source.
  Après 20 tirages, comparer `reroll.pool` (`cards_seen`) à ce chiffre : très au-dessus = pool trop large, pondérer ou couper les cartes estimées.
  (v1.88, 3 nov.) 21 lectures : Or médiane 87 (85 à 91, 13 lectures), Argent 64 (59 à 64, 8). (3 nov., Yasuo) Or 90, Argent 60 à 64, Prismatique 66. L'Or dépasse déjà les 65 estimés, à recompter à 20 tirages complets. Piste : `augments.json` du même dépôt que ci-dessus a des tags `ranged_only` (Draw Your Sword), `needs_cc`, `needs_dash`, `needs_channel`, `champion_specific` sur 223 cartes : assez pour retirer du pool ce qu'un champion ne peut pas tirer, si on sait lire son kit. Dépôt tiers, sans licence vérifiée : à relire avant tout usage, et seulement si le pool se confirme trop large.
- [ ] Reroll, hypothèse à mesurer (recherche du 2 nov., [arammayhem.com](https://arammayhem.com/patch-notes), site tiers, à confirmer) :
  depuis le 26.18 les offres viennent de groupes propres au champion, le 26.14 réduit la répétition des types d'offres, et au 26.21 une
  partie des augments se débloque par la progression de bande. Si Celian n'a pas tout débloqué, `poolValues` compte des cartes qu'il ne
  peut pas tirer. Mesure : augments du pool jamais vus dans `cards_seen` après 150 tirages. Rien à changer avant.
- [x] (v1.107, 4 nov.) **Command Line reconnu par les cartes** (`rarityJump`, headliner.ts ; `Engine.noteRarityJump`). Mesuré avant d'écrire : raretés du wiki sur les 33 revues, 5 parties à 3 ou 4 tirages avec le motif, 0 sur 75 tirages ailleurs, 1 cas isolé (Xin Zhao 8034983909, Flow of Spirit : Or au wiki, Argent aux notes du 26.21, et une relance de Silver restée en Silver au choix 2). L'attente de « raretés à jour » est levée : la tier list du Mac est celle du patch, le wiki la contredit = pas de rareté.
- [ ] Command Line, à mesurer : `rarity_jump` dans `usage.json`. `known` autre que `commandline` ou `null`, ou `stayed: true` = motif hors Command Line : si ça revient sans carte nouvelle au patch, resserrer (2 tirages au lieu d'un). `roll` : 1 attendu, 2 ou 3 = la montée n'est pas toujours sur la 1re relance, voir « Command Line, à mesurer » plus bas et `stayed`, qui suppose le contraire. Rareté de Flow of Spirit (3085) à lire dans la tier list.
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
- (3 nov., 19 h 22 UTC, v1.93, Xin Zhao) 1 `headliner_miss` de plus, 46 lectures, `near` vide. 3 ratés en tout depuis le début du compte, à revoir si ça continue.
- [x] (3 nov.) Taux de lecture du headliner : 13 lus, 2 ratés. Pas besoin d'agrandir la zone lue. Un des 2 ratés (2 nov. 15 h 40) a été lu 1 s plus tard : c'est la partie du faux headliner possible ci-dessous.
- [x] (v1.95, 3 nov.) **Faux headliner, cause trouvée** : « Heartsteel » lu 121 s après le début sur la partie Rell 8035073521, 30 s après le `headliner_miss`, sans carte à l'écran, Heartsteel conseillé depuis le début et acheté dans la minute. Les 2 parties notées `heartsteel` ont l'item 3084 dans le build (Rell, Taric 8033768614), aucune vraie bannière HEARTSTEEL n'a donc jamais été confirmée. Les 2 vraies lectures du journal (K/DA, Space Groove) tombent 8 et 5 s avant les 1res cartes, et les 2 lectures postérieures à un raté étaient fausses. `bannerOpen` (headliner.ts) : 90 s, ou 30 s après les 1res cartes. Les étiquettes déjà écrites restent.
- [ ] Bannière, vérifier après relance : `headliner_late` dans `usage.json`. Un texte de bannière là-dedans (`Space Groove`, `KDA`) = fenêtre trop courte. Reste possible : « Heartsteel » lu dans la boutique pendant les 90 s, à regarder si un `headliner_seen` HEARTSTEEL ressort sur une partie avec l'item au plan. Une vraie bannière est peut-être en capitales (« HEARTSTEEL ») : noter le texte exact, il pourrait séparer les deux cas.
- [ ] Taux de lecture à refaire : le « 13 lus, 2 ratés » du 3 nov. compte ces faux. Journal depuis 17 h 43 UTC : K/DA lu, Disco lu, Xin Zhao raté, Rell raté en réalité. 2 sur 4. À recompter sur 10 parties à partir de la v1.95 ; si les ratés restent à `near` vide, capturer la zone de la bannière (HEARTSTEEL et Bees ont peut-être un logo illisible).
- [ ] Faux headliner possible (2 nov.) : « Space Groove » lu 90 s après le début d'une partie où Vision a aussi lu
  « HEARTSTEEL Sett » : ce sont peut-être des noms de skins. v1.62 : retiré si le `skinName` d'un joueur commence par ce
  texte. À relire dans le journal (« Headliner … retiré ») avant d'utiliser le headliner dans le classement.
- [ ] Headliner, tranche suivante : Command Line fait (conseiller de reroll, v1.65). Reste HEARTSTEEL : **bloqué** (3 nov., revu le soir). Seul fait nouveau : les membres du groupe posent des « Stickers » sur des augments, chacun avec son bonus, liste non publiée ([Hexgate](https://hexgate.app/blog/aram-mayhem-season-3/)). Aucune source ne dit quelles cartes changent ni comment ([Inven](https://www.invenglobal.com/articles/27480/35-new-augments-kda-and-pentakill-arrive-in-lol-aram-mayhem), [boostroom](https://boostroom.com/blog/lol-aram-mayhem-patch-2621-guide-best-augments-headliners-and-rewards), wiki) et Vision ne lit que les titres. Pour avancer : capturer le texte d'une carte sur une partie HEARTSTEEL.
- [ ] Command Line, à mesurer : les notes disent « one rerolled Augment » à chaque choix, pas « la 1re relance » ([arammayhem.com](https://arammayhem.com/patch-notes), site tiers). L'app suppose la 1re (`!draw.rolled.size`), d'après 9 écarts à la 1re relance. Sur 5 parties Command Line avec `rarity` dans `cards_seen` : quelle relance monte ? Une carte montée au hasard change `adviseReroll`.
- [x] (v1.73) **Superfans (26.22) et tirages hors paliers** (`extraDrawAt`, headliner.ts). Trouvé le 3 nov. dans les données PBE publiées par [DeepARAM](https://github.com/nicothomas02/DeepARAM/pull/384) : niveau max 21, plus d'XP, augment en plus au niveau 21. Pris parce que tout le reste attend des parties, et que le patch sort le 4 nov. En lisant le lecteur de cartes : il dort après le choix 4 + 3 min, donc niveau 21, Pentakill niveau 18 et K/DA n'étaient lus que par chance.
- [x] (v1.99, 4 nov.) **Notes officielles du 26.22 lues** ([Riot](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/), WebFetch passe enfin). Superfans absent : ni headliner nouveau, ni niveau 21, ni niveau max. La dernière page de Journey to Stardom ouvre, avec 2 augments (One Hit Wonder, RISE!). Sortie possible au 26.23 ([Hexgate](https://hexgate.app/blog/aram-mayhem-season-3/)) : relire chaque note de patch, et ne pas conclure à un raté de lecture avant ça. Le code reste, il ne coûte rien.
- [x] (v1.99) **Cartes et champions modifiés au patch** (`src/core/patchchanges.ts`). 13 cartes, 13 champions, Hecarim en Mayhem. Pris parce que le reste attend des parties, que « Jour de patch, à vérifier » demandait de lire les notes, et que le 26.22 baisse des cartes haut classées (Weapon of Destiny, Armored Impact) pendant qu'arammeta reste au 26.21. 4 tirages sur 45 touchés (BEES!!! 2, Ravenous Bind 2, Soul Eater 1). Zéro effet sur le classement.
- [ ] Patch, à mesurer : `changes` dans `cards_seen`, joindre `card_picked` et le résultat. Si une carte ▼ reste « À prendre » et perd nettement, voir si on peut retirer un chiffre. Délai réel d'arammeta : combien de jours avant le passage au 16.22 ? Regarder aussi l'échantillon des 1ers jours : les étiquettes tombent dès qu'arammeta change de patch, même sur peu de parties.
- [x] (v1.101, 4 nov.) **Patch en Préparer et en Faille**. Pris parce que le reste attend des parties (aucune partie depuis le 3 nov., 22 h 03 UTC). OP.GG donne son patch dans `trends.win[].version`, déjà renvoyé par notre appel (`desired_output_fields: ["data"]`). Un outil de relevé n'en vaut pas la peine, la table se remplit à la main en 10 min.
- [ ] Patch Faille, à mesurer : `opgg_patch` dans `usage.json`, délai réel d'OP.GG après un patch. S'il passe au nouveau patch en moins d'un jour, la ligne ne se verra presque jamais : la garder à l'écran quelques jours de plus, marquée, plutôt que la retirer. Vérifier aussi sur une vraie réponse que `trends.win` dit bien le patch des stats, et pas seulement la date du relevé.
- [x] (v1.104, 4 nov.) **Carte sans stats** : une carte absente de la tier list (One Hit Wonder, RISE! tant qu'arammeta est au 16.21) mettait tout le tirage en « Données insuffisantes », relance comprise. `estimatedRows` saute ces cartes. Elles restent hors classement, le conseil compare les 2 autres, relance jamais sur elles (`measuredCards`, reroll.ts). Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC, app en v1.93) et que le 26.22 rend le cas réel dès aujourd'hui. Fréquence attendue : 2 cartes sur environ 236 tirables, soit environ 1 tirage sur 40 sans compter les relances, à chaque patch qui ajoute des cartes.
- [ ] Carte sans stats, à mesurer : `noStats` dans `cards_seen`, joindre `card_picked` et le résultat. Si `noStats` reste après le passage d'arammeta au 16.22, la tier list ne les a pas : voir OP.GG (`opgg-sample-aram-augments.json`). One Hit Wonder : le texte dit « [Ability] », à vérifier sur une capture s'il y a une carte par sort (plusieurs noms ou ids), `patchchanges` passe par le nom. Les 2 textes manquaient au module du 3 nov. : `fitFor` ne dira rien tant que le wiki ne les a pas, et une carte d'accélération (One Hit Wonder) mériterait le tag `haste` dès qu'il les a.
- (4 nov., v1.104) OP.GG Desktop, overlays relus ([page](https://op.gg/desktop/en/overlays/lol)) : timers de camps, d'inhibiteurs et de reliques exclus par la règle 1 ; augments, ordre des sorts, builds, or et objets, AD/AP déjà là ; suivi des soins déjà couvert par `Anti-soins` ; nombre de balises de contrôle posées par ton équipe, sans valeur pour gagner en Mayhem ni en Swiftplay. Dernière version du 28 oct., sans détail lisible. Rien sur le 26.23 dans la recherche.
- [x] (v1.106, 4 nov.) **One Hit Wonder et RISE! jugées avec ta partie** (`src/core/cardhints.ts`) : accélération lue, items d'accélération au plan, nom de ton ultime, sur la carte. Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC, app en v1.93), et que ces cartes sans stats ne donnaient que « À juger ». Accélération lue en Mayhem sur 8 captures : 15 à 65. Zéro effet sur le classement.
- [ ] Cartes selon ta partie, à vérifier : `hints` dans `cards_seen`, la ligne sort-elle sur One Hit Wonder et RISE! ? `displayName` de R est-il le bon nom (Rell : Magnet Storm, vu) ? Après les stats d'arammeta : One Hit Wonder gagne-t-elle plus avec une accélération haute (`fit`, tag `haste`, quand le wiki aura le texte) ?
- [ ] Patch, table sans items : Overlord's Bloodmail AD 30 → 40 (Retribution 12 → 10 %), Doran's Bow 8 → 7 au 26.22. À ajouter seulement si un item conseillé change vraiment de valeur : ce sont les builds OP.GG et arammeta qui décident.
- (4 nov.) La section « Classic » des notes 26.22 n'est pas la Faille : mode à part, avec son propre pass (Volibear, Swain, Elise y entrent). Ne pas la copier dans `champions`.
- (4 nov., v1.100) TFT : client autonome sous Unreal Engine ([rdy.gg](https://rdy.gg/en/lol/news/tft-moves-to-unreal-engine)), donc pas `LeagueClientUx` a priori, nom du process toujours inconnu. Risque faible, rien changé. Notes du 26.22, reste : Overlord's Bloodmail AD 30 → 40, Doran's Bow 8 → 7, pas dans `PATCHES` (la table n'a pas d'items). Une section « Classic » change Amumu, Ezreal, Nami, Olaf et d'autres : ne touche pas ces modes.
- (4 nov., v1.101) TFT, clos : client autonome prévu le 3 nov., et TFT perd macOS à son patch 18.1 ([FAQ Riot](https://support.riotgames.com/en-us/tft/client/tft-unreal-engine-migration-faq)), retour natif annoncé tôt dans le set. Rien à craindre sur le Mac de `parseProcessArgs` pour l'instant ; à revoir si TFT revient sur Mac et que l'app ne trouve plus le client.
- (4 nov., 10 h 30 UTC, v1.109) Rien sur le 26.23 ni sur un micro-correctif du 26.22 ; arammayhem.com s'arrête encore au 26.21.
- (4 nov., 13 h 30 UTC, v1.112) [Calendrier](https://www.esports.net/news/lol/lol-patch-schedule/) : 26.22 le 4 nov., 26.23 le 18 nov., 26.24 le 9 déc. (dates de Riot, Pacifique). Inutile de chercher les notes du 26.23 avant le 16 nov. Hexgate et OP.GG : rien de nouveau repéré.
- (4 nov., 7 h 30 UTC, v1.106) Rien sur le 26.23 ni dans la recherche ni sur les concurrents ; RISE! et One Hit Wonder toujours absents du wiki.
- [ ] 26.22, à regarder : Butcher's Bridge et Koeshin's Crossing reviennent : `map` de `gameflow-session-*` sur une de ces parties, les file et `mapId` changent-ils ? Overextender (Cannon Launcher) n'y sort que là, à compter dans `cards_seen`.
- (3 nov., 23 h 30 UTC, v1.98) Notes officielles toujours absentes de la recherche.
- (3 nov., 22 h 30 UTC, v1.97) Notes officielles toujours absentes de la recherche.
- (3 nov., 21 h 30 UTC, v1.96) Notes officielles toujours absentes de la recherche ; arammayhem.com s'arrête au 26.21, Mobalytics au 26.07.
- (3 nov., 20 h 50 UTC, v1.95) L'URL officielle des notes du 26.22 sort enfin dans la recherche, mais la page est refusée d'ici. Hexgate encore en aperçu : One Hit Wonder = +75 % de dégâts par 100 d'accélération, le sort n'en profite plus ; RISE = relance sous 5 s après un kill, +25 % à chaque relance, 2 relances max. Rien sur Superfans.
- (3 nov., 19 h 30 UTC, v1.94) Notes officielles toujours absentes de la recherche. One Hit Wonder, RISE et Superfans pas encore au module du wiki.
- (3 nov., 18 h 30 UTC, v1.91) Notes officielles toujours refusées d'ici, absentes de la recherche.
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
- [ ] K/DA, coût de la lecture toutes les 5 s (1 partie sur 2, Yasuo : 5e augment lu, saccades à demander à Celian) : vérifier dans le journal que le 5e augment est lu (2 parties suffisent) et que le jeu ne saccade pas. Sinon passer à 10 s (`KDA_SCAN_MS`, cardreader.ts).
- [ ] Niveau 19 à 21 hors Superfans : 3 parties d'oct. (8022350911, 8022289994, 8021825913). Deux ont Infinite Recursion (1388), la 3e non : cause inconnue. Texte lu (v1.86, wiki de juin 2026) : Infinite Recursion = 60 d'accélération, +3 par élimination, rien sur les niveaux. Cause toujours inconnue : ne pas se servir du niveau pour reconnaître Superfans.
- (3 nov., v1.86) One Hit Wonder : « Ability Haste » dans le texte donne bien le tag `haste`, testé sur l'effet lu au PBE, à refaire sur le vrai texte. RISE : aucun tag, donc aucune correction.
- [x] (v1.99) Refonte de Mel : signalée au champ select. Notes lues : One Hit Wonder = conforme au PBE ; RISE! ≠ PBE, ultime seulement, 3 relances, pas de +25 %. Aucun tag pour RISE!, pas de notion d'ultime dans `augfit.ts` : la carte vaut plus sur un ultime qui tue, l'app ne le sait pas. Les 2 cartes ne sont pas encore au module du wiki au 3 nov. : `cards_seen.noText` dira quand.
- [x] (v1.13) **Augments nouveaux du 26.21** (35 ajouts) : peu de parties dans arammeta. Les signaler « nouveau, peu de
  données » (g < 300) plutôt que les classer comme les autres.

- [x] (v1.16) **Panneau sur téléphone** (serveur HTTP local lecture seule + QR code). À vérifier sur le vrai
  réseau : pare-feu macOS, IP détectée (`lanAddress`), affichage iPhone/Android.

- [x] (v1.17) **Winrate par moment du choix** (arammeta `slots` : par champion dans `top/bot`, global dans
  `tier-list.augs[].slots` = [g, wr, lift, exact]). Choix détecté via `activeplayer.level` (1 + niv≥7 + niv≥11 + niv≥15).
  À vérifier en vraie partie : que `level` est bien présent dans activeplayer.

- [x] (v1.19) **Échanges avec les alliés** (`session.trades[]` state AVAILABLE → POST `/lol-champ-select/v1/session/trades/{id}/request`).
  À vérifier sur le vrai client : format de `trades` et réponse du POST.
- [x] (v1.74, **retiré en v1.93**) Timers des sorts ennemis démarrés à la main : interdits par Riot, voir règle 1 d'AGENT.md.
- [x] (v1.75) **Écart d'objets** (`src/core/goldgap.ts`, `ingame/GoldGap.vue`, `ingame/GoldGapTable.vue`), tous modes. Hexgate l'a gratuit (« Scoreboard gold » sur Tab, [hexgate.app](https://hexgate.app/blog/aram-mayhem-season-3/)), l'app n'avait rien sur l'état des forces. Pris parce que tous les items au-dessus attendent des parties, le 26.22 ou un accord (3 nov.). Affichage seul, jamais de conseil d'engager ou de reculer.
- [x] (v1.87) Objets adverses de `playerlist` : ils suivent les achats. Les captures sont prises mort ou en base, et les 10 inventaires changent à chaque choix. `position` = `NONE` en Mayhem, `runes` = `null`. 0 objet sans prix en répétition (catalogue simulé : `unknown` réel à lire dans `gold_gap`, non noté).
- [ ] Écart d'objets, `position` en Swiftplay : remplie ? Depuis la v1.96, se lit dans `players` de `liveclient-faille1-*.json` et `liveclient-faille2-*.json` (2 et 15 min, Faille seulement). Les parties Swiftplay d'avant (Lillia, soir du 3 nov.) n'ont aucune capture : l'app tournait en v1.93.
- (v1.79) `unknown` en partie : dans tes objets capturés, seuls 228002 Wooglet's Witchcap (6 000) et 220013 Poro-Snax (0) sont hors catalogue probable, couverts par le repli sur `price`. Reste à voir sur les objets des autres joueurs.
- [ ] Écart d'objets, à calibrer : après 30 événements `gold_gap`, winrate selon l'écart à 10 et 15 minutes, et par mode. Remplacer `EVEN_SHARE` et `EVEN_MIN` (goldgap.ts, 3 % et 500 or, choix prudents). Ne pas en faire un conseil.
- [x] (3 nov., écarté après mesure) Rappel « augment en attente » : le choix ne s'ouvre que mort ou en base depuis le 26.06 ([guide](https://guides-factory.com/guides/lol-aram-mayhem-guide)). Sur 59 choix aux niveaux 7, 11, 15 : médianes 28, 8 et 10 s entre le palier et la 1re lecture, p75 50 s, max 165 s. Celian choisit vite, rien à gagner. Compter les paliers sans lecture si ce chiffre sert ailleurs : la lecture dort 180 s après le palier, les retards plus longs ne se voient pas.

- [x] (v1.77) **Collection de champions** (`src/core/pool.ts`, `ui/PoolPanel.vue`). Trouvé le 3 nov. sur le [wiki ARAM](https://wiki.leagueoflegends.com/en-us/ARAM) : cartes tirées dans ta collection + rotations, banc limité à ta collection, 3e carte 5 à 30 % selon le nombre de champions. Plus de relance de champion depuis la V25.13 (`rerollsRemaining` 0 sur 27 captures). Pris parce que tout le reste attend des parties, et que le winrate du champion est le levier mesuré le plus fort (60 % contre 42 %).
- [x] (v1.87) Collection vue en vrai : 254 sur 254, 0 gratuit, `pool_outside` vide, rien de filtré. 254 dépasse le nombre de champions du jeu : la liste contient autre chose (ids de modes ?), sans effet tant que tout est possédé. Ne compter que si Celian a un jour des champions manquants.
- [ ] Collection, plus tard : prix en essences (endpoint non identifié) pour classer par gain / coût. Hypothèse à vérifier : le wiki dit « up to 100 total » pour les champions proposés ; si c'est un plafond du pool tiré, le calcul de `poolReport` change.
- [x] (v1.78) **Mise à jour prête, relance en un clic** (`src/core/appversion.ts`, bloc en bas à gauche de `App.vue`). Pris parce que tous les items au-dessus attendent une partie sur une version récente : 14 versions non lancées depuis le 2 nov. 16 h 55 UTC. Plus `app_start` et les 10 joueurs dans `liveclient-choix*`.
- [ ] Relance, vérifier sur le Mac : le bouton rouvre-t-elle l'app (lanceur .app, puis agent launchd) ? La position des fenêtres et le panneau téléphone reviennent-ils ? La notification sort-elle au salon ? Après 10 versions : délai entre le dépôt et le `app_start` suivant. Testé seulement sous Linux.
- [x] (v1.87) Écart d'objets et sorts ennemis lus dans `players` : voir plus haut. Hubris vaut 126697 chez tous les joueurs en Mayhem (Jarvan IV aussi) : cet id ne dit pas qu'« Upgrade Hubris » a été pris.
- [ ] Repéré chez Hexgate le 3 nov. : « Lane Scouting » (habitudes de début de partie de l'adversaire de lane, écran de chargement, offre payante) et « Match Breakdown » (pourquoi tu as gagné ou perdu). Le premier suppose l'historique d'autres joueurs : à relire contre la politique Riot avant tout travail, et seulement quand Celian jouera la Faille en classée (3 parties Swiftplay à ce jour). Le second recoupe la revue de partie existante.
- [x] (v1.80, écarté après mesure) « Loading Screen Scouting » de [Blitz](https://blitz.gg/lol/overlays), limité à ton historique contre ces champions. Rejoué dans l'ordre sur 80 parties Mayhem détaillées, avec le bilan d'avant chaque partie et 4 parties minimum : 47 lignes, 33 parties touchées, 12 lignes avec un signal (Wilson 80 %), « mauvais » 4 V sur 8, « bon » 3 V sur 4, base 47,5 %. Avec les alliés : 15 lignes, 5 signaux. Rien de prédictif, et 140 champions différents pour 80 parties. À relire à 300 parties. Ennemis, profil et menaces sont déjà dans `Counters`, le matchup Faille au champ select.
- [x] (v1.103) **Repère CS de Blitz et Mobalytics, 1re tranche** (`src/core/lanecs.ts`, `ingame/LaneCs.vue`) : tes CS contre ton adversaire de lane et CS/min, Faille, hors soutien. Pris parce que tout le reste attend des parties (rien depuis le 3 nov. 22 h UTC) et que la condition « des parties Faille » est levée (6 Swiftplay). Sans source externe : OP.GG n'a aucune moyenne de CS (`opgg-tools.json`, `AverageStats` : play, win_rate, kda…), et les chiffres par rang trouvés sont des articles non datés.
- [ ] CS de lane, vérifier en vraie partie : le chiffre suit-il le tableau des scores, y compris pour l'adversaire (`cs` dans `liveclient-faille*.json`) ? L'adversaire deviné est-il le bon en Swiftplay ? Si `creepScore` adverse manque, l'app n'affiche que tes CS.
- [ ] CS de lane, à mesurer : après 20 événements `cs_gap`, winrate selon l'écart à 10 minutes. S'il ne sépare rien, passer la ligne en repliée. Une lane échangée fausse l'écart : à regarder sur les `guessed`.
- [ ] CS de lane, tranche suivante, si `cs_gap` montre un intérêt : ta moyenne perso par rôle (`HistoryGame.position` rempli depuis la v1.108, sur toutes les parties Faille jouées avec Châtiment ou avec le rôle du salon ; 6 parties Faille : 2,7 à 6,6 CS/min).
- [ ] League Classic, vérifier si Celian y joue : nom de la file dans `gameflow-session-*.json` (`queue.description`, vide de capture à ce jour), `gameMode`, id. Le dépôt [riftglass](https://github.com/TobiasPol/riftglass/pull/1) la dit absente de `queues.json` et reconnue à son nom ; ce nom exact est supposé. Rappel [Overwolf](https://dev.overwolf.com/ow-native/guides/game-compliance/riot-games/) : ni Brawl ni League Classic, ni alertes de pic de puissance, ni notifications qui dictent une action selon l'état de la partie. Les notifications « Prends … » choisissent une carte à l'écran, à relire si Riot précise cette règle.
- [ ] Si une file Faille légitime disparaît (`modeOf` rend `null` sur `CLASSIC` à id inconnu) : l'ajouter à `SR_QUEUES`. Vu aucune parmi les files connues à ce jour.
- [x] (v1.80) **Jour de patch**, 3 trous vus en relisant `checkPatch` à la veille du 26.22 : timers sur le Data Dragon d'arammeta (`ddragonCandidates`, `CooldownData.loadAny`), détail d'un champion gardé 12 h sur disque après un rechargement forcé (`Arammeta.freshDetails`), retard des stats visible seulement dans Réglages (`statsBehind`, store.ts, bandeau au champ select). Pris parce que tout le reste attend des parties.
- [ ] Jour de patch, vérifier après la mise à jour du client (notes lues, voir plus haut, reste le reste) : « Client en … » dans le journal et Réglages, format réel de `/lol-patch/v1/game-version` (supposé 16.22.x, jamais capturé), délai réel d'arammeta et de Data Dragon. Si l'app reste longtemps avec un patch de retard, voir si les stats du patch d'avant peuvent peser moins sur les champions modifiés (notes du patch à lire, rien d'automatique aujourd'hui). Échantillon d'arammeta dans la fixture du 26.21 : 30 000 à 50 000 parties par champion ; à mesurer sur les premiers jours du 26.22 avant de penser à un lissage.

- [x] (v1.81) **Sac plein** (`consumedBy`, `itemToSell`, nextbuy.ts). Trouvé en relisant les captures : 8 sur 20 au niveau 15 ont 6 places prises (toutes avec au moins un composant), 23 conseils sur 128 du journal sur sac plein, or inutilisé jusqu'à 3 996. Pris parce que tout le reste attend des parties, et que ça touche Mayhem à chaque fin de partie. Mesure sur des captures, le gain en parties reste inconnu.
- [ ] Sac plein, vérifier en vraie partie : le conseil vendre / terminer tombe-t-il juste (journal « sac plein ») ? Une potion ou un objet Mayhem proposé à tort ? Après 20 parties, lire `bag_full` : part de `blocked`, or moyen, part avec `sell: null`.
- [ ] Sac plein, à mesurer : `sell: null` fréquent = 6 items finis avec de l'or qui dort. Ce serait la question suivante (quel item remplacer, bottes comprises), à étudier seulement avec une source qui compare des builds à 6 items. Rien aujourd'hui.
- [x] (v1.82) **Revente dans l'or disponible** (`resaleFor`, nextbuy.ts ; `CooldownData.sellValue`). Taux jamais supposé : `gold.sell` de Data Dragon, objet par objet. Pris parce que tout le reste attend des parties, et qu'on n'achète qu'en base : combler 200 or avance un item d'une mort. Fréquence non mesurée : les captures n'ont ni le plan ni l'or à chaque mort.
- [ ] Revente, vérifier en vraie partie : journal « Revente : … », valeur affichée par l'app contre celle de la boutique (Data Dragon lu de nulle part depuis les sessions : `gold.sell` jamais vu en vrai, ni sur un objet Mayhem). Après 20 événements `resale` : `full`, écart moyen, et l'item acheté juste après dans `item_bought`. S'il sort presque jamais, le laisser tel quel, il ne coûte rien.
- [x] (v1.87) Revente limitée, après mesure : le cas redouté est sorti dès la 1re partie (Last Whisper vendu 1 015 or pour un Executioner's Calling à 800, puis Dominik's terminé). Vente seulement vers un item fini ; avec de la place, seulement un objet de moins de 200 or (`SPARE_MAX`) ; jamais l'item qui couvre une menace (`guard`). Sac plein : une menace ne passe devant que ce qui tient (`rank`), `room.held` quand un composant attend, `upgrade` propose Mortal Reminder quand Executioner's est dans le sac.
- (3 nov., soir, v1.93, 2 parties Gwen et Rell) `resale` : 4 fois, que des potions, pour 12 à 55 or. Sur Gwen, 3 conseils de vendre la Refillable Potion, elle est restée dans le sac. Rien de faux, mais à relire avec plus de parties : si Celian ne vend jamais sa potion, cette ligne ne sert à rien. `elixir` : 3 conseils, 0 achat vu.
- [ ] Revente v1.87, vérifier en vraie partie : lire `resale` (ne devrait plus viser que des sacs pleins et des potions), et le journal « sac plein, composants gardés ». Si `held` sort souvent avec beaucoup d'or, chercher quel item finir : l'app ne le sait que s'il est dans `seq` (cores, options, menaces).
- [x] (v1.91, 3 nov.) **Menace repoussée si elle coûte clairement plus** (`threatCost`, nextbuy.ts). Compté dans `buys` de l'historique sur 4 parties (Tahm Kench, Jhin, Xin Zhao, Yasuo) : 9 lignes contre l'équipe hors bottes, 0 item acheté tel quel, 2 couverts par un autre item de la même menace. Pris avant les 20 parties prévues : le cas Tahm Kench est net, et la règle ne joue que sur un écart net. Rejoué à la main sur les 6 lignes chiffrées : seule Iceborn sur Tahm Kench bascule à coup sûr.
- [ ] Menaces, à mesurer : après 20 parties, lire `threat_deferred` (`value`, `byValue`), joindre `item_bought` et le winrate. Si les menaces restantes sont encore toutes ignorées, regarder les 3 lignes sans winrate (`recoValue` absent : Executioner's Calling sur Jhin…) : elles gardent leur place faute de mesure.
- [x] (v1.106, 4 nov.) Menaces, faux profil : **fausse alerte**. Sur `liveclient-choix*` de la partie Yasuo, Ezreal a Luden's Echo + Void Staff, magique est juste ; Trinity + Shojin sont à Smolder, mal attribués à la lecture de la v1.91 (`players` porte `champion`, à utiliser). 20 ennemis de 4 parties au niveau 7 : 0 premier item fini qui contredit le kit. `compFromItems` reste à 2 items.
- [x] (v1.97) Libellé faux, vu au journal (3 nov., Gwen, Rell) : « Rabadon's Deathcap (3e item (60 %)) », « Warmog's Armor (3e item (55 %)) » avec 5 items déjà finis. En Mayhem, `option` reste « 3e item » à tous les rangs (`nextBuys`, `engine.ts`, labels) et le chiffre est celui du 3e rang. Dire « option du build » dès que `itemSlot` dépasse 3. Une ligne, reportée pour rester à 2 changements par session.
- (3 nov., v1.95 lu sur Gwen et Rell) Élixir 3 conseils, 0 achat. Revente 4 conseils, potions seulement, 0 suivie. `skills_taken` `off` 2, 0, 0, 1.
- [ ] Lecture : Jhin, choix 2, « Upgrade Collector · escAPADe » lu une seule fois, 2 cartes sur 3, pas de `card_picked` round 2. 1 choix sur 8 sur ces parties. Voir si ça se répète (`Upgrade` long en largeur ?).

- [x] (v1.83) **Combos champion + augment** (`src/core/combos.ts`, [arammayhem.com/data](https://arammayhem.com/data/), CC BY 4.0, 457 lignes). Seule source d'interactions de kit et d'augment × augment lue à ce jour, arammeta n'en a aucune. Mesuré sur le journal (23 parties, 220 tirages) : 25 tirages touchés, 3 combos solo tous non conseillés, 0 piège, 2 plans utiles. Pris parce que tout le reste attend des parties.
- [x] (v1.85, 3 nov.) **Élixir quand il ne reste rien à acheter** (`src/core/elixir.ts`, `ui/ElixirLine.vue`). Pris parce que tout le reste attend des parties, et que « sac plein, à mesurer » ouvrait la question de l'or qui dort : 55 parties Mayhem sur 80 finissent à 6 items finis, surplus médian environ 3 600 or (prix estimés).
- [x] (v1.86, 3 nov.) **Tags des augments sur le vrai texte** (`plainText`, `tagsOf`, augfit.ts). Parti de « vérifier que `augfit.ts` classe bien One Hit Wonder ». Les regex n'avaient été testées que sur des descriptions écrites à la main : `\bheal` prenait `health`, le gras `'''bonus'''` cachait `bonus armor`, `attacks? ` prenait `attack damage`, `crit` prenait `critters`, `cooldown` prenait tous les délais. Malus jusqu'à −4 pts à tort. 80 lectures sur 235 touchées, effet réel sur le conseil non mesuré. Pris parce que tout le reste attend des parties.
- [ ] Tags, à mesurer : après 50 tirages avec `fit` dans `cards_seen`, part des tirages où `fit` change le `best`, et winrate de ces choix. Nouveauté à surveiller : 37 cartes de tank au lieu de 11, +1,5 à +2,5 pts sur build tank, alors que leur winrate reflète déjà des tanks. Si les tanks prennent toujours la même carte, baisser ce bonus.
- [x] (v1.88, 3 nov.) Tags, reste faux : Get Excited et Critical Healing corrigés, 65 textes de plus relus (`data/augments.json` de `kiwiiiii-eth/aram-mayhem-analyzer`, 223 cartes). 12 cartes changent, 15 lectures sur 771 du journal. Pris parce que tout le reste attend des parties.
- [x] (v1.94, 3 nov.) Tags, cartes sans texte : **fini**, sur `probe-output/wiki-mayhem-augments.lua` (249 cartes, 0 absente sur 336 cartes vues aux revues). 10 cartes corrigées, 20 cartes vues sur 336 : BEES!, Hellbent, Heavy is the Crown, The Boom and the Bass, Take'em Down Down Down, Tickle Monster, Gift of the Drowned, Glass Cannon, Snowday, Spin to Win. Get Jinxed, Brass Blast et Totentanz n'ont que `geteffect` comme texte : aucun tag, ce qui est juste. 49 cartes de la copie de juin ne sont plus au module (Dropkick, Poro Blaster, Upgrade Hubris, Mikael's, Thornmail…), aucune vue en partie : ne pas les rechercher.
- [x] (v1.94, 3 nov.) Cartes qui ne sortent pas retirées du pool de relance (`neverDrawn`, `AugmentInfo.drawable`) : 11 cartes dites désactivées par le wiki et Flashbang (exige Flashy). Sur 336 cartes vues : 0 fois ces 12, environ 20 attendues à tirage uniforme, le wiki dit vrai.
- [x] (v1.94, 3 nov.) Cartes liées à un item sans le mot « Upgrade » lues dans le texte : Steel Your Heart (Heartsteel), Wooglet's Witchcap (Rabadon's + Zhonya's), Icathia's Fall (Sunfire + Hollow Radiance), et Upgrade Sword of Blossoming Dawn, ajoutées à `BOUND`. Ultra Hydra confirmé par le texte (Profane, Ravenous, Titanic).
- [x] (v1.98) Quêtes à 2 ou 3 items : `boundTarget` pousse chaque item (`quest`), `questDone` voit la conversion sans connaître l'id de la récompense (item vu puis disparu), `gone` empêche le plan de les reconseiller. 3 parties sur 147 (Ultra Hydra 1, Witchcap 2).
- [ ] Quêtes, vérifier à la 1re vraie partie : `item_bound` ne garde que le dernier item visé. Un item annulé (Ctrl+Z en boutique) passe pour converti et sort du plan jusqu'à la fin de la partie. Noter les ids de Void Immolation et d'Ultra Hydra à la 1re capture et les mettre dans `reward`.
- [ ] Sword of Blossoming Dawn : id 124011 pris dans `itemLut`, comme Rite of Ruin (123430, vu en vrai). L'item lui-même n'a jamais été vu dans une capture.
- [ ] Élixirs, vérifier en vraie partie : la boutique Mayhem les vend-elle (`maps` 12 ne prouve que l'ARAM) ? Journal « Élixir conseillé » / « Élixir acheté », effet affiché, sac plein bu à l'achat. Bu mort : le wiki dit que Sorcery attend la réapparition, l'app suppose la même chose pour les 3. Un seul effet à la fois, achat bloqué 5 s après un autre.
- [ ] Élixirs, à mesurer : après 20 parties, événements `elixir` de `usage.json` : part de conseils suivis, or au conseil, winrate des parties à 6 items finis avec ou sans. Niveau 9 en Mayhem : atteint bien avant la fin du build, à confirmer. Élixir gardé dans le sac (pas sac plein) : non suivi, l'app n'en reconseille pas tant qu'il y est.
- [ ] Élixirs, plus tard : à 6 items et beaucoup d'or, remplacer les bottes ou un item ? Toujours aucune source qui compare des builds à 6 items.
- [x] (v1.112, 4 nov.) **Enclumes de stats** (`src/core/anvil.ts`, `ui/AnvilLine.vue`, `Engine.anvilPanel`) : 750 or, stat permanente, sans place au sac, Mayhem seulement. Passent avant l'élixir, qui ne sort que s'il reste de quoi prendre les deux. Trouvé en cherchant une réponse à l'or qui dort : aucune session ne les avait vues, alors que 3 cartes (Stats!, Stats on Stats!, Stats on Stats on Stats!) en parlent au module. Pris parce que tout le reste attend des parties (aucune depuis le 3 nov., 22 h 03 UTC). Sources : [notes du 25.23](https://arammayhem.com/patch/25-23/), Data Dragon 16.21 (220008 Anvil Voucher, 750 or, carte 12), [wiki Arena](https://wiki.leagueoflegends.com/en-us/Stat_Bonus). `Stat_Bonus_(ARAM:_Mayhem)` refuse WebFetch.
- [ ] Enclumes, vérifier en vraie partie : la boutique Mayhem montre-t-elle bien l'enclume, à quel niveau (9 selon Riot, 16 selon [des joueurs](https://reddit.sentinel-team.org/posts/1sqxnu6/snapshots/2026-04-20T18%3A34%3A39.717245Z)) ? Si c'est 16 : passer `ANVIL_LEVEL` à 16, sinon l'or est réservé pour rien entre 9 et 15 et l'élixir disparaît. Prix toujours 750 ? Le bon nom et la bonne icône (220008, jamais vu dans une capture) ? L'id entre-t-il dans le sac, même un instant (`sameBag` rate alors l'achat) ? « Enclume achetée » doit suivre chaque achat au journal.
- [ ] Enclumes, à mesurer : après 20 parties, événements `anvil` : part de conseils suivis, enclumes par partie, or au conseil, or restant à la fin. Winrate avec ou sans sur les parties à 6 items, sans conclure sous 50 parties. Si l'or dort encore, voir si la ligne doit sortir plus tôt.
- [ ] Enclumes, plus tard : à prendre avant le dernier item ? [Avis opposés](https://reddit.sentinel-team.org/posts/1sqxnu6/snapshots/2026-04-20T18%3A34%3A39.717245Z), aucune mesure, résultat lié au tirage. Lire la table Mayhem (Silver, Gold, Prismatic) avant tout chiffre affiché, et `Gold Fortune`, qui change le calcul si Mayhem l'a. `Stats!` vaut 2 enclumes, soit 1 500 or : à comparer à la tier list si les cartes de stats ressortent sous-cotées.
- [ ] Combos, vérifier au 1er lancement : Réglages dit-il « arammayhem.com, N combos » ou l'instantané ? (téléchargement jamais vu : `curl` bloqué depuis le conteneur et le shell du Mac, fichier lu par WebFetch seulement.) Le nom anglais des cartes joint-il bien les ids (`purist___caster`, `light_em_up!`) ? 43 ids sur 122 jamais vus au journal.
- [ ] Combos, à mesurer : après 50 tirages avec `combos` dans `cards_seen`, joindre `card_picked` : pris ou non, winrate, part de `À prendre` sur un piège. Si un piège sort souvent en tête ou si les combos forts gagnent nettement, décider avec des chiffres d'un effet sur le classement. Aujourd'hui zéro effet : c'est un avis, pas une stat.
- [ ] Combos, plus tard : la raison (« Q can't proc Marksmage ») n'est que dans les pages du site, pas dans le fichier. Ne pas scraper : le fichier ouvert exclut exprès les winrates et les textes. `bug` : peut déjà être corrigé, jamais présenté comme un bon choix.
- [ ] Repéré sur [arammayhem.com](https://arammayhem.com/build/ezreal/) le 3 nov. : ordres de sorts et items de départ Mayhem avec pick et winrate (Ezreal : Tear › Guardian's Blade 50,4 %, Sheen › Tear 48,0 %). Ça répondrait à « Prochain sort, ordre propre à Mayhem ». Pas dans les fichiers ouverts (CC BY = pick rates seulement), à ne pas récupérer sans accord du site. Écart des ordres de sorts minime sur Ezreal (45,7 contre 45,2 %) ; les items de départ seraient le vrai gain, sous réserve de biais de sélection.

- [x] (v1.97, 3 nov.) **Swiftplay, conseil au salon** (`src/core/quickplay.ts`, `ui/SwiftplaySlots.vue`). Vu sur les 3 Lillia du soir : champ select fantôme, `skipChampionSelect`, import sans effet, 404 sur les sorts. Celian joue la Faille surtout en Swiftplay : l'app ne lui disait rien au seul moment où tout se décide. Pris parce que le reste attend des parties.
- [ ] Swiftplay, vérifier au salon : la carte apparaît-elle ? Sinon lire `lobby-swiftplay-*.json` ou, s'il n'y en a pas, le format du salon est différent. `positionPreference` vaut-il bien JUNGLE, MIDDLE… ? Le rôle donné est-il toujours l'un des 2 ?
- [ ] Swiftplay, tranche suivante : appliquer sorts et runes depuis la carte, bouton seulement, jamais tout seul. Attendre une capture : champs de `playerSlots`, et pages liées (`linked`). Voir AGENT.md. Ne jamais écrire sur une page perso. Après 20 événements `swiftplay_slots` : si tout est déjà « same », inutile de le faire.
- [x] (v1.98) Swiftplay, confirmé à la source ([aide Riot](https://support.riotgames.com/en-us/league-of-legends/gameplay/swiftplay-game-mode), [dev blog](https://leagueoflegends.com/en-us/news/dev/dev-a-swifter-swiftplay)) : niveau 3, 1 400 or, Doran remplacé par les objets du Gardien. `swiftplayStarter` (quickplay.ts), `buildCache` séparé pour Swiftplay. **Ligne « Départ »** en tête de l'achat, toute la Faille (`starterPanel`, `ui/StarterLine.vue`), et au salon : le conseil d'achat parlait du build à l'inventaire vide. Pris parce que le reste attend des parties.
- [ ] Départ, vérifier en vraie partie : la ligne sort-elle à 0:00, s'efface-t-elle au 1er achat ? Lire `starter` (`advised`, `owned`). Familier OP.GG juste pour Lillia ? Sur une partie en lane : le Gardien s'achète-t-il, Hammer plutôt que Blade sur les mêlées (`owned`) ? Support : les objets de quête coûtent plus cher en Swiftplay (Riot), OP.GG ne le sait pas, à regarder si Celian y joue.
- [ ] Swiftplay, à lire (aide Riot) : Drake Soul à 2 dragons, Elder à 15 min, Baron à 12 min, ni Void Grubs ni Herald ni Atakhan, or de camp partagé. Rien à afficher pour l'instant : l'app n'a aucun conseil d'objectif, et un rappel de timing ressemble trop aux timers interdits. À ne reprendre que comme texte fixe avant la partie, si Celian le demande.
- (3 nov., Lillia Swiftplay, v1.93) `skills_taken` : le prochain sort marche au départ niveau 3 (`off` 0, 0, 5 : à 5, Celian a monté E avant W). `slot: 4` vu sur Zhonya's dans `item_bought` : « 4e item » tombe juste sur ce cas. Partie 8035180416 : `taken` = QWE seulement, 5 min, gagnée : abandon adverse probable.

## Priorité 2 — tirer plus des données perso

- Constat du 3 nov., **ne pas en faire un conseil** : Flash + Marque 12 V sur 33, Flash + Fantôme 14 V sur 21 sur tes parties détaillées. arammeta donne le même winrate aux deux à 0,2 pt près sur les 3 champions lus, et l'écart ne vient pas de l'arrivée de l'app (Marque 3 V sur 14 avant, 11 sur 22 après). À relire à 150 parties détaillées (80 ce jour), en comparant au winrate attendu de chaque champion.
- Constat du 3 nov., **ne pas en faire un conseil** : par classe principale (130 parties Mayhem, classes notées à la main) : mages 9 V sur 24, tireurs 20/34, combattants 16/27, tanks 7/14, supports 12/24, assassins 4/7. Aucun intervalle de Wilson à 95 % n'exclut 50 %, 6 classes comparées. À relire à 300 parties : c'est le seul moyen d'avoir des stats perso qui servent à un champion peu joué.
- Parties de moins de 15 min : 8 V sur 23, contre 61 V sur 110 au-delà (4 nov., sans les parties annulées : 8 V sur 22, contre 65 V sur 116). Rien à en tirer pour l'instant, à garder en tête pour le bilan de partie.

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

- (4 nov., v1.108) Chemin de jungle, recherche refaite : [jungler.gg](https://jungler.gg/jungle-stats/) et [planificateur YordleDiff](https://yordlediffweb.pages.dev/jungle-planner/) repérés, non lus en détail. Aucun fichier ouvert de chemins trouvé, item toujours bloqué.
- (4 nov., v1.102) Chemin de jungle : toujours sans source. `probe-output/opgg-tools.json` relu en entier, 29 outils, aucun chemin. OP.GG Desktop l'a sur sa minicarte (« most commonly used jungle path »), donnée privée. En Swiftplay il n'y a pas de champ select pour l'afficher, et Celian n'y joue que là en jungle : valeur faible aujourd'hui.
- [ ] Faille : chemin de jungle avant la partie (Blitz a un overlay `junglePath`, [blitz.gg](https://blitz.gg/overlays/lol?select=junglePath)). À garder pour le champ select seulement, jamais de conseil de déplacement en partie (règle Riot).
  Ne pas faire avant d'avoir des parties Faille en jungle : 6 Swiftplay le 3 nov. d'après la v1.100, Lillia en jungle le soir. La condition se lève : à reprendre quand les items de priorité 1 réalisables sans partie sont épuisés, avec une source de chemins à identifier (OP.GG ne donne que les ordres de sorts).

## À trancher avec Celian (ne pas faire sans son accord)

- GitHub : `CelianGuillamet/lol-companion` est resté à la v1.93. Le push depuis le conteneur est refusé (4 nov., v1.99 : dépôt absent des sources autorisées de la tâche planifiée, le proxy git répond 403, jeton `gh` invalide). Pour reprendre : ajouter le dépôt aux sources de la tâche. Le Mac a tout, rien n'est perdu.

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

- Timers et suivi des cooldowns ennemis, automatiques **ou manuels** (retirés en v1.93), timers de relics et de camps, positions hors vision, lecture mémoire, scripts de gameplay : interdits par Riot.
- Clips vidéo des morts (Hexgate Pro+) : lourd, peu de valeur pour gagner.
