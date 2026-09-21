import type { IsoDate } from '../primitives'
import type { SourceRefId } from '../ids'

/**
 * 現実データの出典。DATA_MODEL.md §15 に対応する。
 *
 * 法令・遊漁ルールは変更され得るため、日付を保持できる形にする（GAME_DESIGN.md §13）。
 */
export type SourceRef = {
  readonly id: SourceRefId
  readonly title: string
  readonly url?: string
  readonly publisher?: string
  readonly accessedAt?: IsoDate
  readonly verifiedAt?: IsoDate
}
