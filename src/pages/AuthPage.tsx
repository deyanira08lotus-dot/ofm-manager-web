/**
 * src/pages/AuthPage.tsx — registro / inicio de sesión (Firebase Auth o modo local).
 */
import { useState } from "react";
import { Loader2, Lock, Mail, ShieldCheck, Trophy, User } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { isLocalMode } from "@/services/backend";

export default function AuthPage() {
  const { signIn, signUp } = useGame();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [managerName, setManagerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === "login") await signIn(email.trim(), password);
      else {
        if (managerName.trim().length < 3) throw new Error("El nombre de manager debe tener al menos 3 caracteres.");
        if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        await signUp(email.trim(), password, managerName.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setError(
        msg.includes("auth/invalid-credential") ? "Email o contraseña incorrectos." :
        msg.includes("auth/email-already-in-use") ? "Ese email ya está registrado." :
        msg.includes("auth/weak-password") ? "Contraseña demasiado débil (mínimo 6 caracteres)." :
        msg.includes("auth/invalid-email") ? "Email no válido." : msg
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/8 p-10 lg:flex">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage:
            "radial-gradient(600px 300px at 20% 20%, rgba(16,185,129,0.35), transparent 60%), radial-gradient(500px 400px at 80% 70%, rgba(56,189,248,0.25), transparent 60%)",
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-turf-500 text-xl font-black text-[#fff] shadow-md">⚽</div>
            <div>
              <h1 className="text-xl font-black tracking-tight">GESTOR PRO</h1>
              <p className="text-xs uppercase tracking-[0.2em] text-turf-300/80">Fútbol Manager Online</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h2 className="max-w-md text-4xl font-black leading-tight">
            Crea tu club. Desarrolla leyendas. <span className="text-turf-400">Domina la liga.</span>
          </h2>
          <ul className="space-y-3 text-sm text-white/60">
            {[
              "Plantillas generadas proceduralmente: jugadores 100% ficticios",
              "El mundo avanza aunque estés desconectado",
              "Academia mensual, draft bimensual y mercado global",
              "Datos persistentes y protegidos en Firebase",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <ShieldCheck size={16} className="mt-0.5 text-turf-400" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/30">
          Todos los jugadores, clubes y competiciones son ficticios. No se utilizan bases de datos reales con licencia.
        </p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-turf-500 text-lg font-black text-[#fff] shadow-md">⚽</div>
            <div>
              <h1 className="text-lg font-black">GESTOR PRO</h1>
              <p className="text-[11px] uppercase tracking-widest text-turf-300/80">Fútbol Manager Online</p>
            </div>
          </div>

          <Card className="fm-pop">
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-900 p-1">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(null); }}
                  className={`rounded-lg py-2 text-sm font-semibold transition ${tab === t ? "bg-turf-500 text-ink-950" : "text-white/50 hover:text-white"}`}
                >
                  {t === "login" ? "Entrar" : "Crear cuenta"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {tab === "register" && (
                <Input
                  label="Nombre de manager"
                  placeholder="Ej. Marco Duarte"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  required
                />
              )}
              <Input label="Email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Contraseña" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

              {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : tab === "login" ? <Lock size={16} /> : <User size={16} />}
                {tab === "login" ? "Iniciar sesión" : "Crear cuenta y club"}
              </Button>
            </form>

            <div className="mt-5 space-y-2 text-xs text-white/40">
              <p className="flex items-start gap-2"><Mail size={13} className="mt-0.5" /> Autenticación con email y contraseña ({isLocalMode ? "modo local" : "Firebase Auth"}).</p>
              <p className="flex items-start gap-2"><Trophy size={13} className="mt-0.5" /> Tras registrarte podrás fundar tu club y recibir 22 jugadores.</p>
            </div>
          </Card>

          {isLocalMode && (
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90">
              <b>Modo local activo:</b> aún no has configurado las claves de Firebase, así que los datos se guardan en este
              navegador. Añade las variables <code>VITE_FIREBASE_*</code> (ver pestaña Ajustes) para jugar online.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
