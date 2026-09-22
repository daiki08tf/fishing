import { create } from 'zustand'
import { evaluateAccess, type AccessEvaluation } from '../domain/access/accessEngine'
import {
  createInitialTransportState,
  grantOwnedTransport,
  type PlayerTransportState,
  type ResolvedTravelOption,
  type TransportDefinition,
} from '../domain/access/Transport'
import { resolveCatch } from '../domain/catch'
import { emptyCodexState, type CodexState } from '../domain/codex'
import {
  addKeptCatch,
  applyCharterTripOutcome,
  claimEligibleRewards,
  createInitialTradeState,
  sellCatches,
  toKeptCatch,
  type BuyerDefinition,
  type ContactReward,
  type SaleLine,
  type SpeciesTradeProfile,
  type TradeState,
} from '../domain/trade'
import {
  SEARCH_SIGN_LABELS,
  searchWater as resolveSearchWater,
  type DepthSignal,
  type EnvironmentSnapshot,
  type FishFinderReading,
  type SearchSign,
} from '../domain/environment'
import type { FishingZone } from '../domain/world/FishingSpot'
import type { Range } from '../domain/primitives'
import {
  createInitialExpeditionState,
  permitIdsForAccess,
  remainingExpeditionDays,
  type ActiveExpedition,
  type ExpeditionPlan,
  type ExpeditionState,
} from '../domain/expedition'
import type { FishIndividual } from '../domain/fish/FishIndividual'
import type { FishSpecies } from '../domain/fish/FishSpecies'
import type { FishIndividualId, FishingSpotId, GearId, TransportId } from '../domain/ids'
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
import {
  advanceMinutes,
  dateKeyOf,
  formatWorldTime,
  MINUTES_PER_DAY,
  sleepUntilMorning,
  type WorldTime,
} from '../domain/world/WorldTime'
import { SeededRandomSource } from '../domain/rng/SeededRandomSource'
import type { FishingSpot } from '../domain/world/FishingSpot'
import { DEFAULT_WORLD_TUNING } from '../domain/world/WorldTuning'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  discoverSpotFromContact,
  isSpotKnown,
  leaveForSpot,
  leaveSpot,
  moveToRegion,
  recordFishingAttempt,
  type WorldState,
} from '../domain/world/worldSession'
import { fastestTravelOption } from '../domain/access/accessEngine'
import { addRegionKnowledge } from '../domain/knowledge/regionKnowledge'
import { asGearId, asRegionId, asTransportId } from '../domain/ids'

/** 遠征の初回訪問で得る地域 Knowledge（PROVISIONAL）。 */
const EXPEDITION_REGION_KNOWLEDGE = 20

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

/**
 * Search Water（Phase 9）の結果。
 * 遠征 / 釣行の途中でだけ意味を持つ情報なので Save には載せない。
 */
export type SearchOutcome = {
  readonly spotId: string
  readonly sign: SearchSign
  readonly speciesIds: readonly string[]
  readonly at: WorldTime
  /** Phase 17B: depth-only Zone があり、Fish Finder を持っているときだけ埋まる。 */
  readonly depthSignals: readonly DepthSignal[] | null
  readonly bottomKnown: boolean | null
  readonly baitActivity: SearchSign | null
  readonly knowledgeHint: string | null
}

export type RecordCatchInput = {
  readonly individual: FishIndividual
  readonly species: FishSpecies
  readonly spotId?: string
  readonly methodId?: string
  readonly capturedAt?: string
}

export type SellToBuyerInput = {
  readonly buyer: BuyerDefinition
  readonly catchIds: readonly FishIndividualId[]
  readonly tradeProfileBySpeciesId: Readonly<Record<string, SpeciesTradeProfile>>
  /** その買取先の報酬定義。閾値到達分だけ claim する。 */
  readonly rewards: readonly ContactReward[]
}

export type SellToBuyerResult =
  | {
      readonly ok: true
      readonly totalValueYen: number
      /** 実際に state へ入った Trust の増分（Trust 100 では 0）。 */
      readonly actualTrustGain: number
      readonly lines: readonly SaleLine[]
      readonly excludedCatchIds: readonly FishIndividualId[]
      readonly newlyClaimedRewards: readonly ContactReward[]
    }
  | { readonly ok: false; readonly reason: 'no_catches_selected' | 'buyer_region_mismatch' }

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
  /** Phase 7A: World から独立した利用可能・所有 Transport。 */
  readonly transport: PlayerTransportState
  /** Phase 8: 遠征（現在の遠征・訪問済み地域・所持している許可）。 */
  readonly expedition: ExpeditionState
  readonly knowledge: KnowledgeState
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
  /** 所持している Gear（Phase 6）。 */
  readonly inventory: Inventory
  /** 現在の装備（Phase 6）。 */
  readonly loadout: Loadout
  /** Phase 13: Fish Box / Trade / Contact。 */
  readonly trade: TradeState
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
  readonly lastSearch: SearchOutcome | null
  /**
   * Phase 17B: 今の Spot での「探索位置」。Reposition で進む。Save には載せない
   * （Spot を出る・帰宅する・別の釣行を始めると 0 に戻る。reload でリセットされても問題ない）。
   */
  readonly searchPositionIndex: number

  beginHydration(): void
  /** 保存済みの状態を適用する。Domain の副作用（XP 加算や記録判定）は起こさない。 */
  hydrateFromSave(save: CurrentSave): void
  /** 保存が無い場合に、初期状態のまま開始する。 */
  completeHydrationWithoutSave(): void
  failHydration(failure: HydrationFailure): void
  /** プレイヤー状態を初期化する（新規ゲーム・テスト用）。 */
  resetPlayerState(): void

  recordCatch(input: RecordCatchInput): void
  /**
   * Phase 13: LANDED した個体を Fish Box へ持ち帰る。
   * Codex / XP（recordCatch）とは独立している。Release を選んだ場合はこれを呼ばない。
   */
  keepCatch(individual: FishIndividual, spot: FishingSpot): void
  /** Fish Box の中身を 1 つの買取先へ売る。Trust の上昇と報酬の claim も反映する。 */
  sellToBuyer(input: SellToBuyerInput): SellToBuyerResult
  spendSkillPoint(skill: AnglerSkill, amount?: number): void
  resetSkills(): void

  /** Spot のアクセス判定（状態は変えない）。 */
  evaluateSpot(spot: FishingSpot, transports: readonly TransportDefinition[]): AccessEvaluation
  /** 釣行前の判定（行けるか / 費用が足りるか）。 */
  evaluateTrip(
    spot: FishingSpot,
    travelOption: ResolvedTravelOption,
    transports: readonly TransportDefinition[],
  ): TripReadiness
  /** 自宅を出て Spot へ移動する（時間が進む）。 */
  travelToSpot(
    spot: FishingSpot,
    transports: readonly TransportDefinition[],
    transportId?: TransportId,
  ): TripActionResult
  /** 釣り 1 回分の結果を世界へ反映する（時間と Knowledge が進む）。 */
  recordAttempt(input: RecordAttemptInput): TripActionResult
  /**
   * Spot を出て自宅へ戻る（帰路の時間が進む）。
   * Charter で来ていれば（Transport に operatorContactId があれば）、
   * ボウズでも Base Trust が Captain / Guide へ入る（Phase 17C）。
   */
  returnHome(
    spot: FishingSpot,
    transports: readonly TransportDefinition[],
    rewards?: readonly ContactReward[],
  ): TripActionResult
  /** 商品を買う。買えると移動手段が増えることがある。 */
  purchaseItem(item: ShopItem): { readonly ok: boolean; readonly message: string | null }
  /** 翌朝まで休む（時間を進める）。 */
  sleep(): { readonly ok: boolean; readonly message: string | null }
  /**
   * Search Water（Boat / Offshore など）。Environment と魚種は UI が渡す
   * （Store は Content を読み込まない）。結果は釣りの Encounter に少し効く。
   */
  searchWater(input: {
    readonly spot: FishingSpot
    readonly species: readonly FishSpecies[]
    readonly environment: EnvironmentSnapshot
    readonly finder: FishFinderReading | null
    /** Phase 17B: depth-only Zone（船の真下など）。岸釣りでは省略でよい。 */
    readonly depthZones?: readonly FishingZone[]
    readonly spotDepthRangeM?: Range
    readonly knowledgeScore?: number
  }): { readonly ok: boolean; readonly message: string | null }
  /**
   * Reposition（Phase 17B）。船 / カヤックで少し移動し、探索位置を進める。
   * 無料の reroll にはしない（ゲーム内時間 15〜30 分を消費する）。
   * 移動後は前回の Search Water 結果を無効にする。
   */
  reposition(): { readonly ok: boolean; readonly message: string | null }
  /** 遠征に出発する（費用を払い、時間を進め、現地の拠点へ移る）。 */
  startExpedition(plan: ExpeditionPlan): TripActionResult
  /** 遠征を終えて home region へ帰る（時間が進む）。 */
  endExpedition(): TripActionResult
  /** 遠征中の残り日数（表示用）。 */
  expeditionRemainingDays(): number
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
  readonly lastSearch: SearchOutcome | null
  readonly searchPositionIndex: number
} => ({
  hydrationStatus: 'idle',
  hydrationFailure: null,
  codex: emptyCodexState(),
  progression: createInitialProgression(),
  world: createInitialWorld(),
  transport: createInitialTransportState(asTransportId),
  expedition: createInitialExpeditionState(asRegionId(DEFAULT_WORLD_TUNING.homeRegionId)),
  knowledge: emptyKnowledgeState(),
  finance: createInitialFinanceState(),
  purchases: [],
  inventory: createStarterInventory(asGearId),
  loadout: createStarterLoadout(asGearId),
  trade: createInitialTradeState(),
  lastCatch: null,
  skillAllocationError: null,
  lastSearch: null,
  searchPositionIndex: 0,
})

/**
 * 時間が進んだあとの後始末。
 * 月を跨いでいれば給与と生活費を精算し、有給を付与する。
 */
const settleAfterAdvance = (finance: FinanceState, from: WorldTime, to: WorldTime): FinanceState =>
  settleFinance({ finance, from, to }).finance

/** Phase 17B: Search Water のベイト活性表示（SEARCH_SIGN_LABELS は「反応」寄りの言い回しのため別に持つ）。 */
const BAIT_ACTIVITY_LABELS: Readonly<Record<SearchSign, string>> = {
  weak: '弱い',
  moderate: '普通',
  strong: '高い',
  large: '非常に高い',
}

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
        transport: save.transport,
        expedition: save.expedition,
        knowledge: save.knowledge,
        finance: save.finance,
        purchases: save.purchases,
        inventory: save.inventory,
        loadout: save.loadout,
        trade: save.trade,
        lastCatch: null,
        skillAllocationError: null,
        lastSearch: null,
        searchPositionIndex: 0,
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

    keepCatch: (individual, spot) => {
      if (get().hydrationStatus !== 'ready') {
        return
      }

      const { trade, world } = get()
      const entry = toKeptCatch({
        individual,
        caughtAt: world.time,
        sourceSpotId: spot.id,
        sourceRegionId: spot.regionId,
      })

      set({ trade: { ...trade, fishBox: addKeptCatch(trade.fishBox, entry) } })
    },

    sellToBuyer: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'no_catches_selected' }
      }

      const { trade, finance, world } = get()
      const result = sellCatches({
        fishBox: trade.fishBox,
        finance,
        trade,
        buyer: input.buyer,
        // Phase 13.1: Domain 側でも現在地域を強制する（UI の出し分けだけに頼らない）。
        currentRegionId: world.currentRegionId,
        catchIds: input.catchIds,
        tradeProfileBySpeciesId: input.tradeProfileBySpeciesId,
        now: world.time,
      })

      if (!result.ok) {
        return result
      }

      // 売却で Trust が上がった分、閾値を越えた報酬を確定する。
      const claim = claimEligibleRewards(result.trade, input.buyer.id, input.rewards)
      let nextWorld = world

      for (const reward of claim.newlyClaimed) {
        if (reward.kind === 'discover_spot' && reward.targetId !== undefined) {
          nextWorld = discoverSpotFromContact(nextWorld, reward.targetId as FishingSpotId)
        }
      }

      set({
        finance: result.finance,
        trade: claim.trade,
        world: nextWorld,
      })

      return {
        ok: true,
        totalValueYen: result.totalValueYen,
        actualTrustGain: result.actualTrustGain,
        lines: result.lines,
        excludedCatchIds: result.excludedCatchIds,
        newlyClaimedRewards: claim.newlyClaimed,
      }
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

    evaluateSpot: (spot, transports) => {
      const { transport, knowledge, expedition, trade } = get()

      return evaluateAccess({
        spot,
        transports,
        playerTransports: transport,
        knowledge,
        permitsEnabled: true,
        permits: permitIdsForAccess(expedition),
        contactTrust: trade.contactTrust,
      })
    },

    evaluateTrip: (spot, travelOption, transports) => {
      const state = get()
      const access = evaluateAccess({
        spot,
        transports,
        playerTransports: state.transport,
        knowledge: state.knowledge,
        permitsEnabled: true,
        permits: permitIdsForAccess(state.expedition),
        contactTrust: state.trade.contactTrust,
      })
      const cost = roundTripCostFor(travelOption)

      return {
        accessOk: access.accessible,
        roundTripCost: cost,
        affordable: canAfford(state.finance, cost),
        travelMinutes: travelOption.minutes,
      }
    },

    travelToSpot: (spot, transports, transportId) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, transport, knowledge, finance, expedition, trade } = get()

      // Phase 8: 今いる地域の釣り場にしか行けない（Domain も leaveForSpot で強制する）。
      // 入口で先に見て、許可や費用より「遠征が必要」を優先して伝える。
      if (String(spot.regionId) !== String(world.currentRegionId)) {
        return {
          ok: false,
          reason: 'access',
          message: '今いる地域と違う釣り場へは行けない（遠征で移動する）',
        }
      }

      /*
       * Phase 13.1: 未発見の Hidden Spot は「知らない」ので出発できない。
       * 交通費を引く前にここで止める（Domain の leaveForSpot と同じ規則）。
       */
      if (!isSpotKnown(world, spot)) {
        return {
          ok: false,
          reason: 'access',
          message: 'その釣り場の場所をまだ知らない（人脈から情報を得る）',
        }
      }

      const access = evaluateAccess({
        spot,
        transports,
        playerTransports: transport,
        knowledge,
        permitsEnabled: true,
        permits: permitIdsForAccess(expedition),
        contactTrust: trade.contactTrust,
      })

      if (!access.accessible) {
        return {
          ok: false,
          reason: 'access',
          message: access.blockedReasons.map((reason) => reason.label).join(' / '),
        }
      }

      const option =
        transportId === undefined
          ? fastestTravelOption(access.travelOptions)
          : (access.travelOptions.find((candidate) => candidate.transportId === transportId) ??
            null)

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
        transports,
        playerTransports: transport,
        permits: permitIdsForAccess(expedition),
        contactTrust: trade.contactTrust,
        ...(transportId === undefined ? {} : { transportId }),
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
        // 別の釣り場へ移ったら Search Water の結果は無効になる。
        lastSearch: null,
        searchPositionIndex: 0,
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

    returnHome: (spot, transports, rewards = []) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, transport, knowledge, finance, expedition, trade } = get()

      /*
       * Phase 17C: Charter Trust はここで確定する（帰宅 = 釣行完了）。
       * ボウズでも Base は入る。対象 Contact が無い Transport（徒歩・電車・
       * レンタル一般など）では何も起きない（operatorContactId が無いため）。
       */
      const tripTransportId = world.trip?.transportId ?? null
      const tripTransport =
        tripTransportId === null
          ? null
          : (transports.find((entry) => entry.id === tripTransportId) ?? null)
      const charterOutcome = applyCharterTripOutcome(trade, tripTransport, world.trip?.catches ?? 0)
      const claim =
        charterOutcome.contactId === null
          ? { trade: charterOutcome.trade, newlyClaimed: [] as readonly ContactReward[] }
          : claimEligibleRewards(charterOutcome.trade, charterOutcome.contactId, rewards)

      const left = leaveSpot({
        context: { world, knowledge },
        spot,
        transports,
        playerTransports: transport,
        permits: permitIdsForAccess(expedition),
      })

      if (!left.ok) {
        return { ok: false, reason: 'state', message: left.message }
      }

      const home = arriveHome({ context: left.context })

      if (!home.ok) {
        return { ok: false, reason: 'state', message: home.message }
      }

      let nextWorld = home.context.world

      for (const reward of claim.newlyClaimed) {
        if (reward.kind === 'discover_spot' && reward.targetId !== undefined) {
          nextWorld = discoverSpotFromContact(nextWorld, reward.targetId as FishingSpotId)
        }
      }

      const settledFinance = settleAfterAdvance(finance, world.time, nextWorld.time)

      set({
        world: nextWorld,
        knowledge: home.context.knowledge,
        finance: settledFinance,
        trade: claim.trade,
        lastSearch: null,
        searchPositionIndex: 0,
      })

      return { ok: true, message: null }
    },

    purchaseItem: (item) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, message: '読み込み中' }
      }

      const { finance, purchases, world, inventory, transport } = get()
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

      // 購入で得た Transport ownership を独立 state に反映する。
      // AccessEngine のルールや World/FishingEngine は書き換えない。
      const nextTransport =
        result.grantedTransportId === null
          ? transport
          : grantOwnedTransport(transport, result.grantedTransportId)

      // 束ね売り（商品が Gear を配る）の場合だけ所持へ入れる。
      const nextInventory =
        result.grantedGearId === null ? inventory : addGear(inventory, result.grantedGearId)

      set({
        finance: result.finance,
        purchases: result.ownedItemIds,
        transport: nextTransport,
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

    /**
     * 水を探る（簡易 Fish Finder）。
     *
     * Spot にいるときだけ意味がある。結果は同じ Spot の釣りにだけ効く。
     */
    searchWater: (input) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, message: '読み込み中' }
      }

      const { world, searchPositionIndex } = get()
      const spot = input.spot

      if (world.phase !== 'AT_SPOT') {
        return { ok: false, message: '釣り場でだけ水を探れる' }
      }

      if (world.currentSpotId !== spot.id) {
        return { ok: false, message: '今いる釣り場と違う' }
      }

      const result = resolveSearchWater({
        environment: input.environment,
        regionId: String(spot.regionId),
        spotId: String(spot.id),
        time: world.time,
        species: input.species,
        finder: input.finder,
        depthZones: input.depthZones,
        spotDepthRangeM: input.spotDepthRangeM,
        knowledgeScore: input.knowledgeScore,
        positionIndex: searchPositionIndex,
      })

      set({
        lastSearch: {
          spotId: String(spot.id),
          sign: result.sign,
          speciesIds: result.speciesIds,
          at: world.time,
          depthSignals: result.depthSignals,
          bottomKnown: result.bottomKnown,
          baitActivity: result.baitActivity,
          knowledgeHint: result.knowledgeHint,
        },
      })

      const depthText =
        result.depthSignals === null || result.depthSignals.length === 0
          ? ''
          : ` / ${result.depthSignals
              .map(
                (signal) =>
                  `${String(signal.rangeM.min)}〜${String(signal.rangeM.max)}m ${SEARCH_SIGN_LABELS[signal.strength]}`,
              )
              .join('、')}`
      const bottomText =
        result.bottomKnown === null
          ? ''
          : result.bottomKnown
            ? ' / 海底の深さは掴めた'
            : ' / 海底までは探知しきれない'

      const baitText =
        result.baitActivity === null
          ? ''
          : ` / ベイト活性: ${BAIT_ACTIVITY_LABELS[result.baitActivity]}`
      const knowledgeText = result.knowledgeHint === null ? '' : ` / ${result.knowledgeHint}`

      return {
        ok: true,
        message: `${result.label}${depthText}${bottomText}${baitText}${knowledgeText}`,
      }
    },

    /**
     * Reposition（Phase 17B）。
     *
     * 「今の位置での反応が薄いので少し移動する」を、時間コストありで表現する。
     * 無料の reroll にしない（15〜30 分、決定論的に seed から決まる）。
     * 位置を進めたら前回の Search Water 結果は無効にする（新しい場所の反応をまだ見ていない）。
     */
    reposition: () => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, message: '読み込み中' }
      }

      const { world, finance, searchPositionIndex } = get()

      if (world.phase !== 'AT_SPOT' || world.currentSpotId === null) {
        return { ok: false, message: '釣り場でだけ移動できる' }
      }

      const roll = new SeededRandomSource(
        `reposition:${String(world.currentSpotId)}:${dateKeyOf(world.time)}:${String(searchPositionIndex)}`,
      ).next()
      const minutes = 15 + Math.round(roll * 15)
      const nextTime = advanceMinutes(world.time, minutes)
      const settledFinance = settleAfterAdvance(finance, world.time, nextTime)

      set({
        world: { ...world, time: nextTime },
        finance: settledFinance,
        searchPositionIndex: searchPositionIndex + 1,
        // 新しい位置での反応はまだ見ていない。
        lastSearch: null,
      })

      return { ok: true, message: `少し移動した（${String(minutes)}分経過）` }
    },

    /**
     * 遠征に出発する。
     *
     * 予約（費用の支払い）→ 航空移動の時間送り → 現地の拠点へ移動、を 1 回で行う。
     * 判定は Domain（planExpedition の結果と Economy の残高）だけを使う。
     */
    startExpedition: (plan) => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, knowledge, finance, expedition } = get()

      if (world.phase !== 'HOME') {
        return { ok: false, reason: 'state', message: '釣り場にいる間は遠征を開始できない' }
      }

      if (expedition.current !== null) {
        return { ok: false, reason: 'state', message: 'すでに遠征中である' }
      }

      const paid = spendCash(finance, {
        kind: 'travel',
        amount: plan.totalCostYen,
        label: `${plan.name}（航空券・宿泊など）`,
        at: formatWorldTime(world.time),
      })

      if (!paid.ok) {
        return { ok: false, reason: 'cost', message: paid.message }
      }

      const moved = moveToRegion({
        context: { world, knowledge },
        regionId: plan.regionId,
        minutes: plan.outboundMinutes,
      })

      if (!moved.ok) {
        return { ok: false, reason: 'state', message: moved.message }
      }

      const firstVisit = !expedition.visitedRegionIds.includes(plan.regionId)
      const nextKnowledge = firstVisit
        ? addRegionKnowledge(
            moved.context.knowledge,
            String(plan.regionId),
            EXPEDITION_REGION_KNOWLEDGE,
          )
        : moved.context.knowledge
      const current: ActiveExpedition = {
        definitionId: plan.definitionId,
        regionId: plan.regionId,
        countryId: plan.countryId,
        regionName: plan.regionName,
        baseId: plan.baseId,
        baseName: plan.baseName,
        startedAt: world.time,
        arriveAt: moved.context.world.time,
        plannedReturnAt: advanceMinutes(moved.context.world.time, plan.nights * MINUTES_PER_DAY),
        returnMinutes: plan.returnMinutes,
        nights: plan.nights,
        lodgingName: plan.lodging.name,
        totalCostYen: plan.totalCostYen,
      }
      const settled = settleAfterAdvance(paid.finance, world.time, moved.context.world.time)

      set({
        world: moved.context.world,
        knowledge: nextKnowledge,
        finance: settled,
        expedition: {
          ...expedition,
          current,
          visitedRegionIds: firstVisit
            ? [...expedition.visitedRegionIds, plan.regionId]
            : expedition.visitedRegionIds,
          permits:
            plan.permitId !== null && !expedition.permits.includes(plan.permitId)
              ? [...expedition.permits, plan.permitId]
              : expedition.permits,
        },
      })

      return { ok: true, message: null }
    },

    /** 遠征を終えて home region へ帰る。航空移動の時間だけが進む。 */
    endExpedition: () => {
      if (get().hydrationStatus !== 'ready') {
        return { ok: false, reason: 'state', message: '読み込み中' }
      }

      const { world, knowledge, finance, expedition } = get()
      const current = expedition.current

      if (current === null) {
        return { ok: false, reason: 'state', message: '遠征していない' }
      }

      if (world.phase !== 'HOME') {
        return { ok: false, reason: 'state', message: '釣り場にいる間は帰れない' }
      }

      const homeRegionId = asRegionId(DEFAULT_WORLD_TUNING.homeRegionId)
      const moved = moveToRegion({
        context: { world, knowledge },
        regionId: homeRegionId,
        minutes: current.returnMinutes,
      })

      if (!moved.ok) {
        return { ok: false, reason: 'state', message: moved.message }
      }

      const settled = settleAfterAdvance(finance, world.time, moved.context.world.time)

      set({
        world: moved.context.world,
        finance: settled,
        expedition: { ...expedition, current: null },
      })

      return { ok: true, message: null }
    },

    expeditionRemainingDays: () => {
      const { expedition, world } = get()

      return expedition.current === null
        ? 0
        : remainingExpeditionDays(expedition.current, world.time)
    },
  }))

/** アプリが使う唯一のストア。テストでは createPlayerStore() で独立した Store を作る。 */
export const usePlayerStore = createPlayerStore()

export type PlayerStore = ReturnType<typeof createPlayerStore>
