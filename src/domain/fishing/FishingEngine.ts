import {
  rollEncounter,
  type EncounterCandidate,
  type EncounterProfile,
} from '../encounter/encounterEngine'
import type { FishIndividual } from '../fish/FishIndividual'
import { conditionBand, type ConditionBand } from '../fish/fishCondition'
import type { TraitModifiers } from '../fish/fishTraits'
import { generateFishIndividual } from '../fish/generateFishIndividual'
import type { FishingSpotId } from '../ids'
import type { Range } from '../primitives'
import type { RandomSource } from '../rng/RandomSource'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createFightingFish } from './createFightingFish'
import { fightDistanceSizeIndex } from './fishMassIndex'
import type { FightCapability, WeakLinkComponent } from './FightCapability'
import { resolveFightStage, type FightStage } from './fightStage'
import type { FishBehavior } from './FishBehavior'
import type { FightingFishState } from './FightingFish'
import { DEFAULT_BATTLE_TUNING, type BattleTuning } from './BattleTuning'
import {
  attemptLanding,
  BATTLE_BEHAVIOUR_LABELS,
  stepBattle,
  type BattleBehaviour,
  type BattleCommand,
  type BattleNumbers,
} from './battle'
import { battleText } from './battle/BattleText'
import { NEUTRAL_FISHING_MODIFIERS, type PlayerFishingModifiers } from './PlayerFishingModifiers'
import { DEFAULT_FISHING_TUNING, type FishingTuning } from './FishingTuning'
import {
  isCommandAllowed,
  type FishingCommand,
  type FishingEvent,
  type FishingPhase,
} from './FishingPhase'

/**
 * Fishing Engine（Phase 1）。
 *
 * 設計上の要点:
 * - 状態機械・ファイト計算・魚の行動はすべてこのクラスの中にある。
 *   UI は「コマンドを送る」「tick を進める」ことしかできない。
 * - 乱数は注入された RandomSource からのみ引く。同じ seed なら同じ経過を再現する。
 * - 時間の単位は tick のみ。実時間（ms）は UI が tickMs を使って刻む。
 */

export type FishingFishSnapshot = {
  /** 生成された個体そのもの（サイズ・体重・コンディション・Trait・百分位）。 */
  readonly individual: FishIndividual
  readonly speciesName: string
  readonly conditionBand: ConditionBand
  readonly stamina: number
  readonly staminaMax: number
  readonly behavior: FishBehavior
  readonly power: number
  readonly speed: number
  readonly modifiers: TraitModifiers
}

/**
 * Phase 10: Text Fishing Battle の表示に必要な状態。
 * Engine は文章の材料（行動・距離・保持・ドラグ・ログ）だけを返し、
 * 見せ方は UI が決める。
 */
export type FishingBattleSnapshot = {
  readonly behaviour: BattleBehaviour
  readonly behaviourLabel: string
  readonly distanceM: number
  readonly hookHold: number
  readonly drag: number
  readonly step: number
  readonly log: readonly string[]
  /** 取り込み可能（LANDING 中は true）。 */
  readonly landingReady: boolean
  // ── Phase 18B: 物理ライン ──
  /** スプールから出ている物理ライン量（m）。 */
  readonly lineOutM: number
  /** スプール容量（m）。null = 容量不明（SPOOLED なし）。 */
  readonly lineCapacityM: number | null
  /** 残りライン（m）。容量不明なら null。 */
  readonly lineRemainingM: number | null
  /** 警告帯として残したいライン量（m）。 */
  readonly reserveLineM: number
  /** リーダー / ラインの擦れ残量（1 = 無傷）。 */
  readonly leaderIntegrity: number
  /** タックルの最弱点。 */
  readonly weakLink: WeakLinkComponent | null
  /** 表示用のファイト進行度（derive されるだけ・永続しない）。 */
  readonly fightStage: FightStage
}

export type FishingSnapshot = {
  readonly phase: FishingPhase
  readonly tension: number
  readonly maxTension: number
  /** UI が「良いテンション帯」を示すための範囲。 */
  readonly optimalTension: Range
  /** まだ魚が見えていない段階（IDLE / CASTING / WAITING）では null。 */
  readonly fish: FishingFishSnapshot | null
  readonly ticksInPhase: number
  readonly totalTicks: number
  readonly lastEvents: readonly FishingEvent[]
  /** プレイヤーの技量による倍率（UI 表示用）。 */
  readonly playerModifiers: PlayerFishingModifiers
  /** アワセ猶予の実効 tick 数。 */
  readonly effectiveHookWindowTicks: number
  /** Detection が高いときだけ見える、アタリまでの残り tick。 */
  readonly biteForecastTicks: number | null
  /** Phase 10: Text Battle の状態（FIGHTING / LANDING のときだけ）。 */
  readonly battle: FishingBattleSnapshot | null
}

export type FishingCommandOutcome =
  | {
      readonly accepted: true
      readonly snapshot: FishingSnapshot
      readonly events: readonly FishingEvent[]
    }
  | {
      readonly accepted: false
      readonly reason: 'invalid_command'
      readonly command: FishingCommand
      readonly snapshot: FishingSnapshot
      readonly events: readonly FishingEvent[]
    }

export type FishingTickResult = {
  readonly snapshot: FishingSnapshot
  readonly events: readonly FishingEvent[]
}

export type FishingEngineOptions = {
  /** ヒット候補。Phase 2 では複数魚種を渡せる。 */
  readonly encounters: readonly EncounterCandidate[]
  readonly seed: number | string
  /** 捕獲した個体に紐づける Spot。Phase 4 で本格化する。 */
  readonly spotId?: FishingSpotId
  /**
   * プレイヤーの技量による倍率（Progression 側で解決済みの値）。
   * Engine は Skill や Level を知らない。
   */
  readonly playerModifiers?: PlayerFishingModifiers
  /**
   * 釣法と offering による Encounter の重み付け（Tackle 側で解決済みの値）。
   * Engine は装備の名前もカテゴリも知らない。
   */
  readonly encounterProfile?: EncounterProfile
  readonly tuning?: FishingTuning
  /** Phase 10: Text Battle の調整値。 */
  readonly battleTuning?: BattleTuning
  /**
   * Phase 11: 実際に仕掛けが着水した水平距離。
   * Engine は Zone や Gear を知らず、解決済みの数値だけを受け取る。
   */
  readonly initialFightDistanceM?: number
  /**
   * Phase 18A: 解決済みのタックル戦闘能力（Tackle 側で導出）。
   * Engine は Gear を知らず、この値だけを受け取る。
   * 省略時は Phase 17 と同じ挙動（weak-link による margin なし）。
   */
  readonly fightCapability?: FightCapability
  /**
   * Phase 18B: ファイト開始時にスプールから出ている物理ライン量（m）。
   * キャストなら実着水距離、垂直なら実水深（+ スコープ）を解決済みで渡す。
   * gameplay 距離（initialFightDistanceM）とは別物。省略時は距離と同じ扱い。
   */
  readonly initialLineOutM?: number
  /**
   * Phase 18B: 根ズレリスク（0..1）。Zone の habitatTags から解決済み。
   * Engine は Zone / Spot を知らない。
   */
  readonly abrasionRisk?: number
  /**
   * Phase 10: その Spot の Knowledge（0〜100）。
   * 予兆（telegraph）の文章の精度にだけ使う（結果は変えない）。
   */
  readonly knowledgeScore?: number
  /** テストや特殊な用途向け。省略時は seed から決定論的な RandomSource を作る。 */
  readonly random?: RandomSource
}

/**
 * 魚が見えている状態。バイトの瞬間から魚の情報を開示する。
 */
const REVEALING_PHASES: readonly FishingPhase[] = [
  'BITE',
  'HOOK_WINDOW',
  'HOOKED',
  'FIGHTING',
  'LANDING',
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'SPOOLED',
]

const isFishRevealed = (phase: FishingPhase): boolean => REVEALING_PHASES.includes(phase)

type WaitingPlan = {
  readonly willBite: boolean
  readonly biteTick: number
}

export class FishingEngine {
  readonly tuning: FishingTuning
  readonly playerModifiers: PlayerFishingModifiers

  private readonly encounters: readonly EncounterCandidate[]
  private readonly random: RandomSource
  private readonly seedLabel: string
  private readonly spotId: FishingSpotId | undefined
  private readonly encounterProfile: EncounterProfile | undefined

  private phase: FishingPhase = 'IDLE'
  private ticksInPhase = 0
  private totalTicks = 0
  /** 同じセッション内で何匹目か。個体 id の一意性と再現性に使う。 */
  private encounterCount = 0
  private tension = 0
  private fishState: FightingFishState | null = null
  private plan: WaitingPlan | null = null
  /**
   * Phase 9.1: ヒットした魚に対するフック適合（掛かり / 保持）。
   * EncounterCandidate が運ぶ汎用の数値で、Engine は魚種も針の種類も知らない。
   */
  private hitHookSuccessModifier = 0
  private hitHookRetentionMultiplier = 1
  /** Phase 10: Text Battle の状態。 */
  private battle: BattleNumbers | null = null
  private battleLog: string[] = []
  private readonly battleTuning: BattleTuning
  private readonly knowledgeScore: number
  private readonly initialFightDistanceM: number | undefined
  private readonly fightCapability: FightCapability | undefined
  private readonly initialLineOutM: number | undefined
  private readonly abrasionRisk: number | undefined
  private events: FishingEvent[] = []

  constructor(options: FishingEngineOptions) {
    this.encounters = options.encounters
    this.tuning = options.tuning ?? DEFAULT_FISHING_TUNING
    this.playerModifiers = options.playerModifiers ?? NEUTRAL_FISHING_MODIFIERS
    this.seedLabel = String(options.seed)
    this.random = options.random ?? new SeededRandomSource(options.seed)
    this.spotId = options.spotId
    this.encounterProfile = options.encounterProfile
    this.battleTuning = options.battleTuning ?? DEFAULT_BATTLE_TUNING
    this.knowledgeScore = options.knowledgeScore ?? 0
    this.initialFightDistanceM = options.initialFightDistanceM
    this.fightCapability = options.fightCapability
    this.initialLineOutM = options.initialLineOutM
    this.abrasionRisk = options.abrasionRisk
  }

  // ---------------------------------------------------------------- commands

  cast(): FishingCommandOutcome {
    return this.dispatch('cast')
  }

  hook(): FishingCommandOutcome {
    return this.dispatch('hook')
  }

  reel(): FishingCommandOutcome {
    return this.dispatch('reel')
  }

  give(): FishingCommandOutcome {
    return this.dispatch('give')
  }

  reset(): FishingCommandOutcome {
    return this.dispatch('reset')
  }

  /**
   * コマンドを適用する。
   * 現在の状態で許可されていないコマンドは、状態を変えずに拒否する。
   */
  dispatch(command: FishingCommand): FishingCommandOutcome {
    if (!isCommandAllowed(this.phase, command)) {
      this.events = []
      return {
        accepted: false,
        reason: 'invalid_command',
        command,
        snapshot: this.snapshot(),
        events: [],
      }
    }

    this.events = []

    switch (command) {
      case 'cast':
        this.startCast()
        break
      case 'hook':
        this.startFight()
        break
      case 'reel':
      case 'power_reel':
      case 'hold':
      case 'give':
      case 'pump':
      case 'loosen_drag':
      case 'tighten_drag':
        this.stepTextBattle(command)
        break
      case 'land':
      case 'wait':
        this.stepLanding(command)
        break
      case 'reset':
        this.resetSession()
        break
    }

    return { accepted: true, snapshot: this.snapshot(), events: [...this.events] }
  }

  // ------------------------------------------------------------------- ticks

  tick(): FishingTickResult {
    this.events = []
    this.totalTicks += 1
    this.ticksInPhase += 1

    switch (this.phase) {
      case 'CASTING':
        if (this.ticksInPhase >= this.tuning.castTicks) {
          this.completeCast()
        }
        break

      case 'WAITING':
        this.advanceWaiting()
        break

      case 'BITE':
        if (this.ticksInPhase >= this.tuning.biteTicks) {
          this.enterPhase('HOOK_WINDOW')
        }
        break

      case 'HOOK_WINDOW':
        if (this.ticksInPhase >= this.effectiveHookWindowTicks()) {
          this.events.push('HOOK_MISSED')
          this.enterPhase('HOOK_MISSED')
        }
        break

      case 'HOOKED':
        if (this.ticksInPhase >= this.tuning.hookedTicks) {
          this.startTextBattle()
        }
        break

      /*
       * Phase 10: FIGHTING / LANDING はコマンド駆動（完全ターン制）。
       * tick では何も起きない（連打しても有利にならない）。
       */
      case 'FIGHTING':
      case 'LANDING':
        break

      default:
        // IDLE と終了状態では時間経過による変化はない。
        break
    }

    return { snapshot: this.snapshot(), events: [...this.events] }
  }

  // ------------------------------------------------------------------ snapshot

  snapshot(): FishingSnapshot {
    return {
      phase: this.phase,
      tension: this.tension,
      maxTension: this.effectiveMaxTension(),
      optimalTension: {
        min: this.tuning.optimalTensionMin,
        max: this.tuning.optimalTensionMax,
      },
      fish: this.fishSnapshot(),
      ticksInPhase: this.ticksInPhase,
      totalTicks: this.totalTicks,
      lastEvents: [...this.events],
      playerModifiers: this.playerModifiers,
      effectiveHookWindowTicks: this.effectiveHookWindowTicks(),
      biteForecastTicks: this.biteForecastTicks(),
      battle: this.battleSnapshot(),
    }
  }

  /**
   * アワセ猶予の実効 tick 数。
   *
   * Hooking（技量）とフックの掛かり（装備）で広がる。
   * 0 が「効果なし」の加算値である hookSuccessModifier もここで寄与させ、
   * 解決済み modifier を Engine 側で死なせない。
   */
  effectiveHookWindowTicks(): number {
    return Math.max(
      1,
      Math.round(
        this.tuning.hookWindowTicks *
          this.playerModifiers.hookWindowMultiplier *
          (1 + this.playerModifiers.hookSuccessModifier + this.hitHookSuccessModifier),
      ),
    )
  }

  /**
   * 耐えられるテンションの上限（ライン・ロッド・針で変わる）。
   *
   * Phase 18A: タックルの最弱点（weak link）がラインより明確に弱いとき、
   * 実効の上限を下げる（弱いリーダー / 小さすぎるフックは余裕を削る）。
   * 強度の権威そのものは既存の maxTensionMultiplier のまま。
   */
  effectiveMaxTension(): number {
    const margin = this.fightCapability?.tensionMarginMultiplier ?? 1

    return Math.max(
      0.1,
      this.tuning.maxTension * this.playerModifiers.maxTensionMultiplier * margin,
    )
  }

  /** 糸が緩んでからフックが外れるまでの tick 数（針の保持力で変わる）。 */
  effectiveSlackTicksBeforeEscape(): number {
    return Math.max(
      1,
      Math.round(
        this.tuning.slackTicksBeforeEscape *
          this.playerModifiers.slackToleranceMultiplier *
          this.hitHookRetentionMultiplier,
      ),
    )
  }

  /**
   * Detection が高いときだけ、アタリまでの残り tick を開示する。
   * 見えるかどうかは技量で決まり、結果そのものは変わらない。
   */
  private biteForecastTicks(): number | null {
    const plan = this.plan

    if (this.phase !== 'WAITING' || plan === null || !plan.willBite) {
      return null
    }

    if (this.playerModifiers.detectionClarityMultiplier < this.tuning.detectionForecastThreshold) {
      return null
    }

    return Math.max(0, plan.biteTick - this.ticksInPhase)
  }

  private fishSnapshot(): FishingFishSnapshot | null {
    const state = this.fishState

    if (state === null || !isFishRevealed(this.phase)) {
      return null
    }

    return {
      individual: state.fish.individual,
      speciesName: state.fish.speciesName,
      conditionBand: conditionBand(state.fish.individual.condition),
      stamina: state.stamina,
      staminaMax: state.fish.staminaMax,
      behavior: state.behavior,
      power: state.fish.power,
      speed: state.fish.speed,
      modifiers: state.fish.modifiers,
    }
  }

  // ----------------------------------------------------------- state transitions

  private enterPhase(phase: FishingPhase): void {
    this.phase = phase
    this.ticksInPhase = 0
  }

  private startCast(): void {
    this.fishState = null
    this.plan = null
    this.tension = 0
    this.battle = null
    this.battleLog = []
    this.hitHookSuccessModifier = 0
    this.hitHookRetentionMultiplier = 1
    this.enterPhase('CASTING')
    this.events.push('CAST_STARTED')
  }

  /**
   * キャスト完了時に Encounter を 1 回だけ解決する。
   * ヒットする場合は、待ち tick と個体をここで確定させる（乱数の消費順を固定するため）。
   */
  private completeCast(): void {
    this.events.push('CAST_COMPLETED')

    const outcome = rollEncounter({
      candidates: this.encounters,
      random: this.random,
      tuning: this.tuning,
      ...(this.encounterProfile === undefined ? {} : { profile: this.encounterProfile }),
    })

    if (outcome.kind === 'no_bite') {
      this.plan = { willBite: false, biteTick: this.tuning.maxWaitTicks }
      this.enterPhase('WAITING')
      return
    }

    const species = outcome.candidate.species
    this.encounterCount += 1
    // Phase 9.1: その魚に対するフック適合（掛かり / 保持）をファイトへ引き継ぐ。
    this.hitHookSuccessModifier = outcome.candidate.hookSuccessModifier ?? 0
    this.hitHookRetentionMultiplier = outcome.candidate.hookRetentionMultiplier ?? 1

    /*
     * 乱数の消費順は固定（変更すると seed 再現性が壊れる）:
     *   1. Encounter の判定と魚種選択（rollEncounter）
     *   2. 個体生成（体長 → コンディション → Trait）
     *   3. ファイト特性（power → speed → stamina）
     *   4. アタリまでの待ち tick
     */
    const generated = generateFishIndividual({
      species,
      random: this.random,
      individualSeed: `${species.id}#${this.seedLabel}#${String(this.encounterCount)}`,
      ...(this.spotId === undefined ? {} : { spotId: this.spotId }),
    })

    const fish = createFightingFish({
      species,
      individual: generated.individual,
      traitModifiers: generated.traitModifiers,
      random: this.random,
      tuning: this.tuning,
      battleTuning: this.battleTuning,
    })

    this.fishState = {
      fish,
      stamina: fish.staminaMax,
      behavior: 'normal',
      behaviorRunTicksRemaining: 0,
      slackTicks: 0,
    }
    this.plan = {
      willBite: true,
      biteTick: this.random.int(this.tuning.minWaitTicks, this.tuning.maxWaitTicks),
    }
    this.enterPhase('WAITING')
  }

  private advanceWaiting(): void {
    const plan = this.plan

    if (plan === null) {
      this.enterPhase('IDLE')
      return
    }

    if (this.ticksInPhase < plan.biteTick) {
      return
    }

    if (plan.willBite) {
      this.events.push('BITE')
      this.enterPhase('BITE')
      return
    }

    // ボウズ。設計上、何も釣れない釣行も成立する（GAME_DESIGN.md §10）。
    this.events.push('NO_BITE')
    this.fishState = null
    this.enterPhase('IDLE')
  }

  private startFight(): void {
    this.events.push('HOOK_SET')
    this.enterPhase('HOOKED')
  }

  private resetSession(): void {
    this.fishState = null
    this.plan = null
    this.tension = 0
    this.battle = null
    this.battleLog = []
    this.totalTicks = 0
    // 同じ seed で最初からやり直せば、同じ個体が再び現れる。
    this.encounterCount = 0
    this.enterPhase('IDLE')
    this.events.push('SESSION_RESET')
  }

  // ------------------------------------------------------- text battle (Phase 10)

  /**
   * ファイト開始（HOOKED 完了時）。
   *
   * 初期距離は魚の大きさと Phase 11 の実着水距離から決まる。
   * 着水距離は圧縮して反映し、小魚の遠投が単調な長期戦にならないようにする。
   * フック保持は Phase 9.1 の保持能力（hookRetentionMultiplier）を上限にする。
   */
  private startTextBattle(): void {
    const state = this.fishState

    if (state === null) {
      this.enterPhase('IDLE')
      return
    }

    const profile = state.fish.battleProfile
    const maxTension = this.effectiveMaxTension()
    /*
     * Phase 18A: 大型魚のファイト距離は knee 以降 log で圧縮する
     * （150kg の魚が 150m の単調な距離にならないようにする）。
     */
    const sizeDistanceM =
      this.battleTuning.initialDistanceBaseM +
      this.battleTuning.initialDistancePerSizeM *
        fightDistanceSizeIndex(profile.sizeFactor, this.battleTuning)
    const castDistanceM =
      (this.initialFightDistanceM ?? 0) *
      (this.battleTuning.castDistanceToFightDistanceMultiplier ?? 0.35)
    const distanceM = Math.max(sizeDistanceM, castDistanceM)
    const hookHoldCapacity = Math.max(
      0.01,
      this.hitHookRetentionMultiplier * profile.hookHoldCapacity,
    )

    /*
     * Phase 18B: 物理ライン。
     * gameplay 距離（distanceM）とは別に、スプールから出ている
     * ライン量を追う。深場ほど lineOutFactor が大きくなる。
     */
    const lineCapacityM = this.fightCapability?.effectiveLineCapacityM ?? null
    const initialLineOut = this.initialLineOutM ?? distanceM
    const lineOutFactor = Math.min(10, Math.max(0.2, initialLineOut / Math.max(1, distanceM)))

    // フッキング直後は魚が引いてラインが張っている状態から始める。
    this.tension = maxTension * this.battleTuning.initialTensionRatio
    this.battle = {
      tension: this.tension,
      maxTension,
      stamina: state.stamina,
      staminaMax: state.fish.staminaMax,
      distanceM: Math.round(distanceM * 10) / 10,
      hookHold: Math.min(this.battleTuning.hookHoldInitial, hookHoldCapacity),
      drag: this.battleTuning.dragDefault,
      behaviour: 'normal',
      behaviourStepsRemaining: 1,
      pendingBehaviour: null,
      slackSteps: 0,
      step: 0,
      lineOutM: Math.round(initialLineOut * 10) / 10,
      lineCapacityM,
      reserveLineM: this.fightCapability?.reserveLineM ?? 0,
      lineOutFactor,
      leaderIntegrity: 1,
      weakLink: this.fightCapability?.weakLink ?? null,
    }
    this.battleLog = [
      battleText('behaviour_start', 0),
      `距離 ${String(Math.round(distanceM * 10) / 10)}m からファイト開始。`,
      ...(lineCapacityM === null
        ? []
        : [`ライン ${String(Math.round(initialLineOut))} / ${String(lineCapacityM)}m。`]),
    ]
    this.enterPhase('FIGHTING')
  }

  /** 1 コマンド = 1 step。魚の行動 × コマンド × 状態で結果が変わる。 */
  private stepTextBattle(command: BattleCommand): void {
    const state = this.fishState
    const battle = this.battle

    if (state === null || battle === null) {
      this.enterPhase('IDLE')
      return
    }

    const result = stepBattle({
      numbers: battle,
      command,
      profile: state.fish.battleProfile,
      modifiers: this.playerModifiers,
      tuning: this.battleTuning,
      random: this.random,
      knowledgeScore: this.knowledgeScore,
      capability: this.fightCapability ?? null,
      abrasionRisk: this.abrasionRisk ?? 0,
    })

    this.applyBattleResult(result.numbers, result.log)
    this.events.push(...result.events)

    switch (result.outcome) {
      case 'line_break':
        this.enterPhase('LINE_BREAK')
        break
      case 'hook_escape':
        this.enterPhase('HOOK_ESCAPE')
        break
      case 'spooled':
        this.enterPhase('SPOOLED')
        break
      case 'landing':
        this.enterPhase('LANDING')
        break
      default:
        break
    }
  }

  /** LANDING: 取り込む（LAND）か、待つ（WAIT）。 */
  private stepLanding(command: 'land' | 'wait'): void {
    const state = this.fishState
    const battle = this.battle

    if (state === null || battle === null) {
      this.enterPhase('IDLE')
      return
    }

    const result = attemptLanding({
      numbers: battle,
      command,
      profile: state.fish.battleProfile,
      modifiers: this.playerModifiers,
      tuning: this.battleTuning,
      random: this.random,
    })

    this.applyBattleResult(result.numbers, result.log)
    this.events.push(...result.events)

    if (result.outcome === 'landing') {
      this.enterPhase('LANDED')
      return
    }

    if (result.outcome === 'hook_escape') {
      this.enterPhase('HOOK_ESCAPE')
      return
    }

    if (result.outcome === 'spooled') {
      this.enterPhase('SPOOLED')
      return
    }

    // 待っているうちに距離が開いたら、また掛け合い（FIGHTING）に戻る。
    if (result.numbers.distanceM > this.battleTuning.landingDistanceM) {
      this.enterPhase('FIGHTING')
    }
  }

  private applyBattleResult(numbers: BattleNumbers, log: readonly string[]): void {
    const state = this.fishState

    this.battle = numbers
    this.tension = numbers.tension

    if (state !== null) {
      this.fishState = { ...state, stamina: numbers.stamina, slackTicks: numbers.slackSteps }
    }

    for (const line of log) {
      this.battleLog.push(line)
    }

    // ログは最新 12 件だけ持つ（巨大なログにしない）。
    if (this.battleLog.length > 12) {
      this.battleLog = this.battleLog.slice(this.battleLog.length - 12)
    }
  }

  private battleSnapshot(): FishingBattleSnapshot | null {
    const battle = this.battle

    if (battle === null) {
      return null
    }

    const lineCapacityM = battle.lineCapacityM ?? null
    const lineOutM = battle.lineOutM ?? battle.distanceM

    return {
      behaviour: battle.behaviour,
      behaviourLabel: BATTLE_BEHAVIOUR_LABELS[battle.behaviour],
      distanceM: Math.round(battle.distanceM * 10) / 10,
      hookHold: Math.round(battle.hookHold * 100) / 100,
      drag: Math.round(battle.drag * 100) / 100,
      step: battle.step,
      log: [...this.battleLog],
      landingReady: this.phase === 'LANDING',
      lineOutM: Math.round(lineOutM * 10) / 10,
      lineCapacityM,
      lineRemainingM:
        lineCapacityM === null ? null : Math.max(0, Math.round(lineCapacityM - lineOutM)),
      reserveLineM: battle.reserveLineM ?? 0,
      leaderIntegrity: Math.round((battle.leaderIntegrity ?? 1) * 100) / 100,
      weakLink: (battle.weakLink as WeakLinkComponent | null | undefined) ?? null,
      fightStage: resolveFightStage({
        phase: this.phase,
        staminaRatio: battle.staminaMax <= 0 ? 1 : battle.stamina / battle.staminaMax,
        distanceM: battle.distanceM,
        step: battle.step,
      }),
    }
  }
}
