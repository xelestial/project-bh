import {
  cardinalDirectionBetween,
  cardinalLineDistance,
  DomainError,
  getTileKind,
  moveActivePlayer,
  openCarriedTreasure,
  placeTreasure,
  rotateTiles,
  throwTile,
  useSpecialCard,
  type MatchState,
  type PlayerId,
  type Position,
  type RotationSelection,
  type SpecialCardType
} from "../../domain/src/index.ts";
import {
  type ActionCandidate,
  type ActionCommandPayload,
  type PendingCellAction
} from "../../protocol/src/action-query-schema.ts";
import { listLegalNormalRotationDirections } from "./rotation-candidates.ts";

function tryCommand(
  run: () => void
): boolean {
  try {
    run();
    return true;
  } catch (error) {
    if (error instanceof DomainError) {
      return false;
    }

    throw error;
  }
}

function createCommandAction(
  id: string,
  label: string,
  command: ActionCommandPayload,
  description?: string
): ActionCandidate {
  return {
    id,
    label,
    command,
    ...(description ? { description } : {})
  };
}

function createPendingAction(
  id: string,
  label: string,
  nextPendingAction: PendingCellAction,
  description?: string
): ActionCandidate {
  return {
    id,
    label,
    nextPendingAction,
    ...(description ? { description } : {})
  };
}

function createRotationActions(
  match: MatchState,
  playerId: PlayerId,
  cell: Position,
  mode: "normal" | "largeHammer"
): ActionCandidate[] {
  const actions: ActionCandidate[] = [];
  const addRotation = (
    id: string,
    label: string,
    selection: RotationSelection,
    direction: "clockwise" | "counterclockwise",
    cardType?: SpecialCardType
  ) => {
    const isValid = cardType
      ? tryCommand(() =>
          useSpecialCard(match, {
            playerId,
            cardType,
            selection,
            direction
          })
        )
      : tryCommand(() =>
          rotateTiles(match, {
            playerId,
            selection,
            direction
          })
        );

    if (!isValid) {
      return;
    }

    actions.push(
      createCommandAction(id, label, {
        type: cardType ? "match.useSpecialCard" : "match.rotateTiles",
        selection,
        direction,
        ...(cardType ? { cardType } : {})
      })
    );
  };

  if (mode === "normal") {
    const legalDirections = new Set(listLegalNormalRotationDirections(match, playerId, cell));

    if (legalDirections.has("clockwise")) {
      addRotation(
        `rotate-square2-cw-${cell.x}-${cell.y}`,
        "2x2 시계 회전",
        { kind: "square2", origin: cell },
        "clockwise"
      );
    }

    if (legalDirections.has("counterclockwise")) {
      addRotation(
        `rotate-square2-ccw-${cell.x}-${cell.y}`,
        "2x2 반시계 회전",
        { kind: "square2", origin: cell },
        "counterclockwise"
      );
    }
  }

  if (mode === "largeHammer") {
    addRotation(
      `large-hammer-cross-cw-${cell.x}-${cell.y}`,
      "대형 망치 십자 시계 회전",
      { kind: "cross5", center: cell },
      "clockwise",
      "largeHammer"
    );
    addRotation(
      `large-hammer-cross-ccw-${cell.x}-${cell.y}`,
      "대형 망치 십자 반시계 회전",
      { kind: "cross5", center: cell },
      "counterclockwise",
      "largeHammer"
    );
    addRotation(
      `large-hammer-h-cw-${cell.x}-${cell.y}`,
      "대형 망치 가로 시계 회전",
      { kind: "rectangle6", origin: cell, orientation: "horizontal" },
      "clockwise",
      "largeHammer"
    );
    addRotation(
      `large-hammer-h-ccw-${cell.x}-${cell.y}`,
      "대형 망치 가로 반시계 회전",
      { kind: "rectangle6", origin: cell, orientation: "horizontal" },
      "counterclockwise",
      "largeHammer"
    );
    addRotation(
      `large-hammer-v-cw-${cell.x}-${cell.y}`,
      "대형 망치 세로 시계 회전",
      { kind: "rectangle6", origin: cell, orientation: "vertical" },
      "clockwise",
      "largeHammer"
    );
    addRotation(
      `large-hammer-v-ccw-${cell.x}-${cell.y}`,
      "대형 망치 세로 반시계 회전",
      { kind: "rectangle6", origin: cell, orientation: "vertical" },
      "counterclockwise",
      "largeHammer"
    );
  }

  return actions;
}

export function queryCellActions(
  match: MatchState,
  playerId: PlayerId,
  cell: Position,
  pendingAction?: PendingCellAction
): readonly ActionCandidate[] {
  const actions: ActionCandidate[] = [];
  const player = match.players[playerId];

  if (!player) {
    return actions;
  }

  if (pendingAction?.kind === "treasurePlacement") {
    if (
      tryCommand(() =>
        placeTreasure(match, {
          playerId,
          treasureId: pendingAction.treasureId,
          position: cell
        })
      )
    ) {
      actions.push(
        createCommandAction("place-treasure", "여기에 보물 배치", {
          type: "match.placeTreasure",
          treasureId: pendingAction.treasureId,
          position: cell
        })
      );
    }

    actions.push({
      id: "cancel-pending",
      label: "선택 취소",
      clearPendingAction: true
    });
    return actions;
  }

  if (pendingAction?.kind === "throw") {
    if (
      tryCommand(() =>
        throwTile(match, {
          playerId,
          source: pendingAction.source,
          target: cell
        })
      )
    ) {
      actions.push(
        createCommandAction("throw-target", "여기로 타일 던지기", {
          type: "match.throwTile",
          source: pendingAction.source,
          target: cell
        })
      );
    }

    actions.push({
      id: "cancel-pending",
      label: "던지기 취소",
      clearPendingAction: true
    });
    return actions;
  }

  if (pendingAction?.kind === "specialCard") {
    switch (pendingAction.cardType) {
      case "flameBomb":
      case "electricBomb": {
        if (
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType: pendingAction.cardType,
              targetPosition: cell
            })
          )
        ) {
          actions.push(
            createCommandAction("special-target", `${pendingAction.cardType} 사용`, {
              type: "match.useSpecialCard",
              cardType: pendingAction.cardType,
              targetPosition: cell
            })
          );
        }
        break;
      }
      case "coldBomb": {
        if (
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType: pendingAction.cardType,
              targetPosition: cell
            })
          )
        ) {
          actions.push(
            createCommandAction("cold-bomb-tile", "냉기폭탄 타일 사용", {
              type: "match.useSpecialCard",
              cardType: pendingAction.cardType,
              targetPosition: cell
            })
          );
        }

        const targetPlayer = Object.values(match.players).find(
          (candidate) => candidate.position.x === cell.x && candidate.position.y === cell.y
        );

        if (
          targetPlayer &&
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType: pendingAction.cardType,
              targetPlayerId: targetPlayer.id
            })
          )
        ) {
          actions.push(
            createCommandAction("cold-bomb-player", `${targetPlayer.name}에게 냉기폭탄 사용`, {
              type: "match.useSpecialCard",
              cardType: pendingAction.cardType,
              targetPlayerId: targetPlayer.id
            })
          );
        }
        break;
      }
      case "largeHammer":
        actions.push(...createRotationActions(match, playerId, cell, "largeHammer"));
        break;
      case "fence":
      case "largeFence":
        if (!pendingAction.firstPosition) {
          actions.push(
            createPendingAction(`${pendingAction.cardType}-first`, `${pendingAction.cardType === "largeFence" ? "대형 울타리" : "울타리"} 첫 칸 선택`, {
              ...pendingAction,
              firstPosition: cell
            })
          );
        } else {
          const firstPosition = pendingAction.firstPosition;
          const requiredDistance = pendingAction.cardType === "largeFence" ? 2 : 1;
          const lineDistance = cardinalLineDistance(firstPosition, cell);
          const direction = cardinalDirectionBetween(firstPosition, cell);

          if (!direction || lineDistance !== requiredDistance) {
            break;
          }

          const secondPosition: Position = {
            x: firstPosition.x + (direction === "east" ? 1 : direction === "west" ? -1 : 0),
            y: firstPosition.y + (direction === "south" ? 1 : direction === "north" ? -1 : 0)
          };
          const fencePositions =
            pendingAction.cardType === "largeFence"
              ? ([
                  firstPosition,
                  secondPosition,
                  cell
                ] as const)
              : ([firstPosition, cell] as const);

          if (
            !tryCommand(() =>
              useSpecialCard(match, {
                playerId,
                cardType: pendingAction.cardType,
                fencePositions
              })
            )
          ) {
            break;
          }

          actions.push(
            createCommandAction(
              `${pendingAction.cardType}-place`,
              pendingAction.cardType === "largeFence" ? "여기에 대형 울타리 설치" : "여기에 울타리 설치",
              {
              type: "match.useSpecialCard",
              cardType: pendingAction.cardType,
              fencePositions
            }
            )
          );
        }
        break;
      case "jump":
        if (
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType: "jump",
              targetPosition: cell
            })
          )
        ) {
          actions.push(
            createCommandAction("jump-target", "여기로 뛰어넘기", {
              type: "match.useSpecialCard",
              cardType: "jump",
              targetPosition: cell
            })
          );
        }
        break;
      case "hook": {
        const targetPlayers = Object.values(match.players).filter(
          (candidate) => candidate.position.x === cell.x && candidate.position.y === cell.y
        );

        for (const targetPlayer of targetPlayers) {
          if (
            !tryCommand(() =>
              useSpecialCard(match, {
                playerId,
                cardType: "hook",
                targetPlayerId: targetPlayer.id
              })
            )
          ) {
            continue;
          }

          actions.push(
            createCommandAction(`hook-${targetPlayer.id}`, `${targetPlayer.name}에게 갈고리 사용`, {
              type: "match.useSpecialCard",
              cardType: "hook",
              targetPlayerId: targetPlayer.id
            })
          );
        }
        break;
      }
      case "recoveryPotion":
        if (
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType: "recoveryPotion"
            })
          )
        ) {
          actions.push(
            createCommandAction("recovery-potion", "회복제 사용", {
              type: "match.useSpecialCard",
              cardType: "recoveryPotion"
            })
          );
        }
        break;
    }

    actions.push({
      id: "cancel-pending",
      label: "카드 선택 취소",
      clearPendingAction: true
    });
    return actions;
  }

  const dx = cell.x - player.position.x;
  const dy = cell.y - player.position.y;

  if (Math.abs(dx) + Math.abs(dy) === 1) {
    const direction =
      dx === 1 ? "east" :
      dx === -1 ? "west" :
      dy === 1 ? "south" :
      "north";

    if (tryCommand(() => moveActivePlayer(match, playerId, direction))) {
      actions.push(
        createCommandAction("move-player", "이동하기", {
          type: "match.movePlayer",
          direction
        })
      );
    }
  }

  if (
    cell.x === player.position.x &&
    cell.y === player.position.y &&
    tryCommand(() => openCarriedTreasure(match, playerId))
  ) {
    actions.push(
      createCommandAction("open-treasure", "보물 열기", {
        type: "match.openTreasure"
      })
    );
  }

  const tileKind = getTileKind(match.board, cell);
  const throwTargetsExist =
    ["fire", "water", "electric"].includes(tileKind) &&
    [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 }
    ].some((sourceCheck) => {
      return sourceCheck.x === player.position.x && sourceCheck.y === player.position.y;
    });

  if (throwTargetsExist) {
    const hasAnyThrow = [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x + 2, y: cell.y },
      { x: cell.x + 3, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x - 2, y: cell.y },
      { x: cell.x - 3, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y + 2 },
      { x: cell.x, y: cell.y + 3 },
      { x: cell.x, y: cell.y - 1 },
      { x: cell.x, y: cell.y - 2 },
      { x: cell.x, y: cell.y - 3 }
    ].some((target) =>
      tryCommand(() =>
        throwTile(match, {
          playerId,
          source: cell,
          target
        })
      )
    );

    if (hasAnyThrow) {
      actions.push(
        createPendingAction("begin-throw", "타일 던지기", {
          kind: "throw",
          source: cell
        })
      );
    }
  }

  actions.push(...createRotationActions(match, playerId, cell, "normal"));

  return actions;
}
