# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement un prototype technique. Le panneau sait déjà capturer le clip source depuis la timeline, lire la plage In/Out, afficher l’image de séquence au point In et placer un point de tracking. Le module Hybrid Windows charge le cœur C++, exécute un autotest, lit les métadonnées vidéo avec OpenCV et Media Foundation, puis suit le point image par image avec Lucas-Kanade et un contrôle aller-retour. Après analyse, des images de séquence temporaires sont mises en cache avec le point superposé afin de vérifier la trajectoire et de naviguer image par image avant application. La trajectoire validée peut ensuite être appliquée à un ou plusieurs clips de destination : le plugin ajoute un effet Transform et crée une clé Position par image valide. La correction visuelle des dérives reste un prochain jalon ; les binaires Windows et macOS seront inclus dans le produit final.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere. Après une modification du manifeste ou de l’addon natif, utilisez `Unload`, puis `Load` : `Reload` ne recharge pas ces éléments. Le diagnostic doit alors indiquer `Native engine loaded`, sa version et `self-test ok`.

L’aperçu est généré dans l’espace temporaire privé du plugin : aucune autorisation supplémentaire de lecture des fichiers utilisateur n’est nécessaire.

Pour tester la capture :

1. Placez les In/Out de la séquence, sélectionnez le clip vidéo dans la timeline puis cliquez sur `Capturer et préparer`.
2. Cliquez dans l’image pour placer le point de tracking, puis sur `Analyze` pour calculer la trajectoire sur la plage visible du clip. Les images de la séquence sont ensuite préparées automatiquement ; cliquez sur `Skip preview` pendant cette étape si vous voulez conserver uniquement l’image In et appliquer directement la trajectoire.
3. Une fois l’aperçu préparé, la lecture conserve toujours l’image précédente jusqu’à ce que la suivante soit prête. Cliquez sur `Play` / `Pause`, utilisez `Start`, `− frame` et `+ frame` pour vérifier le point superposé avant de modifier le projet.
4. Consultez le nombre d’images incertaines signalé dans le diagnostic.
5. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
6. Cliquez sur `Appliquer la trajectoire` pour ajouter un effet Transform et une clé Position par image valide à chaque clip sélectionné.

Le choix des destinations se fait volontairement après l’analyse : une même trajectoire peut ainsi être appliquée à plusieurs clips. L’amplitude du mouvement est automatiquement compensée selon les dimensions et l’échelle Motion de chaque média cible : un petit logo suit donc le même déplacement visuel qu’un média plein écran. Les Graphics Layers restent compatibles et utilisent directement le canevas de la séquence. L’application modifie le projet Premiere ; dans ce prototype, utilisez Annuler pour retirer les clés et l’effet Transform ajoutés.

Le diagnostic peut être copié avec le bouton `Copy` (ou `Copier` en français). Il reste sélectionnable avec `Ctrl+C` et isolé de l’aperçu pendant la lecture. Si Premiere refuse temporairement l’accès au presse-papiers après une mise à jour du plugin, retirez puis ajoutez à nouveau le plugin dans UXP Developer Tool afin de recharger les permissions du manifest.

L’interface est en anglais par défaut. Utilisez le bouton `FR` dans l’en-tête pour basculer les contrôles en français.

## Développement

Les vérifications locales ne nécessitent aucune dépendance npm :

```powershell
npm run verify
```

La construction du moteur natif demande le SDK Adobe UXP Hybrid, Visual Studio avec les outils C++, CMake, vcpkg et OpenCV. Sur Windows, la configuration actuelle utilise Media Foundation pour décoder les médias et lie OpenCV statiquement dans l’addon afin que Premiere puisse le charger sans DLL OpenCV externes. Ces dépendances seront intégrées au produit final : l’utilisateur n’aura pas à installer Python ou OpenCV séparément.

Le plan complet est disponible dans [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Changelog

Aucune version publique n’a encore été publiée.
