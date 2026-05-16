import type { WebSocket } from "ws";
import type { ClientMessage } from "../game/types";
import {
  createLobby,
  joinLobby,
  startGame,
  rollDice,
  applyScoreCategory,
  reconnectPlayer,
  getWinner,
} from "../game/engine";
import {
  lobbies,
  games,
  connections,
  lobbyMembers,
  addConnection,
  removeConnection,
  getLobbyForClient,
  broadcastToLobby,
  sendTo,
} from "./store";

function send(ws: WebSocket, message: object): void {
  const m = message as { type: string };
  console.log(`[WS] sending: ${m.type}`);
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
  else console.warn(`[WS] tried to send ${m.type} but socket readyState=${ws.readyState}`);
}

export function handleConnection(ws: WebSocket): void {
  console.log("[WS] new connection");

  ws.on("message", (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      console.warn("[WS] invalid JSON received:", raw.toString().slice(0, 200));
      send(ws, { type: "error", payload: { message: "Invalid JSON" } });
      return;
    }
    console.log(`[WS] received: ${msg.type}`, JSON.stringify(msg.payload).slice(0, 200));
    handleMessage(ws, msg);
  });

  ws.on("close", (code: number, reason: Buffer) => {
    for (const [clientId, conn] of connections) {
      if (conn === ws) {
        console.log(`[WS] client ${clientId.slice(0, 8)} disconnected — code=${code} reason=${reason.toString() || "(none)"}`);
        const lobby = getLobbyForClient(clientId);
        if (lobby) {
          lobby.players = lobby.players.map((p) =>
            p.id === clientId ? { ...p, connected: false } : p
          );
          const game = games.get(lobby.code);
          if (game) {
            game.players = game.players.map((p) =>
              p.id === clientId ? { ...p, connected: false } : p
            );
            broadcastToLobby(lobby.code, { type: "game_updated", payload: game });
          } else {
            broadcastToLobby(lobby.code, {
              type: "lobby_updated",
              payload: lobby,
            });
          }
        }
        removeConnection(clientId);
        break;
      }
    }
  });

  ws.on("error", (err: Error) => {
    console.error("[WS] socket error:", err.message);
  });
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case "create_lobby": {
      const { playerName, clientId } = msg.payload;
      const lobby = createLobby(playerName, clientId);
      lobbies.set(lobby.code, lobby);
      lobbyMembers.set(lobby.code, new Set([clientId]));
      addConnection(clientId, ws);
      send(ws, { type: "lobby_updated", payload: lobby });
      break;
    }

    case "join_lobby": {
      const { lobbyCode, playerName, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
        return;
      }
      const result = joinLobby(lobby, playerName, clientId);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      if (!lobbyMembers.has(lobbyCode)) lobbyMembers.set(lobbyCode, new Set());
      lobbyMembers.get(lobbyCode)!.add(clientId);
      addConnection(clientId, ws);

      const game = games.get(lobbyCode);
      if (game) {
        send(ws, { type: "game_updated", payload: game });
      } else {
        broadcastToLobby(lobbyCode, { type: "lobby_updated", payload: lobby });
      }
      break;
    }

    case "start_game": {
      const { lobbyCode, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
        return;
      }
      if (lobby.hostId !== clientId) {
        send(ws, { type: "error", payload: { message: "Only the host can start the game" } });
        return;
      }
      if (lobby.players.length < 2) {
        send(ws, { type: "error", payload: { message: "Need at least 2 players" } });
        return;
      }
      const game = startGame(lobby);
      games.set(lobbyCode, game);
      broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      break;
    }

    case "roll_dice": {
      const { lobbyCode, clientId, keptIndices } = msg.payload;
      const game = games.get(lobbyCode);
      if (!game) {
        send(ws, { type: "error", payload: { message: "Game not found" } });
        return;
      }
      if (game.currentPlayerId !== clientId) {
        send(ws, { type: "error", payload: { message: "Not your turn" } });
        return;
      }
      const result = rollDice(game, keptIndices);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      break;
    }

    case "score_category": {
      const { lobbyCode, clientId, category } = msg.payload;
      const game = games.get(lobbyCode);
      if (!game) {
        send(ws, { type: "error", payload: { message: "Game not found" } });
        return;
      }
      const result = applyScoreCategory(game, category, clientId);
      if (result.error) {
        send(ws, { type: "error", payload: { message: result.error } });
        return;
      }
      if (result.gameOver) {
        const winner = getWinner(game);
        broadcastToLobby(lobbyCode, {
          type: "game_over",
          payload: { scores: game.scores, winner },
        });
        games.delete(lobbyCode);
        lobbies.delete(lobbyCode);
      } else {
        broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      }
      break;
    }

    case "reconnect": {
      const { lobbyCode, clientId } = msg.payload;
      const lobby = lobbies.get(lobbyCode);
      const game = games.get(lobbyCode);
      reconnectPlayer(lobby, game, clientId);
      addConnection(clientId, ws);
      if (!lobbyMembers.has(lobbyCode)) lobbyMembers.set(lobbyCode, new Set());
      lobbyMembers.get(lobbyCode)!.add(clientId);
      if (game) {
        send(ws, { type: "game_updated", payload: game });
        broadcastToLobby(lobbyCode, { type: "game_updated", payload: game });
      } else if (lobby) {
        broadcastToLobby(lobbyCode, { type: "lobby_updated", payload: lobby });
      } else {
        send(ws, { type: "error", payload: { message: "Lobby not found" } });
      }
      break;
    }

    default:
      send(ws, { type: "error", payload: { message: "Unknown message type" } });
  }
}
