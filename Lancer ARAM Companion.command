#!/bin/bash
# Alternative au lanceur .app : ouvre l'app depuis le Terminal (utile pour voir les erreurs).
cd "$(dirname "$0")"
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
