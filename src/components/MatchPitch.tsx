/**
 * src/components/MatchPitch.tsx
 * Cancha con balón estilo pelota real, jugadores tipo "camiseta" con color
 * del equipo, y sonido de gol sintetizado (sin archivos de audio externos).
 * Sigue sin cambiar el motor de simulación: sólo interpreta mejor los
 * eventos que ya genera `livematch.ts`.
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

type BallState = { x: number; y: number; mode: "idle" | "goal" | "save" | "miss" };

type AnimStep =
  | { kind: "surge"; side: Side; ids: string[]; advance: number; duration: number }
  | { kind: "shot"; side: Side; outcome: "goal" | "save" | "miss"; duration: number }
  | { kind: "settle"; duration: number }
  | { kind: "card"; playerId: string | null; cardType: "red" | "yellow"; duration: number };

/** Sonido de gol sintetizado con Web Audio API (sin archivos externos). */
function playGoalSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Pequeño arpegio ascendente "triunfal" + un golpe grave de fondo.
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
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
    const dur = Math.max(150, step.duration * factor);

    if (step.kind === "surge") {
      const overrides: Record<string, number> = {};
      step.ids.forEach((id) => { overrides[id] = step.advance; });
      setSurge(overrides);
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
      const surgers = pool
        .filter((p) => ATTACK_POS.has(p.s.player.position))
        .slice(0, 3)
        .map((p) => p.id);

      enqueue([
        { kind: "surge", side: attacking, ids: surgers, advance: 10, duration: 750 },
        { kind: "shot", side: attacking, outcome: latest.type, duration: latest.type === "miss" ? 550 : 700 },
        { kind: "settle", duration: 550 },
      ]);
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
    const size = isGk ? 15 : 13;
    const wrapStyle: CSSProperties & { "--dx"?: string; "--dy"?: string } = {
      left: `${effectiveX}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)",
      transition: `left ${0.7 * factor}s ease, top ${0.7 * factor}s ease`,
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
            /* Silueta simple de camiseta en vez de un círculo liso */
            clipPath: "polygon(30% 0%, 70% 0%, 100% 18%, 82% 30%, 82% 100%, 18% 100%, 18% 30%, 0% 18%)",
            border: isHi ? `2px solid ${highlight!.type === "red" ? "#ef4444" : "#f5c518"}` : `1px solid ${secondary}`,
            boxShadow: isHi ? `0 0 0 4px ${highlight!.type === "red" ? "rgba(239,68,68,0.35)" : "rgba(245,197,24,0.35)"}` : undefined,
          }}
        >
          <span
            className="text-[6px] font-black leading-none"
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

  /** Balón estilo pelota de fútbol real (SVG con parches), no un punto liso. */
  const Ball = () => (
    <div
      className="absolute"
      style={{
        width: 8, height: 8,
        left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)",
        transition: `left ${0.55 * factor}s cubic-bezier(.3,.7,.4,1), top ${0.55 * factor}s cubic-bezier(.3,.7,.4,1)`,
        opacity: ball.mode === "miss" ? 0 : 1,
        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
      }}
    >
      <svg viewBox="0 0 32 32" width="8" height="8">
        <circle cx="16" cy="16" r="15" fill="#f5f5f5" stroke="#1a1a1a" strokeWidth="1" />
        <polygon points="16,7 21,11 19,17 13,17 11,11" fill="#1a1a1a" />
        <polygon points="6,13 11,11 13,17 9,21 4,19" fill="#1a1a1a" opacity="0.9" />
        <polygon points="26,13 21,11 19,17 23,21 28,19" fill="#1a1a1a" opacity="0.9" />
        <polygon points="12,26 9,21 13,17 19,17 23,21 20,26" fill="none" stroke="#1a1a1a" strokeWidth="0.8" />
      </svg>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: "100 / 64" }}>
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
