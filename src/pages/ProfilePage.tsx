/**
 * src/pages/ProfilePage.tsx — Perfil del manager, escudo del club y notificaciones (FASE 13).
 */
import { useRef, useState } from "react";
import {
  Award, Bell, BellOff, Camera, Check, ImageUp, Loader2, Medal, Save, Shield, Trash2, TrendingUp, Trophy, User,
} from "lucide-react";
import { Badge, Bar, Button, Card, Input, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, num } from "@/game/format";
import { countryFlag, countryName } from "@/game/data/countries";
import { NOTIF_META, xpForLevel, type ExtendedProfile, type NotifKind } from "@/game/manager";
import { localImage, MAX_UPLOAD_BYTES, uploadImage } from "@/lib/storage";
import { firebaseConfigured } from "@/lib/firebase";
import { formatGameDate } from "@/game/time";

export default function ProfilePage() {
  const {
    club, profile, user, managerStats, notifPrefs, setNotifPrefs, saveProfile, seasonHistory,
  } = useGame();

  const ext = profile as ExtendedProfile | null;
  const [name, setName] = useState(profile?.managerName ?? "");
  const [bio, setBio] = useState(ext?.bio ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [avatar, setAvatar] = useState<string | null>(
    ext?.avatarUrl ?? (user ? localImage("managers", user.uid) : null)
  );
  const [badge, setBadge] = useState<string | null>(
    ext?.clubBadgeUrl ?? (user ? localImage("clubs", user.uid) : null)
  );
  const avatarInput = useRef<HTMLInputElement>(null);
  const badgeInput = useRef<HTMLInputElement>(null);

  if (!club || !profile || !user) return null;

  async function handleUpload(kind: "managers" | "clubs", file: File | undefined) {
    if (!file || !user) return;
    setBusy(kind);
    setMsg(null);
    try {
      const res = await uploadImage(kind, user.uid, file);
      if (kind === "managers") {
        setAvatar(res.url);
        await saveProfile({ avatarUrl: res.url });
      } else {
        setBadge(res.url);
        await saveProfile({ clubBadgeUrl: res.url });
      }
      setMsg({
        text: `Imagen guardada (${Math.round(res.bytes / 1024)} KB${res.local ? ", modo local" : ", Firebase Storage"}).`,
        ok: true,
      });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Error al subir la imagen.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function saveIdentity() {
    setBusy("identity");
    try {
      await saveProfile({ managerName: name.trim() || profile!.managerName, bio: bio.slice(0, 200) });
      setMsg({ text: "Perfil actualizado.", ok: true });
    } finally { setBusy(null); }
  }

  const t = managerStats.totals;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Perfil de manager</h1>
        <p className="text-sm text-white/45">
          Personaliza tu identidad, el escudo del club y qué avisos quieres recibir.
        </p>
      </header>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      {/* Tarjeta de manager */}
      <div className="overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-850 to-ink-900/70 p-5 shadow-[0_6px_18px_-12px_rgba(22,32,46,0.3)]">
        <div className="flex flex-wrap items-center gap-5">
          <button onClick={() => avatarInput.current?.click()}
                  className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-3xl text-white/25"><User size={34} /></span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-slate-900/70 py-1 text-[10px] font-semibold text-[#fff] opacity-0 transition group-hover:opacity-100">
              {busy === "managers" ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />} Cambiar
            </span>
          </button>
          <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                 onChange={(e) => handleUpload("managers", e.target.files?.[0])} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black">{profile.managerName}</h2>
              <Badge className="border-turf-500/40 bg-turf-500/15 text-turf-300">Nivel {managerStats.level}</Badge>
            </div>
            <p className="text-sm text-turf-300">{managerStats.title}</p>
            <p className="mt-0.5 text-xs text-white/45">
              {countryFlag(club.country)} {club.name} · {countryName(club.country)} · desde {formatGameDate(new Date(profile.createdAt).toISOString())}
            </p>
            {ext?.bio && <p className="mt-2 text-sm italic text-white/55">"{ext.bio}"</p>}

            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-[11px] text-white/40">
                <span>Experiencia de manager</span>
                <span>{num(managerStats.xp)} / {num(managerStats.xpForNext)} XP</span>
              </div>
              <Bar value={managerStats.progress * 100} />
              <p className="mt-1 text-[10px] text-white/30">
                Faltan {num(Math.max(0, xpForLevel(managerStats.level + 1) - managerStats.xp))} XP para el nivel {managerStats.level + 1}
              </p>
            </div>
          </div>

          <button onClick={() => badgeInput.current?.click()}
                  className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-black text-[#fff] shadow-md"
                  style={badge ? undefined : { background: `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})` }}>
            {badge ? <img src={badge} alt="Escudo" className="h-full w-full object-cover" /> : club.shortName}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-slate-900/70 py-1 text-[10px] font-semibold opacity-0 transition group-hover:opacity-100">
              {busy === "clubs" ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />} Escudo
            </span>
          </button>
          <input ref={badgeInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                 onChange={(e) => handleUpload("clubs", e.target.files?.[0])} />
        </div>
      </div>

      {/* Estadísticas de carrera */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Partidos dirigidos" value={num(t.matches)} sub={`${managerStats.winRate}% de victorias`} icon={<TrendingUp size={15} />} />
        <StatTile label="Balance" value={`${t.wins}V ${t.draws}E ${t.losses}D`} sub={`${t.seasons} temporada(s)`} />
        <StatTile label="Títulos" value={t.trophies} sub={`${t.achievements} logro(s) desbloqueado(s)`} icon={<Trophy size={15} />} tone={t.trophies ? "good" : "default"} />
        <StatTile label="Cantera y fichajes" value={`${t.graduates} / ${t.signings}`} sub="Canteranos subidos / fichajes" icon={<Medal size={15} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Identidad */}
        <Card title="Identidad" subtitle="Cómo te ven los demás managers">
          <div className="space-y-3">
            <Input label="Nombre de manager" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/45">Biografía</span>
              <textarea value={bio} maxLength={200} rows={3}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Ej. Apuesto por la cantera y el fútbol de posesión."
                        className="w-full resize-none rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-turf-500/60" />
              <span className="mt-1 block text-right text-[10px] text-white/30">{bio.length}/200</span>
            </label>
            <Button className="w-full" onClick={saveIdentity} disabled={busy === "identity"}>
              {busy === "identity" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar perfil
            </Button>
          </div>

          <div className="mt-4 rounded-xl bg-white/4 p-3 text-[11px] text-white/45">
            <p className="flex items-start gap-1.5">
              <ImageUp size={12} className="mt-0.5 shrink-0" />
              Las imágenes se recortan a 256×256 y se comprimen en tu navegador antes de subirlas
              (máximo {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).{" "}
              {firebaseConfigured
                ? "Se almacenan en Firebase Storage, en una carpeta protegida con tu identificador de usuario."
                : "Sin Firebase configurado se guardan en este navegador."}
            </p>
          </div>
        </Card>

        {/* Preferencias de avisos */}
        <Card title={<span className="flex items-center gap-2"><Bell size={15} /> Avisos</span>}
              subtitle="Elige qué notificaciones aparecen en tu panel">
          <div className="space-y-1.5">
            {(Object.keys(NOTIF_META) as NotifKind[]).map((k) => {
              const on = notifPrefs[k];
              return (
                <button key={k} onClick={() => setNotifPrefs({ ...notifPrefs, [k]: !on })}
                        className="flex w-full items-center gap-3 rounded-lg bg-white/4 px-3 py-2 text-left transition hover:bg-white/8">
                  <span className="text-base">{NOTIF_META[k].icon}</span>
                  <span className="min-w-0 flex-1 text-sm">{NOTIF_META[k].label}</span>
                  <span className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${on ? "bg-turf-500" : "bg-white/15"}`}>
                    <span className={`h-4 w-4 rounded-full bg-[#fff] shadow transition ${on ? "translate-x-4" : ""}`} />
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
            <BellOff size={12} /> Desactivar una categoría solo oculta sus avisos del panel: las noticias siguen guardándose.
          </p>
        </Card>
      </div>

      {/* Trayectoria */}
      <Card title={<span className="flex items-center gap-2"><Award size={15} /> Trayectoria</span>}
            subtitle={`${seasonHistory?.seasons.length ?? 0} temporada(s) completadas`}>
        {!seasonHistory || seasonHistory.seasons.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">
            Tu primera temporada está en curso. Al cerrarla aparecerá aquí tu historial completo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {seasonHistory.seasons.map((s) => (
              <li key={s.seasonId} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/4 px-3 py-2 text-sm">
                <Badge className={s.position === 1 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-white/15 bg-white/5 text-white/50"}>
                  {s.seasonId}
                </Badge>
                <span className="font-semibold">{s.position || "—"}º</span>
                <span className="min-w-0 flex-1 truncate text-white/50">
                  {s.won}V {s.drawn}E {s.lost}D · {s.points} pts
                  {s.promoted && " · Ascenso"}{s.relegated && " · Descenso"}
                </span>
                <span className="text-xs text-emerald-300">{money(s.prize)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Cuenta */}
      <Card title="Cuenta" subtitle={profile.email}>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-white/4 px-3 py-2 text-xs">
            <p className="text-white/40">Identificador</p>
            <p className="truncate font-mono text-[11px]">{user.uid}</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2 text-xs">
            <p className="text-white/40">Reputación de manager</p>
            <p className="font-semibold">{Math.round(club.reputation)}/100</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2 text-xs">
            <p className="text-white/40">Almacenamiento</p>
            <p className="font-semibold">{firebaseConfigured ? "Firebase Storage" : "Navegador (local)"}</p>
          </div>
        </div>
        {(avatar || badge) && (
          <Button variant="ghost" className="mt-3" onClick={async () => {
            setAvatar(null); setBadge(null);
            await saveProfile({ avatarUrl: null, clubBadgeUrl: null });
            setMsg({ text: "Imágenes restablecidas.", ok: true });
          }}>
            <Trash2 size={14} /> Quitar imágenes personalizadas
          </Button>
        )}
      </Card>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-white/25">
        <Check size={11} /> Perfil sincronizado con tu cuenta
      </p>
    </div>
  );
}
