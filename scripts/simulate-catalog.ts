import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import type { BuiltInContent } from '../src/content/catalog/assembleContent'
import { formatYen } from '../src/domain/economy'
import {
  COMPATIBILITY_LABELS,
  resolveTackle,
  STARTER_GEAR_IDS,
  type Loadout,
  type ResolvedFishingSetup,
} from '../src/domain/tackle'
import { FISHING_MODIFIER_KEYS, type PlayerFishingModifiers } from '../src/domain/fishing'
import {
  GEAR_CATEGORIES,
  ROD_SERIES_CATEGORIES,
  type GearItem,
  type LureDefinition,
  type OfferingDefinition,
} from '../src/domain/gear/Gear'
import { asGearId } from '../src/domain/ids'

/**
 * Gear カタログの健全性（Phase 6.5）。
 *
 * 見たいこと:
 * - カテゴリごとの件数と、番手 / 用途のカバレッジ
 * - 同じ番手でもブランドごとに性格が違うこと（spec の結果として）
 * - 代表的な Build が実際に組めること
 * - **高価格が万能になっていないこと**（price ladder になっていない）
 *
 * 決定論的。FishingEngine は触らない（Content と Domain の解決だけを見る）。
 */

export type CatalogSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly { readonly label: string; readonly ok: boolean }[]
}

type Criterion<T> = (item: T) => boolean

const pick = <T>(
  items: readonly T[],
  where: Criterion<T>,
  order: (left: T, right: T) => number,
): T | undefined => [...items].filter(where).sort(order)[0]

/**
 * ロッドに合う offering を選ぶ（重量域の外は致命的になるため）。
 * プレイヤーが実際にやるように、まずロッドを決めてからルアーを選ぶ。
 */
const pickOffering = (
  content: BuiltInContent,
  rod: GearItem | undefined,
  where: Criterion<LureDefinition>,
  order: (left: LureDefinition, right: LureDefinition) => number,
): LureDefinition | undefined =>
  pick(
    content.gear.filter((item): item is LureDefinition => item.category === 'lure'),
    (item) =>
      where(item) &&
      (rod === undefined ||
        rod.category !== 'rod' ||
        (item.weightG >= rod.minLureWeightG && item.weightG <= rod.maxLureWeightG)),
    order,
  )

const numOr = (value: number | undefined, fallback: number): number => value ?? fallback

const rodItems = (content: BuiltInContent) => content.gear.filter((item) => item.category === 'rod')
const reelItems = (content: BuiltInContent) =>
  content.gear.filter((item) => item.category === 'reel')
const lineItems = (content: BuiltInContent) =>
  content.gear.filter((item) => item.category === 'line')
const leaderItems = (content: BuiltInContent) =>
  content.gear.filter((item) => item.category === 'leader')
const hookItems = (content: BuiltInContent) =>
  content.gear.filter((item) => item.category === 'hook')
const offeringItems = (content: BuiltInContent) =>
  content.gear.filter(
    (item): item is OfferingDefinition => item.category === 'lure' || item.category === 'bait',
  )

/** 代表 Build。具体的な ID を書かず、条件でカタログから選ぶ。 */
export type BuildPlan = {
  readonly id: string
  readonly label: string
  readonly note: string
  readonly select: (content: BuiltInContent) => Loadout | null
}

export const buildPlans: readonly BuildPlan[] = [
  {
    id: 'starter',
    label: 'Starter',
    note: '初期装備。何でも少しできる。',
    select: () => ({
      rodId: asGearId(STARTER_GEAR_IDS.rodId),
      reelId: asGearId(STARTER_GEAR_IDS.reelId),
      lineId: asGearId(STARTER_GEAR_IDS.lineId),
      leaderId: asGearId(STARTER_GEAR_IDS.leaderId),
      hookId: asGearId(STARTER_GEAR_IDS.hookId),
      offeringId: asGearId(STARTER_GEAR_IDS.lureId),
      methodId: 'lure',
    }),
  },
  {
    id: 'ultra_finesse',
    label: 'Ultra Finesse',
    note: 'アジング / トラウト。軽量ルアーと細いラインで小型を狙う。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) =>
          item.category === 'rod' &&
          (item.seriesCategory === 'ajing' ||
            item.seriesCategory === 'mebaring' ||
            item.seriesCategory === 'trout') &&
          item.minLureWeightG <= 1.5,
        (left, right) => left.maxLureWeightG - right.maxLureWeightG,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 1000,
        (left, right) => left.weightG - right.weightG,
      )
      const line = pick(
        lineItems(content),
        (item) => item.category === 'line' && item.lineType === 'pe' && item.strengthKg <= 3,
        (left, right) => left.diameterMm - right.diameterMm,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.size >= 10,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) =>
          item.category === 'lure' &&
          item.weightG <= 4 &&
          ['minnow', 'soft_plastic', 'spoon'].includes(item.lureType),
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: null,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'light_lure',
      }
    },
  },
  {
    id: 'light_game',
    label: 'Light Game',
    note: 'メバリング。軽いジグヘッドと小型プラグ。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) => item.category === 'rod' && item.seriesCategory === 'mebaring',
        (left, right) => left.lengthM - right.lengthM,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 2000,
        (left, right) => left.weightG - right.weightG,
      )
      const line = pick(
        lineItems(content),
        (item) =>
          item.category === 'line' &&
          item.lineType === 'pe' &&
          item.strengthKg >= 2 &&
          item.strengthKg <= 5,
        (left, right) => left.diameterMm - right.diameterMm,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.hookType === 'jighead',
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) =>
          item.category === 'lure' &&
          item.weightG >= 5 &&
          item.weightG <= 12 &&
          ['minnow', 'soft_plastic', 'spoon'].includes(item.lureType),
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: null,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'light_lure',
      }
    },
  },
  {
    id: 'balanced_seabass',
    label: 'Balanced Seabass',
    note: 'シーバス汎用。9ft 前後の M ロッド + 3000 番。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) =>
          item.category === 'rod' &&
          item.seriesCategory === 'seabass' &&
          item.power === 'M' &&
          item.lengthM >= 2.7 &&
          item.lengthM <= 2.95,
        (left, right) => left.price - right.price,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 3000,
        (left, right) => left.price - right.price,
      )
      const line = pick(
        lineItems(content),
        (item) =>
          item.category === 'line' &&
          item.lineType === 'fluorocarbon' &&
          item.strengthKg >= 3 &&
          item.strengthKg <= 6,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const leader = pick(
        leaderItems(content),
        (item) => item.category === 'leader' && item.strengthKg >= 5 && item.strengthKg <= 10,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.hookType === 'treble',
        (left, right) => left.size - right.size,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) => item.category === 'lure' && item.weightG >= 10 && item.weightG <= 20,
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        leader === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'lure',
      }
    },
  },
  {
    id: 'long_cast_surf',
    label: 'Long Cast Surf',
    note: 'サーフ遠投。長いロッドと重めのメタル。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) => item.category === 'rod' && item.seriesCategory === 'surf',
        (left, right) => right.lengthM - left.lengthM,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 5000,
        (left, right) => right.maxDragKg - left.maxDragKg,
      )
      const line = pick(
        lineItems(content),
        (item) => item.category === 'line' && item.lineType === 'pe' && item.strengthKg >= 10,
        (left, right) => left.diameterMm - right.diameterMm,
      )
      const leader = pick(
        leaderItems(content),
        (item) => item.category === 'leader' && item.strengthKg >= 12,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.size < 0 && item.hookType === 'single',
        (left, right) => left.size - right.size,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) => item.category === 'lure' && item.weightG >= 25,
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        leader === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'lure',
      }
    },
  },
  {
    id: 'power_shore_jigging',
    label: 'Power Shore Jigging',
    note: 'ショアジギング。重いジグとアシストフック。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) =>
          item.category === 'rod' &&
          item.seriesCategory === 'shore_jigging' &&
          item.maxLureWeightG >= 60,
        (left, right) => right.maxLureWeightG - left.maxLureWeightG,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 6000,
        (left, right) => right.maxDragKg - left.maxDragKg,
      )
      const line = pick(
        lineItems(content),
        (item) => item.category === 'line' && item.lineType === 'pe' && item.strengthKg >= 15,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const leader = pick(
        leaderItems(content),
        (item) => item.category === 'leader' && item.strengthKg >= 20,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.hookType === 'assist',
        (left, right) => right.strengthKg - left.strengthKg,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) => item.category === 'lure' && item.lureType === 'jig' && item.weightG >= 40,
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        leader === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'lure',
      }
    },
  },
  {
    id: 'offshore_power',
    label: 'Offshore Power',
    note: 'オフショアジギング。10000 番と長いロッド。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) => item.category === 'rod' && item.seriesCategory === 'offshore_jigging',
        (left, right) => right.fightingPower - left.fightingPower,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 10000,
        (left, right) => right.maxDragKg - left.maxDragKg,
      )
      const line = pick(
        lineItems(content),
        (item) => item.category === 'line' && item.lineType === 'pe' && item.strengthKg >= 25,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const leader = pick(
        leaderItems(content),
        (item) => item.category === 'leader' && item.strengthKg >= 30,
        (left, right) => left.strengthKg - right.strengthKg,
      )
      const hook = pick(
        hookItems(content),
        (item) => item.category === 'hook' && item.hookType === 'assist',
        (left, right) => right.strengthKg - left.strengthKg,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) => item.category === 'lure' && item.lureType === 'jig' && item.weightG >= 80,
        (left, right) => left.weightG - right.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        leader === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'lure',
      }
    },
  },
  {
    id: 'big_game',
    label: 'Big Game',
    note: '大型番手。20000 番と最強クラスのライン。',
    select: (content) => {
      const rod = pick(
        rodItems(content),
        (item) => item.category === 'rod' && item.seriesCategory === 'big_game',
        (left, right) => right.recommendedLineMaxKg - left.recommendedLineMaxKg,
      )
      const reel = pick(
        reelItems(content),
        (item) => item.category === 'reel' && item.sizeClass === 20000,
        (left, right) => right.maxDragKg - left.maxDragKg,
      )
      const line = pick(
        lineItems(content),
        (item) => item.category === 'line' && item.lineType === 'pe',
        (left, right) => right.strengthKg - left.strengthKg,
      )
      const leader = pick(
        leaderItems(content),
        () => true,
        (left, right) => right.strengthKg - left.strengthKg,
      )
      const hook = pick(
        hookItems(content),
        () => true,
        (left, right) => right.strengthKg - left.strengthKg,
      )
      const lure = pickOffering(
        content,
        rod,
        (item) => item.category === 'lure' && item.weightG >= 60,
        (left, right) => right.weightG - left.weightG,
      )

      if (
        rod === undefined ||
        reel === undefined ||
        line === undefined ||
        leader === undefined ||
        hook === undefined ||
        lure === undefined
      ) {
        return null
      }

      return {
        rodId: rod.id,
        reelId: reel.id,
        lineId: line.id,
        leaderId: leader.id,
        hookId: hook.id,
        offeringId: lure.id,
        methodId: 'lure',
      }
    },
  },
]

export const resolveBuild = (
  content: BuiltInContent,
  plan: BuildPlan,
): ResolvedFishingSetup | null => {
  const loadout = plan.select(content)

  if (loadout === null) {
    return null
  }

  return resolveTackle({ loadout, gear: content.gear, methods: content.methods })
}

/** 2 つの modifier を比べる（数値キーだけを対象にする）。 */
const MODIFIER_KEYS = FISHING_MODIFIER_KEYS

const dominates = (stronger: PlayerFishingModifiers, weaker: PlayerFishingModifiers): boolean => {
  let strictlyBetter = false

  for (const key of MODIFIER_KEYS) {
    // hookSuccessModifier は加算値、それ以外は倍率。小さい方が有利な項目は扱わない。
    const left = stronger[key]
    const right = weaker[key]

    if (left < right - 1e-9) {
      return false
    }

    if (left > right + 1e-9) {
      strictlyBetter = true
    }
  }

  return strictlyBetter
}

/** 同じ条件で 1 つの装備だけを差し替えたときの modifier。 */
const modifiersWith = (
  content: BuiltInContent,
  base: Loadout,
  slot: 'rod' | 'reel' | 'line' | 'leader' | 'hook' | 'offering',
  item: GearItem,
): PlayerFishingModifiers | null => {
  const loadout: Loadout = { ...base, [`${slot}Id`]: item.id } as Loadout
  const setup = resolveTackle({ loadout, gear: content.gear, methods: content.methods })

  return setup === null ? null : setup.playerModifiers
}

export const simulateCatalog = (): CatalogSimulationResult => {
  const content = loadContentFromDirectory()
  const lines: string[] = []
  const checks: { label: string; ok: boolean }[] = []

  const countBy = (category: string): number =>
    content.gear.filter((item) => item.category === category).length

  const counts = {
    reel: countBy('reel'),
    rod: countBy('rod'),
    line: countBy('line'),
    leader: countBy('leader'),
    hook: countBy('hook'),
    lure: countBy('lure'),
    bait: countBy('bait'),
  }

  lines.push('=== content ===')
  lines.push(`brands     ${String(content.brands.length)}`)
  lines.push(`series     ${String(content.gearSeries.length)}`)
  lines.push(`methods    ${String(content.methods.length)}`)
  lines.push(
    `gear       ${String(content.gear.length)}  (${GEAR_CATEGORIES.map(
      (category) => `${category} ${String(counts[category])}`,
    ).join(' / ')})`,
  )

  const volumeTargets: readonly [keyof typeof counts, number, number][] = [
    ['reel', 80, 150],
    ['rod', 80, 150],
    ['line', 25, 50],
    ['leader', 20, 40],
    ['hook', 30, 60],
    ['lure', 100, 200],
    ['bait', 10, 20],
  ]

  const volumeOk = volumeTargets.every(
    ([category, min, max]) => counts[category] >= min && counts[category] <= max,
  )

  checks.push({
    label: `カテゴリ別の件数が目標レンジに入っている（Brands 8〜12: ${String(
      content.brands.length,
    )}）`,
    ok: volumeOk && content.brands.length >= 8 && content.brands.length <= 12,
  })

  // --- ブランド別件数 ---------------------------------------------------

  lines.push('')
  lines.push('=== brands（model 数） ===')

  for (const brand of [...content.brands].sort((a, b) => a.name.localeCompare(b.name))) {
    const owned = content.gear.filter((item) => item.brandId === brand.id)
    const series = content.gearSeries.filter((entry) => entry.brandId === brand.id)
    const prices = owned.map((item) => item.price).sort((a, b) => a - b)
    lines.push(
      `  ${brand.name.padEnd(17)} models ${String(owned.length).padStart(3)} / series ${String(
        series.length,
      ).padStart(
        2,
      )} / 価格 ${prices.length === 0 ? '-' : `${formatYen(prices[0] ?? 0)}〜${formatYen(prices[prices.length - 1] ?? 0)}`}`,
    )
  }

  // --- 番手 / 用途カバレッジ -------------------------------------------

  const sizeClasses = [
    1000, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 14000, 18000, 20000, 30000,
  ]
  const coveredSizes = sizeClasses.filter((size) =>
    reelItems(content).some((item) => item.category === 'reel' && item.sizeClass === size),
  )

  lines.push('')
  lines.push('=== reel sizeClass coverage ===')
  for (const size of sizeClasses) {
    const rows = reelItems(content).filter(
      (item) => item.category === 'reel' && item.sizeClass === size,
    )
    const variants = [
      ...new Set(rows.map((item) => (item.category === 'reel' ? item.variant : ''))),
    ]
    lines.push(
      `  ${String(size).padStart(5)} : ${String(rows.length).padStart(3)} models / variant ${variants
        .filter((value) => value !== undefined && value !== '')
        .join(',')}`,
    )
  }

  checks.push({
    label: `Reel の番手カバレッジ（${String(coveredSizes.length)}/${String(sizeClasses.length)}）`,
    ok: coveredSizes.length === sizeClasses.length,
  })

  const useClasses = ROD_SERIES_CATEGORIES
  const coveredUses = useClasses.filter((use) =>
    rodItems(content).some((item) => item.category === 'rod' && item.seriesCategory === use),
  )

  lines.push('')
  lines.push('=== rod useClass coverage ===')

  for (const use of useClasses) {
    const rows = rodItems(content).filter(
      (item) => item.category === 'rod' && item.seriesCategory === use,
    )
    const powers = [...new Set(rows.map((item) => (item.category === 'rod' ? item.power : '')))]
    lines.push(
      `  ${use.padEnd(21)} ${String(rows.length).padStart(3)} models / power ${
        powers.join(',') || '-'
      }`,
    )
  }

  checks.push({
    label: `Rod の用途カバレッジ（${String(coveredUses.length)}/${String(useClasses.length)}）`,
    ok: coveredUses.length === useClasses.length,
  })

  // --- 3000 番の比較（ブランド差） -------------------------------------

  const class3000 = reelItems(content).filter(
    (item) => item.category === 'reel' && item.sizeClass === 3000,
  )

  lines.push('')
  lines.push('=== 3000 番クラスの比較（spec） ===')

  for (const item of class3000) {
    if (item.category !== 'reel') {
      continue
    }

    lines.push(
      `  ${String(item.brandId).padEnd(13)} ${item.name.padEnd(18)} ドラッグ ${String(
        item.maxDragKg,
      ).padStart(
        5,
      )}kg / 自重 ${String(item.weightG).padStart(4)}g / 滑らかさ ${item.smoothness.toFixed(
        2,
      )} / 初動 ${numOr(item.dragStartup, 0).toFixed(2)} / 剛性 ${numOr(item.rigidity, 0).toFixed(
        2,
      )} / トルク ${numOr(item.windingTorque, 0).toFixed(2)} / レスポンス ${numOr(
        item.response,
        0,
      ).toFixed(2)} / ${formatYen(item.price)}`,
    )
  }

  const bestOf = (
    key: 'smoothness' | 'response' | 'rigidity' | 'windingTorque' | 'dragStartup',
  ) => {
    const rows = class3000.filter((item) => item.category === 'reel')
    const best = rows.reduce<number | null>((max, item) => {
      const value =
        key === 'smoothness'
          ? item.category === 'reel'
            ? item.smoothness
            : 0
          : numOr(item[key], 0)
      return max === null || value > max ? value : max
    }, null)

    return [
      ...new Set(
        rows
          .filter((item) => {
            const value =
              key === 'smoothness'
                ? item.category === 'reel'
                  ? item.smoothness
                  : 0
                : numOr(item[key], 0)
            return best !== null && Math.abs(value - best) < 1e-9
          })
          .map((item) => String(item.brandId)),
      ),
    ]
  }

  const smoothBrands = bestOf('smoothness')
  const responseBrands = bestOf('response')
  const rigidityBrands = bestOf('rigidity')

  lines.push('')
  lines.push('=== 3000 番の「一番」は分かれているか ===')
  lines.push(`  滑らかさ : ${smoothBrands.join(', ')}`)
  lines.push(`  レスポンス: ${responseBrands.join(', ')}`)
  lines.push(`  剛性     : ${rigidityBrands.join(', ')}`)

  const split =
    JSON.stringify(smoothBrands) !== JSON.stringify(responseBrands) ||
    JSON.stringify(responseBrands) !== JSON.stringify(rigidityBrands)

  checks.push({ label: '3000 番でブランドごとに得意項目が分かれている', ok: split })

  // --- 代表 Build --------------------------------------------------------

  const baseLoadout = buildPlans[0]?.select(content) ?? null
  const setups: { plan: BuildPlan; setup: ResolvedFishingSetup }[] = []

  lines.push('')
  lines.push('=== builds ===')

  for (const plan of buildPlans) {
    const setup = resolveBuild(content, plan)

    if (setup === null) {
      lines.push(`  ${plan.label.padEnd(20)} : 組めなかった`)
      continue
    }

    setups.push({ plan, setup })

    const price = [
      setup.loadout.rodId,
      setup.loadout.reelId,
      setup.loadout.lineId,
      setup.loadout.leaderId,
      setup.loadout.hookId,
      setup.loadout.offeringId,
    ]
      .filter((id): id is NonNullable<typeof id> => id !== null)
      .reduce((total, id) => total + (content.gearById[String(id)]?.price ?? 0), 0)

    lines.push(
      `  ${plan.label.padEnd(20)} ${COMPATIBILITY_LABELS[setup.compatibility.level]}(${setup.compatibility.score.toFixed(
        2,
      )}) / 耐テンション x${setup.playerModifiers.maxTensionMultiplier.toFixed(
        2,
      )} / REEL x${setup.playerModifiers.reelEfficiencyMultiplier.toFixed(
        2,
      )} / 感度 x${setup.playerModifiers.detectionClarityMultiplier.toFixed(
        2,
      )} / 合計 ${formatYen(price)}`,
    )
    lines.push(`  ${' '.repeat(20)} ${plan.note}`)
  }

  checks.push({
    label: `代表 Build がすべて組める（${String(setups.length)}/${String(buildPlans.length)}）`,
    ok: setups.length === buildPlans.length,
  })

  checks.push({
    label: 'どの Build も致命的な不整合ではない',
    ok: setups.every((entry) => !entry.setup.compatibility.fatal),
  })

  const modifiers = setups.map((entry) => entry.setup.playerModifiers)
  const distinct = new Set(modifiers.map((value) => JSON.stringify(value)))

  checks.push({
    label: 'Build ごとに resolved modifier が異なる',
    ok: distinct.size === modifiers.length,
  })

  // --- 高価格が万能でないこと -------------------------------------------

  const groups: readonly { readonly label: string; readonly items: readonly GearItem[] }[] = [
    { label: 'reel:3000', items: class3000 },
    {
      label: 'reel:1000',
      items: reelItems(content).filter(
        (item) => item.category === 'reel' && item.sizeClass === 1000,
      ),
    },
    {
      label: 'reel:20000',
      items: reelItems(content).filter(
        (item) => item.category === 'reel' && item.sizeClass === 20000,
      ),
    },
    {
      label: 'rod:seabass',
      items: rodItems(content).filter(
        (item) => item.category === 'rod' && item.seriesCategory === 'seabass',
      ),
    },
    {
      label: 'rod:ajing',
      items: rodItems(content).filter(
        (item) => item.category === 'rod' && item.seriesCategory === 'ajing',
      ),
    },
    {
      label: 'lure:minnow',
      items: offeringItems(content).filter(
        (item) => item.category === 'lure' && item.lureType === 'minnow',
      ),
    },
    {
      label: 'line:pe',
      items: lineItems(content).filter(
        (item) => item.category === 'line' && item.lineType === 'pe',
      ),
    },
    {
      label: 'hook:single',
      items: hookItems(content).filter(
        (item) => item.category === 'hook' && item.hookType === 'single',
      ),
    },
  ]

  const slotFor = (
    item: GearItem,
  ): 'rod' | 'reel' | 'line' | 'leader' | 'hook' | 'offering' | null => {
    switch (item.category) {
      case 'rod':
        return 'rod'
      case 'reel':
        return 'reel'
      case 'line':
        return 'line'
      case 'leader':
        return 'leader'
      case 'hook':
        return 'hook'
      case 'lure':
      case 'bait':
        return 'offering'
      default:
        return null
    }
  }

  lines.push('')
  lines.push('=== 高価格が万能になっていないか ===')

  const ladderGroups: string[] = []

  if (baseLoadout !== null) {
    for (const group of groups) {
      const sorted = [...group.items].sort((left, right) => right.price - left.price)
      const mostExpensive = sorted[0]

      if (mostExpensive === undefined) {
        continue
      }

      const slot = slotFor(mostExpensive)
      const base =
        mostExpensive === undefined
          ? null
          : modifiersWith(content, baseLoadout, slot ?? 'offering', mostExpensive)

      if (slot === null || base === null) {
        continue
      }

      let dominatesAll = true
      let compared = 0
      let dominated = 0

      for (const other of sorted.slice(1)) {
        if (other.price >= mostExpensive.price) {
          continue
        }

        const rival = modifiersWith(content, baseLoadout, slot, other)

        if (rival === null) {
          continue
        }

        compared += 1

        if (dominates(base, rival)) {
          dominated += 1
        } else {
          dominatesAll = false
        }
      }

      lines.push(
        `  ${group.label.padEnd(14)} 最高価格 ${formatYen(
          mostExpensive.price,
        )} / 完全上位 ${String(dominated)}/${String(compared)} 件 → ${
          dominatesAll && compared > 0 ? '全項目で上位（価格ラダー）' : '万能ではない'
        }`,
      )

      if (dominatesAll && compared > 0) {
        ladderGroups.push(group.label)
      }
    }
  }

  checks.push({
    label: `高価格が全項目で最強になっているグループがない（${ladderGroups.join(', ') || 'なし'}）`,
    ok: ladderGroups.length === 0,
  })

  // --- 決定論 ------------------------------------------------------------

  const again = loadContentFromDirectory()
  const repeated = buildPlans
    .map((plan) => {
      const setup = resolveBuild(again, plan)
      return `${plan.id}:${setup === null ? 'null' : JSON.stringify(setup.playerModifiers)}`
    })
    .join('|')
  const current = buildPlans
    .map((plan) => {
      const found = setups.find((entry) => entry.plan.id === plan.id)
      return `${plan.id}:${
        found === undefined ? 'null' : JSON.stringify(found.setup.playerModifiers)
      }`
    })
    .join('|')

  checks.push({ label: '同じ入力から同じ結果（決定論的）', ok: current === repeated })

  lines.push('')
  lines.push('--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: gear catalog is healthy' : 'FAILED: gear catalog has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateCatalog()

    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
