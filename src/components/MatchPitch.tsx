/**
 * src/components/MatchPitch.tsx
 * Cancha con secuencia de pases visual antes del remate (el balón pasa
 * entre 2-3 atacantes antes de llegar al arco), balón más grande con
 * apariencia de pelota real y giro sutil, camisetas con color del equipo,
 * y sonido de gol sintetizado. No cambia el motor de simulación.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LiveMatchState, LivePlayerState, Side } from "@/game/livematch";
import { onPitchPlayers } from "@/game/livematch";

type Speed = "slow" | "normal" | "fast";

const SPEED_FACTOR: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.45 };

const POSITION_X: Record<string, number> = {
  GK: 6, CB: 22, LB: 22, RB: 22, DM: 38, CM: 48, AM: 58, LW: 68, RW: 68, ST: 76,
};
const LANE: Record<string, number> = {
  GK: 0.5, CB: 0.5, LB: 0.06, RB: 0.94, DM: 0.5, CM: 0.5, AM: 0.5, LW: 0.06, RW: 0.94, ST: 0.5,
};
const ATTACK_POS = new Set(["ST", "LW", "RW", "AM"]);
const MID_POS = new Set(["CM", "DM", "AM"]);

interface PitchPoint {
  id: string;
  x: number;
  y: number;
  s: LivePlayerState;
}

function layout(state: LiveMatchState, side: Side): PitchPoint[] {
  const players = onPitchPlayers(state, side);
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

type BallState = { x: number; y: number; mode: "idle" | "pass" | "goal" | "save" | "miss" };

type AnimStep =
  | { kind: "surge"; side: Side; ids: string[]; advance: number; duration: number }
  | { kind: "pass"; x: number; y: number; duration: number }
  | { kind: "shot"; side: Side; outcome: "goal" | "save" | "miss"; duration: number }
  | { kind: "settle"; duration: number }
  | { kind: "card"; playerId: string | null; cardType: "red" | "yellow"; duration: number };

function playGoalSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = "sawtooth";
    bass.frequency.value = 110;
    bassGain.gain.setValueAtTime(0.18, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    bass.connect(bassGain).connect(ctx.destination);
    bass.start(now);
    bass.stop(now + 0.5);
    window.setTimeout(() => ctx.close(), 900);
  } catch {
    // Si el navegador bloquea audio sin gesto del usuario, fallamos en silencio.
  }
}

function MatchPitchInner({ state, speed = "normal" }: { state: LiveMatchState; speed?: Speed }) {
  const homePts = useMemo(() => layout(state, "home"), [state]);
  const awayPts = useMemo(() => layout(state, "away"), [state]);
  const lastEventIdx = useRef(0);
  const factor = SPEED_FACTOR[speed];

  const [ball, setBall] = useState<BallState>({ x: 50, y: 50, mode: "idle" });
  const [flashSide, setFlashSide] = useState<Side | null>(null);
  const [highlight, setHighlight] = useState<{ id: string | null; type: string } | null>(null);
  const [surge, setSurge] = useState<Record<string, number>>({});

  const queueRef = useRef<AnimStep[]>([]);
  const processingRef = useRef(false);
  const stepTimer = useRef<number | null>(null);

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

  function playNext() {
    const step = queueRef.current.shift();
    if (!step) {
      processingRef.current = false;
      return;
    }
    processingRef.current = true;
    const dur = Math.max(120, step.duration * factor);

    if (step.kind === "surge") {
      const overrides: Record<string, number> = {};
      step.ids.forEach((id) => { overrides[id] = step.advance; });
      setSurge((prev) => ({ ...prev, ...overrides }));
    } else if (step.kind === "pass") {
      setBall({ x: step.x, y: step.y, mode: "pass" });
    } else if (step.kind === "shot") {
      const towardsRight = step.side === "home";
      const goalX = towardsRight ? 96 : 4;
      const goalY = 42 + Math.random() * 16;
      if (step.outcome === "goal") {
        setBall({ x: goalX, y: goalY, mode: "goal" });
        setFlashSide(step.side);
        playGoalSound();
      } else if (step.outcome === "save") {
        setBall({ x: towardsRight ? 90 : 10, y: goalY, mode: "save" });
      } else {
        setBall({ x: towardsRight ? 102 : -2, y: goalY, mode: "miss" });
      }
    } else if (step.kind === "settle") {
      setBall({ x: 50, y: 50, mode: "idle" });
      setFlashSide(null);
      setSurge({});
    } else if (step.kind === "card") {
      setHighlight({ id: step.playerId, type: step.cardType });
    }

    stepTimer.current = window.setTimeout(() => {
      if (step.kind === "card") setHighlight(null);
      playNext();
    }, dur);
  }

  function enqueue(steps: AnimStep[]) {
    queueRef.current.push(...steps);
    if (!processingRef.current) playNext();
  }

  useEffect(() => {
    const evts = state.events;
    if (evts.length <= lastEventIdx.current) {
      lastEventIdx.current = evts.length;
      return;
    }
    const latest = evts[evts.length - 1];
    lastEventIdx.current = evts.length;

    if (latest.type === "goal" || latest.type === "save" || latest.type === "miss") {
      const attacking = latest.side === "home" || latest.side === "away" ? latest.side : null;
      if (!attacking) return;
      const pool = attacking === "home" ? homePts : awayPts;
      const towardsRight = attacking === "home";

      // Armamos la jugada: 1 mediocampista que arranca + hasta 2 atacantes que reciben,
      // ordenados de menos a más avanzados (para que el pase vaya hacia adelante).
      const buildFrom = (set: Set<string>) =>
        pool.filter((p) => set.has(p.s.player.position))
          .sort((a, b) => (towardsRight ? a.x - b.x : b.x - a.x));

      const mids = buildFrom(MID_POS).slice(0, 1);
      const forwards = buildFrom(ATTACK_POS).slice(0, 2);
      const carriers = [...mids, ...forwards];
      const surgers = carriers.map((p) => p.id);

      const steps: AnimStep[] = [
        { kind: "surge", side: attacking, ids: surgers, advance: 10, duration: 500 },
      ];
      // Pase por cada jugador de la jugada, con la posición YA avanzada (x + advance).
      carriers.forEach((p) => {
        const advancedX = p.x + (towardsRight ? 10 : -10);
        steps.push({ kind: "pass", x: advancedX, y: p.y, duration: 380 });
      });
      steps.push({ kind: "shot", side: attacking, outcome: latest.type, duration: latest.type === "miss" ? 500 : 650 });
      steps.push({ kind: "settle", duration: 500 });

      enqueue(steps);
      return;
    }

    if (latest.type === "card") {
      const pool = latest.side === "home" ? homePts : latest.side === "away" ? awayPts : [];
      const found = pool.find((p) => p.s.player.name === latest.playerName);
      const isRed = latest.text.includes("ROJA") || latest.text.includes("expulsado");
      enqueue([
        { kind: "card", playerId: found?.id ?? null, cardType: isRed ? "red" : "yellow", duration: 1600 },
      ]);
    }
  }, [state.events, homePts, awayPts]);

  useEffect(() => {
    return () => { if (stepTimer.current) window.clearTimeout(stepTimer.current); };
  }, []);

  const Dot = ({ p, side }: { p: PitchPoint; side: Side }) => {
    const j = jitter.get(p.id) ?? { dur: 3, delay: 0, dx: 1, dy: 1 };
    const primary = state.teams[side].colors.primary;
    const secondary = state.teams[side].colors.secondary;
    const isGk = p.s.player.position === "GK";
    const isHi = highlight?.id === p.id;
    const advance = surge[p.id] ?? 0;
    const flip = side === "away";
    const effectiveX = p.x + (flip ? -advance : advance);
    const size = isGk ? 16 : 14;
    const wrapStyle: CSSProperties & { "--dx"?: string; "--dy"?: string } = {
      left: `${effectiveX}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)",
      transition: `left ${0.55 * factor}s ease, top ${0.55 * factor}s ease`,
      "--dx": `${j.dx}px`, "--dy": `${j.dy}px`,
      animationDuration: `${j.dur}s`, animationDelay: `${j.delay}s`,
    };
    return (
      <div className="fm-pitch-jitter absolute flex flex-col items-center" style={wrapStyle}>
        <div
          className="relative flex items-center justify-center shadow-md"
          style={{
            width: size, height: size * 1.05,
            background: primary,
            clipPath: "polygon(30% 0%, 70% 0%, 100% 18%, 82% 30%, 82% 100%, 18% 100%, 18% 30%, 0% 18%)",
            border: isHi ? `2px solid ${highlight!.type === "red" ? "#ef4444" : "#f5c518"}` : `1px solid ${secondary}`,
            boxShadow: isHi ? `0 0 0 4px ${highlight!.type === "red" ? "rgba(239,68,68,0.35)" : "rgba(245,197,24,0.35)"}` : undefined,
          }}
        >
          <span
            className="text-[7px] font-black leading-none"
            style={{ color: secondary === primary ? "#fff" : secondary }}
          >
            {isGk ? "P" : ""}
          </span>
        </div>
        <span className="mt-0.5 rounded bg-black/45 px-1 text-[7px] font-semibold leading-none text-white/90">
          {p.s.player.position}
        </span>
      </div>
    );
  };

  /** Balón grande con parches de pelota real y giro sutil mientras se mueve. */
  const Ball = () => (
    <div
      className="absolute"
      style={{
        width: 14, height: 14,
        left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)",
        transition: `left ${0.38 * factor}s cubic-bezier(.3,.6,.4,1), top ${0.38 * factor}s cubic-bezier(.3,.6,.4,1)`,
        opacity: ball.mode === "miss" ? 0 : 1,
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))",
        animation: ball.mode === "idle" ? undefined : "fm-ball-spin 0.5s linear infinite",
      }}
    >
      <svg viewBox="0 0 32 32" width="14" height="14">
        <circle cx="16" cy="16" r="15" fill="#fafafa" stroke="#111" strokeWidth="1.2" />
        <polygon points="16,6 21.5,10 19.5,17 12.5,17 10.5,10" fill="#111" />
        <polygon points="5,12 10.5,10 12.5,17 8,21.5 3,19.5" fill="#111" opacity="0.92" />
        <polygon points="27,12 21.5,10 19.5,17 24,21.5 29,19.5" fill="#111" opacity="0.92" />
        <polygon points="12,27 8,21.5 12.5,17 19.5,17 24,21.5 20,27" fill="none" stroke="#111" strokeWidth="1" />
        <circle cx="16" cy="16" r="15" fill="url(#fmBallShade)" />
        <defs>
          <radialGradient id="fmBallShade" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: "100 / 64" }}>
      <style>{`@keyframes fm-ball-spin { from { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)) hue-rotate(0deg); } to { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)) hue-rotate(0deg); } }`}</style>
      <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, #0f4a2c 0 8%, #124f30 8% 16%)" }} />
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
          style={{
            background: flashSide === "home"
              ? "radial-gradient(circle at 92% 50%, rgba(16,185,129,0.55), transparent 55%)"
              : "radial-gradient(circle at 8% 50%, rgba(16,185,129,0.55), transparent 55%)",
          }}
        />
      )}

      {homePts.map((p) => <Dot key={p.id} p={p} side="home" />)}
      {awayPts.map((p) => <Dot key={p.id} p={p} side="away" />)}

      <Ball />

      <div className="absolute bottom-1.5 left-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white/80">
        {state.teams.home.short}
      </div>
      <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white/80">
        {state.teams.away.short}
      </div>
    </div>
  );
}

export function MatchPitch(props: { state: LiveMatchState; speed?: Speed }) {
  try {
    return <MatchPitchInner {...props} />;
  } catch (err) {
    return (
      <div className="rounded-2xl border border-red-500 bg-red-950/40 p-3 text-[11px] text-red-200">
        <p className="font-bold">Error al dibujar la cancha:</p>
        <pre className="mt-1 whitespace-pre-wrap break-words">{String(err instanceof Error ? err.stack ?? err.message : err)}</pre>
      </div>
    );
  }
}
