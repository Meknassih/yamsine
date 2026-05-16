import type { WebSocket } from "ws";
import type { GameState, Lobby } from "../game/types";

export const lobbies = new Map<string, Lobby>();
export const games = new Map<string, GameState>();
// clientId → WebSocket connection
export const connections = new Map<string, WebSocket>();
// lobbyCode → set of clientIds
export const lobbyMembers = new Map<string, Set<string>>();

export function addConnection(clientId: string, ws: WebSocket): void {
  connections.set(clientId, ws);
}

export function removeConnection(clientId: string): void {
  connections.delete(clientId);
}

export function getLobbyForClient(clientId: string): Lobby | undefined {
  for (const [, lobby] of lobbies) {
    if (lobby.players.find((p) => p.id === clientId)) return lobby;
  }
  return undefined;
}

export function broadcastToLobby(
  lobbyCode: string,
  message: object
): void {
  const members = lobbyMembers.get(lobbyCode);
  if (!members) return;
  const raw = JSON.stringify(message);
  for (const clientId of members) {
    const ws = connections.get(clientId);
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(raw);
    }
  }
}

export function sendTo(clientId: string, message: object): void {
  const ws = connections.get(clientId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}
