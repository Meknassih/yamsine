export type Category =
  | "aces"
  | "twos"
  | "threes"
  | "fours"
  | "fives"
  | "sixes"
  | "threeOfAKind"
  | "fourOfAKind"
  | "fullHouse"
  | "smallStraight"
  | "largeStraight"
  | "yams"
  | "chance";

export const UPPER_CATEGORIES: Category[] = [
  "aces",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
];

export const LOWER_CATEGORIES: Category[] = [
  "threeOfAKind",
  "fourOfAKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "yams",
  "chance",
];

export const ALL_CATEGORIES: Category[] = [
  ...UPPER_CATEGORIES,
  ...LOWER_CATEGORIES,
];

export type ScoreCard = Partial<Record<Category, number>>;

export interface Die {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  kept: boolean;
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

export interface Lobby {
  code: string;
  hostId: string;
  players: Player[];
  status: "waiting" | "playing" | "ended";
}

export interface PlayAgainState {
  lobbyCode: string;
  voters: string[];
  hostStarted: boolean;
  deadlineMs: number | null;
}

export interface GameOverPayload {
  scores: Record<string, ScoreCard>;
  winner: Player;
  players: Player[];
}

export interface GameState {
  lobbyCode: string;
  players: Player[];
  scores: Record<string, ScoreCard>;
  currentPlayerId: string;
  rollsLeft: number;
  dice: Die[];
  turn: number;
}

// WebSocket message types

export type ClientMessage =
  | { type: "create_lobby"; payload: { playerName: string; clientId: string } }
  | {
      type: "join_lobby";
      payload: { lobbyCode: string; playerName: string; clientId: string };
    }
  | { type: "start_game"; payload: { lobbyCode: string; clientId: string } }
  | {
      type: "roll_dice";
      payload: { lobbyCode: string; clientId: string; keptIndices: number[] };
    }
  | {
      type: "score_category";
      payload: { lobbyCode: string; clientId: string; category: Category };
    }
  | {
      type: "reconnect";
      payload: { lobbyCode: string; clientId: string };
    }
  | {
      type: "debug_skip_to_end";
      payload: { lobbyCode: string; clientId: string };
    }
  | {
      type: "play_again";
      payload: { lobbyCode: string; clientId: string };
    };

export type ServerMessage =
  | { type: "lobby_updated"; payload: Lobby }
  | { type: "game_updated"; payload: GameState }
  | { type: "game_over"; payload: GameOverPayload }
  | { type: "play_again_state"; payload: PlayAgainState }
  | { type: "kicked"; payload: { reason: string } }
  | { type: "error"; payload: { message: string } };
