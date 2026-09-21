import { create } from 'zustand'
import { resolveCatch } from '../domain/catch'
import { emptyCodexState, type CodexState } from '../domain/codex'
import type { FishIndividual } from '../domain/fish/FishIndividual'
import type { FishSpecies } from '../domain/fish/FishSpecies'
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

/**
 * プレイヤーの成長と記録（画面をまたいで保持する state）。
 *
 * ルールは一切ここに書かない。判定は Domain の
 * `resolveCatch` / `allocateSkillPoints` / `unlockPerks` が行い、
 * このストアは結果を保持するだけである。
 *
 * 永続化は直接行わない（IndexedDB を知らない）。
 * 保存と復元は Application 層の persistence coordinator が担当する。
 *
 * 操作は **hydration 完了後（status === 'ready'）のみ** 有効である。
 * 保存済みの状態を読み込む前に操作が走ると、あとから復元した状態で
 * 上書きされてしまうため、ここでも入口を閉じておく。
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

/** 保存対象の slice。coordinator はこの 2 つの同一性だけを見る。 */
export type PersistedPlayerSlice = {
  readonly progression: AnglerProgression
  readonly codex: CodexState
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
      // 値を入れ替えるだけ。XP も記録も動かさない。
      set({
        hydrationStatus: 'ready',
        hydrationFailure: null,
        progression: save.progression,
        codex: save.codex,
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
  }))

/** アプリが使う唯一のストア。テストでは createPlayerStore() で独立した Store を作る。 */
export const usePlayerStore = createPlayerStore()

export type PlayerStore = ReturnType<typeof createPlayerStore>
