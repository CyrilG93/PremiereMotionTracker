# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement au jalon 0.3.1. Le panneau sait capturer le clip source depuis la timeline, lire la plage In/Out et jouer silencieusement le média source dans le panneau pour placer un point de tracking. Le module Hybrid charge le cœur C++, exécute un autotest, lit les métadonnées vidéo avec OpenCV, puis suit le point image par image avec Lucas-Kanade et un contrôle aller-retour. Pendant l’analyse, le moteur publie ses positions par lots et le point superposé évolue sur la vidéo sans remplacer ses images. La trajectoire validée peut être appliquée à un ou plusieurs clips de destination : le plugin ajoute un effet Transform et crée une clé Position par image valide, avec compensation des dimensions, de l’échelle Motion et des Graphics Layers.

La vidéo est lue directement par l’élément vidéo UXP ; le panneau ne réécrit donc plus son image à chaque frame. Les effets et composites de la séquence ne sont pas inclus dans cette première prévisualisation : elle représente le média source réellement analysé. Une prévisualisation de séquence composite reste un jalon séparé.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere. Après une modification du manifeste ou de l’addon natif, utilisez `Unload`, puis `Load` : `Reload` ne recharge pas ces éléments. Le diagnostic doit alors indiquer `Native engine loaded`, sa version et `self-test ok`.

L’aperçu est généré dans l’espace temporaire privé du plugin : aucune autorisation supplémentaire de lecture des fichiers utilisateur n’est nécessaire.

Pour tester la capture :

1. Placez les In/Out de la séquence, sélectionnez le clip vidéo dans la timeline puis cliquez sur `Capturer et préparer`.
2. Utilisez la vidéo muette pour repérer le point à suivre, cliquez dans l’image puis sur `Analyze` pour calculer la trajectoire sur la plage visible du clip.
3. Pendant l’analyse, le point superposé se met à jour avec les résultats déjà calculés. Les contrôles vidéo restent utilisables pour revoir le média source.
4. Consultez le nombre d’images incertaines signalé dans le diagnostic.
5. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
6. Cliquez sur `Appliquer la trajectoire` pour ajouter un effet Transform et une clé Position par image valide à chaque clip sélectionné.

Le lecteur doit ouvrir le fichier média source sélectionné par Premiere ; le manifeste demande donc l’autorisation d’accéder aux fichiers locaux. Cette autorisation est utilisée uniquement pour afficher ce média dans le panneau et ne sert pas à téléverser des fichiers.

Le choix des destinations se fait volontairement après l’analyse : une même trajectoire peut ainsi être appliquée à plusieurs clips. L’amplitude du mouvement est automatiquement compensée selon les dimensions et l’échelle Motion de chaque média cible : un petit logo suit donc le même déplacement visuel qu’un média plein écran. Les Graphics Layers restent compatibles et utilisent directement le canevas de la séquence. L’application modifie le projet Premiere ; dans ce prototype, utilisez Annuler pour retirer les clés et l’effet Transform ajoutés.

Le diagnostic peut être copié avec le bouton `Copy` (ou `Copier` en français). Il reste sélectionnable avec `Ctrl+C` et isolé de l’aperçu pendant la lecture. Si Premiere refuse temporairement l’accès au presse-papiers après une mise à jour du plugin, retirez puis ajoutez à nouveau le plugin dans UXP Developer Tool afin de recharger les permissions du manifest.

L’interface est en anglais par défaut. Utilisez le bouton `FR` dans l’en-tête pour basculer les contrôles en français.

## Prochaines étapes

- Valider le lecteur vidéo et le suivi en direct sur des codecs, résolutions et systèmes macOS/Windows variés.
- Ajouter la correction manuelle des images incertaines et la reprise du tracking après correction.
- Ajouter une zone de recherche, un score de confiance exploitable et des options de lissage.
- Tester les durées longues, 4K, différentes cadences et les remappages temporels refusés.
- Construire et valider les addons macOS Apple Silicon et Intel.

## Développement

Les vérifications locales ne nécessitent aucune dépendance npm :

```powershell
npm run verify
```

La construction du moteur natif demande le SDK Adobe UXP Hybrid, Visual Studio avec les outils C++, CMake, vcpkg et OpenCV. Sur Windows, la configuration actuelle utilise Media Foundation pour décoder les médias et lie OpenCV statiquement dans l’addon afin que Premiere puisse le charger sans DLL OpenCV externes. Ces dépendances seront intégrées au produit final : l’utilisateur n’aura pas à installer Python ou OpenCV séparément.

Le plan complet est disponible dans [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Changelog

Aucune version publique n’a encore été publiée.
