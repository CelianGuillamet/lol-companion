# Acquisition des informations ennemies — audit du 3 novembre 2026

## Conclusion vérifiable

Le dépôt peut acquérir la liste des joueurs, leur équipe, leurs objets, leur niveau, leurs scores,
les noms de leurs sorts d’invocateur et les événements de partie exposés par Live Client. Aucune source
**vérifiée ici** ne fournit les coordonnées ennemies en direct, la visibilité, les rappels ou chaque
lancement de Q/W/E/R et de sort d’invocateur. Ces fonctions restent non opérationnelles tant qu’un
fournisseur réel de ces observations n’a pas été validé. Une absence dans un schéma historique ne prouve
pas l’absence de la donnée dans toutes les versions du jeu.

Ce document distingue l’inspection du code, les schémas externes consultés et les observations du runtime.
Les fixtures et les tests synthétiques ne sont jamais une validation sur une partie réelle.

L’audit initial a porté sur le checkout v1.62 (`2c79843`). Avant publication, `main` a été récupérée
jusqu’à la v1.88 (`aa02bd4`) : elle contient déjà `enemyspells.ts`, `cooldowns.ts` et `EnemySpells.vue`,
avec des timers d’ultime et de sorts d’invocateur **déclenchés par un clic de l’utilisateur**. La v1.89
préserve ces fonctions et les raccorde au panneau accessible. Ces signalements manuels ne sont pas
un fournisseur de lancements automatiques, de positions cachées ou d’actions hors vision.

## Application existante

- `src/core/lcu.ts` découvre les arguments de `LeagueClientUx`, puis les lockfiles macOS. La LCU est
  interrogée localement en HTTPS avec l’authentification du client ; Live Client utilise le port 2999.
- Dans le snapshot v1.62 audité, `src/core/engine.ts` lisait `activeplayer`, `playerlist` et `gamestats`, et la session LCU pour les équipes.
  Il n’acquérait pas `eventdata` et ne comportait aucun fournisseur de lancements
  de sorts ou de coordonnées. `LivePlayer.position` est explicitement un **rôle de lane**, pas une position X/Y.
- `scripts/probe.mjs` interroge `/help`, le champ select et `allgamedata` une fois par minute en partie.
  Ce rythme et ses filtres de champs concernent les augments ; ce n’est pas un détecteur de sorts.
- Les captures `probe-output/liveclient-*.json` du snapshot initial ne contenaient que les
  statistiques de partie et le joueur actif. Les versions ultérieures documentent aussi des captures
  `liveclient-choix*` avec les joueurs ; ces données réelles n’étaient pas accessibles à cet audit cloud.
- Le processus principal Electron exécute le moteur. Son état est transmis par `state` aux fenêtres,
  via le preload isolé (`contextIsolation`, `nodeIntegration: false`, sandbox). Le téléphone reçoit
  le même état en HTTP/SSE. Il n’est donc pas nécessaire de déplacer l’acquisition dans le renderer.
- L’app fournit déjà les builds, les conseils d’achat, le champ select, l’historique, les augments,
  les fenêtres overlay/second écran et l’OCR natif macOS des cartes. L’OCR existant ne lit aucun sort ennemi.

## Preuves recueillies dans cet environnement

L’hôte inspecté est Linux x86_64. Les vérifications réseau ont été refaites hors du bac à sable de commandes,
car celui-ci refusait initialement la création de sockets. Les erreurs initiales de sandbox ne servent pas
de preuve d’indisponibilité du jeu.

| Vérification | Résultat observé | Portée de la preuve |
|---|---|---|
| Connexion TCP `127.0.0.1:2999` | Refus de connexion (`ECONNREFUSED`, code 111) | Aucun service Live Client local à cet instant |
| Connexion TCP `127.0.0.1:2997` | Refus de connexion (111) | Aucun service local à ce port ; ne prouve rien sur d’autres ports |
| Application macOS `/Applications/League of Legends.app` | Absente de cet hôte | Le Mac de l’utilisateur n’est pas cette machine |
| Captures `liveclient*.json`, `gameflow-session*.json`, logs r3d, `.rofl`, lockfiles sous `/workspace` (profondeur 4) | Aucun fichier trouvé | Aucun échantillon réel disponible dans les emplacements examinés |
| Variables `RIOT_API_KEY`, `RIOT_TOKEN`, `ARAM_DEMO_PORT`, `ARAM_LIVE_PORT` | Absentes (valeurs non lues) | Aucune configuration de ce nom ; cela ne décrit pas les autres mécanismes d’authentification |
| Swagger communautaire LCU | Téléchargé ; version déclarée `16.21.829.8620` | Description externe, pas introspection du client actuel |
| Documentation officielle Riot | Page développeur HTTP 403 ; schéma statique refusé par le proxy (CONNECT 403) | Documentation officielle non récupérée ici ; aucune conclusion sur le contenu à partir de cette erreur |
| Références CommunityDragon et galeforce | Sources récupérées en lecture seule | Inspection indépendante des interfaces et données statiques |

Aucun test sur un vrai client League ou une partie réelle n’a donc été possible dans ce cloud.
L’absence d’un client local ne signifie pas que les mêmes requêtes échoueront sur le Mac.

## Implémentation et validations livrées

Les modules de `src/core/intelligence/` sont reliés à `Engine`, à `AppState` et au panneau
`EnemyIntelligence.vue`. L’acquisition fonctionne aussi lorsque Live Client répond sans LCU découvert.
L’historique est limité à 200 événements ; une session, un roster différent ou un recul d’horloge le
réinitialise. Une perte Live Client invalide la fraîcheur. Les événements non reconnus restent de simples
événements rapportés et ne déclenchent jamais un lancement de sort.

Le nouveau `AdvancedCooldownEngine` est branché au module `intelligence/enemy-spell.ts` derrière
l’exigence d’un lancement acquis. Il gère les
règles de patch/mode, les accélérations, modificateurs ordonnés, resets/réductions explicitement acquis,
charges à récupération séquentielle et départ de cooldown après réactivation. **Aucune règle de patch
de production n’est enregistrée dans ce nouveau calculateur**, faute d’entrées complètes et vérifiées.
Le moteur préexistant `cooldowns.ts`, ses données Data Dragon et les timers manuels sont conservés.
Ils n’établissent pas un suivi automatique de casts. Les mouvements, rappels, X/Y et états de vision
restent inconnus dans le pipeline d’observations automatiques.

Les résultats du premier tableau ont été exécutés **avant la fusion de la v1.88**. Ils décrivent le checkout
initial enrichi ; les résultats de l’intégration finale suivent ce tableau.

| Vérification exécutée | Résultat | Limite |
|---|---|---|
| `npm ci --include=dev --no-audit --no-fund` puis installation Electron avec `NODE_USE_ENV_PROXY=1` | Succès, lockfile inchangé | Dépendances et binaire Linux |
| `npm test` avant fusion, après correction d’accès aux sorts | 209 tests passés, 27 fichiers, aucun ignoré | Données synthétiques ; aucune partie réelle ; résultat non applicable à la fusion sans réexécution |
| `npm run typecheck` | Succès | Typage uniquement |
| `npm run build` | Succès | Bundle renderer et main/preload ; avertissement Vite préexistant sur `__dirname` |
| `test/intelligence-smoke.cjs` sous Electron/Xorg, largeur 1180 px | Code 0, `smoke:ok`, `errors:[]` | Faux serveur HTTPS, cinq ennemis et trente états de sorts inconnus |
| Même scénario avec `ARAM_TEST_COMPACT=1`, largeur 390 px | Code 0, `smoke:ok`, `errors:[]` | Vue second écran, données synthétiques |
| `node dist/intelligence-probe.mjs` sur ce cloud | Code 2 ; Live Client/OpenAPI/replay absents, LCU non découvert | Aucune acquisition réelle validée |
| `git diff --check` | Succès | Aucun changement de manifeste ou de lockfile |

Après fusion de `aa02bd4` (v1.88), `NODE_USE_ENV_PROXY=1 npm test` passe : **515 tests passés,
4 ignorés** dans la répétition réelle qui exige des captures absentes de ce cloud. Typage et build
réussissent. Les premiers timeouts des tests distants venaient d’appels réseau hors du proxy ;
la configuration Node fournie par l’environnement a été rétablie pour cette validation.
Les scénarios Electron sont passés séparément aux largeurs 1180 et 390 px (`smoke:ok`, `errors:[]`).
Ils utilisent cette fois les vrais composants manuels de v1.88 : clic Flash, timer actif, correction
+10 s, annulation, fermeture Échap, restauration du focus et récupération d’une fenêtre hors écran.
Les captures de l’overlay transparent auxiliaire sont laissées à ses scénarios dédiés ; elles ne servent
pas de preuve pour le panneau interactif corrigé.

L’installateur de mise à jour a passé 11 tests de fichiers, dont un vrai refus de permissions avec
restauration. Le générateur a produit deux ZIP identiques, extrait et vérifié leurs empreintes,
puis appliqué le paquet sur une copie de l’arbre Git v1.88 en préservant des fichiers personnels témoins.
Cette preuve couvre les copies, empreintes et sauvegardes sous Linux ; l’installation native macOS
et le rendu par-dessus League en plein écran restent non validés.

La correction d’accès, intégrée sous le numéro v1.89 après synchronisation de `main`, ajoute le bouton d’en-tête, un dialogue aux dimensions du viewport,
Tab quand le compagnon est actif, et une fenêtre interactive ouverte par ⌘⇧E. Le scénario Electron
vérifie aussi le défilement jusqu’au cinquième ennemi, Échap, le retour du focus, la navigation Tab
dans les champs/boutons, et la récupération d’une fenêtre volontairement déplacée hors écran.
Les tests grand écran et 390 px passent sous Linux ; le raccourci est exercé via son gestionnaire
enregistré. Ni Tab global ni l’affichage au-dessus du jeu plein écran macOS ne sont validés ici.
Dans le panneau d’observations `EnemyIntelligence.vue`, les cases Flash restent informatives.
Le composant préexistant `EnemySpells.vue` conserve ses boutons : un clic y signale manuellement un
lancement et démarre le timer correspondant. La fusion les réutilise dans le dialogue et la fenêtre dédiée.

Un essai de la suite existante a échoué sur un timeout d’initialisation : les anciens tests moteur
contactaient encore les descriptions Mayhem du wiki malgré leurs autres dépendances hors ligne.
Le fetcher prévu par le projet est désormais explicitement hors ligne dans ces tests ; la suite finale
passe sans cette dépendance réseau. Aucune assertion n’a été supprimée.

Le script d’installation complet, les instructions de démarrage et les domaines publics nécessaires à
l’app ont été sauvegardés dans le draft d’environnement. Cela ne publie pas le snapshot et ne prouve
ni l’application immédiate du réseau ni la restauration dans une nouvelle tâche. Les processus de test
doivent être relancés. Aucun déploiement sur le Mac n’a été effectué.

## Matrice des sources

| Source inspectée ou identifiée | Données vérifiables / structure | Limite pour l’objectif demandé |
|---|---|---|
| Live Client `allgamedata`, `playerlist` | `allPlayers`, équipe, identité, champion, niveau, objets, scores, mort/respawn, runes principales, noms des deux sorts d’invocateur | Aucun X/Y, état de vision ou instant de lancement dans les types et l’échantillon consultés |
| Live Client `activeplayer`, `activeplayerabilities` | Identifiants et niveaux Q/W/E/R **du joueur actif**, statistiques personnelles | Ne renseigne pas les niveaux des sorts ennemis ; ne donne pas un flux de casts |
| Live Client `playersummonerspells` | `summonerSpellOne/Two` : `displayName`, `rawDescription`, `rawDisplayName` | Identifie les sorts équipés ; aucun cooldown ou timestamp d’utilisation dans la référence inspectée |
| Live Client `eventdata` | `EventID`, `EventName`, `EventTime`, acteurs suivant l’événement | Événements de kills/objectifs exposés, pas une liste complète des actions du runtime ; aucune garantie sur les actions hors vision |
| Live Client `gamestats` | `gameTime`, mode, carte | Temps de partie échantillonné ; le temps de réception n’est pas le timestamp exact d’un sort |
| Schémas locaux `/swagger/v3/openapi.json`, `/swagger/v2/swagger.json` | Introspection de la version du jeu réellement lancée | Non récupérables ici : aucun service au port 2999 ; à vérifier sur le Mac en partie |
| LCU `/help`, session gameflow | Phase, partie, équipes, sélections, informations de connexion du game client | Les équipes sont des objets extensibles dans le schéma ; leur contenu doit être constaté sur le vrai client. Aucun getter de coordonnées ou de casts identifié dans le schéma consulté |
| Événements LCU / websocket | Notifications de changements des ressources du client | Un transport de notification ne crée pas un flux d’événements du moteur de jeu absent des ressources sources |
| LCU `/telemetry/v1/application-start-time`, `/telemetry/v1/common-data` | Horodatage de démarrage du client ; dictionnaire de chaînes de télémétrie commune | Pas d’état des dix champions décrit ; les routes POST de télémétrie/tracing acceptent des événements, elles ne constituent pas une lecture de casts |
| LCU replays | Configuration de replay, chemin ROFL ; métadonnées : `state`, `gameId`, `downloadProgress` | Ce ne sont pas des coordonnées en partie. Un replay/spectateur ne doit pas être présenté comme la vue temps réel du joueur |
| LCU historique / fin de partie | Statistiques et objets des dix participants, augments selon le mode | Après partie ; ne satisfait pas la demande de suivi temps réel |
| Match-v5 timeline | Positions X/Y et statistiques dans les frames, événements horodatés | Source après partie, non utilisée comme substitut au suivi temps réel ; aucun accès réel testé ici |
| Data Dragon / CommunityDragon | Assets, descriptions et paramètres statiques versionnés | Un cooldown de base n’est ni un lancement observé ni le cooldown réel de l’adversaire. Les niveaux, haste, buffs et resets manquent |
| Logs locaux / dumps existants | Aucun fichier de jeu disponible dans les emplacements examinés | Aucun parseur d’événements cachés ne peut être validé. Ne pas prétendre qu’un champ supposé existe |
| Runtime / mémoire / communications du jeu | Aucun processus de jeu, flux réseau ou schéma mémoire disponible à inspecter ici | Aucune preuve sur la présence ou non des informations hors vision côté client. Aucun accès mémoire ni interception implémenté ; cela exige une investigation distincte sur l’hôte qui exécute réellement le jeu |

Dans l’échantillon externe Live Client consulté, les noms d’événements présents sont : `Ace`, `BaronKill`,
`ChampionKill`, `DragonKill`, `FirstBlood`, `FirstBrick`, `GameStart`, `HeraldKill`, `InhibKilled`,
`MinionsSpawning`, `TurretKilled`. Cette liste décrit **cet échantillon**, pas l’ensemble garanti des
événements des patchs actuels. Un événement d’objectif constate une résolution publiée par l’API ; il
ne permet pas de conclure qu’un champion attaque actuellement le camp, ni que l’action était hors vision.

## Règles de provenance et d’exactitude

1. Une donnée reçue doit porter sa source, son chemin de champ et son temps de partie ; l’heure de
   réception sert à mesurer l’ancienneté et la latence, pas à inventer un instant de lancement.
2. `position: "MIDDLE"` ne doit jamais devenir X/Y. `isDead: false` ne veut pas dire visible.
3. Un sort équipé connu avec aucun événement de lancement a un état de cooldown **inconnu**, jamais « prêt ».
4. Les scores, achats, variations de niveau et kills ne constituent pas des preuves d’un lancement de Q/W/E/R.
5. `EventTime` est exact au sens « valeur publiée par la source », sans garantie supplémentaire de précision
   physique. L’intervalle de polling détermine le délai d’affichage, pas la précision intrinsèque de cet événement.
6. Une formule calculée à partir d’entrées complètes doit rester marquée **calculée**. Une rune, un niveau,
   un reset ou un modificateur inconnu invalide la présentation d’un timer exact.
7. Une déconnexion, un changement de partie ou un retour en arrière de l’horloge doit invalider les données
   concernées. Ne jamais prolonger silencieusement une ancienne observation comme une mesure actuelle.
8. Aucun fournisseur de production ne doit accepter un objet arbitraire comme preuve d’un cast ou de coordonnées.
   Un futur adaptateur doit préciser son format, son patch et sa méthode d’acquisition avant activation.

## Vérification à poursuivre sur le Mac

Le blocage restant est l’accès à une partie réelle et à son schéma local. Aucune clé Riot supplémentaire
n’est nécessaire pour Live Client. Il faut lancer l’application sur l’hôte du jeu, confirmer la réponse
de `allgamedata`, lire son OpenAPI local et examiner les champs réellement reçus. Les captures doivent
être conservées localement, sans jeton LCU ni publication des identifiants.

Pour confirmer les capacités principales, il faut des observations positives : coordonnées accompagnées
de leur origine, casts identifiés et horodatés, niveaux de sorts/statistiques requis, événements de reset.
Sans ces observations, le module correspondant reste indisponible. Un test d’intégration avec le faux
client démontre seulement le transport, la normalisation et l’absence de faux timers.

### Diagnostic ponctuel intégré

Depuis la racine du dépôt :

```bash
./node_modules/.bin/esbuild scripts/intelligence-probe.ts --bundle --platform=node --format=esm --outfile=dist/intelligence-probe.mjs
node dist/intelligence-probe.mjs
```

Ce programme réutilise `GameDataAcquisitionEngine`, la découverte LCU et `LcuClient`. Il interroge
uniquement `127.0.0.1` : `allgamedata`, OpenAPI v3 (repli Swagger v2), `/help` si la LCU est découverte,
et le diagnostic de replay `/replay/game` au port 2997. Il n’effectue aucune écriture dans le client et
n’accepte aucun hôte externe. La sortie JSON contient des statuts, des noms de champs et des chemins
de schéma filtrés ; aucune valeur de joueur, événement brut ou authentification n’est imprimée.
Le rapport reste sur la sortie standard, sans fichier persistant par défaut.

Vérification exécutée dans ce cloud : compilation esbuild et vérification TypeScript du script réussies.
Exécution locale hors sandbox : Live Client, OpenAPI v3/v2 et replay ont retourné le statut transport `0` ;
LCU non découverte. Le programme s’est terminé avec le **code 2**, qui signifie « acquisition live non
validée ». Ce résultat confirme le blocage d’accès au jeu dans cet environnement ; il n’établit pas que
les fonctions cachées seraient accessibles sur le Mac. Même en cas d’acquisition du roster, les casts,
coordonnées, visibilité et cooldowns restent marqués `unvalidated` dans ce diagnostic.

## Références consultées

- Code de ce dépôt : `src/core/lcu.ts`, `src/core/engine.ts`, `electron/main.ts`, `electron/preload.ts`,
  `electron/phone.ts`, `scripts/probe.mjs`, `docs/code-et-librairies.md`, `docs/sources.md`.
- [Swagger LCU hasagi-types](https://raw.githubusercontent.com/dysolix/hasagi-types/main/swagger.json),
  version déclarée `16.21.829.8620`, SHA-256 du document inspecté :
  `05fd1a764e4655916e4ced981d9f632151cddc08fd073d0aa2f2aec9bb7009cd`.
- [galeforce — types Live Client et échantillon](https://github.com/bcho04/galeforce/tree/9084fae7e66e034390b3f00ae3849a841d0b32fa),
  fichiers `src/galeforce/interfaces/dto/game-client/`, `test/test-data/liveclientdata.json`,
  `src/riot-api/enums/endpoints.ts`. Référence communautaire historique ; aucun alignement avec le
  patch de la partie actuelle n’est présumé.
- [CommunityDragon — nature des données hébergées](https://github.com/CommunityDragon/Docs/blob/e8b866028f341978d8508d51284c8f01cc3b8e24/README.md).
- Références officielles identifiées, **non consultables depuis cet environnement au moment de l’audit** :
  <https://developer.riotgames.com/docs/lol/>,
  <https://static.developer.riotgames.com/docs/lol/game-client-api/swagger.json>.
