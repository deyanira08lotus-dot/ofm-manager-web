/**
 * src/game/avatar.ts
 * Generación procedural y determinista del retrato de cada jugador.
 *
 * A partir del `seed` único del jugador (y su nacionalidad y edad, para dar
 * variedad de rasgos físicos coherente con la región) se derivan todos los
 * parámetros visuales de su rostro. El mismo seed produce siempre el mismo
 * resultado → cada jugador conserva su cara para siempre, sin necesidad de
 * guardar nada extra en Firestore.
 *
 * 100% vectorial (se dibuja como SVG en <PlayerAvatar/>). No se usa ninguna
 * fotografía real ni contenido con licencia: son rasgos combinados al azar,
 * igual que el nombre o las estadísticas del jugador.
 */
import { Rng } from "./rng";

export type HairStyle =
  | "buzz" | "short" | "wavy" | "curly" | "afro" | "long" | "manBun" | "bald" | "mohawk" | "curtain";
export type FacialHair = "none" | "stubble" | "goatee" | "mustache" | "beard" | "fullBeard";
export type EyeColor = "brown" | "darkBrown" | "hazel" | "green" | "blue" | "gray";

export interface PlayerAppearance {
  skin: string;
  hairColor: string;
  hairStyle: HairStyle;
  facialHair: FacialHair;
  eyeColor: EyeColor;
  eyebrow: number;
  faceWidth: number;
  faceLength: number;
  earSize: number;
  noseSize: number;
  mouthCurve: number;
  cheekbone: number;
  freckles: boolean;
  scar: boolean;
  earring: boolean;
  bg: [string, string];
}

/**
 * Paleta de piel por país: cada uno pondera un RANGO de tonos (no un único
 * color), reflejando la diversidad real de cada región. Los rangos se
 * superponen a propósito entre todos los países: nadie queda reducido a un
 * único "aspecto nacional".
 */
const SKIN_PALETTE: Record<string, [string, number][]> = {
  default: [
    ["#ffe0bd", 8], ["#f1c27d", 14], ["#e0ac69", 16], ["#c68642", 18],
    ["#a86b3c", 16], ["#8d5524", 14], ["#6b4226", 10], ["#4a2c17", 6],
  ],
  NGA: [["#c68642", 8], ["#a86b3c", 16], ["#8d5524", 22], ["#6b4226", 26], ["#4a2c17", 18], ["#3a2013", 10]],
  BRA: [["#ffe0bd", 8], ["#f1c27d", 14], ["#e0ac69", 18], ["#c68642", 20], ["#a86b3c", 16], ["#8d5524", 14], ["#6b4226", 10]],
  ARG: [["#ffe0bd", 14], ["#f1c27d", 22], ["#e0ac69", 24], ["#c68642", 18], ["#a86b3c", 14], ["#8d5524", 8]],
  CHI: [["#ffe0bd", 10], ["#f1c27d", 20], ["#e0ac69", 26], ["#c68642", 22], ["#a86b3c", 14], ["#8d5524", 8]],
  MEX: [["#f1c27d", 10], ["#e0ac69", 22], ["#c68642", 26], ["#a86b3c", 22], ["#8d5524", 14], ["#6b4226", 6]],
  ESP: [["#ffe0bd", 16], ["#f1c27d", 26], ["#e0ac69", 24], ["#c68642", 18], ["#a86b3c", 10], ["#8d5524", 6]],
  POR: [["#ffe0bd", 14], ["#f1c27d", 24], ["#e0ac69", 24], ["#c68642", 20], ["#a86b3c", 12], ["#8d5524", 6]],
  ENG: [["#ffe0bd", 30], ["#f1c27d", 30], ["#e0ac69", 20], ["#c68642", 12], ["#a86b3c", 6], ["#8d5524", 2]],
  FRA: [["#ffe0bd", 24], ["#f1c27d", 26], ["#e0ac69", 18], ["#c68642", 14], ["#a86b3c", 10], ["#8d5524", 8]],
  GER: [["#ffe0bd", 34], ["#f1c27d", 30], ["#e0ac69", 18], ["#c68642", 10], ["#a86b3c", 6], ["#8d5524", 2]],
  ITA: [["#ffe0bd", 22], ["#f1c27d", 30], ["#e0ac69", 24], ["#c68642", 14], ["#a86b3c", 8], ["#8d5524", 2]],
  NED: [["#ffe0bd", 36], ["#f1c27d", 30], ["#e0ac69", 16], ["#c68642", 10], ["#a86b3c", 6], ["#8d5524", 2]],
  JPN: [["#ffe6c9", 26], ["#f5d5a8", 30], ["#e8c391", 26], ["#d4a86a", 14], ["#c68642", 4]],
};

const HAIR_PALETTE: [string, number][] = [
  ["#0a0a0a", 30], ["#241a12", 22], ["#3d2314", 16], ["#5a3a22", 12],
  ["#7a4a24", 8], ["#9c6b3a", 6], ["#c99a5b", 4], ["#8b8b8b", 2],
];
const HAIR_PALETTE_NORDIC: [string, number][] = [
  ["#241a12", 18], ["#3d2314", 18], ["#5a3a22", 18], ["#7a4a24", 16],
  ["#9c6b3a", 12], ["#c99a5b", 10], ["#e8c86a", 6], ["#0a0a0a", 2],
];

const EYE_WEIGHTS_DEFAULT: [EyeColor, number][] = [
  ["darkBrown", 40], ["brown", 34], ["hazel", 14], ["green", 6], ["blue", 4], ["gray", 2],
];
const EYE_WEIGHTS_NORDIC: [EyeColor, number][] = [
  ["blue", 30], ["gray", 16], ["green", 16], ["hazel", 16], ["brown", 16], ["darkBrown", 6],
];

/** Países con algo más de peso hacia tonos de piel/ojo/pelo más claros, sin excluir el resto. */
const LIGHTER_LEANING = new Set(["ENG", "GER", "NED", "FRA"]);
/** Textura de rizo más marcada (genéticamente asociada a la región, con variación individual). */
const COILY_LEANING = new Set(["NGA"]);
const STRAIGHT_LEANING = new Set(["JPN"]);

const ALL_HAIR_STYLES: HairStyle[] = ["buzz", "short", "wavy", "curly", "afro", "long", "manBun", "bald", "mohawk", "curtain"];
const COILY_STYLES: HairStyle[] = ["afro", "buzz", "short", "curly", "bald", "mohawk"];
const STRAIGHT_STYLES: HairStyle[] = ["short", "curtain", "buzz", "long", "bald", "mohawk"];

const BG_PAIRS: [string, string][] = [
  ["#1c3a2e", "#0e2019"], ["#26314f", "#141b30"], ["#3a2130", "#1c1019"],
  ["#2d3730", "#151b16"], ["#33261a", "#160f0a"], ["#1b2a3a", "#0d151f"],
  ["#3a1f1f", "#190c0c"], ["#233a34", "#0f1c19"],
];

/** Genera (de forma determinista) el aspecto físico de un jugador. */
export function generateAppearance(seed: string, nationality: string, age: number): PlayerAppearance {
  const rng = new Rng(`${seed}:face`);
  const skinPool = SKIN_PALETTE[nationality] ?? SKIN_PALETTE.default;
  const lighter = LIGHTER_LEANING.has(nationality);

  let stylePool: HairStyle[] = ALL_HAIR_STYLES;
  if (COILY_LEANING.has(nationality)) stylePool = COILY_STYLES;
  else if (STRAIGHT_LEANING.has(nationality)) stylePool = STRAIGHT_STYLES;

  const baldChance = 0.03 + Math.max(0, age - 27) * 0.012;
  const hairStyle: HairStyle = rng.chance(baldChance) ? "bald" : rng.pick(stylePool);

  const facialPool: FacialHair[] = age < 20
    ? ["none", "none", "none", "stubble"]
    : ["none", "stubble", "stubble", "goatee", "mustache", "beard", "fullBeard"];

  return {
    skin: rng.weighted(skinPool),
    hairColor: rng.weighted(lighter ? HAIR_PALETTE_NORDIC : HAIR_PALETTE),
    hairStyle,
    facialHair: rng.pick(facialPool),
    eyeColor: rng.weighted(lighter ? EYE_WEIGHTS_NORDIC : EYE_WEIGHTS_DEFAULT),
    eyebrow: rng.float(0.35, 1),
    faceWidth: rng.float(0.84, 1.16),
    faceLength: rng.float(0.88, 1.14),
    earSize: rng.float(0.85, 1.2),
    noseSize: rng.float(0.8, 1.25),
    mouthCurve: rng.float(-0.6, 0.9),
    cheekbone: rng.float(0.3, 1),
    freckles: rng.chance(0.1),
    scar: rng.chance(0.06),
    earring: rng.chance(0.15),
    bg: rng.pick(BG_PAIRS),
  };
}
