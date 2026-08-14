/**
 * src/lib/router.tsx
 * Router mínimo basado en hash (#/ruta). Funciona en Netlify sin configuración
 * extra y también con el build de un solo archivo.
 */
import { useCallback, useEffect, useState } from "react";

export interface Route {
  path: string;
  parts: string[];
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return { path, parts: path.split("/").filter(Boolean) };
}

export function navigate(to: string, replace = false) {
  const target = `#${to.startsWith("/") ? to : `/${to}`}`;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse());
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function useNavigate() {
  return useCallback((to: string, replace = false) => navigate(to, replace), []);
}
