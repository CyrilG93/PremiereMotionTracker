# Premiere Motion Tracker

Premiere Motion Tracker est un plugin en cours de développement pour suivre un point dans une vidéo et appliquer son mouvement à un autre clip Adobe Premiere Pro.

La première version visera un flux simple : sélectionner le clip à analyser, poser un point, corriger les éventuelles dérives, puis sélectionner un ou plusieurs clips de destination et créer automatiquement leurs keyframes Position sur un effet Transform.

## État du projet

Le projet est actuellement un prototype technique. Le panneau sait déjà capturer le clip source depuis la timeline, lire la plage In/Out de la séquence, préparer une session et lancer un test d’écriture de keyframes Transform sur les clips sélectionnés au moment de l’application. Le moteur OpenCV sera ajouté dans les prochains jalons.

## Tester le prototype

Prérequis :

- Adobe Premiere Pro 26.2 ou plus récent ;
- UXP Developer Tool 2.2 ou plus récent ;
- mode développeur activé dans les préférences Plugins de Premiere.

Dans UXP Developer Tool, ajoutez le dossier du projet, chargez le plugin, puis ouvrez `Fenêtre > UXP Plugins > Motion Tracker` dans Premiere.

Pour tester la capture :

1. Sélectionnez un clip vidéo dans la timeline et cliquez sur `Capturer` pour la source.
2. Placez les In/Out de la séquence puis cliquez sur `Lire les In/Out`.
3. Sélectionnez ensuite un ou plusieurs clips de destination dans la timeline.
4. Cliquez sur `Tester Transform sur la sélection` pour ajouter un effet de test avec deux keyframes Position à chaque clip sélectionné.

Le choix des destinations se fait volontairement après l’analyse : une même trajectoire pourra ainsi être appliquée à plusieurs clips. Le test Transform modifie le projet Premiere. Dans ce prototype, utilisez Annuler jusqu’à la disparition des keyframes et de l’effet de test. Le bouton d’analyse reste volontairement désactivé jusqu’à l’intégration du moteur natif.

## Développement

Les vérifications locales ne nécessitent aucune dépendance npm :

```powershell
npm run verify
```

La construction du futur moteur natif demandera le SDK Adobe UXP Hybrid, Visual Studio avec les outils C++, CMake, OpenCV et un backend de décodage vidéo. Ces dépendances seront intégrées au produit final : l’utilisateur n’aura pas à installer Python ou OpenCV séparément.

Le plan complet est disponible dans [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Changelog

Aucune version publique n’a encore été publiée.
