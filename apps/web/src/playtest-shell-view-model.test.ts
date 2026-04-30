import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActionStatusView,
  buildSpecialCardButtonModels,
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
