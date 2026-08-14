/**
 * src/lib/storage.ts
 * FIREBASE STORAGE (FASE 13).
 * Subida de escudos de club y avatares de manager.
 *
 * - Redimensiona y comprime en el navegador ANTES de subir (ahorra cuota y
 *   hace que la app cargue rápido en móvil).
 * - Con Firebase configurado sube a Storage y devuelve la URL pública.
 * - En modo local guarda un data-URL en localStorage, así la funcionalidad
 *   se puede probar sin backend.
 */
import { fb, firebaseConfigured } from "./firebase";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB (coincide con storage.rules)
const OUTPUT_SIZE = 256; // px — suficiente para escudos y avatares

export interface UploadResult {
  url: string;
  bytes: number;
  local: boolean;
}

/** Redimensiona a un cuadrado de 256px y comprime a WebP/PNG */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");

  // Recorte centrado para mantener proporción
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86)
  );
  if (blob) return blob;
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("No se pudo comprimir la imagen.");
  return png;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Error leyendo la imagen."));
    reader.readAsDataURL(blob);
  });
}

export function validateImage(file: File): string | null {
  if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
    return "Formato no admitido. Usa PNG, JPG o WebP.";
  }
  if (file.size > MAX_UPLOAD_BYTES * 4) {
    return "La imagen es demasiado grande (máximo 8 MB antes de comprimir).";
  }
  return null;
}

/**
 * Sube una imagen. `kind` determina la carpeta, que en las reglas de Storage
 * está protegida por uid (`clubs/{uid}/...` y `managers/{uid}/...`).
 */
export async function uploadImage(
  kind: "clubs" | "managers",
  uid: string,
  file: File
): Promise<UploadResult> {
  const error = validateImage(file);
  if (error) throw new Error(error);

  const blob = await compressImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("La imagen comprimida sigue siendo demasiado grande.");

  if (!firebaseConfigured) {
    const dataUrl = await blobToDataUrl(blob);
    localStorage.setItem(`fm.img.${kind}.${uid}`, dataUrl);
    return { url: dataUrl, bytes: blob.size, local: true };
  }

  const { getDownloadURL, ref, uploadBytes } = await import("firebase/storage");
  const ctx = fb()!;
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const path = `${kind}/${uid}/badge.${ext}`;
  const storageRef = ref(ctx.storage, path);
  await uploadBytes(storageRef, blob, { contentType: blob.type, cacheControl: "public,max-age=604800" });
  const url = await getDownloadURL(storageRef);
  return { url, bytes: blob.size, local: false };
}

/** Recupera una imagen guardada en modo local */
export function localImage(kind: "clubs" | "managers", uid: string): string | null {
  return localStorage.getItem(`fm.img.${kind}.${uid}`);
}

export async function removeImage(kind: "clubs" | "managers", uid: string): Promise<void> {
  if (!firebaseConfigured) {
    localStorage.removeItem(`fm.img.${kind}.${uid}`);
    return;
  }
  const { deleteObject, ref } = await import("firebase/storage");
  const ctx = fb()!;
  for (const ext of ["webp", "png"]) {
    await deleteObject(ref(ctx.storage, `${kind}/${uid}/badge.${ext}`)).catch(() => {});
  }
}
