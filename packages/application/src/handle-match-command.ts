import {
  DomainError,
  endTurn,
  moveActivePlayer,
  openCarriedTreasure,
  placeTreasure,
  prepareNextRound,
  rotateTiles,
  submitAuctionBids,
  submitPriorityCard,
  throwTile,
  useSpecialCard,
  type DomainEvent,
  type MatchState
} from "../../domain/src/index.ts";
import type { CommandHandlingResult, MatchCommand } from "./commands.ts";

function success(state: MatchState, events: readonly DomainEvent[]): CommandHandlingResult {
  return {
    state,
    events,
    rejection: null
  };
}

export function handleMatchCommand(
  state: MatchState,
  command: MatchCommand
): CommandHandlingResult {
  try {
    switch (command.type) {
      case "match.submitAuctionBids": {
        const result = submitAuctionBids(state, command.playerId, command.bids);
        return success(result.state, result.events);
      }

      case "match.submitPriority": {
        const result = submitPriorityCard(state, command.playerId, command.priorityCard);
        return success(result.state, result.events);
      }

      case "match.placeTreasure": {
        const result = placeTreasure(state, {
          playerId: command.playerId,
          treasureId: command.treasureId,
          position: command.position
        });
        return success(result.state, result.events);
      }

      case "match.movePlayer": {
        const result = moveActivePlayer(state, command.playerId, command.direction);
        return success(result.state, result.events);
      }

      case "match.throwTile": {
        const result = throwTile(state, {
          playerId: command.playerId,
          source: command.source,
          target: command.target
        });
        return success(result.state, result.events);
      }

      case "match.rotateTiles": {
        const result = rotateTiles(state, {
          playerId: command.playerId,
          selection: command.selection,
          direction: command.direction
        });
        return success(result.state, result.events);
      }

      case "match.useSpecialCard": {
        const input = {
          playerId: command.playerId,
          cardType: command.cardType
        } as {
          playerId: string;
          cardType: typeof command.cardType;
          targetPosition?: typeof command.targetPosition;
          targetPlayerId?: typeof command.targetPlayerId;
          fencePositions?: typeof command.fencePositions;
          selection?: typeof command.selection;
          direction?: typeof command.direction;
        };

        if (command.targetPosition) {
          input.targetPosition = command.targetPosition;
        }

        if (command.targetPlayerId) {
          input.targetPlayerId = command.targetPlayerId;
        }

        if (command.fencePositions) {
          input.fencePositions = command.fencePositions;
        }

        if (command.selection) {
          input.selection = command.selection;
        }

        if (command.direction) {
          input.direction = command.direction;
        }

        const result = useSpecialCard(state, input);
        return success(result.state, result.events);
      }

      case "match.openTreasure": {
        const result = openCarriedTreasure(state, command.playerId);
        return success(result.state, result.events);
      }

      case "match.endTurn": {
        const result = endTurn(state, command.playerId);
        return success(result.state, result.events);
      }

      case "match.prepareNextRound": {
        const result = prepareNextRound(
          state,
          command.treasurePlacements
            ? {
                treasurePlacements: command.treasurePlacements
              }
            : {}
        );
        return success(result.state, result.events);
      }
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        state,
        events: [],
        rejection: {
          code: error.code,
          message: error.message
        }
      };
    }

    throw error;
  }
}
