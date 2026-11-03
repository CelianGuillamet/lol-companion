# Journal des versions

## v1.85 — 3 nov. 2026 — ton or qui dort devient un élixir quand ton build est fini
- **Nouveau, prochain achat** : quand il ne reste rien à acheter (sac plein d'items finis, ou plus aucun conseil), l'app propose l'élixir de ton build au lieu de « à toi de juger ». Sac plein, il se boit à l'achat, sans place à faire.
- **Pourquoi** : mesuré sur tes 80 parties Mayhem détaillées, 55 finissent avec 6 items finis, et sur ces 55 tu gagnes en médiane environ 3 600 or de plus que la valeur de ton inventaire final, soit 7 élixirs. 36 parties dépassent 2 500 or. **Ordre de grandeur** : prix des items estimés (2 900 or l'item fini), et l'or des items revendus ou remplacés compte dedans. L'app n'en parlait pas jusqu'ici.
- **Quel élixir** : Wrath (+30 AD), Sorcery (+50 AP) ou Iron (+300 PV, ténacité), selon ton champion et surtout ce que tu construis : un Malphite full AP boit Sorcery.
- **Quand** : niveau 9 minimum (règle du jeu) et au moins 500 or. Jamais avant la fin du build. S'il reste un composant à vendre pour finir un item, ça passe d'abord.
- **Suivi de l'effet** : l'API ne dit rien d'un élixir bu. L'app le déduit de ton or qui baisse de 500 sans que ton sac change, puis affiche « Élixir actif, encore 2:10 ». À moins d'une minute, elle repropose l'achat : en ARAM tu n'achètes qu'en base. Une prime touchée au même instant peut masquer l'achat : la ligne reste alors affichée, sans gravité.
- **Vérifié** : Data Dragon 16.21 donne les 3 élixirs sur les cartes 11 (Faille) et 12 (Abîme hurlant). Si un patch les retire, la ligne disparaît. **Pas vérifié** : que la boutique Mayhem les vende vraiment : si tu ne les trouves pas, dis-le-moi.
- Visible partout où l'achat s'affiche : fenêtre, téléphone, panneau flottant (mode minimal : « Achète Elixir of Iron »). Tous les modes 5v5.
- **26.22** : notes officielles toujours absentes, aucune partie depuis cette nuit, aucune mesure n'a avancé.
- **Répétition générale refaite** sur tes vraies données avant ce dépôt, sans casse.
- Tests : `test/elixir.test.ts`, `test/engine-elixir.test.ts`. Rendu vu sous Electron avec un faux client (les icônes ne chargent pas d'ici). Pas encore vu en vraie partie.

## v1.84 — 3 nov. 2026 — timers ennemis corrigés : Flash revient en 176 s en ARAM et Mayhem, pas 300
- **Corrigé, timers des sorts ennemis** : en ARAM et en Mayhem, tout le monde a 70 haste de sorts d'invocateur, et Data Dragon ne la compte pas. L'app affichait Flash à 300 s au lieu de 176 s : tu aurais cru Flash absent encore 2 minutes alors qu'il était revenu, au pire moment pour engager. Tous les sorts d'invocateur sont corrigés (Fantôme 141 s, Marque 47 s…). La Faille ne change pas.
- **Corrigé, ultimes** : l'accélération d'équilibrage du champion (la même que le badge du champ select, par exemple +10 sur Hecarim) compte maintenant dans le timer de son ultime. Un malus ne rallonge rien : voir la limite plus bas.
- **Corrigé, Mayhem** : plus de « dès 2:10 » sur une rune cachée : les runes sont désactivées dans ce mode. L'étiquette « approximatif » reste, car les augments adverses restent invisibles (Flash 2, Flashy).
- **Tu n'avais pas encore vu l'erreur** : ces timers datent de la v1.74, et l'app n'a pas été relancée depuis la v1.63.
- **Vérifié, cartes du 26.22** : RISE (4 lettres) et One Hit Wonder sont reconnues à la lecture, sans confusion avec un mot de description ou un titre mal lu.
- **Pas fait, après mesure** : un rappel « augment en attente », puisque le choix ne s'ouvre que mort ou en base. Sur tes 59 choix des niveaux 7, 11 et 15, la 1re lecture arrive en 8 à 28 s (médiane par palier). Tu ne laisses pas traîner tes choix : rien à gagner.
- **26.22** : notes officielles toujours absentes (sortie le 4 nov.). Un résumé d'aperçu confirme RISE et One Hit Wonder, sans un mot sur Superfans. Aucune partie depuis cette nuit, aucune mesure n'a avancé.
- **Répétition générale refaite** sur tes vraies données avant ce dépôt, sans casse.
- **Limites** : les sources sont le wiki LoL et un guide, pas une mesure en jeu. L'API ne donne le cooldown d'aucun sort ennemi. Pour un champion à malus (Ziggs −20), le jeu affiche 0 de haste : j'ai donc supposé que le malus n'allonge pas l'ultime tant qu'il n'a pas de haste d'objets.
- Tests : `test/enemyspells.test.ts`, `test/engine-enemyspells.test.ts`, `test/cardmatch.test.ts`. Pas de changement d'écran, seulement les valeurs : pas de nouvelle capture. Pas encore vu en vraie partie.

## v1.83 — 3 nov. 2026 — les combos champion + augment connus, sur tes cartes
- **Nouveau, sur tes cartes Mayhem** : une étiquette dit ce que la communauté sait de cette carte sur ton champion : « combo fort », « bon combo », « piège connu », « astuce connue », « pour le fun ». Par exemple Dual Wield sur Vayne (fort), Vampirism sur Garen (piège). Les stats ne voient pas ces interactions : un piège peut venir d'un sort qui ne déclenche pas l'augment.
- **Nouveau, plans à plusieurs augments** : si le fichier met deux augments dans le même plan pour ton champion et que l'un a été conseillé à un choix précédent, l'autre affiche « va avec Jeweled Gauntlet ». C'est la première info augment × augment de l'app : arammeta n'en a pas. Même pari que les augments liés : l'app suppose que tu as pris la carte conseillée.
- **Corrigé, relances** : l'app pouvait te dire de relancer la carte qui fait combo, car elle ne voit que les winrates. « Combo fort », « bon combo » et « va avec » ne sont plus jamais relancés. S'il ne reste rien à relancer : « Pas de relance : tu perdrais un combo connu. »
- **Le classement ne change pas** : ces avis ne sont pas des stats, le site le dit (« not a win-rate metric »). « À prendre » peut donc tomber sur une carte marquée piège : à toi de trancher, et dis-moi si c'est arrivé.
- **Visible** dans la fenêtre, sur le téléphone, le panneau flottant et la liste complète de Préparer. Plans seulement pendant la partie.
- **Fréquence, mesurée sur tes 23 parties du journal** : une étiquette sur 25 tirages de 220, soit 1 sur 9. 3 bons combos solo, tous non conseillés par les stats (Eureka sur Karthus deux fois, Ethereal Weapon sur Hecarim), 0 piège, 2 cas de plan. C'est rare, et rien ne prouve encore que suivre ces avis fasse gagner.
- **Mesure** : `cards_seen` note `combos` dans `usage.json`, le journal aussi (« combos : … »).
- **Source** : [arammayhem.com/data](https://arammayhem.com/data/), 457 lignes, CC BY 4.0, relues toutes les 24 h, avec un instantané embarqué du 3 nov. si le site ne répond pas. Réglages affiche laquelle est utilisée. Le site n'est joignable que par lecture web d'ici : **le vrai téléchargement n'a pas encore été vu**, mais l'en-tête du fichier a été lu tel quel.
- **26.22** : notes officielles toujours absentes, arammayhem.com s'arrête au 26.21. Superfans reste non confirmé. Aucune partie depuis cette nuit, aucune mesure n'a avancé.
- **Répétition générale refaite** sur tes vraies données avant ce dépôt, sans casse.
- Tests : `test/combos.test.ts`, `test/engine-combos.test.ts`. Rendu vu sous Electron avec un faux client. Pas encore vu en vraie partie.

## v1.82 — 3 nov. 2026 — la revente compte dans ton or : l'item à ce retour en base, pas au suivant
- **Nouveau, prochain achat** : quand il te manque un peu d'or, l'app regarde si vendre un composant inutile comble l'écart. Avant : « À économiser, manque 200 or » avec 305 or dormant dans ton sac. Maintenant : « Vendre, puis acheter », avec ce que rend la vente et l'or qui reste. En ARAM on n'achète qu'en base : l'item arrive à ce passage et pas à la prochaine mort.
- **Ce qu'elle vend** : une ou deux ventes au plus, la plus petite somme qui suffit. Jamais un composant de l'item visé ni d'un achat prévu, jamais un item fini, des bottes, un Tear, une Dark Seal ou une quête de support. Sac plein : la vente déjà imposée compte d'abord.
- **Valeur lue, pas supposée** : `gold.sell` de Data Dragon, objet par objet. Une valeur inconnue (objet Mayhem hors catalogue, Data Dragon injoignable) ne compte pas, et l'app reste au conseil d'avant.
- Visible partout où l'achat s'affiche : fenêtre, téléphone, panneau flottant, onglet Build.
- **Pas mesuré** : le gain en parties, ni la fréquence. Les captures ne donnent ni le plan d'achat ni l'or à chaque mort. L'événement `resale` de `usage.json` le dira. En boutique, le prix de vente s'affiche sur l'objet : si un écart avec l'app apparaît, c'est à corriger.
- **26.22 lu ce matin** : notes officielles toujours absentes. Un site tiers annonce le Worlds Band Track au 26.22, cohérent avec Superfans (id « Worlds » au PBE), et le retour de Butcher's Bridge et Koeshin's Crossing en Mayhem au patch suivant le 26.21. Rien à changer dans l'app pour ces cartes.
- **Répétition générale refaite** sur tes vraies données avant ce dépôt, sans casse. Aucune partie depuis cette nuit, aucune mesure n'a avancé.
- Tests : `test/nextbuy.test.ts`, `test/purchase.test.ts`, `test/engine-purchase.test.ts`, `test/cooldowns.test.ts`. Rendu vu sous Electron avec un faux client (fenêtre et panneau flottant). Pas encore vu en vraie partie.

## v1.81 — 3 nov. 2026 — sac plein : l'app sait qu'il n'y a que 6 places
- **Corrigé, prochain achat** : l'app ne regardait pas la place dans ton sac. Sur tes 20 dernières parties, 8 fois sur 20 tu as les 6 places prises au niveau 15, toujours avec des composants, et 23 de ses 128 conseils d'achat tombaient sur un sac plein (Wit's End avec Chempunk Chainsword qui traîne, Rabadon avec un Amplifying Tome). La boutique refuse ces achats, et sur le Taric du 2 nov. 3 996 or sont restés en poche.
- **Nouveau** : sac plein, l'item qui termine un de tes composants passe en tête. Sinon, l'app dit quoi vendre : « Vends d'abord Amplifying Tome », jamais un item fini, des bottes, un Tear, une Dark Seal ou une quête de support. Tant que tu économises, elle ne te fait rien vendre.
- **Corrigé** : le composant « en attendant » n'est plus proposé s'il n'a pas de place.
- **Nouveau** : plus de composant à vendre, l'app affiche « Inventaire plein » au lieu d'un 7e item à acheter. Le choix de remplacer un item fini reste le tien : aucune stat ne dit lequel retirer. Une menace forte ou un augment lié gardent leur priorité, la vente est indiquée.
- Visible partout où l'achat s'affiche : fenêtre, téléphone, panneau flottant, onglet Build.
- **Notes du 26.22 pas encore publiées** ce matin : Superfans reste non confirmé.

## v1.80 — 3 nov. 2026 — prête pour le jour du patch : timers à jour et stats signalées
- **Corrigé, timers des sorts ennemis** : ils suivaient la version d'arammeta, qui garde des jours de retard sur le jeu. Dès le 26.22, un ultime ou un sort modifié aurait gardé son ancien cooldown (Mel, par exemple). L'app prend maintenant la version de ton client, et reste sur l'ancienne le temps que Data Dragon publie la nouvelle.
- **Nouveau, au champ select** : tant que les stats ont un patch de retard, un bandeau le dit, au moment où tu choisis. Avant, ce n'était écrit qu'en petit en bas à gauche et dans Réglages. Le classement ne change pas : un champion modifié peut être mal classé pendant ces jours-là.
- **Corrigé, données du nouveau patch** : quand arammeta passe au nouveau patch, le détail d'un champion (augments, builds) pouvait rester celui du patch d'avant jusqu'à 12 h. Il est relu aussitôt, avec repli sur le disque si le site ne répond pas.
- **Pas fait, après mesure** : ton bilan contre les champions adverses à l'écran de chargement, repéré chez Blitz. Sur 80 parties Mayhem rejouées dans l'ordre, ton passé ne donne un signal lisible que 12 fois, et il ne prédit rien (bilan « mauvais » : 4 V sur 8, « bon » : 3 V sur 4). Ça resterait du bruit à l'écran. À relire à 300 parties.
- **Notes du 26.22 toujours pas lisibles** : la page de Riot ne répond pas d'ici, et les résumés lisibles ne reprennent que l'aperçu des équilibrages, sans mot sur Mayhem. Superfans reste non confirmé.
- **Répétition générale refaite** sur tes vraies données avant ce dépôt, sans casse.
- **Relance l'app avant ta prochaine partie**, idéalement avant le patch du 4 nov. Aucune partie depuis cette nuit, aucune mesure n'a avancé, et l'app tourne encore sur une version d'avant la v1.64.
- Tests : `test/cooldowns.test.ts`, `test/arammeta-patch.test.ts`, `test/engine-patchday.test.ts`, `test/ui-helpers.test.ts`. Bandeau vu sous Electron avec un faux client en 16.22. Numéro de version du vrai client non capturé : si son format diffère, l'app garde simplement le comportement d'avant. Pas encore vu en vraie partie.

## v1.79 — 3 nov. 2026 — répétition générale sur tes vraies données avant ta prochaine relance
- **Pourquoi cette session n'ajoute pas de fonction** : 16 versions, celle-ci comprise, vont s'appliquer d'un coup à ta prochaine relance. Je les ai fait tourner ensemble sur tes vraies données, ce qui n'avait jamais été fait sur tout l'enchaînement.
- **Résultat, pas de blocage trouvé** : ton historique (136 parties) passe sans perte, 25 anciennes parties reçoivent leur revue d'augments et 22 leur revue d'achats. 21 parties (89 lectures de la vraie API du jeu) et tes 27 champ select capturés sont rejoués sans erreur. Les 4 onglets s'ouvrent sous Electron avec ton historique, Mes parties et le détail des parties compris, sans erreur dans la console.
- **Corrigé, écart d'objets** : les objets propres à Mayhem absents du catalogue (Wooglet's Witchcap à 6 000 or, vu dans tes parties) comptaient 0. L'app prend maintenant le prix donné par le jeu pour ces objets-là. Poro-Snax vaut bien 0 et n'est plus compté « sans prix ».
- **Corrigé, sorts ennemis** : un ennemi avec Clown College ou Poltergeist affichait « ? » ou « Augment_Poltergeist » à la place d'un sort d'invocateur. Tu vois maintenant « Deceive » ou « Poltergeist », sans timer, car leur cooldown n'est pas connu.
- **Limites de la répétition** : sous Linux, avec le faux client et 3 champions de stats réelles (les autres en réutilisent une copie), donc elle prouve que rien ne casse, pas que les conseils sont bons. Ce qui reste invisible d'ici : la relance sur macOS, OP.GG, Data Dragon et les objets des 9 autres joueurs (leurs captures n'existent qu'à partir de la v1.78).
- **26.22 lu dans les aperçus** : Mel change le 4 nov. (W, Q, stats), Yasuo, Thresh et Locke baissent, Viktor, Corki, Rumble et 7 autres montent, Overlord's Bloodmail passe à 40 AD. Rien n'y parle de Mayhem ni de Superfans, les notes officielles ne sont toujours pas sorties.
- **Question pour toi**, dans « À trancher » de la feuille de route : tant que l'app n'est pas relancée, ces sessions empilent des versions que personne ne teste. Veux-tu les espacer jusqu'à ta prochaine partie ?
- **Relance l'app avant ta prochaine partie.** Aucune partie depuis cette nuit, aucune mesure n'a avancé.
- Tests : `test/goldgap.test.ts`, `test/enemyspells.test.ts`, `test/rehearsal.test.ts` (ne tourne que si on lui donne une copie de `probe-output/`, qui ne va jamais sur GitHub). Pas encore vu en vraie partie.

## v1.78 — 3 nov. 2026 — l'app te dit quand elle a une version d'avance sur toi
- **Le problème** : les sessions planifiées déploient sans relancer l'app, pour ne jamais te couper en partie. Ton app n'a pas redémarré depuis le 2 nov. 16 h 55 UTC : **14 versions ne t'ont jamais servi** (revue des achats, reroll à jour, bans, sort à monter, timers, écart d'objets, Superfans…), et toutes les mesures de la feuille de route sont bloquées par ça.
- **En bas à gauche, un bloc « Mise à jour prête : v1.xx »** : le nombre de versions pas encore lancées, un bouton **Relancer l'app**, et « Quoi de neuf » (les 5 dernières). Contrôle toutes les 5 minutes.
- **Le bouton ne marche que hors partie** : client fermé, salon, file d'attente. Du ready check à l'enregistrement de la fin de partie, le bloc dit « Relance après la partie », et l'app refuse même si on l'appelle autrement.
- **Une notification discrète** quand tu entres au salon ou en file avec une mise à jour en attente, au plus une fois toutes les 6 h.
- **Rien ne se relance tout seul.** La relance automatique quand League est fermé est une question pour toi, dans « À trancher » de la feuille de route.
- **La version lancée est notée** : « App v1.xx » en bas à gauche, ligne dans le journal, événement `app_start` dans `usage.json`. Plus besoin de deviner ce qui tournait pendant une partie.
- **Captures plus utiles** : à chaque choix d'augment, `liveclient-choix*` garde aussi champion, équipe, niveau, rôle, objets et runes des 10 joueurs, sans identifiant. Une seule partie répondra à 3 questions ouvertes : les objets adverses suivent-ils les achats, quels objets n'ont pas de prix, `position` et `runes` sont-ils remplis ?
- **Limite** : ce bloc n'existe qu'à partir de cette version. **Il faut encore relancer l'app à la main cette fois-ci.** Il n'apparaît pas sur le téléphone ni sur la fenêtre second écran.
- Patch 26.22 : notes officielles toujours pas lisibles d'ici (Dot Esports et Mobafire refusés, arammayhem.com arrêté au 26.21). Aucune partie depuis cette nuit, aucune mesure n'a avancé.
- Tests : `test/appversion.test.ts`, `test/engine-goldgap.test.ts`. Rendu vérifié sous Electron à 900 × 640 et en partie (relance refusée) ; relance réelle faite sous Linux, nouveau processus et fenêtre revenus. **Pas encore vue sur macOS.** Si l'app se ferme sans revenir, rouvre-la normalement et dis-le-moi.

## v1.77 — 3 nov. 2026 — ta collection compte : le banc et les champions à débloquer
- **Découvert en lisant les règles du champ select** : tes cartes viennent de ta collection (+ rotation), et au banc tu ne peux prendre que les champions qui en font partie. L'app ne le savait pas : elle pouvait conseiller un champion du banc que le client refuse, ou dire « Garde X » alors qu'une autre option était possible.
- **Au champ select ARAM / Mayhem** : les champions du banc hors de ta collection sortent du classement, une ligne les cite. Le bouton de ceux qui restent marche donc à coup sûr.
- **Dans Préparer, onglet Mayhem : « Champions à débloquer »**. Ta collection sur le total, puis les champions dont l'achat relève le plus ton meilleur choix moyen, avec le gain en points de winrate par partie. Un clic ouvre la fiche. Rien ne s'achète depuis l'app. Le panneau n'apparaît pas si tu as tout, si le client est fermé, ou sans stats globales.
- **Le gain est petit et il faut le lire comme ça** : environ +0,3 pt pour les 5 premiers avec 120 à 150 champions, +0,5 pt avec 90 (simulation sur des winrates d'exemple). C'est peu sur une partie, mais ça joue sur toutes. Calcul simple : 2 cartes + 4 champions au banc, winrate global seulement, sans ton équipe ni tes résultats. Le prix en essences n'est pas lu.
- **Le 3e champion (carte bénie)** : environ 5 % + 0,15 % par champion que tu possèdes, 30 % au plus (wiki et dodge.gg). Affiché dans le panneau.
- **Limites** : le wiki dit que les 4 dernières rotations gratuites sont aussi tirables, et l'app ne les voit pas. Un champion qu'on te propose hors de ta collection lue compte donc comme à toi, et c'est noté. Mais un champion d'une ancienne rotation au banc, jamais proposé à toi, peut sortir à tort du classement : tu peux toujours le prendre dans le client. Le format de la liste du client vient de la documentation connue, pas d'une capture : si la lecture échoue, rien n'est filtré et le panneau reste caché.
- **Mesure** : `usage.json` note `pool_seen` (taille de la collection) et `pool_outside`. Je ne sais pas encore combien de champions tu possèdes. Si tu les as tous, le panneau ne s'affichera jamais et le filtre ne fera rien.
- **Vu dans tes parties, sans conseil à la clé** : mages 9 V sur 24, tireurs 20 sur 34, combattants 16 sur 27. Trop peu de parties, et le classement perso par classe n'est pas ajouté pour ça.
- Rien de neuf à relire : aucune partie depuis cette nuit, notes du 26.22 pas encore sorties. **Relance l'app avant ta prochaine partie** : elle tourne encore sur une version d'avant la v1.64.
- Tests : `test/pool.test.ts`, `test/engine-pool.test.ts`. Rendu vérifié sous Electron avec des données d'exemple, sans les icônes (CDN bloqués ici). Pas encore vu sur le vrai client.

## v1.76 — 3 nov. 2026 — le build suit tes augments, entre builds proches
- **Le conseil d'achat tient compte de tes augments avant ton premier item.** Si un augment joue sur la puissance, les critiques, les dégâts physiques, la vitesse d'attaque ou les résistances, et qu'un autre build du champion y répond mieux, l'app passe à ce build. La ligne dit « build X, pour <augment>, si tu l'as pris ». Avant, sans item acheté, elle prenait toujours le 1er build.
- **Garde-fous** : seulement entre builds à moins de 2 points de winrate, avec au moins 1 000 parties. Rien ne change dès que tu as acheté un item ou un composant du build en cours. Deux augments opposés s'annulent. Les augments « Upgrade » gardent leur propre règle.
- **La carte n'est plus pénalisée** quand un build proche lui va : elle perdait jusqu'à 4 pts contre le 1er build, alors qu'un build équivalent existait. Elle ne gagne pas de bonus pour autant.
- **Limite principale, l'effet sera rare** : sur les 3 champions lisibles ici (Malphite, Leona, Yasuo), rien ne change. Malphite reste Tank : 4,4 pts d'écart avec son build AP, et arammeta ne dit pas ce que vaut un augment AP sur chaque build. Ça devrait surtout jouer sur les champions hybrides, ce qui reste à vérifier.
- **Même pari que les augments liés** : le jeu ne dit pas l'augment pris avant la fin de partie. L'app suppose la carte conseillée, suivie 74 fois sur 96. Si tu as pris une autre carte, ignore la ligne.
- **Mesure** : `usage.json` note `build_lean` (ancien et nouveau build, augment vraiment pris, build acheté, résultat).
- **Vu dans tes parties, sans conseil à la clé** : Flash + Marque 12 V sur 33, Flash + Fantôme 14 V sur 21. Trop peu de parties, et les stats globales donnent ces deux choix à égalité. Ne change pas tes sorts pour ça.
- Rien de neuf à relire : aucune partie depuis cette nuit, et les notes du 26.22 ne sont pas encore sorties. **Relance l'app avant ta prochaine partie** : elle tourne encore sur une version d'avant la v1.64.
- Tests : `test/buildchoice.test.ts`, `test/engine-itembound.test.ts`. Pas de nouvel écran, donc pas de rendu Electron refait. Pas encore vu en vraie partie.

## v1.75 — 3 nov. 2026 — l'écart d'objets, en partie
- **En haut de la vue en partie, un repère** : « Objets +2 350 · niv. +3 », puis « Plus riche en face : Jinx, 11,2 k ». Sur la fenêtre second écran et le téléphone, dans tous les modes. Vert ou rouge seulement au-delà de 3 % de l'équipe la mieux équipée et de 500 or ; en dessous, « Objets à égalité ». C'est un choix prudent, pas une mesure.
- **Tape dessus pour le détail** : tes 5 contre leurs 5. En Faille, rôle contre rôle, ta ligne en tête, avec l'écart de chaque lane. En ARAM et Mayhem, pas de lane : chaque équipe est classée du plus riche au moins riche. Si un rôle manque en Faille, même affichage.
- **Pourquoi** : Hexgate l'offre sur Tab, l'app ne disait rien de l'état des forces. Le chiffre sert à savoir où en est le combat et qui porte l'équipe adverse. C'est une lecture du tableau des scores : l'app ne dit jamais d'engager ou de reculer.
- **Pris maintenant** parce que tout ce qui est au-dessus dans la feuille de route attend des parties : aucune depuis cette nuit (01 h 20 UTC), et le 26.22 ne sort que demain.
- **Prix total du patch** : le champ `price` du jeu est le coût de la dernière recette (Heartsteel : 400), inutilisable. Consommables exclus. Les objets Mayhem à identifiant préfixé (123430 = Rite of Ruin, 323075 = Thornmail) retombent sur l'objet de base ; un objet sans prix compte 0 et le détail le dit.
- **Limites** : l'or en poche ne compte pour personne : un adversaire qui n'a pas encore acheté paraît plus pauvre qu'il n'est. La fraîcheur des objets adverses est celle du tableau des scores, pas vérifiée en vraie partie (les captures ne gardent que tes objets). « niv. » est la somme des niveaux de l'équipe. Le seuil « à égalité » n'est pas calibré.
- **Mesure** : `usage.json` note à chaque partie `gold_gap` (écart et niveaux toutes les 5 minutes, résultat). Après 30 parties, on saura quel écart prédit vraiment la victoire.
- Rien de neuf à relire en partie. **Relance l'app avant ta prochaine partie** : elle tourne encore sur une version d'avant la v1.64.
- Tests : `test/goldgap.test.ts`, `test/engine-goldgap.test.ts`. Rendu vérifié sous Electron et dans Chromium via le serveur téléphone (400 et 1 100 px de large), en Mayhem et en Faille, avec des données d'exemple, sans les icônes (CDN bloqués ici). Pas encore vu en vraie partie.

## v1.74 — 3 nov. 2026 — timers des sorts ennemis (tu tapes, l'app compte)
- **En partie, un bloc « Sorts ennemis »** : les 5 adversaires, leur ultime et leurs 2 sorts d'invocateur. Tu tapes un sort quand tu le vois partir, le timer démarre sur le temps de jeu (relu au moment du clic) et compte à rebours. Sur le téléphone : nouvel onglet **Sorts**. C'est là qu'il sert le plus, le jeu en plein écran cache la fenêtre.
- **Le vrai cooldown, pas un chiffre fixe** : base du patch (Data Dragon : sorts d'invocateur, ultime de chaque champion), rang de l'ultime déduit du niveau (6 / 11 / 16, ou 1 / 6 / 11 / 16 pour les champions à 4 rangs), haste des objets visibles (Ability Haste, haste d'ultime type Malignance, haste d'invocateur des bottes de Lucidité). S'il achète de la haste pendant le cooldown, le temps restant est recalculé comme en jeu.
- **Corriger** : taper un timer en cours ouvre « −10 s » (tu l'as vu en retard), « +10 s », « Annuler ». Le timer disparaît tout seul quand le sort revient.
- **Ce qui est dit honnêtement** : « dès 2:58 » si une rune invisible peut raccourcir (Cosmic Insight, Ultimate Hunter : arbre visible en Faille, inconnu en Mayhem). « ≈ » si une part est inconnue : augments adverses en Mayhem, Téléportation (dépend du niveau), Châtiment (charges), valeur de secours quand Data Dragon ne répond pas. « ? » si l'ultime n'est pas connu : pas de timer plutôt qu'un faux.
- **Rien n'est automatique** : l'app ne détecte aucun lancement, conformément aux règles (docs/AGENT.md, politique Riot). Elle lit seulement ce que montre le tableau des scores (sorts équipés, niveau, objets) via l'API Live Client.
- **Téléphone** : une seule action possible en écriture, `POST /api/spell` avec le jeton. Rien d'autre n'est modifiable depuis le téléphone.
- **Non couvert** : Q / W / E (trop courts pour un clic), passifs qui réduisent l'ultime (resets sur kill…), haste conditionnelle ou à cumuls des objets, augments Mayhem des adversaires. Les descriptions d'objets utilisées par les tests sont reconstruites : la haste lue sur les vrais objets est à vérifier en vraie partie (survole une case, le détail dit d'où vient le chiffre).
- Tests : `test/cooldowns.test.ts`, `test/enemyspells.test.ts`, `test/engine-enemyspells.test.ts`, `test/phone.test.ts`. Rendu vérifié dans Chromium (fenêtre large et téléphone), avec le vrai moteur, le faux client et des données d'exemple, sans les icônes (CDN bloqués ici). Pas encore vu en vraie partie.

## v1.73 — 3 nov. 2026 — prête pour le 26.22 : Superfans et les tirages hors paliers
- **Nouveau headliner reconnu : Superfans**, prévu au patch 26.22 (mercredi 4 nov.). Niveau max 21 pour tout le monde, plus d'XP, et un augment en plus au niveau 21. L'app lit la bannière, affiche les conseils et note le headliner dans l'historique. Sans bannière lue, une partie finie avec 5 augments au niveau 21 s'affiche « Superfans (probable) », plus « K/DA (probable) ».
- **Corrigé : l'app ne lisait plus l'écran après le choix 4.** Le lecteur de cartes dort 3 minutes après chaque palier. L'augment du niveau 21 serait passé sans conseil. Il se réveille maintenant au niveau 21, et au niveau 18 sur Pentakill, dont la 2e carte tombait dans le même trou.
- **K/DA : un coup d'œil toutes les 5 s pendant toute la partie**, car l'augment en plus arrive à n'importe quel moment. Avant, il n'était lu que s'il tombait juste après un palier. Coût : une lecture d'écran de plus toutes les 5 s, sur ces parties seulement.
- **À l'écran** : « Augment en plus · niveau 21 » à la place de « Choix 4 » sur la fenêtre second écran et le téléphone, pas encore sur l'overlay. L'augment est classé avec les stats du choix 4 : aucune stat n'existe pour un 5e choix.
- **Limites** : Superfans vient des données du serveur de test (31 oct.), les notes officielles du 26.22 n'étaient pas lisibles. Le nom sur la bannière est supposé être « Superfans ». Si le patch le change, rien ne casse et le raté sera noté dans `usage.json`. Atteindre le niveau 21 seul ne prouve rien : 3 de tes parties ont dépassé le niveau 18 en octobre, sans headliner connu.
- **Aussi au 26.22, d'après le serveur de test** : 2 cartes, One Hit Wonder (or) et RISE (prismatique), classées « estimées » tant qu'arammeta n'a pas de parties dessus ; refonte de Mel, dont les stats resteront celles de l'ancien kit quelques jours ; XP des sbires partagée à 5 : 20 % chacun au lieu de 24 %.
- Pas de nouvelle partie depuis la v1.70 : aucune mesure de la feuille de route n'a avancé. Relance l'app avant ta prochaine partie, elle tourne encore sur une version d'avant la v1.64.
- Tests : `test/headliner.test.ts`, `test/engine.test.ts`. Rendu vérifié dans Electron sous Linux avec des données d'exemple (bannière et libellé). Le réveil du lecteur lui-même ne tourne que sur macOS : pas encore vu en vraie partie.

## v1.72 — 3 nov. 2026 — Upgrade Cutlass, et plus de conseil sur une carte que tu as déjà
- **Upgrade Cutlass est reconnu** : la carte vise Spectral Cutlass (le wiki décrit son actif, Soul Anchor). Elle est notée selon ton plan et l'item passe en tête du conseil d'achat, comme les autres « Upgrade ». Tu n'as jamais fini cet item sur tes 83 parties détaillées, donc la carte perdra le plus souvent 2 pts, sauf s'il est dans ton plan.
- **Corrigé : l'app pouvait conseiller un augment que tu possèdes déjà.** Caitlyn, cette nuit : pendant les relances du choix 3, elle a lu Giant Slayer, pris au choix 2, et l'a conseillé 4 s. Une carte vue à un choix précédent est maintenant retirée : la lecture repasse à « 2 cartes sur 3 », sans conseil, jusqu'à la lecture suivante. C'est arrivé 1 fois sur 333 lectures.
  Elle restait aussi comptée comme une relance dans le suivi du tirage : ce n'est plus le cas. Des cartes laissées ouvertes au palier suivant et les cartes Pentakill ne sont pas touchées.
- **Nouvel « Upgrade X » au patch** : l'app le note dans le journal (« Augment lié à un item inconnu de l'app ») et dans `usage.json` (`bound_unknown`). Utile au 26.22, qui peut ajouter des cartes.
- **Pas fait : HEARTSTEEL dans le classement.** Aucune source lue ne dit quels bonus ont les cartes, et l'app ne lit que leur titre. Le conseil reste « relis la carte ».
- Rien de neuf à relire : aucune partie depuis la v1.70, et l'app tourne encore sur une version d'avant la v1.64. Relance-la avant ta prochaine partie.
- Tests : `test/offers.test.ts`, `test/itembound.test.ts`, `test/engine-itembound.test.ts`, `test/engine.test.ts`. Pas de changement d'interface, donc pas de rendu Electron refait. Pas encore vu en vraie partie.

## v1.71 — 3 nov. 2026 — le build suit tes augments « Upgrade »
- **L'item d'un augment lié passe en tête du conseil d'achat** : Upgrade Infinity Edge, Immolate, Sheen, Stormsurge, Sundered Sky, Ravenous Hydra, Zhonya's, Collector, Death's Dance, Mikael's, Hubris, Ultra Hydra.
  Ces augments n'améliorent que l'item nommé. La ligne dit « pour Upgrade Immolate, si tu l'as pris ». Si plusieurs items conviennent (Sunfire ou Hollow Radiance, Trinity ou Lich Bane…), l'app prend celui de ton build, sinon celui qui va à ton rôle.
- **Pourquoi** : 16 de tes 133 parties Mayhem en ont un. Sur Taric le 2 nov., l'app a conseillé Upgrade Immolate puis Winter's Approach, sans item à Immolate dans le plan : tu as pris Hollow Radiance tout seul.
- **Les cartes sont notées selon ton plan** : « Hollow Radiance est dans ton plan » (+1,5 pt), « tu as déjà … » (+2 pts), « il te faudrait …, hors de ton plan » (-2 pts). Ça peut changer la carte conseillée.
- **Limite principale** : le jeu ne dit pas quel augment tu as pris avant la fin de la partie. L'app suppose que tu as pris la carte conseillée (68 choix sur 86). Si tu as pris une autre carte, ignore la ligne : après 2 achats différents, elle passe en dernier.
  À l'inverse, si tu prends une carte liée que l'app ne conseillait pas, le conseil d'achat ne change pas.
- **Mesure** : `usage.json` note `item_bound` à chaque partie : augment supposé, vraiment pris ou non, item acheté ou non.
- **Non couvert** : Upgrade Cutlass (item illisible sur le wiki). L'effet d'Ultra Hydra vient des notes de patch, pas du texte de la carte. Le build ne suit pas encore les autres augments, par exemple un augment AP sur Malphite.
- Rien de neuf en vraie partie à relire : aucune partie depuis la v1.70, et l'app n'a pas été relancée depuis le 2 nov. Taux de lecture du headliner relu : 13 lus, 2 ratés, la zone lue reste comme ça.
- Tests : `test/itembound.test.ts`, `test/engine-itembound.test.ts`. Pas de nouveau composant, donc pas de rendu Electron refait ; pas encore vu en vraie partie.

## v1.70 — 3 nov. 2026 — le prochain sort à monter, en partie
- **En partie, une ligne dit quel sort monter** au-dessus de l'achat, sur la fenêtre second écran et le téléphone : « Point à mettre : Shield of Daybreak, rang 4 » avec la touche, puis
  « Monte Q › W › E ». Quand tu passes un niveau, le cadre devient doré jusqu'à ce que tu mettes le point. Le nom du sort vient du jeu.
- **Marche en Mayhem et en ARAM**, plus seulement en Faille : l'ordre le plus joué vient maintenant d'OP.GG pour tous les modes, et s'affiche aussi dans Build. OP.GG n'a pas de file Mayhem :
  c'est l'ordre ARAM, indiqué « OP.GG, ARAM ». Pourquoi : tes parties passent sur 75 champions et plus, l'app ne donnait aucun ordre en Mayhem.
- **Un écart ne casse pas le conseil** : si tu as pris E trop tôt, la suite s'adapte. Rangs interdits par ton niveau jamais proposés, R aux niveaux 6, 11, 16, champions à R dès le début gérés.
- **Mesure** : `usage.json` garde à chaque partie l'ordre où tu as vraiment pris tes points et le nombre de points hors conseil (`skills_taken`).
- **Limites** : ordre le plus joué, pas forcément le meilleur ; un augment Mayhem qui change un sort ne le modifie pas (« Back To Basics » sans ultime : R restera proposé). Si OP.GG ne répond pas, rien ne
  s'affiche et ta partie n'est pas ralentie. OP.GG n'est pas joignable depuis la session : ton ordre passé n'a pas pu être comparé au conseil, première vraie vérification à ta prochaine partie.
- **Ton app tourne encore sur une ancienne version** : lancée le 2 nov. vers 17 h 55, avant la v1.64. Tes 2 parties de cette nuit n'ont donc ni conseiller de relance, ni revue des achats, ni bans. Relance-la.
- Tests : `test/skills.test.ts`, `test/engine-skills.test.ts` (dont l'exemple ARAM réel d'OP.GG et la réponse réelle du jeu sur Sejuani). Rendu vérifié dans Electron sous Linux, avec des données d'exemple.

## v1.69 — 3 nov. 2026 — Faille : bans conseillés
- **Le champ select Faille conseille 3 bans** tant que ton ban n'est pas validé, avec le gain estimé en points de victoire : « Lux, +0,3 pt,
  47 % pour toi contre elle, en face de toi dans 17 % des parties ». Rien sur une file sans bans (Swiftplay), rien en ARAM ou Mayhem.
- **Ce qui compte** : le counter de ton champion survolé, s'il est sûr à 95 %, sinon le winrate du champion dans son rôle, pondérés par sa
  fréquence. Un champion que tu bats n'est jamais proposé, même fort.
- **Le piège évité** : banner un champion fort ne rapporte rien si ton équipe peut encore le prendre, il sort des deux côtés. Seuls comptent
  ton rôle et ceux où l'allié a montré son champion. Plus tes alliés survolent tôt, plus la liste s'étoffe. Ce que tes alliés
  survolent ou bannissent est retiré. Si rien ne dépasse 0,05 pt, l'app le dit au lieu d'inventer un ban.
- **Bouton Survoler** : il pose le ban dans le client pendant ton tour, sans jamais le valider. La confirmation reste la tienne.
- **Winrates des rôles plus précis** : victoires / parties, plus le chiffre arrondi d'OP.GG, si OP.GG donne ce champ. Sert aussi à la tier list par rôle.
- **Limites** : gain moyen estimé, pas une prédiction, et petit par nature. Seuls 3 counters par champion sont connus. Aucun vrai champ select avec
  bans n'a pu être relu (tes captures sont en Mayhem), OP.GG n'est pas joignable d'ici : à vérifier sur ta prochaine draft ou classée.
- Rendu vérifié dans Chromium avec des données d'exemple, sans les icônes (CDragon bloqué ici). Tests : `test/bans.test.ts`, `test/engine-sr.test.ts`, `test/opgg.test.ts`.

## v1.68 — 2 nov. 2026 — le conseiller de relance oublie les cartes déjà passées
- **Une carte vue ne revient pas de la partie** : mesuré sur tes 23 parties, 0 carte répétée d'un choix à l'autre sur 439, alors
  qu'il en faudrait environ 17 si les tirages étaient indépendants. Le pool d'une relance ne contient plus les cartes vues aux
  choix précédents, y compris celle que tu as prise. Avant, seules les cartes du tirage en cours étaient retirées.
- **Ce que ça change** : le calcul colle mieux à ce que tu peux vraiment tirer, surtout aux choix 3 et 4, si tes tirages d'avant étaient
  dans la même rareté. Si tu as déjà vu les meilleures cartes, relancer ta meilleure carte devient moins tentant, et l'inverse aussi.
  Le gain reste petit par relance : ça retire au plus 18 cartes d'une rareté, sur une soixantaine, et le plus souvent bien moins.
- **Même règle dans la revue** : les relances sont jugées avec ce pool, et les anciennes parties pas encore relues aussi.
- **Mesure pour la suite** : `cards_seen` note la taille du pool (`reroll.pool`). Tes vraies parties laissent estimer 195 cartes
  tirables au total : si le pool de l'app est bien plus grand, c'est qu'il compte des cartes que tu ne peux pas tirer.
- **Limites** : une carte vue seulement dans une lecture partielle n'est pas retirée, et les augments impossibles sur ton champion
  restent comptés (rien ne les liste). Rien de nouveau à l'écran. « Reco d'augment suivie » relue, sans conclusion : voir la feuille de route.
- Tests : `test/engine.test.ts`, `test/offers.test.ts`.

## v1.67 — 2 nov. 2026 — Faille : items comparés au même rang
- **Le conseil d'achat Faille regarde le rang de l'item à acheter** : à partir du 4e item, les options viennent des stats OP.GG de
  ce rang, plus d'un mélange 4e / 5e / 6e. Le winrate monte tout seul avec le rang (Rabadon sur Ahri : 58 % en 4e, 64 % en 5e, car
  une partie qui voit un 5e item est déjà engagée) : un item surtout pris en 5e pouvait passer devant le meilleur 4e item.
- **La ligne le dit** : « 4e item (58 %) » au lieu de « item suivant ». Bottes et composants ne comptent pas dans le rang.
  S'il reste moins de 2 items avec 50 parties à ce rang (souvent le 6e), l'ancienne liste reprend la main.
- **La revue des achats Faille a enfin des chiffres** : un item hors plan est comparé au conseil à ce même rang, « Rabadon était
  mieux placé (58 %) en 4e item ». `item_bought` garde le rang (`slot`). Mêmes règles que Mayhem : 1 point d'écart et assez de parties.
- **Limites** : rien avant le 4e item (OP.GG donne le cœur comme un bloc). L'exemple enregistré ne donne que 3 items par rang : une
  fois ceux du plan retirés, il restera peu d'achats à chiffrer. Un item de situation (Void Staff contre des tanks) garde le biais
  des parties où on le prend. Mayhem et ARAM ne changent pas.
- Mesures de la feuille de route : aucune nouvelle partie depuis la v1.66, elles attendent tes prochaines parties.
- Tests : `test/nextbuy.test.ts`, `test/buyreview.test.ts`, nouveau scénario `test/engine-sr-buy.test.ts`. Rendu de la revue vérifié
  sous Linux avec une partie d'exemple ; pas encore vu en vraie partie.

## v1.66 — 2 nov. 2026 — tes relances dans la revue d'après-partie
- **La revue note maintenant tes relances**, sous le choix concerné (ligne ↻) : « Tu as relancé X, ta meilleure carte : environ
  2 pts perdus en moyenne », « Tu pouvais encore relancer Y gratuitement », ou « bon pari » quand relancer ta meilleure carte
  était justifié. Comme ta carte du choix pouvait être la meilleure des 3 restantes, la revue ne voyait pas ces pertes-là.
- **Ça juge le pari, pas la carte reçue** : relancer 60 % reste une erreur même si tu tires 62 %. Le calcul compare relancer à
  garder la carte puis jouer le reste au mieux, avec le même pool que le conseiller, Command Line compris.
- **Prudente** : 1 point d'écart minimum et assez de parties, jamais de jugement sur une carte estimée. Quand 2 cartes changent
  entre deux lectures (42 fois sur 127), l'ordre le plus favorable est retenu.
- **Bilan** : les points perdus sur les relances sont comptés à part, sur chaque partie et dans Toutes les parties.
- **Anciennes parties** : reprises une fois au lancement depuis `usage.json`, avec les stats actuelles (indiqué sur la revue).
  Vérifié sur tes vraies données : 85 tirages retrouvés sur 85, dont 78 avec relances. Les notes elles-mêmes n'ont pas pu être
  relues ici : arammeta n'est pas joignable depuis la session, tu seras le premier à les voir.
- **Limites** : une relance faite avant la 1re lecture de l'écran n'est pas vue, donc « tu pouvais encore relancer » peut se
  tromper dans ce cas ; le pool compte encore les augments déjà pris. Tests : `test/reroll.test.ts`, `test/review.test.ts`,
  `test/offers.test.ts`, scénario moteur. Rendu vérifié sous Linux avec des données d'exemple.

## v1.65 — 2 nov. 2026 — conseiller de reroll
- **L'app dit quelles cartes relancer** : relancer une carte que tu ne prendrais pas est gratuit, elle les marque « À relancer »
  avec le gain moyen. Quand il ne reste que ta meilleure carte à relancer, elle ne le propose que si ça vaut au moins 1 point,
  avec la chance de trouver mieux et la carte qui te reste.
- **Mesuré sur tes 92 tirages** : chaque carte se relance une fois, à chaque choix, jamais la même carte deux fois, et la
  rareté ne bouge pas. 36 de tes 86 choix venaient d'une relance. Mais sur 83 tirages relancés, 18 ont perdu la carte que
  l'app classait première.
- **Command Line confirmé** : à chaque choix, la 1re relance monte d'un cran (Argent → Or, Or → Prismatique). Vu sur ta partie
  du 2 nov. et sans doute sur 3 parties du 28 oct. L'ancien conseil « garde tes rerolls » était faux, il est remplacé.
- **Calcul** : tirage supposé uniforme dans la rareté (compatible avec tes 445 cartes vues), avec les mêmes valeurs que le
  classement. Les cartes rares sur ton champion comptent avec leur effet moyen.
- **Limites** : une relance faite avant la 1re lecture de l'écran n'est pas vue ; les augments que tu as déjà et ceux réservés
  à certains champions restent comptés dans le pool. Lecture partielle ou moins de 8 cartes connues : aucun conseil.
- `usage.json` garde maintenant la rareté du tirage et le conseil de relance. Tests : `test/reroll.test.ts` et scénario moteur.
  Rendu vérifié sous Linux avec des données d'exemple ; pas encore vu en partie.

## v1.64 — 2 nov. 2026 — revue de tes achats
- **Chaque partie Mayhem note maintenant tes achats** : sous la revue des augments, « Tes achats : 4 sur 6 dans le plan ».
  Dans le plan = l'item conseillé, un des suivants, ou un item qui répond au même conseil (Morellonomicon quand l'anti-soins
  était conseillé).
- **Deux cas ressortent** : l'item conseillé contre leur équipe que tu n'as pas pris (signalé, sans points), et un autre
  item nettement moins bien placé que le conseil (mêmes règles que les augments : 1 point d'écart et assez de parties).
- **Anciennes parties** : tes achats sont notés au lancement depuis `usage.json`, avec les stats actuelles.
  Les conseils contre leur équipe n'y sont pas reconnus, ce n'était pas enregistré (indiqué sur la revue).
- **`item_bought` garde désormais** la raison du conseil et le winrate de l'item acheté et du conseil.
- **Limites** : arammeta ne donne le winrate que de quelques items par champion (6 dans nos exemples) : la plupart des écarts
  resteront non chiffrés. Le winrate d'un item seul avantage les items achetés tard. Rien en Faille pour les chiffres.
- **Relecture de la revue des augments** (10 vraies parties, 39 choix) : 31 meilleure carte, 5 proches, 1 coûteux, 2 non
  notés. Les seuils restent tels quels.
- Tests : `test/buyreview.test.ts`, scénario achat et anciennes parties. Rendu vérifié sous Linux avec des données d'exemple ;
  pas encore vu sur une vraie partie.

## v1.63 — 2 nov. 2026 — le 2e choix d'un même palier n'est plus perdu
- **Augment en plus (K/DA)** : quand deux tirages tombaient au même palier de niveau, le 2e effaçait le 1er. La revue
  et « Reco d'augment suivie » perdaient un de tes choix, et le conseil suivi du 1er comptait pour rien.
  Les deux sont gardés. La revue affiche « Niveau 7, 2e choix ».
- **Comment ils sont séparés** : une relance garde au moins une carte, un nouveau choix n'en garde aucune. Si tu relances
  les 3 cartes entre deux lectures (vu 1 fois sur 17 parties), le tirage sans carte prise est écarté.
- **K/DA confirmé sur une vraie partie** : 2e tirage 207 s après le 1er, au même palier. L'augment en plus peut donc
  arriver à tout moment.
- **Noms « jamais reconnus »** : fausse alerte. « Stats on Stats on Stats! » est un vrai augment, le raté date de la
  toute première partie, avant que toutes les cartes du jeu soient reconnues. Rien à corriger dans la lecture.
- Les anciennes parties ne sont pas recalculées. Tests : `test/offers.test.ts` (séquences de tes vraies parties) et
  scénario moteur. Pas encore vu en partie : à vérifier à ta prochaine partie K/DA.

## v1.62 — 2 nov. 2026 — conseils plus stables, synergie plafonnée
- **Achat stable** : tant que ton inventaire ne change pas, le conseil ne change plus. Une nouvelle menace passe
  après ton prochain achat. Vraie partie du 2 nov. : Thornmail, Iceborn, puis Thornmail en 90 secondes.
- **Synergie + compo plafonnées à 5 points** : elles s'additionnaient sur tes 4 alliés (Tahm Kench à 52 % noté +10).
  Choix prudent, pas une mesure : le score du champion joué et son détail sont maintenant enregistrés pour le vérifier.
- **Headliner** : un texte qui n'est que le début du nom de skin d'un joueur est retiré. Limite : un vrai headliner
  du même nom qu'un skin en jeu sera retiré aussi. Rien ne confirme encore que c'était la cause de « Space Groove ».

## v1.61 — 2 nov. 2026 — leur équipe compte plus tôt, et « il manque » est relié au conseil
- **Résistances plus tôt** : 3 ennemis ou plus qui font surtout le même type de dégâts rendent l'armure ou la
  résistance magique urgentes, dès que ce type dépasse 60 % de leurs dégâts. L'item passe après ton 1er item de build. Vraie
  partie du 2 nov. : contre Xerath, Cassiopeia, Morgana et Brand, la résistance magique arrivait après Manamune.
- **Moins de faux conseils contre les critiques** : un seul ennemi à 3 items critiques ne change plus ton build
  (il en faut 2 ennemis, ou 4 items sur un seul).
- **Champ select** : une fois ton champion choisi, « Il manque encore » ne cite plus ce qu'il apporte. Une phrase dit
  ce qu'apporte le meilleur choix, ou qui comblerait le manque et à combien de points.
- **Builds les plus gagnants** : indiqué clairement qu'ils ne tiennent pas compte de leur équipe (le prochain achat, si).

## v1.60 — 2 nov. 2026 — revue de tes choix d'augments
- **Chaque choix d'augment est noté après la partie**, comme la revue d'une partie d'échecs : meilleure carte,
  choix proche, choix coûteux (avec les points de winrate estimés perdus) ou non noté. Visible dans « Ta dernière
  partie » à l'accueil et en ouvrant une partie dans Mes parties → Toutes les parties.
- **Bilan sur plusieurs parties** dans Toutes les parties, selon les filtres : choix solides, points perdus par
  partie, choix le plus coûteux.
- **Pourquoi ça compte** : il faudrait environ 1 500 parties par groupe pour voir un écart de 5 points sur ton
  winrate. La revue juge la décision avec les stats globales, donc elle sert dès la première partie.
- **Prudente par construction** : « coûteux » seulement si l'écart dépasse 1 point et tient sur l'échantillon.
  Carte estimée ou non lue : choix non noté, jamais une fausse erreur.
- **Tes anciennes parties** sont notées au lancement à partir de `usage.json`, avec les stats actuelles et sans ton
  build du moment (indiqué sur la revue).
- 100 % local, gratuit, sans LLM. Les achats ne sont pas encore notés. Tests : `test/review.test.ts` et scénario
  moteur. Rendu vérifié sous Linux avec des données d'exemple ; pas encore vu sur une vraie partie.

## v1.59 — 29 oct. 2026 — headliner mieux lu, et mesuré
- **Bannière du headliner plus tolérante** : une lettre mal lue ne fait plus rater les noms longs
  (« HEARTSTEE1 », « Command Lime », « Space Gr0ove »). Les noms courts (Disco, K/DA) restent exacts.
- **Bees reconnu** : « Bees » seul est accepté pendant la bannière du début (90 premières secondes), hors écran
  de cartes (l'augment « BEES! » ne déclenche toujours rien). Avant, il fallait « Headliner : Bees ».
- **Lecture ratée notée** : si aucun headliner n'est reconnu au début d'une partie Mayhem, le journal l'écrit
  (« Headliner non reconnu au début de partie (N lectures) ; textes approchants : … ») et `usage.json` garde un
  `headliner_miss` (lectures faites, 5 textes courts proches d'un nom au plus). Sert à régler la lecture : sur
  tes 2 parties de ce soir, Space Groove a été lu (Nasus) mais rien pour Hwei.
- Tests : tolérance d'une lettre, « Bees » seul, textes approchants, événement `headliner_miss` dans le
  scénario moteur.

## v1.58 — 29 oct. 2026 — lectures d'écran et boucle fiables aux transitions
- **Plus de cartes collées à la mauvaise situation** : une lecture d'écran (capture + reconnaissance, plusieurs
  secondes) est jetée si, entre-temps, la partie s'est terminée, le champion a changé ou un nouveau choix
  d'augment (niveau 7 / 11 / 15) est arrivé. Avant, un résultat tardif pouvait s'afficher après la fin de partie,
  compter dans « Reco d'augment suivie » ou donner un faux headliner. Même contrôle pour ⌘⇧R et la bannière du
  headliner. Le journal note « Lecture des cartes ignorée » quand ça arrive.
- **Arrêt propre du moteur** : un arrêt (ou redémarrage) pendant une lecture du client ne relance plus la boucle
  en double ; la lecture d'écran s'arrête aussi net à la fermeture.
- Tests : promesses différées (arrêt pendant un tick, redémarrage sans double boucle) et lectures périmées
  (fin de partie, changement de choix) dans le scénario moteur.

## v1.57 — 29 oct. 2026 — refonte de l'interface (fondations, parcours, états)
- **Fondations partagées** : surfaces à 3 niveaux et filets froids (l'or n'encadre plus chaque panneau : il est
  réservé à la navigation active, à l'action principale et à LA recommandation), échelle typographique,
  espacements, hauteur unique des contrôles, boutons secondaires sobres, étiquettes « eyebrow ».
- **Composants communs** : en-tête d'écran (`PageHeader`), contrôle segmenté au clavier (`Segmented`, flèches
  gauche / droite), messages d'état (`Notice` : info, attention, erreur, vide — icône + texte, jamais la couleur
  seule), chargements en bandes discrètes.
- **Accueil « Avant la partie »** : statut du client dans la phrase d'en-tête, ta session (winrate des 10
  dernières, forme, aujourd'hui), ta dernière partie, puis ce qui marche pour toi ; accès direct à la recherche
  et à la tier list ; historique vide → import en un clic.
- **Préparer** : en-tête unique, mode et rôles en contrôles segmentés, erreurs OP.GG / arammeta expliquées ;
  fiche champion avec retour « Tier list » et bascule Mayhem / rôles au même endroit ; runes présentées par
  arbre (principal, secondaire) sans faux noms quand le client ne donne qu'un identifiant.
- **Champ select** : score présenté comme un indice (« score », explication au survol), options secondaires
  sans couleur criarde, import des runes expliqué tant que ton champion n'est pas choisi, attente expliquée.
- **En partie** : « Contre leur équipe » d'abord (ce qui change ton build, menaces prioritaires marquées), leur
  équipe en une ligne dépliable ; liste d'augments allégée (winrate neutre, écart signé coloré seulement au-delà
  de 0,5 point) ; achat principal sans cadre concurrent quand il n'est pas achetable.
- **Mes parties / Réglages** : un seul titre par écran, chiffres clés à taille utile avec leur fiabilité,
  filtres annoncés aux lecteurs d'écran, KPI masqués quand un filtre ne renvoie rien ; permission
  « Enregistrement de l'écran » présentée comme un état, fonction indiquée indisponible hors macOS ; stats
  anciennes (patch du client ≠ patch des stats) signalées dans la barre latérale et les réglages.
- Barre latérale : statut du client, phase et mode sur une ligne, fraîcheur des stats Mayhem.
- Tests : règles d'affichage (`tone`, `confidenceOf`) et parcours Electron `test/shell-smoke.cjs` (⌘K, ⌘1-4,
  flèches des contrôles segmentés, fiche, filtres, débordement à 900 px). Rendu vérifié sous Linux ; rendu natif
  macOS (polices, vibrance, focus clavier réel) à vérifier sur le Mac.

## v1.56 — 29 oct. 2026 — acheter le bon composant maintenant
- **Améliorations de composants** : le prochain achat tient compte des sous-composants déjà possédés pour
  proposer une amélioration achetable. Exemple : un composant de 900 or issu d’un composant possédé de 400 or
  peut être conseillé dès 500 or disponibles ; le montant affiché est bien 500 or.
- **Achat immédiat distinct de l’objectif** : fenêtre, second écran et téléphone montrent d’abord le
  composant achetable, son coût restant et l’or après achat ; l’objet final reste indiqué comme objectif.
- **Overlay cohérent**, y compris minimal : conseille le composant disponible, demande d’économiser si aucun
  achat n’est possible et ne transforme plus un prix inconnu en « OK ». L’objet final reprend la priorité dès
  qu’il devient achetable. Les choix d’augments gardent leur priorité lorsqu’ils sont reconnus.
- Recettes, décision d’affichage et parcours du moteur couverts par des régressions ; scénario Electron de
  recette synthétique pour les vérifications visuelles. Validation native macOS restant à effectuer sur Mac.

## v1.55 — 29 oct. 2026 — choisir ses augments d’un coup d’œil
- **Tes cartes avant les filtres** : la lecture complète affiche d’abord la carte à prendre, puis les deux
  alternatives. Chaque carte conserve sa position dans le jeu (gauche, milieu, droite) malgré le classement.
- **Lecture partielle explicite** : pas de classement ni de position supposée quand une carte manque ; accès
  direct à la liste et à la recherche manuelle. Sans données sur une carte, le tirage n’est pas conseillé.
- **Statistiques lisibles** : les corrections liées au build sont affichées comme un score en points, distinct
  d’un winrate. Les estimations restent signalées ; la fiabilité des winrates observés utilise le composant partagé.
- **Un seul cadre de recommandation** : sur la vue Mayhem large, l’achat reste lisible sans concurrencer les
  augments. Sur la vue compacte, l’onglet Achat garde sa propre mise en avant. Même présentation des positions
  et du doute dans le panneau par-dessus le jeu, y compris sa densité minimale.
- Vérification cloud avec faux client et fixtures ; capture/OCR et comportement natif macOS à vérifier sur Mac.

## v1.55b — 29 oct. 2026 — headliner de la partie (déployé sur le Mac par une autre session, intégré dans main avec la v1.57)
- **Headliner Mayhem reconnu en partie** : nom lu sur la bannière du début (lecture des cartes, même autorisation),
  ou déduit des cartes Pentakill (choix 1 et niveau 18). Affiché en haut de l'écran en partie et de la fenêtre second
  écran avec 1-2 conseils (Command Line : « reroll une carte Or pour viser du Prismatique » ; K/DA : 4 cartes = un
  augment en plus ; True Damage : enclumes sur éliminations et tours ; Cafe Cuties : reliques de soin…).
- Lecture stricte : « PENTAKILL! », « BEES!!! » ou le fil des éliminations ne déclenchent rien.
- Le headliner reconnu est enregistré avec la partie : Historique et « Par headliner » (Mes stats) l'utilisent.
- Parties à 5 augments depuis le 26.21 marquées **« K/DA (probable) »** dans l'historique (9 parties chez toi).
- Journal et `probe-output/usage.json` (`headliner_seen`) notent ce qui a été lu, pour vérifier la bannière.

## v1.54 — 29 oct. 2026 — navigation, fiche champion, fiabilité
- **Carte joueur** dans la barre latérale : Riot ID, icône, niveau, rang solo et flex (LP), lus dans ton client ;
  mise à jour après chaque partie.
- **Recherche ⌘K** : un champion ouvre sa fiche (Mayhem, ou Faille sur son rôle principal si tu joues la Faille),
  ou un écran. Raccourcis **⌘1 à ⌘4** pour les écrans (rappelés au survol). Transitions d'écran courtes,
  coupées par « Réduire les animations ».
- **Fiche champion** : bascule Mayhem / rôles Faille sans revenir à la liste (seulement les rôles où le
  champion est joué) ; en Faille, « Il bat » / « Il perd contre » avec la fiabilité de chaque matchup.
- **Indicateur de fiabilité** (3 crans : fiable, indicatif, échantillon faible) sur les builds, objets,
  bottes, matchups et ton champion au champ select, d'après l'intervalle de confiance à 95 %.
- **Panneau par-dessus le jeu : densité au choix** (Réglages) : complet (+ menaces d'en face), compact,
  minimal (une seule ligne : la carte à prendre, sinon l'achat).
- Historique : rôle affiché pour les parties de Faille (d'après le client), objets sur 2 lignes maximum, barres
  « par semaine » / « par partie de session » grises quand l'écart n'est pas significatif.
- Noms de champions, objets et runes d'OP.GG affichés quand le client est fermé (plus de « #18 »).
- Palier OP.GG affiché en lettre (S, A, B…) comme dans la tier list.

## v1.53 — 29 oct. 2026 — audit des écrans
- **Tier list Faille par rôle** (Préparer → Faille) : champions de chaque rôle, palier OP.GG, winrate, parties
  et part de jeu dans le rôle ; s'ouvre sur ton rôle en cours. Un clic ouvre le build du rôle (runes, sorts,
  compétences, objets). Les paliers n'utilisent plus le rouge (réservé aux défaites).
- **Couleurs honnêtes sur tes stats perso** : un winrate n'est vert ou rouge que si l'écart à 50 % tient sur
  l'échantillon (intervalle de Wilson à 80 %). 1V 0D reste neutre ; 4V 0D est vert ; 2V 3D est neutre.
- **Forme lisible par les daltoniens** : victoire = carré plein, défaite = carré creux.
- Les marqueurs de headliner sans nom (« #3176 ») ne sont plus listés dans tes augments.
- Textes à jour pour la Faille (accueil, réglages runes / sorts / acceptation auto).
- Fond de fenêtre identique au thème à l'ouverture (plus de flash d'une autre teinte).

## v1.52 — 29 oct. 2026 — tous les modes 5v5 de la Faille
- **Faille de l'invocateur prise en charge** : classée solo et flex, normale draft et aveugle, Swiftplay, partie
  rapide, Clash, URF, coop contre l'IA. Données OP.GG du patch (classée, flex ou URF selon la file).
- **Champ select Faille** : ton rôle (donné par le client, sinon le rôle principal du champion), le winrate de ton
  champion avec son intervalle de confiance, ton adversaire de lane probable (rôles adverses devinés d'après la
  méta) et ton winrate contre lui. Avant le verrouillage : counter-picks, **seulement ceux dont l'avantage est sûr
  à 95 %**, sans les champions déjà pris ou bannis, avec ta maîtrise.
- **Runes et sorts OP.GG importés** (page complète : 6 runes + 3 fragments ; Flash garde sa touche). Repli sur les
  runes recommandées du client pour ton rôle si OP.GG ne répond pas.
- **Build Faille** : départ, ordre des compétences niveau par niveau et priorité de montée, cœur le plus joué,
  4e/5e/6e items classés par borne basse de confiance, bottes.
- **En partie** : ton adversaire direct lu dans la partie (rôle de chaque joueur, API Live Client) avec ton
  winrate contre lui ; prochain achat et contres à l'équipe adverse comme en ARAM, sans le filtre des items
  absents de l'Abîme. Le panneau par-dessus le jeu montre l'adversaire de lane et l'achat.
- **Statistiques séparées** : tes parties de Faille sont enregistrées mais ne comptent plus dans tes stats et ton
  classement ARAM / Mayhem (filtre « Faille » dans Mes parties).
- **Prochain achat plus sûr partout** : le meilleur item suivant est choisi par la borne basse de son intervalle de
  confiance (un 60 % sur 80 parties ne passe plus devant un 55 % sur 20 000).

## v1.51 — 28 oct. 2026 — après la soirée de test
- **Winrates d'augments plus fiables** : un augment sur peu de parties est ramené vers le winrate du champion
  (400 parties « virtuelles ») avant d'être classé. Un 60 % sur 120 parties ne passe plus devant un 56 % sur
  5 000 ; les conseils sautent moins d'une carte rare à l'autre à chaque reroll.
- **Fausses lectures de cartes supprimées** : un seul nom d'augment reconnu (« Vulnerability — 1 carte sur 3 » en
  plein combat) n'est plus pris pour l'écran de choix.
- Journal : plus d'alerte « aucune fenêtre trouvée » au tout début de partie (le jeu n'a pas encore ouvert sa
  fenêtre) ; elle n'apparaît que si le jeu reste introuvable.
- L'app s'affiche dans le Dock et ⌘Tab.

## v1.50 — 28 oct. 2026 — identité « Atelier Hextech »
- **Nouveau design dans l'univers de League** : encre de l'Abîme, cadres d'or patiné à coins vifs, texte
  parchemin, bleu Hextech réservé au « vivant » (partie en cours, client connecté, focus clavier).
- Titres en capitales serif (Marcellus, proche de l'esprit du client sans en copier la police), interface en
  Barlow ; grands chiffres dans la police des titres.
- **La recommandation a son propre cadre** : coins coupés, filet or → cristal, cristal Hextech serti dans l'angle.
  Seul élément qui brille : meilleure carte d'augment, champion à prendre, prochain achat (fenêtre, panneau
  par-dessus le jeu, téléphone).
- Rail de navigation façon client (onglet actif serti d'or), emblème original (losange d'or + cristal).
  Boutons du client (filet d'or) ; le bouton principal est « chargé » d'Hextech.
- Lisibilité : textes discrets et rouge défaite éclaircis pour passer le contraste AA sur les panneaux.
- Aucun logo, police ni image protégée de Riot n'est utilisé.

## v1.49 — 28 oct. 2026
- Fenêtre du jeu en plein écran : cherchée parmi toutes les fenêtres du processus du jeu (avant : seulement celles
  « à l'écran », d'où « aucune fenêtre trouvée » à chaque partie). Sert au placement du panneau et au cadrage de la
  lecture des cartes.

## v1.48 — 28 oct. 2026
- **Échanges de champion au champ select réparés** : le client répondait « 404 Invalid URI format » (Zyra, Sona,
  Teemo aujourd'hui). La route s'appelle maintenant `champion-swaps` côté client ; l'ancienne reste en repli.
- Une menace est couverte dès que tu as un de ses items : après Morellonomicon, l'app reconseillait Oblivion Orb
  (anti-soins) — partie Karthus.
- Journal : le conseil du champ select et ton champion à chaque changement (score et winrate), pour relire tes
  choix de champion après coup.

## v1.47 — 28 oct. 2026 — les augments selon ton build
- **Tes cartes sont classées selon ce que tu construis**, pas seulement selon ton champion : un augment à
  critiques passe devant si tu construis critique, derrière si tu es full AP ou tank. Correction de ±4 points
  maximum sur le winrate, toujours affichée sur la ligne (« va avec ton build (critiques) +2,5 », « ne va pas avec
  ton build (puissance) −2,5 »). Aussi dans le panneau par-dessus le jeu et la notification « Prends … ».
- Ton build = tes items finis (comptent double) + les prochains achats prévus. Ce que fait chaque augment : sa
  description sur le wiki LoL (Module:MayhemAugmentData, mis en cache 24 h). Sans ces données, rien n'est corrigé.
- Limite : tes augments déjà pris ne sont pas encore comptés — le jeu ne les donne pas en direct. L'app enregistre
  à chaque choix ce que l'API du jeu expose (`liveclient-choixN-….json`) pour vérifier s'ils apparaissent en cours
  de partie.

## v1.46 — 28 oct. 2026 — partie Teemo
- **Un conseil d'achat passé 2 fois descend en fin de liste** : Zhonya restait en tête pendant 3 achats alors que
  tu prenais Cryptbloom, Morello puis Malignance.
- Critiques en face : à partir de 3 items à critiques (avant : 2, Jinx avec 2 items suffisait à imposer Zhonya).
- Fenêtre du jeu introuvable (« aucune fenêtre trouvée ») : repli par nom de l'application, et le journal dit
  ce qui est visible si ça échoue encore. Sert à placer le panneau et à cadrer la lecture des cartes.
- Échange refusé au champ select : le journal donne maintenant la raison renvoyée par le client.

## v1.45 — 28 oct. 2026
- **Plus d'items qui n'existent pas en ARAM / Mayhem** (Guardian Angel, Chemtech Putrifier) : chaque conseil est
  vérifié contre la liste des items vus en Mayhem (arammeta, mise à jour à chaque patch). Contre les critiques,
  Death's Dance remplace Guardian Angel.

## v1.44 — 28 oct. 2026 — partie Hecarim
- **Muramana / Fimbulwinter / Seraph** : le build citait l'item transformé, qui ne s'achète pas. L'app conseille
  maintenant ce qui s'achète (Manamune, « devient Muramana une fois chargé ») ; une fois Manamune acheté, elle passe
  à l'item suivant au lieu de rester bloquée.
- **Contres pris dans le build de ton champion** : contre une menace, l'app propose d'abord un item que ton champion
  joue déjà et qui y répond (Death's Dance — armure — contre les critiques sur Hecarim) avant un contre générique
  (Guardian Angel).
- **D'où vient le build** affiché sous le parcours : « Build Shojin + Muramana : 57 % sur 23 561 parties Mayhem
  (arammeta), seul build courant pour ce champion. Adapté à leur équipe : … ».

## v1.43 — 28 oct. 2026
- **Prix restant** : les composants déjà dans ton inventaire sont déduits, comme dans la boutique du jeu
  (« reste 1 900 » au lieu des 2 800 de l'item complet), et « il manque » est calculé sur ce reste.
- **Ce qu'ils construisent vraiment** (les items que tu vois avec Tab, lus en direct) :
  - un ennemi qui construit à l'opposé de son champion (Ezreal AP, Kayle AD…) compte pour ce qu'il construit
    (« construit AP » sur sa ligne), et les menaces magiques / physiques sont recalculées ;
  - critiques en face → Randuin's / Steelcaps ; beaucoup de vitesse d'attaque → Frozen Heart / Thornmail ;
    vol de vie → anti-soins ; armure ou RM empilées → pénétration.

## v1.42 — 28 oct. 2026 — apprendre de tes parties
- **Journal de partie** gardé dans `probe-output/journal.txt` : cartes lues et augment conseillé, chaque
  changement de conseil d'achat (avec ton or et ton inventaire), messages de l'app. Pour relire une partie après coup.
- **Achats suivis** (`usage.json`, `item_bought`) : chaque item fini acheté, comparé au conseil affiché juste
  avant. On saura si le conseil d'achat est suivi, et où il se trompe.
- Correctif : un même niveau propose parfois 2 choix (augment, puis carte headliner Pentakill HEAVY / POWER /
  THRASH). Le 2e écrasait le 1er dans le suivi « reco suivie ».

## v1.41 — 28 oct. 2026 — après ta 1re vraie partie (Taric)
- **Achat refait** (en partie, colonne de droite) :
  - le prochain item en grand, avec qui l'impose en face (« résistance magique (Morgana, Karthus, Kayn) ») ;
  - **ton parcours sur 6 places** : items déjà achetés cochés, l'item en cours entouré, puis la suite ;
  - ton or, et « mort 12 s » quand le shop est ouvert.
- **Plus bloqué sur un item déjà acheté** : Fimbulwinter compte comme Winter's Approach (idem Muramana, Seraph),
  et ton joueur est retrouvé même si le Riot ID ne correspond pas (par champion).
- **Les deux équipes en direct** : pour chaque ennemi, ses dégâts (physique / magique / mixte), son rôle (tank,
  soins, contrôles), son score et ses items. Ce que ça change pour toi :
  - menace forte (≥ 70 % de dégâts d'un type, beaucoup de soins) : son item passe avant la fin du build, et les
    bottes adaptées (Mercury) remplacent les bottes habituelles ;
  - ils empilent l'armure / la RM → pénétration ; un allié a déjà l'anti-soins ; tu es le seul tank ; un ennemi
    en avance (« Kayn 9/2 : l'armure compte double »).
- **Lecture des cartes** : en partie, 2 cartes sur 3 seulement aux choix 2 et 3. Cause : l'app ne cherchait que
  parmi les augments déjà joués sur ton champion. Elle reconnaît maintenant tous les augments du jeu ; une carte
  rare sur ce champion a un winrate **estimé** (winrate du champion + effet moyen de l'augment).
- Panneau par-dessus le jeu : le prochain achat en bas.

## v1.40 — 28 oct. 2026
- **Panneau par-dessus le jeu refait** (ton réglage actuel) : il affichait encore les winrates globaux de la v1.x.
  Il montre maintenant « Tes cartes » lues à l'écran (la meilleure au liseré prismatique), sinon le top 3 de
  chaque rareté classé pour le choix en cours (niveau 7 / 11 / 15).
- La lecture des cartes ignore le texte affiché par l'app elle-même (panneau posé sur le jeu) : elle ne peut plus
  « reconnaître » ses propres noms d'augments.
- **Correctif important** : la première capture gelait toute l'app tant que la demande d'autorisation macOS restait
  sans réponse. La capture passe maintenant par l'outil système `screencapture` dans un processus séparé : l'app
  reste réactive quoi qu'il arrive.
- Mes parties → Résumé : noms des champions et augments affichés même quand le client League est fermé (« #112 »).

## v1.39 — 28 oct. 2026 — l'app lit tes cartes d'augments
- **Tes 3 cartes reconnues à l'écran** (Mayhem) : en partie, l'app lit les cartes proposées (fenêtre du jeu, texte
  reconnu par macOS), les affiche en tête, classées pour le choix en cours, la meilleure au liseré prismatique.
  Plus besoin de choisir la rareté ni de chercher dans la liste (repliée en dessous). Après un reroll, la liste se met
  à jour toute seule.
- **Dans le doute, l'app se tait** : si une carte n'est pas reconnue, aucune n'est mise en avant (« 2 cartes sur 3
  reconnues : vérifie dans la liste »). ⌘⇧R pour relire.
- **Notification « Prends … »** avec le winrate et les deux autres cartes : visible même jeu en plein écran.
- **Mes parties : « Reco d'augment suivie »** : ton winrate quand tu prends la carte recommandée, contre quand tu en
  prends une autre. Calculé sur tes vraies parties, enregistré dans `probe-output/usage.json` (jamais envoyé).
- Réglages → Pendant la partie : activer / couper la lecture, état de l'autorisation « Enregistrement de l'écran »
  et bouton « Tester la lecture ». Lecture seulement en partie Mayhem, au début et aux niveaux 7 / 11 / 15 ; l'image
  est lue puis effacée aussitôt.
- Document de discovery UX : `docs/ux-discovery/2026-10-28-aram-companion-discovery.md`.

## v1.38 — 28 oct. 2026
- Client League fermé : les sorts s'affichent avec leur nom et leur icône (Flash, Mark…) au lieu de « #4 + #32 ».

## v1.37 — 28 oct. 2026 — refonte de l'interface
- **Navigation par moment** au lieu de 7 onglets par fonction :
  - **Maintenant** suit la partie tout seul : accueil → champ select → en partie.
  - **Préparer** : la tier list, et la fiche d'un champion (augments + build) en un clic.
  - **Mes parties** : résumé de tes stats et toutes tes parties.
  - **Réglages** regroupés : pendant la partie, au champ select, notifications, lancement, téléphone, données.
- **Champ select : la décision d'abord.** Un bloc « Prends Leona +5,6 » avec un seul bouton (choisir la carte,
  prendre sur le banc ou proposer l'échange), les raisons juste en dessous ; les autres options sont repliées.
- **En partie : une seule liste d'augments** classée pour le choix en cours (rareté en gros boutons, choix 1 à 4
  détecté), avec sur chaque ligne tes résultats, « tu perds avec », « piège fréquent », « peu de données ». Le
  meilleur est entouré du liseré prismatique — la couleur réservée à la recommandation, partout dans l'app.
  À droite : « Acheter maintenant » (avec ton or), « Contre leur équipe », build complet replié.
- **Téléphone** : la même vue en partie, en deux onglets (Augments / Achat).
- **Nouvelle identité visuelle** : ardoise et glace de l'Abîme hurlant, couleurs des raretés comme code couleur,
  police Archivo (titres et chiffres élargis).

## v1.36 — 28 oct. 2026
- **Bilan en notification** à la fin de chaque partie (si les notifications sont activées) : victoire / défaite,
  KDA, et les écarts nets par rapport à tes autres parties sur ce champion.
- **Accueil → « Aujourd’hui »** : tes victoires / défaites de la journée (la soirée qui déborde après minuit compte
  pour la même journée) et les champions joués.

## v1.35 — 28 oct. 2026
- **Lancement automatique** (Réglages) : ARAM Companion peut s'ouvrir tout seul quand le client League démarre
  (recommandé) ou à l'ouverture de ta session Mac, via un agent macOS (launchd). Désactivé par défaut.
- Une seule instance : relancer l'app quand elle tourne déjà ne crée plus de doublon.

## v1.34 — 28 oct. 2026
- **Tier list → « Pour moi »** : classement qui ajoute tes propres résultats (3 parties minimum, lissés) au winrate
  global, comme le score du champ select.
- **Historique → filtre par augment** : toutes tes parties avec un augment donné (pris au moins 2 fois), avec le
  winrate, le KDA et les dégâts correspondants en haut.

## v1.33 — 28 oct. 2026
- **Changements d'équilibrage ARAM** : l'app compare chaque relevé du wiki au précédent. Les champions dont les
  bonus / malus ont changé (30 derniers jours) sont signalés : sur l'Accueil pour ceux que tu as déjà joués, et au
  champ select sur les cartes concernées (« ⚖ modifié le … : −5 % dégâts → −10 % dégâts »). Le premier relevé sert
  de référence : les changements apparaîtront à partir de la prochaine mise à jour du wiki.

## v1.32 — 28 oct. 2026
- **Champ select → « Déjà joué avec »** : les coéquipiers que tu as déjà croisés (d'après ton historique) avec vos
  victoires / défaites ensemble — si le client donne leur Riot ID au champ select.
- Diagnostic : une capture du champ select (sans identifiants) par partie dans `probe-output/` pour vérifier les
  champs du client (Riot ID des alliés, échanges).
- Le journal ne répète plus la même erreur à chaque seconde.

## v1.31 — 28 oct. 2026
- **Icône** : ARAM Companion a sa propre icône (A doré) dans le Dock, dans le Finder et dans les notifications, au
  lieu de celle d'Electron. Le nom dans le Dock reste « Electron » tant que l'app n'est pas empaquetée et signée.

## v1.30 — 28 oct. 2026
- La fenêtre principale et la fenêtre en jeu se rouvrent là où tu les as laissées (taille et position), tant que
  l'écran est toujours branché.

## v1.29 — 28 oct. 2026
- L'exploration d'un champion (Tier list → clic, ou onglet Build) fonctionne aussi client League fermé : tout le
  build Mayhem sauf les runes recommandées, qui viennent du client.

## v1.28 — 28 oct. 2026
- Onglet **Tier list** : tous les champions Mayhem classés par winrate global (paliers S / A / B / C / D par rang),
  avec tes résultats sur chacun, recherche, filtre par rôle et « déjà joués ». Un clic ouvre ses augments et son
  build (exploration).

## v1.27 — 28 oct. 2026
- **Explorer un champion** (onglets Augments et Build, hors partie) : cherche n'importe quel champion pour voir ses
  augments par rareté, la liste complète, les pièges et son build Mayhem — pour préparer tes parties ou regarder
  un champion du banc à tête reposée. Ton champion en partie reprend la main automatiquement.

## v1.26 — 28 oct. 2026
- **Headliner dans l'historique** : les parties Pentakill (et les autres headliners dès que leur marqueur apparaît)
  sont étiquetées dans l'Historique, et Mes stats affiche ton winrate par headliner. Le marqueur ne pollue plus la
  liste d'augments de la partie.

## v1.25 — 28 oct. 2026
- Correctifs vus sur tes vraies données :
  - l'Accueil et Mes stats affichaient « #223 » au lieu des noms de champions, et pas le bloc « Ce que disent tes
    parties », quand l'app démarrait avant le client : ils se rechargent maintenant à la connexion ;
  - l'augment interne « GoH_PentakillAug_Generic_BlankName » (marqueur du headliner Pentakill) s'affiche
    « Pentakill (headliner) » et n'est jamais compté comme piège.

## v1.24 — 28 oct. 2026
- **Tes pièges perso** (onglet Augments, fenêtre en jeu, téléphone) : augments que tu prends souvent et avec
  lesquels tu perds, tous champions (≥ 4 parties, winrate lissé ≤ 40 %). Sur tes 108 parties : Infinite Recursion
  0V 6D, Phenomenal Evil 2V 6D, Jeweled Gauntlet 2V 4D…
- **Accueil → « Ce que disent tes parties »** : ton winrate selon que tu joues un champion fort ou faible en Mayhem.
  Sur tes parties : 60 % de victoires avec un champion ≥ 52 % de winrate global, 42 % avec un champion < 49 %. Le
  classement du champ select te fait réellement gagner.
- Le bilan de ta dernière partie ne parle plus des morts : sur tes parties, tu meurs autant en victoire qu'en
  défaite, ce n'est pas un signal utile en Mayhem.

## v1.23 — 28 oct. 2026
- Option **Fenêtre en jeu au premier plan** (Réglages) : en jouant en fenêtré sur un seul écran, la fenêtre en jeu
  (⌘⇧S) reste par-dessus le jeu.

## v1.22 — 28 oct. 2026
- L'app garde une copie de ton historique dans `probe-output/historique.json` (dossier du projet, pas envoyé
  ailleurs) pour que les prochaines améliorations soient calibrées sur tes vraies parties.

## v1.21 — 28 oct. 2026
- **Page champion** (Mes stats → clic sur un champion) : à côté de tes résultats par augment, le winrate de tous
  les joueurs avec cet augment sur ce champion, et les augments les plus gagnants que tu n'as peut-être pas essayés.

## v1.20 — 28 oct. 2026
- **Accueil** (onglet Champ select hors partie) : ta forme sur 10 parties, tes champions qui gagnent (3 parties
  minimum, classement lissé) et le bilan de ta dernière partie, au lieu d'un écran vide.

## v1.19 — 28 oct. 2026
- **Échanges avec les alliés** au champ select : quand le client permet un échange, le champion de l'allié apparaît
  dans le classement (« Allié · échange »), noté avec l'équipe telle qu'elle serait après l'échange (ton champion
  passe chez lui). Bouton « Proposer l'échange » : l'allié doit accepter dans son client. Notification si l'échange
  rapporte 1,5 point ou plus.

## v1.18 — 28 oct. 2026
- **Contre leur équipe** suit la partie : un adversaire en avance (kills − morts, lus en direct) pèse plus dans le
  profil adverse (+15 % par kill d'avance, jusqu'à ×2,5) et son score s'affiche sous son portrait (ex. « 8/1 »).
  Un AP qui s'emballe peut faire passer le conseil à la résistance magique en cours de partie.
- Option **Notification aux choix d'augments** (Mayhem, désactivée par défaut) : aux niveaux 7, 11 et 15, une
  notification sans son avec le meilleur augment de chaque rareté pour ce choix — utile sans téléphone ni 2e écran.

## v1.17 — 28 oct. 2026
- **Winrate selon le moment du choix** : un augment ne vaut pas pareil au début et au niveau 15 (ex. The Boom and
  the Bass sur Yasuo : 71 % au 1er choix, 63 % au 4e). En partie, l'app lit ton niveau (API Live Client) et classe
  les augments pour le choix en cours (début, niv. 7, 11 ou 15) dans la fenêtre second écran et sur le téléphone.
  Dans « Tous les augments », boutons Global / 1 / 2 / 3 / 4 (le point vert = choix détecté).
  Données du champion quand il y a assez de parties à ce moment (≥ 150), sinon effet moyen de l'augment (tous
  champions) appliqué au winrate du champion.

## v1.16 — 28 oct. 2026
- **Panneau sur téléphone / tablette** (Réglages → « Sur ton téléphone ou ta tablette », désactivé par défaut) :
  l'app sert la fenêtre en jeu sur ton réseau local. Scanne le QR code avec ton téléphone (même Wi-Fi) : augments,
  liste complète, prochain achat et build, mis à jour en direct. Lecture seule, protégé par un jeton dans l'adresse.
  La solution quand tu n'as qu'un écran et que le jeu en plein écran cache tout. Sur petit écran, l'affichage passe
  en onglets (Augments / Tous / Achat & build).
- macOS peut demander d'autoriser les connexions entrantes pour « Electron » la première fois : accepter.

## v1.15 — 28 oct. 2026
- Diagnostic headliner : en plus de la session du client, l'app dépose aussi `probe-output/liveclient-<partie>.json`
  (statistiques de partie de l'API Live Client du jeu, sans ton Riot ID) une fois l'API prête.

## v1.14 — 28 oct. 2026
- **Champ select** : ta maîtrise sur chaque champion proposé (niveau et points, tous modes) ou « jamais joué ».
  Affichage seulement : elle n'entre pas dans le score (pas de preuve qu'elle prédit tes victoires en ARAM).

## v1.13 — 28 oct. 2026
- Augments avec moins de 300 parties (souvent les 35 nouveaux du 26.21) marqués « peu de données » dans la liste
  complète et la fenêtre second écran : leur winrate n'est pas encore fiable.

## v1.12 — 28 oct. 2026
- Les augments **retirés au patch 26.21** (13 suppressions) n'apparaissent plus dans les classements, les pièges ni la
  liste complète : on ne garde que ceux que ton client connaît encore (arammeta mélange des parties du patch
  précédent).
- Diagnostic : à chaque partie Mayhem, la session de jeu (sans identifiants ni noms) est déposée dans
  `probe-output/` pour repérer le champ du **headliner** (nouveauté 26.21) et l'exploiter ensuite.

## v1.11 — 28 oct. 2026
- **Prochain achat** : si l'item conseillé est trop cher, l'app indique le composant le plus cher que tu peux
  acheter maintenant (arbre d'items du client, sans recompter ceux que tu as déjà).
- **Mes stats → clic sur un champion** : tes augments et tes items sur ce champion avec tes victoires / défaites.
- **Ta dernière partie** (Mes stats) : comparée à tes autres parties sur le même champion (sinon à ta moyenne du
  mode) — dégâts/min, morts, participation — seulement quand l'écart dépasse 20 %.

## v1.10 — 28 oct. 2026
- **Prochain achat** (onglet Build et fenêtre second écran, en partie) : l'app lit ton or et tes items dans le jeu
  (API Live Client officielle, lecture seule) et affiche les 3 prochains items à acheter : suite du build le plus
  gagnant (celui qui recoupe déjà tes items), bottes après le premier item, items contre l'équipe adverse, puis le
  meilleur 3e item — avec le prix et l'or qui manque. Pratique en ARAM où on n'achète qu'en étant mort.

## v1.9 — 28 oct. 2026
- **Tous les augments** (onglet Augments et fenêtre second écran) : tout le pool de ton champion par rareté, classé
  par winrate, avec recherche. Les 3 cartes proposées ont la même rareté : choisis l'onglet, repère les 3, prends
  celle qui a le meilleur rang. Tes résultats perso sont affichés quand tu as au moins 2 parties avec l'augment.
- **Nouveau patch** : quand le client passe à un patch plus récent que les données arammeta, l'app les recharge
  (au plus une fois par heure) et prévient si arammeta n'a pas encore suivi (Réglages + journal).
- Raccourci **⌘⇧S** : afficher / masquer la fenêtre second écran à tout moment.

## v1.8 — 28 oct. 2026
- **Augments** : « Pièges fréquents » — augments souvent pris sur ton champion (≥ 4 % des parties) mais qui gagnent
  au moins 3 points de moins que lui (ex. Big Shot sur Yasuo : pris 7 %, 48 %). Aussi dans la fenêtre second écran.
- **Types d'augments** qui marchent mieux / moins bien sur ton champion que sur les champions proches, pour choisir
  quand aucun des 3 augments proposés n'est dans le classement.
- **Build** : « Autres items qui gagnent » — items seuls très gagnants qui ne sont pas déjà dans les builds affichés.
- Verrou entre sessions (`.install/LOCK`) pour que la tâche planifiée et une session en direct ne modifient pas
  l'app en même temps.

## v1.7 — 28 oct. 2026
- **Mes stats** : « Contre qui tu perds » (ton winrate quand un champion est en face), « Avec qui tu gagnes »
  (champions alliés) et « Tes duos » (joueurs croisés 2 fois ou plus, avec leurs champions). Tri sur un winrate
  lissé pour qu'un 0/3 ne passe pas devant un 4/14 ; 4 parties minimum par champion.
- **Historique** : winrate par semaine et winrate selon le rang de la partie dans la session (pour voir si tu
  baisses en fin de session).
- Bouton **Sauvegarder** (Mes stats) : exporte tout ton historique en JSON — il n'existe nulle part ailleurs.
- Les parties déjà détaillées sont relues une fois pour récupérer le nom de tes coéquipiers.

## v1.6 — 28 oct. 2026
- **Contre leur équipe** (onglet Build et fenêtre second écran, en partie) : l'app lit les 5 adversaires dans la
  session du client et conseille anti-soins, armure, résistance magique, pénétration ou ténacité, avec les items
  adaptés à ton profil (AD, AP ou tank) et les champions responsables.
- **Équilibrage ARAM** : bonus / malus de chaque champion (dégâts, dégâts subis, soins, accélération…) affichés sur
  les cartes du champ select et dans le Build. Source : wiki LoL (cache 24 h), avec un instantané embarqué si le wiki
  ne répond pas. Affichage seulement : les winrates en tiennent déjà compte.
- Option **Accepter la partie automatiquement** (ARAM / Mayhem seulement, désactivée par défaut, dans Réglages).

## v1.5 — 28 oct. 2026
- Nouvel onglet **Historique** : toutes tes parties ARAM / Mayhem, filtres (mode, résultat, champion), winrate,
  KDA moyen, dégâts/min, participation aux kills, série en cours, forme sur 20 parties. Chaque partie montre
  items, augments et dégâts ; un clic ouvre le détail des 10 joueurs (lu dans le client).
- Les parties déjà enregistrées sont complétées depuis le client (items, dégâts, compos) quand il a encore le détail.
- Correctif : le bouton « Tester » ouvrait une fenêtre vide hors partie.

## v1.4 — 27 oct. 2026
- Onglet **Build** avec icônes (runes, sorts, builds à 2 items + 3e item, bottes).
- Fenêtre « second écran » par défaut (l'overlay ne passe pas au-dessus du jeu chez toi).
- Tes stats perso par augment, notifications au champ select.

## v1.0 – v1.3
- Champ select (cartes + banc classés), import runes/sorts/item set, augments Mayhem, overlay, Mes stats,
  enregistrement des fins de partie.
