import { type CSSProperties, type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  ActionCandidate,
  ActionCommandPayload,
  PendingCellAction
} from "../../../packages/protocol/src/index.ts";
import {
  SPECIAL_CARD_TYPES,
  type SpecialCardType
} from "../../../packages/domain/src/index.ts";
import {
  createBrowserTransportConfig,
  resolveHttpUrl,
  resolveWebSocketUrl
} from "./runtime-transport.ts";
import {
  getPlayerIconSrc,
  getSpecialCardIconSrc,
  getTileIconSrc,
  getTreasureIconSrc
} from "./ui-assets.ts";

type RoomStatus = "lobby" | "started";
type TurnStage = "mandatoryStep" | "secondaryAction";

interface RoomPlayer {
  id: string;
  name: string;
}

interface RoomState {
  roomId: string;
  inviteCode: string;
  hostPlayerId: string;
  desiredPlayerCount: number;
  players: RoomPlayer[];
  status: RoomStatus;
  sessionId: string | null;
}

interface ProjectedSnapshot {
  sessionId: string;
  logLength: number;
  state: {
    matchId: string;
    settings: {
      totalRounds: number;
      roundOpenTreasureTarget: number;
      rotationZone: {
        origin: { x: number; y: number };
        width: number;
        height: number;
      };
      treasurePlacementZone: {
        origin: { x: number; y: number };
        width: number;
        height: number;
      };
    };
    treasureBoard: {
      slots: {
        slot: number;
        hasCard: boolean;
        opened: boolean;
        openedByPlayerId: string | null;
      }[];
    };
    players: Record<
      string,
      {
        id: string;
        name: string;
        seat: number;
        position: { x: number; y: number };
        score: number;
        hitPoints: number;
        eliminated: boolean;
        carryingTreasure: boolean;
      }
    >;
    treasures: Record<
      string,
      {
        id: string;
        position: { x: number; y: number } | null;
        carriedByPlayerId: string | null;
        openedByPlayerId: string | null;
        removedFromRound: boolean;
      }
    >;
    board: {
      tiles: Record<string, { kind: string }>;
      fences: Record<string, { id: string; positions: { x: number; y: number }[] }>;
    };
    round: {
      roundNumber: number;
      phase: string;
      activePlayerId: string | null;
      turnOrder: string[];
      turn: {
        playerId: string;
        stage: TurnStage;
        mandatoryStepDirection: "north" | "east" | "south" | "west" | null;
      } | null;
      auction: {
        currentOffer: { slot: number; cardType: SpecialCardType } | null;
        resolvedOffers: Record<string, SpecialCardType | null>;
        hasSubmittedBid: boolean;
      };
    };
    completed: boolean;
    result: { winnerPlayerIds: string[]; highestScore: number } | null;
  };
  viewer: {
    playerId: string;
    self: {
      id: string;
      carriedTreasureId: string | null;
      openedTreasureIds: string[];
      availablePriorityCards: number[];
      specialInventory: Record<SpecialCardType, number>;
      status: {
        fire: boolean;
        water: boolean;
        skipNextTurnCount: number;
        movementLimit: number | null;
      };
    };
    treasurePlacementHand: {
      id: string;
      slot: number | null;
      points: number;
      isFake: boolean;
    }[];
    revealedTreasureCards: {
      id: string;
      slot: number;
      points: number;
    }[];
    turnHints: {
      active: boolean;
      stage: TurnStage | null;
      mandatoryMoveTargets: { x: number; y: number }[];
      secondaryMoveTargets: { x: number; y: number }[];
      rotationOrigins: { x: number; y: number }[];
      availableSecondaryActions: {
        move: boolean;
        throwTile: boolean;
        rotateTiles: boolean;
        specialCard: boolean;
        openTreasure: boolean;
        endTurn: boolean;
      };
      availableSpecialCards: Record<SpecialCardType, boolean>;
    };
  };
}

interface RoomEnvelope {
  room: RoomState;
  snapshot: ProjectedSnapshot | null;
}

interface AuthenticatedRoomResponse {
  room: RoomState;
  playerId: string;
  sessionToken: string;
}

interface CommandResponse {
  rejection: { message: string } | null;
  snapshot: ProjectedSnapshot | null;
}

interface ActionQueryResponse {
  actions: ActionCandidate[];
}

interface ContextMenuState {
  x: number;
  y: number;
  actions: ActionCandidate[];
  cell: { x: number; y: number };
}

interface InvitePreviewResponse {
  room: RoomState;
}

interface RecentRoomEntry {
  inviteCode: string;
  roomId: string;
  playerCount: number;
  desiredPlayerCount: number;
  status: RoomStatus;
  lastSeenAt: string;
}

const PLAYER_NAME_STORAGE_KEY = "project-bh.player-name";
const RECENT_ROOMS_STORAGE_KEY = "project-bh.recent-rooms";
const ACTIVE_SESSION_STORAGE_KEY = "project-bh.active-session";

interface ActiveSessionEntry {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function readRecentRooms(): RecentRoomEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ROOMS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is RecentRoomEntry => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        "inviteCode" in entry &&
        typeof entry.inviteCode === "string" &&
        "roomId" in entry &&
        typeof entry.roomId === "string" &&
        "playerCount" in entry &&
        typeof entry.playerCount === "number" &&
        "desiredPlayerCount" in entry &&
        typeof entry.desiredPlayerCount === "number" &&
        "status" in entry &&
        (entry.status === "lobby" || entry.status === "started") &&
        "lastSeenAt" in entry &&
        typeof entry.lastSeenAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeRecentRooms(entries: readonly RecentRoomEntry[]): void {
  window.localStorage.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(entries));
}

function readActiveSession(): ActiveSessionEntry | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "roomId" in parsed &&
      typeof parsed.roomId === "string" &&
      "playerId" in parsed &&
      typeof parsed.playerId === "string" &&
      "sessionToken" in parsed &&
      typeof parsed.sessionToken === "string"
    ) {
      return {
        roomId: parsed.roomId,
        playerId: parsed.playerId,
        sessionToken: parsed.sessionToken
      };
    }
  } catch {
    return null;
  }

  return null;
}

function writeActiveSession(entry: ActiveSessionEntry): void {
  window.sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(entry));
}

function clearActiveSession(): void {
  window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

function upsertRecentRoom(room: RoomState): RecentRoomEntry[] {
  const nextEntry: RecentRoomEntry = {
    inviteCode: room.inviteCode,
    roomId: room.roomId,
    playerCount: room.players.length,
    desiredPlayerCount: room.desiredPlayerCount,
    status: room.status,
    lastSeenAt: new Date().toISOString()
  };
  const others = readRecentRooms().filter((entry) => entry.inviteCode !== room.inviteCode);
  const next = [nextEntry, ...others].slice(0, 6);
  writeRecentRooms(next);
  return next;
}

function buildInviteLink(location: Location, inviteCode: string): string {
  const url = new URL(location.href);
  url.searchParams.set("invite", inviteCode);
  return url.toString();
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error("Clipboard is not available in this browser.");
}

async function requestJson<TValue>(url: string, init?: RequestInit): Promise<TValue> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
  const payload = (await response.json()) as TValue | { error: string };

  if (!response.ok) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      throw new Error(payload.error);
    }

    throw new Error("Request failed.");
  }

  return payload as TValue;
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

function formatTurnStage(stage: TurnStage | null): string {
  switch (stage) {
    case "mandatoryStep":
      return "1칸 이동";
    case "secondaryAction":
      return "+2 선택";
    default:
      return "대기";
  }
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

const AUCTION_BID_PRESETS = [0, 1, 2, 3, 4, 5] as const;

function formatSpecialCardLabel(cardType: SpecialCardType): string {
  return SPECIAL_CARD_LABELS[cardType];
}

function pendingActionLabel(pendingAction: PendingCellAction | null, snapshot: ProjectedSnapshot | null): string | null {
  if (!pendingAction) {
    return null;
  }

  switch (pendingAction.kind) {
    case "throw":
      return `타일 던지기 준비 (${pendingAction.source.x},${pendingAction.source.y})`;
    case "treasurePlacement": {
      const card = snapshot?.viewer.treasurePlacementHand.find((candidate) => candidate.id === pendingAction.treasureId);

      if (!card) {
        return "보물 배치 준비";
      }

      return card.isFake
        ? "가짜 카드 확인 중"
        : `보물 배치 준비 (슬롯 ${card.slot}, ${formatPoints(card.points)})`;
    }
    case "specialCard":
      return pendingAction.kind === "specialCard" && pendingAction.firstPosition
        ? `${
            pendingAction.cardType === "largeFence"
              ? `${formatSpecialCardLabel(pendingAction.cardType)} 끝칸 선택`
              : `${formatSpecialCardLabel(pendingAction.cardType)} 두 번째 칸 선택`
          }`
        : `${formatSpecialCardLabel(pendingAction.cardType)} 대상 선택`;
  }
}

function ActionStatusStrip(props: {
  snapshot: ProjectedSnapshot;
  isMyTurn: boolean;
  rotationMode: boolean;
  onToggleRotationMode: () => void;
}) {
  const { turnHints } = props.snapshot.viewer;
  const rotationOrigins = turnHints.rotationOrigins ?? [];
  const items = [
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
      label: "추가 이동",
      enabled: turnHints.availableSecondaryActions.move,
      current: false,
      detail: turnHints.availableSecondaryActions.move
        ? `${turnHints.secondaryMoveTargets.length}칸 가능`
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
      current: props.rotationMode,
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
  ];

  return (
    <section className="action-status-strip">
      <strong>{props.isMyTurn ? `현재 단계: ${formatTurnStage(turnHints.stage)}` : "상대 턴 진행 중"}</strong>
      {items.map((item) => (
        item.label === "회전하기" ? (
        <button
          key={item.label}
          type="button"
          className={`action-chip action-chip-button ${item.current ? "is-current" : item.enabled ? "is-enabled" : "is-disabled"}`}
          disabled={!item.enabled}
          onClick={props.onToggleRotationMode}
        >
          <span>{item.label}</span>
          <small>{item.detail}</small>
        </button>
        ) : (
        <span
          key={item.label}
          className={`action-chip ${item.current ? "is-current" : item.enabled ? "is-enabled" : "is-disabled"}`}
        >
          <span>{item.label}</span>
          <small>{item.detail}</small>
        </span>
        )
      ))}
    </section>
  );
}

function RecentRoomsPanel(props: {
  rooms: readonly RecentRoomEntry[];
  onUseInviteCode: (inviteCode: string) => void;
}) {
  if (props.rooms.length === 0) {
    return null;
  }

  return (
    <section className="panel recent-panel">
      <h2>Recent Parties</h2>
      <div className="recent-room-list">
        {props.rooms.map((room) => (
          <button
            key={`${room.inviteCode}-${room.lastSeenAt}`}
            className="recent-room-card"
            onClick={() => props.onUseInviteCode(room.inviteCode)}
          >
            <strong>{room.inviteCode}</strong>
            <span>{room.playerCount}/{room.desiredPlayerCount} players</span>
            <span>{room.status === "lobby" ? "waiting room" : "started match"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ContextMenu(props: {
  menu: ContextMenuState;
  onSelect: (action: ActionCandidate) => void;
}) {
  return (
    <div className="context-menu" data-testid="context-menu" style={{ left: props.menu.x, top: props.menu.y }}>
      {props.menu.actions.map((action) => (
        <button
          key={action.id}
          className="context-action"
          data-action-id={action.id}
          onClick={() => props.onSelect(action)}
        >
          <span>{action.label}</span>
          {action.description ? <small>{action.description}</small> : null}
        </button>
      ))}
    </div>
  );
}

function StatPill(props: { icon: string; label: string; value: string }) {
  return (
    <div className="stat-pill" title={props.label}>
      <img className="stat-pill-icon" src={props.icon} alt="" draggable="false" />
      <span className="stat-pill-value">{props.value}</span>
    </div>
  );
}

function Scoreboard(props: { snapshot: ProjectedSnapshot }) {
  const players = Object.values(props.snapshot.state.players).sort((left, right) => left.seat - right.seat);

  return (
    <section className="scoreboard-strip">
      {players.map((player) => (
        <article key={player.id} className={`score-card player-card ${player.eliminated ? "is-eliminated" : ""}`}>
          <div className="player-card-identity">
            <strong>{player.name}</strong>
            {player.eliminated ? <span className="card-corner-chip is-muted">탈락</span> : null}
          </div>
          <div className="score-card-stats player-card-stats">
            <StatPill icon="/icons/score-treasure.svg" label="점수" value={`${player.score}`} />
            <StatPill icon="/icons/hp-heart.svg" label="HP" value={`${player.hitPoints}`} />
            {player.carryingTreasure ? (
              <StatPill icon="/icons/treasure-closed.svg" label="보물 운반중" value="운반" />
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function TreasureBoardStrip(props: { snapshot: ProjectedSnapshot }) {
  return (
    <section className="treasure-slot-strip">
      {props.snapshot.state.treasureBoard.slots.map((slot) => {
        const opener = slot.openedByPlayerId ? props.snapshot.state.players[slot.openedByPlayerId] : null;
        const openerSeatClass = opener ? `seat-${opener.seat}` : "";

        return (
          <article
            key={slot.slot}
            className={`score-card treasure-slot-card ${slot.opened ? "is-opened" : ""} ${openerSeatClass}`}
          >
            <span className="card-corner-chip treasure-slot-chip">슬롯 {slot.slot}</span>
            <div className="treasure-slot-figure" aria-hidden="true">
              {slot.opened ? (
                <span className={`treasure-slot-open-frame ${openerSeatClass}`}>
                  <span className="treasure-slot-open-shell" />
                  <img
                    className="treasure-slot-icon treasure-slot-icon-open"
                    src="/icons/treasure-gem.svg"
                    alt=""
                    draggable="false"
                  />
                </span>
              ) : (
                <img
                  className="treasure-slot-icon"
                  src="/icons/treasure-slot-closed.svg"
                  alt=""
                  draggable="false"
                />
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function PriorityCardButtons(props: {
  snapshot: ProjectedSnapshot;
  isMyTurn: boolean;
  onSubmit: (priorityCard: number) => void;
}) {
  const availableCards = new Set(props.snapshot.viewer.self.availablePriorityCards);

  return (
    <div className="priority-card-rack">
      {[1, 2, 3, 4, 5, 6].map((card) => {
        const isUsed = !availableCards.has(card);

        return (
          <button
            key={card}
            className={`priority-card ${isUsed ? "is-used" : ""}`}
            data-priority-card={card}
            disabled={
              !props.isMyTurn ||
              props.snapshot.state.round.phase !== "prioritySubmission" ||
              isUsed
            }
            onClick={() => props.onSubmit(card)}
          >
            <span className="card-corner-chip">우선</span>
            <span className="priority-card-corner priority-card-corner-bottom" aria-hidden="true">
              {card}
            </span>
            <span className="priority-card-state" aria-hidden="true">
              {isUsed ? "사용" : "대기"}
            </span>
            <strong>{card}</strong>
            <small>{isUsed ? "사용 완료" : "사용 가능"}</small>
          </button>
        );
      })}
    </div>
  );
}

function PriorityCardsRack(props: {
  snapshot: ProjectedSnapshot;
  isMyTurn: boolean;
  onSubmit: (priorityCard: number) => void;
}) {
  return (
    <section className="phase-card priority-card-panel">
      <div className="phase-card-heading">
        <strong>Priority Cards</strong>
        <span className="phase-card-caption">1-6를 카드로 유지하고, 사용한 카드는 회색으로 남깁니다.</span>
      </div>
      <PriorityCardButtons snapshot={props.snapshot} isMyTurn={props.isMyTurn} onSubmit={props.onSubmit} />
    </section>
  );
}

function TurnOrderStrip(props: { snapshot: ProjectedSnapshot; compact?: boolean }) {
  const turnOrder = props.snapshot.state.round.turnOrder;
  const players = props.snapshot.state.players;
  const seatOrder = Object.values(players).sort((left, right) => left.seat - right.seat);
  const resolvedOrder = turnOrder.length > 0 ? turnOrder : seatOrder.map((player) => player.id);
  const isResolved = turnOrder.length > 0;
  const gridTemplateColumns = resolvedOrder
    .flatMap((_, index) =>
      index === resolvedOrder.length - 1 ? ["minmax(0, 1fr)"] : ["minmax(0, 1fr)", "2.4rem"]
    )
    .join(" ");

  return (
    <section className={`phase-card turn-order-panel ${props.compact ? "is-compact" : ""}`}>
      <div className="phase-card-heading turn-order-heading">
        <strong>Turn Order</strong>
        <span className="phase-card-caption">{isResolved ? "우선권 제출 결과" : "참가 순서"}</span>
      </div>
      <div
        className={`turn-order-flow ${isResolved ? "is-resolved" : "is-preview"}`}
        aria-label="Turn order"
        style={{ gridTemplateColumns } as CSSProperties}
      >
        {resolvedOrder.flatMap((playerId, index) => {
          const player = players[playerId] ?? seatOrder.find((candidate) => candidate.id === playerId);
          const seat = player?.seat ?? index;
          const iconSrc = getPlayerIconSrc(seat);
          const node = (
            <span
              key={playerId}
              className={`turn-order-node seat-${seat} ${playerId === props.snapshot.viewer.playerId ? "is-self" : ""} ${playerId === props.snapshot.state.round.activePlayerId ? "is-active" : ""} ${isResolved ? "" : "is-placeholder"}`}
            >
              <span className="turn-order-node-order">{index + 1}</span>
              <img className="turn-order-node-icon" src={iconSrc} alt="" draggable="false" />
              <span className="turn-order-node-copy">
                <strong>{player?.name ?? playerId}</strong>
                <small>{isResolved ? "우선권 확정" : "참가 순서"}</small>
              </span>
            </span>
          );

          if (index === resolvedOrder.length - 1) {
            return [node];
          }

          return [
            node,
            <span key={`${playerId}-arrow-${index}`} className="turn-order-arrow" aria-hidden="true">
              <img className="turn-order-arrow-icon" src="/icons/turn-order-arrow.svg" alt="" draggable="false" />
            </span>
          ];
        })}
      </div>
    </section>
  );
}

function getSquare2PreviewCells(origin: { x: number; y: number } | null): { x: number; y: number }[] {
  if (!origin) {
    return [];
  }

  return [
    origin,
    { x: origin.x + 1, y: origin.y },
    { x: origin.x, y: origin.y + 1 },
    { x: origin.x + 1, y: origin.y + 1 }
  ];
}

function getRoomPlayerName(room: RoomState, playerId: string): string {
  return room.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function getSnapshotPlayerName(snapshot: ProjectedSnapshot, playerId: string | null): string {
  if (!playerId) {
    return "-";
  }

  return snapshot.state.players[playerId]?.name ?? playerId;
}

function AuctionOverlay(props: {
  snapshot: ProjectedSnapshot;
  auctionAmount: string;
  maxBid: number;
  onChangeAuctionAmount: (value: string) => void;
  onSubmitBid: () => void;
  onPurchaseFence: () => void;
  onPurchaseLargeFence: () => void;
}) {
  const currentOffer = props.snapshot.state.round.auction.currentOffer;

  if (!currentOffer) {
    return null;
  }

  return (
    <div className="auction-overlay" data-testid="auction-overlay">
      <section className="auction-modal">
        <div className="auction-modal-copy">
          <span className="section-kicker">Special Auction</span>
          <h3>이번 경매 카드</h3>
          <p>점수를 입찰해 특수카드를 확보하거나, 상시 구매 울타리류를 고를 수 있습니다.</p>
        </div>

        <div className="auction-modal-layout">
          <article className="overlay-card auction-showcase-card">
            <span className="card-corner-chip">공개</span>
            <img
              className="auction-showcase-icon"
              src={getSpecialCardIconSrc(currentOffer.cardType)}
              alt=""
              draggable="false"
            />
            <strong>{formatSpecialCardLabel(currentOffer.cardType)}</strong>
            <small>{SPECIAL_CARD_TARGET_HINTS[currentOffer.cardType]}</small>
          </article>

          <div className="auction-controls">
            <div className="auction-bid-panel">
              <label className="auction-input-label">
                <span>내 입찰 점수</span>
                <div className="auction-input-with-icon">
                  <img src="/icons/score-treasure.svg" alt="" draggable="false" />
                  <input
                    data-testid="auction-bid-input"
                    type="number"
                    min="0"
                    max={String(props.maxBid)}
                    value={props.auctionAmount}
                    onChange={(event) => props.onChangeAuctionAmount(event.target.value)}
                    disabled={props.snapshot.state.round.auction.hasSubmittedBid}
                  />
                </div>
              </label>
              <div className="auction-bid-presets">
                {AUCTION_BID_PRESETS.filter((value) => value <= props.maxBid).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="auction-preset"
                    disabled={props.snapshot.state.round.auction.hasSubmittedBid}
                    onClick={() => props.onChangeAuctionAmount(String(value))}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button
                data-testid="auction-submit-button"
                className="auction-primary-button"
                disabled={props.snapshot.state.round.auction.hasSubmittedBid}
                onClick={props.onSubmitBid}
              >
                입찰 제출
              </button>
            </div>

            <article className="overlay-card auction-buyout-card">
              <span className="card-corner-chip">상시</span>
              <img className="auction-showcase-icon" src={getSpecialCardIconSrc("fence")} alt="" draggable="false" />
              <strong>울타리</strong>
              <small>보물 점수 1로 즉시 구매</small>
              <button
                data-testid="auction-buy-fence-button"
                className="auction-secondary-button"
                disabled={props.snapshot.state.round.auction.hasSubmittedBid || props.maxBid < 1}
                onClick={props.onPurchaseFence}
              >
                울타리 구매
              </button>
            </article>

            <article className="overlay-card auction-buyout-card">
              <span className="card-corner-chip">상시</span>
              <img className="auction-showcase-icon" src={getSpecialCardIconSrc("largeFence")} alt="" draggable="false" />
              <strong>대형 울타리</strong>
              <small>보물 점수 2로 즉시 구매</small>
              <button
                data-testid="auction-buy-large-fence-button"
                className="auction-secondary-button"
                disabled={props.snapshot.state.round.auction.hasSubmittedBid || props.maxBid < 2}
                onClick={props.onPurchaseLargeFence}
              >
                대형 울타리 구매
              </button>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

function BoardView(props: {
  snapshot: ProjectedSnapshot;
  playerId: string;
  highlightedCells: readonly { x: number; y: number }[];
  highlightTone: TurnStage | null;
  rotationMode: boolean;
  rotationOrigins: readonly { x: number; y: number }[];
  selectedRotationOrigin: { x: number; y: number } | null;
  hoveredRotationOrigin: { x: number; y: number } | null;
  rotationPreviewCells: readonly { x: number; y: number }[];
  onRotationCellSelect: (event: MouseEvent<HTMLButtonElement>, cell: { x: number; y: number }) => void;
  onRotationCellHover: (cell: { x: number; y: number } | null) => void;
  onCellContextMenu: (event: MouseEvent<HTMLButtonElement>, cell: { x: number; y: number }) => void;
}) {
  const zone = props.snapshot.state.settings.rotationZone;
  const treasureZone = props.snapshot.state.settings.treasurePlacementZone;

  return (
    <div className="board">
      {Array.from({ length: 20 * 20 }, (_, index) => {
        const x = index % 20;
        const y = Math.floor(index / 20);
        const key = `${x},${y}`;
        const tile = props.snapshot.state.board.tiles[key]?.kind ?? "";
        const players = Object.values(props.snapshot.state.players).filter(
          (player) => player.position.x === x && player.position.y === y && !player.eliminated
        );
        const treasures = Object.values(props.snapshot.state.treasures).filter(
          (treasure) => treasure.position?.x === x && treasure.position?.y === y && !treasure.removedFromRound
        );
        const inZone =
          x >= zone.origin.x &&
          x < zone.origin.x + zone.width &&
          y >= zone.origin.y &&
          y < zone.origin.y + zone.height;
        const inTreasureZone =
          x >= treasureZone.origin.x &&
          x < treasureZone.origin.x + treasureZone.width &&
          y >= treasureZone.origin.y &&
          y < treasureZone.origin.y + treasureZone.height;
        const zoneEdge = [
          y === zone.origin.y ? "zone-top" : "",
          y === zone.origin.y + zone.height - 1 ? "zone-bottom" : "",
          x === zone.origin.x ? "zone-left" : "",
          x === zone.origin.x + zone.width - 1 ? "zone-right" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const treasureZoneEdge = [
          y === treasureZone.origin.y ? "treasure-zone-top" : "",
          y === treasureZone.origin.y + treasureZone.height - 1 ? "treasure-zone-bottom" : "",
          x === treasureZone.origin.x ? "treasure-zone-left" : "",
          x === treasureZone.origin.x + treasureZone.width - 1 ? "treasure-zone-right" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const isHighlighted = props.highlightedCells.some((cell) => cell.x === x && cell.y === y);
        const isRotationOrigin = props.rotationOrigins.some((cell) => cell.x === x && cell.y === y);
        const isSelectedRotationOrigin =
          props.selectedRotationOrigin?.x === x && props.selectedRotationOrigin?.y === y;
        const isHoveredRotationOrigin =
          props.hoveredRotationOrigin?.x === x && props.hoveredRotationOrigin?.y === y;
        const isRotationPreviewCell = props.rotationPreviewCells.some((cell) => cell.x === x && cell.y === y);
        const highlightClass =
          isHighlighted && props.highlightTone === "mandatoryStep"
            ? "mandatory-move"
            : isHighlighted && props.highlightTone === "secondaryAction"
              ? "secondary-move"
              : props.rotationMode && isRotationPreviewCell
                ? isSelectedRotationOrigin
                  ? "rotation-origin is-selected-rotation-origin rotation-preview-origin rotation-preview-cell"
                  : isHoveredRotationOrigin
                    ? "rotation-origin rotation-preview-origin rotation-preview-cell"
                    : "rotation-preview-cell"
              : props.rotationMode && isRotationOrigin
                ? isSelectedRotationOrigin
                  ? "rotation-origin is-selected-rotation-origin"
                  : "rotation-origin"
                : "";

        return (
          <button
            type="button"
            key={key}
            className={`cell tile-${tile || "plain"} ${inZone ? "in-zone" : ""} ${inTreasureZone ? "in-treasure-zone" : ""} ${zoneEdge} ${treasureZoneEdge} ${highlightClass}`}
            data-cell={key}
            aria-label={`${key}${tile ? ` ${tile}` : ""}${players.length > 0 ? ` ${players.map((player) => player.name).join(", ")}` : ""}${treasures.length > 0 ? ` ${treasures.length} treasure(s)` : ""}`}
            title={`${key}${tile ? ` · ${tile}` : ""}`}
            onClick={(event) => {
              if (!props.rotationMode || !isRotationOrigin) {
                return;
              }

              props.onRotationCellSelect(event, { x, y });
            }}
            onMouseEnter={() => {
              if (!props.rotationMode || !isRotationOrigin) {
                return;
              }

              props.onRotationCellHover({ x, y });
            }}
            onMouseLeave={() => {
              if (!props.rotationMode) {
                return;
              }

              props.onRotationCellHover(null);
            }}
            onContextMenu={(event) => props.onCellContextMenu(event, { x, y })}
          >
            {isHighlighted ? (
              <span className={`hint-badge ${props.highlightTone === "mandatoryStep" ? "hint-step" : "hint-action"}`}>
                {props.highlightTone === "mandatoryStep" ? "1" : "+2"}
              </span>
            ) : null}
            {props.rotationMode && isRotationOrigin ? (
              <span className={`hint-badge rotation-hint ${isSelectedRotationOrigin ? "is-selected" : ""}`}>회전</span>
            ) : null}
            {tile ? (
              <span className="badge asset-badge tile-badge" aria-hidden="true">
                {getTileIconSrc(tile) ? <img className="asset-icon tile-icon" src={getTileIconSrc(tile) ?? ""} alt="" draggable="false" /> : null}
              </span>
            ) : null}
            {treasures.map((treasure) => (
              <span key={treasure.id} className="badge asset-badge treasure-badge" aria-hidden="true">
                <img
                  className="asset-icon treasure-icon"
                  src={getTreasureIconSrc(Boolean(treasure.openedByPlayerId))}
                  alt=""
                  draggable="false"
                />
              </span>
            ))}
            <span className="player-stack">
              {players.map((player) => (
                <span
                  key={player.id}
                  className={`player-marker ${player.id === props.playerId ? "is-self" : ""} ${player.id === props.snapshot.state.round.activePlayerId ? "is-active" : ""}`}
                  data-seat={player.seat}
                  title={player.name}
                >
                  <img
                    className="asset-icon player-icon"
                    src={getPlayerIconSrc(player.seat)}
                    alt=""
                    draggable="false"
                  />
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function App() {
  const transportConfig = useMemo(() => createBrowserTransportConfig(window.location), []);
  const [name, setName] = useState("");
  const [playerCount, setPlayerCount] = useState("4");
  const [inviteCode, setInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState<RoomState | null>(null);
  const [recentRooms, setRecentRooms] = useState<RecentRoomEntry[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [snapshot, setSnapshot] = useState<ProjectedSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [auctionAmount, setAuctionAmount] = useState("0");
  const [pendingAction, setPendingAction] = useState<PendingCellAction | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [interactionMode, setInteractionMode] = useState<"rotate" | null>(null);
  const [selectedRotationOrigin, setSelectedRotationOrigin] = useState<{ x: number; y: number } | null>(null);
  const [hoveredRotationOrigin, setHoveredRotationOrigin] = useState<{ x: number; y: number } | null>(null);
  const [boardViewportSize, setBoardViewportSize] = useState<number | null>(null);
  const boardStageRef = useRef<HTMLElement | null>(null);
  const boardHeaderRef = useRef<HTMLDivElement | null>(null);
  const boardActionStripRef = useRef<HTMLDivElement | null>(null);
  const resultBoxRef = useRef<HTMLDivElement | null>(null);

  const me = snapshot?.viewer.self ?? null;
  const publicSelf = snapshot ? snapshot.state.players[playerId] : null;
  const isMyTurn = snapshot?.state.round.activePlayerId === playerId;
  const pendingLabel = pendingActionLabel(pendingAction, snapshot);
  const turnHints = snapshot?.viewer.turnHints ?? null;
  const ownedSpecialCards = me
    ? SPECIAL_CARD_TYPES.filter((cardType) => me.specialInventory[cardType] > 0)
    : [];
  const highlightedCells =
    interactionMode === "rotate"
      ? []
      : turnHints?.stage === "mandatoryStep"
      ? turnHints.mandatoryMoveTargets
      : turnHints?.stage === "secondaryAction"
        ? turnHints.secondaryMoveTargets
        : [];
  const rotationOrigins = interactionMode === "rotate" ? turnHints?.rotationOrigins ?? [] : [];
  const rotationPreviewOrigin = selectedRotationOrigin ?? hoveredRotationOrigin;
  const rotationPreviewCells = interactionMode === "rotate" ? getSquare2PreviewCells(rotationPreviewOrigin) : [];

  useLayoutEffect(() => {
    if (!snapshot || room?.status !== "started") {
      setBoardViewportSize(null);
      return;
    }

    const stage = boardStageRef.current;

    if (!stage) {
      return;
    }

    let animationFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const stageRect = stage.getBoundingClientRect();
        const stageStyle = window.getComputedStyle(stage);
        const paddingX = Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight);
        const paddingY = Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom);
        const rowGap = Number.parseFloat(stageStyle.rowGap || stageStyle.gap || "0");
        const chrome = [boardHeaderRef.current, boardActionStripRef.current, resultBoxRef.current].filter(
          (element): element is NonNullable<typeof element> => element !== null
        );
        const chromeHeight = chrome.reduce((total, element) => total + element.offsetHeight, 0);
        const availableWidth = Math.max(240, stageRect.width - paddingX);
        const availableHeight = Math.max(
          240,
          stageRect.height - paddingY - chromeHeight - rowGap * chrome.length
        );
        const nextSize = Math.floor(Math.min(availableWidth, availableHeight));

        setBoardViewportSize((current) => (current === nextSize ? current : nextSize));
      });
    });

    resizeObserver.observe(stage);

    for (const element of [boardHeaderRef.current, boardActionStripRef.current, resultBoxRef.current]) {
      if (element) {
        resizeObserver.observe(element);
      }
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [room?.status, snapshot, snapshot?.state.round.phase, Boolean(snapshot?.state.result)]);

  useEffect(() => {
    setRecentRooms(readRecentRooms());
    const storedName = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);

    if (storedName) {
      setName(storedName);
    }

    const initialInvite = normalizeInviteCode(new URL(window.location.href).searchParams.get("invite") ?? "");

    if (initialInvite) {
      setInviteCode(initialInvite);
    }
  }, []);

  useEffect(() => {
    if (room || playerId || sessionToken) {
      return;
    }

    const activeSession = readActiveSession();

    if (!activeSession) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const payload = await requestJson<RoomEnvelope>(
          resolveHttpUrl(
            transportConfig,
            `/api/rooms/${activeSession.roomId}?sessionToken=${encodeURIComponent(activeSession.sessionToken)}`
          )
        );

        if (cancelled) {
          return;
        }

        setRoom(payload.room);
        setPlayerId(activeSession.playerId);
        setSessionToken(activeSession.sessionToken);
        setSnapshot(payload.snapshot);
        setInvitePreview(payload.room);
        setInviteCode(payload.room.inviteCode);
        setRecentRooms(upsertRecentRoom(payload.room));
        setMessage("");
        setShareMessage("");
      } catch {
        clearActiveSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, room, sessionToken, transportConfig]);

  useEffect(() => {
    if (name.trim()) {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name.trim());
    }
  }, [name]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextInvite = room?.inviteCode ?? (inviteCode.length === 6 ? inviteCode : "");

    if (nextInvite) {
      url.searchParams.set("invite", nextInvite);
    } else {
      url.searchParams.delete("invite");
    }

    window.history.replaceState({}, "", url);
  }, [room?.inviteCode, inviteCode]);

  useEffect(() => {
    if (room && playerId && sessionToken) {
      writeActiveSession({ roomId: room.roomId, playerId, sessionToken });
    }
  }, [playerId, room?.roomId, sessionToken]);

  useEffect(() => {
    if (!room || !playerId || !sessionToken) {
      return;
    }

    const socket = new WebSocket(
      resolveWebSocketUrl(
        transportConfig,
        `/ws?roomId=${room.roomId}&sessionToken=${encodeURIComponent(sessionToken)}`
      )
    );

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data as string) as {
        type: string;
        room: RoomState;
        snapshot: ProjectedSnapshot | null;
      };

      if (payload.type === "room.updated") {
        setRoom(payload.room);
        setSnapshot(payload.snapshot);
      }
    });

    return () => socket.close();
  }, [room?.roomId, playerId, sessionToken, transportConfig]);

  useEffect(() => {
    const onWindowClick = () => setContextMenu(null);
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  useEffect(() => {
    if (inviteCode.length !== 6 || room) {
      return;
    }

    void previewInvite(inviteCode);
  }, [inviteCode, room]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (snapshot.state.round.phase !== "treasurePlacement" && pendingAction?.kind === "treasurePlacement") {
      setPendingAction(null);
    }

    if (
      pendingAction?.kind !== "treasurePlacement" &&
      (snapshot.state.round.phase !== "inTurn" || snapshot.viewer.turnHints.stage !== "secondaryAction")
    ) {
      setPendingAction(null);
    }
  }, [snapshot?.state.round.phase, snapshot?.viewer.turnHints.stage, pendingAction?.kind]);

  useEffect(() => {
    if (!snapshot || snapshot.state.round.phase !== "inTurn" || snapshot.viewer.turnHints.stage !== "secondaryAction") {
      setInteractionMode(null);
      setSelectedRotationOrigin(null);
      setHoveredRotationOrigin(null);
      return;
    }

    if (!snapshot.viewer.turnHints.availableSecondaryActions.rotateTiles) {
      setInteractionMode(null);
      setSelectedRotationOrigin(null);
      setHoveredRotationOrigin(null);
      return;
    }

    if (
      selectedRotationOrigin &&
      !snapshot.viewer.turnHints.rotationOrigins.some(
        (origin) => origin.x === selectedRotationOrigin.x && origin.y === selectedRotationOrigin.y
      )
    ) {
      setSelectedRotationOrigin(null);
    }
  }, [snapshot, selectedRotationOrigin]);

  async function createRoom() {
    try {
      const payload = await requestJson<AuthenticatedRoomResponse>(
        resolveHttpUrl(transportConfig, "/api/rooms"),
        {
          method: "POST",
          body: JSON.stringify({
            name,
            playerCount: Number.parseInt(playerCount, 10)
          })
        }
      );

      setRoom(payload.room);
      setPlayerId(payload.playerId);
      setSessionToken(payload.sessionToken);
      setSnapshot(null);
      setInvitePreview(payload.room);
      setRecentRooms(upsertRecentRoom(payload.room));
      writeActiveSession({ roomId: payload.room.roomId, playerId: payload.playerId, sessionToken: payload.sessionToken });
      setMessage("");
      setShareMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function previewInvite(nextInviteCode: string) {
    try {
      const normalized = normalizeInviteCode(nextInviteCode);

      if (normalized.length !== 6) {
        setInvitePreview(null);
        return;
      }

      const payload = await requestJson<InvitePreviewResponse>(
        resolveHttpUrl(transportConfig, `/api/invite/${normalized}`)
      );
      setInvitePreview(payload.room);
      setMessage("");
    } catch (error) {
      setInvitePreview(null);
      setMessage((error as Error).message);
    }
  }

  async function joinRoom() {
    const normalizedInviteCode = normalizeInviteCode(inviteCode);

    try {
      const payload = await requestJson<AuthenticatedRoomResponse>(
        resolveHttpUrl(transportConfig, `/api/invite/${normalizedInviteCode}/join`),
        {
          method: "POST",
          body: JSON.stringify({ name })
        }
      );
      setRoom(payload.room);
      setPlayerId(payload.playerId);
      setSessionToken(payload.sessionToken);
      setSnapshot(null);
      setInvitePreview(payload.room);
      setRecentRooms(upsertRecentRoom(payload.room));
      writeActiveSession({ roomId: payload.room.roomId, playerId: payload.playerId, sessionToken: payload.sessionToken });
      setMessage("");
      setShareMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function startRoom() {
    if (!room || !sessionToken) {
      return;
    }

    try {
      const payload = await requestJson<RoomEnvelope>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}/start`),
        {
          method: "POST",
          body: JSON.stringify({ sessionToken })
        }
      );
      setRoom(payload.room);
      setSnapshot(payload.snapshot);
      setRecentRooms(upsertRecentRoom(payload.room));
      writeActiveSession({ roomId: payload.room.roomId, playerId, sessionToken });
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function refreshRoom() {
    if (!room || !sessionToken) {
      return;
    }

    try {
      const payload = await requestJson<RoomEnvelope>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}?sessionToken=${encodeURIComponent(sessionToken)}`)
      );
      setRoom(payload.room);
      setSnapshot(payload.snapshot);
      setRecentRooms(upsertRecentRoom(payload.room));
      writeActiveSession({ roomId: payload.room.roomId, playerId, sessionToken });
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function sendCommand(command: ActionCommandPayload) {
    if (!room || !snapshot || !sessionToken) {
      return;
    }

    try {
      const payload = await requestJson<CommandResponse>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}/commands`),
        {
          method: "POST",
          body: JSON.stringify({
            version: 1,
            matchId: snapshot.state.matchId,
            sessionToken,
            ...command
          })
        }
      );

      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setPlayerId(payload.snapshot.viewer.playerId);
        writeActiveSession({ roomId: room.roomId, playerId: payload.snapshot.viewer.playerId, sessionToken });
      }
      setPendingAction(null);
      setMessage(payload.rejection?.message ?? "");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function queryActions(eventX: number, eventY: number, cell: { x: number; y: number }) {
    if (!room || !snapshot || !sessionToken) {
      return;
    }

    try {
      const payload = await requestJson<ActionQueryResponse>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}/actions/query`),
        {
          method: "POST",
          body: JSON.stringify({
            version: 1,
            sessionToken,
            cell,
            ...(pendingAction ? { pendingAction } : {})
          })
        }
      );

      if (payload.actions.length === 0) {
        setMessage("현재 칸에서 가능한 액션이 없습니다.");
        setContextMenu(null);
        return;
      }

      setContextMenu({
        x: eventX,
        y: eventY,
        actions: payload.actions,
        cell
      });
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function openRotationActions(cell: { x: number; y: number }, eventX: number, eventY: number) {
    if (!room || !snapshot) {
      return;
    }

    try {
      const payload = await requestJson<ActionQueryResponse>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}/actions/query`),
        {
          method: "POST",
          body: JSON.stringify({
            version: 1,
            playerId,
            cell
          })
        }
      );

      const rotationActions = payload.actions.filter((action) => action.command?.type === "match.rotateTiles");

      if (rotationActions.length === 0) {
      setMessage("이 영역은 회전할 수 없습니다.");
      setContextMenu(null);
      return;
    }

    setSelectedRotationOrigin(cell);
    setHoveredRotationOrigin(cell);
    setContextMenu({
      x: eventX,
      y: eventY,
        actions: rotationActions,
        cell
      });
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleMenuSelect(action: ActionCandidate) {
    setContextMenu(null);

    if (action.clearPendingAction) {
      setPendingAction(null);
      return;
    }

    if (action.nextPendingAction) {
      setPendingAction(action.nextPendingAction);
      return;
    }

    if (action.command) {
      await sendCommand(action.command);

      if (action.command.type === "match.rotateTiles") {
        setInteractionMode(null);
        setSelectedRotationOrigin(null);
        setHoveredRotationOrigin(null);
      }
    }
  }

  async function copyInviteLink() {
    if (!room) {
      return;
    }

    try {
      await copyText(buildInviteLink(window.location, room.inviteCode));
      setShareMessage("초대 링크를 복사했습니다.");
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function copyInviteCode() {
    if (!room) {
      return;
    }

    try {
      await copyText(room.inviteCode);
      setShareMessage("초대 코드를 복사했습니다.");
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function shareInvite() {
    if (!room) {
      return;
    }

    const inviteLink = buildInviteLink(window.location, room.inviteCode);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Project. BH Invite",
          text: `Join my Project. BH room with invite code ${room.inviteCode}`,
          url: inviteLink
        });
        setShareMessage("초대 링크를 공유했습니다.");
        return;
      } catch {
        // ignore and fall back to copy
      }
    }

    await copyInviteLink();
  }

  if (!room) {
    return (
      <main className="app-shell lobby-shell" data-screen="landing">
        <section className="hero-row">
          <div>
            <p className="eyebrow">Project. BH</p>
            <h1>Party-first Multiplayer Lobby</h1>
            <p className="lede">상용 게임처럼 초대 링크나 초대 코드로 바로 합류할 수 있게 정리한 로비입니다.</p>
          </div>
          {message ? <div className="message">{message}</div> : shareMessage ? <div className="message">{shareMessage}</div> : null}
        </section>

        <section className="lobby-grid">
          <div className="panel">
            <h2>Host A Party</h2>
            <label>
              Display name
              <input data-testid="host-name-input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Party size
              <select value={playerCount} onChange={(event) => setPlayerCount(event.target.value)}>
                <option value="4">4</option>
                <option value="3">3</option>
                <option value="2">2</option>
              </select>
            </label>
            <button data-testid="create-party-button" disabled={!name.trim()} onClick={() => void createRoom()}>
              Create Party
            </button>
            <p className="panel-note">방을 만든 뒤에는 초대 링크를 복사해서 보내면 됩니다. 상대는 코드 전체를 외울 필요가 없습니다.</p>
          </div>

          <div className="panel">
            <h2>Join By Invite</h2>
            <label>
              Display name
              <input data-testid="join-name-input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Invite code
              <input
                data-testid="invite-code-input"
                value={inviteCode}
                placeholder="ABC123"
                onChange={(event) => {
                  setInviteCode(normalizeInviteCode(event.target.value));
                  setInvitePreview(null);
                }}
              />
            </label>
            <div className="button-row">
              <button
                data-testid="preview-room-button"
                disabled={inviteCode.length !== 6}
                onClick={() => void previewInvite(inviteCode)}
              >
                Preview Room
              </button>
              <button
                data-testid="join-party-button"
                disabled={!name.trim() || inviteCode.length !== 6}
                onClick={() => void joinRoom()}
              >
                Join Party
              </button>
            </div>
            {invitePreview ? (
              <div className="invite-preview-card">
                <strong>{invitePreview.inviteCode}</strong>
                <span>{invitePreview.players.length}/{invitePreview.desiredPlayerCount} players joined</span>
                <span>{invitePreview.status === "lobby" ? "Ready to join" : "Match already started"}</span>
              </div>
            ) : (
              <p className="panel-note">초대 링크를 열면 코드가 자동으로 채워집니다. 코드는 입력이 아니라 붙여넣기 기준으로 설계했습니다.</p>
            )}
          </div>

          <RecentRoomsPanel
            rooms={recentRooms}
            onUseInviteCode={(nextInviteCode) => {
              setInviteCode(nextInviteCode);
              void previewInvite(nextInviteCode);
            }}
          />
        </section>
      </main>
    );
  }

  if (room.status === "lobby") {
    const inviteLink = buildInviteLink(window.location, room.inviteCode);
    const isHost = playerId === room.hostPlayerId;
    const openSlots = Array.from(
      { length: Math.max(0, room.desiredPlayerCount - room.players.length) },
      (_, index) => index
    );

    return (
      <main className="app-shell lobby-shell" data-screen="room-lobby">
        <header className="top-strip">
          <div className="title-row">
            <p className="eyebrow">Project. BH</p>
            <strong>Party Lobby</strong>
            <span>{room.players.length}/{room.desiredPlayerCount} joined</span>
            <span>Invite {room.inviteCode}</span>
          </div>

        <div className="title-row compact-actions">
            <span>You: {getRoomPlayerName(room, playerId)}</span>
            <button onClick={() => void refreshRoom()}>Refresh</button>
            {isHost ? (
              <button data-testid="start-match-button" disabled={room.players.length < 2} onClick={() => void startRoom()}>
                Start Match
              </button>
            ) : null}
            {message ? <span className="message-inline">{message}</span> : null}
            {shareMessage ? <span className="message-inline">{shareMessage}</span> : null}
          </div>
        </header>

        <section className="lobby-grid">
          <section className="panel invite-panel">
            <h2>Invite Friends</h2>
            <div className="invite-code-pill" data-testid="invite-code-pill">{room.inviteCode}</div>
            <label>
              Share link
              <input value={inviteLink} readOnly />
            </label>
            <div className="button-row">
              <button onClick={() => void copyInviteLink()}>Copy Link</button>
              <button onClick={() => void copyInviteCode()}>Copy Code</button>
              <button onClick={() => void shareInvite()}>Share</button>
            </div>
            <p className="panel-note">
              벤치마크한 상용 파티 UX처럼, 플레이어는 방 ID를 외우지 않고 링크를 열거나 짧은 초대 코드를 붙여넣으면 됩니다.
            </p>
          </section>

          <section className="panel roster-panel">
            <h2>{isHost ? "Waiting For Players" : "Joined Successfully"}</h2>
            <div className="roster-list">
              {room.players.map((joinedPlayer) => (
                <article key={joinedPlayer.id} className="roster-card">
                  <strong>{joinedPlayer.name}</strong>
                  <span>{joinedPlayer.id === room.hostPlayerId ? "Host" : "Guest"}</span>
                </article>
              ))}
              {openSlots.map((slot) => (
                <article key={`open-${slot}`} className="roster-card is-empty">
                  <strong>Open Slot</strong>
                  <span>Invite pending</span>
                </article>
              ))}
            </div>
            <p className="panel-note">
              {isHost
                ? room.players.length < 2
                  ? "한 명 이상 더 들어오면 시작할 수 있습니다."
                  : "모두 준비되면 Start Match를 누르세요."
                : "호스트가 시작할 때까지 이 화면에서 대기하면 됩니다."}
            </p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-screen="match">
      <header className="top-strip">
        <div className="title-row">
          <p className="eyebrow">Project. BH</p>
          <strong>Room {room.roomId}</strong>
          {snapshot ? <span>Round {snapshot.state.round.roundNumber}/{snapshot.state.settings.totalRounds}</span> : null}
          {snapshot ? <span data-testid="round-phase">Phase {snapshot.state.round.phase}</span> : null}
          {snapshot ? <span data-testid="turn-stage">Turn {formatTurnStage(snapshot.viewer.turnHints.stage)}</span> : null}
          {pendingLabel ? <span className="pending-chip">{pendingLabel}</span> : null}
        </div>

        <div className="title-row compact-actions">
          <span>You: {getRoomPlayerName(room, playerId)}</span>
          <button onClick={() => void refreshRoom()}>Refresh</button>
          {message ? <span className="message-inline">{message}</span> : null}
        </div>
      </header>

      {snapshot ? <Scoreboard snapshot={snapshot} /> : null}
      {snapshot ? <TreasureBoardStrip snapshot={snapshot} /> : null}
      {snapshot &&
      (snapshot.state.round.turnOrder.length > 0 ||
        snapshot.state.round.phase === "inTurn" ||
        snapshot.state.round.phase === "completed") ? (
        <section className="phase-strip turn-order-bridge">
          <TurnOrderStrip snapshot={snapshot} compact />
        </section>
      ) : null}

      {snapshot ? (
        <div className="match-layout">
          <section
            ref={boardStageRef}
            className="board-stage match-main"
            style={
              boardViewportSize
                ? ({ "--board-size": `${boardViewportSize}px` } as CSSProperties)
                : undefined
            }
          >
          <div ref={boardHeaderRef} className="board-header">
            <div className="board-meta">
              <span>Goal {snapshot.state.settings.roundOpenTreasureTarget}</span>
              <span>
                Zone {snapshot.state.settings.treasurePlacementZone.width}x
                {snapshot.state.settings.treasurePlacementZone.height}
              </span>
              <span>Active {getSnapshotPlayerName(snapshot, snapshot.state.round.activePlayerId)}</span>
            </div>
            <div className="inline-controls">
              {snapshot.state.round.phase === "inTurn" && isMyTurn ? (
                <button
                  data-testid="end-turn-button"
                  disabled={!snapshot.viewer.turnHints.availableSecondaryActions.endTurn}
                  onClick={() => void sendCommand({ type: "match.endTurn" })}
                >
                  턴 종료
                </button>
              ) : null}
              {snapshot.state.round.phase === "completed" ? (
                <button data-testid="prepare-next-round-button" onClick={() => void sendCommand({ type: "match.prepareNextRound" })}>
                  다음 라운드
                </button>
              ) : null}
            </div>
          </div>

          {snapshot.state.round.phase === "inTurn" || snapshot.state.round.phase === "prioritySubmission" ? (
            <div ref={boardActionStripRef}>
              <ActionStatusStrip
                snapshot={snapshot}
                isMyTurn={Boolean(isMyTurn)}
                rotationMode={interactionMode === "rotate"}
                onToggleRotationMode={() => {
                  setContextMenu(null);
                  setSelectedRotationOrigin(null);
                  setHoveredRotationOrigin(null);
                  setInteractionMode((current) => (current === "rotate" ? null : "rotate"));
                  setMessage("");
                }}
              />
            </div>
          ) : null}

          <BoardView
            snapshot={snapshot}
            playerId={playerId}
            highlightedCells={highlightedCells}
            highlightTone={snapshot.viewer.turnHints.stage}
            rotationMode={interactionMode === "rotate"}
            rotationOrigins={rotationOrigins}
            selectedRotationOrigin={selectedRotationOrigin}
            hoveredRotationOrigin={hoveredRotationOrigin}
            rotationPreviewCells={rotationPreviewCells}
            onRotationCellSelect={(event, cell) => {
              const rect = event.currentTarget.getBoundingClientRect();
              void openRotationActions(cell, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
            onRotationCellHover={setHoveredRotationOrigin}
            onCellContextMenu={(event, cell) => {
              event.preventDefault();
              void queryActions(event.clientX, event.clientY, cell);
            }}
          />

          {snapshot.state.round.phase === "auction" ? (
            <AuctionOverlay
              snapshot={snapshot}
              auctionAmount={auctionAmount}
              maxBid={publicSelf?.score ?? 0}
              onChangeAuctionAmount={setAuctionAmount}
              onSubmitBid={() =>
                void sendCommand({
                  type: "match.submitAuctionBids",
                  bids: [
                    {
                      amount: Number.parseInt(auctionAmount || "0", 10),
                      ...(snapshot.state.round.auction.currentOffer
                        ? { offerSlot: snapshot.state.round.auction.currentOffer.slot }
                        : {})
                    }
                  ]
                })
              }
              onPurchaseFence={() =>
                void sendCommand({
                  type: "match.purchaseSpecialCard",
                  cardType: "fence"
                })
              }
              onPurchaseLargeFence={() =>
                void sendCommand({
                  type: "match.purchaseSpecialCard",
                  cardType: "largeFence"
                })
              }
            />
          ) : null}

          {snapshot.state.result ? (
            <div ref={resultBoxRef} className="result-box">
              Winners: {snapshot.state.result.winnerPlayerIds.join(", ")} | Score: {snapshot.state.result.highestScore}
            </div>
          ) : null}
          </section>

          <footer className="bottom-overlay match-footer">
            <section className="overlay-section inventory-section">
              <div className="inventory-group inventory-group-priority">
                <h3>Priority Cards</h3>
                <PriorityCardButtons
                  snapshot={snapshot}
                  isMyTurn={Boolean(isMyTurn)}
                  onSubmit={(priorityCard) =>
                    void sendCommand({
                      type: "match.submitPriority",
                      priorityCard
                    })
                  }
                />
              </div>

              <div className="inventory-group inventory-group-treasure">
                <h3>Treasure Cards</h3>
                <div className="overlay-row inventory-row card-shelf">
                  {snapshot.viewer.treasurePlacementHand.length === 0 &&
                  snapshot.viewer.revealedTreasureCards.length === 0 ? (
                    <span className="action-chip is-disabled">현재 열람 가능한 보물 카드가 없습니다.</span>
                  ) : null}
                  {snapshot.viewer.treasurePlacementHand.map((card) => (
                    <button
                      key={card.id}
                      className={`overlay-card treasure-card treasure-card-button ${pendingAction?.kind === "treasurePlacement" && pendingAction.treasureId === card.id ? "is-selected" : ""}`}
                      data-testid="treasure-card-button"
                      data-treasure-id={card.id}
                      disabled={snapshot.state.round.phase !== "treasurePlacement" || card.isFake}
                      onClick={() =>
                        setPendingAction((current) =>
                          current?.kind === "treasurePlacement" && current.treasureId === card.id
                            ? null
                            : { kind: "treasurePlacement", treasureId: card.id }
                        )
                      }
                    >
                      <span className={`card-corner-chip ${card.isFake ? "is-muted" : ""}`}>
                        {card.isFake ? "가짜" : `슬롯 ${card.slot}`}
                      </span>
                      <img
                        className="treasure-card-icon"
                        src={card.isFake ? "/icons/treasure-open.svg" : "/icons/treasure-closed.svg"}
                        alt=""
                        draggable="false"
                      />
                      <span className="card-score">{card.isFake ? "×" : formatPoints(card.points)}</span>
                    </button>
                  ))}
                  {snapshot.viewer.revealedTreasureCards.map((card) => (
                    <article key={card.id} className="overlay-card treasure-card treasure-record-card">
                      <span className="card-corner-chip">슬롯 {card.slot}</span>
                      <img className="treasure-card-icon" src="/icons/treasure-gem.svg" alt="" draggable="false" />
                      {snapshot.state.round.phase === "completed" || snapshot.state.result ? (
                        <span className="card-score">{formatPoints(card.points)}</span>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>

              <div
                className={`inventory-group inventory-group-secondary inventory-group-special special-section ${
                    !isMyTurn
                      ? "is-inactive-turn"
                      : snapshot.viewer.turnHints.stage === "secondaryAction"
                        ? "is-active-turn"
                        : "is-locked-stage"
                  }`}
              >
                <h3>Special Cards</h3>
                <div className={`overlay-row inventory-row card-shelf ${ownedSpecialCards.length === 0 ? "is-empty" : ""}`}>
                  {ownedSpecialCards.length === 0 ? (
                    <span className="empty-shelf-message">보유 중인 특수카드가 없습니다.</span>
                  ) : null}
                  {ownedSpecialCards.map((card) => {
                    const chargeCount = me?.specialInventory[card] ?? 0;
                    const isAvailable = snapshot.viewer.turnHints.availableSpecialCards[card];
                    const isDirectUse = card === "recoveryPotion";

                    return (
                      <button
                        key={card}
                        className={`overlay-card special-card special-card-button ${pendingAction?.kind === "specialCard" && pendingAction.cardType === card ? "is-selected" : ""} ${isAvailable ? "" : "is-unavailable"}`}
                        data-testid="special-card-button"
                        data-special-card={card}
                        disabled={
                          !isMyTurn ||
                          snapshot.viewer.turnHints.stage !== "secondaryAction" ||
                          !isAvailable
                        }
                        onClick={() => {
                          if (isDirectUse) {
                            void sendCommand({
                              type: "match.useSpecialCard",
                              cardType: card
                            });
                            return;
                          }

                          setPendingAction((current) =>
                            current?.kind === "specialCard" && current.cardType === card
                              ? null
                              : { kind: "specialCard", cardType: card }
                          );
                        }}
                      >
                        <span className="card-corner-chip card-count-chip">×{chargeCount}</span>
                        <img
                          className="special-card-icon"
                          src={getSpecialCardIconSrc(card)}
                          alt=""
                          draggable="false"
                        />
                        <strong>{formatSpecialCardLabel(card)}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </footer>
        </div>
      ) : (
        <section className="panel waiting-panel">
          Waiting for host to start the room.
        </section>
      )}

      {contextMenu ? <ContextMenu menu={contextMenu} onSelect={(action) => void handleMenuSelect(action)} /> : null}
    </main>
  );
}
