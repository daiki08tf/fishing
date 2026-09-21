import type { CareerState } from '../../domain/career/CareerState'
import { emptyCodexState, type CodexState } from '../../domain/codex'
import type { FinanceState } from '../../domain/economy/FinanceState'
import { asJobId } from '../../domain/ids'
import { emptyKnowledgeState } from '../../domain/knowledge/KnowledgeState'
import type { KnowledgeState } from '../../domain/knowledge/KnowledgeState'
import type { IsoDateTime } from '../../domain/primitives'
import type { AnglerProgression } from '../../domain/progression/AnglerProgression'
import { createInitialProgression } from '../../domain/progression/AnglerProgression'
import { CURRENT_SAVE_SCHEMA_VERSION, type SaveGameV3 } from '../../domain/save/SaveGame'
import { createInitialWorld, type WorldState } from '../../domain/world/worldSession'

/**
 * プレイヤーの状態から Save を組み立てる。
 *
 * ここは値を運ぶだけで、記録や成長のルールは持たない
 * （Codex の中身は Domain が作ったものをそのまま入れる）。
 * 開始時の資金・職種などは呼び出し側が決める。
 */

export type SaveSourceState = {
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: WorldState
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  readonly finance: FinanceState
  /** 現在時刻。呼び出し側が渡す（Domain は時計を持たない）。 */
  readonly now: IsoDateTime
  /** 初回保存時のみ指定する。省略すると now を使う。 */
  readonly createdAt?: IsoDateTime
}

export const createSave = (source: SaveSourceState): SaveGameV3 => ({
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
  createdAt: source.createdAt ?? source.now,
  updatedAt: source.now,
  progression: source.progression,
  codex: source.codex,
  world: source.world,
  knowledge: source.knowledge,
  career: source.career,
  finance: source.finance,
})

/**
 * PROVISIONAL — 新規プレイヤーの初期 Save。
 *
 * career / finance は Phase 5（仕事・経済）で正式に決まる。
 * それまでは「まだ決まっていない」ことを示す中立な値で埋める
 * （開始時の職種・資金は設計上の決定であり、ここで勝手に決めない）。
 *
 * knowledge は空から始める（Phase 4 で釣行・観察により増える）。
 */
export const createInitialSave = (options: { readonly now: IsoDateTime }): SaveGameV3 => ({
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
  createdAt: options.now,
  updatedAt: options.now,
  progression: createInitialProgression(),
  codex: emptyCodexState(),
  world: createInitialWorld(),
  knowledge: emptyKnowledgeState(),
  career: {
    jobId: asJobId('phase3-placeholder-job'),
    careerLevel: 1,
    salaryBand: 1,
    workStyle: { remoteDays: 0, flexTime: false, overtimeLoad: 0, commuteMinutes: 0 },
    paidLeave: 0,
    careerXp: 0,
  },
  finance: { cash: 0, salaryIncome: 0, simplifiedLivingCost: 0 },
})
