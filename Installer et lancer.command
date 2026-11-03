#!/bin/bash
# Installe les dépendances (si besoin), build, puis lance ARAM Companion.
# Tout est journalisé dans launch.log (dans ce dossier).
cd "$(dirname "$0")"
exec > >(tee launch.log) 2>&1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
echo "== $(date) | node $(node -v 2>&1) | npm $(npm -v 2>&1)"
if ! command -v npm >/dev/null; then echo "npm introuvable : installe Node.js (https://nodejs.org)"; read -n1; exit 1; fi
[ -d node_modules ] || npm install || { echo "npm install a échoué"; read -n1; exit 1; }
npm run build || { echo "build a échoué"; read -n1; exit 1; }
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --enable-logging
echo "== Electron s'est arrêté (code $?). Appuie sur une touche pour fermer."
read -n1
