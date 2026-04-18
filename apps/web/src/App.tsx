import { type MouseEvent, useEffect, useMemo, useState } from "react";

import type {
  ActionCandidate,
  ActionCommandPayload,
  PendingCellAction
} from "../../../packages/protocol/src/index.ts";
import type { SpecialCardType } from "../../../packages/domain/src/index.ts";
import {
  createBrowserTransportConfig,
  resolveHttpUrl,
  resolveWebSocketUrl
} from "./runtime-transport.ts";

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
        carriedTreasureId: string | null;
        specialCards: SpecialCardType[];
        availablePriorityCards: number[];
      }
    >;
    treasures: Record<
      string,
      {
        id: string;
        slot: number;
        ownerPlayerId: string;
        position: { x: number; y: number } | null;
        carriedByPlayerId: string | null;
        openedByPlayerId: string | null;
        removedFromRound: boolean;
        visiblePoints: number | null;
      }
    >;
    board: {
      tiles: Record<string, { kind: string }>;
      fences: Record<string, { id: string; positions: [{ x: number; y: number }, { x: number; y: number }] }>;
    };
    round: {
      roundNumber: number;
      phase: string;
      activePlayerId: string | null;
      turn: {
        playerId: string;
        stage: TurnStage;
        mandatoryStepDirection: "north" | "east" | "south" | "west" | null;
      } | null;
      auction: {
        currentOffer: { slot: number; cardType: string } | null;
        resolvedOffers: Record<string, string | null>;
        hasSubmittedBid: boolean;
      };
    };
    completed: boolean;
    result: { winnerPlayerIds: string[]; highestScore: number } | null;
  };
  viewer: {
    playerId: string;
    ownedTreasureCards: {
      id: string;
      slot: number;
      points: number;
      placed: boolean;
      opened: boolean;
      position: { x: number; y: number } | null;
    }[];
    turnHints: {
      active: boolean;
      stage: TurnStage | null;
      mandatoryMoveTargets: { x: number; y: number }[];
      secondaryMoveTargets: { x: number; y: number }[];
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

function pendingActionLabel(pendingAction: PendingCellAction | null, snapshot: ProjectedSnapshot | null): string | null {
  if (!pendingAction) {
    return null;
  }

  switch (pendingAction.kind) {
    case "throw":
      return `타일 던지기 준비 (${pendingAction.source.x},${pendingAction.source.y})`;
    case "treasurePlacement": {
      const card = snapshot?.viewer.ownedTreasureCards.find((candidate) => candidate.id === pendingAction.treasureId);
      return card ? `보물 배치 준비 (${formatPoints(card.points)})` : "보물 배치 준비";
    }
    case "specialCard":
      return pendingAction.kind === "specialCard" && pendingAction.firstPosition
        ? `${pendingAction.cardType} 두 번째 칸 선택`
        : `${pendingAction.cardType} 대상 선택`;
  }
}

function ActionStatusStrip(props: {
  snapshot: ProjectedSnapshot;
  isMyTurn: boolean;
}) {
  const { turnHints } = props.snapshot.viewer;
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
      current: false,
      detail: turnHints.availableSecondaryActions.rotateTiles ? "활성" : "잠김"
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
        <span
          key={item.label}
          className={`action-chip ${item.current ? "is-current" : item.enabled ? "is-enabled" : "is-disabled"}`}
        >
          <span>{item.label}</span>
          <small>{item.detail}</small>
        </span>
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
    <div className="context-menu" style={{ left: props.menu.x, top: props.menu.y }}>
      {props.menu.actions.map((action) => (
        <button
          key={action.id}
          className="context-action"
          onClick={() => props.onSelect(action)}
        >
          <span>{action.label}</span>
          {action.description ? <small>{action.description}</small> : null}
        </button>
      ))}
    </div>
  );
}

function Scoreboard(props: { snapshot: ProjectedSnapshot }) {
  const players = Object.values(props.snapshot.state.players).sort((left, right) => left.seat - right.seat);

  return (
    <section className="scoreboard-strip">
      {players.map((player) => (
        <article key={player.id} className={`score-card ${player.eliminated ? "is-eliminated" : ""}`}>
          <strong>{player.name}</strong>
          <span>점수 {player.score}</span>
          <span>HP {player.hitPoints}</span>
          <span>보물 {player.carriedTreasureId ? "운반중" : "없음"}</span>
        </article>
      ))}
    </section>
  );
}

function BoardView(props: {
  snapshot: ProjectedSnapshot;
  playerId: string;
  highlightedCells: readonly { x: number; y: number }[];
  highlightTone: TurnStage | null;
  onCellContextMenu: (event: MouseEvent<HTMLButtonElement>, cell: { x: number; y: number }) => void;
}) {
  const zone = props.snapshot.state.settings.rotationZone;

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
        const zoneEdge = [
          y === zone.origin.y ? "zone-top" : "",
          y === zone.origin.y + zone.height - 1 ? "zone-bottom" : "",
          x === zone.origin.x ? "zone-left" : "",
          x === zone.origin.x + zone.width - 1 ? "zone-right" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const isHighlighted = props.highlightedCells.some((cell) => cell.x === x && cell.y === y);
        const highlightClass =
          isHighlighted && props.highlightTone === "mandatoryStep"
            ? "mandatory-move"
            : isHighlighted && props.highlightTone === "secondaryAction"
              ? "secondary-move"
              : "";

        return (
          <button
            type="button"
            key={key}
            className={`cell tile-${tile || "plain"} ${inZone ? "in-zone" : ""} ${zoneEdge} ${highlightClass}`}
            onContextMenu={(event) => props.onCellContextMenu(event, { x, y })}
          >
            <span className="coord">
              {x},{y}
            </span>
            {isHighlighted ? (
              <span className={`hint-badge ${props.highlightTone === "mandatoryStep" ? "hint-step" : "hint-action"}`}>
                {props.highlightTone === "mandatoryStep" ? "1" : "+2"}
              </span>
            ) : null}
            {tile ? <span className="badge tile-badge">{tile.slice(0, 2).toUpperCase()}</span> : null}
            {treasures.map((treasure) => (
              <span key={treasure.id} className="badge treasure-badge">
                {treasure.visiblePoints === null ? "?" : formatPoints(treasure.visiblePoints)}
              </span>
            ))}
            <span className="player-stack">
              {players.map((player) => (
                <span
                  key={player.id}
                  className={`player-marker ${player.id === props.playerId ? "is-self" : ""}`}
                  title={player.name}
                >
                  {player.name.slice(0, 2).toUpperCase()}
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
  const [playerCount, setPlayerCount] = useState("2");
  const [inviteCode, setInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState<RoomState | null>(null);
  const [recentRooms, setRecentRooms] = useState<RecentRoomEntry[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [snapshot, setSnapshot] = useState<ProjectedSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [auctionAmount, setAuctionAmount] = useState("0");
  const [pendingAction, setPendingAction] = useState<PendingCellAction | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const me = snapshot ? snapshot.state.players[playerId] : null;
  const isMyTurn = snapshot?.state.round.activePlayerId === playerId;
  const pendingLabel = pendingActionLabel(pendingAction, snapshot);
  const turnHints = snapshot?.viewer.turnHints ?? null;
  const highlightedCells =
    turnHints?.stage === "mandatoryStep"
      ? turnHints.mandatoryMoveTargets
      : turnHints?.stage === "secondaryAction"
        ? turnHints.secondaryMoveTargets
        : [];

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
    if (!room || !playerId) {
      return;
    }

    const socket = new WebSocket(
      resolveWebSocketUrl(
        transportConfig,
        `/ws?roomId=${room.roomId}&playerId=${playerId}`
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
  }, [room?.roomId, playerId, transportConfig]);

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

  async function createRoom() {
    try {
      const payload = await requestJson<{ room: RoomState; playerId: string }>(
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
      setSnapshot(null);
      setInvitePreview(payload.room);
      setRecentRooms(upsertRecentRoom(payload.room));
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
      const payload = await requestJson<{ room: RoomState; playerId: string }>(
        resolveHttpUrl(transportConfig, `/api/invite/${normalizedInviteCode}/join`),
        {
          method: "POST",
          body: JSON.stringify({ name })
        }
      );
      setRoom(payload.room);
      setPlayerId(payload.playerId);
      setSnapshot(null);
      setInvitePreview(payload.room);
      setRecentRooms(upsertRecentRoom(payload.room));
      setMessage("");
      setShareMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function startRoom() {
    if (!room) {
      return;
    }

    try {
      const payload = await requestJson<RoomEnvelope>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}/start`),
        {
          method: "POST",
          body: JSON.stringify({ playerId })
        }
      );
      setRoom(payload.room);
      setSnapshot(payload.snapshot);
      setRecentRooms(upsertRecentRoom(payload.room));
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function refreshRoom() {
    if (!room) {
      return;
    }

    try {
      const payload = await requestJson<RoomEnvelope>(
        resolveHttpUrl(transportConfig, `/api/rooms/${room.roomId}?playerId=${playerId}`)
      );
      setRoom(payload.room);
      setSnapshot(payload.snapshot);
      setRecentRooms(upsertRecentRoom(payload.room));
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function sendCommand(command: ActionCommandPayload) {
    if (!room || !snapshot) {
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
            playerId,
            ...command
          })
        }
      );

      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
      }
      setPendingAction(null);
      setMessage(payload.rejection?.message ?? "");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function queryActions(eventX: number, eventY: number, cell: { x: number; y: number }) {
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
      <main className="app-shell lobby-shell">
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
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Party size
              <select value={playerCount} onChange={(event) => setPlayerCount(event.target.value)}>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
            <button disabled={!name.trim()} onClick={() => void createRoom()}>Create Party</button>
            <p className="panel-note">방을 만든 뒤에는 초대 링크를 복사해서 보내면 됩니다. 상대는 코드 전체를 외울 필요가 없습니다.</p>
          </div>

          <div className="panel">
            <h2>Join By Invite</h2>
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Invite code
              <input
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
                disabled={inviteCode.length !== 6}
                onClick={() => void previewInvite(inviteCode)}
              >
                Preview Room
              </button>
              <button
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
      <main className="app-shell lobby-shell">
        <header className="top-strip">
          <div className="title-row">
            <p className="eyebrow">Project. BH</p>
            <strong>Party Lobby</strong>
            <span>{room.players.length}/{room.desiredPlayerCount} joined</span>
            <span>Invite {room.inviteCode}</span>
          </div>

          <div className="title-row compact-actions">
            <span>You: {room.players.find((player) => player.id === playerId)?.name ?? playerId}</span>
            <button onClick={() => void refreshRoom()}>Refresh</button>
            {isHost ? (
              <button disabled={room.players.length < 2} onClick={() => void startRoom()}>
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
            <div className="invite-code-pill">{room.inviteCode}</div>
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
    <main className="app-shell">
      <header className="top-strip">
        <div className="title-row">
          <p className="eyebrow">Project. BH</p>
          <strong>Room {room.roomId}</strong>
          <span>{playerId}</span>
          {snapshot ? <span>Round {snapshot.state.round.roundNumber}/{snapshot.state.settings.totalRounds}</span> : null}
          {snapshot ? <span>Phase {snapshot.state.round.phase}</span> : null}
          {snapshot ? <span>Turn {formatTurnStage(snapshot.viewer.turnHints.stage)}</span> : null}
          {pendingLabel ? <span className="pending-chip">{pendingLabel}</span> : null}
        </div>

        <div className="title-row compact-actions">
          <span>You: {room.players.find((player) => player.id === playerId)?.name ?? playerId}</span>
          <button onClick={() => void refreshRoom()}>Refresh</button>
          {message ? <span className="message-inline">{message}</span> : null}
        </div>
      </header>

      {snapshot ? <Scoreboard snapshot={snapshot} /> : null}

      {snapshot ? (
        <section className="phase-strip">
          {snapshot.state.round.phase === "auction" ? (
            <div className="phase-card">
              <strong>Current Auction Card</strong>
              <span>{snapshot.state.round.auction.currentOffer?.cardType ?? "none"}</span>
              <input
                type="number"
                min="0"
                value={auctionAmount}
                onChange={(event) => setAuctionAmount(event.target.value)}
                disabled={snapshot.state.round.auction.hasSubmittedBid}
              />
              <button
                disabled={snapshot.state.round.auction.hasSubmittedBid}
                onClick={() =>
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
              >
                입찰 제출
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {snapshot ? (
        <section className="board-stage">
          <div className="board-header">
            <div className="board-meta">
              <span>Backend {transportConfig.httpBaseUrl}</span>
              <span>Treasure Goal {snapshot.state.settings.roundOpenTreasureTarget}</span>
              <span>Active {snapshot.state.round.activePlayerId ?? "-"}</span>
            </div>
            <div className="inline-controls">
              {snapshot.state.round.phase === "prioritySubmission" && me ? (
                <div className="inline-card-row">
                  {me.availablePriorityCards.map((card) => (
                    <button
                      key={card}
                      className="priority-card"
                      onClick={() =>
                        void sendCommand({
                          type: "match.submitPriority",
                          priorityCard: card
                        })
                      }
                    >
                      {card}
                    </button>
                  ))}
                </div>
              ) : null}
              {snapshot.state.round.phase === "inTurn" && isMyTurn ? (
                <button
                  disabled={!snapshot.viewer.turnHints.availableSecondaryActions.endTurn}
                  onClick={() => void sendCommand({ type: "match.endTurn" })}
                >
                  턴 종료
                </button>
              ) : null}
              {snapshot.state.round.phase === "completed" ? (
                <button onClick={() => void sendCommand({ type: "match.prepareNextRound" })}>다음 라운드</button>
              ) : null}
            </div>
          </div>

          {snapshot.state.round.phase === "inTurn" ? (
            <ActionStatusStrip snapshot={snapshot} isMyTurn={Boolean(isMyTurn)} />
          ) : null}

          <BoardView
            snapshot={snapshot}
            playerId={playerId}
            highlightedCells={highlightedCells}
            highlightTone={snapshot.viewer.turnHints.stage}
            onCellContextMenu={(event, cell) => {
              event.preventDefault();
              void queryActions(event.clientX, event.clientY, cell);
            }}
          />

          {contextMenu ? <ContextMenu menu={contextMenu} onSelect={(action) => void handleMenuSelect(action)} /> : null}

          {snapshot.state.result ? (
            <div className="result-box">
              Winners: {snapshot.state.result.winnerPlayerIds.join(", ")} | Score: {snapshot.state.result.highestScore}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="panel waiting-panel">
          Waiting for host to start the room.
        </section>
      )}

      {snapshot ? (
        <footer className="bottom-overlay">
          <section className="overlay-section">
            <h3>Treasure Cards</h3>
            <div className="overlay-row">
              {snapshot.viewer.ownedTreasureCards.map((card) => (
                <button
                  key={card.id}
                  className={`overlay-card treasure-card ${pendingAction?.kind === "treasurePlacement" && pendingAction.treasureId === card.id ? "is-selected" : ""}`}
                  disabled={snapshot.state.round.phase !== "treasurePlacement" || card.opened}
                  onClick={() =>
                    setPendingAction((current) =>
                      current?.kind === "treasurePlacement" && current.treasureId === card.id
                        ? null
                        : { kind: "treasurePlacement", treasureId: card.id }
                    )
                  }
                >
                  <strong>{formatPoints(card.points)}</strong>
                  <span>{card.placed ? "배치됨" : "배치 전"}</span>
                </button>
              ))}
            </div>
          </section>

          <section
            className={`overlay-section special-section ${
              !isMyTurn
                ? "is-inactive-turn"
                : snapshot.viewer.turnHints.stage === "secondaryAction"
                  ? "is-active-turn"
                  : "is-locked-stage"
            }`}
          >
            <h3>Special Cards</h3>
            <div className="overlay-row">
              {(me?.specialCards ?? []).map((card, index) => (
                <button
                  key={`${card}-${index}`}
                  className={`overlay-card special-card ${pendingAction?.kind === "specialCard" && pendingAction.cardType === card ? "is-selected" : ""} ${snapshot.viewer.turnHints.availableSpecialCards[card] ? "" : "is-unavailable"}`}
                  disabled={
                    !isMyTurn ||
                    snapshot.viewer.turnHints.stage !== "secondaryAction" ||
                    !snapshot.viewer.turnHints.availableSpecialCards[card]
                  }
                  onClick={() =>
                    setPendingAction((current) =>
                      current?.kind === "specialCard" && current.cardType === card
                        ? null
                        : { kind: "specialCard", cardType: card }
                    )
                  }
                >
                  <strong>{card}</strong>
                  <span>
                    {!isMyTurn
                      ? "비활성화"
                      : snapshot.viewer.turnHints.stage !== "secondaryAction"
                        ? "1칸 이동 후"
                        : snapshot.viewer.turnHints.availableSpecialCards[card]
                          ? "대상 선택"
                          : "현재 불가"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </footer>
      ) : null}
    </main>
  );
}
