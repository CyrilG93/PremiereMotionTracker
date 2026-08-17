# Plan de développement — Premiere Motion Tracker

## Direction technique

Le projet utilise un panneau UXP pour l’interface et l’intégration Premiere, complété par un module UXP Hybrid C++ pour le décodage vidéo et OpenCV. La V1 suit un point dans le média du clip source sélectionné. Une fois le tracking validé, l’utilisateur sélectionne un ou plusieurs clips de destination et leur applique le déplacement sous forme de keyframes Position sur un effet Transform.

Premiere Pro 26.2 ou plus récent est la cible minimale. Windows x64 est validé en premier, puis macOS ARM64 et Intel.

## Phase 1 — Prototype de faisabilité

- Créer le panneau UXP et diagnostiquer le clip source sélectionné.
- Lire le média source, les temps du clip et la plage In/Out de la séquence.
- Charger un module C++ minimal construit avec le SDK UXP Hybrid Adobe. (Windows prêt à valider dans Premiere)
- Décoder des images du média avec OpenCV.
- Ajouter Transform aux clips sélectionnés après le tracking et écrire une keyframe Position par image valide.

Critère de validation : la trajectoire détectée dans le média déplace réellement les clips sélectionnés dans Premiere image par image.

## Phase 2 — Sessions et prévisualisation

- Stocker une session sérialisable sans conserver les proxies UXP fragiles.
- Garder l’image fixe au point In comme aperçu par défaut. Après l’analyse, exporter une suite bornée d’images de la séquence depuis Premiere et y superposer le point de tracking. Publier les échantillons natifs par lots pendant l’analyse sans dépendre du lecteur vidéo UXP.
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
- Convertir les positions normalisées en coordonnées de séquence et compenser les dimensions et l’échelle Motion de chaque cible.
- Conserver l’offset initial de chaque clip cible sélectionné au moment de l’application.
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

## État au 16 août 2026 — jalon 0.3.0

- Dépôt initialisé.
- Panneau UXP, capture de la source et lecture In/Out validés dans Premiere.
- Export de l’image de séquence au point In et placement interactif du point de tracking validés dans Premiere.
- Cœur C++ de corrélation entre deux images couvert par des tests natifs Windows et macOS, en attente de connexion au décodage.
- Ajout de Transform et de deux keyframes Position validé dans Premiere sur un clip de destination sélectionné après la préparation du tracking.
- Modèle de session et calcul des offsets couverts par des tests automatisés.
- SDK Adobe UXP Hybrid disponible localement ; manifeste v6 et bootstrap C++ relié au panneau avec un autotest natif.
- Visual Studio Build Tools 2019 et son CMake intégré permettent le build Windows x64. Les binaires macOS resteront construits sur macOS pour Intel et Apple Silicon.
- OpenCV est relié statiquement au module Hybrid Windows pour inspecter un média via Media Foundation et calculer un suivi Lucas-Kanade avec contrôle aller-retour sur une plage bornée ; l’application crée maintenant une clé Position par image valide sur chaque clip de destination, y compris les médias redimensionnés et les Graphics Layers.
- Validé dans Premiere : la trajectoire suit correctement le point et son application fonctionne sur un ou plusieurs clips sélectionnés.
- Implémenté au jalon 0.3.1 : un unique élément vidéo UXP muet affiche le média source, tandis que l’addon publie les positions calculées par lots et que le panneau ne déplace que son point superposé. Une validation dans Premiere reste nécessaire sur macOS et Windows, notamment avec les codecs usuels.
- Implémenté au jalon 0.3.2 : la lecture directe du média est remplacée par deux modes. L’image In reste le défaut fiable ; une coche avant la capture demande à Premiere un export immédiat de la plage active vers un proxy MP4 temporaire, sans soumettre de tâche à Adobe Media Encoder. Le proxy reste à valider dans Premiere sur macOS et Windows.
- Implémenté au jalon 0.3.3 : le rendu direct reçoit un preset H.264 muet embarqué, car Premiere refuse un `presetFile` vide même avec le mode `IMMEDIATELY`.
- Implémenté au jalon 0.3.4 : le proxy temporaire H.264 est transmis au lecteur UXP comme URL locale `file:/` plutôt que comme URL de stockage `plugin-temp:/`, qui était lisible par l’image fixe mais n’a pas été validée pour la vidéo.
- Implémenté au jalon 0.3.5 : après décodage, la prévisualisation se place après l’image zéro et démarre automatiquement en boucle afin de forcer le rafraîchissement vidéo dans Premiere UXP.
- Implémenté au jalon 0.3.6 : la prévisualisation vidéo est mise de côté. Après l’analyse, jusqu’à 120 PNG de la séquence sont rendus en 640×360 et relus par double buffer à cadence limitée. Seul le bandeau est actualisé pendant l’export afin de préserver le panneau de diagnostic.
- Implémenté au jalon 0.3.7 : une réglette Spectrum permet d’aller directement à une image de contrôle. Après un clic de correction, le tracker relance seulement la portion qui suit cette image et fusionne la nouvelle trajectoire avec le préfixe validé.
- Implémenté au jalon 0.3.8 : l’application utilise la première position réellement trackée comme ancre. Le clip de destination conserve donc sa position d’origine sur la première image, même si le point a été corrigé avant l’application.
- Étapes suivantes : ajouter la zone de recherche, lissage et campagnes de tests 4K/cadences/durées longues avant le port macOS.
