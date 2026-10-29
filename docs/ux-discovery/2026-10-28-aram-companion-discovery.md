# UX Discovery Document : ARAM Companion
**Date** : 2026-10-28
**Auteur** : Celian + Claude (UX Superpowers)
**Statut** : Validé (persona, job prioritaire et choix de la lecture d'écran validés par Celian)

## 1. Problem Brief
- **Problème** : sur Mac, aucun outil n'aide pendant une partie ARAM / Mayhem. Les overlays de Blitz, OP.GG et Hexgate
  sont absents ou ne fonctionnent pas sur Mac.
- **Utilisateur** : Celian, seul utilisateur. Joueur Mayhem régulier, développeur.
- **Alternatives actuelles** : arammeta, Mobalytics (sites web, hors partie) ; sa mémoire.
- **Pourquoi elles échouent** : inutilisables dans les 5 à 10 s où on est mort ; rien de personnalisé ; aucun lien avec
  le champ select.
- **Périmètre** : amélioration d'un produit existant (v1.38).

## 2. Persona

### Le joueur Mayhem en série — **Primaire** (seul persona)
- **Rôle et contexte** : joue Mayhem en sessions de plusieurs parties, sur Mac. Deux situations : bureau avec
  plusieurs écrans, ou portable seul (jeu en plein écran). « Ça varie. »
- **Comportement** : suit plutôt les winrates mais retombe sur des augments habituels perdants.
- **Objectif fonctionnel** : la bonne décision dans des fenêtres très courtes (≈ 30 s au champ select, 5-10 s mort).
- **Objectif émotionnel** : jouer sans se prendre la tête, être sûr de son choix.
- **Objectif social** : faire les bons choix devant ses amis.
- **Frustrations** : pas d'overlay sur Mac ; les sites sont inutilisables pendant la mort ; le plein écran cache tout ;
  devoir se souvenir soi-même de ce qui marche.
- **Contexte d'usage** : le soir, en rafale ; pression de temps en partie, détente entre deux parties ; 1 à 3 écrans,
  téléphone à portée.
- **Citation** : « Je veux qu'on me dise quoi prendre, maintenant, sans chercher. »
- **Base** : mesurée sur 108 parties (voir § 9) pour le comportement ; objectifs émotionnel et social = hypothèses
  validées par Celian.

## 3. Jobs to Be Done

| # | Job | Importance | Satisfaction (v1.38) | Opportunité |
|---|---|---|---|---|
| **J1** | Quand je suis mort et que 3 augments s'affichent, je veux savoir lequel prendre en moins de 5 s, pour ne pas rater le respawn ni faire un choix perdant. | 10 | 4 | **16** |
| J2 | Quand je suis mort avec de l'or, je veux savoir quoi acheter tout de suite, pour revenir plus fort sans réfléchir. | 8 | 3 | 13 |
| J3 | Quand mes cartes apparaissent au champ select, je veux savoir laquelle prendre (ou banc, ou échange), pour jouer le champion qui gagne le plus. | 9 | 7 | 11 |
| J5 | Quand je lance une partie, je veux que tout soit prêt sans rien faire, pour ne penser qu'au jeu. | 7 | 6 | 8 |
| J4 | Entre deux parties, je veux comprendre ce qui me fait perdre, pour arrêter mes mauvaises habitudes. | 6 | 6 | 6 |

**Job prioritaire validé : J1.**
- Fonctionnel : choisir la bonne carte parmi 3.
- Émotionnel : confiance, pas de stress pendant le chrono.
- Social : ne pas être celui qui fait le choix perdant.

**Constat clé** : le manque n'est pas l'information (elle existe déjà dans l'app), c'est le temps pour faire
correspondre les 3 cartes affichées à la liste. Tant que l'app ne sait pas quelles cartes sont proposées, J1 reste lent.

## 4. Parcours — J1

### État actuel (v1.38)
| Phase | Action | Point de contact | Ressenti | Friction | Durée |
|---|---|---|---|---|---|
| 1. Mort | L'écran d'augments s'ouvre | Jeu | Pressé | Le chrono tourne | 0 s |
| 2. Trouver l'app | Bureau : regarder l'autre écran. Portable plein écran : sortir du jeu ou sortir le téléphone | 2e écran / téléphone | Agacé (portable) | Quasi impossible sur le portable | 1-6 s |
| 3. Rareté | Cliquer Prismatique / Or / Argent | App | Neutre | Clic manuel alors que le jeu la montre | 1 s |
| 4. Retrouver ses 3 cartes | Lire ~40 lignes | App | Tendu | **Pire point** : lecture, pas décision | 3-8 s |
| 5. Choisir | Prendre la plus haute | App → jeu | Plutôt confiant | Les alertes n'aident que si la ligne est trouvée | 1 s |
| 6. Reroll | Relancer une carte et la retrouver | Jeu → app | Agacé | Retour à l'étape 4 | 3-5 s |

Total : **6 à 15 s au bureau, souvent abandonné sur le portable.**

### Moments de vérité
- **Décisifs** : phases 2 et 4.
- **À préserver** : le classement par moment du choix (niveau), les alertes perso (« tu perds avec », « piège
  fréquent »), le liseré prismatique sur la recommandation.

### État souhaité
| Phase | Action | Point de contact | Ressenti visé | Ce qu'on construit | Mesure |
|---|---|---|---|---|---|
| 1. Mort | Les cartes s'affichent | Jeu | Calme | Lecture d'écran (OCR macOS) qui détecte l'écran d'augments | Cartes reconnues ≥ 90 % |
| 2. Voir la réponse | Rien à faire | Fenêtre en jeu / téléphone / notification (portable) | Confiant | Les 3 cartes reconnues, classées, la meilleure au liseré prismatique ; notification si le jeu est au premier plan | Temps jusqu'au choix < 2 s |
| 3. Reroll | Relancer | Jeu | Serein | Mise à jour automatique à la nouvelle carte | — |
| 4. Après la partie | — | Mes parties | Informé | Winrate en suivant / sans suivre la recommandation | Indicateur principal |

### Écarts
| Phase | Actuel | Souhaité | Écart | Priorité |
|---|---|---|---|---|
| Savoir quelles cartes | Lecture humaine de la liste | Reconnaissance automatique | OCR + correspondance des noms | **Haute** |
| Voir l'info sur le portable | Impossible en plein écran | Notification / téléphone | Notification de la recommandation | **Haute** |
| Rareté | Clic manuel | Déduite des cartes reconnues | Automatique | Moyenne |
| Mesurer l'effet | Rien | Winrate suivi / non suivi | Télémétrie locale | Moyenne |

## 5. Mesures de succès (100 % locales)
- **Indicateur principal** : winrate quand tu prends l'augment recommandé vs quand tu ne le prends pas. Base :
  inconnue. Cible : ≥ 5 points d'écart sur 30 parties.
- **Indicateurs avancés** : temps cartes → choix (< 2 s au bureau) ; cartes reconnues 3 sur 3 (≥ 90 %) ; part des
  choix qui suivent la recommandation.
- **Garde-fous** : CPU de la lecture < 3 % ; aucune capture gardée sur disque ; jamais de recommandation sur une
  carte mal reconnue (si doute : le dire, ne rien mettre en avant).
- **Événements** (`probe-output/usage.json`) : `cards_seen` (ids, confiance, choix n°, heure), `card_picked`
  (augment pris d'après la fin de partie, recommandé ou non), `ocr_miss` (texte lu non associé).
- **Réponses** : reconnaissance faible → régler zone de capture et correspondance ; recommandation ignorée →
  comprendre pourquoi ; pas d'écart de winrate → revoir le classement plutôt qu'ajouter des fonctions.

## 6. Principes de design
1. **La réponse, pas la recherche** : l'app dit quoi prendre ; elle ne demande pas de chercher.
   - *Parce que* : la phase la plus lente du parcours est de retrouver ses cartes (3-8 s).
   - *Donc* : reconnaissance automatique, réponse mise en avant, le reste replié.
   - *Donc pas* : de longues listes à parcourir pendant la partie.
2. **Une seule recommandation visible** : le liseré prismatique est réservé à LA recommandation.
   - *Parce que* : 5 à 10 s de fenêtre ; un œil doit aller à un seul endroit.
   - *Donc pas* : plusieurs éléments mis en avant au même niveau.
3. **Fonctionner quel que soit le setup** : 2e écran, téléphone ou notification.
   - *Parce que* : « ça varie » entre bureau multi-écrans et portable seul.
   - *Donc pas* : de fonction qui n'existe que dans la fenêtre principale.
4. **Dans le doute, se taire** : une recommandation fausse est pire que pas de recommandation.
   - *Parce que* : la confiance est l'objectif émotionnel.
   - *Donc* : seuil de confiance de reconnaissance ; afficher « carte non reconnue ».
5. **Mesurer le gain, pas l'usage** : chaque fonction se justifie par le winrate, sur les vraies parties.
   - *Parce que* : sur ses données, suivre les winrates rapporte (64 % contre 42 %).

## 7. Hypothèses et risques
### Validées
- Suivre le classement des champions fait gagner — 64 % (≥ 52 %) contre 42 % (< 49 %), ~35 parties de chaque côté.
- Les morts ne distinguent pas victoire et défaite en Mayhem (13,3 contre 13,4).
- Pas d'effet fatigue au fil d'une session.
### Non validées
- La lecture d'écran reconnaît les noms d'augments de façon fiable (client en anglais, polices du jeu). → Tester sur
  de vraies parties ; `ocr_miss`.
- Le jeu accepte d'être capturé par macOS (permission « Enregistrement de l'écran »). → Premier test en partie.
- Une notification se voit par-dessus le jeu en plein écran. → Test en partie.
### Risques
| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| Capture refusée ou noire en plein écran | Moyenne | Haut | Repli : téléphone ; mode fenêtré sans bordure |
| Mauvaise reconnaissance → mauvais conseil | Moyenne | Haut | Seuil de confiance, correspondance floue stricte, « non reconnue » |
| Politique Riot | Faible | Haut | Lecture d'écran seulement (pas de mémoire, pas d'injection, pas d'action dans le jeu) ; comme Hexgate |
| Coût CPU | Faible | Moyen | Capture seulement en partie Mayhem, 1 image / s, zone réduite |

## 8. Contraintes et périmètre
- **Techniques** : Electron sur macOS ; lecture de texte via le framework Vision de macOS (Swift / JXA) ; permission
  « Enregistrement de l'écran » à accorder une fois ; pas de signature d'app.
- **Utilisateur** : 1 à 3 écrans ; client en anglais.
- **Périmètre (dans)** : reconnaissance des 3 cartes Mayhem, classement, mise en avant, notification, télémétrie locale.
- **Hors périmètre** : toute action dans le jeu (cliquer à la place du joueur) ; lecture mémoire ; timers.
- **Plus tard** : reconnaissance de la rareté et du headliner à l'écran ; aide au reroll (quelle carte relancer).

## 9. Résumé des données
108 parties Mayhem (55 détaillées), 54,6 % de victoires. Augments perdants récurrents : Scopier Weapons 4V 8D,
Infinite Recursion 0V 6D, Phenomenal Evil 2V 6D. Sessions longues fréquentes (43 parties en 5e position ou plus).

## 10. Prochaines étapes
- [ ] Prototype de lecture d'écran : capture de la zone des cartes + Vision, sur une capture réelle de l'écran
      d'augments (à obtenir lors d'une partie).
- [ ] Correspondance des noms lus → augments du pool du champion (floue, seuil strict).
- [ ] Vue en jeu : « Tes cartes » en tête (3 lignes classées), la liste complète repliée en dessous.
- [ ] Notification de la recommandation quand le jeu est au premier plan.
- [ ] Télémétrie locale `cards_seen` / `card_picked` / `ocr_miss` + indicateur principal dans Mes parties.
