import type { GameOverPayload, GameState, Lobby, PlayAgainState } from "../game/types";

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
  return v;
}

export function touchClient(clientId: string): void {
  lastSeen.set(clientId, Date.now());
}

export function markDisconnected(lobbyCode: string): void {
  const members = lobbyMembers.get(lobbyCode);
  if (!members) return;
  const now = Date.now();
  const timeout = 15_000;
  const lobby = lobbies.get(lobbyCode);
  const game = games.get(lobbyCode);

  for (const clientId of members) {
    const seen = lastSeen.get(clientId) ?? 0;
    const disconnected = now - seen > timeout;
    if (lobby) {
      const player = lobby.players.find((p) => p.id === clientId);
      if (player && player.connected !== !disconnected) {
        lobby.players = lobby.players.map((p) =>
          p.id === clientId ? { ...p, connected: !disconnected } : p
        );
      }
    }
    if (game) {
      const player = game.players.find((p) => p.id === clientId);
      if (player && player.connected !== !disconnected) {
        game.players = game.players.map((p) =>
          p.id === clientId ? { ...p, connected: !disconnected } : p
        );
      }
    }
  }
}

export function getLobbyForClient(clientId: string): Lobby | undefined {
  for (const [, lobby] of lobbies) {
    if (lobby.players.find((p) => p.id === clientId)) return lobby;
  }
  return undefined;
}
