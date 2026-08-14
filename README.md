# ⚽ Gestor Pro — Fútbol Manager Online

Juego de fútbol manager multijugador, persistente y responsive (PC + móvil, instalable como app).
React + Vite + Tailwind v4 en el frontend, Firebase (Auth / Firestore / Storage / Functions) en el backend,
Netlify para publicar.

> **Todos los jugadores, clubes, ligas y competiciones son ficticios y se generan proceduralmente.**
> No se usa ninguna base de datos de jugadores reales ni contenido con licencia.

---

## Arranque rápido (3 minutos)

```bash
npm install
npm run dev       # abre http://localhost:5173
```

Sin configurar nada, la app arranca en **modo local**: puedes registrarte, crear tu club y
jugar con la FASE 1 completa (los datos se guardan en tu navegador).

## Para jugar online (Firebase)

1. Copia `.env.example` → `.env` y rellena las claves de tu proyecto Firebase.
2. Publica las reglas de `firebase/firestore.rules` y `firebase/storage.rules`.
3. (Opcional pero recomendado) despliega las Cloud Functions y pon `VITE_USE_CLOUD_FUNCTIONS=true`.

Guía detallada paso a paso: **`docs/ARQUITECTURA.md`** (sección 7) o la pantalla
**Ajustes** dentro del propio juego.

## Publicar en Netlify

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Environment variables | las mismas `VITE_FIREBASE_*` del `.env` |

Después añade tu dominio `*.netlify.app` en Firebase → Authentication → Settings → Dominios autorizados.

## Estado del desarrollo

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Auth, creación de club, 22 jugadores, dashboard, plantilla, ficha de jugador | ✅ |
| 2 | Alineación, tácticas, entrenamiento, simulador, calendario y liga | ✅ |
| 3 | Economía, taquilla, obras, patrocinadores y directiva | ✅ |
| 4 | Mercado, negociaciones, cesiones, agentes libres y renovaciones | ✅ |
| 5 | Academia mensual con informes de ojeador | ✅ |
| 6 | Draft bimensual con clases SS-D ocultas y sorteo | ✅ |
| 7 | Cuerpo técnico, contratación y Centro de Formación | ✅ |
| 8 | Selecciones nacionales, candidaturas y votaciones | ✅ |
| 9 | Fama, afición, logros, récords, leyendas y rankings | ✅ |
| 10 | Temporadas, seguridad, integridad, PWA y escalado | ✅ |
| 11 | Copas nacionales, Supercopa y competiciones internacionales | ✅ |
| 12 | Multijugador real: ligas compartidas y traspasos entre managers | ✅ |
| 13 | Perfil de manager, escudos (Storage) y centro de avisos | ✅ |
| 14 | Centro de análisis: scouting, informes de rival y comparador | ✅ |
| 15 | Vestuario: química, conversaciones, arengas y sala de prensa | ✅ |
| 16 | Dirección de partido en vivo: cambios y tácticas en tiempo real | ✅ |

**Proyecto completo: 16 fases. Usa Auth + Firestore + Storage + Cloud Functions.**

Detalle completo en `docs/ARQUITECTURA.md` y en la pantalla **Hoja de ruta** del juego.
