import type { FishingSpot } from '../../src/domain/world/FishingSpot'
import { asFishSpeciesId, asFishingSpotId, asRegionId } from '../../src/domain/ids'

/** テスト用の釣り場。現実の釣り場ではない。 */
export const createTestSpot = (overrides: Partial<FishingSpot> = {}): FishingSpot => ({
  id: asFishingSpotId('test-spot'),
  name: 'テスト釣り場',
  regionId: asRegionId('test-region'),
  environment: 'canal',
  dataStatus: 'provisional',
  access: [{ kind: 'capability', capability: 'reachable_on_foot' }],
  travelOptions: [
    {
      id: 'test-walk-route',
      transportTypes: ['walk'],
      requiredCapabilities: ['reachable_on_foot'],
      features: [],
      baseMinutes: 20,
      distanceKm: 2,
      baseOneWayCost: 0,
    },
  ],
  habitatTags: ['test-habitat'],
  fishTable: [{ speciesId: asFishSpeciesId('test-species'), basePresence: 1 }],
  knowledgeConfig: {
    reveals: [
      { field: 'main_species', minKnowledge: 20 },
      { field: 'time_pattern', minKnowledge: 40 },
    ],
  },
  ...overrides,
})
