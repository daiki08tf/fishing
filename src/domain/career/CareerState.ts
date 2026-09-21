import type { JobId } from '../ids'

/**
 * 仕事の状態。DATA_MODEL.md §17 に対応する。
 *
 * Career と Angler Level は独立した状態として保存する。
 */
export type WorkStyle = {
  readonly remoteDays: number
  readonly flexTime: boolean
  readonly overtimeLoad: number
  readonly commuteMinutes: number
}

export type CareerState = {
  readonly jobId: JobId
  readonly careerLevel: number
  readonly salaryBand: number
  readonly workStyle: WorkStyle
  readonly paidLeave: number
  readonly careerXp: number
}
