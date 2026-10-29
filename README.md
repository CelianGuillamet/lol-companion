# ARAM Companion (Mac)

Outil perso pour ARAM et ARAM: Mayhem sur macOS. API officielles uniquement (client League local, API Live Client
du jeu, CommunityDragon, arammeta, wiki LoL) : pas de lecture mémoire, pas d'injection, pas de timers.

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

Raccourcis : ⌘⇧A masquer l'overlay · ⌘⇧M écran suivant · ⌘⇧S fenêtre en jeu.

## Développement

Voir `docs/AGENT.md` (procédure, règles), `docs/ROADMAP.md` (priorités) et `CHANGELOG.md`.

```bash
npm run build      # interface (Vite + Vue) + Electron (esbuild)
npm test           # vitest, dont un scénario complet contre un faux client League (test/mock-lcu.ts)
npm run typecheck
```

Code : `src/core/` (logique sans Electron), `electron/` (fenêtres, serveur téléphone), `src/renderer/` (interface).

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
