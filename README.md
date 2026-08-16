# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement un prototype technique. Le panneau sait déjà capturer le clip source depuis la timeline, lire la plage In/Out, afficher l’image de séquence au point In et placer un point de tracking. Le module Hybrid Windows charge le cœur C++, exécute un autotest, lit les métadonnées vidéo avec OpenCV et Media Foundation, puis suit le point image par image avec Lucas-Kanade et un contrôle aller-retour. La correction visuelle des dérives et l’écriture de la vraie trajectoire dans Premiere restent les prochains jalons ; les binaires Windows et macOS seront inclus dans le produit final.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere. Après une modification du manifeste ou de l’addon natif, utilisez `Unload`, puis `Load` : `Reload` ne recharge pas ces éléments. Le diagnostic doit alors indiquer `Moteur natif chargé`, sa version et `autotest ok`.

Pour tester la capture :

1. Sélectionnez un clip vidéo dans la timeline et cliquez sur `Capturer` pour la source.
2. Placez les In/Out de la séquence puis cliquez sur `Lire les In/Out` pour charger l’image du point In.
3. Cliquez dans l’image pour placer le point de tracking, puis sur `Analyser` pour calculer la trajectoire sur la plage visible du clip. Une bannière et le bouton d’analyse indiquent clairement que l’analyse est en cours.
4. Consultez le nombre d’images incertaines signalé dans le diagnostic.
5. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
6. Cliquez sur `Tester Transform sur la sélection` pour ajouter un effet de test avec deux keyframes Position à chaque clip sélectionné.

Le choix des destinations se fait volontairement après l’analyse : une même trajectoire pourra ainsi être appliquée à plusieurs clips. Le test Transform modifie le projet Premiere. Dans ce prototype, utilisez Annuler jusqu’à la disparition des keyframes et de l’effet de test. Le bouton d’analyse reste volontairement désactivé jusqu’à l’intégration du moteur natif.

Le diagnostic peut être copié avec le bouton `Copier`. Si Premiere refuse temporairement l’accès au presse-papiers après une mise à jour du plugin, le texte est automatiquement sélectionné pour permettre `Ctrl+C` ; retirez puis ajoutez à nouveau le plugin dans UXP Developer Tool afin de recharger les permissions du manifest.

## Développement

Les vérifications locales ne nécessitent aucune dépendance npm :

```powershell
npm run verify
```

La construction du moteur natif demande le SDK Adobe UXP Hybrid, Visual Studio avec les outils C++, CMake, vcpkg et OpenCV. Sur Windows, la configuration actuelle utilise Media Foundation pour décoder les médias et lie OpenCV statiquement dans l’addon afin que Premiere puisse le charger sans DLL OpenCV externes. Ces dépendances seront intégrées au produit final : l’utilisateur n’aura pas à installer Python ou OpenCV séparément.

Le plan complet est disponible dans [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Changelog

Aucune version publique n’a encore été publiée.
