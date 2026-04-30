import type { SpecialCardType } from "../../../packages/domain/src/index.ts";

export type QuarterViewFacing = "front-rd" | "front-ld" | "back-ru" | "back-lu";

const TILE_ICON_SOURCES: Readonly<Record<string, string | null>> = {
  plain: null,
  fire: "/icons/tile-qv-fire.svg",
  water: "/icons/tile-qv-water.svg",
  electric: "/icons/tile-qv-electric.svg",
  ice: "/icons/tile-qv-ice.svg",
  giantFlame: "/icons/tile-qv-giantFlame.svg",
  river: "/icons/tile-qv-river.svg"
};

const TREASURE_ICON_SOURCES: Readonly<Record<"closed" | "open", string>> = {
  closed: "/icons/treasure-closed.svg",
  open: "/icons/treasure-gem.svg"
};

const PLAYER_ICON_SOURCES = [
  "/icons/player-seat-0.svg",
  "/icons/player-seat-1.svg",
  "/icons/player-seat-2.svg",
  "/icons/player-seat-3.svg"
] as const;

const PLAYER_CHARACTER_IDS = [8, 5, 1, 4] as const;
const PLAYER_SPRITE_ASSET_VERSION = "qv3";

const SPECIAL_CARD_ICON_SOURCES: Readonly<Record<SpecialCardType, string>> = {
  coldBomb: "/icons/special-coldBomb.svg",
  flameBomb: "/icons/special-flameBomb.svg",
  electricBomb: "/icons/special-electricBomb.svg",
  largeHammer: "/icons/special-largeHammer.svg",
  fence: "/icons/special-fence.svg",
  largeFence: "/icons/special-largeFence.svg",
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

export function getPlayerSpriteSrc(seat: number, facing: QuarterViewFacing): string {
  const characterId = PLAYER_CHARACTER_IDS[seat % PLAYER_CHARACTER_IDS.length] ?? PLAYER_CHARACTER_IDS[0];
  return `/characters/quarterview/char${String(characterId).padStart(2, "0")}-${facing}.png?v=${PLAYER_SPRITE_ASSET_VERSION}`;
}

export function getSpecialCardIconSrc(cardType: SpecialCardType): string {
  return SPECIAL_CARD_ICON_SOURCES[cardType];
}
