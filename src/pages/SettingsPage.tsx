/**
 * src/pages/SettingsPage.tsx — estado de conexión, guía de configuración y datos de la cuenta.
 */
import { AlertTriangle, CheckCircle2, Cloud, Database, GitBranch, Rocket, Trash2, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { firebaseConfig, firebaseConfigured, useCloudFunctions } from "@/lib/firebase";
import { GAME_CONFIG } from "@/game/config";
import { formatGameDate, gameNow, seasonIdOf } from "@/game/time";

const ENV_VARS = [
  ["VITE_FIREBASE_API_KEY", firebaseConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
  ["VITE_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket],
  ["VITE_FIREBASE_MESSAGING_SENDER_ID", firebaseConfig.messagingSenderId],
  ["VITE_FIREBASE_APP_ID", firebaseConfig.appId],
];

export default function SettingsPage() {
  const { profile, mode, logout } = useGame();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Ajustes y conexión</h1>
        <p className="text-sm text-white/45">Estado del backend, reloj del mundo y guía de publicación.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Database size={15} /> Backend</span>}
              subtitle={mode === "firebase" ? "Conectado a Firebase" : "Modo local (navegador)"}>
          <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
            firebaseConfigured ? "border-turf-500/30 bg-turf-500/10 text-turf-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
            {firebaseConfigured ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertTriangle size={15} className="mt-0.5" />}
            <span>
              {firebaseConfigured
                ? `Firestore, Auth y Storage activos. Cloud Functions: ${useCloudFunctions ? "activadas" : "desactivadas (escritura por lote con reglas)"}.`
                : "Sin claves de Firebase: los datos se guardan solo en este navegador. Añade las variables de entorno para jugar online."}
            </span>
          </div>
          <ul className="space-y-1.5 text-xs">
            {ENV_VARS.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
                <code className="text-white/60">{k}</code>
                {v ? <CheckCircle2 size={14} className="text-turf-400" /> : <XCircle size={14} className="text-rose-400" />}
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Cloud size={15} /> Reloj del mundo</span>} subtitle="El juego avanza aunque cierres la app">
          <dl className="space-y-2 text-sm">
            {[
              ["Fecha de juego", formatGameDate(gameNow(), { long: true })],
              ["Temporada", seasonIdOf(gameNow())],
              ["Velocidad", `${GAME_CONFIG.gameDaysPerRealDay} días de juego por día real`],
              ["Inicio del mundo", formatGameDate(GAME_CONFIG.gameEpochISO, { long: true })],
              ["Versión", GAME_CONFIG.version],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-white/5 pb-2">
                <dt className="text-white/45">{k}</dt><dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card title="Cómo conectar tu propio Firebase (paso a paso)">
        <ol className="space-y-3 text-sm text-white/60">
          {[
            "Entra en console.firebase.google.com y pulsa «Crear un proyecto». Ponle el nombre que quieras (ej. futbol-manager).",
            "En el menú Compilación → Authentication → Empezar → pestaña «Sign-in method» → activa «Correo electrónico/contraseña».",
            "En Compilación → Firestore Database → Crear base de datos → modo producción → región europe-west (o la más cercana).",
            "En Compilación → Storage → Empezar (mismas reglas por defecto).",
            "Ve a Configuración del proyecto (rueda dentada) → «Tus aplicaciones» → icono web </> → registra la app y copia el objeto firebaseConfig.",
            "En la raíz del proyecto crea un archivo .env con las variables VITE_FIREBASE_* (tienes la plantilla en .env.example).",
            "Copia el contenido de firebase/firestore.rules y firebase/storage.rules en las pestañas «Reglas» de Firestore y Storage y publica.",
            "Opcional (recomendado): despliega las Cloud Functions de firebase/functions y pon VITE_USE_CLOUD_FUNCTIONS=true.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-white/4 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-turf-500 text-xs font-bold text-ink-950">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><GitBranch size={15} /> GitHub</span>}>
          <ol className="space-y-2 text-sm text-white/60">
            <li>1. Crea una cuenta en github.com y un repositorio nuevo (privado o público).</li>
            <li>2. Sube el proyecto: puedes arrastrar la carpeta en «uploading an existing file» o usar GitHub Desktop.</li>
            <li>3. <b>Nunca subas el archivo .env</b> (ya está en .gitignore).</li>
          </ol>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Rocket size={15} /> Netlify</span>}>
          <ol className="space-y-2 text-sm text-white/60">
            <li>1. Entra en netlify.com → «Add new site» → «Import an existing project» → GitHub.</li>
            <li>2. Build command: <code className="rounded bg-white/8 px-1">npm run build</code> · Publish directory: <code className="rounded bg-white/8 px-1">dist</code>.</li>
            <li>3. En «Environment variables» añade las mismas VITE_FIREBASE_*.</li>
            <li>4. Deploy. Cada push a GitHub republica el sitio automáticamente.</li>
            <li>5. En Firebase → Authentication → Settings → «Dominios autorizados», añade tu dominio de Netlify.</li>
          </ol>
        </Card>
      </div>

      <Card title="Cuenta" subtitle={profile?.email}>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => logout()}>Cerrar sesión</Button>
          {mode === "local" && (
            <Button variant="danger" onClick={() => { if (confirm("¿Borrar todos los datos locales? Esta acción no se puede deshacer.")) { localStorage.clear(); location.reload(); } }}>
              <Trash2 size={15} /> Borrar datos locales
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
