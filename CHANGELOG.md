# Journal des versions

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
