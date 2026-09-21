import { rollEncounter, type EncounterCandidate } from '../encounter/encounterEngine'
import type { FishSpeciesId } from '../ids'
import type { Range } from '../primitives'
import type { RandomSource } from '../rng/RandomSource'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { createFightingFish } from './createFightingFish'
import { decideBehavior, type FishBehavior } from './FishBehavior'
import type { FightingFishState } from './FightingFish'
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
  readonly speciesId: FishSpeciesId
  readonly name: string
  readonly stamina: number
  readonly staminaMax: number
  readonly behavior: FishBehavior
  readonly power: number
  readonly speed: number
  readonly lengthCm: number
  readonly weightKg?: number
  readonly individualSeed: string
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
  /** ヒット候補。Phase 1 では 1 魚種を渡す。 */
  readonly encounters: readonly EncounterCandidate[]
  readonly seed: number | string
  readonly tuning?: FishingTuning
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
]

const isFishRevealed = (phase: FishingPhase): boolean => REVEALING_PHASES.includes(phase)

type WaitingPlan = {
  readonly willBite: boolean
  readonly biteTick: number
}

export class FishingEngine {
  readonly tuning: FishingTuning

  private readonly encounters: readonly EncounterCandidate[]
  private readonly random: RandomSource
  private readonly seedLabel: string

  private phase: FishingPhase = 'IDLE'
  private ticksInPhase = 0
  private totalTicks = 0
  private tension = 0
  private fishState: FightingFishState | null = null
  private plan: WaitingPlan | null = null
  private events: FishingEvent[] = []

  constructor(options: FishingEngineOptions) {
    this.encounters = options.encounters
    this.tuning = options.tuning ?? DEFAULT_FISHING_TUNING
    this.seedLabel = String(options.seed)
    this.random = options.random ?? new SeededRandomSource(options.seed)
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
        this.applyReel()
        break
      case 'give':
        this.applyGive()
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
        if (this.ticksInPhase >= this.tuning.hookWindowTicks) {
          this.events.push('HOOK_MISSED')
          this.enterPhase('HOOK_MISSED')
        }
        break

      case 'HOOKED':
        if (this.ticksInPhase >= this.tuning.hookedTicks) {
          this.enterPhase('FIGHTING')
        }
        break

      case 'FIGHTING':
        this.advanceFight()
        break

      case 'LANDING':
        if (this.ticksInPhase >= this.tuning.landingTicks) {
          this.events.push('LANDED')
          this.enterPhase('LANDED')
        }
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
      maxTension: this.tuning.maxTension,
      optimalTension: {
        min: this.tuning.optimalTensionMin,
        max: this.tuning.optimalTensionMax,
      },
      fish: this.fishSnapshot(),
      ticksInPhase: this.ticksInPhase,
      totalTicks: this.totalTicks,
      lastEvents: [...this.events],
    }
  }

  private fishSnapshot(): FishingFishSnapshot | null {
    const state = this.fishState

    if (state === null || !isFishRevealed(this.phase)) {
      return null
    }

    return {
      speciesId: state.fish.speciesId,
      name: state.fish.name,
      stamina: state.stamina,
      staminaMax: state.fish.staminaMax,
      behavior: state.behavior,
      power: state.fish.power,
      speed: state.fish.speed,
      lengthCm: state.fish.lengthCm,
      ...(state.fish.weightKg === undefined ? {} : { weightKg: state.fish.weightKg }),
      individualSeed: state.fish.individualSeed,
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
    })

    if (outcome.kind === 'no_bite') {
      this.plan = { willBite: false, biteTick: this.tuning.maxWaitTicks }
      this.enterPhase('WAITING')
      return
    }

    const fish = createFightingFish({
      species: outcome.candidate.species,
      random: this.random,
      individualSeed: `${outcome.candidate.species.id}#${this.seedLabel}`,
      tuning: this.tuning,
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
    this.totalTicks = 0
    this.enterPhase('IDLE')
    this.events.push('SESSION_RESET')
  }

  // ------------------------------------------------------------------- fight

  /**
   * tick ごとのファイト進行。
   * プレイヤーが何もしないと、テンションは自然に抜け、魚は自力で消耗する。
   */
  private advanceFight(): void {
    const state = this.fishState

    if (state === null) {
      this.enterPhase('IDLE')
      return
    }

    this.tension = Math.max(0, this.tension - this.tuning.passiveTensionDecay)

    const decision = decideBehavior({
      state: {
        behavior: state.behavior,
        runTicksRemaining: state.behaviorRunTicksRemaining,
      },
      context: {
        speed: state.fish.speed,
        staminaRatio: state.fish.staminaMax === 0 ? 0 : state.stamina / state.fish.staminaMax,
      },
      random: this.random,
      tuning: this.tuning,
    })

    if (decision.changed) {
      this.events.push(decision.behavior === 'run' ? 'RUN_STARTED' : 'RUN_ENDED')
    }

    this.fishState = {
      ...state,
      behavior: decision.behavior,
      behaviorRunTicksRemaining: decision.runTicksRemaining,
    }

    const exertionMultiplier = decision.behavior === 'run' ? this.tuning.runExertionMultiplier : 1
    this.drainStamina(this.tuning.fishExertionStaminaDrain * exertionMultiplier)

    // 走っている魚は竿を引き込む。GIVE しても糸が緩みきらないのはこのため。
    if (decision.behavior === 'run') {
      this.tension = Math.min(this.tuning.maxTension, this.tension + this.tuning.runPullTensionGain)
    }

    this.resolveFightOutcome({ advanceSlack: true })
  }

  private applyReel(): void {
    const state = this.fishState

    if (state === null) {
      return
    }

    const running = state.behavior === 'run'
    const tensionMultiplier = running ? this.tuning.runTensionGainMultiplier : 1
    const efficiencyMultiplier = running ? this.tuning.runReelEfficiencyMultiplier : 1

    const efficiency = this.reelEfficiency(this.tension) * efficiencyMultiplier
    this.drainStamina(this.tuning.reelStaminaDrain * efficiency)

    // 強い魚ほど糸を引く。
    const powerMultiplier = 0.75 + 0.5 * state.fish.power
    this.tension = Math.min(
      this.tuning.maxTension,
      this.tension + this.tuning.reelTensionGain * tensionMultiplier * powerMultiplier,
    )

    this.resolveFightOutcome({ advanceSlack: false })
  }

  private applyGive(): void {
    const state = this.fishState
    const running = state !== null && state.behavior === 'run'
    const relief =
      this.tuning.giveTensionRelief * (running ? this.tuning.runGiveTensionReliefMultiplier : 1)

    this.tension = Math.max(0, this.tension - relief)
    this.restoreStamina(this.tuning.giveStaminaRecovery)
    this.resolveFightOutcome({ advanceSlack: false })
  }

  /**
   * テンション帯による REEL の効率。
   * 緩みすぎていると糸が張っておらず、魚を寄せられない。
   */
  private reelEfficiency(tension: number): number {
    if (tension >= this.tuning.optimalTensionMin) {
      return 1
    }

    const ratio = tension / this.tuning.optimalTensionMin
    return this.tuning.slackReelEfficiency + (1 - this.tuning.slackReelEfficiency) * ratio
  }

  private drainStamina(amount: number): void {
    const state = this.fishState

    if (state === null) {
      return
    }

    this.fishState = { ...state, stamina: Math.max(0, state.stamina - amount) }
  }

  private restoreStamina(amount: number): void {
    const state = this.fishState

    if (state === null) {
      return
    }

    this.fishState = {
      ...state,
      stamina: Math.min(state.fish.staminaMax, state.stamina + amount),
    }
  }

  /**
   * ファイトの決着判定。優先順位は「ラインブレイク → フックが外れる → 取り込み」。
   * 同じ瞬間に複数が成立する場合は、より重い失敗を優先する。
   *
   * 糸が緩んでいる時間（slack）は**時間の経過**で判定する。
   * プレイヤーの操作回数で決めると、連打するほど不利になる
   * （＝操作速度がゲーム性になってしまう）ため、tick のときだけ進める。
   */
  private resolveFightOutcome(options: { readonly advanceSlack: boolean }): void {
    const state = this.fishState

    if (state === null) {
      this.enterPhase('IDLE')
      return
    }

    if (this.tension >= this.tuning.maxTension) {
      this.events.push('LINE_BREAK')
      this.enterPhase('LINE_BREAK')
      return
    }

    if (this.tension >= this.tuning.slackTensionThreshold) {
      if (state.slackTicks !== 0) {
        this.fishState = { ...state, slackTicks: 0 }
      }
    } else {
      const elapsedSlack = options.advanceSlack ? 1 : 0
      const slackTicks = state.slackTicks + elapsedSlack

      if (slackTicks !== state.slackTicks) {
        this.fishState = { ...state, slackTicks }
      }

      if (slackTicks >= this.tuning.slackTicksBeforeEscape) {
        this.events.push('HOOK_ESCAPE')
        this.enterPhase('HOOK_ESCAPE')
        return
      }
    }

    if (state.stamina <= 0) {
      this.events.push('FISH_TIRED')
      this.enterPhase('LANDING')
    }
  }
}
