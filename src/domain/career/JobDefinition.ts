import type { JobId } from '../ids'
import type { Range } from '../primitives'

/**
 * 職種の定義。DATA_MODEL.md §17 に対応する。
 *
 * 転職先は年収の上位互換にしない。自由時間・通勤・リモート・有給で差を持たせる
 * （PROGRESSION.md §15）。
 */
export type JobDefinition = {
  readonly id: JobId
  readonly name: string

  readonly salaryRange: Range

  readonly timeCost: number
  readonly overtimeProfile: number
  readonly commuteProfile?: number

  readonly remoteWork?: boolean
  readonly flexTime?: boolean

  readonly paidLeaveProfile: number

  readonly eventTable: readonly string[]
}
