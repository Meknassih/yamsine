import { NextResponse } from "next/server";
import type { Lobby, GameState, GameOverPayload, PlayAgainState } from "@/lib/game/types";
import { reconnectPlayer } from "@/lib/game/engine";
import {
  lobbies,
  games,
  lobbyMembers,
  gameOvers,
  playAgainStates,
  versions,
  kickedClients,
  markPlayerDisconnected,
  incrementVersion,
  touchClient,
} from "@/lib/api/store";
import { getEmitter } from "@/lib/api/events";

type SSEData = {
  lobby: Lobby;
  game?: GameState | null;
  gameOver?: GameOverPayload | null;
  playAgain?: PlayAgainState | null;
  version: number;
};

function buildPayload(lobbyCode: string): SSEData {
  const lobby = lobbies.get(lobbyCode)!;
  const game = games.get(lobbyCode);
  const gameOver = gameOvers.get(lobbyCode);
  const playAgain = playAgainStates.get(lobbyCode);
  const version = versions.get(lobbyCode) ?? 0;

  const payload: SSEData = { lobby, version };
  if (lobby.status === "ended") {
    payload.gameOver = gameOver ?? null;
    payload.playAgain = playAgain ?? null;
  } else if (game) {
    payload.game = game;
  }
  return payload;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") || "";
  const lastEventId = parseInt(request.headers.get("last-event-id") || "0", 10);

  const kicked = kickedClients.get(clientId);
  if (kicked && kicked.lobbyCode === code) {
    kickedClients.delete(clientId);
    const data = JSON.stringify({ reason: kicked.reason });
    const body = `event: kicked\ndata: ${data}\n\n`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  const lobby = lobbies.get(code);
  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  }

  const members = lobbyMembers.get(code);
  const isMember = members?.has(clientId) ?? false;

  if (clientId && !isMember) {
    const isPlayer = lobby.players.some((p) => p.id === clientId);
    if (isPlayer) {
      const data = JSON.stringify({ reason: "You were removed from the lobby." });
      const body = `event: kicked\ndata: ${data}\n\n`;
      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
    return NextResponse.json({ error: "Not a member of this lobby" }, { status: 403 });
  }

  touchClient(clientId);
  reconnectPlayer(lobby, games.get(code), clientId);
  incrementVersion(code);

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatHandle: ReturnType<typeof setInterval>;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeatHandle);
        if (unsubscribe) unsubscribe();
        markPlayerDisconnected(clientId, code);
        incrementVersion(code);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const onState = () => {
        if (closed) return;
        const kick = kickedClients.get(clientId);
        if (kick && kick.lobbyCode === code) {
          kickedClients.delete(clientId);
          const data = JSON.stringify({ reason: kick.reason });
          send(`event: kicked\ndata: ${data}\n\n`);
          cleanup();
          return;
        }
        const currentVersion = versions.get(code) ?? 0;
        const payload = buildPayload(code);
        send(`id: ${currentVersion}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const currentVersion = versions.get(code) ?? 0;
      if (lastEventId < currentVersion) {
        const payload = buildPayload(code);
        send(`id: ${currentVersion}\ndata: ${JSON.stringify(payload)}\n\n`);
      }

      const emitter = getEmitter(code);
      emitter.on("state", onState);
      unsubscribe = () => emitter.off("state", onState);

      heartbeatHandle = setInterval(() => {
        send(": heartbeat\n\n");
      }, 30_000);

      if (request.signal) {
        request.signal.addEventListener("abort", cleanup, { once: true });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
