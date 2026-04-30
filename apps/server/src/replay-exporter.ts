import {
  REPLAY_EXPORT_FORMAT,
  type ReplayExport
} from "../../../packages/protocol/src/index.ts";
import type { EventEnvelope, RuntimeStore } from "./runtime/ports.ts";

export interface ExportReplayOptions {
  readonly store: RuntimeStore;
  readonly replayId: string;
  readonly sessionId: string;
  readonly matchId: string;
  readonly exportedAt: string;
  readonly initialRevision: number;
}

function collectEventTypes(event: EventEnvelope): readonly string[] {
  return event.result.events.flatMap((entry) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "type" in entry &&
      typeof entry.type === "string"
    ) {
      return [entry.type];
    }

    return [];
  });
}

export async function exportReplay(options: ExportReplayOptions): Promise<ReplayExport> {
  const [commands, events] = await Promise.all([
    options.store.streams.readCommands(options.sessionId, "0-0", Number.MAX_SAFE_INTEGER),
    options.store.streams.readEvents(options.sessionId, "0-0", Number.MAX_SAFE_INTEGER)
  ]);
  const finalRevision = events.reduce(
    (max, entry) => Math.max(max, entry.value.revision),
    options.initialRevision
  );

  return {
    format: REPLAY_EXPORT_FORMAT,
    version: 1,
    replayId: options.replayId,
    sessionId: options.sessionId,
    matchId: options.matchId,
    exportedAt: options.exportedAt,
    initialRevision: options.initialRevision,
    finalRevision,
    commands: commands.map((entry) => ({
      streamId: entry.streamId,
      commandId: entry.value.commandId,
      roomId: entry.value.roomId,
      playerId: entry.value.playerId,
      receivedAt: entry.value.receivedAt,
      payload: entry.value.payload
    })),
    events: events.map((entry) => ({
      streamId: entry.streamId,
      commandId: entry.value.commandId,
      roomId: entry.value.roomId,
      playerId: entry.value.playerId,
      processedAt: entry.value.processedAt,
      revision: entry.value.revision,
      eventTypes: collectEventTypes(entry.value),
      rejection: entry.value.result.rejection
    }))
  };
}
