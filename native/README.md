# Module natif

Ce dossier contient le futur module C++ chargé par le plugin UXP Hybrid. Le cœur de tracking est indépendant d’Adobe et d’OpenCV : il suit déjà une zone texturée entre deux images en niveaux de gris avec un score de confiance. Cette séparation permet de le tester automatiquement sous Windows et macOS avant de connecter le décodage vidéo.

## Dépendances de développement

- SDK Adobe UXP Hybrid Plugin ;
- Visual Studio 2022 avec les outils C++ sous Windows ;
- CMake 3.20 ou plus récent ;
- OpenCV et un backend FFmpeg compatible avec la distribution du produit, au jalon suivant.

Ces outils seront nécessaires uniquement pour construire le plugin. L’utilisateur final recevra les binaires dans le paquet d’installation.

Sans le SDK Adobe, CMake construit uniquement le cœur portable et ses tests :

```powershell
cmake -S native -B native/build -DBUILD_TESTING=ON
cmake --build native/build --config Release
ctest --test-dir native/build -C Release --output-on-failure
```
