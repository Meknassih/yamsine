import type { GameOverPayload, GameState, Lobby, PlayAgainState } from "../game/types";
import { emitStateChange } from "./events";

export const lobbies = new Map<string, Lobby>();
export const games = new Map<string, GameState>();
export const lobbyMembers = new Map<string, Set<string>>();
export const gameOvers = new Map<string, GameOverPayload>();
export const playAgainStates = new Map<string, PlayAgainState>();
export const playAgainTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const versions = new Map<string, number>();

export const lastSeen = new Map<string, number>();

export const kickedClients = new Map<string, { lobbyCode: string; reason: string }>();

export function incrementVersion(lobbyCode: string): number {
  const v = (versions.get(lobbyCode) ?? 0) + 1;
  versions.set(lobbyCode, v);
  emitStateChange(lobbyCode);
  return v;
}

export function touchClient(clientId: string): void {
  lastSeen.set(clientId, Date.now());
}

export function markPlayerConnected(clientId: string, lobbyCode: string): void {
  const lobby = lobbies.get(lobbyCode);
  const game = games.get(lobbyCode);
  if (lobby) {
    const player = lobby.players.find((p) => p.id === clientId);
    if (player && !player.connected) {
      lobby.players = lobby.players.map((p) =>
        p.id === clientId ? { ...p, connected: true } : p
      );
    }
  }
  if (game) {
    const player = game.players.find((p) => p.id === clientId);
    if (player && !player.connected) {
      game.players = game.players.map((p) =>
        p.id === clientId ? { ...p, connected: true } : p
      );
    }
  }
}

export function markPlayerDisconnected(clientId: string, lobbyCode: string): void {
  const lobby = lobbies.get(lobbyCode);
  const game = games.get(lobbyCode);
  if (lobby) {
    const player = lobby.players.find((p) => p.id === clientId);
    if (player && player.connected) {
      lobby.players = lobby.players.map((p) =>
        p.id === clientId ? { ...p, connected: false } : p
      );
    }
  }
  if (game) {
    const player = game.players.find((p) => p.id === clientId);
    if (player && player.connected) {
      game.players = game.players.map((p) =>
        p.id === clientId ? { ...p, connected: false } : p
      );
    }
  }
}

export function getLobbyForClient(clientId: string): Lobby | undefined {
  for (const [, lobby] of lobbies) {
    if (lobby.players.find((p) => p.id === clientId)) return lobby;
  }
  return undefined;
}
