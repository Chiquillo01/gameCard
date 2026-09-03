# Cómo trabajamos en este repo

## Ramas

- `main` siempre debe quedar en un estado funcional (tests en verde).
- Trabaja en una rama por tarea: `feature/nombre-corto` o `fix/nombre-corto`.
- Cuando esté lista, abre un Pull Request a `main` en vez de empujar directo, incluso trabajando en solitario — deja un punto de repaso antes de que algo se integre, y ya queda montado el flujo para cuando se sume alguien más al equipo.

## Antes de abrir un PR

```bash
npm test --workspace=backend
```

El CI (`.github/workflows/backend-tests.yaml`) corre lo mismo automáticamente en cada push y PR a `main`.

## Estructura del repo

- `backend/` — API Express + MongoDB, más el motor de juego en `backend/src/game/`.
- `frontend/` — React + Vite.
- `backend/src/data/seed/` — datos de cartas y efectos ya procesados, listos para `node src/data/seed/seedCardsAndEffects.js`.

## Pipeline de despliegue

`.github/workflows/prod-deploy.yaml.disabled` es el pipeline del equipo anterior (apuntaba a su registro Docker y su servicio Koyeb) — está desactivado porque necesita secretos que este repo no tiene. Reactívalo (quita el `.disabled` del nombre) cuando tengas tu propio destino de despliegue configurado.
