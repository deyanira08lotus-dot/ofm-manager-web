/**
 * src/pages/SystemPage.tsx — Sistema: seguridad, integridad, PWA, temporadas y costes.
 */
import { useState } from "react";
import {
  Activity, AlertTriangle, Bell, CheckCircle2, Cloud, CloudOff, Download, Gauge, History,
  Loader2, RefreshCw, ShieldCheck, Trophy, XCircle, Zap,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, num } from "@/game/format";
import { integritySummary, LIMITS } from "@/game/integrity";
import { notificationStatus, requestNotifications, usePwa } from "@/lib/pwa";
import { firebaseConfigured, useCloudFunctions } from "@/lib/firebase";
import { formatGameDate, gameNow, seasonIdOf } from "@/game/time";

const TABS = [
  { key: "seguridad", label: "Seguridad", icon: <ShieldCheck size={15} /> },
  { key: "pwa", label: "Aplicación", icon: <Download size={15} /> },
  { key: "temporadas", label: "Temporadas", icon: <History size={15} /> },
  { key: "rendimiento", label: "Rendimiento", icon: <Gauge size={15} /> },
] as const;

export default function SystemPage() {
  const { club, players, integrity, runIntegrityCheck, seasonHistory, mode } = useGame();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("seguridad");
  const [checking, setChecking] = useState(false);
  const [notifPerm, setNotifPerm] = useState(notificationStatus());
  const pwa = usePwa();

  if (!club) return null;
  const summary = integritySummary(integrity);

  const PROTECTED = [
    ["Dinero y presupuestos", "Techo absoluto + reglas de Firestore"],
    ["Atributos y nivel", "Recalculados desde los atributos reales"],
    ["Potencial y clase", "Inmutables para el cliente"],
    ["Estadísticas y resultados", "Escritura solo desde el motor"],
    ["Transferencias", "Escaparate determinista por semilla"],
    ["Draft", "Periodo no puede retroceder (anti re-roll)"],
    ["Votaciones", "ID único uid_electionId (un voto)"],
    ["Premios y logros", "Progreso recalculable en servidor"],
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Sistema</h1>
        <p className="text-sm text-white/45">
          Integridad de datos, protección anti-exploit, instalación de la app y rendimiento.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Integridad" value={summary.label} sub={summary.detail} icon={<ShieldCheck size={15} />} tone={summary.tone} />
        <StatTile label="Backend" value={mode === "firebase" ? "Firebase" : "Local"}
                  sub={useCloudFunctions ? "Cloud Functions activas" : "Reglas de Firestore"}
                  icon={firebaseConfigured ? <Cloud size={15} /> : <CloudOff size={15} />}
                  tone={firebaseConfigured ? "good" : "warn"} />
        <StatTile label="Conexión" value={pwa.online ? "En línea" : "Sin conexión"}
                  sub={pwa.installed ? "App instalada" : "Navegador"} tone={pwa.online ? "good" : "bad"} />
        <StatTile label="Temporadas jugadas" value={seasonHistory?.seasons.length ?? 0}
                  sub={`Actual: ${seasonIdOf(gameNow())}`} icon={<Trophy size={15} />} />
      </div>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === t.key ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ----------------------- SEGURIDAD ----------------------- */}
      {tab === "seguridad" && (
        <div className="space-y-5">
          <Card title="Verificación de integridad" subtitle="Detecta y corrige estados imposibles"
                action={
                  <Button size="sm" variant="outline" disabled={checking}
                          onClick={() => { setChecking(true); runIntegrityCheck(); setTimeout(() => setChecking(false), 400); }}>
                    {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Comprobar
                  </Button>
                }>
            <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
              summary.tone === "good" ? "border-turf-500/30 bg-turf-500/10 text-turf-300" :
              summary.tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" :
              "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
              {summary.tone === "good" ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
              <span><b>{summary.label}.</b> {summary.detail}</span>
            </div>

            {integrity && integrity.issues.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {integrity.issues.map((i, idx) => (
                  <li key={idx} className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-2 text-xs">
                    <Badge className={i.severity === "critical" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}>
                      {i.severity === "critical" ? "crítico" : "aviso"}
                    </Badge>
                    <span className="min-w-0 flex-1 text-white/60">{i.message}</span>
                    {i.fixed && <span className="text-turf-300">corregido</span>}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PROTECTED.map(([k, v]) => (
                <div key={k} className="flex items-start gap-2 rounded-lg bg-white/4 px-3 py-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-turf-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{k}</p>
                    <p className="text-[11px] text-white/40">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Límites del sistema" subtitle="Ningún valor puede superarlos legítimamente">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Saldo máx.", money(LIMITS.maxBalance)],
                ["Salario máx.", `${money(LIMITS.maxWage)}/sem`],
                ["Valor máx.", money(LIMITS.maxValue)],
                ["Nivel máx.", LIMITS.maxOverall],
                ["Aforo máx.", num(LIMITS.maxCapacity)],
                ["Instalación máx.", `N${LIMITS.maxFacilityLevel}`],
                ["Plantilla", `${LIMITS.minSquad}-${LIMITS.maxSquad}`],
                ["Jugadores actuales", players.length],
              ] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 p-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{k}</p>
                  <p className="text-sm font-bold">{v}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Arquitectura de seguridad" subtitle="Defensa en profundidad">
            <ol className="space-y-2 text-sm text-white/55">
              {[
                "1. Cloud Functions con Admin SDK: autoridad absoluta sobre dinero, fichajes, draft y votos.",
                "2. Reglas de Firestore: cortafuegos declarativo que limita qué campos puede tocar el cliente.",
                "3. Generación determinista por semilla: el servidor puede regenerar y comparar cualquier lista.",
                "4. Esta capa de integridad: detecta y sanea estados imposibles antes de guardarlos.",
                "5. IDs con semilla y campo `origin`: trazabilidad total y detección de clones.",
              ].map((t) => <li key={t} className="rounded-lg bg-white/4 px-3 py-2">{t}</li>)}
            </ol>
          </Card>
        </div>
      )}

      {/* -------------------------- PWA -------------------------- */}
      {tab === "pwa" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Instalar aplicación" subtitle="Funciona como app nativa en móvil y PC">
            {pwa.installed ? (
              <p className="flex items-center gap-2 rounded-xl border border-turf-500/30 bg-turf-500/10 px-3 py-2.5 text-sm text-turf-300">
                <CheckCircle2 size={16} /> La aplicación ya está instalada en este dispositivo.
              </p>
            ) : pwa.installable ? (
              <>
                <p className="text-sm text-white/55">
                  Instálala para tener icono propio, pantalla completa y arranque instantáneo.
                </p>
                <Button className="mt-3 w-full" onClick={() => pwa.install()}>
                  <Download size={15} /> Instalar Gestor Pro
                </Button>
              </>
            ) : (
              <p className="text-sm text-white/50">
                Para instalarla: en Android pulsa el menú del navegador → «Instalar aplicación»; en iPhone usa
                Compartir → «Añadir a pantalla de inicio»; en PC, el icono de instalación de la barra de direcciones.
              </p>
            )}

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-xs">
                <span className="text-white/50">Estado de conexión</span>
                <span className={pwa.online ? "font-semibold text-turf-300" : "font-semibold text-rose-300"}>
                  {pwa.online ? "En línea" : "Sin conexión (modo offline)"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-xs">
                <span className="text-white/50">Caché offline</span>
                <span className="font-semibold">App shell v3 activo</span>
              </div>
            </div>

            {pwa.updateReady && (
              <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                <p className="text-sm text-sky-300">Hay una versión nueva disponible.</p>
                <Button size="sm" className="mt-2 w-full" onClick={() => pwa.applyUpdate()}>
                  <Zap size={13} /> Actualizar ahora
                </Button>
              </div>
            )}
          </Card>

          <Card title="Notificaciones" subtitle="Avisos de partidos, mercado y academia">
            <div className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2.5 text-sm">
              <span className="text-white/50">Permiso actual</span>
              <span className="font-semibold">
                {notifPerm === "granted" ? "Concedido" : notifPerm === "denied" ? "Bloqueado" : notifPerm === "unsupported" ? "No soportado" : "Sin decidir"}
              </span>
            </div>
            {notifPerm === "default" && (
              <Button className="mt-3 w-full" variant="outline"
                      onClick={async () => setNotifPerm(await requestNotifications())}>
                <Bell size={15} /> Activar notificaciones
              </Button>
            )}
            <p className="mt-3 text-[11px] text-white/40">
              El service worker ya está preparado para recibir notificaciones push. Cuando conectes Firebase Cloud
              Messaging, los avisos de fin de obra, draft abierto y ofertas del mercado llegarán aunque la app esté cerrada.
            </p>
          </Card>
        </div>
      )}

      {/* ---------------------- TEMPORADAS ---------------------- */}
      {tab === "temporadas" && (
        !seasonHistory || seasonHistory.seasons.length === 0 ? (
          <EmptyState icon={<History />} title="Todavía no has completado una temporada"
                      text={`La temporada ${seasonIdOf(gameNow())} está en curso. Al terminar, el sistema cerrará el ejercicio automáticamente: premios, ascensos, envejecimiento, retiros y resumen histórico.`} />
        ) : (
          <div className="space-y-3">
            {seasonHistory.seasons.map((s) => (
              <Card key={s.seasonId}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black ${
                    s.position === 1 ? "bg-amber-500/20 text-amber-300" :
                    s.promoted ? "bg-turf-500/20 text-turf-300" :
                    s.relegated ? "bg-rose-500/20 text-rose-300" : "bg-white/6 text-white/60"}`}>
                    {s.position || "—"}º
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">Temporada {s.seasonId}</p>
                    <p className="text-xs text-white/45">
                      {s.won}V {s.drawn}E {s.lost}D · {s.points} pts · {s.gf}:{s.ga} goles
                      {s.promoted && " · ¡Ascenso!"}
                      {s.relegated && " · Descenso"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-300">{money(s.prize)}</p>
                    <p className="text-[10px] text-white/35">{formatGameDate(s.endedAt)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-white/4 p-2.5 text-xs">
                    <p className="text-white/40">Máximo goleador</p>
                    <p className="font-semibold">{s.topScorer ? `${s.topScorer.name} (${s.topScorer.goals})` : "—"}</p>
                  </div>
                  <div className="rounded-lg bg-white/4 p-2.5 text-xs">
                    <p className="text-white/40">Retiradas</p>
                    <p className="font-semibold">{s.retired.length ? s.retired.map((r) => r.name).join(", ") : "Ninguna"}</p>
                  </div>
                  <div className="rounded-lg bg-white/4 p-2.5 text-xs">
                    <p className="text-white/40">Grandes saltos</p>
                    <p className="font-semibold">
                      {s.breakthroughs.length ? s.breakthroughs.map((b) => `${b.name} +${b.to - b.from}`).join(", ") : "—"}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* --------------------- RENDIMIENTO --------------------- */}
      {tab === "rendimiento" && (
        <div className="space-y-5">
          <Card title="Optimización de costes de Firestore" subtitle="Diseño pensado para escalar barato">
            <div className="space-y-3">
              {([
                ["Documentos agregados", 95, "Liga, mercado, academia, draft, staff, selecciones y fama son 1 documento cada uno: una lectura devuelve el módulo completo."],
                ["Caché en memoria", 90, "El estado global guarda todo al entrar; navegar entre pantallas no genera ni una lectura extra."],
                ["Reloj calculado", 100, "El tiempo de juego se deriva por fórmula: 0 lecturas y 0 escrituras."],
                ["Escrituras por lotes", 85, "Los cambios masivos de jugadores se agrupan en lotes de 400."],
                ["Generación determinista", 100, "Escaparates, canteras y drafts se recrean por semilla en vez de almacenarse."],
              ] as const).map(([k, v, d]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-white/60">{k}</span>
                    <span className="font-bold text-turf-300">{v}%</span>
                  </div>
                  <Bar value={v} />
                  <p className="mt-1 text-[11px] text-white/40">{d}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Coste estimado por usuario" subtitle="Con el plan gratuito de Firebase (Spark)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ["Lecturas / sesión", "~12"],
                ["Escrituras / partido", "~4"],
                ["Documentos / club", "~35"],
                ["Usuarios en gratuito", "~1.500"],
              ] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 p-3 text-center">
                  <p className="text-xl font-black text-turf-300">{v}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{k}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/40">
              <Activity size={12} className="mt-0.5 shrink-0" />
              Estimación con los índices de <code>firebase/firestore.indexes.json</code> publicados. Para crecer más,
              activa Cloud Functions y mueve la simulación al servidor.
            </p>
          </Card>

          <Card title="Estado del despliegue">
            <ul className="space-y-1.5 text-sm">
              {([
                ["Firebase configurado", firebaseConfigured],
                ["Cloud Functions activas", useCloudFunctions],
                ["Service worker registrado", "serviceWorker" in navigator],
                ["App instalada", pwa.installed],
                ["Notificaciones concedidas", notifPerm === "granted"],
              ] as const).map(([k, ok]) => (
                <li key={k} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
                  <span className="text-white/60">{k}</span>
                  {ok ? <CheckCircle2 size={15} className="text-turf-400" /> : <XCircle size={15} className="text-white/25" />}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
