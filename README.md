# StreamNest (Netflix maison)

Projet parallele pour un serveur media personnel sur Raspberry Pi.

## Stack
- Python 3
- Flask
- Front moderne (HTML/CSS/JS)
- Catalogue local JSON (`data/catalog.json`)

## Lancer en local
```bash
cd netflix-maison
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Puis ouvrir:
- http://localhost:8090

## Structure
- `app.py`: app Flask
- `templates/index.html`: page d'accueil style plateforme streaming
- `static/css/styles.css`: UI moderne et responsive
- `static/js/app.js`: rendu dynamique des ranges
- `data/catalog.json`: donnees front (`hero + rows`) generees automatiquement
- `data/mockMedia.json`: dataset principal (films/series/documentaires)
- `scripts/types/media.ts`: types TypeScript
- `scripts/tmdb-import.ts`: import TMDb + enrichissement Fanart.tv + download images locales
- `scripts/clients/fanart.ts`: client Fanart.tv minimal (backdrop/logo)
- `public/library/...`: posters/backdrops/saisons/episodes locaux

## Import TMDb (TypeScript)
Prerequis: Node.js 18+

```bash
cd netflix-maison
npm install
cp .env.example .env
# renseigner TMDB_BEARER_TOKEN et FANART_API_KEY dans .env
npm run tmdb:import
```

Le script:
- purifie les anciens assets importes puis reconstruit `public/library/...`
- importe un catalogue de demo large et realiste (films, series, anime, documentaires, sagas)
- garde TMDb comme source metadata principale
- enrichit visuellement via Fanart.tv:
  - `heroBackground`: Fanart background propre si dispo, sinon TMDb backdrop
  - `cardImage`: Fanart thumb/banner lisible si dispo, sinon fallback stable
  - `logo` transparent: Fanart clearlogo/hdclearlogo si dispo, sinon `null`
  - `poster`: TMDb
  - `season poster`: TMDb
  - `episode still`: TMDb
- genere `data/mockMedia.json`
- le backend synchronise ensuite `data/catalog.json` automatiquement.

## Routes utiles
- `/` Home
- `/film/<slug>` detail film/documentaire
- `/serie/<slug>` detail serie
- `/watch/film/<slug>` page watch mock film
- `/watch/serie/<slug>?season=1&episode=1` page watch mock episode
- `/watch/documentaire/<slug>` page watch mock documentaire
- `/library/...` service des images locales importees

## Adapter a ton serveur films
Dans un second temps, remplace `data/catalog.json` par:
- lecture d'une base SQLite/PostgreSQL, ou
- lecture d'un dossier de films + metadata, ou
- API de ton serveur media maison.

## Deploiement Raspberry (systemd)
Exemple de service:
```ini
[Unit]
Description=streamnest
After=network.target

[Service]
User=shynwo
WorkingDirectory=/home/shynwo/streamnest
ExecStart=/home/shynwo/streamnest/.venv/bin/gunicorn -w 2 -b 127.0.0.1:8090 app:app
Restart=always
Environment=SMOVIE_DEBUG=false
Environment=SMOVIE_COOKIE_SECURE=true
Environment=SMOVIE_SECRET_KEY=change-me-long-random-secret

[Install]
WantedBy=multi-user.target
```

Ensuite: reverse proxy Nginx sur ton domaine local.

## Securite et stabilite (V1)
- Validation stricte du `catalog.json` cote backend (types, tailles, images autorisees).
- Cache memoire intelligent du catalogue (reload automatique quand le fichier change).
- Rate limiting sur `/api/catalog` (anti-spam API).
- Headers HTTP de securite automatiques:
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- Debug desactive par defaut (`SMOVIE_DEBUG=false`).
- Endpoint sante: `GET /healthz`
