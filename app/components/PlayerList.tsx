"use client";

import type { Player } from "@/lib/game/types";

interface Props {
  players: Player[];
  hostId: string;
  currentClientId: string | null;
}

export function PlayerList({ players, hostId, currentClientId }: Props) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li
          key={player.id}
          className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-4 py-3"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${player.connected ? "bg-emerald-400" : "bg-slate-500"}`}
          />
          <span className="text-white font-medium flex-1">{player.name}</span>
          <div className="flex items-center gap-2">
            {player.id === hostId && (
              <span className="text-xs bg-amber-800/60 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full">
                Host
              </span>
            )}
            {player.id === currentClientId && (
              <span className="text-xs bg-blue-800/60 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full">
                You
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
