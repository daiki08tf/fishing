/**
 * 資金状態。DATA_MODEL.md §18 に対応する。
 *
 * 詳細な家計シミュレーターにはしない。生活費はまとめて自動控除する。
 * 資金は「罰」ではなく「次に何を買うか悩むための資源」として扱う。
 */
export type FinanceState = {
  readonly cash: number
  readonly salaryIncome: number
  readonly simplifiedLivingCost: number
}
