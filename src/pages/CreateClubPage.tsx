/**
 * src/pages/CreateClubPage.tsx — fundación del club (paso previo al juego).
 */
import { useMemo, useState } from "react";
import { Check, Loader2, Shield, Sparkles } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { COUNTRIES } from "@/game/data/countries";
import { GAME_CONFIG } from "@/game/config";
import { money } from "@/game/format";
import { navigate } from "@/lib/router";

const CLUB_PREFIX = ["Atlético", "Real", "Sporting", "Unión", "Racing", "Deportivo", "Club", "FC"];
const CLUB_CORE = ["Valmar", "Ríos", "Aurora", "Montenegro", "Bahía", "Ferrolán", "Nordeste", "Castilar", "Verdal", "Oriente", "Peñalba", "Alborada"];

export default function CreateClubPage() {
  const { createClub, profile, loadingClub } = useGame();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [country, setCountry] = useState("ESP");
  const [preset, setPreset] = useState("estandar");
  const [primary, setPrimary] = useState("#10b981");
  const [secondary, setSecondary] = useState("#0ea5e9");
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () => `${CLUB_PREFIX[Math.floor(Math.random() * CLUB_PREFIX.length)]} ${CLUB_CORE[Math.floor(Math.random() * CLUB_CORE.length)]}`,
    []
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clubName = name.trim() || suggestion;
    if (clubName.length < 3) return setError("El nombre del club debe tener al menos 3 caracteres.");
    try {
      await createClub({
        clubName,
        shortName: (shortName.trim() || clubName.replace(/[^A-Za-zÁÉÍÓÚÑ]/g, "").slice(0, 3)).toUpperCase(),
        country,
        colors: { primary, secondary },
        presetKey: preset,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el club");
    }
  }

  const selected = GAME_CONFIG.budgetPresets.find((p) => p.key === preset)!;
  const league = COUNTRIES.find((c) => c.code === country)!;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-24">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-turf-400">Paso final</p>
        <h1 className="mt-1 text-3xl font-black">Funda tu club, {profile?.managerName}</h1>
        <p className="mt-1 text-sm text-white/45">
          Recibirás {GAME_CONFIG.squad.initialSize} jugadores de {GAME_CONFIG.squad.minAge}-{GAME_CONFIG.squad.maxAge} años,
          estadio, instalaciones, cuerpo técnico y presupuesto inicial.
        </p>
      </header>

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Identidad del club">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre del club" placeholder={suggestion} value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Abreviatura (3-4 letras)" placeholder="AVM" maxLength={4} value={shortName} onChange={(e) => setShortName(e.target.value)} />
              <Select label="País / liga" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name} — {c.leagueName}</option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Color 1</span>
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-ink-900" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Color 2</span>
                  <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-ink-900" />
                </label>
              </div>
            </div>
          </Card>

          <Card title="Proyecto deportivo" subtitle="Define el dinero inicial, la reputación y la exigencia">
            <div className="grid gap-3 sm:grid-cols-3">
              {GAME_CONFIG.budgetPresets.map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    preset === p.key ? "border-turf-500/60 bg-turf-500/10" : "border-white/10 bg-ink-900/60 hover:border-white/25"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{p.label}</span>
                    {preset === p.key && <Check size={16} className="text-turf-400" />}
                  </div>
                  <p className="mt-1 text-lg font-black text-turf-300">{money(p.balance)}</p>
                  <p className="mt-1 text-xs text-white/40">{p.desc}</p>
                  <div className="mt-2 space-y-0.5 text-[11px] text-white/50">
                    <p>Salarios: {money(p.wageBudget)}/sem</p>
                    <p>Aforo: {p.stadiumCapacity.toLocaleString("es-ES")}</p>
                    <p>Nivel plantilla ≈ {p.quality}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Vista previa">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl text-lg font-black text-[#fff] shadow-md"
                   style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                {(shortName || name || suggestion).slice(0, 3).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{name || suggestion}</p>
                <p className="text-sm text-white/45">{league.flag} {league.leagueName}</p>
                <p className="text-xs text-white/35">División 2 · Temporada inaugural</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              {[
                ["Saldo inicial", money(selected.balance)],
                ["Tope salarial", `${money(selected.wageBudget)} / semana`],
                ["Reputación", `${selected.reputation}/100`],
                ["Estadio", `${selected.stadiumCapacity.toLocaleString("es-ES")} espectadores`],
                ["Plantilla", `${GAME_CONFIG.squad.initialSize} jugadores`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <dt className="text-white/45">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <p className="flex items-start gap-2 text-xs text-white/45">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-turf-400" />
              Los 22 jugadores se generan proceduralmente con nacionalidades acordes al país de la liga (65% locales),
              potenciales ocultos por clases (SS a D), personalidades y estilos de juego únicos.
            </p>
          </Card>

          {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loadingClub}>
            {loadingClub ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
            {loadingClub ? "Generando club y plantilla..." : "Fundar club"}
          </Button>
        </div>
      </form>
    </div>
  );
}
