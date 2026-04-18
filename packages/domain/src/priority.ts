import type { MatchState, PlayerId, PriorityCard } from "./model.ts";

interface PriorityParticipant {
  readonly playerId: PlayerId;
  readonly seat: number;
  readonly priorityCard: PriorityCard;
}

function clockwiseDistance(
  anchorSeat: number,
  targetSeat: number,
  playerCount: number
): number {
  if (targetSeat >= anchorSeat) {
    return targetSeat - anchorSeat;
  }

  return playerCount - anchorSeat + targetSeat;
}

export function resolvePriorityTurnOrder(
  match: MatchState,
  submittedPriorityCards: Readonly<Record<PlayerId, PriorityCard | null>>
): readonly PlayerId[] {
  const participants: PriorityParticipant[] = [];

  for (const playerId of match.playerOrder) {
      const player = match.players[playerId];
      const priorityCard = submittedPriorityCards[playerId] ?? null;

      if (!player || priorityCard === null || player.eliminated) {
        continue;
      }

      participants.push({
        playerId,
        seat: player.seat,
        priorityCard
      });
  }

  const priorityCounts = new Map<PriorityCard, number>();

  for (const participant of participants) {
    priorityCounts.set(
      participant.priorityCard,
      (priorityCounts.get(participant.priorityCard) ?? 0) + 1
    );
  }

  const uniqueParticipants = participants
    .filter((participant) => priorityCounts.get(participant.priorityCard) === 1)
    .sort((left, right) => right.priorityCard - left.priorityCard);

  const tiedParticipants = participants.filter(
    (participant) => priorityCounts.get(participant.priorityCard) !== 1
  );

  if (participants.length === 0) {
    return [];
  }

  const highestPriority = participants.reduce<number>((max, participant) => {
    return Math.max(max, participant.priorityCard);
  }, 0);
  const anchorParticipant = participants
    .filter((participant) => participant.priorityCard === highestPriority)
    .sort((left, right) => left.seat - right.seat)[0];

  if (!anchorParticipant) {
    return [];
  }

  const tiedOrder = tiedParticipants
    .sort((left, right) => {
      return (
        clockwiseDistance(anchorParticipant.seat, left.seat, match.playerOrder.length) -
        clockwiseDistance(anchorParticipant.seat, right.seat, match.playerOrder.length)
      );
    })
    .map((participant) => participant.playerId);

  return [
    ...uniqueParticipants.map((participant) => participant.playerId),
    ...tiedOrder
  ];
}
