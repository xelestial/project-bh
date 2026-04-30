import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTwoPlayerMatchFixture } from "../../testkit/src/index.ts";
import {
  createPosition,
  getRotationPositionMapping,
  getRotationSelectionPositions,
  moveActivePlayer,
  useSpecialCard,
  type DomainEvent,
  type MatchState,
  type PlayerState,
type RotationDirection,
type RotationSelection,
type TileKind,
  type TreasureState
} from "./index.ts";

const GOLDEN_DIR = new URL("../../../docs/fixtures/rotations/", import.meta.url);

type LargeHammerRotationSelection = Extract<
  RotationSelection,
  { readonly kind: "cross5" | "rectangle6" }
>;
type NonPlainTileKind = Exclude<TileKind, "plain">;

interface RotationGoldenInput {
  readonly activePlayerId: string;
  readonly cardType: "largeHammer";
  readonly selection: LargeHammerRotationSelection;
  readonly direction: RotationDirection;
  readonly startingTiles: Readonly<Record<string, NonPlainTileKind>>;
  readonly startingTreasurePosition: { readonly x: number; readonly y: number } | null;
}

interface RotationGoldenOutput {
  readonly tileKinds: Readonly<Record<string, TileKind>>;
  readonly treasurePosition: { readonly x: number; readonly y: number } | null;
  readonly largeHammerCharges: number;
  readonly activePlayerId: string | null;
  readonly turnStage: string | null;
  readonly events: readonly string[];
}

interface RotationGoldenScenario {
  readonly name: string;
  readonly input: RotationGoldenInput;
  readonly output: RotationGoldenOutput;
}

function mustPlayer(match: MatchState, playerId: string): PlayerState {
  const player = match.players[playerId];
  assert.ok(player, `Expected player ${playerId} to exist.`);
  return player;
}

function mustTreasure(match: MatchState, treasureId: string): TreasureState {
  const treasure = match.treasures[treasureId];
  assert.ok(treasure, `Expected treasure ${treasureId} to exist.`);
  return treasure;
}

function loadGolden(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, GOLDEN_DIR), "utf8"));
}

function eventTypes(events: readonly DomainEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

function createLargeHammerScenario(input: RotationGoldenInput): RotationGoldenScenario {
  const affectedTileKeys = [
    ...getRotationSelectionPositions(input.selection),
    ...getRotationPositionMapping(input.selection, input.direction).values()
  ]
    .map((position) => `${position.x},${position.y}`)
    .sort();
  const match = createTwoPlayerMatchFixture({
    treasures: input.startingTreasurePosition
      ? [
          {
            id: "treasure-rotation",
            slot: 1,
            points: 3,
            ownerPlayerId: "player-1",
            position: input.startingTreasurePosition
          }
        ]
      : [],
    tiles: Object.entries(input.startingTiles).map(([key, kind]) => {
      const [x, y] = key.split(",").map((value) => Number.parseInt(value, 10));
      return {
        position: createPosition(x ?? 0, y ?? 0),
        kind
      };
    })
  });
  const stepped = moveActivePlayer(match, input.activePlayerId, "south").state;
  const prepared: MatchState = {
    ...stepped,
    players: {
      ...stepped.players,
      [input.activePlayerId]: {
        ...mustPlayer(stepped, input.activePlayerId),
        specialInventory: {
          ...mustPlayer(stepped, input.activePlayerId).specialInventory,
          largeHammer: 1
        }
      }
    }
  };
  const result = useSpecialCard(prepared, {
    playerId: input.activePlayerId,
    cardType: input.cardType,
    selection: input.selection,
    direction: input.direction
  });
  const updatedPlayer = mustPlayer(result.state, input.activePlayerId);
  const treasure = input.startingTreasurePosition
    ? mustTreasure(result.state, "treasure-rotation")
    : null;

  return {
    name:
      input.selection.kind === "cross5"
        ? "large hammer rotates a cross5 selection with tiles and treasure"
        : `large hammer rotates a ${input.selection.orientation} rectangle6 selection`,
    input,
    output: {
      tileKinds: Object.fromEntries(
        [...new Set(affectedTileKeys)]
          .sort()
          .map((key) => [key, result.state.board.tiles[key]?.kind ?? "plain"])
      ),
      treasurePosition: treasure?.position ?? null,
      largeHammerCharges: updatedPlayer.specialInventory.largeHammer,
      activePlayerId: result.state.round.activePlayerId,
      turnStage: result.state.round.turn?.stage ?? null,
      events: eventTypes(result.events)
    }
  };
}

test("rotation golden samples match large-hammer domain behavior", () => {
  const cross5 = createLargeHammerScenario({
    activePlayerId: "player-1",
    cardType: "largeHammer",
    selection: {
      kind: "cross5",
      center: createPosition(8, 8)
    },
    direction: "clockwise",
    startingTiles: {
      "8,7": "fire",
      "9,8": "electric",
      "8,9": "water",
      "7,8": "ice"
    },
    startingTreasurePosition: createPosition(8, 7)
  });
  const horizontalRectangle = createLargeHammerScenario({
    activePlayerId: "player-1",
    cardType: "largeHammer",
    selection: {
      kind: "rectangle6",
      origin: createPosition(7, 7),
      orientation: "horizontal"
    },
    direction: "clockwise",
    startingTiles: {
      "7,7": "fire",
      "8,7": "water",
      "9,7": "electric",
      "7,8": "ice",
      "8,8": "fire",
      "9,8": "water"
    },
    startingTreasurePosition: createPosition(9, 7)
  });
  const verticalRectangle = createLargeHammerScenario({
    activePlayerId: "player-1",
    cardType: "largeHammer",
    selection: {
      kind: "rectangle6",
      origin: createPosition(10, 7),
      orientation: "vertical"
    },
    direction: "counterclockwise",
    startingTiles: {
      "10,7": "water",
      "11,7": "ice",
      "10,8": "fire",
      "11,8": "electric",
      "10,9": "water",
      "11,9": "fire"
    },
    startingTreasurePosition: createPosition(10, 9)
  });

  assert.deepEqual(cross5, loadGolden("cross5-large-hammer-clockwise.json"));
  assert.deepEqual(horizontalRectangle, loadGolden("rectangle6-horizontal-clockwise.json"));
  assert.deepEqual(verticalRectangle, loadGolden("rectangle6-vertical-counterclockwise.json"));
});
