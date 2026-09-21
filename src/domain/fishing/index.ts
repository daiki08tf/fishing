export {
  ALLOWED_COMMANDS,
  AUTO_ADVANCING_PHASES,
  FISHING_COMMANDS,
  FISHING_EVENTS,
  FISHING_FAILURE_PHASES,
  FISHING_PHASES,
  isAutoAdvancingPhase,
  isCommandAllowed,
  isFailurePhase,
  isFishingPhase,
  isTerminalPhase,
  TERMINAL_PHASES,
} from './FishingPhase'
export type {
  FishingCommand,
  FishingEvent,
  FishingFailurePhase,
  FishingPhase,
} from './FishingPhase'

export { DEFAULT_FISHING_TUNING } from './FishingTuning'
export type { FishingTuning } from './FishingTuning'

export { decideBehavior, FISH_BEHAVIORS, runChance } from './FishBehavior'
export type { BehaviorContext, BehaviorDecision, BehaviorState, FishBehavior } from './FishBehavior'

export { createFightingFish } from './createFightingFish'
export type { CreateFightingFishOptions } from './createFightingFish'
export type { FightingFish, FightingFishState } from './FightingFish'

export { FishingEngine } from './FishingEngine'
export type {
  FishingCommandOutcome,
  FishingEngineOptions,
  FishingFishSnapshot,
  FishingSnapshot,
  FishingTickResult,
} from './FishingEngine'

export {
  ADDITIVE_MODIFIER_KEYS,
  FISHING_MODIFIER_KEYS,
  NEUTRAL_FISHING_MODIFIERS,
} from './PlayerFishingModifiers'
export type { FishingModifierKey, PlayerFishingModifiers } from './PlayerFishingModifiers'
