# ARAM Companion (Mac)

Outil perso pour ARAM, ARAM: Mayhem et la Faille (classée, normale, Swiftplay) sur macOS. API officielles uniquement (client League local, API Live Client
du jeu, CommunityDragon, arammeta, arammayhem.com, wiki LoL) : pas de lecture mémoire, pas d'injection,
pas de détection automatique des lancements ennemis. Les timers de sorts ennemis sont démarrés à la main.

## Lancer l'app

Double-clique sur **`ARAM Companion.app`** dans ce dossier (ou `Lancer ARAM Companion.command` pour voir les erreurs).
Journal : `~/Library/Logs/ARAM Companion.log`. L'icône du Dock s'appelle « Electron » (app non empaquetée).

## Ce qu'elle fait

- **Accueil** : ta forme, tes champions qui gagnent, le bilan de ta dernière partie.
- **Champ select** : cartes, banc et échanges avec les alliés classés (winrate Mayhem, synergies, compo, tes
  résultats), équilibrage ARAM et maîtrise affichés, choix / prise / échange en un clic, notifications.
- **Import auto** : runes, sorts, item set (option), acceptation de la partie (option).
- **En partie** (fenêtre second écran ⌘⇧S, téléphone, ou overlay) : augments par rareté classés selon le choix en
  cours (niveau), liste complète avec recherche, pièges, prochain achat (or + items lus dans le jeu, composant
  achetable), items contre l'équipe adverse (qui suivent les scores), build le plus gagnant.
- **Mes stats / Historique** : toutes tes parties, filtres, tendances, adversaires / alliés / duos, page champion,
  export.
- **Sorts ennemis** : timers manuels des sorts d’invocateur et de l’ultime. Clique sur un sort quand tu le vois
  partir ; le panneau indique les limites du cooldown calculé et permet de corriger le signalement.
- **Équipe ennemie** en partie : roster, sorts d’invocateur équipés, événements publiés et horloge Live Client.
  Provenance et indisponibilités affichées. **Positions hors vision et suivi automatique des lancements non
  opérationnels** : aucun fournisseur de ces données n’a été vérifié. Aucun timer n’est inventé.

Raccourcis : ⌘⇧A masquer l'overlay · ⌘⇧M écran suivant · ⌘⇧S fenêtre en jeu · ⌘⇧E sorts ennemis.

Pour mettre à jour une installation existante sur Mac sans compiler : télécharge le
[paquet v1.89](releases/ARAM-Companion-v1.89-mac-update.zip), décompresse-le et double-clique sur
**Installer ARAM Companion.command**. Quitte puis rouvre le compagnon après l’installation.
Les données personnelles et le moteur Electron sont conservés. [Détails et sauvegarde](docs/mac-update.md).
Le bouton **Sorts ennemis** en haut de la vue en partie ouvre aussi le panneau. **Tab** fonctionne quand
le compagnon est actif ; Tab dans League conserve le tableau des scores. Le panneau et les fenêtres sont
recalés dans l’écran et leur contenu peut défiler. Le panneau reprend les timers manuels existants ;
les observations automatiques du roster et des sorts équipés restent distinctes de ces signalements.

## Développement

Voir `docs/AGENT.md` (procédure, règles), `docs/ROADMAP.md` (priorités) et `CHANGELOG.md`.

```bash
npm run build      # interface (Vite + Vue) + Electron (esbuild)
npm test           # vitest, dont un scénario complet contre un faux client League (test/mock-lcu.ts)
npm run typecheck
```

Code : `src/core/` (logique sans Electron), `electron/` (fenêtres, serveur téléphone), `src/renderer/` (interface).

### Diagnostic des données ennemies

[Audit des sources et limites](docs/intelligence-investigation.md). Le pipeline `src/core/intelligence/`
lit `allgamedata` dans le processus principal et transmet ses observations par l’IPC existant. Le calculateur
`AdvancedCooldownEngine` exige une règle de patch, un lancement et des statistiques acquis ; son catalogue
de production reste vide en l’absence de fournisseur validé. Le moteur existant `cooldowns.ts` continue
d’alimenter les timers démarrés à la main ; il ne prouve pas qu’un lancement a été observé automatiquement.

Sur l’hôte qui exécute League, en partie :

```bash
./node_modules/.bin/esbuild scripts/intelligence-probe.ts --bundle --platform=node --format=esm --outfile=dist/intelligence-probe.mjs
node dist/intelligence-probe.mjs
```

Le diagnostic affiche uniquement les statuts et structures des interfaces locales, sans valeurs de joueur
ni jeton. Code de sortie 2 si Live Client n’est pas acquis. Les données cachées restent « non validées »
même si le roster est acquis.

Pour tester l’interface sous Linux après le build et le bundling de `test/demo.ts`, lancer
`node dist/demo.mjs intelligence`, puis avec le port affiché et Xorg disponible :

```bash
DISPLAY=:101 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/intelligence-smoke.cjs --no-sandbox --disable-gpu
```

Ajouter `ARAM_TEST_COMPACT=1` pour la vue second écran à 390 px. Ce scénario utilise des données
**synthétiques** ; il vérifie le transport et l’affichage, pas le suivi en vraie partie.

### Vérifier le choix d’augment dans Electron (cloud Linux)

Après `npm run build`, compiler et lancer le faux client dans un terminal :

```bash
./node_modules/.bin/esbuild test/demo.ts --bundle --platform=node --format=esm --outfile=dist/demo.mjs
node dist/demo.mjs ingame
```

Il affiche un port local à reporter dans `ARAM_DEMO_PORT`. Avec un écran virtuel Xorg déjà démarré
(par exemple `:101`), lancer dans un autre terminal :

```bash
DISPLAY=:101 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/augment-chooser-smoke.cjs --no-sandbox --disable-gpu
```

Le scénario vérifie les positions après classement, le dépliage de la liste et la recherche, puis capture le
rendu dans le répertoire temporaire affiché. Ajouter `ARAM_TEST_PARTIAL=1` pour une lecture partielle,
`ARAM_TEST_NO_CARDS=1` pour le repli manuel ou `ARAM_TEST_COMPACT=1` pour la vue second écran à 390 px
(onglets Augments / Achat). Ces variables se placent avant la commande Electron, comme `DISPLAY`.
Les données et le profil Electron sont isolés ; ces tests ne valident pas la capture OCR native macOS.
Les options `--no-sandbox --disable-gpu` concernent ce test dans le conteneur.

### Vérifier la navigation (hors partie)

Avec le faux client `node dist/demo.mjs stats` et le port affiché :

```bash
DISPLAY=:103 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/shell-smoke.cjs --no-sandbox --disable-gpu
```

Parcourt ⌘1 à ⌘4, la recherche ⌘K (filtre, Entrée, Échap), la fiche champion, les contrôles segmentés au
clavier et les filtres de l’historique, à 900 × 640, et vérifie l’absence de débordement horizontal.

### Vérifier les achats immédiats

Le scénario `purchase` utilise une **recette synthétique de test**, sans prétendre reproduire le patch courant.
Après le même build et bundling de `test/demo.ts`, lancer :

```bash
node dist/demo.mjs purchase
```

Avec le port affiché et un écran virtuel disponible :

```bash
DISPLAY=:102 ARAM_DEMO_PORT=<port> ./node_modules/.bin/electron test/purchase-smoke.cjs --no-sandbox --disable-gpu
```

Il vérifie dans le vrai moteur, la fenêtre et l’overlay qu’un composant à 1000 or s’améliore pour **600 or**
quand son sous-composant de 400 or est déjà possédé. Le profil et les données sont temporaires ; le dossier
des captures est affiché. Ajouter `ARAM_TEST_COMPACT=1` pour la vue second écran à 390 px ou
`ARAM_TEST_MINIMAL=1` pour l’overlay minimal.

Deux autres budgets sont disponibles en relançant le faux client : `ARAM_DEMO_GOLD=599` (aucun achat possible)
ou `ARAM_DEMO_GOLD=2400` (objet final achetable). Utiliser son nouveau port dans Electron et ajouter
respectivement `ARAM_TEST_PURCHASE=saving` ou `ARAM_TEST_PURCHASE=item`.
