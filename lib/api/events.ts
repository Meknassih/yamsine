import { EventEmitter } from "events";

const emitters = new Map<string, EventEmitter>();

export function getEmitter(lobbyCode: string): EventEmitter {
  let emitter = emitters.get(lobbyCode);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    emitters.set(lobbyCode, emitter);
  }
  return emitter;
}

export function emitStateChange(lobbyCode: string): void {
  const emitter = emitters.get(lobbyCode);
  if (emitter) {
    emitter.emit("state", lobbyCode);
  }
}

export function removeEmitter(lobbyCode: string): void {
  const emitter = emitters.get(lobbyCode);
  if (emitter) {
    emitter.removeAllListeners();
    emitters.delete(lobbyCode);
  }
}
