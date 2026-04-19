import { createHash } from "node:crypto";

import type { MatchSessionSnapshot } from "./index.ts";

function buildOpaqueTreasureId(sessionId: string, treasureId: string): string {
  const digest = createHash("sha256")
    .update(`${sessionId}:${treasureId}`)
    .digest("hex")
    .slice(0, 16);

  return `tt-${digest}`;
}

export function projectTreasureIdForClient(
  snapshot: Pick<MatchSessionSnapshot, "sessionId">,
  treasureId: string
): string {
  return buildOpaqueTreasureId(snapshot.sessionId, treasureId);
}

export function resolveClientTreasureId(
  snapshot: MatchSessionSnapshot,
  clientTreasureId: string
): string | null {
  for (const treasureId of Object.keys(snapshot.state.treasures)) {
    if (buildOpaqueTreasureId(snapshot.sessionId, treasureId) === clientTreasureId) {
      return treasureId;
    }
  }

  return null;
}
