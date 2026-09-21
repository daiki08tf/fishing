export {
  checkSlotChange,
  createStarterInventory,
  createStarterLoadout,
  loadoutGearIds,
  LOADOUT_SLOTS,
  SLOT_CATEGORIES,
  slotGearId,
  STARTER_GEAR_IDS,
  STARTER_METHOD_ID,
  starterInventoryIds,
  withSlot,
} from './Loadout'
export type { Loadout, LoadoutCheck, LoadoutFailure, LoadoutSlot } from './Loadout'

export {
  COMPATIBILITY_LABELS,
  COMPATIBILITY_LEVELS,
  evaluateCompatibility,
  resolveGearForLoadout,
} from './compatibility'
export type { CompatibilityIssue, CompatibilityLevel, CompatibilityReport } from './compatibility'

export { composeFishingModifiers, resolveTackle } from './resolveTackle'
export type { EncounterProfile, ResolvedFishingSetup, TackleRatings } from './resolveTackle'

export { addGear, emptyInventory, ownedGearInCategory, ownedGearOf, ownsGear } from './Inventory'
export type { Inventory } from './Inventory'

export { DEFAULT_GEAR_TUNING } from '../gear/GearTuning'
export type { GearTuning, MethodTuning } from '../gear/GearTuning'

export {
  BAIT_TYPES,
  GEAR_CATEGORIES,
  GEAR_CATEGORY_LABELS,
  gearById,
  HOOK_TYPES,
  isHook,
  isLeader,
  isLine,
  isOffering,
  isReel,
  isRod,
  LINE_TYPES,
  LURE_TYPES,
  offeringTagsOf,
  REEL_TYPES,
  ROD_ACTIONS,
  ROD_POWERS,
} from '../gear/Gear'
export type {
  BaitDefinition,
  GearCategory,
  GearItem,
  HookDefinition,
  LeaderDefinition,
  LineDefinition,
  LureDefinition,
  OfferingDefinition,
  ReelDefinition,
  RodDefinition,
  RodPower,
} from '../gear/Gear'
