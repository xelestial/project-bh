import type {
  RoundPhase,
  SpecialCardType
} from "../../../packages/domain/src/index.ts";

export type MobileResourceTab = "actions" | "hand" | "players" | "treasures";
export type TurnStage = "mandatoryStep" | "secondaryAction";

export interface PlaytestTurnHints {
  readonly active: boolean;
  readonly stage: TurnStage | null;
  readonly mandatoryMoveTargets: readonly { readonly x: number; readonly y: number }[];
  readonly secondaryMoveTargets: readonly { readonly x: number; readonly y: number }[];
  readonly rotationOrigins: readonly { readonly x: number; readonly y: number }[];
  readonly availableSecondaryActions: {
    readonly move: boolean;
    readonly throwTile: boolean;
    readonly rotateTiles: boolean;
    readonly specialCard: boolean;
    readonly openTreasure: boolean;
    readonly endTurn: boolean;
  };
  readonly availableSpecialCards: Readonly<Record<SpecialCardType, boolean>>;
}

export interface ActionStatusItem {
  readonly label: string;
  readonly enabled: boolean;
  readonly current: boolean;
  readonly detail: string;
}

export interface ActionStatusView {
  readonly statusLabel: string;
  readonly items: readonly ActionStatusItem[];
}

export interface SpecialCardButtonModel {
  readonly cardType: SpecialCardType;
  readonly label: string;
  readonly targetHint: string;
  readonly chargeCount: number;
  readonly available: boolean;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly directUse: boolean;
}

const SPECIAL_CARD_LABELS: Readonly<Record<SpecialCardType, string>> = {
  coldBomb: "냉기 폭탄",
  flameBomb: "화염 폭탄",
  electricBomb: "전기 폭탄",
  largeHammer: "대형 망치",
  fence: "울타리",
  largeFence: "대형 울타리",
  recoveryPotion: "회복제",
  jump: "뛰어넘기",
  hook: "갈고리"
};

const SPECIAL_CARD_TARGET_HINTS: Readonly<Record<SpecialCardType, string>> = {
  coldBomb: "타일 또는 플레이어 지정",
  flameBomb: "타일 지정",
  electricBomb: "타일 지정",
  largeHammer: "회전 범위 지정",
  fence: "두 칸 지정",
  largeFence: "세 칸 직선 지정",
  recoveryPotion: "즉시 사용",
  jump: "2칸 착지 지정",
  hook: "직선 플레이어 지정"
};

export function formatTurnStage(stage: TurnStage | null): string {
  switch (stage) {
    case "mandatoryStep":
      return "1칸 이동";
    case "secondaryAction":
      return "행동 선택";
    default:
      return "대기";
  }
}

export function formatSpecialCardLabel(cardType: SpecialCardType): string {
  return SPECIAL_CARD_LABELS[cardType];
}

export function formatSpecialCardTargetHint(cardType: SpecialCardType): string {
  return SPECIAL_CARD_TARGET_HINTS[cardType];
}

export function getDefaultMobileResourceTab(phase: RoundPhase): MobileResourceTab {
  switch (phase) {
    case "treasurePlacement":
    case "prioritySubmission":
      return "hand";
    case "completed":
      return "treasures";
    case "auction":
    case "inTurn":
      return "actions";
  }
}

export function buildActionStatusView(input: {
  readonly phase: RoundPhase;
  readonly turnHints: PlaytestTurnHints;
  readonly isMyTurn: boolean;
  readonly rotationMode: boolean;
}): ActionStatusView {
  const { turnHints } = input;
  const rotationOrigins = turnHints.rotationOrigins ?? [];
  const statusLabel =
    input.phase === "treasurePlacement"
      ? "보물 배치 중"
      : input.phase === "prioritySubmission"
        ? "우선권 제출 중"
        : input.isMyTurn
          ? `현재 단계: ${formatTurnStage(turnHints.stage)}`
          : "상대 턴 진행 중";

  return {
    statusLabel,
    items: [
      {
        label: "1칸 이동",
        enabled: turnHints.stage === "mandatoryStep" && turnHints.mandatoryMoveTargets.length > 0,
        current: turnHints.stage === "mandatoryStep",
        detail:
          turnHints.stage === "mandatoryStep"
            ? `${turnHints.mandatoryMoveTargets.length}칸 가능`
            : "선행 조건"
      },
      {
        label: "2칸 이동",
        enabled: turnHints.availableSecondaryActions.move,
        current: false,
        detail: turnHints.availableSecondaryActions.move
          ? `${turnHints.secondaryMoveTargets.length}곳 가능`
          : "잠김"
      },
      {
        label: "타일 던지기",
        enabled: turnHints.availableSecondaryActions.throwTile,
        current: false,
        detail: turnHints.availableSecondaryActions.throwTile ? "활성" : "잠김"
      },
      {
        label: "회전하기",
        enabled: turnHints.availableSecondaryActions.rotateTiles,
        current: input.rotationMode,
        detail: turnHints.availableSecondaryActions.rotateTiles ? `${rotationOrigins.length}곳 가능` : "잠김"
      },
      {
        label: "특수카드",
        enabled: turnHints.availableSecondaryActions.specialCard,
        current: false,
        detail: turnHints.availableSecondaryActions.specialCard ? "활성" : "잠김"
      },
      {
        label: "보물 열기",
        enabled: turnHints.availableSecondaryActions.openTreasure,
        current: false,
        detail: turnHints.availableSecondaryActions.openTreasure ? "활성" : "잠김"
      }
    ]
  };
}

export function buildSpecialCardButtonModels(input: {
  readonly isMyTurn: boolean;
  readonly stage: TurnStage | null;
  readonly specialInventory: Readonly<Record<SpecialCardType, number>>;
  readonly availableSpecialCards: Readonly<Record<SpecialCardType, boolean>>;
  readonly selectedCardType: SpecialCardType | null;
}): readonly SpecialCardButtonModel[] {
  return (Object.keys(input.specialInventory) as SpecialCardType[])
    .filter((cardType) => input.specialInventory[cardType] > 0)
    .map((cardType) => {
      const available = input.availableSpecialCards[cardType];

      return {
        cardType,
        label: formatSpecialCardLabel(cardType),
        targetHint: formatSpecialCardTargetHint(cardType),
        chargeCount: input.specialInventory[cardType],
        available,
        disabled: !input.isMyTurn || input.stage !== "secondaryAction" || !available,
        selected: input.selectedCardType === cardType,
        directUse: cardType === "recoveryPotion"
      };
    });
}
