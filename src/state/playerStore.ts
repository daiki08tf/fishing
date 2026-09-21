import { create } from 'zustand'
import { evaluateAccess, type AccessEvaluation } from '../domain/access/accessEngine'
import type { TransportType } from '../domain/access/Transport'
import { resolveCatch } from '../domain/catch'
import { emptyCodexState, type CodexState } from '../domain/codex'
import type { FishIndividual } from '../domain/fish/FishIndividual'
import type { FishSpecies } from '../domain/fish/FishSpecies'
import { emptyKnowledgeState, type KnowledgeState } from '../domain/knowledge/KnowledgeState'
import {
  allocateSkillPoints,
  createInitialProgression,
  resetSkillAllocation,
  unlockPerks,
  type AnglerProgression,
  type AnglerSkill,
  type PerkId,
  type SkillAllocationFailure,
} from '../domain/progression'
import type { CurrentSave } from '../domain/save/SaveGame'
import type { FishingSpot } from '../domain/world/FishingSpot'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
  type WorldActionResult,
  type WorldState,
} from '../domain/world/worldSession'

/**
 * Save に載る状態（Player + World）をまとめて持つストア。
 *
 * ルールは一切ここに書かない。判定は Domain（resolveCatch / worldSession /
 * accessEngine / progression）が行い、このストアは結果を保持するだけである。
 *
 * - 永続化は直接行わない（IndexedDB を知らない）。保存と復元は
 *   Application 層の persistence coordinator が担当する。
 * - 操作は hydration 完了後（status === 'ready'）のみ有効。
 * - Player と World を同じストアに置くのは、同じ 1 つの Save として
 *   まとめて hydrate / autosave するためである（保存の単位＝ストアの単位）。
 */

export type HydrationStatus = 'idle' | 'hydrating' | 'ready' | 'error'

export type HydrationFailureReason = 'invalid_save' | 'storage_unavailable' | 'unknown'

export type HydrationFailure = {
  readonly reason: HydrationFailureReason
  readonly message: string
}

export type LastCatchSummary = {
  readonly speciesName: string
  readonly xpGained: number
  readonly sizeBand: string
  readonly baseXp: number
  readonly decayMultiplier: number
  readonly firstCatch: boolean
  readonly personalBest: boolean
  readonly levelsGained: readonly number[]
  readonly skillPointsGained: number
  readonly unlockedPerks: readonly PerkId[]
  readonly factors: readonly { readonly label: string; readonly value: number }[]
}

export type RecordCatchInput = {
  readonly individual: FishIndividual
  readonly species: FishSpecies
  readonly spotId?: string
  readonly methodId?: string
  readonly capturedAt?: string
}

export type RecordAttemptInput = {
  readonly spot: FishingSpot
  readonly outcome: 'landed' | 'failed'
  readonly xpGained: number
  readonly caughtLengthCm?: number
}

/** 保存対象の slice。coordinator はこの 4 つの同一性だけを見る。 */
export type PersistedPlayerSlice = {
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: WorldState
  readonly knowledge: KnowledgeState
}

export type PlayerStoreState = PersistedPlayerSlice & {
  readonly hydrationStatus: HydrationStatus
  readonly hydrationFailure: HydrationFailure | null
  readonly lastCatch: LastCatchSummary | null
  readonly skillAllocationError: SkillAllocationFailure | null

  beginHydration(): void
  /** 保存済みの状態を適用する。Domain の副作用（XP 加算や記録判定）は起こさない。 */
  hydrateFromSave(save: CurrentSave): void
  /** 保存が無い場合に、初期状態のまま開始する。 */
  completeHydrationWithoutSave(): void
  failHydration(failure: HydrationFailure): void
  /** プレイヤー状態を初期化する（新規ゲーム・テスト用）。 */
  resetPlayerState(): void

  recordCatch(input: RecordCatchInput): void
  spendSkillPoint(skill: AnglerSkill, amount?: number): void
  resetSkills(): void

  /** Spot のアクセス判定（状態は変えない）。 */
  evaluateSpot(spot: FishingSpot): AccessEvaluation
  /** 自宅を出て Spot へ移動する（時間が進む）。 */
  travelToSpot(spot: FishingSpot, transport?: TransportType): WorldActionResult
  /** 釣り 1 回分の結果を世界へ反映する（時間と Knowledge が進む）。 */
  recordAttempt(input: RecordAttemptInput): WorldActionResult
  /** Spot を出て自宅へ戻る（帰路の時間が進む）。 */
  returnHome(spot: FishingSpot): WorldActionResult
}

const createInitialState = (): PersistedPlayerSlice & {
  readonly hydrationStatus: HydrationStatus
  readonly hydrationFailure: HydrationFailure | null
  readonly lastCatch: LastCatchSummary | null
  readonly skillAllocationError: SkillAllocationFailure | null
} => ({
  hydrationStatus: 'idle',
  hydrationFailure: null,
  codex: emptyCodexState(),
  progression: createInitialProgression(),
  world: createInitialWorld(),
  knowledge: emptyKnowledgeState(),
  lastCatch: null,
  skillAllocationError: null,
})

export const createPlayerStore = () =>
  create<PlayerStoreState>()((set, get) => ({
    ...createInitialState(),

    beginHydration: () => {
      set({ hydrationStatus: 'hydrating', hydrationFailure: null })
    },

    hydrateFromSave: (save) => {
      // 値を入れ替えるだけ。XP も記録も時間も動かさない。
      set({
        hydrationStatus: 'ready',
        hydrationFailure: null,
        progression: save.progression,
        codex: save.codex,
        world: save.world,
        knowledge: save.knowledge,
        lastCatch: null,
        skillAllocationError: null,
      })
    },

    completeHydrationWithoutSave: () => {
      set({ hydrationStatus: 'ready', hydrationFailure: null })
    },

    failHydration: (failure) => {
      set({ hydrationStatus: 'error', hydrationFailure: failure })
    },

    resetPlayerState: () => {
      set(createInitialState())
    },

    recordCatch: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return
      }

      const { codex, progression } = get()
      const resolution = resolveCatch({
        individual: input.individual,
        species: input.species,
        codex,
        progression,
        ...(input.spotId === undefined ? {} : { spotId: input.spotId }),
        ...(input.methodId === undefined ? {} : { methodId: input.methodId }),
        ...(input.capturedAt === undefined ? {} : { capturedAt: input.capturedAt }),
      })

      set({
        codex: resolution.codex,
        progression: resolution.progression,
        lastCatch: {
          speciesName: input.species.japaneseName,
          xpGained: resolution.xp.total,
          sizeBand: resolution.xp.sizeBand,
          baseXp: resolution.xp.base,
          decayMultiplier: resolution.xp.decayMultiplier,
          firstCatch: resolution.record.isFirstCatchOfSpecies,
          personalBest: resolution.record.isPersonalBest,
          levelsGained: resolution.progressionUpdate.levelsGained,
          skillPointsGained: resolution.progressionUpdate.skillPointsGained,
          unlockedPerks: resolution.progressionUpdate.newlyUnlockedPerks,
          factors: resolution.xp.factors,
        },
      })
    },

    spendSkillPoint: (skill, amount = 1) => {
      if (get().hydrationStatus !== 'ready') {
        return
      }

      const { progression } = get()
      const outcome = allocateSkillPoints({
        skills: progression.skills,
        skillPoints: progression.skillPoints,
        skill,
        amount,
      })

      if (!outcome.ok) {
        set({ skillAllocationError: outcome.reason })
        return
      }

      // 割り振りの結果、Perk の条件を満たすことがある。
      const unlock = unlockPerks({
        ...progression,
        skills: outcome.skills,
        skillPoints: outcome.skillPoints,
      })

      set({ progression: unlock.progression, skillAllocationError: null })
    },

    resetSkills: () => {
      if (get().hydrationStatus !== 'ready') {
        return
      }

      const { progression } = get()
      const reset = resetSkillAllocation({
        skills: progression.skills,
        skillPoints: progression.skillPoints,
      })

      // 条件を満たさなくなった Perk は未解禁へ戻す（振り直しの抜け道を作らない）。
      const unlock = unlockPerks({ ...progression, ...reset, unlockedPerks: [] })

      set({ progression: unlock.progression, skillAllocationError: null })
    },

    evaluateSpot: (spot) => {
      const { world, knowledge } = get()

      return evaluateAccess({
        spot,
        availableTransports: world.availableTransports,
        knowledge,
      })
    },

    travelToSpot: (spot, transport) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'not_at_home', message: '読み込み中' }
      }

      const { world, knowledge } = get()
      const left = leaveForSpot({
        context: { world, knowledge },
        spot,
        ...(transport === undefined ? {} : { transport }),
      })

      if (!left.ok) {
        return left
      }

      // 移動は即時解決する（演出が要るようになったら間に挟む）。
      const arrived = arriveAtSpot({ context: left.context, spot })

      if (!arrived.ok) {
        return arrived
      }

      set({ world: arrived.context.world, knowledge: arrived.context.knowledge })
      return arrived
    },

    recordAttempt: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'not_at_spot', message: '読み込み中' }
      }

      const { world, knowledge } = get()
      const result = recordFishingAttempt({
        context: { world, knowledge },
        spot: input.spot,
        outcome: input.outcome,
        xpGained: input.xpGained,
        ...(input.caughtLengthCm === undefined ? {} : { caughtLengthCm: input.caughtLengthCm }),
      })

      if (!result.ok) {
        return result
      }

      set({ world: result.context.world, knowledge: result.context.knowledge })
      return result
    },

    returnHome: (spot) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'not_at_spot', message: '読み込み中' }
      }

      const { world, knowledge } = get()
      const left = leaveSpot({ context: { world, knowledge }, spot })

      if (!left.ok) {
        return left
      }

      const home = arriveHome({ context: left.context })

      if (!home.ok) {
        return home
      }

      set({ world: home.context.world, knowledge: home.context.knowledge })
      return home
    },
  }))

/** アプリが使う唯一のストア。テストでは createPlayerStore() で独立した Store を作る。 */
export const usePlayerStore = createPlayerStore()

export type PlayerStore = ReturnType<typeof createPlayerStore>
