# Test macOS — Apple Silicon

Ce paquet de test fonctionne sur les Mac Apple Silicon (M1, M2, M3 ou M4) avec Premiere Pro 26.2 ou plus récent. Il inclut le moteur OpenCV et toutes ses bibliothèques indirectes : il ne faut pas installer Homebrew, Node, OpenCV ni UXP Developer Tool.

## Installation

1. Fermez Premiere Pro.
2. Double-cliquez le fichier `.ccx` reçu et confirmez l’installation dans Adobe Creative Cloud.
3. Acceptez la demande d’autorisation administrateur, attendue pour un plugin Hybrid contenant du code natif.
4. Rouvrez Premiere, puis ouvrez `Fenêtre > Plugins UXP > Motion Tracker`.

Le paquet de test est volontairement non signé et non notarisé. macOS ou Creative Cloud peut afficher un avertissement de sécurité ou refuser le chargement du moteur natif. Le certificat Apple Developer ID et la notarisation supprimeront cette limitation dans une version ultérieure.

## Désinstallation

Dans Creative Cloud, ouvrez la gestion des plugins, trouvez `Motion Tracker`, puis choisissez `Désinstaller`.

## Limites connues

- Compatible Apple Silicon uniquement pour cette version de test.
- Une installation de test nécessite Premiere Pro et Adobe Creative Cloud déjà installés.
- Le plugin demande un accès complet aux fichiers afin que le moteur OpenCV puisse analyser les médias sélectionnés.
