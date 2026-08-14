/**
 * src/App.tsx — punto de entrada: proveedor de estado + enrutado.
 * FASE 1: auth → creación de club → panel / plantilla / jugador / club / noticias.
 */
import { Lock } from "lucide-react";
import { GameProvider, useGame } from "@/state/GameContext";
import { Layout } from "@/components/Layout";
import { Button, Card, Spinner } from "@/components/ui";
import { useRoute, navigate } from "@/lib/router";
import AuthPage from "@/pages/AuthPage";
import CreateClubPage from "@/pages/CreateClubPage";
import DashboardPage from "@/pages/DashboardPage";
import SquadPage from "@/pages/SquadPage";
import PlayerPage from "@/pages/PlayerPage";
import ClubPage from "@/pages/ClubPage";
import NewsPage from "@/pages/NewsPage";
import RankingsPage from "@/pages/RankingsPage";
import RoadmapPage from "@/pages/RoadmapPage";
import SettingsPage from "@/pages/SettingsPage";
import LineupPage from "@/pages/LineupPage";
import TrainingPage from "@/pages/TrainingPage";
import LeaguePage from "@/pages/LeaguePage";
import MatchPage from "@/pages/MatchPage";
import FinancePage from "@/pages/FinancePage";
import MarketPage from "@/pages/MarketPage";
import AcademyPage from "@/pages/AcademyPage";
import DraftPage from "@/pages/DraftPage";
import StaffPage from "@/pages/StaffPage";
import NationalPage from "@/pages/NationalPage";
import FamePage from "@/pages/FamePage";
import SystemPage from "@/pages/SystemPage";
import CupsPage from "@/pages/CupsPage";
import MultiplayerPage from "@/pages/MultiplayerPage";
import ProfilePage from "@/pages/ProfilePage";
import ScoutingPage from "@/pages/ScoutingPage";
import DressingRoomPage from "@/pages/DressingRoomPage";
import LiveMatchPage from "@/pages/LiveMatchPage";

const SOON: Record<string, { title: string; phase: string; text: string }> = {
};

function ComingSoon({ slug }: { slug: string }) {
  const info = SOON[slug];
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/40">
          <Lock size={22} />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-turf-400">{info?.phase ?? "Próximamente"}</p>
        <h2 className="mt-1 text-xl font-black">{info?.title ?? "Módulo en desarrollo"}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/45">{info?.text ?? "Este módulo se activará en una próxima fase."}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate("/fases")}>Ver hoja de ruta</Button>
          <Button onClick={() => navigate("/")}>Volver al panel</Button>
        </div>
      </Card>
    </div>
  );
}

function Router() {
  const { ready, user, club, loadingClub } = useGame();
  const route = useRoute();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Cargando el mundo del juego..." />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (loadingClub && !club) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Sincronizando tu club..." />
      </div>
    );
  }

  if (!club) return <CreateClubPage />;

  const [head, param] = route.parts;
  let page: React.ReactNode;
  switch (head) {
    case undefined: page = <DashboardPage />; break;
    case "plantilla": page = <SquadPage />; break;
    case "jugador": page = <PlayerPage playerId={param ?? ""} />; break;
    case "alineacion": page = <LineupPage />; break;
    case "entrenamiento": page = <TrainingPage />; break;
    case "liga": page = <LeaguePage />; break;
    case "partido": page = <MatchPage matchId={param} />; break;
    case "club": page = <ClubPage />; break;
    case "finanzas": page = <FinancePage />; break;
    case "mercado": page = <MarketPage />; break;
    case "academia": page = <AcademyPage />; break;
    case "draft": page = <DraftPage />; break;
    case "cuerpo-tecnico": page = <StaffPage />; break;
    case "selecciones": page = <NationalPage />; break;
    case "fama": page = <FamePage />; break;
    case "sistema": page = <SystemPage />; break;
    case "copas": page = <CupsPage />; break;
    case "multijugador": page = <MultiplayerPage />; break;
    case "perfil": page = <ProfilePage />; break;
    case "scouting": page = <ScoutingPage />; break;
    case "vestuario": page = <DressingRoomPage />; break;
    case "directo": page = <LiveMatchPage />; break;
    case "noticias": page = <NewsPage />; break;
    case "rankings": page = <RankingsPage />; break;
    case "fases": page = <RoadmapPage />; break;
    case "ajustes": page = <SettingsPage />; break;
    default: page = SOON[head] ? <ComingSoon slug={head} /> : <DashboardPage />;
  }

  return <Layout>{page}</Layout>;
}

export default function App() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  );
}
