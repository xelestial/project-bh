import type { MatchCommand } from "../../application/src/index.ts";
import { validateMatchCommand } from "./match-command-schema.ts";

export const REPLAY_EXPORT_FORMAT = "project-bh.replay.v1";

export interface ReplayCommandRecord {
  readonly streamId: string;
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly receivedAt: string;
  readonly payload: MatchCommand;
}

export interface ReplayEventRecord {
  readonly streamId: string;
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly processedAt: string;
  readonly revision: number;
  readonly eventTypes: readonly string[];
  readonly rejection: {
    readonly code: string;
    readonly message: string;
  } | null;
}

export interface ReplayExport {
  readonly format: typeof REPLAY_EXPORT_FORMAT;
  readonly version: 1;
  readonly replayId: string;
  readonly sessionId: string;
  readonly matchId: string;
  readonly exportedAt: string;
  readonly initialRevision: number;
  readonly finalRevision: number;
  readonly commands: readonly ReplayCommandRecord[];
  readonly events: readonly ReplayEventRecord[];
}

export interface ReplayValidationFailure {
  readonly ok: false;
  readonly message: string;
}

export interface ReplayValidationSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

export type ReplayValidationResult<TValue> =
  | ReplayValidationFailure
  | ReplayValidationSuccess<TValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validateCommandRecord(value: unknown): ReplayValidationResult<ReplayCommandRecord> {
  if (!isRecord(value)) {
    return { ok: false, message: "Replay command record must be an object." };
  }

  const streamId = value.streamId;
  const commandId = value.commandId;
  const roomId = value.roomId;
  const playerId = value.playerId;
  const receivedAt = value.receivedAt;

  if (!isNonEmptyString(streamId)) {
    return { ok: false, message: "Replay command streamId must be a non-empty string." };
  }

  if (!isNonEmptyString(commandId)) {
    return { ok: false, message: "Replay command commandId must be a non-empty string." };
  }

  if (!isNonEmptyString(roomId)) {
    return { ok: false, message: "Replay command roomId must be a non-empty string." };
  }

  if (!isNonEmptyString(playerId)) {
    return { ok: false, message: "Replay command playerId must be a non-empty string." };
  }

  if (!isNonEmptyString(receivedAt)) {
    return { ok: false, message: "Replay command receivedAt must be a non-empty string." };
  }

  const payload = validateMatchCommand(value.payload);

  if (!payload.ok) {
    return payload;
  }

  return {
    ok: true,
    value: {
      streamId,
      commandId,
      roomId,
      playerId,
      receivedAt,
      payload: payload.value
    }
  };
}

function validateEventRecord(value: unknown): ReplayValidationResult<ReplayEventRecord> {
  if (!isRecord(value)) {
    return { ok: false, message: "Replay event record must be an object." };
  }

  const streamId = value.streamId;
  const commandId = value.commandId;
  const roomId = value.roomId;
  const playerId = value.playerId;
  const processedAt = value.processedAt;
  const revision = value.revision;
  const eventTypes = value.eventTypes;
  const rejection = value.rejection;

  if (!isNonEmptyString(streamId)) {
    return { ok: false, message: "Replay event streamId must be a non-empty string." };
  }

  if (!isNonEmptyString(commandId)) {
    return { ok: false, message: "Replay event commandId must be a non-empty string." };
  }

  if (!isNonEmptyString(roomId)) {
    return { ok: false, message: "Replay event roomId must be a non-empty string." };
  }

  if (!isNonEmptyString(playerId)) {
    return { ok: false, message: "Replay event playerId must be a non-empty string." };
  }

  if (!isNonEmptyString(processedAt)) {
    return { ok: false, message: "Replay event processedAt must be a non-empty string." };
  }

  if (!isNonNegativeInteger(revision)) {
    return { ok: false, message: "Replay event revision must be a non-negative integer." };
  }

  if (!Array.isArray(eventTypes) || eventTypes.some((entry) => !isNonEmptyString(entry))) {
    return { ok: false, message: "Replay eventTypes must be non-empty strings." };
  }

  if (
    rejection !== null &&
    (!isRecord(rejection) ||
      !isNonEmptyString(rejection.code) ||
      !isNonEmptyString(rejection.message))
  ) {
    return { ok: false, message: "Replay rejection must be null or a code/message object." };
  }
  let normalizedRejection: ReplayEventRecord["rejection"] = null;

  if (rejection !== null) {
    if (!isRecord(rejection) || !isNonEmptyString(rejection.code) || !isNonEmptyString(rejection.message)) {
      return { ok: false, message: "Replay rejection must be null or a code/message object." };
    }

    normalizedRejection = {
      code: rejection.code,
      message: rejection.message
    };
  }

  return {
    ok: true,
    value: {
      streamId,
      commandId,
      roomId,
      playerId,
      processedAt,
      revision,
      eventTypes,
      rejection: normalizedRejection
    }
  };
}

export function validateReplayExport(value: unknown): ReplayValidationResult<ReplayExport> {
  if (!isRecord(value)) {
    return { ok: false, message: "Replay export must be an object." };
  }

  if (value.format !== REPLAY_EXPORT_FORMAT) {
    return { ok: false, message: `Replay format must be ${REPLAY_EXPORT_FORMAT}.` };
  }

  if (value.version !== 1) {
    return { ok: false, message: "Replay version must be 1." };
  }

  const replayId = value.replayId;
  const sessionId = value.sessionId;
  const matchId = value.matchId;
  const exportedAt = value.exportedAt;

  if (!isNonEmptyString(replayId)) {
    return { ok: false, message: "Replay replayId must be a non-empty string." };
  }

  if (!isNonEmptyString(sessionId)) {
    return { ok: false, message: "Replay sessionId must be a non-empty string." };
  }

  if (!isNonEmptyString(matchId)) {
    return { ok: false, message: "Replay matchId must be a non-empty string." };
  }

  if (!isNonEmptyString(exportedAt)) {
    return { ok: false, message: "Replay exportedAt must be a non-empty string." };
  }

  if (!isNonNegativeInteger(value.initialRevision) || !isNonNegativeInteger(value.finalRevision)) {
    return { ok: false, message: "Replay revisions must be non-negative integers." };
  }

  if (value.finalRevision < value.initialRevision) {
    return { ok: false, message: "Replay finalRevision must be greater than or equal to initialRevision." };
  }

  if (!Array.isArray(value.commands) || !Array.isArray(value.events)) {
    return { ok: false, message: "Replay commands and events must be arrays." };
  }

  const commands: ReplayCommandRecord[] = [];
  const events: ReplayEventRecord[] = [];

  for (const command of value.commands) {
    const result = validateCommandRecord(command);

    if (!result.ok) {
      return result;
    }

    commands.push(result.value);
  }

  for (const event of value.events) {
    const result = validateEventRecord(event);

    if (!result.ok) {
      return result;
    }

    events.push(result.value);
  }

  return {
    ok: true,
    value: {
      format: REPLAY_EXPORT_FORMAT,
      version: 1,
      replayId,
      sessionId,
      matchId,
      exportedAt,
      initialRevision: value.initialRevision,
      finalRevision: value.finalRevision,
      commands,
      events
    }
  };
}
