# Tablero: interfaz web

React 18 con TypeScript, compilado con Vite. Los gráficos usan ECharts 5.5.1. La versión está fija porque otra puede cambiar el dibujo de las gráficas.

## Desarrollo

```
npm ci
npm run dev
```

El servidor de desarrollo queda en `http://localhost:5173` y reenvía `/api` a la API, que por defecto responde en `http://localhost:8000` (`python -m tablero.api` desde `backend/`); otra dirección se indica con `TABLERO_API_URL`.

## Verificación

```
npm run verificar
npm test
npm run build
```

`verificar` revisa los tipos, `test` corre las pruebas de `pruebas/` y `build` deja la versión publicable en `dist/`, que la API sirve en la raíz del sitio.
