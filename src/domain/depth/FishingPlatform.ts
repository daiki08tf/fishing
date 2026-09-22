import type {
  BoatCapability,
  CargoCapability,
  LaunchCapability,
  TransportDefinition,
} from '../access/Transport'

/**
 * Fishing Platform（Phase 17A）。
 *
 * 「今、何に乗って釣りをしているか」を表す派生値。Save には保存しない。
 * `world.trip.transportId` + `TransportDefinition` から毎回 derive する
 * （新しい永続 state を増やさない）。
 *
 * Transport ID や Region ID では分岐しない。`TransportDefinition.boatCapability` /
 * `transportType` という既存の Content 駆動の能力値だけから決める。
 */
export const FISHING_PLATFORMS = ['shore', 'kayak', 'nearshore_boat', 'offshore_boat'] as const
export type FishingPlatform = (typeof FISHING_PLATFORMS)[number]

export type FishingPlatformContext = {
  readonly platform: FishingPlatform
  readonly boatCapability: BoatCapability
  readonly launchCapability: LaunchCapability
  readonly transportName: string | null
  readonly maxRangeKm: number | null
  readonly cargo: CargoCapability | null
  /** 垂直に落とす / 流す提示（Phase 17B の Method presentation）が物理的に成立するか。 */
  readonly canPresentVertically: boolean
  /** Reposition（Phase 17B）で移動し直せるか。岸釣りは対象外。 */
  readonly canReposition: boolean
}

const SHORE_CONTEXT: FishingPlatformContext = {
  platform: 'shore',
  boatCapability: 'none',
  launchCapability: 'none',
  transportName: null,
  maxRangeKm: null,
  cargo: null,
  canPresentVertically: false,
  canReposition: false,
}

/**
 * 今回の釣行の Transport（`content.transportById[world.trip?.transportId]`、
 * 徒歩などは `null` でよい）から Fishing Platform を derive する。
 */
export const resolveFishingPlatform = (
  transport: TransportDefinition | null,
): FishingPlatformContext => {
  if (transport === null || transport.boatCapability === 'none') {
    return {
      ...SHORE_CONTEXT,
      launchCapability: transport?.launchCapability ?? 'none',
      transportName: transport?.name ?? null,
      maxRangeKm: transport?.maxRangeKm ?? null,
      cargo: transport?.cargo ?? null,
    }
  }

  const platform: FishingPlatform =
    transport.transportType === 'kayak'
      ? 'kayak'
      : transport.boatCapability === 'offshore'
        ? 'offshore_boat'
        : 'nearshore_boat'

  return {
    platform,
    boatCapability: transport.boatCapability,
    launchCapability: transport.launchCapability,
    transportName: transport.name,
    maxRangeKm: transport.maxRangeKm ?? null,
    cargo: transport.cargo,
    canPresentVertically: true,
    canReposition: true,
  }
}
