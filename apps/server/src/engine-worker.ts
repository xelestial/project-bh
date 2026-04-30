import {
  handleMatchCommand,
  type CommandHandlingResult
} from "../../../packages/application/src/index.ts";
import type {
  CommandEnvelope,
  EventEnvelope,
  RuntimeStore,
  StreamEntry
} from "./runtime/ports.ts";

export interface EngineWorkerOptions {
  readonly store: RuntimeStore;
  readonly consumerName?: string;
  readonly now?: () => string;
}

export interface EngineWorker {
  readonly processNextCommand: (sessionId: string) => Promise<boolean>;
  readonly processCommandEnvelope: (
    sessionId: string,
    envelope: CommandEnvelope
  ) => Promise<EventEnvelope>;
}

function createProcessedAt(now: (() => string) | undefined): string {
  return now ? now() : new Date().toISOString();
}

function createEventEnvelope(input: {
  readonly envelope: CommandEnvelope;
  readonly result: CommandHandlingResult;
  readonly revision: number;
  readonly processedAt: string;
}): EventEnvelope {
  return {
    commandId: input.envelope.commandId,
    roomId: input.envelope.roomId,
    playerId: input.envelope.playerId,
    processedAt: input.processedAt,
    result: input.result,
    revision: input.revision
  };
}

export function createEngineWorker(options: EngineWorkerOptions): EngineWorker {
  const consumerName = options.consumerName ?? "default";

  async function appendIdempotentEvent(
    sessionId: string,
    existing: EventEnvelope
  ): Promise<EventEnvelope> {
    const event = {
      ...existing,
      processedAt: createProcessedAt(options.now)
    };
    await options.store.streams.appendEvent(sessionId, event);
    return event;
  }

  async function processCommandEnvelope(
    sessionId: string,
    envelope: CommandEnvelope
  ): Promise<EventEnvelope> {
    const existing = await options.store.idempotency.get(
      sessionId,
      envelope.commandId
    );

    if (existing) {
      return appendIdempotentEvent(sessionId, existing.event);
    }

    const snapshot = await options.store.matches.getSnapshot(sessionId);

    if (!snapshot) {
      throw new Error(`Unknown match snapshot: ${sessionId}`);
    }

    const result = handleMatchCommand(snapshot.state, envelope.payload);
    const revision = snapshot.revision + 1;
    const event = createEventEnvelope({
      envelope,
      result,
      revision,
      processedAt: createProcessedAt(options.now)
    });

    await options.store.matches.saveSnapshot({
      sessionId,
      state: result.state,
      logLength: snapshot.logLength + 1,
      revision
    });
    await options.store.idempotency.save(sessionId, {
      commandId: envelope.commandId,
      event
    });
    await options.store.streams.appendEvent(sessionId, event);

    return event;
  }

  async function processNextCommand(sessionId: string): Promise<boolean> {
    const afterStreamId =
      (await options.store.engineCursors.get(sessionId, consumerName)) ?? "0-0";
    const [entry]: readonly StreamEntry<CommandEnvelope>[] =
      await options.store.streams.readCommands(sessionId, afterStreamId, 1);

    if (!entry) {
      return false;
    }

    await processCommandEnvelope(sessionId, entry.value);
    await options.store.engineCursors.save(
      sessionId,
      consumerName,
      entry.streamId
    );
    return true;
  }

  return {
    processNextCommand,
    processCommandEnvelope
  };
}
