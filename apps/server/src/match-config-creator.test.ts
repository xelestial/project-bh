import assert from "node:assert/strict";
import test from "node:test";

import { createMatchInputFromConfig } from "./match-config-creator.ts";
import { PROJECT_BH_TESTPLAY_CONFIG } from "../../../config/testplay-config.ts";
import { DEFAULT_MATCH_SETTINGS, positionKey } from "../../../packages/domain/src/index.ts";

test("match config creator deals treasure cards deterministically and preserves the public treasure board slots", () => {
  const players = [
    { id: "player-1", name: "Alpha" },
    { id: "player-2", name: "Bravo" },
    { id: "player-3", name: "Charlie" },
    { id: "player-4", name: "Delta" }
  ] as const;

  const first = createMatchInputFromConfig("match-seeded", players);
  const second = createMatchInputFromConfig("match-seeded", players);

  assert.deepEqual(first.treasureBoardSlots, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(first.treasures, second.treasures);
  assert.equal(first.treasures?.length, 8);
  assert.equal(first.treasures?.filter((treasure) => treasure.slot === null).length, 1);
  assert.equal(new Set(first.treasures?.map((treasure) => treasure.id)).size, 8);
  assert.equal(first.tiles?.length, 15);
  assert.deepEqual(first.tiles, second.tiles);

  const tileCounts = (first.tiles ?? []).reduce<Record<string, number>>((counts, tile) => {
    return {
      ...counts,
      [tile.kind]: (counts[tile.kind] ?? 0) + 1
    };
  }, {});

  assert.equal(tileCounts.fire, 5);
  assert.equal(tileCounts.water, 5);
  assert.equal(tileCounts.electric, 5);
  assert.equal(new Set(first.tiles?.map((tile) => positionKey(tile.position))).size, 15);

  const zone = PROJECT_BH_TESTPLAY_CONFIG.settings.rotationZone ?? DEFAULT_MATCH_SETTINGS.rotationZone;
  for (const tile of first.tiles ?? []) {
    assert.ok(tile.position.x >= zone.origin.x && tile.position.x < zone.origin.x + zone.width);
    assert.ok(tile.position.y >= zone.origin.y && tile.position.y < zone.origin.y + zone.height);
  }
});

test("match config creator deals two treasure cards per player", () => {
  const input = createMatchInputFromConfig("match-two-player", [
    { id: "player-1", name: "Alpha" },
    { id: "player-2", name: "Bravo" }
  ]);

  const cardsByPlayer = (input.treasures ?? []).reduce<Record<string, number>>((counts, treasure) => {
    const playerId = treasure.ownerPlayerId ?? "missing";
    return {
      ...counts,
      [playerId]: (counts[playerId] ?? 0) + 1
    };
  }, {});

  assert.equal(cardsByPlayer["player-1"], 2);
  assert.equal(cardsByPlayer["player-2"], 2);
});
