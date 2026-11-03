# Mise à jour précompilée sur le Mac

Ce paquet met à jour une installation existante d’ARAM Companion. Il contient le code et l’interface
déjà compilés ; Node, npm et une compilation sur le Mac ne sont pas nécessaires. Le moteur Electron
macOS déjà présent dans le dossier de l’application est conservé.

1. Décompresse l’archive ZIP dans Téléchargements, hors du dossier actuel de l’application.
2. Double-clique sur « Installer ARAM Companion.command ». Le dossier habituel
   `Documents/aram-companion` est détecté ; sinon, sélectionne celui qui contient le lanceur et `package.json`.
3. Après le message « Mise à jour installée », quitte puis rouvre ARAM Companion. Ne quitte pas League.

Le paquet vérifie ses empreintes SHA-256 avant toute copie. Les fichiers remplacés sont sauvegardés
dans `.install/mac-update-…tgz`, avec la liste des fichiers créés. Une modification locale qui ne correspond
ni à la version de base ni au nouveau fichier interrompt l’installation avant tout remplacement.
Les historiques, réglages, caches, captures, fichiers `.env`, `node_modules` et données personnelles ne font
pas partie du paquet. L’installateur ne ferme ni ne relance automatiquement l’application ou le jeu.

La correction rend le panneau des sorts accessible depuis l’en-tête. Tab l’ouvre lorsque le compagnon
est actif ; ⌘⇧E ouvre la fenêtre dédiée depuis le jeu et Échap la ferme. Les timers manuels de Flash et
d’ultime existants restent disponibles. Aucun suivi automatique des positions dans le brouillard ou des
lancements ennemis n’a été validé. Tab global dans League n’est pas intercepté.

Le paquet et son intégrité sont vérifiés sous Linux. L’installation Finder et le rendu au-dessus de League
plein écran restent à valider sur macOS. Aucun runtime n’est assemblé, signé ou téléchargé par cette mise à jour.

## Générer le paquet depuis le dépôt

Après les tests, le typage et `npm run build`, exécuter :

```bash
node scripts/package-mac-update.mjs --base <commit-de-la-version-installee> --output /workspace/outputs/ARAM-Companion-v1.89-mac-update.zip
```

La référence de base est résolue en SHA exact et enregistrée dans `RELEASE.json`. Par défaut, le script
utilise `origin/main` et un chemin sous `/workspace/outputs`. Il refuse une fusion inachevée, une sortie
déjà existante et tout lien symbolique dans les fichiers inclus. La liste du paquet exclut les fixtures de
test, captures et bundles de démonstration. L’archive est extraite dans un dossier temporaire puis son
installateur est exécuté avec `--verify` avant de conserver le ZIP et son fichier `.sha256`.
