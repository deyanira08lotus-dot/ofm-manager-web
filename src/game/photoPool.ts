/**
 * src/game/photoPool.ts
 * Banco de fotos reales de jugadores (generadas por el usuario con IA,
 * ubicadas en /public/faces/face_001.png ... face_100.png).
 *
 * Cada jugador recibe una foto de forma DETERMINISTA a partir de su `seed`:
 * el mismo jugador siempre obtiene la misma foto, sin guardar nada extra en
 * Firestore. Con un banco de 100 fotos, es normal y esperable que jugadores
 * de distintos clubes repitan foto una vez el mundo supera ~100 jugadores
 * (igual que ocurre con los "rostros genéricos" en otros juegos de manager).
 *
 * Para ampliar el banco en el futuro: agregar más imágenes en
 * /public/faces/ siguiendo el mismo patrón de nombre y subir PHOTO_POOL_SIZE.
 */
import { hashSeed } from "./rng";

export const PHOTO_POOL_SIZE = 1300;

export function photoIndexForSeed(seed: string): number {
  const h = hashSeed(`${seed}:photo`);
  return (h % PHOTO_POOL_SIZE) + 1;
}

export function photoUrl(seed: string): string {
  const idx = photoIndexForSeed(seed);
  return `/faces/face_${String(idx).padStart(3, "0")}.png`;
}
