# Passation pour les sessions automatiques

Ce fichier est lu en premier par chaque session planifiée qui améliore l'app. Elle n'a **aucun souvenir** des
sessions précédentes : tout ce qu'il faut savoir est ici, dans `docs/ROADMAP.md` et dans `CHANGELOG.md`.

## Le projet

App compagnon ARAM / ARAM: Mayhem pour League of Legends, **macOS uniquement**, usage perso de Celian (dev Vue/TS).
Electron 44 + Vue 3 + Vite + TypeScript, tests vitest. Source de vérité : ce dossier sur le Mac de Celian
(`~/Documents/aram-companion`). Il n'y a pas de dépôt git (le dossier connecté interdit les suppressions, ce qui
casse git) : l'historique, ce sont les archives `.install/aram-companion-vX.Y.tgz` et `CHANGELOG.md`.

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

Plusieurs sessions peuvent tourner (tâche planifiée toutes les 4 h + session interactive avec Celian).
- Au début : lire `.install/LOCK` sur le Mac. S'il existe et que son horodatage (première ligne, ISO 8601 UTC) date
  de **moins de 3 h**, une autre session travaille : **ne rien modifier**, terminer en disant « session en cours
  ailleurs, rien fait ».
- Sinon : écrire `.install/LOCK` (`date -u +%Y-%m-%dT%H:%M:%SZ` puis une ligne qui décrit la session), et le
  rafraîchir (réécrire l'horodatage) au moins toutes les heures pendant le travail.
- À la fin (déployé ou abandonné) : écrire `LIBRE` comme première ligne de `.install/LOCK` (pas de `rm`, interdit).

## Procédure d'une session

Le Mac est accessible par les outils `mcp__remote-devices__*` (shell Linux sur les dossiers connectés : le projet est
dans `$HOME/mnt/Documents/aram-companion`). Les `node_modules` du Mac sont des binaires macOS : **on build et on teste
dans le conteneur cloud**, pas sur le Mac.

1. Lire `docs/AGENT.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
2. Snapshot des sources côté Mac :
   `cd ~/mnt/Documents/aram-companion && tar czf .install/src-snapshot.tgz --exclude=node_modules --exclude=dist --exclude=.install --exclude='ARAM Companion.app' --exclude=probe-output .`
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
7. Résumé final en français, court : ce qui a été ajouté, comment le voir, ce qu'il doit vérifier en partie.

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

## Design (v1.50, « Atelier Hextech »)
Jetons dans src/renderer/styles.css : encre --bg #050d16, panneaux --panel/--panel-2, or patiné --gold #c8aa6e,
parchemin --text, cristal --blue #0ac8b9 (réservé au vivant / focus). Titres Marcellus (h1 en capitales), interface
Barlow. Coins vifs (--radius 2px), cadres .card à filet d'or. **Une seule chose brille : la recommandation (.reco)**
— ne pas réutiliser ce cadre ailleurs. Pas de logos / polices / images de Riot (hors icônes CDragon déjà utilisées).
