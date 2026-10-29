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
