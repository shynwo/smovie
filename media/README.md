# Médias de test (SMovie)

Place ici des fichiers servis par Flask sous `/media/<nom>`.

Pour le lecteur web (`apps/smovie-web`) en local :

1. Copie une vidéo MP4 sous `smovie-test.mp4` dans ce dossier.
2. Dans `apps/smovie-web/.env`, définis `SMOVIE_PREFER_LOCAL_MEDIA=1` et `SMOVIE_FLASK_ORIGIN` sur la même origine que ton Flask (port du `.env` principal, ex. `http://127.0.0.1:8091`).

Sinon, sans fichier local, le lecteur utilise une vidéo de démonstration (Big Buck Bunny) pour valider l’UI.
