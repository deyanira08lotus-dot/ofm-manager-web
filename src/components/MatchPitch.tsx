/**
 * src/components/MatchPitch.tsx
 * Vista visual del campo (FASE 16 — mejora). Dibuja el terreno de juego con
 * los 22 jugadores en el campo según su posición, con un ligero movimiento
 * ambiental, y anima el balón hacia la portería cuando ocurre una ocasión,
 * gol, parada, tarjeta o falta. No cambia el motor de simulación: sólo
 * interpreta los eventos que ya genera `livematch.ts` para dar vida visual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LiveMatchState, LivePlayerState, Side } from "@/game/livematch";
import { onPitchPlayers } from "@/game/livematch";

/** Coordenada X base (0-100) por código de posición, mirando de portería propia (0) a la rival (100). */
const POSITION_X: Record<string, number> = {
  GK: 6, CB: 22, LB: 22, RB: 22, DM: 38, CM: 48, AM: 58, LW: 68, RW: 68, ST: 76,
};
/** Carril preferido (0 = banda izquierda, 1 = banda derecha) para ordenar dentro de una misma línea. */
const LANE: Record<string, number> = {
  GK: 0.5, CB: 0.5, LB: 0.06, RB: 0.94, DM: 0.5, CM: 0.5, AM: 0.5, LW: 0.06, RW: 0.94, ST: 0.5,
};

interface PitchPoint {
  id: string;
  x: number;
  y: number;
  s: LivePlayerState;
}

function layout(state: LiveMatchState, side: Side): PitchPoint[] {
  const players = onPitchPlayers(state, side);
  // Agrupar por profundidad (X), no por código exacto: LB/CB/RB comparten línea
  // defensiva y LW/RW comparten línea de ataque — si se agrupan por código,
  // dos jugadores de códigos distintos pero misma X (p. ej. un único LB y un
  // único RB) caen ambos en el centro (y=50) y quedan uno encima del otro.
  const groups = new Map<number, LivePlayerState[]>();
  for (const p of players) {
    const baseX = POSITION_X[p.player.position] ?? 50;
    if (!groups.has(baseX)) groups.set(baseX, []);
    groups.get(baseX)!.push(p);
  }
  const flip = side === "away";
  const points: PitchPoint[] = [];
  for (const [baseX, list] of groups) {
    const sorted = [...list].sort((a, b) => (LANE[a.player.position] ?? 0.5) - (LANE[b.player.position] ?? 0.5));
    const n = sorted.length;
    sorted.forEach((s, i) => {
      const y = n === 1 ? 50 : 10 + i * (80 / (n - 1));
      const x = flip ? 100 - baseX : baseX;
      points.push({ id: s.player.id, x, y, s });
    });
  }
  return points;
}

type BallState = { x: number; y: number; mode: "idle" | "goal" | "save" | "miss" | "card" };

export function MatchPitch({ state }: { state: LiveMatchState }) {
  const homePts = useMemo(() => layout(state, "home"), [state]);
  const awayPts = useMemo(() => layout(state, "away"), [state]);
  const lastEventIdx = useRef(0);
  const [ball, setBall] = useState<BallState>({ x: 50, y: 50, mode: "idle" });
  const [flashSide, setFlashSide] = useState<Side | null>(null);
  const [highlight, setHighlight] = useState<{ id: string | null; type: string } | null>(null);
  const idleTimer = useRef<number | null>(null);

  // Jitter ambiental: pequeños offsets fijos por jugador (estable mientras
  // no cambie el once, para no "saltar" en cada minuto simulado)
  const rosterKey = useMemo(
    () => [...homePts, ...awayPts].map((p) => p.id).sort().join(","),
    [homePts, awayPts]
  );
  const jitter = useMemo(() => {
    const map = new Map<string, { dur: number; delay: number; dx: number; dy: number }>();
    [...homePts, ...awayPts].forEach((p, i) => {
      const seed = (i * 137 + p.id.length * 31) % 100;
      map.set(p.id, {
        dur: 2.4 + (seed % 7) * 0.22,
        delay: (seed % 11) * 0.15,
        dx: ((seed % 5) - 2) * 0.6,
        dy: (((seed * 3) % 5) - 2) * 0.6,
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  useEffect(() => {
    const evts = state.events;
    if (evts.length <= lastEventIdx.current) {
      lastEventIdx.current = evts.length;
      return;
    }
    const latest = evts[evts.length - 1];
    lastEventIdx.current = evts.length;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);

    if (latest.type === "goal" || latest.type === "save" || latest.type === "miss") {
      const attacking = latest.side === "home" || latest.side === "away" ? latest.side : null;
      if (!attacking) return;
      const towardsRight = attacking === "home";
      const goalX = towardsRight ? 96 : 4;
      const goalY = 42 + Math.random() * 16;
      // Fase 1: el balón viaja hacia la portería
      setBall({ x: towardsRight ? 62 : 38, y: 50, mode: "idle" });
      window.setTimeout(() => {
        if (latest.type === "goal") {
          setBall({ x: goalX, y: goalY, mode: "goal" });
          setFlashSide(attacking);
          idleTimer.current = window.setTimeout(() => { setBall({ x: 50, y: 50, mode: "idle" }); setFlashSide(null); }, 1600);
        } else if (latest.type === "save") {
          setBall({ x: towardsRight ? 90 : 10, y: goalY, mode: "save" });
          idleTimer.current = window.setTimeout(() => setBall({ x: towardsRight ? 70 : 30, y: 50, mode: "idle" }), 900);
        } else {
          setBall({ x: towardsRight ? 102 : -2, y: goalY, mode: "miss" });
          idleTimer.current = window.setTimeout(() => setBall({ x: 50, y: 50, mode: "idle" }), 900);
        }
      }, 550);
      return;
    }

    if (latest.type === "card") {
      const pool = latest.side === "home" ? homePts : latest.side === "away" ? awayPts : [];
      const found = pool.find((p) => p.s.player.name === latest.playerName);
      setHighlight({ id: found?.id ?? null, type: latest.text.includes("ROJA") || latest.text.includes("expulsado") ? "red" : "yellow" });
      idleTimer.current = window.setTimeout(() => setHighlight(null), 1800);
      return;
    }
  }, [state.events, homePts, awayPts]);

  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);

  const Dot = ({ p, side }: { p: PitchPoint; side: Side }) => {
    const j = jitter.get(p.id) ?? { dur: 3, delay: 0, dx: 1, dy: 1 };
    const color = state.teams[side].colors.primary;
    const isGk = p.s.player.position === "GK";
    const isHi = highlight?.id === p.id;
    const dotStyle: CSSProperties & { "--dx"?: string; "--dy"?: string } = {
      width: isGk ? 15 : 13, height: isGk ? 15 : 13,
      background: color,
      border: isHi ? `2px solid ${highlight!.type === "red" ? "#ef4444" : "#f5c518"}` : "1.5px solid rgba(255,255,255,0.55)",
      color: "#fff",
      boxShadow: isHi ? `0 0 0 4px ${highlight!.type === "red" ? "rgba(239,68,68,0.35)" : "rgba(245,197,24,0.35)"}` : undefined,
      "--dx": `${j.dx}px`, "--dy": `${j.dy}px`,
      animationDuration: `${j.dur}s`, animationDelay: `${j.delay}s`,
    };
    return (
      <div
        className="absolute flex flex-col items-center"
        style={{
          left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)",
          transition: "left 0.6s ease, top 0.6s ease",
        }}
      >
        <div className="fm-pitch-jitter flex items-center justify-center rounded-full text-[8px] font-black shadow-md" style={dotStyle}>
          {isGk ? "P" : ""}
        </div>
        <span className="mt-0.5 rounded bg-black/45 px-1 text-[7px] font-semibold leading-none text-white/90">
          {p.s.player.position}
        </span>
      </div>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: "100 / 64" }}>
      {/* Césped */}
      <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, #0f4a2c 0 8%, #124f30 8% 16%)" }} />
      {/* Líneas del campo */}
      <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" fill="none">
          <rect x="1" y="1" width="98" height="62" />
          <line x1="50" y1="1" x2="50" y2="63" />
          <circle cx="50" cy="32" r="8" />
          <circle cx="50" cy="32" r="0.6" fill="rgba(255,255,255,0.55)" />
          <rect x="1" y="14" width="14" height="36" />
          <rect x="85" y="14" width="14" height="36" />
          <rect x="1" y="24" width="5" height="16" />
          <rect x="94" y="24" width="5" height="16" />
        </g>
      </svg>

      {flashSide && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: flashSide === "home" ? "radial-gradient(circle at 92% 50%, rgba(16,185,129,0.55), transparent 55%)" : "radial-gradient(circle at 8% 50%, rgba(16,185,129,0.55), transparent 55%)" }}
        />
      )}

      {homePts.map((p) => <Dot key={p.id} p={p} side="home" />)}
      {awayPts.map((p) => <Dot key={p.id} p={p} side="away" />)}

      {/* Balón */}
      <div
        className="absolute rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]"
        style={{
          width: 6, height: 6,
          left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)",
          transition: "left 0.55s cubic-bezier(.3,.7,.4,1), top 0.55s cubic-bezier(.3,.7,.4,1)",
          opacity: ball.mode === "miss" ? 0 : 1,
        }}
      />

      <div className="absolute bottom-1.5 left-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white/80">
        {state.teams.home.short}
      </div>
      <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white/80">
        {state.teams.away.short}
      </div>
    </div>
  );
}
