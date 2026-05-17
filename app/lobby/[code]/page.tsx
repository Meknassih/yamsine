"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useGameSocket } from "@/app/hooks/useGameSocket";
import { PlayerList } from "@/app/components/PlayerList";

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { connected, lobby, game, error, clientId, startGame, reconnect, clearError, leaveLobby } =
    useGameSocket();

  const [copied, setCopied] = useState(false);
  const reconnected = useRef(false);
  const redirected = useRef(false);

  useEffect(() => {
    if (!connected || reconnected.current) return;
    // Provider state already matches this lobby (we just navigated here from
    // the home page after creating/joining) — no need to ask the server again.
    if (lobby?.code === code) {
      reconnected.current = true;
      return;
    }
    if (game?.lobbyCode === code) {
      reconnected.current = true;
      return;
    }
    reconnected.current = true;
    reconnect(code);
  }, [connected, code, reconnect, lobby, game]);

  useEffect(() => {
    if (game && !redirected.current) {
      redirected.current = true;
      router.push(`/game/${code}`);
    }
  }, [game, code, router]);

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isHost = lobby?.hostId === clientId;
  const canStart = isHost && (lobby?.players.length ?? 0) >= 2;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-1"><Link href="/" className="hover:text-slate-200 transition-colors">🎲 Yamsine</Link></h1>
          <p className="text-slate-400">Waiting room</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="ml-3 font-bold text-red-400 hover:text-red-200">×</button>
          </div>
        )}

        <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-8 border border-slate-700 shadow-2xl">
          <div className="mb-6">
            <p className="text-slate-400 text-sm mb-2">Share this code with friends</p>
            <button
              onClick={copyCode}
              className="w-full bg-slate-700 hover:bg-slate-600 rounded-xl py-4 text-center transition-colors group"
            >
              <span className="text-white text-3xl font-mono font-bold tracking-[0.3em]">
                {code}
              </span>
              <p className="text-slate-500 text-xs mt-1 group-hover:text-slate-400">
                {copied ? "Copied!" : "Click to copy"}
              </p>
            </button>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-slate-300 font-medium">
                Players ({lobby?.players.length ?? 0}/8)
              </h2>
              {!isHost && (
                <span className="text-sm bg-clip-text text-transparent bg-gradient-to-r from-slate-500 from-0% via-slate-300 via-45% to-slate-500 to-55% bg-[length:200%_100%] animate-shimmer">Waiting for host…</span>
              )}
            </div>
            {lobby ? (
              <PlayerList
                players={lobby.players}
                hostId={lobby.hostId}
                currentClientId={clientId}
              />
            ) : (
              <div className="text-slate-500 text-sm py-4 text-center">
                Connecting…
              </div>
            )}
          </div>

          {isHost && (
            <button
              onClick={() => startGame(code)}
              disabled={!canStart}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
            >
              {canStart
                ? "Start game"
                : `Need at least 2 players (${lobby?.players.length ?? 0}/2)`}
            </button>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={async () => {
                await leaveLobby(code);
                router.push("/");
              }}
              className="text-xs font-mono uppercase tracking-wider bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-700/60 rounded-md px-3 py-1 transition-colors"
            >
              Leave lobby
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
