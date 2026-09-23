/**
 * Fishing の状態機械。ARCHITECTURE.md §6 に対応する。
 *
 * 状態遷移は UI コンポーネントではなくここで定義する。
 * UI は「許可されたコマンドを送る」だけで、勝敗を決められない。
 */

export const FISHING_PHASES = [
  'IDLE',
  'CASTING',
  'WAITING',
  'BITE',
  'HOOK_WINDOW',
  'HOOKED',
  'FIGHTING',
  'LANDING',
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  /**
   * Phase 18B: 魚がラインを出し尽くした（スプール空）。
   * LINE_BREAK（切れた）とは別の物理的終了 — 容量いっぱいまで
   * ラインが出て、これ以上ファイトを続けられない。
   */
  'SPOOLED',
] as const

export type FishingPhase = (typeof FISHING_PHASES)[number]

/** 失敗して終了した状態。 */
export type FishingFailurePhase = 'HOOK_MISSED' | 'HOOK_ESCAPE' | 'LINE_BREAK' | 'SPOOLED'

export const FISHING_FAILURE_PHASES: readonly FishingPhase[] = [
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'SPOOLED',
]

/**
 * Phase 10 で Text Fishing Battle のコマンドを追加した。
 * 既存の reel / give は互換のために残している（reel = REEL、give = GIVE_LINE）。
 */
export const FISHING_COMMANDS = [
  'cast',
  'hook',
  // Text Battle
  'reel',
  'power_reel',
  'hold',
  'give',
  'pump',
  'loosen_drag',
  'tighten_drag',
  // Landing
  'land',
  'wait',
  'reset',
] as const
export type FishingCommand = (typeof FISHING_COMMANDS)[number]

/**
 * プレイヤー操作を受け付けない（時間経過で自動遷移する）状態。
 * 例: CASTING はキャストのモーション中、BITE は魚が餌をくわえた瞬間。
 */
export const AUTO_ADVANCING_PHASES: readonly FishingPhase[] = [
  'CASTING',
  'WAITING',
  'BITE',
  'HOOKED',
]

/**
 * 各状態で受け付けるコマンド。
 *
 * この表がそのまま「不正な状態遷移の防止」になる。
 * 表に無いコマンドは状態を変えずに拒否される。
 */
export const ALLOWED_COMMANDS: Readonly<Record<FishingPhase, readonly FishingCommand[]>> = {
  IDLE: ['cast'],
  CASTING: [],
  WAITING: [],
  BITE: [],
  // ヒットした瞬間だけフッキングできる。
  HOOK_WINDOW: ['hook'],
  HOOKED: [],
  // 1 コマンド = 1 battle step。連打では有利にならない。
  FIGHTING: ['reel', 'power_reel', 'hold', 'give', 'pump', 'loosen_drag', 'tighten_drag'],
  // 取り込む（land）か、待つ（wait）。
  LANDING: ['land', 'wait'],
  LANDED: ['reset'],
  HOOK_MISSED: ['reset'],
  HOOK_ESCAPE: ['reset'],
  LINE_BREAK: ['reset'],
  SPOOLED: ['reset'],
}

/** 釣行が終わった状態（成功・失敗の両方）。 */
export const TERMINAL_PHASES: readonly FishingPhase[] = ['LANDED', ...FISHING_FAILURE_PHASES]

export const isFishingPhase = (value: string): value is FishingPhase =>
  (FISHING_PHASES as readonly string[]).includes(value)

export const isTerminalPhase = (phase: FishingPhase): boolean => TERMINAL_PHASES.includes(phase)

export const isFailurePhase = (phase: FishingPhase): phase is FishingFailurePhase =>
  FISHING_FAILURE_PHASES.includes(phase)

export const isAutoAdvancingPhase = (phase: FishingPhase): boolean =>
  AUTO_ADVANCING_PHASES.includes(phase)

export const isCommandAllowed = (phase: FishingPhase, command: FishingCommand): boolean =>
  ALLOWED_COMMANDS[phase].includes(command)

/**
 * Engine が発行するイベント。UI 表示とテストの観測点になる。
 * 状態そのものではなく「何が起きたか」を表す。
 */
export const FISHING_EVENTS = [
  'CAST_STARTED',
  'CAST_COMPLETED',
  'BITE',
  'NO_BITE',
  'HOOK_SET',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'SPOOLED',
  'RUN_STARTED',
  'RUN_ENDED',
  'FISH_TIRED',
  'LANDING_STARTED',
  'LANDED',
  'SESSION_RESET',
] as const

export type FishingEvent = (typeof FISHING_EVENTS)[number]
