# Plan de développement — Premiere Motion Tracker

## Direction technique

Le projet utilise un panneau UXP pour l’interface et l’intégration Premiere, complété par un module UXP Hybrid C++ pour le décodage vidéo et OpenCV. La V1 suit un point dans le média du clip source sélectionné, puis applique le déplacement sous forme de keyframes Position sur un effet Transform du clip cible.

Premiere Pro 26.2 ou plus récent est la cible minimale. Windows x64 est validé en premier, puis macOS ARM64 et Intel.

## Phase 1 — Prototype de faisabilité

- Créer le panneau UXP et diagnostiquer les clips sélectionnés.
- Lire le média source, les temps du clip et la plage In/Out de la séquence.
- Charger un module C++ minimal construit avec le SDK UXP Hybrid Adobe.
- Décoder des images du média avec OpenCV.
- Ajouter Transform au clip cible et écrire deux keyframes Position dans une transaction annulable.

Critère de validation : deux positions détectées dans le média déplacent réellement un clip cible dans Premiere.

## Phase 2 — Sessions et prévisualisation

- Stocker une session sérialisable sans conserver les proxies UXP fragiles.
- Afficher les images du clip dans un canevas interne au panneau.
- Permettre de poser le point de référence et choisir la zone de recherche.
- Conserver les résultats, réglages et corrections manuelles.

## Phase 3 — Point tracking

- Utiliser le flux optique Lucas-Kanade et un contrôle aller-retour.
- Ajouter un suivi de zone de secours et un score de confiance.
- Signaler les images douteuses au lieu d’extrapoler silencieusement.
- Autoriser une correction manuelle et une reprise depuis l’image corrigée.
- Lisser et simplifier la trajectoire avant l’écriture des keyframes.

## Phase 4 — Application dans Premiere

- Créer ou réutiliser l’effet Transform par son match name.
- Convertir les positions normalisées en coordonnées de séquence.
- Conserver l’offset initial du clip cible.
- Écrire ou remplacer uniquement les keyframes appartenant à la session.
- Regrouper l’opération dans une action Annuler unique.

## Phase 5 — Stabilisation et distribution

- Tester 1080p, 4K, 25/30/50/60 i/s et les codecs usuels.
- Mesurer mémoire et temps de calcul sur des plages longues.
- Refuser clairement les cas non pris en charge, notamment le remappage temporel complexe.
- Construire le paquet Windows, puis signer et notariser les binaires macOS.

## Phase 6 — Rendu composite de séquence

- Générer un proxy temporaire de la plage In/Out afin de tracker le rendu visible du Programme.
- Garantir la correspondance exacte entre les images du proxy et les ticks Premiere.
- Nettoyer les fichiers temporaires après validation ou abandon.

## Phase 7 — Tracking de surface

- Poser et suivre quatre coins avec estimation d’homographie.
- Autoriser la correction indépendante de chaque coin.
- Appliquer le résultat à Corner Pin ou à un effet natif dédié, car Transform ne représente pas une perspective complète.

## État au 16 août 2026

- Dépôt initialisé.
- Panneau UXP et capture source/cible en cours de validation dans Premiere.
- Modèle de session et calcul des offsets couverts par des tests automatisés.
- Bootstrap C++ préparé.
- Blocage externe actuel : le SDK Adobe UXP Hybrid, CMake et les outils C++ Visual Studio ne sont pas présents sur la machine Windows de développement.

