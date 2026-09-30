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
  "server_machine_id": "{server_machine_id}"
}
```

Les titres et résumés sont récupérés par l’API Tautulli : les guillemets et retours à la
ligne ne risquent donc pas de casser le JSON du webhook. Configurer les bibliothèques
Plex en français si le résumé doit rester français même sans TMDb.

Désactiver le regroupement des nouveautés par série et par saison dans Tautulli pour
recevoir chaque épisode. Les notifications de série ou saison sont acceptées, mais
leur qualité peut varier : Telgrarr ne leur attribue pas la qualité d’un épisode arbitraire.
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

Les messages sont envoyés sous forme de texte (pas de poster) pour conserver un résumé
lisible et éviter la limite de 1024 caractères des légendes. Les aperçus affichent le message
avec des données fictives et sans accès aux services.

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
