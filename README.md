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
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python server/app.py
# ou: npm run server:dev
```

Puis ouvrir (port par défaut **8091**, surcharge possible via `SMOVIE_PORT` dans `.env`) :
- http://127.0.0.1:8091

## Structure (monorepo)
- `apps/smovie-web/`: application Next.js 16 (App Router), lecteur Glass
- `apps/smovie-native/`: réservé futur client natif (placeholder)
- `packages/*`: bibliothèques partagées (`glass-player`, `ui`, `domain`, `types`, etc.)
- `server/`: **backend Flask**
  - `app.py`: point d’entrée WSGI / dev
  - `smovie/`: package Python (routes, catalogue, auth, payload)
  - `web/templates/`, `web/static/`: UI Jinja + assets `/static/`
  - `server/requirements.txt`: dépendances Python (référencées par `requirements.txt` à la racine)
- `data/`: `catalog.json`, `mockMedia.json`, SQLite Smovie, clés générées (à la racine du dépôt)
- `tools/`: scripts TypeScript (import TMDb, audit, génération catalogue) — exécuter depuis la racine (`npm run …`)
- `public/library/...`: images catalogue locales
- `media/`: vidéos de test servies sous `/media/`
- `vendor/slickstream-vision-main/`: prototype React (référence)

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
Le répertoire de travail Gunicorn doit être le dossier **`server/`** (où se trouvent `app.py` et le package `smovie`).

Exemple (adapter les chemins au clone du dépôt sur la machine) :
```ini
[Unit]
Description=streamnest
After=network.target

[Service]
User=shynwo
WorkingDirectory=/home/shynwo/streamnest/server
ExecStart=/home/shynwo/streamnest/.venv/bin/gunicorn -w 2 -b 127.0.0.1:8090 app:app
Restart=always
Environment=SMOVIE_DEBUG=false
Environment=SMOVIE_COOKIE_SECURE=true
Environment=SMOVIE_SECRET_KEY=change-me-long-random-secret

[Install]
WantedBy=multi-user.target
```

Alternative : `ExecStart=.../gunicorn --chdir /chemin/vers/netflix-maison/server ... app:app`.  
Ensuite : reverse proxy Nginx vers le port choisi.

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
