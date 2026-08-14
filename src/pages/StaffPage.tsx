/**
 * src/pages/StaffPage.tsx — Cuerpo técnico y Centro de Formación (FASE 7).
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, Award, BookOpen, Briefcase, Check, GraduationCap, Loader2, Search,
  TrendingUp, UserMinus, UserPlus, Users2,
} from "lucide-react";
import { Badge, Bar, Button, Card, EmptyState, Modal, Select, StatTile } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { money, ratingColor } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { STAFF_ROLES } from "@/game/data/traits";
import {
  COURSES, courseFor, MAX_CONCURRENT_COURSES, MAX_STAFF, severancePay,
  staffQualityGrade, type StaffCandidate,
} from "@/game/staff";
import { formatGameDate, realTimeUntil } from "@/game/time";

export default function StaffPage() {
  const {
    club, staff, staffMarket, staffEffects,
    hireStaffMember, fireStaffMember, renewStaffMember, enrollStaffCourse,
  } = useGame();

  const [tab, setTab] = useState<"plantilla" | "mercado" | "formacion">("plantilla");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [courseTarget, setCourseTarget] = useState<string | null>(null);
  const [courseKey, setCourseKey] = useState("basico");
  const [confirmFire, setConfirmFire] = useState<string | null>(null);

  const grade = useMemo(() => staffQualityGrade(staffEffects), [staffEffects]);
  const totalWages = useMemo(() => staff.reduce((s, m) => s + m.wage, 0), [staff]);

  if (!club || !staffMarket) {
    return <EmptyState icon={<Users2 />} title="Cuerpo técnico no disponible" text="Recarga la aplicación para inicializar el mercado de técnicos." />;
  }

  const directorsLevel = club.facilities.directors?.level ?? 1;
  const candidates = staffMarket.candidates.filter((c) => roleFilter === "all" || c.roleKey === roleFilter);
  const courseMember = courseTarget ? staff.find((s) => s.id === courseTarget) : null;
  const selectedCourse = COURSES.find((c) => c.key === courseKey)!;
  const preview = courseMember ? courseFor(selectedCourse, directorsLevel, courseMember) : null;

  async function run(key: string, fn: () => Promise<string | null | void>, okText: string) {
    setBusy(key);
    setMsg(null);
    try {
      const err = await fn();
      setMsg(err ? { text: err as string, ok: false } : { text: okText, ok: true });
    } finally { setBusy(null); }
  }

  const EFFECTS: { label: string; value: number; unit: string; hint: string }[] = [
    { label: "Progresión de jugadores", value: staffEffects.trainingBonus, unit: "%", hint: "Entrenador, preparadores ofensivo/defensivo y físico" },
    { label: "Reducción de lesiones", value: staffEffects.injuryReduction, unit: "%", hint: "Médico, fisioterapeuta y preparador físico" },
    { label: "Recuperación física", value: staffEffects.recoveryBonus, unit: "%", hint: "Fisioterapeuta y médico" },
    { label: "Precisión de scouting", value: staffEffects.scoutingBonus, unit: "%", hint: "Ojeador y analista (academia y draft)" },
    { label: "Rendimiento en partido", value: staffEffects.matchBonus, unit: "%", hint: "Entrenador, segundo y analista" },
    { label: "Negociación de fichajes", value: staffEffects.negotiationBonus, unit: "%", hint: "Director deportivo" },
    { label: "Desarrollo de porteros", value: staffEffects.gkBonus, unit: "%", hint: "Entrenador de porteros" },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Cuerpo técnico</h1>
        <p className="text-sm text-white/45">
          Contrata, forma y renueva a tus técnicos. Su nivel afecta a entrenamientos, lesiones, scouting y partidos.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Miembros" value={`${staff.length} / ${MAX_STAFF}`} sub={grade.label} icon={<Users2 size={15} />} tone={grade.tone} />
        <StatTile label="Entrenador principal" value={staffEffects.coachLevel} sub={staff.find((s) => s.role === "Entrenador principal")?.name ?? "Sin cubrir"} icon={<Award size={15} />} />
        <StatTile label="Coste semanal" value={`${money(totalWages)}/sem`} sub={`${staffMarket.coursesCompleted} curso(s) completados`} icon={<Briefcase size={15} />} />
        <StatTile label="Puestos sin cubrir" value={staffEffects.missingRoles.length} sub={staffEffects.missingRoles[0] ?? "Todo cubierto"} tone={staffEffects.missingRoles.length ? "warn" : "good"} icon={<AlertTriangle size={15} />} />
      </div>

      {msg && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${msg.ok ? "border-turf-500/40 bg-turf-500/10 text-turf-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {([
          ["plantilla", `Mi cuerpo técnico (${staff.length})`],
          ["mercado", `Contratar (${staffMarket.candidates.length})`],
          ["formacion", `Formación (${staffMarket.courses.length}/${MAX_CONCURRENT_COURSES})`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    tab === k ? "bg-turf-500 text-[#fff]" : "border border-white/10 text-white/55 hover:bg-white/5"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ---------------------- MI CUERPO TÉCNICO ---------------------- */}
      {tab === "plantilla" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Card dense>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="px-4 py-3 text-left">Cargo</th>
                    <th className="px-2 py-3 text-left">Nombre</th>
                    <th className="px-2 py-3 text-center">Nivel</th>
                    <th className="px-2 py-3 text-center">Pot.</th>
                    <th className="px-2 py-3 text-right">Ficha</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((m) => {
                    const inCourse = staffMarket.courses.find((c) => c.staffId === m.id);
                    return (
                      <tr key={m.id} className="border-b border-white/4">
                        <td className="px-4 py-2">
                          <span className="font-medium">{m.role}</span>
                          <span className="block text-[10px] text-white/35">{m.specialities.join(", ")}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-white/70">{countryFlag(m.nationality)} {m.name}</span>
                          <span className="block text-[10px] text-white/35">{m.age} años · {m.personality}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`font-bold ${ratingColor(m.level)}`}>{m.level}</span>
                          <Bar value={m.level} className="mx-auto mt-1 w-12" />
                        </td>
                        <td className="px-2 py-2 text-center text-white/50">{m.potential}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(m.wage)}
                          <span className="block text-[10px] text-white/35">{formatGameDate(m.contractExpires)}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1.5">
                            {inCourse ? (
                              <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-300">
                                <BookOpen size={10} /> {realTimeUntil(inCourse.finishesAt)}
                              </Badge>
                            ) : (
                              <Button size="sm" variant="outline"
                                      onClick={() => { setCourseTarget(m.id); setCourseKey("basico"); }}
                                      disabled={m.level >= m.potential}>
                                <GraduationCap size={12} /> Formar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" disabled={busy === `renew${m.id}`}
                                    onClick={() => run(`renew${m.id}`, () => renewStaffMember(m.id, 3), `${m.name} renueva 3 temporadas.`)}>
                              Renovar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmFire(m.id)}>
                              <UserMinus size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {staffEffects.missingRoles.length > 0 && (
              <p className="border-t border-white/6 px-4 py-3 text-xs text-amber-300">
                <AlertTriangle size={12} className="mr-1 inline" />
                Sin cubrir: {staffEffects.missingRoles.join(", ")}.
              </p>
            )}
          </Card>

          <Card title="Impacto del cuerpo técnico" subtitle={grade.label}>
            <div className="space-y-3">
              {EFFECTS.map((e) => (
                <div key={e.label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-white/50">{e.label}</span>
                    <span className={`font-bold ${e.value > 0 ? "text-emerald-300" : "text-white/35"}`}>
                      +{e.value.toFixed(1)}{e.unit}
                    </span>
                  </div>
                  <Bar value={Math.min(100, e.value * 4)} />
                  <p className="mt-0.5 text-[10px] text-white/30">{e.hint}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------- MERCADO ------------------------- */}
      {tab === "mercado" && (
        <>
          <Card>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Select label="Filtrar por cargo" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">Todos los cargos</option>
                {STAFF_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
              <div className="flex items-end">
                <p className="pb-2.5 text-xs text-white/40">
                  <Search size={12} className="mr-1 inline" />
                  Mercado renovado en {realTimeUntil(new Date(Date.now() + 86400000).toISOString())}
                </p>
              </div>
            </div>
          </Card>

          {candidates.length === 0 ? (
            <EmptyState icon={<UserPlus />} title="Sin candidatos para ese cargo" text="Prueba con otro filtro o espera a la próxima renovación del mercado." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {candidates.map((c: StaffCandidate) => {
                const affordable = club.finances.balance >= c.signingFee;
                const interested = c.interest >= 25;
                return (
                  <Card key={c.id}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl">
                        {countryFlag(c.member.nationality)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{c.member.name}</p>
                        <p className="text-xs text-white/45">{c.member.role} · {c.member.age} años</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.member.specialities.map((s) => (
                            <Badge key={s} className="border-white/10 bg-white/5 text-white/50">{s}</Badge>
                          ))}
                          <Badge className="border-white/10 bg-white/5 text-white/50">{c.member.personality}</Badge>
                        </div>
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-bold ${ratingColor(c.member.level)}`}>
                        {c.member.level}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-white/45">Nivel / Potencial</span>
                          <span className="font-semibold">{c.member.level} → {c.member.potential}</span>
                        </div>
                        <Bar value={c.member.level} />
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-white/45">Interés en tu proyecto</span>
                          <span className={`font-semibold ${interested ? "" : "text-rose-300"}`}>{c.interest}%</span>
                        </div>
                        <Bar value={c.interest} />
                      </div>
                    </div>

                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between"><dt className="text-white/40">Ficha semanal</dt><dd className="font-semibold">{money(c.member.wage)}</dd></div>
                      <div className="flex justify-between"><dt className="text-white/40">Prima de contratación</dt><dd className={`font-semibold ${affordable ? "" : "text-rose-300"}`}>{money(c.signingFee)}</dd></div>
                      <div className="flex justify-between"><dt className="text-white/40">Experiencia</dt><dd className="font-semibold">{c.member.experience}/99</dd></div>
                    </dl>

                    <Button className="mt-3 w-full" size="sm"
                            disabled={!affordable || !interested || staff.length >= MAX_STAFF || busy === c.id}
                            onClick={() => run(c.id, () => hireStaffMember(c.id), `${c.member.name} se incorpora al cuerpo técnico.`)}>
                      {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                      {!interested ? "No interesado" : !affordable ? "Saldo insuficiente" : `Contratar por ${money(c.signingFee)}`}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ------------------------ FORMACIÓN ------------------------ */}
      {tab === "formacion" && (
        <div className="space-y-5">
          <Card title="Centro de Formación de Directores" subtitle={`Nivel ${directorsLevel} / 10`}>
            <p className="text-sm text-white/50">
              Cada nivel del centro aumenta la ganancia de los cursos (+16% por nivel), abarata el coste (-5%) y acorta
              la duración (-4,5%). Puedes tener {MAX_CONCURRENT_COURSES} cursos simultáneos.
            </p>
            <div className="mt-3"><Bar value={(directorsLevel / 10) * 100} /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {COURSES.map((c) => {
                const sample = courseFor(c, directorsLevel, { level: 50, potential: 99 } as never);
                return (
                  <div key={c.key} className="rounded-xl border border-white/8 bg-ink-900/50 p-3">
                    <p className="text-sm font-bold">{c.label}</p>
                    <p className="mt-0.5 text-[11px] text-white/40">{c.desc}</p>
                    <dl className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between"><dt className="text-white/40">Ganancia</dt><dd className="font-semibold text-emerald-300">+{sample.gain} niveles</dd></div>
                      <div className="flex justify-between"><dt className="text-white/40">Coste</dt><dd className="font-semibold">{money(sample.cost)}</dd></div>
                      <div className="flex justify-between"><dt className="text-white/40">Duración</dt><dd className="font-semibold">{sample.days} días</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Cursos en marcha" subtitle={`${staffMarket.courses.length} de ${MAX_CONCURRENT_COURSES}`}>
            {staffMarket.courses.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">
                Ningún técnico en formación. Ve a «Mi cuerpo técnico» y pulsa <b>Formar</b>.
              </p>
            ) : (
              <div className="space-y-2">
                {staffMarket.courses.map((c) => (
                  <div key={c.staffId} className="flex items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/8 p-3">
                    <BookOpen size={18} className="text-sky-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.staffName}</p>
                      <p className="text-xs text-white/45">{c.courseLabel} · +{c.gain} niveles al terminar</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold text-sky-300">{realTimeUntil(c.finishesAt)}</p>
                      <p className="text-white/35">{formatGameDate(c.finishesAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/35">
              <TrendingUp size={12} className="mt-0.5 shrink-0" />
              Los cursos continúan aunque cierres la aplicación: al volver, el técnico ya habrá subido de nivel.
            </p>
          </Card>
        </div>
      )}

      {/* --------------------- MODAL CURSO --------------------- */}
      <Modal open={!!courseTarget} onClose={() => setCourseTarget(null)} title="Inscribir en un curso">
        {courseMember && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg font-bold ${ratingColor(courseMember.level)}`}>
                {courseMember.level}
              </div>
              <div>
                <p className="font-bold">{courseMember.name}</p>
                <p className="text-xs text-white/45">{courseMember.role} · Techo {courseMember.potential} (margen {preview.room})</p>
              </div>
            </div>

            <Select label="Tipo de curso" value={courseKey} onChange={(e) => setCourseKey(e.target.value)}>
              {COURSES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Ganancia</p>
                <p className="font-bold text-emerald-300">+{preview.gain}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Coste</p>
                <p className="font-bold">{money(preview.cost)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] uppercase text-white/35">Duración</p>
                <p className="font-bold">{preview.days} d</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy === "course" || preview.gain <= 0}
                      onClick={() => run("course", async () => {
                        const err = await enrollStaffCourse(courseMember.id, courseKey);
                        if (!err) setCourseTarget(null);
                        return err;
                      }, `${courseMember.name} comienza el ${selectedCourse.label.toLowerCase()}.`)}>
                {busy === "course" ? <Loader2 size={15} className="animate-spin" /> : <GraduationCap size={15} />} Inscribir
              </Button>
              <Button variant="outline" onClick={() => setCourseTarget(null)}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* --------------------- MODAL DESPIDO --------------------- */}
      <Modal open={!!confirmFire} onClose={() => setConfirmFire(null)} title="Despedir técnico">
        {confirmFire && (() => {
          const m = staff.find((s) => s.id === confirmFire)!;
          return (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                ¿Seguro que quieres despedir a <b className="text-white/90">{m.name}</b> ({m.role})?
              </p>
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                Indemnización: <b>{money(severancePay(m))}</b> (medio año de ficha).
              </p>
              <div className="flex gap-2">
                <Button variant="danger" className="flex-1" disabled={busy === "fire"}
                        onClick={() => run("fire", async () => {
                          const err = await fireStaffMember(m.id);
                          if (!err) setConfirmFire(null);
                          return err;
                        }, `${m.name} deja el club.`)}>
                  {busy === "fire" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar despido
                </Button>
                <Button variant="outline" onClick={() => setConfirmFire(null)}>Cancelar</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <p className="pb-2 text-center text-[11px] text-white/25">
        {STAFF_ROLES.length} cargos disponibles · Personal ficticio generado proceduralmente
      </p>
    </div>
  );
}
