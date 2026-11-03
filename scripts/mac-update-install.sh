#!/bin/bash
# Mise à jour locale précompilée. Aucun téléchargement, aucune compilation ni fermeture d'application.
# Le même moteur de copie se teste sous Linux avec --target ; l'ouverture Finder reste à valider sur macOS.
set -euo pipefail
export LC_ALL=C

PACKAGE_DIR=$(cd "$(dirname "$0")" && pwd -P)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/aram-update.XXXXXX")
LOCK_DIR=''
STAGE=''
BACKUP=''
TARGET=''
TRANSACTION=0

fail() { printf '%s\n' "Erreur : $*" >&2; exit 1; }
sha() { shasum -a 256 "$1" | awk '{print $1}'; }
valid_sha() { [ "${#1}" -eq 64 ] && case "$1" in *[!0-9a-f]*) return 1;; *) return 0;; esac; }
valid_path() {
  case "$1" in
    ''|/*|-*|*'//'*) return 1;;
    .|..|./*|../*|*/./*|*/../*|*/.|*/..) return 1;;
    data|data/*|probe-output|probe-output/*|node_modules|node_modules/*|test/probe-output|test/probe-output/*) return 1;;
  esac
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9_./ @()+-]+$' || return 1
  case "$1" in
    dist/*|src/*|electron/*|docs/*|scripts/*|test/*|build/*|README.md|CHANGELOG.md|package.json|package-lock.json|tsconfig.json|vite.config.ts|vitest.config.ts|'Lancer ARAM Companion.command') return 0;;
    *) return 1;;
  esac
}

# Aucun parent symbolique ne doit permettre d'écrire hors du dossier sélectionné.
safe_target_path() {
  local relative=$1 current=$TARGET part
  local previous_ifs=$IFS
  IFS=/
  for part in $relative; do
    current="$current/$part"
    if [ -L "$current" ]; then IFS=$previous_ifs; return 1; fi
  done
  IFS=$previous_ifs
  return 0
}

cleanup() {
  local status=$1 rollback_ok=1 relative expected
  trap - EXIT
  set +e
  if [ "$TRANSACTION" -eq 1 ] && [ "$status" -ne 0 ]; then
    printf '%s\n' 'Installation interrompue : restauration des fichiers déjà remplacés.' >&2
    if [ -s "$WORK/applied-existing.txt" ]; then
      tar -xzf "$BACKUP" -C "$TARGET" -T "$WORK/applied-existing.txt" || rollback_ok=0
    fi
    while IFS= read -r relative; do
      [ -n "$relative" ] || continue
      expected=$(awk -F '\t' -v name="$relative" '$1 == name {print $3}' "$PACKAGE_DIR/update-manifest.tsv")
      if safe_target_path "$relative" && [ -f "$TARGET/$relative" ] && [ "$(sha "$TARGET/$relative")" = "$expected" ]; then
        rm -f "$TARGET/$relative" || rollback_ok=0
      else
        rollback_ok=0
      fi
    done < "$WORK/applied-new.txt"
    if [ "$rollback_ok" -eq 1 ]; then
      printf '%s\n' 'Les fichiers modifiés ont été restaurés.' >&2
    else
      printf '%s\n' 'Restauration partielle : conserve la sauvegarde pour récupération manuelle.' >&2
    fi
    printf 'Sauvegarde : %s\n' "$BACKUP" >&2
  fi
  [ -z "$STAGE" ] || rm -rf "$STAGE"
  [ -z "$LOCK_DIR" ] || rmdir "$LOCK_DIR" 2>/dev/null
  rm -rf "$WORK"
  exit "$status"
}
trap 'cleanup "$?"' EXIT

MODE=install
case "${1:-}" in
  --verify) [ "$#" -eq 1 ] || fail 'Usage : --verify ou --target <dossier>'; MODE=verify;;
  --target) [ "$#" -eq 2 ] || fail 'Usage : --target <dossier>'; TARGET=$2;;
  '') [ "$#" -eq 0 ] || fail 'Arguments invalides.';;
  *) fail 'Usage : double-clic, --verify ou --target <dossier>';;
esac

for file in update-manifest.tsv SHA256SUMS; do
  [ -f "$PACKAGE_DIR/$file" ] && [ ! -L "$PACKAGE_DIR/$file" ] || fail "Paquet incomplet : $file"
done
[ -d "$PACKAGE_DIR/payload" ] && [ ! -L "$PACKAGE_DIR/payload" ] || fail 'Dossier payload absent ou symbolique.'
[ -z "$(find "$PACKAGE_DIR/payload" ! -type d ! -type f -print)" ] || fail 'Le paquet contient un lien ou un fichier spécial.'
awk -F '\t' 'NF != 3 {exit 1} END {if (NR == 0) exit 1}' "$PACKAGE_DIR/update-manifest.tsv" || fail 'Manifeste invalide.'
[ "$(tail -c 1 "$PACKAGE_DIR/update-manifest.tsv" | od -An -tu1 | tr -d '[:space:]')" = 10 ] || fail 'Manifeste incomplet (fin de ligne absente).'
: > "$WORK/paths.txt"
: > "$WORK/expected-checksums.txt"
while IFS=$'\t' read -r relative base new || [ -n "${relative:-}${base:-}${new:-}" ]; do
  valid_path "$relative" || fail "Chemin interdit dans le paquet : $relative"
  valid_sha "$new" || fail 'Empreinte de mise à jour invalide.'
  case "$base" in
    -) ;;
    generated) case "$relative" in dist/*) ;; *) fail 'Une source ne peut pas être déclarée comme fichier généré.';; esac;;
    *) valid_sha "$base" || fail 'Empreinte de base invalide.';;
  esac
  printf '%s\n' "$relative" >> "$WORK/paths.txt"
  printf '%s  payload/%s\n' "$new" "$relative" >> "$WORK/expected-checksums.txt"
done < "$PACKAGE_DIR/update-manifest.tsv"
[ -z "$(sort "$WORK/paths.txt" | uniq -d)" ] || fail 'Chemin dupliqué dans le manifeste.'
sort "$WORK/paths.txt" > "$WORK/expected-files.txt"
(cd "$PACKAGE_DIR/payload" && find . -type f -print | sed 's|^./||' | sort) > "$WORK/actual-files.txt"
cmp -s "$WORK/expected-files.txt" "$WORK/actual-files.txt" || fail 'Inventaire du paquet incohérent.'
cmp -s "$WORK/expected-checksums.txt" "$PACKAGE_DIR/SHA256SUMS" || fail 'Liste des empreintes incohérente.'
(cd "$PACKAGE_DIR" && shasum -a 256 -c SHA256SUMS) > "$WORK/checksum-result.txt" 2>&1 || fail 'Vérification des fichiers échouée. Télécharge de nouveau le paquet.'
printf '%s\n' 'Intégrité du paquet vérifiée.'
[ "$MODE" != verify ] || exit 0

is_project() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -f "$1/package.json" ] && [ ! -L "$1/package.json" ] &&
    grep -Eq '"name"[[:space:]]*:[[:space:]]*"aram-companion"' "$1/package.json" &&
    grep -Eq '"main"[[:space:]]*:[[:space:]]*"dist/electron/main.cjs"' "$1/package.json"
}
if [ -z "$TARGET" ]; then
  [ "$(uname -s)" = Darwin ] || fail 'Le double-clic est prévu pour macOS. Utilise --target pour un test de fichiers.'
  for candidate in "$HOME/Documents/aram-companion" "$HOME/Documents/lol-companion"; do
    if is_project "$candidate"; then TARGET=$candidate; break; fi
  done
  if [ -z "$TARGET" ]; then
    TARGET=$(osascript -e 'POSIX path of (choose folder with prompt "Sélectionne le dossier ARAM Companion contenant le lanceur et package.json.")') || fail 'Sélection annulée.'
    TARGET=${TARGET%/}
  fi
fi
is_project "$TARGET" || fail 'Le dossier sélectionné ne correspond pas à ARAM Companion.'
TARGET=$(cd "$TARGET" && pwd -P)
case "$PACKAGE_DIR/" in "$TARGET/"*) fail 'Décompresse le paquet hors du dossier de l’application avant installation.';; esac
if [ "$(uname -s)" = Darwin ]; then
  [ -x "$TARGET/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ] || fail 'Le moteur Electron de l’installation existante est absent.'
fi
safe_target_path .install || fail 'Le dossier .install est symbolique.'
if [ -e "$TARGET/.install/LOCK" ]; then
  [ -f "$TARGET/.install/LOCK" ] && [ ! -L "$TARGET/.install/LOCK" ] || fail 'Le verrou de session est inexploitable.'
  first=$(head -n 1 "$TARGET/.install/LOCK")
  if [ "$first" != LIBRE ]; then
    if [ "$(uname -s)" = Darwin ]; then
      stamp=$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$first" '+%s' 2>/dev/null) || fail 'Verrou de session illisible.'
    else
      stamp=$(date -u -d "$first" '+%s' 2>/dev/null) || fail 'Verrou de session illisible.'
    fi
    [ $(( $(date -u '+%s') - stamp )) -ge 10800 ] || fail 'Une autre session travaille sur cette installation. Réessaie après sa fin.'
  fi
fi

# Tous les conflits sont détectés avant de créer une sauvegarde ou modifier des sources.
: > "$WORK/existing.txt"
: > "$WORK/new.txt"
while IFS=$'\t' read -r relative base new; do
  safe_target_path "$relative" || fail "Lien symbolique dans la destination : $relative"
  if [ -e "$TARGET/$relative" ]; then
    [ -f "$TARGET/$relative" ] || fail "La destination n’est pas un fichier : $relative"
    current=$(sha "$TARGET/$relative")
    if [ "$base" != generated ] && [ "$current" != "$new" ] && [ "$current" != "$base" ]; then
      fail "Modification locale préservée : $relative. Aucun fichier n’a été remplacé."
    fi
    printf '%s\n' "$relative" >> "$WORK/existing.txt"
  else
    printf '%s\n' "$relative" >> "$WORK/new.txt"
  fi
done < "$PACKAGE_DIR/update-manifest.tsv"

mkdir -p "$TARGET/.install"
if ! mkdir "$TARGET/.install/mac-update.lock" 2>/dev/null; then fail 'Une autre mise à jour est déjà en cours.'; fi
LOCK_DIR="$TARGET/.install/mac-update.lock"
STAGE=$(mktemp -d "$TARGET/.install/mac-update-stage.XXXXXX")
token=$(basename "$STAGE")
BACKUP="$TARGET/.install/mac-update-$(date -u '+%Y%m%dT%H%M%SZ')-$token.tgz"
# package.json assure une archive récupérable même si tous les fichiers du payload sont nouveaux.
{ cat "$WORK/existing.txt"; printf '%s\n' package.json; } | sort -u > "$WORK/backup-files.txt"
tar -czf "$BACKUP" -C "$TARGET" -T "$WORK/backup-files.txt"
tar -tzf "$BACKUP" | sort > "$WORK/archive-files.txt"
[ -s "$BACKUP" ] && cmp -s "$WORK/backup-files.txt" "$WORK/archive-files.txt" || fail 'La sauvegarde n’a pas pu être vérifiée ; installation annulée.'
cp "$WORK/new.txt" "$BACKUP.created.txt"
cp "$PACKAGE_DIR/update-manifest.tsv" "$BACKUP.manifest.tsv"

# Préparer toutes les copies avant le premier remplacement.
while IFS= read -r relative; do
  mkdir -p "$STAGE/$(dirname "$relative")"
  cp -p "$PACKAGE_DIR/payload/$relative" "$STAGE/$relative"
done < "$WORK/paths.txt"
: > "$WORK/applied-existing.txt"
: > "$WORK/applied-new.txt"
TRANSACTION=1
while IFS=$'\t' read -r relative base new; do
  safe_target_path "$relative" || fail "Destination devenue symbolique : $relative"
  mkdir -p "$TARGET/$(dirname "$relative")"
  mv -f "$STAGE/$relative" "$TARGET/$relative"
  if grep -Fxq "$relative" "$WORK/existing.txt"; then
    printf '%s\n' "$relative" >> "$WORK/applied-existing.txt"
  else
    printf '%s\n' "$relative" >> "$WORK/applied-new.txt"
  fi
  [ "$(sha "$TARGET/$relative")" = "$new" ] || fail "Copie non conforme : $relative"
done < "$PACKAGE_DIR/update-manifest.tsv"
TRANSACTION=0
printf '\n%s\n' 'Mise à jour installée, sans compilation.'
printf 'Sauvegarde : %s\n' "$BACKUP"
printf '%s\n' 'Quitte puis rouvre ARAM Companion pour activer cette version. Le jeu et tes données personnelles n’ont pas été modifiés.'
