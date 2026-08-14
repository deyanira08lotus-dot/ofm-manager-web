/**
 * src/pages/SquadPage.tsx — plantilla completa con filtros, orden y vistas responsive.
 */
import { useMemo, useState } from "react";
import { ArrowDownUp, Filter, Search } from "lucide-react";
import { Badge, Bar, Card, Rating, Select } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { CLASS_STYLE, money, ratingColor } from "@/game/format";
import { countryFlag } from "@/game/data/countries";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GROUP_COLORS, POSITION_MAP } from "@/game/data/traits";
import { navigate } from "@/lib/router";
import type { Player } from "@/types";

type SortKey = "overall" | "potential" | "age" | "value" | "wage" | "form" | "morale" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "overall", label: "Nivel actual" },
  { key: "potential", label: "Potencial" },
  { key: "age", label: "Edad" },
  { key: "value", label: "Valor" },
  { key: "wage", label: "Salario" },
  { key: "form", label: "Forma" },
  { key: "morale", label: "Moral" },
  { key: "name", label: "Nombre" },
];

export default function SquadPage() {
  const { players, club } = useGame();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("overall");
  const [asc, setAsc] = useState(false);

  const list = useMemo(() => {
    let out = players.filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.position.toLowerCase().includes(q.toLowerCase());
      const matchG = group === "ALL" || POSITION_MAP[p.position].group === group;
      return matchQ && matchG;
    });
    out = [...out].sort((a, b) => {
      const get = (p: Player) =>
        sort === "wage" ? p.contract.wage : sort === "name" ? p.name : (p[sort as keyof Player] as number);
      const va = get(a);
      const vb = get(b);
      if (typeof va === "string" && typeof vb === "string") return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return out;
  }, [players, q, group, sort, asc]);

  const totals = useMemo(() => ({
    wages: players.reduce((s, p) => s + p.contract.wage, 0),
    value: players.reduce((s, p) => s + p.value, 0),
  }), [players]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Plantilla</h1>
          <p className="text-sm text-white/45">
            {players.length} jugadores · Valor {money(totals.value)} · Salarios {money(totals.wages)}/sem
            {club && ` · Tope ${money(club.finances.wageBudget)}`}
          </p>
        </div>
      </header>

      {/* Filtros */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar jugador o posición..."
              className="w-full rounded-xl border border-white/10 bg-ink-900/80 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-turf-500/60"
            />
          </label>
          <Select value={group} onChange={(e) => setGroup(e.target.value)} className="sm:w-40">
            <option value="ALL">Todas las líneas</option>
            <option value="POR">Porteros</option>
            <option value="DEF">Defensas</option>
            <option value="MED">Centrocampistas</option>
            <option value="DEL">Delanteros</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="sm:w-44">
            {SORTS.map((s) => <option key={s.key} value={s.key}>Ordenar: {s.label}</option>)}
          </Select>
          <button onClick={() => setAsc((v) => !v)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-white/60 hover:bg-white/5">
            <ArrowDownUp size={15} /> {asc ? "Asc" : "Desc"}
          </button>
        </div>
      </Card>

      {/* Tabla PC */}
      <Card dense className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-[11px] uppercase tracking-wider text-white/35">
                <th className="px-4 py-3 text-left">Jugador</th>
                <th className="px-2 py-3 text-left">Pos.</th>
                <th className="px-2 py-3 text-center">Edad</th>
                <th className="px-2 py-3 text-center">Nivel</th>
                <th className="px-2 py-3 text-center">Pot.</th>
                <th className="px-2 py-3 text-left">Forma</th>
                <th className="px-2 py-3 text-left">Moral</th>
                <th className="px-2 py-3 text-left">Físico</th>
                <th className="px-2 py-3 text-left">Estilo</th>
                <th className="px-2 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Salario</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                    className="cursor-pointer border-b border-white/4 transition hover:bg-white/4">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar seed={p.seed} nationality={p.nationality} age={p.age} clubColors={club?.colors} size={30} className="rounded-lg shrink-0" />
                      <span>{countryFlag(p.nationality)}</span>
                      <span className="font-medium">{p.name}</span>
                      {p.squadRole === "Estrella" && <span className="text-[10px] text-amber-300">★</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-white/60">{p.age}</td>
                  <td className="px-2 py-2.5 text-center"><span className={`font-bold ${ratingColor(p.overall)}`}>{p.overall}</span></td>
                  <td className="px-2 py-2.5 text-center">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${CLASS_STYLE[p.potentialClass]}`}>{p.potentialClass}</span>
                  </td>
                  <td className="px-2 py-2.5"><Bar value={p.form} className="w-16" /></td>
                  <td className="px-2 py-2.5"><Bar value={p.morale} className="w-16" /></td>
                  <td className="px-2 py-2.5"><Bar value={p.fitness} className="w-16" /></td>
                  <td className="px-2 py-2.5 text-xs text-white/45">{p.playStyle}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{money(p.value)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white/60">{money(p.contract.wage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tarjetas móvil */}
      <div className="space-y-2.5 lg:hidden">
        {list.map((p) => (
          <button key={p.id} onClick={() => navigate(`/jugador/${p.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-ink-850/70 p-3 text-left active:scale-[0.99]">
            <PlayerAvatar seed={p.seed} nationality={p.nationality} age={p.age} clubColors={club?.colors} size={46} className="rounded-xl shrink-0" />
            <Rating value={p.overall} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{countryFlag(p.nationality)} {p.name}</span>
                <span className={`rounded px-1 text-[9px] font-black ${CLASS_STYLE[p.potentialClass]}`}>{p.potentialClass}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/45">
                <Badge className={GROUP_COLORS[POSITION_MAP[p.position].group]}>{POSITION_MAP[p.position].short}</Badge>
                <span>{p.age} años</span>
                <span>·</span>
                <span className="truncate">{p.playStyle}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <div><p className="text-[9px] uppercase text-white/25">Forma</p><Bar value={p.form} /></div>
                <div><p className="text-[9px] uppercase text-white/25">Moral</p><Bar value={p.morale} /></div>
                <div><p className="text-[9px] uppercase text-white/25">Físico</p><Bar value={p.fitness} /></div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold tabular-nums">{money(p.value)}</p>
              <p className="text-[10px] text-white/35">{money(p.contract.wage)}/s</p>
            </div>
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-white/40">
          <Filter className="mx-auto mb-2 opacity-40" /> Ningún jugador coincide con el filtro.
        </div>
      )}
    </div>
  );
}
