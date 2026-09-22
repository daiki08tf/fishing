import { loadContentFromDirectory } from '../src/content/load/nodeContent'

const content = loadContentFromDirectory()

const playableRegions = content.regions.filter((region) => region.stage === 'playable')
const spotsByRegion = new Map<string, number>()
const speciesReferenced = new Set<string>()
const errors: string[] = []

for (const spot of content.spots) {
  const regionId = String(spot.regionId)
  spotsByRegion.set(regionId, (spotsByRegion.get(regionId) ?? 0) + 1)

  if (spot.fishingZones === undefined || spot.fishingZones.length === 0) {
    errors.push(`playable spot ${String(spot.id)} has no explicit fishingZones`)
  }

  const zoneIds = new Set((spot.fishingZones ?? []).map((zone) => zone.id))

  for (const occurrence of spot.fishTable) {
    const speciesId = String(occurrence.speciesId)
    speciesReferenced.add(speciesId)

    for (const zoneId of Object.keys(occurrence.zoneAffinity ?? {})) {
      if (!zoneIds.has(zoneId)) {
        errors.push(
          `spot ${String(spot.id)} / species ${speciesId} references unknown zone ${zoneId}`,
        )
      }
    }

    const species = content.speciesById[speciesId]

    if (species !== undefined && !species.distribution.some((id) => String(id) === regionId)) {
      errors.push(
        `spot ${String(spot.id)} uses ${speciesId}, but species distribution omits region ${regionId}`,
      )
    }
  }
}

for (const region of playableRegions) {
  if ((spotsByRegion.get(String(region.id)) ?? 0) === 0) {
    errors.push(`playable region ${String(region.id)} has no fishing spots`)
  }
}

for (const species of content.species) {
  if (!speciesReferenced.has(String(species.id))) {
    errors.push(`species ${String(species.id)} is not referenced by any fishing spot`)
  }
}

const canonicalPrefixes = ['kanto-', 'hokkaido-', 'alaska-']
for (const species of content.species) {
  if (canonicalPrefixes.some((prefix) => String(species.id).startsWith(prefix))) {
    errors.push(`species ${String(species.id)} still uses a regional id prefix`)
  }
}

console.log(
  [
    `species=${String(content.species.length)}`,
    `spots=${String(content.spots.length)}`,
    `playableRegions=${String(playableRegions.length)}`,
    `explicitZones=${String(content.spots.filter((spot) => (spot.fishingZones?.length ?? 0) > 0).length)}`,
  ].join(' '),
)

for (const region of playableRegions) {
  console.log(
    `${String(region.id)}: spots=${String(spotsByRegion.get(String(region.id)) ?? 0)} stage=playable`,
  )
}

if (errors.length > 0) {
  console.error('\nRegional content audit failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log('Regional content audit PASS')
}
