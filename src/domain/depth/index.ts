export { FISHING_PLATFORMS, resolveFishingPlatform } from './FishingPlatform'
export type { FishingPlatform, FishingPlatformContext } from './FishingPlatform'

export { DEFAULT_DEPTH_TUNING, depthTargetStatus, resolveDepthCapability } from './DepthCapability'
export type { DepthCapability, DepthTargetStatus, DepthTuning } from './DepthCapability'

export { resolveDeployment } from './resolveDeployment'
export type { DeploymentQuality, ResolvedDeployment } from './resolveDeployment'

export { DRIFT_STRENGTHS, DRIFT_STRENGTH_LABELS, resolveDriftStrength } from './Drift'
export type { DriftStrength } from './Drift'

export { SEA_STATES, SEA_STATE_LABELS, resolveSeaState } from './SeaState'
export type { SeaState } from './SeaState'

export { resolveMarineReadiness } from './MarineReadiness'
export type { MarineReadinessResult } from './MarineReadiness'

export { depthToFightDistanceM } from './fightDistance'
