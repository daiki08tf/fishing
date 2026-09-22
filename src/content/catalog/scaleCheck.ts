import type { BuyerDefinition } from '../../domain/trade/Buyer'
import type { ContactReward } from '../../domain/trade/ContactReward'
import type { ExpeditionDefinition } from '../../domain/expedition/Expedition'
import type { FishSpecies } from '../../domain/fish/FishSpecies'
import type { FishingSpot } from '../../domain/world/FishingSpot'
import type { RegionDefinition } from '../../domain/world/Region'
import type { SpeciesTradeProfile } from '../../domain/trade/SpeciesTradeProfile'
import type { ContentIndex, SpeciesSummary } from './summary'

/**
 * Content Scale の検証（Phase 15）。
 *
 * 既存の `validateContentReferences` は「参照が切れていないか」を見る。
 * ここは「1000 Species / 多数 Region に増やしても壊れない構造か」を見る:
 * - 軽量カタログが全 runtime Species をカバーしているか
 * - pack の所有権が重複・欠落していないか（no orphan content）
 * - pack manifest と生成 pack module が一致しているか
 * - canonical Species ID に地域 prefix が混ざっていないか
 * - 生成物（content-index / ownership）が Content と一致しているか（freshness）
 */

export type ContentScaleIssue = {
  readonly path: string
  readonly message: string
}

export type ContentScaleInput = {
  readonly species: readonly FishSpecies[]
  readonly spots: readonly FishingSpot[]
  readonly regions: readonly RegionDefinition[]
  readonly buyers: readonly BuyerDefinition[]
  readonly contactRewards: readonly ContactReward[]
  readonly expeditions: readonly ExpeditionDefinition[]
  readonly speciesTradeProfiles: readonly SpeciesTradeProfile[]
  readonly index: ContentIndex
  /** "kind/file" → packKey（生成された content-ownership.json）。 */
  readonly ownership: Readonly<Record<string, string>>
  /** kind → Content ディレクトリに実在するファイル名（orphan 検出用）。 */
  readonly filesByKind: Readonly<Record<string, readonly string[]>>
  /** 生成済み pack module の key（packModules.ts の解決表）。 */
  readonly packModuleKeys: readonly string[]
}

/** SpeciesSummary に置いてよいキー（軽量カタログに詳細を入れない）。 */
export const SPECIES_SUMMARY_KEYS: readonly string[] = [
  'id',
  'japaneseName',
  'scientificName',
  'englishName',
  'waterTypes',
  'category',
  'regionIds',
  'habitats',
  'rarityBand',
]

/** 地域 prefix として禁止する語（canonical global Species ID を守る）。 */
export const FORBIDDEN_SPECIES_PREFIXES: readonly string[] = [
  'kanto-',
  'tokyo-',
  'hokkaido-',
  'alaska-',
  'bc-',
  'british-columbia-',
  'qld-',
  'queensland-',
]

const duplicateIds = (kind: string, ids: readonly string[]): readonly ContentScaleIssue[] => {
  const seen = new Set<string>()
  const issues: ContentScaleIssue[] = []

  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ path: `${kind}/${id}`, message: 'duplicate id' })
    }

    seen.add(id)
  }

  return issues
}

const packKeyOfFile = (
  ownership: Readonly<Record<string, string>>,
  kind: string,
  file: string,
): string | undefined => ownership[`${kind}/${file}`]

export const validateContentScale = (input: ContentScaleInput): readonly ContentScaleIssue[] => {
  const issues: ContentScaleIssue[] = []
  const speciesIds = new Set(input.species.map((entry) => String(entry.id)))
  const buyerById = new Map(input.buyers.map((entry) => [String(entry.id), entry]))
  const regionIdOfSpot = new Map(
    input.spots.map((entry) => [String(entry.id), String(entry.regionId)]),
  )
  const regionIdOfBuyer = new Map(
    input.buyers.map((entry) => [String(entry.id), String(entry.regionId)]),
  )

  // 1. id の一意性（scale の前提。既存検証と二重に確認する）。
  issues.push(...duplicateIds('fish-species', [...speciesIds]))
  issues.push(
    ...duplicateIds(
      'fishing-spots',
      input.spots.map((entry) => String(entry.id)),
    ),
  )
  issues.push(
    ...duplicateIds(
      'regions',
      input.regions.map((entry) => String(entry.id)),
    ),
  )
  issues.push(
    ...duplicateIds(
      'buyers',
      input.buyers.map((entry) => String(entry.id)),
    ),
  )
  issues.push(
    ...duplicateIds(
      'contact-rewards',
      input.contactRewards.map((entry) => String(entry.id)),
    ),
  )
  issues.push(
    ...duplicateIds(
      'species-trade-profiles',
      input.speciesTradeProfiles.map((entry) => String(entry.speciesId)),
    ),
  )

  // 2. 軽量カタログの完全性と軽さ。
  const summaryById = new Map<string, SpeciesSummary>()
  for (const summary of input.index.species) {
    const id = String(summary.id)

    if (summaryById.has(id)) {
      issues.push({ path: `content-index/species/${id}`, message: 'duplicate summary' })
    }

    summaryById.set(id, summary)

    if (summary.japaneseName.trim().length === 0) {
      issues.push({ path: `content-index/species/${id}`, message: 'summary has no japaneseName' })
    }

    const extraKeys = Object.keys(summary).filter((key) => !SPECIES_SUMMARY_KEYS.includes(key))

    if (extraKeys.length > 0) {
      issues.push({
        path: `content-index/species/${id}`,
        message: `summary must stay lightweight; unexpected keys: ${extraKeys.join(', ')}`,
      })
    }
  }

  for (const species of input.species) {
    if (!summaryById.has(String(species.id))) {
      issues.push({
        path: `content-index/species/${String(species.id)}`,
        message: 'runtime species has no lightweight summary',
      })
    }
  }

  // 3. canonical global Species ID（地域 prefix を identity にしない）。
  for (const prefix of FORBIDDEN_SPECIES_PREFIXES) {
    for (const species of input.species) {
      if (String(species.id).startsWith(prefix)) {
        issues.push({
          path: `fish-species/${String(species.id)}`,
          message: `species id must be global; drop the regional prefix "${prefix}"`,
        })
      }
    }
  }

  // 4. pack manifest と生成 pack module の一致。
  const indexPackKeys = new Set(input.index.packs.map((pack) => pack.key))

  for (const key of indexPackKeys) {
    if (!input.packModuleKeys.includes(key)) {
      issues.push({
        path: `content-index/packs/${key}`,
        message: 'pack has no generated module (run npm run content:index)',
      })
    }
  }

  for (const key of input.packModuleKeys) {
    if (!indexPackKeys.has(key)) {
      issues.push({
        path: `content-index/packs/${key}`,
        message: 'pack module exists but the manifest has no entry for it',
      })
    }
  }

  // 5. 全 playable Region に pack がある。
  for (const region of input.regions) {
    if (region.stage !== 'playable') {
      continue
    }

    const summary = input.index.regions.find((entry) => String(entry.id) === String(region.id))

    if (summary === undefined) {
      issues.push({
        path: `content-index/regions/${String(region.id)}`,
        message: 'playable region has no lightweight summary',
      })
      continue
    }

    if (summary.packKey === null || !indexPackKeys.has(summary.packKey)) {
      issues.push({
        path: `content-index/regions/${String(region.id)}`,
        message: 'playable region has no region content pack',
      })
    }
  }

  // 6. pack の所有権（重複なし / orphan なし / 地域境界が正しい）。
  const ownedFiles = new Set<string>()

  for (const [kind, files] of Object.entries(input.filesByKind)) {
    for (const file of files) {
      const key = `${kind}/${file}`
      const owner = packKeyOfFile(input.ownership, kind, file)

      if (owner === undefined) {
        issues.push({ path: key, message: 'content is not owned by any pack (orphan)' })
        continue
      }

      if (ownedFiles.has(key)) {
        issues.push({ path: key, message: 'content is owned by more than one pack' })
      }

      ownedFiles.add(key)

      // Region 由来の Content は、その地域の pack が所有していること。
      if (kind === 'fishing-spots') {
        const spotId = file.replace(/\.json$/, '')
        const spot = input.spots.find((entry) => String(entry.id) === spotId)
        const regionId = spot === undefined ? regionIdOfSpot.get(spotId) : String(spot.regionId)

        if (regionId !== undefined && owner !== `region:${regionId}`) {
          issues.push({
            path: key,
            message: `spot must be owned by region:${regionId}, not ${owner}`,
          })
        }
      }

      if (kind === 'buyers') {
        const buyerId = file.replace(/\.json$/, '')
        const regionId = buyerById.has(buyerId)
          ? String(buyerById.get(buyerId)?.regionId)
          : regionIdOfBuyer.get(buyerId)

        if (regionId !== undefined && owner !== `region:${regionId}`) {
          issues.push({
            path: key,
            message: `buyer must be owned by region:${regionId}, not ${owner}`,
          })
        }
      }

      if (kind === 'contact-rewards') {
        const rewardId = file.replace(/\.json$/, '')
        const reward = input.contactRewards.find((entry) => String(entry.id) === rewardId)

        if (reward !== undefined) {
          const regionId = regionIdOfBuyer.get(String(reward.contactId))

          if (regionId !== undefined && owner !== `region:${regionId}`) {
            issues.push({
              path: key,
              message: `reward must live with its contact's region pack (${owner})`,
            })
          }
        }
      }
    }
  }

  // 7. 生成物の freshness / counts。
  const expectedCounts: Readonly<Record<string, number>> = {
    species: input.species.length,
    spots: input.spots.length,
    regions: input.regions.length,
    buyers: input.buyers.length,
    'contact-rewards': input.contactRewards.length,
    expeditions: input.expeditions.length,
    'species-trade-profiles': input.speciesTradeProfiles.length,
  }

  for (const [kind, expected] of Object.entries(expectedCounts)) {
    const actual = input.index.counts[kind]

    if (actual !== expected) {
      issues.push({
        path: `content-index/counts/${kind}`,
        message: `index is stale: expected ${String(expected)}, found ${String(actual ?? 'missing')} (run npm run content:index)`,
      })
    }
  }

  return issues
}
