import {
  createMatchState,
  type CreateMatchStateInput,
  type MatchState
} from "../../../packages/domain/src/index.ts";
import {
  handleMatchCommand,
  type CommandHandlingResult,
  type MatchCommand
} from "../../../packages/application/src/index.ts";
import {
  getCommandVersion,
  validateMatchCommand
} from "../../../packages/protocol/src/index.ts";

export interface MatchEventLogEntry {
  readonly index: number;
  readonly command: MatchCommand;
  readonly result: CommandHandlingResult;
}

export interface MatchSessionSnapshot {
  readonly sessionId: string;
  readonly state: MatchState;
  readonly logLength: number;
}

export interface ReconnectPayload {
  readonly sessionId: string;
  readonly playerId: string;
  readonly snapshot: MatchSessionSnapshot;
  readonly log: readonly MatchEventLogEntry[];
}

export interface AuthoritativeMatchSession {
  readonly sessionId: string;
  readonly matchId: string;
  readonly state: MatchState;
  readonly log: readonly MatchEventLogEntry[];
}

type Subscriber = (snapshot: MatchSessionSnapshot) => void;

interface MutableSession {
  sessionId: string;
  state: MatchState;
  log: MatchEventLogEntry[];
  nextLogIndex: number;
  subscribers: Set<Subscriber>;
}

export interface ServerCompositionRoot {
  readonly mode: "authoritative-server";
  readonly protocolVersion: number;
  readonly createSession: (
    sessionId: string,
    input: CreateMatchStateInput
  ) => AuthoritativeMatchSession;
  readonly dispatchCommand: (
    sessionId: string,
    command: MatchCommand
  ) => CommandHandlingResult;
  readonly dispatchRawCommand: (
    sessionId: string,
    payload: unknown
  ) => CommandHandlingResult;
  readonly getSnapshot: (sessionId: string) => MatchSessionSnapshot;
  readonly getEventLog: (sessionId: string) => readonly MatchEventLogEntry[];
  readonly reconnect: (sessionId: string, playerId: string) => ReconnectPayload;
  readonly subscribe: (sessionId: string, subscriber: Subscriber) => () => void;
}

function createSnapshot(session: MutableSession): MatchSessionSnapshot {
  return {
    sessionId: session.sessionId,
    state: session.state,
    logLength: session.log.length
  };
}

function assertSession(
  sessions: Map<string, MutableSession>,
  sessionId: string
): MutableSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Unknown session: ${sessionId}`);
  }

  return session;
}

export function createServerCompositionRoot(): ServerCompositionRoot {
  const sessions = new Map<string, MutableSession>();

  function createSession(
    sessionId: string,
    input: CreateMatchStateInput
  ): AuthoritativeMatchSession {
    const state = createMatchState(input);
    const session: MutableSession = {
      sessionId,
      state,
      log: [],
      nextLogIndex: 1,
      subscribers: new Set()
    };
    sessions.set(sessionId, session);

    return {
      sessionId,
      matchId: state.matchId,
      state: session.state,
      log: session.log
    };
  }

  function dispatchCommand(
    sessionId: string,
    command: MatchCommand
  ): CommandHandlingResult {
    const session = assertSession(sessions, sessionId);
    const result = handleMatchCommand(session.state, command);

    session.state = result.state;
    session.log.push({
      index: session.nextLogIndex,
      command,
      result
    });
    session.nextLogIndex += 1;

    const snapshot = createSnapshot(session);

    for (const subscriber of session.subscribers) {
      subscriber(snapshot);
    }

    return result;
  }

  function dispatchRawCommand(
    sessionId: string,
    payload: unknown
  ): CommandHandlingResult {
    const validation = validateMatchCommand(payload);

    if (!validation.ok) {
      const session = assertSession(sessions, sessionId);

      return {
        state: session.state,
        events: [],
        rejection: {
          code: "PROTOCOL_VALIDATION_FAILED",
          message: validation.message
        }
      };
    }

    return dispatchCommand(sessionId, validation.value);
  }

  function getSnapshot(sessionId: string): MatchSessionSnapshot {
    return createSnapshot(assertSession(sessions, sessionId));
  }

  function getEventLog(sessionId: string): readonly MatchEventLogEntry[] {
    return assertSession(sessions, sessionId).log;
  }

  function reconnect(sessionId: string, playerId: string): ReconnectPayload {
    const session = assertSession(sessions, sessionId);

    return {
      sessionId,
      playerId,
      snapshot: createSnapshot(session),
      log: session.log
    };
  }

  function subscribe(sessionId: string, subscriber: Subscriber): () => void {
    const session = assertSession(sessions, sessionId);
    session.subscribers.add(subscriber);

    return () => {
      session.subscribers.delete(subscriber);
    };
  }

  return {
    mode: "authoritative-server",
    protocolVersion: getCommandVersion(),
    createSession,
    dispatchCommand,
    dispatchRawCommand,
    getSnapshot,
    getEventLog,
    reconnect,
    subscribe
  };
}
