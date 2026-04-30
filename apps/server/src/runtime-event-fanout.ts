import type { EventEnvelope, RuntimeStore } from "./runtime/ports.ts";

export interface RuntimeEventFanoutOptions {
  readonly store: RuntimeStore;
  readonly sessionId: string;
  readonly consumerName: string;
  readonly batchSize?: number;
  readonly onEvent: (event: EventEnvelope) => void | Promise<void>;
}

export interface RuntimeEventFanout {
  readonly poll: () => Promise<number>;
}

function cursorConsumerName(consumerName: string): string {
  return `fanout:${consumerName}`;
}

export function createRuntimeEventFanout(
  options: RuntimeEventFanoutOptions
): RuntimeEventFanout {
  const batchSize = options.batchSize ?? 100;
  const cursorName = cursorConsumerName(options.consumerName);

  async function poll(): Promise<number> {
    const afterStreamId =
      (await options.store.streamCursors.get(options.sessionId, cursorName)) ??
      "0-0";
    const entries = await options.store.streams.readEvents(
      options.sessionId,
      afterStreamId,
      batchSize
    );

    for (const entry of entries) {
      await options.onEvent(entry.value);
      await options.store.streamCursors.save(
        options.sessionId,
        cursorName,
        entry.streamId
      );
    }

    return entries.length;
  }

  return { poll };
}
