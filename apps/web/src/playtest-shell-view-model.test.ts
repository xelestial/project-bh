import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMoveOverlayState,
  buildPriorityInventoryCardModels,
  buildActionStatusView,
  buildSpecialCardButtonModels,
  buildTurnOrderChipModels,
  findFrontendHiddenInfoLeaks,
  getDefaultMobileResourceTab
} from "./playtest-shell-view-model.ts";

const secondaryTurnHints = {
  active: true,
  stage: "secondaryAction",
  mandatoryMoveTargets: [],
  secondaryMoveTargets: [{ x: 1, y: 2 }],
  rotationOrigins: [
    { x: 5, y: 5 },
    { x: 6, y: 5 }
  ],
  availableSecondaryActions: {
    move: true,
    throwTile: true,
    rotateTiles: true,
    specialCard: true,
    openTreasure: false,
    endTurn: true
  },
  availableSpecialCards: {
    coldBomb: false,
    flameBomb: false,
    electricBomb: false,
    largeHammer: true,
    fence: true,
    largeFence: false,
    recoveryPotion: false,
    jump: false,
    hook: false
  }
} as const;

test("playtest shell action status is derived from selector turn hints", () => {
  const status = buildActionStatusView({
    phase: "inTurn",
    turnHints: secondaryTurnHints,
    isMyTurn: true,
    rotationMode: true
  });

  assert.equal(status.statusLabel, "현재 단계: 행동 선택");
  assert.deepEqual(
    status.items.map((item) => [item.label, item.enabled, item.current, item.detail]),
    [
      ["1칸 이동", false, false, "선행 조건"],
      ["2칸 이동", true, false, "1곳 가능"],
      ["타일 던지기", true, false, "활성"],
      ["회전하기", true, true, "2곳 가능"],
      ["특수카드", true, false, "활성"],
      ["보물 열기", false, false, "잠김"]
    ]
  );
});

test("playtest shell special-card buttons expose only owned cards and selector availability", () => {
  const cards = buildSpecialCardButtonModels({
    isMyTurn: true,
    stage: "secondaryAction",
    specialInventory: {
      coldBomb: 0,
      flameBomb: 0,
      electricBomb: 0,
      largeHammer: 1,
      fence: 2,
      largeFence: 0,
      recoveryPotion: 0,
      jump: 0,
      hook: 0
    },
    availableSpecialCards: secondaryTurnHints.availableSpecialCards,
    selectedCardType: "fence"
  });

  assert.deepEqual(cards, [
    {
      cardType: "largeHammer",
      label: "대형 망치",
      targetHint: "회전 범위 지정",
      chargeCount: 1,
      available: true,
      disabled: false,
      selected: false,
      directUse: false
    },
    {
      cardType: "fence",
      label: "울타리",
      targetHint: "두 칸 지정",
      chargeCount: 2,
      available: true,
      disabled: false,
      selected: true,
      directUse: false
    }
  ]);
});

test("playtest shell defaults mobile resources by phase", () => {
  assert.equal(getDefaultMobileResourceTab("treasurePlacement"), "hand");
  assert.equal(getDefaultMobileResourceTab("prioritySubmission"), "hand");
  assert.equal(getDefaultMobileResourceTab("auction"), "actions");
  assert.equal(getDefaultMobileResourceTab("inTurn"), "actions");
  assert.equal(getDefaultMobileResourceTab("completed"), "treasures");
});

test("playtest shell priority inventory models submitted and disabled card states", () => {
  const cards = buildPriorityInventoryCardModels({
    availablePriorityCards: [1, 2, 4, 6],
    phase: "prioritySubmission",
    isMyTurn: true,
    submittedPriorityCard: 4
  });

  assert.deepEqual(cards, [
    { priorityCard: 1, label: "1", disabled: false, submitted: false },
    { priorityCard: 2, label: "2", disabled: false, submitted: false },
    { priorityCard: 4, label: "4", disabled: true, submitted: true },
    { priorityCard: 6, label: "6", disabled: false, submitted: false }
  ]);
});

test("playtest shell turn-order chips expose active, self, and eliminated states", () => {
  const chips = buildTurnOrderChipModels({
    turnOrder: ["player-2", "player-1", "player-3"],
    activePlayerId: "player-1",
    viewerPlayerId: "player-1",
    players: {
      "player-1": { name: "Alpha", eliminated: false },
      "player-2": { name: "Bravo", eliminated: false },
      "player-3": { name: "Charlie", eliminated: true }
    }
  });

  assert.deepEqual(chips, [
    { playerId: "player-2", label: "Bravo", active: false, self: false, eliminated: false, order: 1 },
    { playerId: "player-1", label: "Alpha", active: true, self: true, eliminated: false, order: 2 },
    { playerId: "player-3", label: "Charlie", active: false, self: false, eliminated: true, order: 3 }
  ]);
});

test("playtest shell move overlay state separates mandatory, secondary, and rotation highlights", () => {
  assert.deepEqual(
    buildMoveOverlayState({
      interactionMode: null,
      turnHints: {
        ...secondaryTurnHints,
        stage: "mandatoryStep",
        mandatoryMoveTargets: [{ x: 0, y: 1 }],
        secondaryMoveTargets: [{ x: 0, y: 2 }]
      }
    }),
    {
      highlightedCells: [{ x: 0, y: 1 }],
      highlightTone: "mandatoryStep",
      rotationOrigins: [],
      rotationPreviewCells: []
    }
  );

  assert.deepEqual(
    buildMoveOverlayState({
      interactionMode: "rotate",
      turnHints: secondaryTurnHints,
      rotationPreviewOrigin: { x: 5, y: 5 }
    }),
    {
      highlightedCells: [],
      highlightTone: "secondaryAction",
      rotationOrigins: [
        { x: 5, y: 5 },
        { x: 6, y: 5 }
      ],
      rotationPreviewCells: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 }
      ]
    }
  );
});

test("playtest shell detects hidden-info leaks before rendering selector payloads", () => {
  const leaks = findFrontendHiddenInfoLeaks({
    state: {
      players: {
        "player-1": { id: "player-1", carryingTreasure: true },
        "player-2": {
          id: "player-2",
          carryingTreasure: true,
          carriedTreasureId: "treasure-private",
          specialInventory: { fence: 1 }
        }
      },
      treasures: {
        "public-treasure-1": {
          id: "public-treasure-1",
          position: { x: 1, y: 1 },
          points: 4
        }
      }
    },
    viewer: {
      playerId: "player-1",
      self: {
        carriedTreasureId: "treasure-private",
        specialInventory: { fence: 1 }
      }
    }
  });

  assert.deepEqual(leaks, [
    "state.players.player-2.carriedTreasureId",
    "state.players.player-2.specialInventory",
    "state.treasures.public-treasure-1.points"
  ]);
});
