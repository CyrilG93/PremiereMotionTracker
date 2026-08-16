# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement un prototype technique. Le panneau sait déjà capturer le clip source depuis la timeline, lire la plage In/Out, afficher l’image de séquence au point In et placer un point de tracking. Le module Hybrid Windows charge le cœur C++, exécute un autotest, lit les métadonnées vidéo avec OpenCV et Media Foundation, puis suit le point image par image avec Lucas-Kanade et un contrôle aller-retour. Après analyse, le média source se lit directement dans le panneau sur la plage trackée, avec le point superposé et un curseur temporel pour vérifier la trajectoire avant application. La trajectoire validée peut ensuite être appliquée à un ou plusieurs clips de destination : le plugin ajoute un effet Transform et crée une clé Position par image valide. La correction visuelle des dérives reste un prochain jalon ; les binaires Windows et macOS seront inclus dans le produit final.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere. Après une modification du manifeste ou de l’addon natif, utilisez `Unload`, puis `Load` : `Reload` ne recharge pas ces éléments. Le diagnostic doit alors indiquer `Moteur natif chargé`, sa version et `autotest ok`.

L’aperçu vidéo demande l’accès local aux fichiers afin de lire uniquement le média source déjà sélectionné dans la timeline. Après cette mise à jour du manifeste, retirez puis ajoutez de nouveau le projet dans UXP Developer Tool si Premiere ne renouvelle pas cette autorisation.

Pour tester la capture :

1. Placez les In/Out de la séquence, sélectionnez le clip vidéo dans la timeline puis cliquez sur `Capturer et préparer`.
2. Cliquez dans l’image pour placer le point de tracking, puis sur `Analyser` pour calculer la trajectoire sur la plage visible du clip. La vidéo source est ensuite prête sans export intermédiaire.
3. Cliquez sur `Lire` / `Pause`, utilisez `Début` et le curseur temporel pour vérifier le point superposé avant de modifier le projet.
4. Consultez le nombre d’images incertaines signalé dans le diagnostic.
5. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
6. Cliquez sur `Appliquer la trajectoire` pour ajouter un effet Transform et une clé Position par image valide à chaque clip sélectionné.

Le choix des destinations se fait volontairement après l’analyse : une même trajectoire peut ainsi être appliquée à plusieurs clips. L’amplitude du mouvement est automatiquement compensée selon les dimensions et l’échelle Motion de chaque média cible : un petit logo suit donc le même déplacement visuel qu’un média plein écran. Les Graphics Layers restent compatibles et utilisent directement le canevas de la séquence. L’application modifie le projet Premiere ; dans ce prototype, utilisez Annuler pour retirer les clés et l’effet Transform ajoutés.

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
