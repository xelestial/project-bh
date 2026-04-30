import {
  DomainError,
  SPECIAL_CARD_TYPES,
  endTurn,
  moveActivePlayer,
  movePosition,
  movePositionByDistance,
  openCarriedTreasure,
  throwTile,
  useSpecialCard,
  type Direction,
  type MatchState,
  type PlayerId,
  type Position,
  type SpecialCardType,
  type TurnStage
} from "../../domain/src/index.ts";
import { listLegalNormalRotationOrigins } from "./rotation-candidates.ts";

const CARDINAL_DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];
const ROTATION_DIRECTIONS = ["clockwise", "counterclockwise"] as const;
const RECTANGLE_ORIENTATIONS = ["horizontal", "vertical"] as const;
const SECONDARY_MOVE_DISTANCE = 2;

export interface TurnAffordances {
  readonly active: boolean;
  readonly stage: TurnStage | null;
  readonly mandatoryMoveTargets: readonly Position[];
  readonly secondaryMoveTargets: readonly Position[];
  readonly rotationOrigins: readonly Position[];
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

function tryCommand(run: () => void): boolean {
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

function createDisabledSpecialCardRecord(): Readonly<Record<SpecialCardType, boolean>> {
  return Object.fromEntries(
    SPECIAL_CARD_TYPES.map((cardType) => [cardType, false])
  ) as Readonly<Record<SpecialCardType, boolean>>;
}

function createInactiveAffordances(): TurnAffordances {
  return {
    active: false,
    stage: null,
    mandatoryMoveTargets: [],
    secondaryMoveTargets: [],
    rotationOrigins: [],
    availableSecondaryActions: {
      move: false,
      throwTile: false,
      rotateTiles: false,
      specialCard: false,
      openTreasure: false,
      endTurn: false
    },
    availableSpecialCards: createDisabledSpecialCardRecord()
  };
}

function listBoardPositions(match: MatchState): readonly Position[] {
  const positions: Position[] = [];

  for (let y = 0; y < match.board.height; y += 1) {
    for (let x = 0; x < match.board.width; x += 1) {
      positions.push({ x, y });
    }
  }

  return positions;
}

function collectLegalMoveTargets(
  match: MatchState,
  playerId: PlayerId
): readonly Position[] {
  const player = match.players[playerId];

  if (!player) {
    return [];
  }

  const moveDistance =
    match.round.turn?.playerId === playerId && match.round.turn.stage === "secondaryAction"
      ? SECONDARY_MOVE_DISTANCE
      : 1;

  return CARDINAL_DIRECTIONS.flatMap((direction) => {
    if (!tryCommand(() => moveActivePlayer(match, playerId, direction))) {
      return [];
    }

    return [movePositionByDistance(player.position, direction, moveDistance)];
  });
}

function hasAnyLegalThrow(match: MatchState, playerId: PlayerId): boolean {
  const player = match.players[playerId];

  if (!player) {
    return false;
  }

  for (const sourceDirection of CARDINAL_DIRECTIONS) {
    const source = movePosition(player.position, sourceDirection);

    for (const throwDirection of CARDINAL_DIRECTIONS) {
      for (let distance = 1; distance <= 3; distance += 1) {
        const target = {
          x: source.x + (throwDirection === "east" ? distance : throwDirection === "west" ? -distance : 0),
          y: source.y + (throwDirection === "south" ? distance : throwDirection === "north" ? -distance : 0)
        };

        if (
          tryCommand(() =>
            throwTile(match, {
              playerId,
              source,
              target
            })
          )
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function canUseSpecialCardType(
  match: MatchState,
  playerId: PlayerId,
  cardType: SpecialCardType
): boolean {
  if (cardType === "flameBomb" || cardType === "electricBomb") {
    return listBoardPositions(match).some((targetPosition) =>
      tryCommand(() =>
        useSpecialCard(match, {
          playerId,
          cardType,
          targetPosition
        })
      )
    );
  }

  if (cardType === "coldBomb") {
    const canTargetPlayer = Object.values(match.players).some((targetPlayer) =>
      tryCommand(() =>
        useSpecialCard(match, {
          playerId,
          cardType,
          targetPlayerId: targetPlayer.id
        })
      )
    );

    if (canTargetPlayer) {
      return true;
    }

    return listBoardPositions(match).some((targetPosition) =>
      tryCommand(() =>
        useSpecialCard(match, {
          playerId,
          cardType,
          targetPosition
        })
      )
    );
  }

  if (cardType === "largeHammer") {
    const hasCrossRotation = listBoardPositions(match).some((center) =>
      ROTATION_DIRECTIONS.some((direction) =>
        tryCommand(() =>
          useSpecialCard(match, {
            playerId,
            cardType,
            selection: {
              kind: "cross5",
              center
            },
            direction
          })
        )
      )
    );

    if (hasCrossRotation) {
      return true;
    }

    return listBoardPositions(match).some((origin) =>
      RECTANGLE_ORIENTATIONS.some((orientation) =>
        ROTATION_DIRECTIONS.some((direction) =>
          tryCommand(() =>
            useSpecialCard(match, {
              playerId,
              cardType,
              selection: {
                kind: "rectangle6",
                origin,
                orientation
              },
              direction
            })
          )
        )
      )
    );
  }

  if (cardType === "recoveryPotion") {
    return tryCommand(() =>
      useSpecialCard(match, {
        playerId,
        cardType
      })
    );
  }

  if (cardType === "jump") {
    return listBoardPositions(match).some((targetPosition) =>
      tryCommand(() =>
        useSpecialCard(match, {
          playerId,
          cardType,
          targetPosition
        })
      )
    );
  }

  if (cardType === "hook") {
    return Object.values(match.players).some((targetPlayer) => {
      if (targetPlayer.id === playerId) {
        return false;
      }

      return tryCommand(() =>
        useSpecialCard(match, {
          playerId,
          cardType,
          targetPlayerId: targetPlayer.id
        })
      );
    });
  }

  if (cardType === "fence" || cardType === "largeFence") {
    return listBoardPositions(match).some((firstPosition) =>
      CARDINAL_DIRECTIONS.some((direction) => {
        const fencePositions =
          cardType === "largeFence"
            ? ([
                firstPosition,
                movePosition(firstPosition, direction),
                movePosition(movePosition(firstPosition, direction), direction)
              ] as const)
            : ([firstPosition, movePosition(firstPosition, direction)] as const);

        return tryCommand(() =>
          useSpecialCard(match, {
            playerId,
            cardType,
            fencePositions
          })
        );
      })
    );
  }

  return false;
}

export function queryTurnAffordances(
  match: MatchState,
  playerId: PlayerId
): TurnAffordances {
  if (
    match.round.phase !== "inTurn" ||
    match.round.activePlayerId !== playerId ||
    match.round.turn?.playerId !== playerId
  ) {
    return createInactiveAffordances();
  }

  const stage = match.round.turn.stage;

  if (stage === "mandatoryStep") {
    const mandatoryMoveTargets = collectLegalMoveTargets(match, playerId);

    return {
      active: true,
      stage,
      mandatoryMoveTargets,
      secondaryMoveTargets: [],
      rotationOrigins: [],
      availableSecondaryActions: {
        move: false,
        throwTile: false,
        rotateTiles: false,
        specialCard: false,
        openTreasure: tryCommand(() => openCarriedTreasure(match, playerId)),
        endTurn: false
      },
      availableSpecialCards: createDisabledSpecialCardRecord()
    };
  }

  const player = match.players[playerId];

  if (!player) {
    return createInactiveAffordances();
  }

  const secondaryMoveTargets = collectLegalMoveTargets(match, playerId);
  const rotationOrigins = listLegalNormalRotationOrigins(match, playerId);
  const availableSpecialCards = Object.fromEntries(
    SPECIAL_CARD_TYPES.map((cardType) => [
      cardType,
      player.specialInventory[cardType] > 0 && canUseSpecialCardType(match, playerId, cardType)
    ])
  ) as Readonly<Record<SpecialCardType, boolean>>;
  const hasSpecialCardAction = Object.values(availableSpecialCards).some(Boolean);

  return {
    active: true,
    stage,
    mandatoryMoveTargets: [],
    secondaryMoveTargets,
    rotationOrigins,
    availableSecondaryActions: {
      move: secondaryMoveTargets.length > 0,
      throwTile: hasAnyLegalThrow(match, playerId),
      rotateTiles: rotationOrigins.length > 0,
      specialCard: hasSpecialCardAction,
      openTreasure: tryCommand(() => openCarriedTreasure(match, playerId)),
      endTurn: tryCommand(() => endTurn(match, playerId))
    },
    availableSpecialCards
  };
}
