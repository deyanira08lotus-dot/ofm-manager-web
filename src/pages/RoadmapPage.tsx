/**
 * src/pages/RoadmapPage.tsx — hoja de ruta de las 10 fases del proyecto.
 */
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Card } from "@/components/ui";

const PHASES: { id: string; title: string; state: "done" | "next" | "todo"; items: string[] }[] = [
  { id: "FASE 16", title: "Dirección de partido en vivo", state: "done", items: ["Simulación pausable minuto a minuto", "5 cambios en directo con condición física real", "6 ajustes tácticos con efecto inmediato", "Barra de inercia: quién domina el encuentro", "Consejos del segundo entrenador en tiempo real", "Elige entre simular o sentarte en el banquillo"] },
  { id: "FASE 15", title: "Vestuario y sala de prensa", state: "done", items: ["Mapa de química: camarillas, líderes y conexiones", "Detección automática de jugadores descontentos", "5 tipos de conversación con éxito según personalidad", "Charla de equipo con 5 tonos y riesgo variable", "Rueda de prensa: consejo vs. afición vs. vestuario", "Las personalidades por fin condicionan tus decisiones"] },
  { id: "FASE 14", title: "Centro de análisis y scouting", state: "done", items: ["Misiones de ojeo a cualquier país (7, 14 o 28 días)", "Jugadores ocultos que no aparecen en el mercado", "Informes con margen de error según ojeador y Centro de análisis", "Especialidades: Sudamérica, Europa, Juveniles y Datos", "Informe de rival previo al partido elaborado por el analista", "Comparador de jugadores atributo por atributo"] },
  { id: "FASE 13", title: "Perfil, escudos y avisos", state: "done", items: ["Firebase Storage: escudo del club y avatar del manager", "Compresión y recorte automáticos en el navegador (256px)", "Nivel y experiencia de manager según rendimiento real", "7 títulos de carrera, de novato a leyenda viva", "Centro de notificaciones con 10 categorías y prioridades", "Preferencias de avisos configurables por el usuario"] },
  { id: "FASE 12", title: "Multijugador real", state: "done", items: ["Liga mundial compartida entre managers reales", "Las plazas libres se rellenan con clubes IA", "Simulación determinista: todos ven la misma clasificación", "Traspasos negociados entre usuarios con mensaje", "Liquidación en dos pasos: nadie escribe en la caja ajena", "Reglas de Firestore específicas para documentos compartidos"] },
  { id: "FASE 11", title: "Copas y competiciones", state: "done", items: ["Copa Nacional: 16 equipos, eliminatoria a partido único", "Supercopa entre campeones (requiere título previo)", "Copa Intercontinental: clasificación por reputación (45+)", "Prórroga y tanda de penaltis determinista", "Cuadro visual con sorteo automático de cada ronda", "Premios crecientes por ronda y palmarés del club"] },
  { id: "FASE 1", title: "Base jugable", state: "done", items: ["Firebase Auth (registro/login)", "Creación de club con dinero configurable", "22 jugadores generados proceduralmente", "Dashboard, plantilla y ficha de jugador", "Estadio, instalaciones, cuerpo técnico y finanzas iniciales", "Noticias y rankings básicos", "PWA responsive (PC + móvil)"] },
  { id: "FASE 2", title: "Alineación y partidos", state: "done", items: ["Editor de alineación en campo interactivo (5 formaciones)", "Tácticas: mentalidad, ritmo, presión, amplitud y estilo de pase", "Entrenamiento semanal + foco individual por jugador", "Simulador con ocasiones, goles, asistencias, tarjetas, cambios y lesiones", "Partido en directo minuto a minuto con estadísticas y notas", "Liga de 12 equipos: calendario de 22 jornadas, clasificación y goleadores"] },
  { id: "FASE 3", title: "Economía e instalaciones", state: "done", items: ["Liquidación semanal automática (también offline)", "Taquilla real: asistencia según precio, fidelidad y rival", "Obras de instalaciones y gradas con coste y tiempo", "Precio de entradas con reacción de la afición", "Ofertas de patrocinio con prima de firma", "Directiva: confianza, informe y ampliación de presupuesto"] },
  { id: "FASE 4", title: "Mercado", state: "done", items: ["Escaparate procedural que se renueva cada 3 días de juego", "Negociación con IA: puja, contraoferta y ruptura", "Ventas: la IA hace ofertas por tus jugadores listados", "Cesiones con reparto de salario y agentes libres", "Renovación de contratos con demandas del agente", "Buscador avanzado: posición, edad, país, precio, nivel, potencial, estilo y personalidad"] },
  { id: "FASE 5", title: "Academia", state: "done", items: ["5 canteranos cada mes de juego (15-18 años)", "Elección de país y posición prioritaria", "Informe de ojeador con rangos, no valores exactos", "Nivel de academia = mejores estadísticas y potenciales", "Hasta 2 promociones al primer equipo por mes"] },
  { id: "FASE 6", title: "Draft", state: "done", items: ["Draft cada 2 meses de juego (15-16 años)", "Solo jugadores del país de la liga", "Clases SS, S, A, B, C, D totalmente ocultas", "Sorteo del orden: los clubes previos pueden robarte", "Revelación de todos los datos al cerrar", "SS con solo un 0,4% de probabilidad"] },
  { id: "FASE 7", title: "Cuerpo técnico", state: "done", items: ["Mercado de técnicos renovado cada 6 días de juego", "11 cargos: entrenador, preparadores, médicos, ojeadores…", "Contratación con prima, renovación y despido con indemnización", "Centro de Formación: 3 cursos que suben el nivel del staff", "7 efectos reales: entrenamiento, lesiones, scouting, partidos…", "Los cursos avanzan aunque estés desconectado"] },
  { id: "FASE 8", title: "Selecciones", state: "done", items: ["Sub-15, Sub-17, Sub-20 y absoluta", "Elegibilidad por nacionalidad principal o segunda", "Candidaturas con programa y requisito de reputación", "Votación entre managers: gana el más votado", "Mandatos de 120 días con balance del seleccionador", "Convocatorias, amistosos, clasificación y torneos", "Ranking mundial de selecciones e internacionalidades"] },
  { id: "FASE 9", title: "Fama y comunidad", state: "done", items: ["Popularidad local, nacional e internacional que crece con el juego", "Índice de fama y etiquetas (de desconocido a icono mundial)", "Afición: informe de la grada, ídolos y opinión sobre precios", "18 logros con progreso en 4 categorías (bronce a leyenda)", "7 récords históricos del club que se actualizan solos", "Jugadores leyenda con puntuación de legado", "6 rankings globales: clubes, managers, goleadores, valor, fama y selecciones"] },
  { id: "FASE 10", title: "Seguridad y escalabilidad", state: "done", items: ["Cierre de temporada: premios, ascensos, envejecimiento y retiros", "Historial de temporadas con máximos goleadores y leyendas retiradas", "Capa de integridad: detecta y sanea estados imposibles", "Reglas de Firestore completas con topes anti-exploit", "8 Cloud Functions programadas (cron) + cola de comandos", "Rankings agregados: 1 lectura en vez de consultar toda la colección", "PWA instalable con offline, actualización en caliente y notificaciones", "Pantalla de Sistema con auditoría y estimación de costes"] },
];

export default function RoadmapPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Hoja de ruta</h1>
        <p className="text-sm text-white/45">Desarrollo por fases: cada fase añade sistemas sin romper lo anterior.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {PHASES.map((p) => (
          <Card key={p.id}
                className={p.state === "done" ? "border-turf-500/30" : p.state === "next" ? "border-sky-500/25" : ""}
                title={<span className="flex items-center gap-2">
                  {p.state === "done" ? <CheckCircle2 size={16} className="text-turf-400" /> : p.state === "next" ? <Clock size={16} className="text-sky-400" /> : <Circle size={16} className="text-white/25" />}
                  {p.id} · {p.title}
                </span>}
                subtitle={p.state === "done" ? "Completada y funcional" : p.state === "next" ? "Siguiente en la cola" : "Planificada"}>
            <ul className="space-y-1.5 text-sm text-white/55">
              {p.items.map((i) => <li key={i} className="flex gap-2"><span className="text-white/25">›</span>{i}</li>)}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
