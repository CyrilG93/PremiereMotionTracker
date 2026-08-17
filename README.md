# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement au jalon 0.3.9. Le panneau sait capturer le clip source depuis la timeline, lire la plage In/Out et afficher une image fixe fiable pour placer un point de tracking. Avant l’analyse, réglez la zone de recherche du tracker et le seuil qui signale une confiance faible. Après l’analyse, Premiere exporte une suite bornée d’images de la séquence ; le panneau les relit pour montrer le point de tracking en mouvement, les passages incertains et un accès direct à la prochaine image à vérifier. Une réglette permet d’aller directement à une image : un clic dans l’aperçu corrige le point, puis le plugin recalcule seulement la suite de la trajectoire depuis cette image. Lors de l’application, le clip cible reste à sa position d’origine sur la première image, y compris après une correction. Le lissage léger est activé par défaut et peut être désactivé pour appliquer les mesures brutes. Le module Hybrid charge le cœur C++, exécute un autotest, lit les métadonnées vidéo avec OpenCV, puis suit le point image par image avec Lucas-Kanade et un contrôle aller-retour. Pendant l’analyse, le moteur publie ses positions par lots. La trajectoire validée peut être appliquée à un ou plusieurs clips de destination : le plugin ajoute un effet Transform et crée une clé Position par image valide, avec compensation des dimensions, de l’échelle Motion et des Graphics Layers.

La prévisualisation animée reste fondée sur des images PNG rendues par Premiere, pas sur le lecteur vidéo UXP. Pendant la préparation, seul le bandeau d’avancement est actualisé afin que le diagnostic reste visible. Le tracking continue d’analyser le média source d’origine.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere. Après une modification du manifeste ou de l’addon natif, utilisez `Unload`, puis `Load` : `Reload` ne recharge pas ces éléments. Le diagnostic doit alors indiquer `Native engine loaded`, sa version et `self-test ok`.

L’aperçu est généré dans l’espace temporaire privé du plugin : aucune autorisation supplémentaire de lecture des fichiers utilisateur n’est nécessaire.

Pour tester la capture :

1. Placez les In/Out de la séquence, sélectionnez le clip vidéo dans la timeline puis cliquez sur `Capturer et préparer`.
2. Cliquez dans l’image fixe pour poser le point, puis sur `Analyze` pour calculer la trajectoire sur la plage visible du clip.
3. Après l’analyse, attendez l’export des images de prévisualisation. Utilisez `Play`, `Start` ou la réglette pour revoir le point ; `Skip preview` conserve le tracking sans attendre tous les exports.
4. Pour corriger un décalage, placez la réglette sur l’image concernée, cliquez le bon emplacement du point, puis choisissez `Relancer depuis cette image`. Les images antérieures restent conservées et seule la suite est recalculée.
5. Les marqueurs jaunes et `Suivante incertaine` donnent accès aux passages sous le seuil de confiance. Réduisez le seuil pour signaler moins d’images, ou augmentez la zone de recherche si le mouvement est plus rapide.
6. Conservez `Lissage léger à l’application` pour atténuer les petites vibrations ; désactivez-le si vous voulez appliquer la trajectoire brute.
7. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
8. Cliquez sur `Appliquer la trajectoire` pour ajouter un effet Transform et une clé Position par image valide à chaque clip sélectionné.

Le manifeste demande l’autorisation d’accéder aux fichiers locaux afin que le moteur natif puisse analyser le média sélectionné et que Premiere puisse déposer les aperçus temporaires. Cette autorisation ne sert pas à téléverser des fichiers.

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
