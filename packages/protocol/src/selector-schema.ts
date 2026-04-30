export const MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID = "match.snapshotBundle.v1";
export const MATCH_PUBLIC_STATE_SELECTOR_ID = "match.publicState.v1";
export const MATCH_VIEWER_PRIVATE_SELECTOR_ID = "match.viewerPrivate.v1";
export const MATCH_TURN_HINTS_SELECTOR_ID = "match.turnHints.v1";

export type SelectorId =
  | typeof MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID
  | typeof MATCH_PUBLIC_STATE_SELECTOR_ID
  | typeof MATCH_VIEWER_PRIVATE_SELECTOR_ID
  | typeof MATCH_TURN_HINTS_SELECTOR_ID;

export interface SelectorEnvelope<TPayload = unknown> {
  readonly selectorId: SelectorId;
  readonly version: 1;
  readonly revision: number;
  readonly payload: TPayload;
}

export interface SelectorValidationFailure {
  readonly ok: false;
  readonly message: string;
}

export interface SelectorValidationSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

export type SelectorValidationResult<TValue> =
  | SelectorValidationFailure
  | SelectorValidationSuccess<TValue>;

const SELECTOR_IDS = new Set<string>([
  MATCH_SNAPSHOT_BUNDLE_SELECTOR_ID,
  MATCH_PUBLIC_STATE_SELECTOR_ID,
  MATCH_VIEWER_PRIVATE_SELECTOR_ID,
  MATCH_TURN_HINTS_SELECTOR_ID
]);
const ENVELOPE_FIELDS = new Set(["selectorId", "version", "revision", "payload"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSelectorEnvelope(
  value: unknown
): SelectorValidationResult<SelectorEnvelope> {
  if (!isRecord(value)) {
    return { ok: false, message: "Selector envelope must be an object." };
  }

  for (const key of Object.keys(value)) {
    if (!ENVELOPE_FIELDS.has(key)) {
      return { ok: false, message: `Unknown selector envelope field: ${key}` };
    }
  }

  if (typeof value.selectorId !== "string" || !SELECTOR_IDS.has(value.selectorId)) {
    return { ok: false, message: `Unknown selector: ${String(value.selectorId)}` };
  }

  if (value.version !== 1) {
    return { ok: false, message: "Selector envelope version must be 1." };
  }

  if (
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) {
    return {
      ok: false,
      message: "Selector envelope revision must be a non-negative integer."
    };
  }

  if (!("payload" in value)) {
    return { ok: false, message: "Selector envelope payload is required." };
  }

  return {
    ok: true,
    value: {
      selectorId: value.selectorId as SelectorId,
      version: 1,
      revision: value.revision,
      payload: value.payload
    }
  };
}
