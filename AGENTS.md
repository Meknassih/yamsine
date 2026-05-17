<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yamsine — multiplayer Yams (Yahtzee-like) dice game

## Dev commands

| Command | What it runs |
|---|---|
| `npm run dev` | `tsx server.ts` (custom HTTP server, **NOT** `next dev`) |
| `npm run build` | `next build` |
| `npm run start` | `NODE_ENV=production tsx server.ts` |
| `npm run lint` | `eslint` |

No test runner or typecheck script is configured.

## Architecture

- **Custom server** (`server.ts`): wraps Next request handler with Node `http.createServer`. Entrypoint is `server.ts`, not `next dev`/`next start`.
- **Communication**: HTTP POST for actions → in-memory state mutation → SSE broadcast back to clients.
  - `POST /api/lobby` — create or join a lobby
  - `POST /api/lobby/[code]/action` — start game, roll dice, score category, play again
  - `GET /api/lobby/[code]/events?clientId=...` — SSE stream for state pushes
- **State**: entirely in-memory (`lib/api/store.ts`). No database, no persistence. Restarts wipe everything.
- **Client ID**: generated once, persisted in `localStorage` under key `yamsine_client_id`.
- **Server-side**: `lib/game/engine.ts` (pure game logic), `lib/game/rules.ts` (scoring), `lib/api/store.ts` (in-memory state), `lib/api/events.ts` (per-lobby EventEmitter for SSE fan-out).
- **Client-side**: `GameApiProvider` (React context) owns SSE connection + action dispatch. `useGameSocket()` hook accesses it.

## Stack specifics

- **Next.js 16.2.6**, React 19.2.4 — may have breaking changes from older versions.
- **Tailwind CSS v4** via `@tailwindcss/postcss` (PostCSS plugin, **not** v3 `tailwind.config`). Uses `@import "tailwindcss"` in CSS, no `@tailwind` directives.
- **Path alias**: `@/*` → project root (`tsconfig.json` paths).
- **ESLint**: flat config (`eslint.config.mjs`), uses `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- **TypeScript**: `strict: true`, `moduleResolution: bundler`.

## Notable patterns

- Lobby codes are 6-char `nanoid` uppercase strings.
- Debug "skip to end" button appears in dev mode only (`process.env.NODE_ENV !== "production"`), invoked via `debug_skip_to_end` action.
- Play-again flow: host triggers 10-second countdown; non-voters at expiry are kicked via `kicked` SSE event.
- Connection loss detection: SSE `onerror` sets `connected=false` and shows "Connection lost. Refresh to reconnect." — there is no auto-reconnect logic.
- **3D Dice**: `Dice3D` component (`app/components/Dice3D.tsx`) renders 5 dice in a Three.js scene (RoundedBoxGeometry, canvas-generated face textures). Imported dynamically with `ssr: false`.
- **Dice rolling animation**: `GameApiProvider` tracks `isRolling` state. When the local player clicks Roll, `isRolling` becomes true → Dice3D tumbles dice for minimum 800ms. When other players' SSE events deliver changed dice (same `currentPlayerId`, different dice values), the animation also plays. Dice settle via SLERP to target face-up quaternions.
- **Dice face textures**: `diceTextures.ts` lazily generates 6 `CanvasTexture`s (value 1–6) with white backgrounds and slate pips. Shared across all dice meshes.
- **Keep/unkeep**: handled by separate toggle buttons below the 3D canvas (not raycasting). The `Dice3D` `kept` prop controls visual offset of kept dice.

## About this file

Make sure to keep this file up to date whenever you add, delete or update logic. Keep it concise.
