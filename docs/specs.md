# Specs — ARAM Companion (Mac)

_Recherche faite le 26/10/2026. Les modes bougent vite : revérifier à chaque gros patch._

## 1. Données Mayhem — réglé (27/10/2026)

Riot ne fournit pas Mayhem via l'API publique, mais deux sources propres existent (cf. `analyse-projets.md`) :
- **Stats globales** : JSON publics d'**arammeta.com** (MIT) — winrate des augments par champion et par rareté, items,
  sorts ; ~414k parties sur le patch 16.21 (surtout serveur TW). Branché : `npm run mayhem -- <champion>`.
- **Ta base perso** : LCU `GET /lol-match-history/v1/games/{gameId}` → augments des 10 joueurs (`playerAugment1..6`).

Reste impossible sur Mac : lire les augments **proposés** en direct (arammeta passe par Overwolf, Windows uniquement).

## 2. Contexte du mode à prendre en compte

### ARAM (depuis le patch 25.13)
- **Cartes champion** à la place des rerolls : 2 cartes (parfois 3, « blessed card »), la carte
  non choisie part sur le **banc partagé**, échanges possibles ensuite.
- **3 cartes (maps) aléatoires** : Howling Abyss, Butcher's Bridge (canons, Power Flower),
  Koeshin's Crossing (portails). Différences de gameplay mineures.
- **Équilibrage propre à l'ARAM** : modificateurs de dégâts infligés / reçus par champion.
- Tout le monde démarre niveau 3 ; sort exclusif Mark/Dash (Snowball).

### ARAM: Mayhem (depuis 25.21, permanent)
- Augments : 1er au niveau 3, puis niveaux 7, 11 et 15. Sauf le premier, ils se choisissent au
  retour en base après une mort (l'augment « Cheating » permet de recall).
- 3 tiers : Silver, Gold, Prismatic. **Tout le monde reçoit le même tier à chaque écran** ;
  une relance donne un augment du même tier.
- Items et sorts d'invocateur exclusifs.
- Patch 26.12 : +50 augments, -30 augments, sets d'augments retirés → la data vieillit vite.
- Runes en Mayhem : sources contradictoires (à vérifier).

## 3. Fonctionnalités

Priorité : **P1** = V1, **P2** = V2, **P3** = plus tard.

### Champ select (ARAM + Mayhem)
- [ ] **P1 — Conseiller cartes / banc** : score de chaque option (tes cartes + le banc) selon
  winrate ARAM, ton winrate perso, et les besoins de la compo (engage, frontline, poke, soin,
  anti-heal, équilibre AD/AP). Fonction la plus utile, 100 % LCU.
- [ ] **P1 — Import auto** runes + sorts (Snowball ou non) + item set ARAM au lock-in.
- [ ] **P2 — Modificateurs ARAM** affichés pour chaque champion proposé.
- [ ] **P3 — Mayhem : « plafond » du champion** (meilleures perfs avec augments ; cf. Jackpot de YOUR.GG).

### Écran de chargement
- [ ] **P2 — Analyse de la compo adverse** : nb de soigneurs (→ anti-heal), répartition AD/AP
  (→ armure / RM), cibles prioritaires pour la Snowball.

### En jeu — ARAM
- [ ] **P2 — Build adaptatif** : prochain item selon ton or et la compo adverse
  (Live Client Data API : or, items, liste des joueurs).

### En jeu — Mayhem
- [ ] **P1 — Panneau d'augments filtré par tier** pour ton champion, données arammeta (correspondance manuelle avec l'écran : les offres ne sont pas lisibles sur Mac).
- [ ] **P2 — Synergies** : « tu as déjà X, prends Y » (cf. Best Couple de YOUR.GG).
- [ ] **P2 — Items adaptés aux augments** (ex. ADAPt convertit l'AD bonus en AP → build AP).
- [ ] **P3 — Rappel** de l'augment en attente au prochain retour en base.

### Après la partie
- [ ] **P1 — Stats perso** par champion, par map, par mode.
- [ ] **P2 — Augments pris + résultat** → ta propre base Mayhem (si la LCU les expose).
- [ ] **P3 — Records perso.**

### Overlay (Mac)
- Fenêtre transparente, toujours au premier plan, clics traversants. Pas d'injection.
- Electron : `setAlwaysOnTop(true, 'screen-saver')`,
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setIgnoreMouseEvents(true)`.
- Jouer en **borderless**, pas en plein écran natif macOS.

## 4. Sources de données

| Donnée | Source |
|---|---|
| Champions, items, runes, sorts | Data Dragon (gratuit, sans clé) |
| Liste et effets des augments Mayhem | Wiki LoL (`Module:MayhemAugmentData/data`) |
| Champ select, cartes, banc, import | LCU (API locale, lockfile ou process args) |
| Données en partie | Live Client Data API (`127.0.0.1:2999`) |
| Historique, stats ARAM | API web Riot match-v5 (clé « personal »), ARAM = queue 450 |
| Mayhem (stats globales) | arammeta.com `api/tier-list.json` + `api/champions/{id}.json` |
| Mayhem (tes parties) | LCU `/lol-match-history/v1/games/{gameId}` ; files 2400 (principale), 2401, 2403, 2405, 2410, 2450, 3240, 3270, 3280 |

Repo à étudier : `Lanternko/ARAM-Mayhem-Database` (30k+ parties Mayhem, collecteur LCU local).

## 5. Hors limites

- Timers de reliques ou d'objectifs automatiques, cooldowns ennemis.
- Lecture mémoire (Riot la coupe depuis oct. 2026 ; outils approuvés jusqu'en avril 2027 pour migrer).
- OCR de l'écran d'augments (zone grise).
- Scraping de u.gg / OP.GG / Mobalytics (CGU).

## 6. Roadmap

1. **Probe** (`npm run probe`) → répondre aux questions ouvertes.
2. **V1** : connexion LCU, conseiller cartes/banc, import builds ARAM, panneau d'augments par
   tier (tier list statique), stats perso de base.
3. **V2** : analyse de compo, build adaptatif, synergies d'augments, base Mayhem perso.
4. **V3** : crawler ARAM, plafond champion, records.
