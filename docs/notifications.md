# Notifications Plex et Seerr

Ce mode optionnel annonce les demandes Seerr et la disponibilité effective dans Plex,
confirmée par Tautulli. Il est désactivé par défaut. Il utilise les modèles français
dans **Settings → Notifications → Notifications Plex et Seerr**, sans emoji par défaut.
Les modèles du mode historique Sonarr/Radarr restent disponibles lorsque ce mode est désactivé.

## Configuration

1. Sauvegarder les configurations actuelles de Tautulli et Seerr avant toute modification.
2. Configurer le bot et le groupe dans Telegram. Le bouton « Send Test Message » publie
   un message réel ; les boutons d’aperçu du mode unifié ne publient rien.
3. Dans Services, renseigner Tautulli (version 2.18 ou supérieure), son URL et sa clé API.
   Ce service fournit les titres, le résumé Plex et les identifiants des séries/films.
4. Renseigner les URL et clés API de Seerr, Radarr et Sonarr pour enrichir l’origine et
   la qualité. Renseigner aussi **Seerr → Public URL** pour que les liens Telegram utilisent l’adresse
   accessible aux utilisateurs, et non le nom Docker. Les autres services sont facultatifs : une panne produit une information inconnue,
   jamais une attribution inventée. Seerr utilise sa clé API administrateur pour
   accéder aux demandes. TMDb est facultatif et fournit le résumé français s’il existe.
5. Configurer les deux webhooks ci-dessous. Leurs URL sont copiables dans les sections
   Seerr et Tautulli. Ne jamais publier ces URL : elles contiennent le secret du webhook.
6. Activer les notifications unifiées, puis vérifier avec les aperçus et un événement
   contrôlé. Le mode unifié suspend l’envoi des imports et le rattrapage Radarr/Sonarr.
7. Après validation, désactiver les notifications Telegram natives des nouvelles demandes
   et disponibilités dans Seerr et des nouveautés dans Tautulli, pour éviter les doublons.
   Les autres notifications, par exemple les erreurs Plex, peuvent rester actives.

Seerr dispose d’un seul agent webhook : si celui-ci sert déjà à une autre intégration,
ne pas remplacer son URL sans prévoir la conservation de cette intégration.
Tautulli peut avoir plusieurs agents distincts.

## Seerr

Si le webhook Seerr est déjà utilisé par une autre intégration, choisir **Source des
demandes Seerr → API toutes les 30 secondes**. Son webhook existant reste inchangé.
L’URL et la clé API Seerr sont alors requises. La première lecture initialise un
repère sans annoncer les demandes historiques. Les nouvelles demandes sont récupérées
avec pagination, conservées en file et dédupliquées par leur ID ; le repère survit aux
redémarrages. Dans ce mode, la configuration du webhook ci-dessous est facultative.

URL : `http://telgrarr:3400/hooks/SECRET/seerr`, méthode POST, corps JSON ci-dessous.
Activer **Request Pending Approval** et **Request Automatically Approved**. Une demande
manuellement approuvée peut également être reçue, sans répéter une demande déjà annoncée.
Ne pas utiliser **Request Available** pour les disponibilités : Tautulli s’en charge.
Les notifications de test Seerr sont ignorées par ce récepteur.

```json
{
  "notification_type": "{{notification_type}}",
  "subject": "{{subject}}",
  "message": "{{message}}",
  "media": {
    "media_type": "{{media_type}}",
    "tmdbId": "{{media_tmdbid}}"
  },
  "request": {
    "request_id": "{{request_id}}",
    "requestedBy_username": "{{requestedBy_username}}"
  },
  "{{extra}}": []
}
```

## Tautulli

Créer un agent **Webhook**, méthode POST, URL `http://telgrarr:3400/hooks/SECRET/tautulli`.
Activer uniquement **Recently Added**. Utiliser ce corps dans son modèle JSON :

```json
{
  "action": "{action}",
  "media_type": "{media_type}",
  "rating_key": "{rating_key}",
  "server_machine_id": "{server_machine_id}",
  "season_num": "{season_num}",
  "episode_num": "{episode_num}",
  "episode_count": "{episode_count}"
}
```

Les titres et résumés sont récupérés par l’API Tautulli : les guillemets et retours à la
ligne ne risquent donc pas de casser le JSON du webhook. Configurer les bibliothèques
Plex en français si le résumé doit rester français même sans TMDb.

Activer le regroupement par saison (parent) et désactiver celui par série
(grand-parent) : les lots d’épisodes donnent un message de saison, les épisodes
isolés un message individuel. Les qualités d’un lot sont agrégées depuis Sonarr.
L’exemplaire Plex sert d’abord à déterminer la résolution et le codec ; Radarr/Sonarr
complètent le type de qualité (par exemple WEBDL). Le lien Plex est construit sans token.
Les exclusions Radarr/Sonarr configurées dans Blacklist sont respectées lorsque
le média est identifié dans ces applications.

## Modèles

Les champs sont éditables dans les paramètres. Les variables sont échappées pour le HTML
Telegram. Utiliser `{{title}}`, jamais `{{{title}}}`. Les conditions
`{{#if overview}}...{{/if}}` permettent de masquer les informations absentes.

Demandes : `kind`, `title`, `year`, `requester`, `seasons`, `seerrUrl`.
Disponibilités : `kind`, `title`, `year`, `episode`, `overview`, `origin`, `quality`,
`plexUrl`, `seerrUrl`.

Le mode classique envoie une affiche avec une légende HTML limitée à 1024
caractères, ou du texte sans affiche si nécessaire. Le mode enrichi permet des
titres, séparateurs et médias dans le même message. Les aperçus utilisent des
données fictives et n’envoient aucun message Telegram.

## Origine et qualité

- Une demande active/terminée trouvée dans Seerr donne « Demande Seerr — utilisateur ».
  Cela signale une demande associée, pas une preuve que cette demande a causé l’ajout.
- Un tag correspondant à une import list Radarr active donne « Liste Radarr probable — nom ».
  Les tags pouvant être modifiés manuellement, l’attribution reste explicitement probable.
- Sinon : « Inconnue ». Aucun ajout n’est arbitrairement qualifié de manuel.
- Une qualité absente donne « Non renseignée ». La source de téléchargement/indexer et
  le nom du fichier ne sont pas publiés. Une panne d’enrichissement est conservée dans
  l’historique, sans secrets.

## Persistance, reprise et limites

`notifications.json`, dans le volume de données, contient les événements en attente et
les clés déjà envoyées. Ce fichier est inclus dans les sauvegardes intégrées, avec des
permissions privées. La déduplication garde au maximum 10 000 clés, pendant 90 jours.
Une demande est identifiée par son ID Seerr, un ajout par serveur Plex + rating key.
Une mise à niveau de qualité sur le même rating key n’est pas une nouvelle disponibilité.
Une suppression suivie d’un ajout avec un nouveau rating key peut produire un message.

Le webhook est confirmé seulement après l’écriture sur disque. Une file pleine ou un
fichier invalide retourne 503, sans effacer de données. Les échecs temporaires sont
réessayés avec un délai croissant. Un rejet Telegram permanent bloque le message ; le
bouton de relance permet de réessayer après correction. Un arrêt propre attend l’envoi
courant avant de terminer.

Telegram n’offre pas de clé d’idempotence pour sendMessage : un arrêt brutal après
l’envoi mais avant son enregistrement, ou une réponse réseau perdue après acceptation,
peut encore produire un doublon. En mode webhook, aucun rattrapage des événements Seerr/Tautulli jamais reçus
n’est implémenté. Le mode API Seerr rattrape les nouvelles demandes depuis son dernier repère. Les notifications natives des autres applications doivent être
explicitement désactivées après validation ; leur envoi direct n’est pas intercepté.

La restauration d’une ancienne sauvegarde rétablit son état d’envoi : certains messages
postérieurs à cette sauvegarde peuvent être renvoyés. Redémarrer après restauration.
En revenant au mode historique, vérifier sa file d’imports précédente avant activation,
car les éléments en attente n’ont pas été supprimés par le mode unifié.

## Tests contrôlés dans Telegram

Un webhook portant `"test": true` et un `"test_id"` distinct produit un message
préfixé `[TEST Telgrarr]`. Il traverse la file et le même enrichissement que les
notifications réelles, mais sa clé de déduplication est séparée : il ne bloque
pas une future annonce du même média. Ces tests publient réellement dans le
groupe configuré. Les aperçus de l’interface continuent à ne rien envoyer.

### Affiche et note IMDb

Les demandes et disponibilités incluent une affiche publique issue de Seerr
(TMDb), avec les images Radarr/Sonarr en secours. Aucun lien Plex contenant un
jeton n’est transmis à Telegram. Sans affiche, le message reste textuel.

La variable `imdbRating` contient une note sur 10 avec une virgule française.
Elle provient uniquement d’un champ explicitement IMDb dans Plex ou Radarr,
ou de l’API `movie/:id/ratingscombined` de Seerr. Une note TMDb ou une note
Sonarr sans source explicite n’est jamais renommée IMDb. Pour les séries, saisons et épisodes, la note est toujours celle de la série
entière. Si Plex ne la fournit pas, l’identifiant IMDb de la série obtenu via
Seerr, Sonarr ou les métadonnées parentes Plex est recherché dans le jeu de
données officiel `title.ratings.tsv.gz` d’IMDb (usage personnel non commercial).
Le fichier est mis en cache dans le dossier de données et actualisé au maximum
une fois par jour. Une panne de téléchargement conserve le dernier cache utilisable.
La ligne est masquée si aucune note IMDb n’est disponible.

Les légendes des affiches sont limitées à 1024 caractères : le résumé est
raccourci si nécessaire. Un modèle personnalisé trop long est envoyé en texte.
Une image explicitement rejetée par Telegram entraîne un envoi textuel ; les
erreurs réseau ambiguës suivent la file de reprise habituelle.

### Saisons et lots d’épisodes

Activer dans Tautulli le regroupement des ajouts par parent (saison), et laisser
le regroupement par grand-parent (série) désactivé. Après le délai configuré dans
Tautulli, plusieurs épisodes arrivés ensemble donnent un message de saison ;
un épisode isolé garde son message individuel.

Le webhook doit transmettre aussi `season_num`, `episode_num` et `episode_count`.
Telgrarr affiche la saison, les numéros et le nombre d’épisodes du lot. Il annonce
« Saison complète » uniquement si ce lot couvre tous les épisodes connus de la
saison dans Sonarr et si tous ont un fichier. Sinon, il indique « Épisodes
disponibles ». Les qualités différentes sont affichées ensemble.

Deux lots distincts d’une même saison ont des clés de déduplication distinctes :
la sortie d’une seconde partie ne sera pas masquée par l’annonce de la première.
La vérification de complétude dépend des métadonnées actuelles de Sonarr.

### Présentation Telegram

Le titre apparaît en premier, en gras, suivi du statut en italique. Des lignes
séparatrices délimitent le résumé et les informations sur l’origine et la
qualité. La qualité utilise une police à chasse fixe. Aucun emoji n’est ajouté.
La taille de police des légendes d’affiches reste celle du client Telegram.

### Messages enrichis et bandes-annonces

Dans Paramètres → Notifications → Notifications Plex et Seerr, sélectionner
« Message enrichi ». Le transport utilise `sendRichMessage` avec du HTML enrichi :
affiche en premier, puis titres `h2`/`h4`, paragraphes, citations, séparateurs `hr` et liens.
Les modèles enrichis sont indépendants des modèles classiques. L’aperçu dans
l’interface est indicatif ; Telegram décide du rendu exact. Le mode classique
reste sélectionnable. Si Telegram répond explicitement que la méthode est
indisponible (404), Telgrarr utilise le modèle classique ; un timeout ne provoque
pas un second envoi classique.

Les bandes-annonces sont des liens YouTube. Les vidéos en anglais, les teasers
et les vidéos explicitement VOST sont exclus. Pour une série, le numéro de saison
doit correspondre. Avec une clé TMDb personnelle configurée, Telgrarr utilise
l’endpoint de vidéos françaises de la saison exacte. Sinon, il examine les vidéos
fournies par Seerr et n’utilise pour une saison que celles qui la nomment.

Sans vidéo française identifiée, le lien indique « Rechercher la bande-annonce VF »
et ouvre une recherche YouTube sur le titre et la saison. Il ne prétend pas être
une bande-annonce vérifiée et ne remplace pas la saison par la bande-annonce
générale de la série. L’identification repose sur les métadonnées, sans analyse audio.
Une demande portant sur plusieurs saisons propose un lien par saison.

Variables supplémentaires : `posterUrl`, `imdbRating`, `trailers` (liste de `url`,
`label`, `season`, `isSearch`). Exemple :

```handlebars
{{#each trailers}}<a href="{{url}}">{{label}}</a>{{/each}}
```

Les notifications Telegram ne contiennent aucun lien vers Seerr, y compris pour
les demandes. `seerrUrl` reste vide pour les anciens modèles personnalisés.
Les liens de navigation sont ceux de Plex et des bandes-annonces YouTube.

### Présentation des saisons

Une saison complète affiche « Saison complète disponible sur Plex », son numéro
et son nombre total d’épisodes. Un lot partiel affiche « Saison partielle disponible
sur Plex », les numéros ajoutés (par exemple « 1 à 3, 5 ») et le nombre total de la saison connu dans Sonarr. Un épisode absent d’un lot discontinu
n’est pas inclus dans une plage continue. Le nombre total reste « Non renseigné »
si Sonarr ne fournit pas la liste. Les variables correspondantes sont `seasonLabel`,
`seasonTotal`, `addedEpisodeCount`, `episodeRangeLabel` et `seasonNotification`.

Les modèles affichent l’utilisateur sous « Demandé par » et les listes sous
« Liste Radarr probable », pour conserver le caractère incertain de cette origine.
La qualité est présentée sur une ligne sans police de code, avec résolution lisible
(4K, Full HD, HD), source, codec et plage dynamique. Les valeurs brutes `origin` et
`quality` restent disponibles pour les modèles personnalisés ; `originLabel`,
`originDetail` et `qualityDisplay` donnent la présentation compacte.
Le mode enrichi utilise un libellé IMDb surligné ; les images distantes Telegram
sont des blocs de média, pas des petites icônes insérables dans le texte.
