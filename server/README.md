# Backend Flask (StreamNest / Smovie)

Point d’entrée : `app.py`. Package Python : `smovie/`. UI Jinja héritée : `web/templates`, `web/static`.

Les données du dépôt (`data/`, `public/`, `media/`, `.env`) sont à la **racine du monorepo** (`REPO_ROOT`), pas sous `server/`.

## Lancer en local

Depuis la racine du dépôt :

```bash
pip install -r requirements.txt
python server/app.py
```

Ou :

```bash
cd server
python app.py
```

## Gunicorn (prod)

Le répertoire de travail doit être **`server/`** (pour que `app:app` et `import smovie` fonctionnent) :

```ini
WorkingDirectory=/chemin/vers/netflix-maison/server
ExecStart=/chemin/vers/.venv/bin/gunicorn -w 2 -b 0.0.0.0:8090 app:app
```

Alternative sans changer de répertoire :

```bash
gunicorn --chdir /chemin/vers/netflix-maison/server -w 2 -b 0.0.0.0:8090 app:app
```
