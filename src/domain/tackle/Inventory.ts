import type { GearId } from '../ids'
import type { GearItem } from '../gear/Gear'

/**
 * 所持しているタックル。
 *
 * Phase 6 では**耐久・破損・ルアーロストを扱わない**ため、
 * 「持っているか」だけを持つ（数量は持たない）。
 * Bait も Phase 6 では無限使用として同じ扱いにする。
 *
 * Starter gear は必ず含まれる（何も買えなくても釣りが成立する）。
 */

export type Inventory = {
  readonly ownedGearIds: readonly GearId[]
}

export const emptyInventory = (): Inventory => ({ ownedGearIds: [] })

export const ownsGear = (inventory: Inventory, gearId: GearId): boolean =>
  inventory.ownedGearIds.includes(gearId)

/** 所持に加える（同じ id を二重に持たない）。 */
export const addGear = (inventory: Inventory, gearId: GearId): Inventory =>
  ownsGear(inventory, gearId)
    ? inventory
    : { ...inventory, ownedGearIds: [...inventory.ownedGearIds, gearId] }

/** 所持している Gear を Catalog の並び順で返す（表示用）。 */
export const ownedGearOf = (inventory: Inventory, gear: readonly GearItem[]): readonly GearItem[] =>
  gear.filter((item) => ownsGear(inventory, item.id))

/** 所持している Gear のうち、指定カテゴリのもの。 */
export const ownedGearInCategory = (
  inventory: Inventory,
  gear: readonly GearItem[],
  category: GearItem['category'],
): readonly GearItem[] => ownedGearOf(inventory, gear).filter((item) => item.category === category)
