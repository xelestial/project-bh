import type { SpecialCardType } from "../../../packages/domain/src/index.ts";

const TILE_ICON_SOURCES: Readonly<Record<string, string | null>> = {
  plain: null,
  fire: "/icons/tile-fire.svg",
  water: "/icons/tile-water.svg",
  electric: "/icons/tile-electric.svg",
  ice: "/icons/tile-ice.svg",
  giantFlame: "/icons/tile-giantFlame.svg",
  river: "/icons/tile-river.svg"
};

const TREASURE_ICON_SOURCES: Readonly<Record<"closed" | "open", string>> = {
  closed: "/icons/treasure-closed.svg",
  open: "/icons/treasure-open.svg"
};

const PLAYER_ICON_SOURCES = [
  "/icons/player-seat-0.svg",
  "/icons/player-seat-1.svg",
  "/icons/player-seat-2.svg",
  "/icons/player-seat-3.svg"
] as const;

const SPECIAL_CARD_ICON_SOURCES: Readonly<Record<SpecialCardType, string>> = {
  coldBomb: "/icons/special-coldBomb.svg",
  flameBomb: "/icons/special-flameBomb.svg",
  electricBomb: "/icons/special-electricBomb.svg",
  largeHammer: "/icons/special-largeHammer.svg",
  fence: "/icons/special-fence.svg",
  recoveryPotion: "/icons/special-recoveryPotion.svg",
  jump: "/icons/special-jump.svg",
  hook: "/icons/special-hook.svg"
};

export function getTileIconSrc(kind: string): string | null {
  return TILE_ICON_SOURCES[kind] ?? null;
}

export function getTreasureIconSrc(opened: boolean): string {
  return opened ? TREASURE_ICON_SOURCES.open : TREASURE_ICON_SOURCES.closed;
}

export function getPlayerIconSrc(seat: number): string {
  return PLAYER_ICON_SOURCES[seat % PLAYER_ICON_SOURCES.length] ?? PLAYER_ICON_SOURCES[0];
}

export function getSpecialCardIconSrc(cardType: SpecialCardType): string {
  return SPECIAL_CARD_ICON_SOURCES[cardType];
}
