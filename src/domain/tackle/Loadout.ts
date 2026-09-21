import type { GearId } from '../ids'
import type { GearCategory, GearItem } from '../gear/Gear'
import type { Inventory } from './Inventory'

/**
 * プレイヤーが現在使うタックル。
 *
 * ここは「何を装備しているか」だけを持つ。性能の解決は Tackle Resolver が行う。
 */

export const LOADOUT_SLOTS = ['rod', 'reel', 'line', 'leader', 'hook', 'offering'] as const
export type LoadoutSlot = (typeof LOADOUT_SLOTS)[number]

/** スロットごとに装備できるカテゴリ。 */
export const SLOT_CATEGORIES: Readonly<Record<LoadoutSlot, readonly GearCategory[]>> = {
  rod: ['rod'],
  reel: ['reel'],
  line: ['line'],
  leader: ['leader'],
  hook: ['hook'],
  offering: ['lure', 'bait'],
}

export type Loadout = {
  readonly rodId: GearId
  readonly reelId: GearId
  readonly lineId: GearId
  /** リーダーは無しでもよい。 */
  readonly leaderId: GearId | null
  readonly hookId: GearId
  /** ルアーまたは餌。 */
  readonly offeringId: GearId
  readonly methodId: string
}

export const loadoutGearIds = (loadout: Loadout): readonly GearId[] => [
  loadout.rodId,
  loadout.reelId,
  loadout.lineId,
  ...(loadout.leaderId === null ? [] : [loadout.leaderId]),
  loadout.hookId,
  loadout.offeringId,
]

/**
 * Starter gear。
 *
 * 新規ゲームで必ず持っている装備である（何も買えなくても釣りが成立する）。
 * Content はこの id を必ず持つ（テストで確認する）。
 */
export const STARTER_GEAR_IDS = {
  rodId: 'starter-rod',
  reelId: 'starter-reel',
  lineId: 'starter-nylon-line',
  leaderId: 'starter-leader',
  hookId: 'starter-hook',
  lureId: 'starter-lure',
  baitId: 'starter-bait',
} as const

export const STARTER_METHOD_ID = 'lure'

export const starterInventoryIds = (asId: (value: string) => GearId): readonly GearId[] => [
  asId(STARTER_GEAR_IDS.rodId),
  asId(STARTER_GEAR_IDS.reelId),
  asId(STARTER_GEAR_IDS.lineId),
  asId(STARTER_GEAR_IDS.leaderId),
  asId(STARTER_GEAR_IDS.hookId),
  asId(STARTER_GEAR_IDS.lureId),
  asId(STARTER_GEAR_IDS.baitId),
]

/** 新規プレイヤーの所持タックル（Starter gear 一式）。 */
export const createStarterInventory = (asId: (value: string) => GearId): Inventory => ({
  ownedGearIds: starterInventoryIds(asId),
})

export const createStarterLoadout = (asId: (value: string) => GearId): Loadout => ({
  rodId: asId(STARTER_GEAR_IDS.rodId),
  reelId: asId(STARTER_GEAR_IDS.reelId),
  lineId: asId(STARTER_GEAR_IDS.lineId),
  leaderId: asId(STARTER_GEAR_IDS.leaderId),
  hookId: asId(STARTER_GEAR_IDS.hookId),
  offeringId: asId(STARTER_GEAR_IDS.lureId),
  methodId: STARTER_METHOD_ID,
})

export const slotGearId = (loadout: Loadout, slot: LoadoutSlot): GearId | null => {
  switch (slot) {
    case 'rod':
      return loadout.rodId
    case 'reel':
      return loadout.reelId
    case 'line':
      return loadout.lineId
    case 'leader':
      return loadout.leaderId
    case 'hook':
      return loadout.hookId
    case 'offering':
      return loadout.offeringId
  }
}

export const withSlot = (loadout: Loadout, slot: LoadoutSlot, gearId: GearId | null): Loadout => {
  switch (slot) {
    case 'rod':
      return gearId === null ? loadout : { ...loadout, rodId: gearId }
    case 'reel':
      return gearId === null ? loadout : { ...loadout, reelId: gearId }
    case 'line':
      return gearId === null ? loadout : { ...loadout, lineId: gearId }
    case 'leader':
      return { ...loadout, leaderId: gearId }
    case 'hook':
      return gearId === null ? loadout : { ...loadout, hookId: gearId }
    case 'offering':
      return gearId === null ? loadout : { ...loadout, offeringId: gearId }
  }
}

export type LoadoutFailure =
  'unknown_gear' | 'not_owned' | 'wrong_category' | 'unknown_method' | 'method_incompatible'

export type LoadoutCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: LoadoutFailure; readonly message: string }

/** 装備変更の検証（存在・所有・カテゴリ・釣法との相性）。 */
export const checkSlotChange = (options: {
  readonly slot: LoadoutSlot
  readonly gearId: GearId
  readonly gear: readonly GearItem[]
  readonly ownedGearIds: readonly GearId[]
}): LoadoutCheck => {
  const item = options.gear.find((entry) => entry.id === options.gearId)

  if (item === undefined) {
    return { ok: false, reason: 'unknown_gear', message: 'その装備は存在しない' }
  }

  if (!options.ownedGearIds.includes(options.gearId) && options.slot !== 'leader') {
    return { ok: false, reason: 'not_owned', message: '持っていない装備は選べない' }
  }

  if (!SLOT_CATEGORIES[options.slot].includes(item.category)) {
    return {
      ok: false,
      reason: 'wrong_category',
      message: `${options.slot} には ${item.category} を付けられない`,
    }
  }

  return { ok: true }
}
