/**
 * src/pages/NewsPage.tsx — sala de prensa / notificaciones del club.
 */
import { useState } from "react";
import { Newspaper } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { useGame } from "@/state/GameContext";
import { formatGameDate } from "@/game/time";

const CATS = ["todas", "club", "finanzas", "mercado", "partido", "academia", "draft", "sistema"];

export default function NewsPage() {
  const { news, markNewsRead } = useGame();
  const [cat, setCat] = useState("todas");
  const list = news.filter((n) => cat === "todas" || n.category === cat);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-black">Noticias</h1>
        <p className="text-sm text-white/45">{news.filter((n) => !n.read).length} sin leer</p>
      </header>

      <div className="fm-scroll-x flex gap-2 overflow-x-auto pb-1">
        {CATS.map((c) => (
          <button key={c} onClick={() => setCat(c)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition ${
                    cat === c ? "bg-turf-500 text-ink-950" : "border border-white/10 text-white/50 hover:bg-white/5"}`}>
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Newspaper />} title="Sin noticias" text="Cuando comiencen los partidos, fichajes y eventos de academia, aparecerán aquí." />
      ) : (
        <div className="space-y-3">
          {list.map((n) => (
            <Card key={n.id} className={n.read ? "opacity-70" : ""}>
              <button className="w-full text-left" onClick={() => markNewsRead(n.id)}>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/35">
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{n.category}</span>
                  {formatGameDate(n.date, { long: true })}
                  {!n.read && <span className="rounded bg-turf-500/20 px-1.5 py-0.5 text-turf-300">nuevo</span>}
                  {n.important && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">destacado</span>}
                </div>
                <h2 className="mt-1.5 text-base font-bold">{n.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-white/55">{n.body}</p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
