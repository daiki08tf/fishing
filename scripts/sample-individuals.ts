import { pathToFileURL } from 'node:url'
import { loadFixtureContent } from '../tests/fixtures/content'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { FISH_TRAITS, type FishTrait } from '../src/domain/fish/FishTrait'
import { generateFishIndividual } from '../src/domain/fish/generateFishIndividual'
import { lengthPercentile, lengthModelMedian } from '../src/domain/fish/lengthModel'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'

/**
 * 個体生成の統計的な健全性チェック。
 *
 * 大量に個体を生成し、次のような破綻がないかを確認する。
 * - 分布の範囲外・NaN・負値
 * - 非現実的な体重（体長との関係が壊れている）
 * - 百分位の範囲
 * - 大型個体が通常個体より少ないこと
 * - Trophy の発生率が想定範囲にあること
 *
 * 使い方:
 *   npm run sample:individuals
 *   npm run sample:individuals -- --samples 50000
 *   npm run sample:individuals -- --species kanto-seabass
 */

export type SpeciesSampleStatistics = {
  readonly speciesId: string
  readonly name: string
  readonly samples: number
  readonly minLengthCm: number
  readonly maxLengthCm: number
  readonly meanLengthCm: number
  readonly minWeightKg: number
  readonly maxWeightKg: number
  readonly meanWeightKg: number
  readonly minPercentile: number
  readonly maxPercentile: number
  readonly invalidCount: number
  readonly trophyCount: number
  /** 体重 / 体長^3 の最小・最大。単位の取り違えを検出する。 */
  readonly minDensity: number
  readonly maxDensity: number
  readonly traitCounts: Readonly<Record<FishTrait, number>>
  readonly buckets: {
    /** 中央値以下。 */
    readonly common: number
    readonly p50to90: number
    readonly p90to99: number
    readonly aboveP99: number
  }
}

export type SampleResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly statistics: readonly SpeciesSampleStatistics[]
}

const emptyTraitCounts = (): Record<FishTrait, number> => {
  const counts = {} as Record<FishTrait, number>

  for (const trait of FISH_TRAITS) {
    counts[trait] = 0
  }

  return counts
}

/**
 * 1 魚種について N 個体を生成し、統計を返す。
 * 乱数は 1 つの SeededRandomSource から引くので、同じ seed なら同じ結果になる。
 */
export const sampleSpecies = (
  species: FishSpecies,
  samples: number,
  seed: string,
): SpeciesSampleStatistics => {
  const random = new SeededRandomSource(`${seed}#${String(species.id)}`)
  const median = lengthModelMedian(species.lengthModel)

  let minLength = Number.POSITIVE_INFINITY
  let maxLength = Number.NEGATIVE_INFINITY
  let sumLength = 0
  let minWeight = Number.POSITIVE_INFINITY
  let maxWeight = Number.NEGATIVE_INFINITY
  let sumWeight = 0
  let minPercentile = Number.POSITIVE_INFINITY
  let maxPercentile = Number.NEGATIVE_INFINITY
  let invalidCount = 0
  let trophyCount = 0
  let minDensity = Number.POSITIVE_INFINITY
  let maxDensity = Number.NEGATIVE_INFINITY
  const traitCounts = emptyTraitCounts()
  const buckets = { common: 0, p50to90: 0, p90to99: 0, aboveP99: 0 }

  for (let index = 0; index < samples; index += 1) {
    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: `${String(species.id)}#${seed}#${String(index)}`,
    })
    const { individual } = generated
    const percentile = individual.percentile ?? 0

    if (
      !Number.isFinite(individual.lengthCm) ||
      !Number.isFinite(individual.weightKg) ||
      !Number.isFinite(individual.condition) ||
      !Number.isFinite(percentile) ||
      individual.lengthCm <= 0 ||
      individual.weightKg <= 0 ||
      individual.lengthCm < species.lengthModel.minCm ||
      individual.lengthCm > species.lengthModel.maxCm ||
      percentile < 0 ||
      percentile > 100
    ) {
      invalidCount += 1
    }

    const percentileFromLength = lengthPercentile(species.lengthModel, individual.lengthCm)
    if (percentileFromLength < 0 || percentileFromLength > 100) {
      invalidCount += 1
    }

    // 絶対的な妥当性: 体重 / 体長^3 が現実的な範囲か。
    const density = individual.weightKg / individual.lengthCm ** 3

    if (density < 1e-6 || density > 1e-4) {
      invalidCount += 1
    }

    minDensity = Math.min(minDensity, density)
    maxDensity = Math.max(maxDensity, density)

    minLength = Math.min(minLength, individual.lengthCm)
    maxLength = Math.max(maxLength, individual.lengthCm)
    sumLength += individual.lengthCm
    minWeight = Math.min(minWeight, individual.weightKg)
    maxWeight = Math.max(maxWeight, individual.weightKg)
    sumWeight += individual.weightKg
    minPercentile = Math.min(minPercentile, percentile)
    maxPercentile = Math.max(maxPercentile, percentile)

    for (const trait of individual.traits) {
      traitCounts[trait] += 1
    }

    if (individual.traits.includes('trophy')) {
      trophyCount += 1
    }

    if (individual.lengthCm <= median) {
      buckets.common += 1
    } else if (percentile < 90) {
      buckets.p50to90 += 1
    } else if (percentile < 99) {
      buckets.p90to99 += 1
    } else {
      buckets.aboveP99 += 1
    }
  }

  return {
    speciesId: String(species.id),
    name: species.japaneseName,
    samples,
    minLengthCm: minLength,
    maxLengthCm: maxLength,
    meanLengthCm: sumLength / samples,
    minWeightKg: minWeight,
    maxWeightKg: maxWeight,
    meanWeightKg: sumWeight / samples,
    minPercentile,
    maxPercentile,
    invalidCount,
    trophyCount,
    minDensity,
    maxDensity,
    traitCounts,
    buckets,
  }
}

const isHealthy = (statistics: SpeciesSampleStatistics): boolean =>
  statistics.invalidCount === 0 &&
  statistics.buckets.common > statistics.buckets.p50to90 &&
  statistics.buckets.p50to90 > statistics.buckets.p90to99 &&
  statistics.buckets.p90to99 > statistics.buckets.aboveP99 &&
  statistics.trophyCount / statistics.samples <= 0.03

const formatStatistics = (statistics: SpeciesSampleStatistics): readonly string[] => {
  const trophyRate = ((statistics.trophyCount / statistics.samples) * 100).toFixed(2)
  const traits = FISH_TRAITS.filter((trait) => statistics.traitCounts[trait] > 0)
    .map((trait) => `${trait}:${String(statistics.traitCounts[trait])}`)
    .join(' ')

  return [
    `${statistics.speciesId} (${statistics.name})`,
    `  length ${statistics.minLengthCm}–${statistics.maxLengthCm} cm (mean ${statistics.meanLengthCm.toFixed(1)})`,
    `  weight ${statistics.minWeightKg.toFixed(3)}–${statistics.maxWeightKg.toFixed(3)} kg (mean ${statistics.meanWeightKg.toFixed(3)})`,
    `  percentile ${statistics.minPercentile.toFixed(2)}–${statistics.maxPercentile.toFixed(2)}`,
    `  density ${statistics.minDensity.toExponential(2)}–${statistics.maxDensity.toExponential(2)} kg/cm^3`,
    `  buckets common=${String(statistics.buckets.common)} p50-90=${String(statistics.buckets.p50to90)} p90-99=${String(statistics.buckets.p90to99)} p99+=${String(statistics.buckets.aboveP99)}`,
    `  trophy=${String(statistics.trophyCount)} (${trophyRate}%) traits ${traits.length === 0 ? '-' : traits}`,
    `  invalid=${String(statistics.invalidCount)}`,
  ]
}

export const sampleIndividuals = (options: {
  readonly samples: number
  readonly seed: string
  readonly speciesId?: string
}): SampleResult => {
  const content = loadFixtureContent()
  const species =
    options.speciesId === undefined
      ? content.species
      : content.species.filter((entry) => String(entry.id) === options.speciesId)

  if (species.length === 0) {
    throw new Error(`unknown species: ${String(options.speciesId)}`)
  }

  const statistics = species.map((entry) => sampleSpecies(entry, options.samples, options.seed))

  const lines: string[] = [
    `samples per species: ${String(options.samples)} seed: ${options.seed}`,
    '',
  ]

  for (const entry of statistics) {
    lines.push(...formatStatistics(entry), '')
  }

  const healthy = statistics.every(isHealthy)
  lines.push(healthy ? 'OK: all species look healthy' : 'FAILED: some species look broken')

  return { exitCode: healthy ? 0 : 1, lines, statistics }
}

const parseArguments = (
  argv: readonly string[],
): { samples: number; seed: string; speciesId?: string } => {
  let samples = 10000
  let seed = 'stats'
  let speciesId: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (argument === '--samples' && value !== undefined) {
      samples = Number.parseInt(value, 10)
      index += 1
      continue
    }

    if (argument === '--seed' && value !== undefined) {
      seed = value
      index += 1
      continue
    }

    if (argument === '--species' && value !== undefined) {
      speciesId = value
      index += 1
    }
  }

  return { samples, seed, ...(speciesId === undefined ? {} : { speciesId }) }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = sampleIndividuals(parseArguments(process.argv.slice(2)))

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
