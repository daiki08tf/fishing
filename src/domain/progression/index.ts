export {
  addXp,
  MIN_ANGLER_LEVEL,
  skillPointsForLevel,
  totalXpForLevel,
  xpToNextLevel,
} from './AnglerLevel'
export type { LevelUpOutcome } from './AnglerLevel'

export {
  ANGLER_SKILL_MAX,
  ANGLER_SKILL_MIN,
  allocateSkillPoints,
  clampSkillValue,
  emptyAnglerSkills,
  resetSkillAllocation,
  totalAllocatedSkillPoints,
} from './AnglerSkill'
export type { SkillAllocationFailure, SkillAllocationOutcome } from './AnglerSkill'

export { createInitialProgression, isMaxLevel, xpProgress, xpToNext } from './AnglerProgression'
export type { AnglerProgression } from './AnglerProgression'

export {
  emptyRepetitionState,
  decayMultiplier,
  decayMultiplierForCount,
  incrementRepetition,
  NO_DECAY_RELIEF,
  repetitionCountForSpecies,
} from './repetitionDecay'
export type { DecayRelief, RepetitionState } from './repetitionDecay'

export {
  baseXpForSpecies,
  calculateCatchXp,
  challengeMultiplierFor,
  decayReliefFor,
  sizeMultiplierFor,
} from './xpCalculation'
export type { CatchXpInput, XpBreakdown, XpFactor } from './xpCalculation'

export {
  isPerkUnlockable,
  lockedPerks,
  PERK_DEFINITIONS,
  PERK_IDS,
  unlockablePerks,
  unlockPerks,
} from './perks'
export type { PerkDefinition, PerkId } from './perks'

export {
  describeFishingModifiers,
  PERK_MODIFIERS,
  resolveFishingModifiers,
  SKILL_MODIFIERS,
} from './playerFishingModifiers'
export type { ModifierDeltas } from './playerFishingModifiers'

export { applyCatchToProgression } from './progressionService'
export type { ProgressionUpdate } from './progressionService'

export { DEFAULT_PROGRESSION_TUNING } from './ProgressionTuning'
export type { DecayBand, ProgressionTuning, SizeBand } from './ProgressionTuning'

export { ANGLER_SKILLS } from './PlayerProgression'
export type { AnglerSkill, AnglerSkills, PlayerProgression } from './PlayerProgression'
