# Gestor Pro · Arquitectura del juego de fútbol manager online

Documento de referencia (FASE 1 implementada). Léelo entero antes de tocar Firebase.

---

## 1. Estructura de carpetas

```
raíz/
├─ index.html                 # HTML base + metadatos PWA
├─ netlify.toml               # Config de despliegue en Netlify
├─ firebase.json              # Config del CLI de Firebase (reglas, functions, emuladores)
├─ .env.example               # Plantilla de variables de entorno (copiar a .env)
├─ public/
│  ├─ manifest.webmanifest    # Manifiesto PWA
│  ├─ sw.js                   # Service worker (cache del shell)
│  └─ icon-512.png            # Icono de la app
├─ firebase/
│  ├─ firestore.rules         # Reglas de seguridad de Firestore
│  ├─ storage.rules           # Reglas de seguridad de Storage
│  ├─ firestore.indexes.json  # Índices compuestos (optimización de costes)
│  └─ cloud-functions/        # Backend (Node 20)
│     ├─ index.js             # createClub, dailyTick, weeklyFinances, colas...
│     ├─ gameEngine.js        # Motor de generación del SERVIDOR
│     └─ package.json
├─ docs/
│  └─ ARQUITECTURA.md         # Este documento
└─ src/
   ├─ main.tsx                # Bootstrap React + registro del service worker
   ├─ App.tsx                 # Proveedor de estado + enrutado
   ├─ index.css               # Tema (Tailwind v4)
   ├─ types.ts                # Modelo de datos TypeScript (contrato con Firestore)
   ├─ lib/
   │  ├─ firebase.ts          # Inicialización de Firebase (Auth/Firestore/Storage/Functions)
   │  └─ router.tsx           # Router hash minimalista
   ├─ services/
   │  └─ backend.ts           # API única: implementación Firebase + implementación local
   ├─ state/
   │  └─ GameContext.tsx      # Estado global (sesión, club, plantilla, staff, noticias)
   ├─ game/                   # MOTOR DE JUEGO (puro, sin UI)
   │  ├─ config.ts            # Constantes económicas y de generación
   │  ├─ rng.ts               # Aleatoriedad determinista con semilla
   │  ├─ time.ts              # Reloj del mundo (el juego avanza en tiempo real)
   │  ├─ format.ts            # Formato de moneda/colores
   │  ├─ players.ts           # Generación y valoración de jugadores
   │  ├─ club.ts              # Creación de club, instalaciones, staff, finanzas
   │  └─ data/
   │     ├─ countries.ts      # Países, ligas y bancos de nombres ficticios
   │     └─ traits.ts         # Posiciones, pesos, personalidades, estilos, instalaciones
   ├─ components/
   │  ├─ ui.tsx               # Card, Button, Input, Bar, Rating, RadarChart, Modal...
   │  └─ Layout.tsx           # Sidebar (PC) + menú inferior (móvil) + topbar
   └─ pages/
      ├─ AuthPage.tsx         ├─ SquadPage.tsx     ├─ NewsPage.tsx
      ├─ CreateClubPage.tsx   ├─ PlayerPage.tsx    ├─ RankingsPage.tsx
      ├─ DashboardPage.tsx    ├─ ClubPage.tsx      ├─ RoadmapPage.tsx
      └─ SettingsPage.tsx
```

**Regla de oro:** `src/game/` no importa React ni Firebase. Así el mismo motor puede
ejecutarse en el navegador (previsualización) y en Cloud Functions (fuente de verdad).

---

## 2. Modelo de Firestore

| Colección | Doc ID | Contenido | Quién escribe |
|---|---|---|---|
| `users` | `uid` | managerName, clubId, nivel, XP, reputación, logros | usuario (campos cosméticos) + servidor |
| `clubs` | auto | identidad, estadio, instalaciones, finanzas, afición, táctica, directiva, récord | servidor (excepto `tactics`/`training`) |
| `clubs/{id}/news` | auto | noticias del club | servidor (usuario solo marca `read`) |
| `clubs/{id}/matches` | auto | resumen de partidos del club | servidor |
| `players` | auto | ficha completa (atributos, contrato, stats, historial) | servidor |
| `staff` | auto | cuerpo técnico (con `clubId`) | servidor |
| `leagues` | `ESP_D1` | divisiones, equipos, clasificación | servidor |
| `competitions` | auto | copas, supercopas, torneos internacionales | servidor |
| `matches` | auto | partidos globales con eventos | servidor |
| `seasons` | `2026-27` | calendario, campeones, ascensos/descensos | servidor |
| `transfers` / `loans` | auto | traspasos y cesiones | servidor |
| `drafts` | `2026-08` | clase del draft, orden, elecciones | servidor |
| `academies` | `clubId` | candidatos mensuales de cantera | servidor |
| `nationalTeams` | `ESP_U17` | seleccionador, convocatoria, ranking | servidor |
| `votes` | `uid_electionId` | voto de manager (1 por elección) | usuario (crear) |
| `finances` | `clubId` | resumen económico + subcolección `ledger` | servidor |
| `notifications/{uid}/items` | auto | avisos personales | servidor |
| `rankings` | `clubs`, `managers`, `players` | documentos agregados (1 lectura = ranking completo) | servidor |
| `achievements` | `uid` | logros y récords | servidor |
| `commands` | auto | **cola de intenciones** del usuario (pujar, mejorar, elegir draft, votar) | usuario (crear) → servidor ejecuta |

**Optimización de costes**
- Los rankings y clasificaciones son **documentos agregados**, no consultas masivas.
- La plantilla se lee con `where("clubId","==",id)` (22 documentos) y se ordena en cliente.
- El estado global cachea en memoria: al navegar entre pantallas no se relee nada.
- El reloj del mundo es **calculado**, no almacenado: 0 lecturas/escrituras.

---

## 3. Dependencias

Producción: `react`, `react-dom`, `firebase`, `lucide-react` (iconos), `clsx` + `tailwind-merge`.
Desarrollo: `vite`, `@vitejs/plugin-react`, `tailwindcss` v4, `typescript`.
Backend: `firebase-admin`, `firebase-functions` v2.
Gráficos: SVG propio (radar y barras) para no cargar librerías pesadas en móvil.

---

## 4. Arquitectura de Firebase

```
Navegador (React/Vite en Netlify)
   │  Auth (email+contraseña)
   │  Lecturas Firestore (club, plantilla, noticias, rankings)
   │  Escrituras MUY limitadas (táctica, entrenamiento, marcar leído)
   │  Órdenes -> colección `commands`
   ▼
Cloud Functions (europe-west1, Admin SDK)
   ├─ callable  createClub            → genera club + 22 jugadores
   ├─ trigger   onCommand             → valida y ejecuta órdenes (fichajes, obras, draft)
   ├─ cron      dailyTick (8 h)       → entrenamiento, forma, fatiga, lesiones
   ├─ cron      weeklyFinances (56 h) → ingresos, salarios, mantenimiento
   ├─ cron      monthlyAcademy        → 5 canteranos por club
   └─ cron      bimonthlyDraft        → clase del draft + sorteo
   ▼
Firestore (fuente de verdad) + Storage (escudos/avatares)
```

**Reloj del mundo:** 1 día real = 3 días de juego, calculado con la fórmula
`gameDate = epochJuego + (ahora − epochReal) × 3`. Cliente y servidor obtienen
siempre el mismo valor, y el mundo avanza aunque nadie esté conectado.

---

## 5. Cloud Functions necesarias

| Función | Tipo | Fase | Qué hace |
|---|---|---|---|
| `createClub` | callable | 1 | Crea club + plantilla; impide dos clubes por usuario |
| `dailyTick` | cron 8 h | 1-2 | Entrenamiento, progresión, forma, moral, fatiga, lesiones |
| `weeklyFinances` | cron 56 h | 3 | Ingresos, salarios, mantenimiento, patrocinios |
| `simulateMatchday` | cron | 2 | Simula jornadas y actualiza clasificación y estadísticas |
| `onCommand` | trigger | 3-8 | Ejecuta órdenes: obras, fichajes, cesiones, academia, draft, votos |
| `monthlyAcademy` | cron | 5 | Genera 5 canteranos según nivel de academia |
| `bimonthlyDraft` | cron | 6 | Crea clase de draft (15-16 años), clases ocultas y sorteo |
| `closeDraft` | cron | 6 | Asigna jugadores y **revela** atributos reales |
| `nationalTeamElection` | cron | 8 | Cierra votaciones y nombra seleccionadores |
| `seasonRollover` | cron | 2-9 | Cierra temporada: ascensos, descensos, premios, envejecer/retirar |
| `rebuildRankings` | cron | 9 | Recalcula documentos agregados de rankings |

---

## 6. Reglas de seguridad (resumen)

Están en `firebase/firestore.rules` y `firebase/storage.rules`. Principios:

1. Todo requiere sesión iniciada.
2. El usuario **nunca** puede escribir: dinero, atributos, valor, estadísticas, resultados,
   traspasos, draft, votos contados ni premios.
3. `clubs`: el dueño solo modifica `tactics`, `training`, `colors` y `updatedAt`.
4. `players`: el dueño solo modifica `trainingFocus` y `squadRole`.
5. Creación de club permitida una sola vez y con saldos de la lista blanca
   (4M / 12M / 30M) → imposible inventarse dinero desde el navegador.
6. `commands`: el usuario crea la intención; solo el servidor la marca como ejecutada.
7. `votes`: ID obligatorio `uid_electionId` → un voto por usuario y elección.
8. Todo lo no declarado está **bloqueado** (`allow read, write: if false`).

Anti-exploits añadidos: IDs de jugador con semilla (`clubId_pNN_xxxx`), campo `origin`
para trazar de dónde salió cada jugador, y validación de `stats.apps == 0` al crear.

---

## 7. Pasos para configurar Firebase

1. `console.firebase.google.com` → **Crear proyecto** (ej. `futbol-manager`).
2. **Authentication** → Empezar → *Sign-in method* → activar **Correo/contraseña**.
3. **Firestore Database** → Crear base de datos → modo producción → región `europe-west`.
4. **Storage** → Empezar.
5. **Configuración del proyecto** → *Tus apps* → icono web `</>` → registrar app → copiar `firebaseConfig`.
6. En la raíz del proyecto: copiar `.env.example` a `.env` y pegar los valores.
7. Firestore → pestaña **Reglas** → pegar `firebase/firestore.rules` → *Publicar*.
   Storage → **Reglas** → pegar `firebase/storage.rules` → *Publicar*.
8. (Recomendado) Cloud Functions:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # elige tu proyecto
   cd firebase/cloud-functions && npm install && cd ../..
   firebase deploy --only functions,firestore:rules,firestore:indexes,storage
   ```
   Después pon `VITE_USE_CLOUD_FUNCTIONS=true` en `.env` y en Netlify.
9. Netlify: *Add new site* → GitHub → build `npm run build`, publish `dist`,
   y añade las variables `VITE_FIREBASE_*`.
10. Firebase → Authentication → *Settings* → **Dominios autorizados** → añade
    `tu-sitio.netlify.app`.

> Mientras no configures nada, la app funciona en **modo local** (datos en el navegador)
> para que puedas probar el juego completo de la FASE 1.

---

## 8. Plan de la FASE 1 (implementada)

- [x] Capa de datos con doble backend (Firebase / local) e interfaz única.
- [x] Registro, login y perfil de manager.
- [x] Creación de club: nombre, colores, país/liga, presupuesto configurable.
- [x] Generación procedural de 22 jugadores (17-26 años) con 30 atributos,
      potencial por clases SS-D, personalidad, estilo, forma, moral, contrato e historial.
- [x] Estadio, 7 instalaciones, 11 miembros del cuerpo técnico, finanzas, afición y directiva.
- [x] Dashboard con KPIs, destacados, promesas, instalaciones, noticias y ranking.
- [x] Plantilla con filtros/orden (tabla en PC, tarjetas en móvil).
- [x] Ficha de jugador con radar, atributos, contrato, popularidad, historial y
      entrenamiento individual persistente.
- [x] Noticias, rankings, hoja de ruta y pantalla de ajustes/conexión.
- [x] PWA instalable + diseño responsive (sidebar en PC, menú inferior en móvil).
- [x] Reglas de Firestore/Storage e índices listos para producción.
- [x] Cloud Functions base: `createClub`, `dailyTick`, `weeklyFinances`, cola de comandos.

---

## 9. FASE 2 (implementada) — Alineación, tácticas, entrenamiento y partidos

### Archivos nuevos
```
src/game/match.ts        # Simulador de partidos (motor puro, portable a Functions)
src/game/league.ts       # Liga: rivales IA, calendario, clasificación, estadísticas
src/pages/LineupPage.tsx # Campo interactivo + instrucciones tácticas
src/pages/TrainingPage.tsx
src/pages/LeaguePage.tsx # Clasificación, calendario, resultados, goleadores
src/pages/MatchPage.tsx  # Partido en directo minuto a minuto + informe
```

### Cómo funciona el simulador
Determinista por semilla (`league:fixture:season`) y basado en:
atributos por línea, formación, mentalidad, ritmo, presión, química del once
(nacionalidad/personalidad/estilo), forma, moral, fatiga, personalidades
(rendimiento en partidos grandes), nivel del entrenador, localía y calidad del rival.

Produce por minuto: ocasiones, remates a puerta, paradas, goles con asistencia,
faltas, tarjetas (amarilla, doble amarilla y roja directa), cambios automáticos,
lesiones y estadísticas completas (posesión, xG, córners) + notas de 3 a 10 y MVP.

### Competición
Liga de 12 equipos (11 rivales IA generados proceduralmente) con calendario de
ida y vuelta (22 jornadas). Una jornada se desbloquea cada **2 días de juego**
(≈16 h reales): el calendario avanza aunque no entres. Al jugar tu partido, el
resto de la jornada se resuelve con simulación rápida y se actualiza la tabla.
También puedes disputar **amistosos** en cualquier momento (no puntúan).

### Modelo de datos añadido
`leagues/{clubId}` — **un solo documento** con: `clubs[]`, `fixtures[]`, `table`,
`playerStats` y `conditions` (forma/moral/físico/lesiones). Una lectura devuelve
toda la competición → coste mínimo. Los informes de partido se guardan en
`clubs/{clubId}/matches/{matchId}`.

> **Diseño de seguridad:** el documento de liga contiene solo datos deportivos
> (nunca dinero ni atributos base). Las fichas canónicas de `players` siguen
> siendo de solo lectura para el usuario. Cuando despliegues Cloud Functions,
> cambia la regla de `leagues` a `allow write: if false;` y activa la función
> callable `playMatch`, que ya está esbozada en `firebase/cloud-functions/index.js`.

---

## 10. FASE 3 (implementada) — Economía, instalaciones y directiva

### Archivos nuevos
```
src/game/economy.ts        # Motor económico puro (portable a Cloud Functions)
src/pages/FinancePage.tsx  # Economía, entradas, patrocinios y consejo
```

### Liquidación semanal con "catch-up" offline
`processEconomy()` se ejecuta al abrir la app: calcula cuántas **semanas de juego**
han pasado desde `finances.lastProcessedAt`, cobra ingresos, paga gastos, hace
crecer (o menguar) la masa social y **termina las obras vencidas**. Es idempotente
y está topado a 26 semanas por ejecución. La misma lógica corre en el cron
`weeklyFinances` de Cloud Functions, así que el club vive aunque nunca entres.

| Ingresos | Gastos |
|---|---|
| Patrocinador principal | Salarios de jugadores |
| Tiendas (× nivel de tiendas × fidelidad) | Cuerpo técnico |
| Abonos y socios (aforo × fidelidad) | Mantenimiento del estadio |
| TV y premios (reputación × división) | Mantenimiento de instalaciones |
| **Taquilla** (por partido en casa) | Academia y gastos generales |

### Taquilla realista
`matchdayIncome()` calcula la **asistencia** a partir del precio frente al
"precio justo" percibido (reputación + división), la satisfacción, la fidelidad
y el atractivo del rival. Se reparte entre general / premium / VIP y suma
hostelería y merchandising. Se cobra automáticamente al jugar en casa y aparece
en el libro de cuentas y en la crónica del partido.

### Obras
Cada instalación tiene coste exponencial (×1,52 por nivel), duración
(`10 + nivel×6` días de juego) y mantenimiento semanal. Al iniciar una obra se
descuenta el dinero y se fija `finishesAt`; la instalación se activa sola cuando
llega la fecha, aunque estés desconectado. Subir **Gradas** amplía el aforo
en +2.600 plazas y recalcula el reparto de asientos.

### Directiva y patrocinios
`boardReport()` compara tu posición con el objetivo, la salud financiera y la
satisfacción de la afición para emitir un veredicto y permitir (o no) pedir una
**ampliación de presupuesto** (cuesta 6 puntos de confianza). Cada resultado
mueve satisfacción, fidelidad, confianza y reputación vía `applyResultEffects()`.
`sponsorOffers()` genera 3 ofertas (corta/media/larga) escaladas por reputación,
masa social y clasificación, con prima de firma inmediata.

### Seguridad
Las reglas de `clubs` ahora permiten al dueño escribir solo el bloque de gestión
(`finances`, `facilities`, `stadium`, `fanbase`, `board`, `reputation`, `record`)
con **topes anti-exploit**: saldo máximo, `wageBudget` inmutable, reputación
+3 como máximo por escritura y aforo +3.000 como máximo. Con Cloud Functions
desplegadas basta poner `allow update: if false;` y usar las callables.

---

## 11. FASE 4 (implementada) — Mercado de fichajes

### Archivos nuevos
```
src/game/market.ts        # Motor de mercado (puro, portable a Cloud Functions)
src/pages/MarketPage.tsx  # Buscar · Ofertas · Mi plantilla · Historial
```

### Escaparate procedural
`generateListings()` crea 26 fichas por **periodo de mercado** (3 días de juego).
La semilla es `market:{periodo}:{país}`, así que **cliente y servidor generan
exactamente la misma lista** → imposible inventarse jugadores. La calidad
disponible orbita la reputación de tu club (con sorpresas ocasionales). Tipos:
traspaso (62%), cesión (20%) y agente libre (18%).

### Negociación con IA
`submitBid()` evalúa cada puja en dos capas independientes:

1. **El club vendedor** — compara tu oferta con lo pedido. Si te acercas, acepta;
   si no, emite una **contraoferta** que se suaviza ronda a ronda; tras 4 rondas
   o con ofertas ridículas (<55%), rompe las negociaciones.
2. **El jugador** — pondera salario ofrecido vs. exigido, interés en tu proyecto,
   diferencia de reputación, duración del contrato y su personalidad
   (*Ambicioso* pide más, *Leal* es más difícil de mover).

Solo cuando ambos dicen sí se habilita **Cerrar fichaje**, que valida saldo y
tamaño de plantilla, descuenta el dinero, escribe en el libro de cuentas y añade
el traspaso al historial del jugador.

### Ventas, cesiones y renovaciones
Listas a tus jugadores con precio (hay precio sugerido) y la IA genera **ofertas
entrantes** con probabilidad proporcional a lo razonable que sea tu precio. Las
cesiones incluyen **reparto de salario** (40-90%). Vender a un ídolo de la grada
baja la satisfacción. `renewalDemand()` calcula lo que pide el agente según
potencial restante, edad y personalidad.

### Reglas del mercado
- Plantilla: mínimo **16**, máximo **30** jugadores.
- El presupuesto de fichajes y la caja se descuentan de verdad.
- El 70% de cada venta se reinvierte en el presupuesto de fichajes.

### Búsqueda avanzada (8 criterios + extras)
Posición · Edad (rango) · Nacionalidad · Precio máximo · Nivel mínimo ·
Potencial mínimo · Estilo de juego · Personalidad, más tipo de operación,
texto libre y 5 ordenaciones.

### Modelo de datos y seguridad
`transfers/{clubId}` — **un solo documento** con escaparate, listados, ofertas,
negociaciones e historial. Las reglas de `players` se ampliaron para permitir
altas por fichaje (siempre con `stats.apps == 0`) y cambios de contrato, pero
siguen bloqueando atributos, nivel, potencial, valor y estadísticas. Al vender,
el jugador **no se borra**: se desvincula (`clubId: null`) para conservar su
historial. En Cloud Functions está el comando `transferBid` con verificación
**anti-duplicación** por `seed` dentro de una transacción.

---

## 12. FASES 5 y 6 (implementadas) — Academia y Draft

### Archivos nuevos
```
src/game/youth.ts          # Motor de cantera: academia + draft (puro)
src/pages/AcademyPage.tsx  # Promoción mensual con informes de ojeador
src/pages/DraftPage.tsx    # Draft bimensual con clases ocultas
```

### FASE 5 · Academia
- **5 canteranos cada 30 días de juego** (≈10 días reales), de 15 a 18 años.
- El usuario elige **país** y **posición prioritaria**; ~3 de cada 5 salen en la
  posición pedida. Cambiar las preferencias regenera la promoción del mes.
- La calidad y, sobre todo, el **potencial** escalan con el nivel de la academia
  (`potentialBoost = nivel × 1,9 + ruido`).
- **Informe del ojeador**: nunca ves el valor exacto, solo *rangos* de nivel y
  techo, con una **fiabilidad** que depende de la academia y del Centro de
  análisis. Un club con analytics N1 puede errar ±26 puntos de potencial.
- Máximo **2 promociones al primer equipo por promoción mensual**, con una prima
  de firma del 5% del valor y ficha muy baja.

### FASE 6 · Draft
- Cada **60 días de juego**, clase de **24 promesas de 15-16 años**, todas del
  **país de la liga** del club.
- **Todo está oculto** durante el draft: nivel, potencial y clase. Solo hay una
  pista narrativa y una **calificación del ojeador** (Sin catalogar →
  Máxima prioridad), más precisa cuanto mejor sea el Centro de análisis.
- **Sorteo del orden** entre 12 clubes. Tu posición importa: los clubes con
  turno anterior pueden **arrebatarte** un candidato al cerrar.
- Cada usuario selecciona **2 candidatos**. Al pulsar *Cerrar draft*, la IA elige
  por orden, se resuelven los conflictos y **se revelan todos los datos reales**.

| Clase | Probabilidad | Potencial | Descripción |
|---|---|---|---|
| **SS** | 0,4% | 93-99 | Potencial de leyenda, extremadamente raro |
| **S** | 2,6% | 87-93 | Clase mundial |
| **A** | 9% | 80-87 | Excelente |
| **B** | 21% | 72-80 | Bueno |
| **C** | 37% | 63-72 | Normal |
| **D** | 30% | 45-63 | Bajo |

### Seguridad anti-exploit
Ambos sistemas son **deterministas por semilla** (`academy:{club}:{periodo}` y
`draft:{país}:{periodo}`), así que el servidor puede regenerar la misma lista y
verificarla — es imposible inyectar un SS falso. Las reglas de Firestore además
impiden que `periodIndex` **retroceda** (no se puede re-rollear un draft pasado
buscando un SS), limitan a 2 las selecciones y las promociones, y prohíben
reabrir un draft ya cerrado. Los crons `monthlyAcademy` y `bimonthlyDraft`
avanzan el periodo y publican la noticia aunque no entres al juego.

---

## 13. FASE 7 (implementada) — Cuerpo técnico y formación

### Archivos nuevos
```
src/game/staff.ts        # Mercado de técnicos, cursos y efectos agregados
src/pages/StaffPage.tsx  # Mi cuerpo técnico · Contratar · Formación
```

### Mercado de técnicos
10 candidatos nuevos cada **6 días de juego**, semilla `staffmarket:{club}:{periodo}`.
El nivel disponible depende de la **reputación del club** y del nivel del
**Centro de Formación de Directores**. Cada candidato tiene cargo, nivel,
potencial, experiencia, especialidades, personalidad, ficha semanal, prima de
contratación e **interés en tu proyecto** (por debajo del 25% te rechaza).

11 cargos: entrenador principal, segundo, entrenador de porteros, preparador
físico, preparador ofensivo, preparador defensivo, analista, médico,
fisioterapeuta, director deportivo y ojeador. Máximo 14 miembros, mínimo 3.
Despedir cuesta **medio año de ficha** de indemnización.

### Centro de Formación de Directores
Tres cursos (**básico +2**, **avanzado +4**, **élite +7** niveles). Cada nivel
del centro mejora la ganancia (+16%), abarata el coste (−5%) y acorta la
duración (−4,5%). Máximo 2 cursos simultáneos; **avanzan aunque estés
desconectado** y al volver el técnico ya ha subido (con noticia incluida).
Un técnico nunca supera su potencial.

### Efectos reales del staff (`computeStaffEffects`)
| Efecto | Depende de |
|---|---|
| Progresión de jugadores | Entrenador, prep. ofensivo/defensivo, prep. físico |
| Reducción de lesiones | Médico, fisioterapeuta, prep. físico |
| Recuperación física | Fisioterapeuta y médico |
| Precisión de scouting | Ojeador y analista (academia y draft) |
| Rendimiento en partido | Entrenador, segundo y analista |
| Negociación de fichajes | Director deportivo |
| Desarrollo de porteros | Entrenador de porteros |

El `coachLevel` que usa el simulador de partidos ya sale de aquí, y la pantalla
de Entrenamiento muestra explícitamente cuánto aporta el staff a la progresión
y cuánto reduce el riesgo de lesión.

### Seguridad
`staffMarkets/{clubId}` guarda mercado y cursos (determinista, `periodIndex` no
puede retroceder, máximo 2 cursos). En `staff` el usuario puede cambiar nivel,
ficha, experiencia y contrato, pero **nunca el potencial**, y el nivel no puede
subir más de 8 puntos por escritura (el tope del curso de élite) ni superar el
potencial del técnico.

---

## 14. FASE 8 (implementada) — Selecciones nacionales y votaciones

### Archivos nuevos
```
src/game/national.ts        # Categorías, elecciones, convocatorias y partidos
src/pages/NationalPage.tsx  # Pantalla completa de selecciones
```

### Categorías y elegibilidad
| Categoría | Edad máx. | Reputación mín. para postularse | Convocados |
|---|---|---|---|
| Sub-15 | 15 | 10 | 18 |
| Sub-17 | 17 | 22 | 20 |
| Sub-20 | 20 | 38 | 22 |
| Absoluta | — | 55 | 23 |

Un jugador es elegible si su **nacionalidad principal o secundaria** coincide con
la del país y cumple el límite de edad (`isEligible`).

### Candidaturas y votación
Cuando expira un mandato, `refreshNational()` abre **elecciones** automáticamente
(también si entras después de semanas: el mundo sigue). Aparecen 2-4 candidaturas
de la IA y puedes **presentar la tuya** si tu club alcanza la reputación mínima,
escribiendo tu programa electoral. Los managers votan (**un voto por elección**) y
al cerrar el recuento gana el más votado, con desempate por reputación. El mandato
dura **120 días de juego** y registra tu balance (PJ/G/E/P) y los títulos ganados.

### Convocatorias y partidos
Si diriges una selección puedes convocar manualmente o usar **Auto** (reparto por
líneas: 3 POR, 7 DEF, 7 MED, 6 DEL). Con 11 o más convocados puedes disputar
**amistosos, clasificación o torneos**. Los goles se reparten con sesgo ofensivo,
se acumulan **internacionalidades y goles** por jugador, y ganar 3 partidos
seguidos de Torneo conquista un **título internacional**. Cada partido genera
noticia en la sala de prensa.

### Ranking mundial
`worldRanking()` ordena los 13 países por fuerza base más el rendimiento real de
tu absoluta (victorias +26, empates +8, derrotas −14), con indicador de tendencia.

### Seguridad
`nationalTeams/{clubId}` guarda categorías, mandatos, convocatorias y partidos;
las reglas impiden cambiar dueño, club o país. Para producción está el cron
**`nationalTeamElection`** que cuenta los votos reales de la colección `votes`
(ID obligatorio `uid_electionId` → **un voto por manager y elección**), proclama
al ganador y abre el mandato. Los comandos `vote` y `applyNationalCoach`
verifican en servidor la unicidad del voto y el requisito de reputación dentro de
una transacción.

---

## 15. FASE 9 (implementada) — Fama, afición, logros, récords y leyendas

### Archivos nuevos
```
src/game/fame.ts         # Popularidad, logros, récords y legado (motor puro)
src/pages/FamePage.tsx   # Fama · Afición · Logros · Récords · Leyendas
src/pages/RankingsPage.tsx (reescrita) # 6 rankings globales
```

### Popularidad que crece jugando
Tras cada partido, `fameFromMatch()` reparte fama según goles, asistencias, nota,
victoria, goleada y si el rival era superior. **El alcance depende de la
reputación del club**: un crack en un club humilde solo es famoso en su ciudad;
al crecer el club, su fama salta a lo nacional y luego a lo internacional.

`fameIndex()` combina las tres capas (25% local, 35% nacional, 40% internacional)
y produce etiquetas: *Prácticamente desconocido → Ídolo local → Figura nacional →
Estrella internacional → **Icono mundial***. Visible en la ficha del jugador.

### Afición viva
`fanReport()` genera el estado de la grada (de *Rebelión* a *Euforia*) con notas
contextuales sobre clasificación, fidelidad, precios de entradas y quién es el
referente. Los **ídolos** se recalculan solos: los tres jugadores con más fama
pasan a ser los favoritos y venderlos penaliza la satisfacción.

### 18 logros con progreso
Cuatro categorías (**bronce, plata, oro, leyenda**) que cubren todos los sistemas:
victorias, rachas, goleadas, título de liga, tesorería, aforo, instalaciones,
academia, superestrellas, **fichar un SS**, icono mundial, dirigir una selección,
ganar un torneo internacional, masa social, confianza de la directiva y partidos
dirigidos. Cada logro muestra su barra de progreso y al desbloquearse genera una
noticia automática.

### 7 récords históricos
Mayor victoria, racha sin perder, más goles en un partido, récord de asistencia,
saldo máximo, mejor posición liguera y máximo goleador. Se actualizan tras cada
partido y **persisten entre temporadas**.

### Leyendas
`computeLegends()` puntúa el legado de cada jugador con fama, reputación, goles,
asistencias, partidos, internacionalidades, títulos, nivel y clase. Tres estados:
**referente → icono → leyenda**, con el motivo concreto de cada nombre.

### 6 rankings globales
Clubes (liga + mundial), **managers** (puntos, balance y logros), goleadores,
valor de mercado, fama y selecciones.

### Seguridad
`achievements/{clubId}` guarda logros, récords y leyendas. Las reglas garantizan
que los logros **nunca se pierden ni se otorgan en bloque** (máximo 4 nuevos por
escritura) y que los récords son **monótonos crecientes**. Como el progreso se
deriva del estado del club —que ya está protegido— el servidor puede recalcular
con la misma función y detectar cualquier manipulación.

---

## 16. FASE 10 (implementada) — Seguridad, temporadas, PWA y escalabilidad

### Archivos nuevos
```
src/game/season.ts        # Cierre de temporada: premios, envejecimiento, retiros
src/game/integrity.ts     # Capa anti-exploit que sanea estados imposibles
src/lib/pwa.ts            # Instalación, actualizaciones, offline y notificaciones
src/pages/SystemPage.tsx  # Seguridad · Aplicación · Temporadas · Rendimiento
public/sw.js (v3)         # Service worker con estrategias por tipo de recurso
```

### Ciclo de vida completo de los jugadores
Al detectar cambio de temporada (1 julio) se ejecuta `rolloverSeason()`:
premios por posición, **ascensos y descensos**, títulos, y `ageSquad()` que
envejece a todos un año. El desarrollo depende de la edad: los ≤21 recuperan
hasta el 44% del margen de potencial, los ≥31 **declinan**, y a partir de los 32
aparece la probabilidad de **retiro** (mitigada por el nivel del jugador). Los
que se retiran quedan marcados como leyenda si superan 60 goles, 78 de
reputación o 2 títulos. El staff también envejece y se jubila. Todo se resume en
un **modal de fin de temporada** y en el historial permanente.

### Capa de integridad (defensa en profundidad)
`verifyState()` se ejecuta al cargar y bajo demanda. Detecta y **corrige**:
saldos NaN o por encima del techo, reputación fuera de rango, instalaciones
imposibles, obras inválidas, **jugadores duplicados o clonados** (por id y por
semilla), nivel que no cuadra con los atributos (se recalcula), potencial menor
que el nivel, clases mal asignadas, valores y salarios fuera de escala y edades
imposibles. Cada anomalía se registra y se muestra en la pantalla de Sistema.

```
1) Cloud Functions (Admin SDK)  → autoridad absoluta
2) Reglas de Firestore          → cortafuegos declarativo
3) Semillas deterministas       → el servidor regenera y compara
4) verifyState()                → sanea antes de mostrar o guardar
5) IDs con semilla + `origin`   → trazabilidad y detección de clones
```

### PWA completa
Service worker v3 con **tres estrategias**: app shell en *stale-while-revalidate*
(arranque instantáneo), navegación en *network-first* con fallback offline, y
**nunca caché para datos de Firebase**. Incluye botón de instalación nativo,
detección de nueva versión con **actualización en caliente**, indicador de
conexión perdida en la barra superior y soporte de notificaciones push
(`push` + `notificationclick`) listo para conectar Firebase Cloud Messaging.

### Optimización de costes
| Técnica | Efecto |
|---|---|
| Documentos agregados | Liga, mercado, academia, draft, staff, selecciones, fama y temporadas = 1 doc cada uno |
| Caché en memoria | Navegar entre pantallas: 0 lecturas extra |
| Reloj calculado | 0 lecturas y 0 escrituras para el tiempo |
| `writeBatch` de 400 | Cambios masivos en 1 operación |
| Generación determinista | Escaparates y drafts se recrean, no se almacenan |
| `rankings/{doc}` | 1 lectura devuelve el top global (antes O(n)) |

Estimación: **~12 lecturas por sesión** y ~4 escrituras por partido → alrededor
de 1.500 usuarios activos dentro del plan gratuito de Firebase.

### Cloud Functions finales (8 programadas + cola)
`createClub` · `playMatch` · `dailyTick` · `weeklyFinances` · `monthlyAcademy` ·
`bimonthlyDraft` · `nationalTeamElection` · **`seasonRollover`** ·
**`rebuildRankings`** · **`cleanup`** · `onCommand` (transferBid, listPlayer,
upgradeFacility, vote, applyNationalCoach).

---

## 17. Estado final del proyecto

Las **10 fases están completas**. El juego incluye:

- Registro/login, creación de club y 22 jugadores procedurales (13 ligas).
- Alineación con campo interactivo, tácticas, entrenamiento individual.
- Simulador de partidos con narración minuto a minuto y liga de 22 jornadas.
- Economía viva: taquilla, patrocinios, obras, directiva y presupuestos.
- Mercado con negociación en dos capas, cesiones, agentes libres y renovaciones.
- Academia mensual con informes de ojeador y draft bimensual con clases SS-D.
- Cuerpo técnico de 11 cargos con Centro de Formación y 7 efectos reales.
- Selecciones Sub-15/17/20/Absoluta con candidaturas y votaciones.
- Fama, afición, 18 logros, 7 récords, leyendas y 6 rankings.
- Temporadas con envejecimiento, retiros, ascensos y descensos.
- PWA instalable, offline, con seguridad y auditoría de integridad.

---

## 18. FASE 11 (implementada) — Copas y competiciones internacionales

### Archivos nuevos
```
src/game/cups.ts        # Motor de eliminatorias (nacional, supercopa, internacional)
src/pages/CupsPage.tsx  # Cuadro visual, palmarés e historial
```

### Tres competiciones simultáneas
| Competición | Equipos | Acceso | Premio base por ronda |
|---|---|---|---|
| **Copa Nacional** | 16 del país | Siempre | 450.000 € |
| **Supercopa** | 2 (partido único) | Requiere un título previo | 900.000 € |
| **Copa Intercontinental** | 16 de todo el mundo | Reputación ≥ 45 | 1.400.000 € |

### Formato
Eliminatoria a **partido único** (octavos → cuartos → semifinal → final). El
partido del usuario se juega con el **simulador completo** (narración minuto a
minuto incluida); el resto del cuadro se resuelve con simulación rápida. Si hay
empate se decide en una **tanda de penaltis determinista** ponderada por el nivel
de ambos equipos. Al pasar de ronda, el **sorteo de la siguiente se genera
automáticamente** con los ganadores. Las finales y la Supercopa se juegan en
campo neutral (sin ventaja de localía).

Si te eliminan, el torneo **se resuelve solo** hasta conocer al campeón, así que
el cuadro siempre queda completo.

### Recompensas
Los premios crecen ×1,75 por ronda y ×1,8 extra en la final. Ganar un título
suma trofeo al palmarés, **+9 de reputación** (internacional), +6 (nacional) o
+3 (supercopa), +12 de confianza de la directiva, +10 de satisfacción de la
afición y un 6% más de masa social. Todo alimenta a su vez la fama de los
jugadores y los logros de la FASE 9.

### Ciclo anual
Al cambiar de temporada, `refreshCompetitions()` archiva los resultados en el
historial (campeón o ronda alcanzada) y **regenera los tres cuadros**, evaluando
de nuevo si el club se clasifica para la Supercopa y la Intercontinental.

### Seguridad
`competitions/{clubId}` es **un solo documento** con los tres cuadros. Los
equipos y emparejamientos son deterministas por semilla (`cup:{tipo}:{club}:{temporada}`),
y las reglas impiden retroceder de temporada, reabrir una copa finalizada o
recortar el historial.

---

## 19. Estado final

Con la FASE 11 queda cubierto **todo el apartado COMPETICIONES** de la
especificación original: ligas, copas nacionales, supercopas, competiciones
internacionales, ascensos, descensos y temporadas.

---

## 20. FASE 12 (implementada) — Multijugador real

### Archivos nuevos
```
src/game/multiplayer.ts        # Ligas compartidas y traspasos entre usuarios
src/pages/MultiplayerPage.tsx  # Liga mundial · Managers · Ofertas
```

### Ligas mundiales compartidas
`worldLeagues/{país}_D{división}_{temporada}` es un **documento compartido** por
todos los managers de ese país y categoría. Cupo de 12 equipos: las plazas
vacías las ocupan clubes IA y, al inscribirse un usuario, **sustituye al club IA
de nivel más parecido** — así la liga mantiene su equilibrio competitivo y los
partidos ya sorteados se reasignan sin romper el calendario.

### El truco de la consistencia: determinismo
El simulador usa semillas (`{leagueId}:{fixtureId}`), así que **dos usuarios que
disputen el mismo partido obtienen exactamente el mismo resultado**. No hace
falta bloqueo ni turnos: quien entre primero resuelve la jornada y el resto ve
el marcador ya escrito, idéntico al que habrían calculado ellos mismos. El resto
de la jornada se resuelve con `quickSim`, también determinista, de modo que la
clasificación es la misma para todos los participantes.

> Con Cloud Functions desplegadas, la callable `playWorldMatch` carga la
> **plantilla real** del rival humano en lugar de un equipo equivalente por
> nivel, y actúa como árbitro único.

### Traspasos entre managers (liquidación en dos pasos)
El reto es que **nadie puede escribir en el club de otro usuario**. La solución:

1. El comprador envía una oferta (`transferOffers`) con importe y mensaje.
2. El **vendedor acepta**: el jugador cambia de `clubId`/`ownerUid` y él cobra
   el importe en su propia caja.
3. El **comprador liquida al entrar**: al cargar la app detecta la oferta
   aceptada, paga el importe en su propia caja y recibe una noticia.

Cada usuario escribe únicamente en sus propios documentos, y el estado
intermedio es consistente porque el jugador ya pertenece al comprador.

### Reglas de seguridad de documentos compartidos
Son las más estrictas del proyecto:
- `worldLeagues`: no se puede cambiar identidad, temporada, cupo ni el número de
  miembros; solo evolucionar tabla y calendario.
- `transferOffers`: lectura restringida a emisor y receptor; **solo el receptor**
  puede aceptar o rechazar y **solo el emisor** puede marcar como liquidada;
  importe, jugador y partes son inmutables tras la creación.

---

## 21. Estado final del proyecto

**12 fases completadas.** 22 pantallas, 14 módulos de motor puro y ~45
documentos de Firestore optimizados. El juego cubre íntegramente la
especificación original —incluidas competiciones internacionales y
multijugador— y funciona tanto en modo local como conectado a Firebase.

---

## 22. FASE 13 (implementada) — Perfil, escudos y centro de avisos

### Archivos nuevos
```
src/lib/storage.ts         # Firebase Storage: subida optimizada de imágenes
src/game/manager.ts        # Progresión del manager + centro de notificaciones
src/pages/ProfilePage.tsx  # Perfil, imágenes, trayectoria y preferencias
```

### Firebase Storage (por fin en uso)
Era el único servicio de la especificación sin implementar. Ahora puedes subir
**escudo del club** y **avatar de manager**:

- La imagen se **recorta a un cuadrado centrado y se reescala a 256×256** con
  `canvas` en el propio navegador, comprimiéndola a WebP con calidad 0,86.
  Una foto de 5 MB acaba pesando unos 20 KB.
- Se sube a `clubs/{uid}/badge.webp` o `managers/{uid}/badge.webp`, rutas que
  las reglas de `storage.rules` **ya protegían por uid** desde la FASE 1.
- Sin Firebase configurado, se guarda como data-URL en el navegador, así la
  funcionalidad se puede probar en modo local.
- El escudo aparece automáticamente en la barra lateral y en el perfil.

### Progresión del manager
El `managerLevel`/`managerXp` del modelo de datos ya tiene uso real. La XP se
**deriva del rendimiento** (no se almacena, así no se puede falsear):

```
XP = victorias×28 + empates×9 + partidos×4 + títulos×320
   + logros×55 + temporadas×140 + canteranos×35 + reputación×6
```

Curva `180 × nivel^1,42` y **7 títulos de carrera**: Manager novato → Técnico
prometedor → Entrenador consolidado → Estratega respetado → Manager de élite →
Maestro del banquillo → **Leyenda viva**.

### Centro de notificaciones
`buildNotifications()` recorre **todos los sistemas** y genera avisos
*accionables* (no repite las noticias históricas), ordenados por urgencia
(alta/media/baja) y con botón directo a la pantalla correspondiente:

| Detecta | Ejemplo |
|---|---|
| Partido listo | Liga y copas disponibles ahora |
| Ofertas | De la IA y de otros managers |
| Academia / Draft | Canteranos y selecciones pendientes |
| Obras y cursos | Con cuenta atrás en tiempo real |
| Contratos y lesiones | Fichas que expiran, enfermería |
| Finanzas | Números rojos, déficit, sin patrocinador |
| Selecciones | Elecciones abiertas |
| Clasificación | Alerta de zona de descenso |

Aparece destacado en el **panel principal** y el usuario decide qué categorías
quiere ver desde su perfil (10 conmutadores). El contador de la campana suma
noticias sin leer y avisos urgentes.

---

## 23. Estado final del proyecto

**13 fases completadas.** 24 pantallas, 16 módulos de motor puro y ~45
documentos de Firestore optimizados. Se usan **los cuatro servicios de Firebase**
pedidos en la especificación: Authentication, Firestore, Storage y Cloud
Functions.

---

## 24. FASE 14 (implementada) — Centro de análisis y scouting

### Archivos nuevos
```
src/game/scouting.ts        # Misiones de ojeo, informes de rival y comparador
src/pages/ScoutingPage.tsx  # Ojeadores · Descubrimientos · Rival · Comparador
```

### Misiones de ojeo
Envías a un ojeador (o analista / director deportivo) a **cualquiera de los 13
países** durante 7, 14 o 28 días de juego, eligiendo posición y perfil:
*jóvenes promesas*, *jugador diferencial*, *oportunidades* o sin preferencia.
El coste depende del nivel del ojeador, la duración y si viaja al extranjero.

Al volver trae **de 1 a 4 jugadores que no existen en el mercado normal** —
generados según el perfil pedido y la fuerza futbolística del país. Las misiones
avanzan aunque cierres la app y al entrar recibes la noticia con el hallazgo
más prometedor.

### La incertidumbre como mecánica
Los informes **nunca dan el valor exacto**: muestran un rango de nivel y de
techo con un porcentaje de fiabilidad que depende de:

```
precisión = 30 + nivel del ojeador×0,6 + Centro de análisis×5
          + especialidad (Sudamérica/Europa +14, Juveniles +6, Datos +8)
          + duración (28 días +10, 14 días +5)
```

Con un ojeador mediocre y analytics N1 el margen puede ser de ±30 puntos de
potencial: fichar es una apuesta. Con un especialista y el centro mejorado
bajas a ±5. Esto da por fin **utilidad real** a la instalación "Centro de
análisis" y al rol de "Ojeador" con sus especialidades.

### Informe de rival
El **Analista** prepara antes de cada partido un dossier con nivel del rival,
formación prevista, nivel de amenaza, puntos fuertes, debilidades y
recomendaciones tácticas, con acceso directo a la pantalla de alineación. La
cantidad de información depende otra vez de la precisión: sin analista apenas
obtienes un apunte.

### Comparador
Enfrenta dos jugadores de tu plantilla atributo por atributo, con barras
proporcionales, recuento de victorias parciales y veredicto automático.

---

## 25. Estado final del proyecto

**14 fases completadas.** 25 pantallas, 17 módulos de motor puro y ~46
documentos de Firestore. Todos los sistemas de la especificación original están
implementados y, además, cada instalación y cada rol del cuerpo técnico tiene
un efecto medible en el juego.

---

## 26. FASE 15 (implementada) — Vestuario, química y sala de prensa

### Archivos nuevos
```
src/game/dressingroom.ts        # Química, conversaciones, arengas y prensa
src/pages/DressingRoomPage.tsx  # Ambiente · Conversaciones · Charla · Prensa
```

Esta fase convierte en **mecánicas jugables** tres sistemas que hasta ahora solo
eran números internos: **personalidad**, **moral** y **química**.

### Mapa de química
`analyseChemistry()` calcula la afinidad de las 231 parejas posibles de una
plantilla de 22 y detecta:
- **Camarillas positivas** por nacionalidad compartida (3+ jugadores), con su
  líder natural y nivel de cohesión.
- **Núcleo de descontentos**: camarilla negativa que se forma sola cuando dos o
  más jugadores caen por debajo de 38 de moral.
- **Líderes naturales**, ponderando liderazgo, reputación y personalidad
  (*Líder nato* +26, *Egoísta* −10, *Temperamental* −12).
- Las mejores y peores conexiones del vestuario.

### Conversaciones individuales
El sistema detecta **6 tipos de preocupación** (minutos, rol, contrato, deseo de
salir, mala forma, mal ambiente) y sugiere la charla adecuada. Hay 5 opciones y
**la probabilidad de éxito depende de la personalidad**:

| Charla | Funciona muy bien con | Sale mal con |
|---|---|---|
| Elogiar | Egoísta, Tímido | Profesional (le sobra) |
| **Advertir** | Profesional, Determinado (+26) | **Temperamental (−30)** |
| Prometer minutos | Ambicioso, Leal | Inconstante |
| Calmar | Temperamental, Tímido | Egoísta |
| Apelar al liderazgo | Líder nato (+26) | Tímido (−22) |

Advertir a un temperamental le hunde la moral 13 puntos; hacerlo con un
profesional se la sube 11. Hay tiempo de espera por jugador para evitar el spam.

### Charla de equipo
Antes de cada partido eliges entre 5 tonos. La pantalla **calcula el efecto
esperado y el riesgo** analizando el contexto real: diferencia de nivel con el
rival, local o visitante, moral media y cuántos jugadores del once tienen
carácter frente a cuántos son frágiles. *Confiados* ante un rival superior puede
restar 3 puntos de moral a todo el once; *Exigente* con un grupo de carácter
suma 6.

### Sala de prensa
Tres preguntas generadas según tu situación real (clasificación, tu estrella,
un jugador en mala forma, el proyecto). Cada respuesta mueve **confianza de la
directiva, satisfacción de la afición y moral del vestuario** en direcciones
frecuentemente opuestas: pedir más ambición en el mercado encanta a la grada
(+8) y enfada al consejo (−6).

---

## 27. Estado final del proyecto

**15 fases completadas.** 26 pantallas, 18 módulos de motor puro y ~47
documentos de Firestore. Todos los atributos del modelo de datos original tienen
ahora un uso jugable: no queda ningún número decorativo.

---

## 28. FASE 16 (implementada) — Dirección de partido en vivo

### Archivos nuevos
```
src/game/livematch.ts        # Motor de simulación pausable (máquina de estados)
src/pages/LiveMatchPage.tsx  # El banquillo: cambios, tácticas y narración
```

Hasta ahora el simulador resolvía los 90 minutos de golpe y solo veías el
resultado. Esta fase lo convierte en una **máquina de estados pausable**: ahora
puedes sentarte en el banquillo y dirigir.

### Simulación incremental
`advanceLive(state, minuto)` simula solo el tramo pedido y devuelve los eventos
nuevos. El cursor del generador aleatorio vive en el estado, así que reanudar
produce siempre la misma secuencia (sigue siendo determinista). Se recalcula la
potencia del equipo **con los jugadores que están realmente en el campo**,
incluida la penalización por inferioridad numérica tras una roja.

### Decisiones que importan
| Herramienta | Efecto |
|---|---|
| **5 cambios** | La condición física se muestra en vivo y baja con el ritmo y la presión |
| **6 ajustes tácticos** | Mentalidad, presión, ritmo y amplitud, con efecto inmediato en el resto del partido |
| **Barra de inercia** | −100 a +100: sube con cada ocasión y con los goles, y realimenta la probabilidad de generar peligro |
| **Segundo entrenador** | Avisa de jugadores fundidos, amonestados en riesgo, dominio del rival o falta de pegada |

Un jugador con 40% de condición rinde mucho peor: refrescar el equipo a tiempo
es una ventaja real, igual que cerrarse atrás con una ventaja mínima en el 80'.

### Integración total
Al confirmar, `buildResult()` produce un `MatchResult` **idéntico al del
simulador clásico**, así que encaja sin tocar nada con la clasificación, la
taquilla, la fama de los jugadores, los récords, los logros y las noticias.
En la Liga eliges: **Simular partido** (rápido, como siempre) o **Dirigir en
directo**. Si te vas a otra pantalla con el partido abierto, una barra superior
te lleva de vuelta al banquillo.

---

## 29. Estado final del proyecto

**16 fases completadas.** 27 pantallas, 19 módulos de motor puro y ~47
documentos de Firestore. El juego cubre la especificación original completa y
añade dirección en vivo, multijugador, scouting y gestión de vestuario.

**Para ampliar en el futuro**: API deportiva legal como fuente opcional de datos,
Firebase Cloud Messaging para push reales, y chat de liga entre managers.
