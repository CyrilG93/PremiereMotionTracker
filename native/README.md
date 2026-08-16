# Module natif

Ce dossier contient le futur module C++ chargé par le plugin UXP Hybrid. Le premier bootstrap ne dépend pas encore d’OpenCV : il sert à valider le SDK Adobe et la chaîne de compilation avant d’ajouter le décodage vidéo.

## Dépendances de développement

- SDK Adobe UXP Hybrid Plugin ;
- Visual Studio 2022 avec les outils C++ sous Windows ;
- CMake 3.20 ou plus récent ;
- OpenCV et un backend FFmpeg compatible avec la distribution du produit, au jalon suivant.

Ces outils seront nécessaires uniquement pour construire le plugin. L’utilisateur final recevra les binaires dans le paquet d’installation.

