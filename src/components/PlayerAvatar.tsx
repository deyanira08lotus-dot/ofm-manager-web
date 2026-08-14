/**
 * src/components/PlayerAvatar.tsx
 * Retrato vectorial único y determinista de cada jugador (100% procedural,
 * sin fotografías reales ni contenido con licencia). El mismo jugador
 * siempre produce el mismo rostro: se deriva de su `seed`, nacionalidad y edad.
 */
import { useMemo, useState } from "react";
import { generateAppearance, type EyeColor, type FacialHair, type HairStyle } from "@/game/avatar";
import { photoUrl } from "@/game/photoPool";

const EYE_COLOR_HEX: Record<EyeColor, string> = {
  brown: "#6b4423",
  darkBrown: "#3b2314",
  hazel: "#7a6a3a",
  green: "#4d7a52",
  blue: "#4a7ab5",
  gray: "#8a95a0",
};

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function Hair({ style, color, cx, cy, rx, ry }: { style: HairStyle; color: string; cx: number; cy: number; rx: number; ry: number }) {
  const top = cy - ry;
  const left = cx - rx;
  const right = cx + rx;
  switch (style) {
    case "bald":
    case "afro": // el afro se dibuja aparte, detrás de la cabeza
      return null;
    case "buzz":
      return <path d={`M ${left + 2} ${cy - ry * 0.15} Q ${cx} ${top - ry * 0.26} ${right - 2} ${cy - ry * 0.15} Q ${right - 1} ${top + ry * 0.24} ${cx} ${top + ry * 0.16} Q ${left + 1} ${top + ry * 0.24} ${left + 2} ${cy - ry * 0.15} Z`} fill={color} />;
    case "short":
      return <path d={`M ${left} ${cy - ry * 0.05} Q ${cx} ${top - ry * 0.34} ${right} ${cy - ry * 0.05} Q ${right + 1} ${top + ry * 0.35} ${cx} ${top + ry * 0.2} Q ${left - 1} ${top + ry * 0.35} ${left} ${cy - ry * 0.05} Z`} fill={color} />;
    case "curtain":
      return (
        <path d={`M ${left - 1} ${cy - ry * 0.1} Q ${cx} ${top - ry * 0.3} ${right + 1} ${cy - ry * 0.1}
                   Q ${right} ${top + ry * 0.45} ${cx + rx * 0.3} ${top + ry * 0.14}
                   Q ${cx} ${top + ry * 0.4} ${cx - rx * 0.3} ${top + ry * 0.14}
                   Q ${left} ${top + ry * 0.45} ${left - 1} ${cy - ry * 0.1} Z`} fill={color} />
      );
    case "wavy":
      return (
        <path d={`M ${left - 2} ${cy} Q ${left - 3} ${top - ry * 0.2} ${cx} ${top - ry * 0.36}
                   Q ${right + 3} ${top - ry * 0.2} ${right + 2} ${cy}
                   Q ${right} ${top + ry * 0.5} ${cx + rx * 0.45} ${top + ry * 0.1}
                   Q ${cx} ${top + ry * 0.42} ${cx - rx * 0.45} ${top + ry * 0.1}
                   Q ${left} ${top + ry * 0.5} ${left - 2} ${cy} Z`} fill={color} />
      );
    case "curly": {
      const bumps = 5;
      let d = `M ${left - 1} ${cy - ry * 0.1} `;
      for (let i = 1; i <= bumps; i++) {
        const t = i / bumps;
        const x = left - 1 + (right - left + 2) * t;
        const yTop = top - ry * 0.1 - (Math.sin(t * Math.PI * 3) * 0.5 + 0.5) * ry * 0.28;
        d += `Q ${x - (right - left) / bumps / 2} ${yTop} ${x} ${cy - ry * 0.1} `;
      }
      d += `Q ${cx} ${top + ry * 0.32} ${left - 1} ${cy - ry * 0.1} Z`;
      return <path d={d} fill={color} />;
    }
    case "long":
      return (
        <>
          <path d={`M ${left - 1} ${cy - ry * 0.1} Q ${cx} ${top - ry * 0.35} ${right + 1} ${cy - ry * 0.1} Q ${right + 2} ${top + ry * 0.3} ${cx} ${top + ry * 0.18} Q ${left - 2} ${top + ry * 0.3} ${left - 1} ${cy - ry * 0.1} Z`} fill={color} />
          <path d={`M ${left - 1} ${cy - ry * 0.05} Q ${left - 6} ${cy + ry * 0.8} ${left + 2} ${cy + ry * 1.3} L ${left + 7} ${cy + ry * 1.22} Q ${left + 3} ${cy + ry * 0.6} ${left + 4} ${cy - ry * 0.05} Z`} fill={color} />
          <path d={`M ${right + 1} ${cy - ry * 0.05} Q ${right + 6} ${cy + ry * 0.8} ${right - 2} ${cy + ry * 1.3} L ${right - 7} ${cy + ry * 1.22} Q ${right - 3} ${cy + ry * 0.6} ${right - 4} ${cy - ry * 0.05} Z`} fill={color} />
        </>
      );
    case "manBun":
      return (
        <>
          <path d={`M ${left} ${cy - ry * 0.05} Q ${cx} ${top - ry * 0.3} ${right} ${cy - ry * 0.05} Q ${right + 1} ${top + ry * 0.3} ${cx} ${top + ry * 0.2} Q ${left - 1} ${top + ry * 0.3} ${left} ${cy - ry * 0.05} Z`} fill={color} />
          <circle cx={cx} cy={top - ry * 0.32} r={rx * 0.22} fill={color} />
        </>
      );
    case "mohawk":
      return <rect x={cx - rx * 0.12} y={top - ry * 0.28} width={rx * 0.24} height={ry * 0.55} rx={rx * 0.12} fill={color} />;
    default:
      return null;
  }
}

function FacialHairShape({ type, color, cx, cy, rx, ry }: { type: FacialHair; color: string; cx: number; cy: number; rx: number; ry: number }) {
  if (type === "none") return null;
  if (type === "stubble") return <ellipse cx={cx} cy={cy + ry * 0.35} rx={rx * 0.62} ry={ry * 0.42} fill={color} opacity={0.16} />;
  if (type === "mustache") {
    return <path d={`M ${cx - rx * 0.26} ${cy + ry * 0.35} Q ${cx} ${cy + ry * 0.44} ${cx + rx * 0.26} ${cy + ry * 0.35} Q ${cx + rx * 0.16} ${cy + ry * 0.3} ${cx} ${cy + ry * 0.32} Q ${cx - rx * 0.16} ${cy + ry * 0.3} ${cx - rx * 0.26} ${cy + ry * 0.35} Z`} fill={color} />;
  }
  if (type === "goatee") {
    return <path d={`M ${cx - rx * 0.2} ${cy + ry * 0.58} Q ${cx} ${cy + ry * 1.0} ${cx + rx * 0.2} ${cy + ry * 0.58} L ${cx + rx * 0.1} ${cy + ry * 0.52} Q ${cx} ${cy + ry * 0.68} ${cx - rx * 0.1} ${cy + ry * 0.52} Z`} fill={color} />;
  }
  const extra = type === "fullBeard" ? 1.12 : 0.88;
  return (
    <path d={`M ${cx - rx * 0.66} ${cy + ry * 0.08} Q ${cx - rx * 0.7} ${cy + ry * 0.85 * extra} ${cx} ${cy + ry * 1.05 * extra}
               Q ${cx + rx * 0.7} ${cy + ry * 0.85 * extra} ${cx + rx * 0.66} ${cy + ry * 0.08}
               Q ${cx + rx * 0.48} ${cy + ry * 0.48} ${cx} ${cy + ry * 0.53}
               Q ${cx - rx * 0.48} ${cy + ry * 0.48} ${cx - rx * 0.66} ${cy + ry * 0.08} Z`} fill={color} opacity={0.9} />
  );
}

export interface PlayerAvatarProps {
  seed: string;
  nationality: string;
  age: number;
  size?: number;
  variant?: "face" | "card";
  clubColors?: { primary: string; secondary: string };
  className?: string;
}

/**
 * Retrato del jugador: usa una foto real del banco (/public/faces) asignada
 * de forma determinista según el `seed`. Si la imagen no carga por algún
 * motivo, cae automáticamente al retrato vectorial como respaldo.
 */
export function PlayerAvatar({ seed, nationality, age, size = 44, variant = "face", clubColors, className = "" }: PlayerAvatarProps) {
  const [broken, setBroken] = useState(false);
  const height = variant === "card" ? Math.round(size * 1.18) : size;

  if (!broken) {
    return (
      <img
        src={photoUrl(seed)}
        width={size}
        height={height}
        onError={() => setBroken(true)}
        loading="lazy"
        decoding="async"
        alt="Retrato del jugador"
        className={`shrink-0 object-cover ${variant === "card" ? "rounded-2xl" : "rounded-lg"} ${className}`}
        style={{
          width: size,
          height,
          boxShadow: clubColors ? `0 0 0 2px ${clubColors.primary}, 0 0 0 3px rgba(0,0,0,0.35)` : undefined,
        }}
      />
    );
  }

  return (
    <VectorAvatar seed={seed} nationality={nationality} age={age} size={size} variant={variant} clubColors={clubColors} className={className} />
  );
}

function VectorAvatar({
  seed,
  nationality,
  age,
  size = 44,
  variant = "face",
  clubColors,
  className,
}: PlayerAvatarProps) {
  const a = useMemo(() => generateAppearance(seed, nationality, age), [seed, nationality, age]);

  const viewH = variant === "card" ? 118 : 100;
  const cx = 50;
  const cy = variant === "card" ? 44 : 50;
  const rx = 20 * a.faceWidth;
  const ry = 24 * a.faceLength;
  const facialHairColor = shade(a.hairColor, -4);
  const primaryC = clubColors?.primary || "#2a3644";
  const secondaryC = clubColors?.secondary || "#182028";
  const gradId = `pa-${seed.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox={`0 0 100 ${viewH}`}
      width={size}
      height={variant === "card" ? Math.round(size * (viewH / 100)) : size}
      className={className}
      role="img"
      aria-label="Retrato del jugador"
    >
      <defs>
        <radialGradient id={gradId} cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor={a.bg[0]} />
          <stop offset="100%" stopColor={a.bg[1]} />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="100" height={viewH} rx="14" fill={`url(#${gradId})`} />

      {variant === "card" && (
        <>
          <path d={`M 16 ${viewH} Q 20 ${cy + ry + 7} 50 ${cy + ry + 5} Q 80 ${cy + ry + 7} 84 ${viewH} Z`} fill={primaryC} />
          <path d={`M 42 ${cy + ry + 3} Q 50 ${cy + ry + 9} 58 ${cy + ry + 3} L 56 ${cy + ry} Q 50 ${cy + ry + 3.5} 44 ${cy + ry} Z`} fill={secondaryC} />
        </>
      )}

      {/* Cuello */}
      <rect x={cx - 6} y={cy + ry * 0.55} width="12" height={ry * 0.5} fill={a.skin} />

      {/* Orejas */}
      <ellipse cx={cx - rx * 1.02} cy={cy + 2} rx={3.2 * a.earSize} ry={4.6 * a.earSize} fill={a.skin} />
      <ellipse cx={cx + rx * 1.02} cy={cy + 2} rx={3.2 * a.earSize} ry={4.6 * a.earSize} fill={a.skin} />
      {a.earring && <circle cx={cx + rx * 1.02} cy={cy + 6.5} r={1.1} fill="#e8c250" />}

      {/* Halo de afro, detrás de la cabeza */}
      {a.hairStyle === "afro" && <ellipse cx={cx} cy={cy - ry * 0.05} rx={rx * 1.32} ry={ry * 1.22} fill={a.hairColor} />}

      {/* Cabeza */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={a.skin} />

      {/* Sombreado suave de mejillas */}
      <ellipse cx={cx - rx * 0.5} cy={cy + ry * 0.28} rx={rx * 0.26 * a.cheekbone} ry={ry * 0.15} fill="#000" opacity={0.05} />
      <ellipse cx={cx + rx * 0.5} cy={cy + ry * 0.28} rx={rx * 0.26 * a.cheekbone} ry={ry * 0.15} fill="#000" opacity={0.05} />

      {a.freckles && (
        <g fill={shade(a.skin, -35)} opacity={0.5}>
          <circle cx={cx - rx * 0.42} cy={cy + ry * 0.18} r={0.55} />
          <circle cx={cx - rx * 0.3} cy={cy + ry * 0.28} r={0.5} />
          <circle cx={cx + rx * 0.42} cy={cy + ry * 0.18} r={0.55} />
          <circle cx={cx + rx * 0.3} cy={cy + ry * 0.28} r={0.5} />
        </g>
      )}

      {/* Cejas */}
      <rect x={cx - rx * 0.55} y={cy - ry * 0.14} width={rx * 0.42} height={1.1 + a.eyebrow * 1.3} rx="1" fill={a.hairColor} transform={`rotate(-6 ${cx - rx * 0.34} ${cy - ry * 0.14})`} />
      <rect x={cx + rx * 0.13} y={cy - ry * 0.14} width={rx * 0.42} height={1.1 + a.eyebrow * 1.3} rx="1" fill={a.hairColor} transform={`rotate(6 ${cx + rx * 0.34} ${cy - ry * 0.14})`} />

      {/* Ojos */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={cx + s * rx * 0.34} cy={cy - ry * 0.02} rx={3.6} ry={2.4} fill="#fff" />
          <circle cx={cx + s * rx * 0.34} cy={cy - ry * 0.02} r={1.7} fill={EYE_COLOR_HEX[a.eyeColor]} />
          <circle cx={cx + s * rx * 0.34} cy={cy - ry * 0.02} r={0.75} fill="#0a0a0a" />
          <circle cx={cx + s * rx * 0.34 - 0.5} cy={cy - ry * 0.02 - 0.6} r={0.4} fill="#fff" />
        </g>
      ))}

      {/* Nariz */}
      <path d={`M ${cx} ${cy - ry * 0.02} L ${cx - 1.1 * a.noseSize} ${cy + ry * 0.22} Q ${cx} ${cy + ry * 0.27} ${cx + 1.1 * a.noseSize} ${cy + ry * 0.22} Z`} fill={shade(a.skin, -12)} opacity={0.55} />

      {/* Boca */}
      <path d={`M ${cx - rx * 0.28} ${cy + ry * 0.42} Q ${cx} ${cy + ry * 0.42 + a.mouthCurve * 3} ${cx + rx * 0.28} ${cy + ry * 0.42}`} fill="none" stroke={shade(a.skin, -55)} strokeWidth="1.4" strokeLinecap="round" />

      {a.scar && <line x1={cx + rx * 0.55} y1={cy - ry * 0.3} x2={cx + rx * 0.35} y2={cy + ry * 0.05} stroke="#d8b8a8" strokeWidth="0.8" opacity={0.7} />}

      <FacialHairShape type={a.facialHair} color={facialHairColor} cx={cx} cy={cy} rx={rx} ry={ry} />
      <Hair style={a.hairStyle} color={a.hairColor} cx={cx} cy={cy} rx={rx} ry={ry} />
    </svg>
  );
}
