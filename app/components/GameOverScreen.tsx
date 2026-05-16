"use client";

import { useEffect, useState } from "react";
import type { GameOverPayload, PlayAgainState } from "@/lib/game/types";
import { computeTotal } from "@/lib/game/rules";

const PLAY_AGAIN_TOTAL_MS = 10_000;

interface Props {
  gameOver: GameOverPayload;
  playAgain: PlayAgainState | null;
  clientId: string | null;
  isHost: boolean;
  onPlayAgain: () => void;
}

function useCountdown(deadlineMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineMs]);
  if (deadlineMs == null) return 0;
  return Math.max(0, deadlineMs - now);
}

export function GameOverScreen({
  gameOver,
  playAgain,
  clientId,
  isHost,
  onPlayAgain,
}: Props) {
  const hostStarted = playAgain?.hostStarted ?? false;
  const hasVoted = !!(clientId && playAgain?.voters.includes(clientId));
  const remainingMs = useCountdown(hostStarted ? playAgain?.deadlineMs ?? null : null);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = hostStarted
    ? 1 - remainingMs / PLAY_AGAIN_TOTAL_MS
    : 0;

  // What to show in the action area:
  //  - host + countdown running -> bordered countdown button
  //  - host, no countdown        -> regular Play again button (clicking starts countdown)
  //  - guest, has voted          -> "Waiting for host to reset the game..."
  //  - guest, host countdown     -> Play again button + "X remaining seconds to stay"
  //  - guest, no countdown       -> regular Play again button (clicking waits for host)
  let action: React.ReactNode;
  if (isHost) {
    action = (
      <HostPlayAgainButton
        hostStarted={hostStarted}
        remainingSec={remainingSec}
        progress={progress}
        onClick={onPlayAgain}
      />
    );
  } else if (hasVoted) {
    action = <WaitingForHost />;
  } else if (hostStarted) {
    action = (
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onPlayAgain}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-8 py-3 transition-colors"
        >
          Play again
        </button>
        <p className="text-amber-300 text-sm font-medium">
          {remainingSec} remaining seconds to stay
        </p>
      </div>
    );
  } else {
    action = (
      <button
        onClick={onPlayAgain}
        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-8 py-3 transition-colors"
      >
        Play again
      </button>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-lg">
        <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-10 border border-slate-700 shadow-2xl text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-3xl font-bold text-white mb-2">Game Over!</h1>
          <p className="text-emerald-400 text-xl font-semibold mb-8">
            {gameOver.winner.id === clientId
              ? "You won! 🎉"
              : `${gameOver.winner.name} wins!`}
          </p>
          <div className="space-y-2 mb-8">
            {Object.entries(gameOver.scores)
              .map(([playerId, card]) => ({
                playerId,
                total: computeTotal(card),
              }))
              .sort((a, b) => b.total - a.total)
              .map(({ playerId, total }, rank) => {
                const player =
                  gameOver.players.find((p) => p.id === playerId) ??
                  gameOver.winner;
                return (
                  <div
                    key={playerId}
                    className={`flex justify-between items-center px-4 py-3 rounded-lg ${
                      rank === 0
                        ? "bg-amber-900/40 border border-amber-700"
                        : "bg-slate-700/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-sm w-5">
                        {rank + 1}.
                      </span>
                      <span className="text-white font-medium">
                        {player.name}
                        {playerId === clientId ? " (you)" : ""}
                      </span>
                    </div>
                    <span
                      className={`font-bold text-lg ${rank === 0 ? "text-amber-400" : "text-slate-300"}`}
                    >
                      {total}
                    </span>
                  </div>
                );
              })}
          </div>
          <div className="flex justify-center">{action}</div>
        </div>
      </div>
    </main>
  );
}

function WaitingForHost() {
  return (
    <div className="flex items-center gap-3 text-slate-300">
      <span
        aria-label="Loading"
        className="inline-block w-5 h-5 rounded-full border-2 border-slate-500 border-t-emerald-400 animate-spin"
      />
      <span className="font-medium">Waiting for host to reset the game…</span>
    </div>
  );
}

function HostPlayAgainButton({
  hostStarted,
  remainingSec,
  progress,
  onClick,
}: {
  hostStarted: boolean;
  remainingSec: number;
  progress: number;
  onClick: () => void;
}) {
  if (!hostStarted) {
    return (
      <button
        onClick={onClick}
        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-8 py-3 transition-colors"
      >
        Play again
      </button>
    );
  }

  // A conic-gradient "ring" wrapper that fills clockwise as the countdown
  // progresses, giving the button an animated border.
  const angle = Math.min(360, Math.max(0, progress * 360));
  const ringStyle: React.CSSProperties = {
    background: `conic-gradient(rgb(52 211 153) ${angle}deg, rgb(51 65 85) ${angle}deg)`,
  };

  return (
    <div
      className="relative inline-block rounded-xl p-[3px] shadow-[0_0_24px_-8px_rgba(52,211,153,0.6)]"
      style={ringStyle}
    >
      <button
        disabled
        onClick={onClick}
        className="block bg-emerald-600 text-white font-semibold rounded-[10px] px-8 py-3 cursor-default"
      >
        Resetting in {remainingSec}s…
      </button>
    </div>
  );
}
