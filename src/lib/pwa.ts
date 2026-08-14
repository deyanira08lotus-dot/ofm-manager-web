/**
 * src/lib/pwa.ts
 * Soporte PWA (FASE 10): instalación, actualizaciones, estado offline y
 * notificaciones locales. Sin dependencias externas.
 */
import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent("fm:installable"));
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePwa() {
  const [installable, setInstallable] = useState(Boolean(deferredPrompt));
  const [installed, setInstalled] = useState(isStandalone());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => { setInstalled(true); setInstallable(false); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpdate = () => setUpdateReady(true);

    window.addEventListener("fm:installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("fm:sw-update", onUpdate);
    return () => {
      window.removeEventListener("fm:installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("fm:sw-update", onUpdate);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setInstallable(false);
    return choice.outcome === "accepted";
  }, []);

  const applyUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, []);

  return { installable, installed, online, updateReady, install, applyUpdate };
}

/** Registra el service worker y avisa cuando hay una versión nueva */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("fm:sw-update"));
          }
        });
      });
      // Comprobar actualizaciones cada 30 minutos
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    })
    .catch(() => {
      /* sin SW la app sigue funcionando */
    });
}

/* ------------------------------------------------------------------ */
/* Notificaciones locales                                              */
/* ------------------------------------------------------------------ */

export async function requestNotifications(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icon-512.png", badge: "/icon-512.png", tag: "gestorpro" });
  } catch {
    /* algunos navegadores requieren el SW: se ignora silenciosamente */
  }
}

export function notificationStatus(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}
