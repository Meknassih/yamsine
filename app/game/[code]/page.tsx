"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGameSocket } from "@/app/hooks/useGameSocket";
import { useIsMobile } from "@/app/hooks/useIsMobile";
import { Scorecard } from "@/app/components/Scorecard";
import { DiceArea } from "@/app/components/DiceArea";
import { MobileScorecardDrawer } from "@/app/components/MobileScorecardDrawer";
import { GameOverScreen } from "@/app/components/GameOverScreen";
import type { Category } from "@/lib/game/types";

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const {
    connected,
    lobby,
    game,
    gameOver,
    playAgain,
    kicked,
    error,
    clientId,
    rollDice,
    scoreCategory,
    requestPlayAgain,
    reconnect,
    clearError,
    leaveSession,
    debugSkipToEnd,
  } = useGameSocket();

  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDev = process.env.NODE_ENV !== "production";

  const reconnected = useRef(false);

  useEffect(() => {
    if (!connected || reconnected.current) return;
    if (game?.lobbyCode === code) {
      reconnected.current = true;
      return;
    }
    reconnected.current = true;
    reconnect(code);
  }, [connected, code, reconnect, game]);

  // Navigate back to the lobby once the host's "play again" countdown has
  // expired and the lobby has been reset to the waiting state.
  useEffect(() => {
    if (lobby && lobby.code === code && lobby.status === "waiting" && !game && !gameOver) {
      router.push(`/lobby/${code}`);
    }
  }, [lobby, game, gameOver, code, router]);

  // Kicked players (didn't click Play again in time) are sent back home.
  useEffect(() => {
    if (kicked) {
      leaveSession();
      router.push("/");
    }
  }, [kicked, leaveSession, router]);

  function handleRoll(keptIndices: number[]) {
    if (!game) return;
    rollDice(game.lobbyCode, keptIndices);
  }

  function handleScore(category: Category) {
    if (!game) return;
    scoreCategory(game.lobbyCode, category);
    setDrawerOpen(false);
  }

  if (gameOver) {
    return (
      <GameOverScreen
        gameOver={gameOver}
        playAgain={playAgain}
        clientId={clientId}
        isHost={lobby?.hostId === clientId}
        onPlayAgain={() => requestPlayAgain(code)}
      />
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">🎲</div>
          <p className="text-slate-400">Loading game…</p>
          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-xl">🎲 Yamsine</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 font-mono text-sm">{code}</span>
        </div>
        <div className="flex items-center gap-3">
          {isDev && game && (
            <button
              onClick={() => debugSkipToEnd(game.lobbyCode)}
              title="Fill all scoreboards except yours (1 turn left), then it's your turn."
              className="text-xs font-mono uppercase tracking-wider bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 border border-amber-700/60 rounded-md px-3 py-1 transition-colors"
            >
              skip
            </button>
          )}
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`}
          />
          <span className="text-slate-400 text-sm">
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="ml-3 font-bold text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] overflow-hidden">
        {/* Left: Scorecard (desktop only) */}
        {!isMobile && (
          <aside className="border-r border-slate-700/50 overflow-y-auto p-6">
            <Scorecard
              game={game}
              clientId={clientId}
              onScore={handleScore}
            />
          </aside>
        )}

        {/* Right (or full-width on mobile): Dice area */}
        <section className={isMobile ? "pb-20 overflow-y-auto" : "p-8 overflow-y-auto"}>
          <DiceArea
            game={game}
            clientId={clientId}
            onRoll={handleRoll}
            isMobile={isMobile}
            compact={isMobile && drawerOpen}
          />
        </section>
      </div>

      {/* Bottom drawer (mobile only) */}
      {isMobile && (
        <MobileScorecardDrawer open={drawerOpen} onToggle={() => setDrawerOpen((o) => !o)}>
          <Scorecard
            game={game}
            clientId={clientId}
            onScore={handleScore}
            compact
          />
        </MobileScorecardDrawer>
      )}
    </main>
  );
}
