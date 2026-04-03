# SMovie Web Architecture

This web app keeps Flask for backend/API/admin and uses Next.js App Router for all user-facing pages.

## Monorepo layout

```text
apps/
  smovie-web/
    app/
      (public)/login
      (platform)/
        page.tsx
        browse/page.tsx
        content/[slug]/page.tsx
        profiles/page.tsx
        search/page.tsx
        settings/page.tsx
      player/[kind]/[slug]/page.tsx
      watch/[kind]/[slug]/page.tsx
    features/
      app-shell/
      auth/
      browse/
      catalog/
      content/
      home/
      player/
      profiles/
      search/
      settings/
      watch/
packages/
  api-client/
  design-tokens/
  domain/
  glass-player/
  types/
  ui/
server/
  app.py
  smovie/        (Flask routes, API, auth, catalogue)
  web/           (legacy Jinja templates + static, admin / fallback)
```

## Responsibilities

- `apps/smovie-web/app`: App Router entrypoints only.
- `apps/smovie-web/features/*/ui`: Screen and component composition.
- `apps/smovie-web/features/*/services`: Server-side business logic and orchestration.
- `apps/smovie-web/features/*/hooks`: Client-side business logic when needed.
- `packages/types`: Shared domain and API types for web and future native app.
- `packages/design-tokens`: Shared visual tokens and CSS variables.
- `packages/api-client`: Typed client for Flask API endpoints.
- `packages/domain`: Shared business helpers (profiles/favorites/progress logic).
- `packages/ui`: Reusable UI primitives and TV-focus utilities.

## Rules

- Do not add new user pages in Flask/Jinja.
- Keep Flask focused on API/auth/admin/backoffice.
- Build new user surfaces in Next.js features.
- Keep TV-first interaction on all navigable surfaces.
- Avoid hover-only interactions and keep visible focus states.

