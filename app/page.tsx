"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGameSocket } from "@/app/hooks/useGameSocket";

export default function Home() {
  const router = useRouter();
  const { connected, lobby, error, createLobby, joinLobby, clearError } =
    useGameSocket();

  const [playerName, setPlayerName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("yamsine_player_name") ?? "";
    }
    return "";
  });

  useEffect(() => {
    localStorage.setItem("yamsine_player_name", playerName);
  }, [playerName]);
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "creating" | "joining">("idle");
  const redirected = useRef(false);

  useEffect(() => {
    if (error) {
      startTransition(() => setMode("idle"));
    } else if (lobby && !redirected.current) {
      redirected.current = true;
      router.push(`/lobby/${lobby.code}`);
    }
  }, [error, lobby, router]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!playerName.trim()) return;
    setMode("creating");
    createLobby(playerName.trim());
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!playerName.trim() || !joinCode.trim()) return;
    setMode("joining");
    joinLobby(joinCode.trim().toUpperCase(), playerName.trim());
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-6xl font-bold text-white tracking-tight mb-2">
            <Link href="/" className="hover:text-slate-200 transition-colors">🎲 Yamsine</Link>
          </h1>
          <p className="text-slate-400 text-lg">Multiplayer Yams online</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-600"}`}
            />
            <span className="text-slate-500 text-sm">
              {connected ? "Connected" : "Connecting…"}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="ml-3 text-red-400 hover:text-red-200 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-8 border border-slate-700 shadow-2xl">
          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Your name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name…"
              maxLength={20}
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-600"
            />
          </div>

          <form onSubmit={handleCreate} className="mb-4">
            <button
              type="submit"
              disabled={!connected || !playerName.trim() || mode !== "idle"}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 transition-colors"
            >
              {mode === "creating" ? "Creating…" : "Create a lobby"}
            </button>
          </form>

          <div className="relative flex items-center mb-4">
            <div className="flex-1 border-t border-slate-600" />
            <span className="mx-3 text-slate-500 text-sm">or join</span>
            <div className="flex-1 border-t border-slate-600" />
          </div>

          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Lobby code"
              maxLength={6}
              className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600 font-mono tracking-widest uppercase"
            />
            <button
              type="submit"
              disabled={
                !connected ||
                !playerName.trim() ||
                !joinCode.trim() ||
                mode !== "idle"
              }
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-5 py-3 transition-colors"
            >
              {mode === "joining" ? "…" : "Join"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
