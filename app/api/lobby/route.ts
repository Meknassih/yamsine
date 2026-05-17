import { NextResponse } from "next/server";
import type { Lobby, GameState } from "@/lib/game/types";
import { createLobby, joinLobby } from "@/lib/game/engine";
import {
  lobbies,
  games,
  lobbyMembers,
  incrementVersion,
  touchClient,
} from "@/lib/api/store";

export async function POST(request: Request) {
  let body: {
    type: "create" | "join";
    playerName?: string;
    clientId?: string;
    lobbyCode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, playerName = "", clientId = "", lobbyCode } = body;

  if (!clientId || !playerName.trim()) {
    return NextResponse.json({ error: "Missing clientId or playerName" }, { status: 400 });
  }

  const name = playerName.trim();

  if (type === "create") {
    const lobby = createLobby(name, clientId);
    lobbies.set(lobby.code, lobby);
    lobbyMembers.set(lobby.code, new Set([clientId]));
    touchClient(clientId);
    const version = incrementVersion(lobby.code);
    return NextResponse.json({ lobby, version });
  }

  if (type === "join") {
    if (!lobbyCode) {
      return NextResponse.json({ error: "Missing lobbyCode" }, { status: 400 });
    }
    const lobby = lobbies.get(lobbyCode);
    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }
    const result = joinLobby(lobby, name, clientId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (!lobbyMembers.has(lobbyCode)) lobbyMembers.set(lobbyCode, new Set());
    lobbyMembers.get(lobbyCode)!.add(clientId);
    touchClient(clientId);

    const version = incrementVersion(lobbyCode);
    const game = games.get(lobbyCode);
    const res: { lobby: Lobby; game?: GameState; version: number } = { lobby, version };
    if (game) res.game = game;
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Unknown action type" }, { status: 400 });
}
