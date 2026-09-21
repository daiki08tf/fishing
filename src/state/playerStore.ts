import { create } from 'zustand'
import { evaluateAccess, type AccessEvaluation } from '../domain/access/accessEngine'
import type { TransportType } from '../domain/access/Transport'
import { resolveCatch } from '../domain/catch'
import { emptyCodexState, type CodexState } from '../domain/codex'
import type { FishIndividual } from '../domain/fish/FishIndividual'
import type { FishSpecies } from '../domain/fish/FishSpecies'
import type { GearId } from '../domain/ids'
import type { GearItem } from '../domain/gear/Gear'
import { emptyKnowledgeState, type KnowledgeState } from '../domain/knowledge/KnowledgeState'
import type { FishingMethod } from '../domain/method/FishingMethod'
import {
  canAfford,
  createInitialFinanceState,
  roundTripCostFor,
  settleFinance,
  spendCash,
  type FinanceState,
} from '../domain/economy'
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
import { purchaseShopItem, type ShopItem } from '../domain/shop'
import type { ShopItemId } from '../domain/ids'
import {
  addGear,
  checkSlotChange,
  createStarterInventory,
  createStarterLoadout,
  evaluateCompatibility,
  ownsGear,
  resolveGearForLoadout,
  withSlot,
  type Inventory,
  type Loadout,
  type LoadoutFailure,
  type LoadoutSlot,
} from '../domain/tackle'
import { formatWorldTime, sleepUntilMorning, type WorldTime } from '../domain/world/WorldTime'
import type { SpotTravelOption } from '../domain/world/FishingSpot'
import type { FishingSpot } from '../domain/world/FishingSpot'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  grantTransport,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
  type WorldState,
} from '../domain/world/worldSession'
import { fastestTravelOption } from '../domain/access/accessEngine'
import { asGearId } from '../domain/ids'

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
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
  /** 所持している Gear（Phase 6）。 */
  readonly inventory: Inventory
  /** 現在の装備（Phase 6）。 */
  readonly loadout: Loadout
}

/**
 * 装備を検証するために必要なカタログ。
 *
 * Store は Content を読み込まない（UI が渡す）。これにより
 * 「Store が Content / ファイルシステムを知る」ことを避けつつ、
 * 判定そのものは Domain（Loadout / compatibility）に任せられる。
 */
export type TackleCatalog = {
  readonly gear: readonly GearItem[]
  readonly methods: readonly FishingMethod[]
}

/** 装備・購入系アクションの結果。 */
export type GearActionFailureReason =
  LoadoutFailure | 'incompatible' | 'insufficient_cash' | 'already_owned'

export type GearActionResult =
  | { readonly ok: true; readonly message: null }
  | { readonly ok: false; readonly reason: GearActionFailureReason; readonly message: string }

const fail = (reason: GearActionFailureReason, message: string): GearActionResult => ({
  ok: false,
  reason,
  message,
})

/** 釣行前の判定（Access と費用）。 */
export type TripReadiness = {
  readonly accessOk: boolean
  readonly roundTripCost: number
  readonly affordable: boolean
  readonly travelMinutes: number
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
  /** 釣行前の判定（行けるか / 費用が足りるか）。 */
  evaluateTrip(spot: FishingSpot, travelOption: SpotTravelOption): TripReadiness
  /** 自宅を出て Spot へ移動する（時間が進む）。 */
  travelToSpot(spot: FishingSpot, transport?: TransportType): TripActionResult
  /** 釣り 1 回分の結果を世界へ反映する（時間と Knowledge が進む）。 */
  recordAttempt(input: RecordAttemptInput): TripActionResult
  /** Spot を出て自宅へ戻る（帰路の時間が進む）。 */
  returnHome(spot: FishingSpot): TripActionResult
  /** 商品を買う。買えると移動手段が増えることがある。 */
  purchaseItem(item: ShopItem): { readonly ok: boolean; readonly message: string | null }
  /** 翌朝まで休む（時間を進める）。 */
  sleep(): { readonly ok: boolean; readonly message: string | null }
  /** 装備を差し替える（Domain の Loadout / Compatibility で検証する）。 */
  equipGear(
    input: TackleCatalog & { readonly slot: LoadoutSlot; readonly gearId: GearId | null },
  ): GearActionResult
  /** 釣法を変える。offering と両立しない場合は拒否する。 */
  setMethod(input: TackleCatalog & { readonly methodId: string }): GearActionResult
  /** Gear を買う。所持に入るだけで、自動装備はしない。 */
  purchaseGear(input: { readonly item: GearItem }): GearActionResult
  /** その Gear を持っているか（表示用）。 */
  ownsGearId(gearId: GearId): boolean
}

/** 釣行系アクションの結果。Access と Schedule の失敗を区別して返す。 */
export type TripActionResult =
  | { readonly ok: true; readonly message: null }
  | {
      readonly ok: false
      readonly reason: 'access' | 'cost' | 'state'
      readonly message: string
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
  finance: createInitialFinanceState(),
  purchases: [],
  inventory: createStarterInventory(asGearId),
  loadout: createStarterLoadout(asGearId),
  lastCatch: null,
  skillAllocationError: null,
})

/**
 * 時間が進んだあとの後始末。
 * 月を跨いでいれば給与と生活費を精算し、有給を付与する。
 */
const settleAfterAdvance = (finance: FinanceState, from: WorldTime, to: WorldTime): FinanceState =>
  settleFinance({ finance, from, to }).finance

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
        finance: save.finance,
        purchases: save.purchases,
        inventory: save.inventory,
        loadout: save.loadout,
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

    evaluateTrip: (spot, travelOption) => {
      const state = get()
      const access = evaluateAccess({
        spot,
        availableTransports: state.world.availableTransports,
        knowledge: state.knowledge,
      })
      const cost = roundTripCostFor(travelOption)

      return {
        accessOk: access.accessible,
        roundTripCost: cost,
        affordable: canAfford(state.finance, cost),
        travelMinutes: travelOption.minutes,
      }
    },

    travelToSpot: (spot, transport) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, knowledge, finance } = get()
      const access = evaluateAccess({
        spot,
        availableTransports: world.availableTransports,
        knowledge,
      })

      if (!access.accessible) {
        return {
          ok: false,
          reason: 'access',
          message: access.blockedReasons.map((reason) => reason.label).join(' / '),
        }
      }

      const option =
        transport === undefined
          ? fastestTravelOption(access.travelOptions)
          : (access.travelOptions.find((candidate) => candidate.transport === transport) ?? null)

      if (option === null) {
        return { ok: false, reason: 'access', message: 'その移動手段では行けない' }
      }

      const cost = roundTripCostFor(option)
      const paid = spendCash(finance, {
        kind: 'travel',
        amount: cost,
        label: `${spot.name} への交通費`,
        at: formatWorldTime(world.time),
      })

      if (!paid.ok) {
        return { ok: false, reason: 'cost', message: paid.message }
      }

      const left = leaveForSpot({
        context: { world, knowledge },
        spot,
        ...(transport === undefined ? {} : { transport }),
      })

      if (!left.ok) {
        return { ok: false, reason: 'state', message: left.message }
      }

      // 移動は即時解決する（演出が要るようになったら間に挟む）。
      const arrived = arriveAtSpot({ context: left.context, spot })

      if (!arrived.ok) {
        return { ok: false, reason: 'state', message: arrived.message }
      }

      const settledFinance = settleAfterAdvance(
        paid.finance,
        world.time,
        arrived.context.world.time,
      )

      set({
        world: arrived.context.world,
        knowledge: arrived.context.knowledge,
        finance: settledFinance,
      })

      return { ok: true, message: null }
    },

    recordAttempt: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, knowledge, finance } = get()

      const result = recordFishingAttempt({
        context: { world, knowledge },
        spot: input.spot,
        outcome: input.outcome,
        xpGained: input.xpGained,
        ...(input.caughtLengthCm === undefined ? {} : { caughtLengthCm: input.caughtLengthCm }),
      })

      if (!result.ok) {
        return { ok: false, reason: 'state', message: result.message }
      }

      const settledFinance = settleAfterAdvance(finance, world.time, result.context.world.time)

      set({
        world: result.context.world,
        knowledge: result.context.knowledge,
        finance: settledFinance,
      })

      return { ok: true, message: null }
    },

    returnHome: (spot) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, knowledge, finance } = get()
      const left = leaveSpot({ context: { world, knowledge }, spot })

      if (!left.ok) {
        return { ok: false, reason: 'state', message: left.message }
      }

      const home = arriveHome({ context: left.context })

      if (!home.ok) {
        return { ok: false, reason: 'state', message: home.message }
      }

      const settledFinance = settleAfterAdvance(finance, world.time, home.context.world.time)

      set({
        world: home.context.world,
        knowledge: home.context.knowledge,
        finance: settledFinance,
      })

      return { ok: true, message: null }
    },

    purchaseItem: (item) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, message: '読み込み中' }
      }

      const { finance, purchases, world, inventory } = get()
      const result = purchaseShopItem({
        finance,
        ownedItemIds: purchases,
        item,
        at: world.time,
        atLabel: formatWorldTime(world.time),
      })

      if (!result.ok) {
        return { ok: false, message: result.message }
      }

      // 購入で使えるようになった移動手段を World に反映する
      // （AccessEngine のルールは書き換えない。状態が増えるだけ）。
      const nextWorld =
        result.grantedTransport === null ? world : grantTransport(world, result.grantedTransport)

      // 束ね売り（商品が Gear を配る）の場合だけ所持へ入れる。
      const nextInventory =
        result.grantedGearId === null ? inventory : addGear(inventory, result.grantedGearId)

      set({
        finance: result.finance,
        purchases: result.ownedItemIds,
        world: nextWorld,
        inventory: nextInventory,
      })
      return { ok: true, message: null }
    },

    equipGear: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return fail('unknown_gear', '読み込み中')
      }

      const { loadout, inventory } = get()

      if (input.gearId !== null) {
        const checked = checkSlotChange({
          slot: input.slot,
          gearId: input.gearId,
          gear: input.gear,
          ownedGearIds: inventory.ownedGearIds,
        })

        if (!checked.ok) {
          return fail(checked.reason, checked.message)
        }
      }

      const candidate = withSlot(loadout, input.slot, input.gearId)
      const method = input.methods.find((entry) => entry.id === candidate.methodId)

      if (method === undefined) {
        return fail('unknown_method', 'その釣法は存在しない')
      }

      // 致命的な組み合わせだけは装備させない（警告・やや不利は許容する）。
      const report = evaluateCompatibility({
        loadout: candidate,
        gear: input.gear,
        method,
      })

      if (report.fatal) {
        const fatalIssue = report.issues.find((issue) => issue.level === 'fatal')
        return fail('incompatible', fatalIssue?.message ?? 'この組み合わせは使えない')
      }

      set({ loadout: candidate })
      return { ok: true, message: null }
    },

    setMethod: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return fail('unknown_method', '読み込み中')
      }

      const method = input.methods.find((entry) => entry.id === input.methodId)

      if (method === undefined) {
        return fail('unknown_method', 'その釣法は存在しない')
      }

      const { loadout, inventory } = get()
      const candidate: Loadout = { ...loadout, methodId: method.id }
      const resolved = resolveGearForLoadout(candidate, input.gear)

      if (resolved === null) {
        return fail('unknown_gear', '装備が揃っていない')
      }

      if (!inventory.ownedGearIds.includes(resolved.offering.id)) {
        return fail('not_owned', '持っていない offering は使えない')
      }

      const report = evaluateCompatibility({ loadout: candidate, gear: input.gear, method })

      if (report.fatal) {
        const fatalIssue = report.issues.find((issue) => issue.level === 'fatal')
        return fail('incompatible', fatalIssue?.message ?? 'この釣法では使えない')
      }

      set({ loadout: candidate })
      return { ok: true, message: null }
    },

    purchaseGear: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return fail('insufficient_cash', '読み込み中')
      }

      const { finance, inventory, world } = get()

      if (ownsGear(inventory, input.item.id)) {
        return fail('already_owned', 'すでに持っている')
      }

      const paid = spendCash(finance, {
        kind: 'purchase',
        amount: input.item.price,
        label: `${input.item.name} の購入`,
        at: formatWorldTime(world.time),
      })

      if (!paid.ok) {
        return fail('insufficient_cash', paid.message)
      }

      set({ finance: paid.finance, inventory: addGear(inventory, input.item.id) })
      return { ok: true, message: null }
    },

    ownsGearId: (gearId) => ownsGear(get().inventory, gearId),

    /**
     * 翌朝まで休む。昼間でも休める（仕事の予定による制限は無い）。
     * 時間を進めること自体を目的にしないため、操作はこれ 1 つに絞る。
     */
    sleep: () => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, message: '読み込み中' }
      }

      const { world, finance } = get()
      const next = sleepUntilMorning(world.time)
      const settled = settleAfterAdvance(finance, world.time, next)

      set({ world: { ...world, time: next }, finance: settled })

      return { ok: true, message: `翌朝まで休んだ（${formatWorldTime(next)}）` }
    },
  }))

/** アプリが使う唯一のストア。テストでは createPlayerStore() で独立した Store を作る。 */
export const usePlayerStore = createPlayerStore()

export type PlayerStore = ReturnType<typeof createPlayerStore>
