# Module natif

Ce dossier contient le futur module C++ chargé par le plugin UXP Hybrid. Le cœur de tracking est indépendant d’Adobe et d’OpenCV : il suit déjà une zone texturée entre deux images en niveaux de gris avec un score de confiance. Cette séparation permet de le tester automatiquement sous Windows et macOS avant de connecter le décodage vidéo.

## Dépendances de développement

- SDK Adobe UXP Hybrid Plugin ;
- Visual Studio 2019 ou plus récent avec les outils C++ sous Windows ;
- CMake 3.20 ou plus récent ;
- OpenCV et un backend FFmpeg compatible avec la distribution du produit, au jalon suivant.

Sur macOS, le paquet de test attend aussi un binaire FFmpeg ARM64 redistribuable sous LGPL et son fichier de licence dans `mac/arm64/bin/`. Il est exécuté uniquement si OpenCV ne peut pas décoder la plage demandée ; il génère alors un cache PNG local avant le tracking. Ne pas utiliser le FFmpeg Homebrew GPL pour une distribution publique.

Ces outils seront nécessaires uniquement pour construire le plugin. L’utilisateur final recevra les binaires dans le paquet d’installation.

Sans le SDK Adobe, CMake construit uniquement le cœur portable et ses tests :

```powershell
cmake -S native -B native/build -DBUILD_TESTING=ON
cmake --build native/build --config Release
ctest --test-dir native/build -C Release --output-on-failure
```

Avec le SDK téléchargé dans `docs/uxp-hybrid-plugin-sdk-main`, vcpkg et OpenCV statique, la commande Windows est :

```powershell
$pmtSdkPath = (Resolve-Path "docs/uxp-hybrid-plugin-sdk-main").Path.Replace("\", "/")
$pmtVcpkgToolchain = "C:/vcpkg/scripts/buildsystems/vcpkg.cmake"
cmake -S native -B native/build-hybrid "-DUXP_HYBRID_SDK_DIR=$pmtSdkPath" "-DCMAKE_TOOLCHAIN_FILE=$pmtVcpkgToolchain" -DVCPKG_TARGET_TRIPLET=x64-windows-static-md -DPMT_ENABLE_OPENCV=ON -DBUILD_TESTING=ON
cmake --build native/build-hybrid --config Release
ctest --test-dir native/build-hybrid -C Release --output-on-failure
```

Le binaire est généré dans `win/x64/premiere-motion-tracker-<version>.uxpaddon`, là où UXP le recherche. Le triplet statique évite d’imposer des DLL OpenCV voisines au chargeur Hybrid de Premiere. Son nom versionné évite qu’un addon encore verrouillé par Premiere bloque la compilation de la version suivante. Les builds macOS utiliseront respectivement `mac/x64` et `mac/arm64` ; ils devront être produits et validés sur macOS avant la distribution.
