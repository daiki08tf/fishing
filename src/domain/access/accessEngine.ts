import type { KnowledgeState } from '../knowledge/KnowledgeState'
import { regionKnowledgeScore } from '../knowledge/regionKnowledge'
import { spotKnowledgeScore } from '../knowledge/spotKnowledge'
import type { FishingSpot, SpotTravelRoute } from '../world/FishingSpot'
import type { DayOfWeek } from '../world/WorldTime'
import { ACCESS_REQUIREMENT_KINDS, type AccessRequirementKind } from './AccessRequirement'
import type {
  AccessCapability,
  PlayerTransportState,
  ResolvedTravelOption,
  RouteFeature,
  TransportDefinition,
  TravelCostComponent,
} from './Transport'

/**
 * Spot へ物理的に行けるかを解決する。
 *
 * AccessEngine は Content の具体的な車種・船名を知らない。TransportDefinition が持つ
 * capability / ownership model / route requirement だけを比較する。費用を解決して返すが、
 * 所持金による可否は Economy の責務であり、ここでは判定しない。
 */

/**
 * Transport 候補が落ちた段階。所有・レンタル・route 種別・設備・距離を区別して
 * 「どの段階で行けなくなったか」を説明できるようにする。
 * 並びは手前から奥の順で、後ろほど手前の条件を通り抜けている（route ごとの比較に使う）。
 */
export const TRANSPORT_CANDIDATE_REJECTIONS = [
  'not_available',
  'ownership_required',
  'rental_unavailable',
  'route_type_not_allowed',
  'missing_route_capability',
  'facility_required',
  'out_of_range',
] as const

export type TransportCandidateRejection = (typeof TRANSPORT_CANDIDATE_REJECTIONS)[number]

/**
 * 行き先を塞いでいる理由。
 *
 * knowledge / reputation / permit / relationship / season は AccessRequirementKind と共通。
 * capability 条件は Transport 候補の解決結果として説明する。条件そのものを並べるのではなく、
 * missing_capability（手持ちの移動手段に capability が無い）と no_compatible_transport
 * （capability はあるが行ける route が無い）を分ける。所有している capability を
 * 「不足」と表示しないための区別である。
 */
export const ACCESS_BLOCKED_REASON_KINDS = [
  ...ACCESS_REQUIREMENT_KINDS,
  'missing_capability',
  'no_compatible_transport',
  'ownership_required',
  'rental_unavailable',
  'facility_required',
  'out_of_service_area',
] as const

export type AccessBlockedReasonKind = (typeof ACCESS_BLOCKED_REASON_KINDS)[number]

export type AccessBlockedReason = {
  readonly kind: AccessBlockedReasonKind
  readonly label: string
  readonly required?: number
  readonly current?: number
  /** missing_capability のときだけ。満たしていない物理アクセス能力。 */
  readonly capability?: AccessCapability
  /** facility_required のときだけ。足りない route 設備。 */
  readonly feature?: RouteFeature
  /**
   * Transport 段階の理由で、関係した候補。UI は label だけを使う。
   * 「どの Transport の話か」をテストとログから追えるように残す。
   */
  readonly transportIds?: readonly string[]
}

export type AccessEvaluation = {
  readonly spotId: string
  readonly accessible: boolean
  readonly travelOptions: readonly ResolvedTravelOption[]
  readonly blockedReasons: readonly AccessBlockedReason[]
  readonly satisfiedKinds: readonly AccessRequirementKind[]
}

export type AccessEvaluationInput = {
  readonly spot: FishingSpot
  readonly transports: readonly TransportDefinition[]
  readonly playerTransports: PlayerTransportState
  readonly knowledge: KnowledgeState
  readonly reputation?: number
  readonly permits?: readonly string[]
  readonly dayOfWeek?: DayOfWeek
  readonly month?: number
  readonly reputationEnabled?: boolean
  readonly permitsEnabled?: boolean
  /**
   * Phase 17C: `relationship` 条件の評価に使う Trust マップ（`TradeState.contactTrust` と
   * 同じ形。キーは `String(ContactId)`）。省略時は Trust 0 として扱う。
   * Trade Domain の型は import しない（Access は Trade を知らない）。
   */
  readonly contactTrust?: Readonly<Record<string, number>>
  /**
   * Phase 17 Final Fix: プレイヤーが「知っている」Contact の ID 集合
   * （`String(ContactId)`）。`TransportDefinition.operatorContactId` を持つ
   * Charter Transport は、この集合にその Contact が含まれているときだけ
   * 利用可能になる（Captain-ID / Transport-ID による分岐ではなく、汎用
   * フィールドの有無 + この集合の有無だけで判定する）。
   * 「知っている」の算出自体（Buyer は常に true、汎用 Contact は
   * `isContactKnown`）は Trade Domain 側の責務で、ここでは import しない。
   * 省略時は空集合（Charter は一切使えない）。
   */
  readonly knownContactIds?: ReadonlySet<string> | readonly string[]
}

const CAPABILITY_LABELS: Readonly<Record<AccessCapability, string>> = {
  reachable_on_foot: '徒歩で到達できる経路',
  public_transport: '公共交通でのアクセス',
  bicycle_access: '自転車でのアクセス',
  road_access: '道路からのアクセス',
  rough_road: '未舗装・荒路への対応',
  kayak_launch: 'カヤックを出せるアクセス',
  boat_required: '船でのアクセス',
  offshore: '沖への航行能力',
  island_access: '島への渡航能力',
}

const ROUTE_FEATURE_LABELS: Readonly<Record<RouteFeature, string>> = {
  vehicle_rental: 'レンタカー営業所',
  launch_point: 'カヤックを出せる場所',
  boat_rental: 'ボートレンタル',
  marina: 'マリーナ',
}

const includesAll = <T>(available: readonly T[], required: readonly T[]): boolean =>
  required.every((entry) => available.includes(entry))

/** 段階の並びを優先度として使う。数値が大きいほど奥の条件まで通っている。 */
const rejectionRank = (rejection: TransportCandidateRejection): number =>
  TRANSPORT_CANDIDATE_REJECTIONS.indexOf(rejection)

/** `AccessEvaluationInput.knownContactIds` を毎回同じ形（Set）で扱う。 */
const knownContactIdSetOf = (input: AccessEvaluationInput): ReadonlySet<string> =>
  input.knownContactIds instanceof Set
    ? input.knownContactIds
    : new Set(input.knownContactIds ?? [])

/**
 * Phase 17 Final Fix: `operatorContactId` を持つ Charter は、通常の
 * `availableTransportIds`（徒歩・電車・所有物）には決して入らない
 * （購入アイテムが配らないため）。代わりに、その Contact を知っていれば
 * 使える、という派生ルールをここに 1 箇所だけ持つ。
 */
const isCharterAvailableViaContact = (
  definition: TransportDefinition,
  knownContactIds: ReadonlySet<string>,
): boolean =>
  definition.operatorContactId !== undefined &&
  knownContactIds.has(String(definition.operatorContactId))

/**
 * その Transport がこの Spot で「営業している」か。
 *
 * `serviceRegionIds` を持たない Transport（自家用車・レンタル・所有船）は常に true。
 * 持つ Transport（Charter サービスなど）は、その Spot の Region を含むときだけ候補になる。
 * Region-ID で分岐するのではなく、Content が宣言した範囲と Spot の Region を比べるだけである。
 */
const transportServesSpot = (definition: TransportDefinition, spot: FishingSpot): boolean =>
  definition.serviceRegionIds === undefined ||
  definition.serviceRegionIds.some((regionId) => String(regionId) === String(spot.regionId))

const isTransportAvailable = (
  definition: TransportDefinition,
  state: PlayerTransportState,
  knownContactIds: ReadonlySet<string>,
): boolean => {
  /*
   * Phase 19B: `always_available`（公共交通インフラ）は player state を要求しない。
   * Save に残らず、新旧 Save で同一に利用できる（ferry handoff の解決）。
   */
  const baseAvailable =
    definition.ownershipModel === 'always_available' ||
    state.availableTransportIds.includes(definition.id)

  if (!baseAvailable && !isCharterAvailableViaContact(definition, knownContactIds)) {
    return false
  }

  return definition.ownershipModel !== 'owned' || state.ownedTransportIds.includes(definition.id)
}

/** 利用できない理由（使えるなら null）。所有・レンタル・一般利用を区別する。 */
const availabilityRejection = (
  definition: TransportDefinition,
  state: PlayerTransportState,
  knownContactIds: ReadonlySet<string>,
): TransportCandidateRejection | null => {
  if (isTransportAvailable(definition, state, knownContactIds)) {
    return null
  }

  switch (definition.ownershipModel) {
    case 'owned':
      return 'ownership_required'
    case 'rental':
      return 'rental_unavailable'
    case 'always_available':
      return 'not_available'
  }
}

/**
 * route 側の条件だけを見た拒否理由。
 *
 * Rental availability is explicit in player/trip planning state. The route must also list
 * the rental type and all required facilities (rental desk / marina). This keeps
 * "a rental exists somewhere" from making every matching route usable.
 */
const routeRejection = (
  definition: TransportDefinition,
  route: SpotTravelRoute,
): TransportCandidateRejection | null => {
  if (!route.transportTypes.includes(definition.transportType)) {
    return 'route_type_not_allowed'
  }

  if (!includesAll(definition.capabilities, route.requiredCapabilities)) {
    return 'missing_route_capability'
  }

  if (!includesAll(route.features, definition.requiredRouteFeatures)) {
    return 'facility_required'
  }

  if (definition.maxRangeKm !== undefined && route.distanceKm > definition.maxRangeKm) {
    return 'out_of_range'
  }

  return null
}

const runningCostFor = (definition: TransportDefinition, route: SpotTravelRoute): number => {
  switch (definition.travelCostModel.kind) {
    case 'free':
    case 'route_fare':
      return 0
    case 'per_km':
      return Math.max(
        definition.travelCostModel.minimumOneWayCost,
        Math.round(route.distanceKm * definition.travelCostModel.yenPerKm),
      )
  }
}

const resolveOption = (
  definition: TransportDefinition,
  route: SpotTravelRoute,
): ResolvedTravelOption => {
  const components: TravelCostComponent[] = []

  if (route.baseOneWayCost > 0) {
    components.push({
      kind: definition.travelCostModel.kind === 'route_fare' ? 'fare' : 'other',
      label: definition.travelCostModel.kind === 'route_fare' ? '運賃' : '経路費用',
      amount: route.baseOneWayCost,
      charge: 'one_way',
    })
  }

  const runningCost = runningCostFor(definition, route)
  if (runningCost > 0) {
    components.push({
      kind: 'running_cost',
      label: '走行費',
      amount: runningCost,
      charge: 'one_way',
    })
  }

  const rentalCost = definition.ownershipModel === 'rental' ? (definition.rentalCost ?? 0) : 0
  if (rentalCost > 0) {
    components.push({
      kind: 'rental',
      label: 'レンタル料',
      amount: rentalCost,
      charge: 'per_trip',
    })
  }

  return {
    routeId: route.id,
    transportId: definition.id,
    transportType: definition.transportType,
    transportName: definition.name,
    minutes: Math.max(1, Math.round(route.baseMinutes * definition.travelTimeModifier)),
    distanceKm: route.distanceKm,
    oneWayCost: route.baseOneWayCost + runningCost,
    perTripCost: rentalCost,
    costComponents: components,
    cargo: definition.cargo,
    capabilities: definition.capabilities,
  }
}

const capabilityRequirements = (spot: FishingSpot): readonly AccessCapability[] =>
  spot.access.flatMap((requirement) =>
    requirement.kind === 'capability' ? [requirement.capability] : [],
  )

const resolveTravelOptions = (input: AccessEvaluationInput): readonly ResolvedTravelOption[] => {
  const requiredBySpot = capabilityRequirements(input.spot)
  const knownContactIds = knownContactIdSetOf(input)
  const resolved: ResolvedTravelOption[] = []

  for (const route of input.spot.travelOptions) {
    for (const definition of input.transports) {
      if (!isTransportAvailable(definition, input.playerTransports, knownContactIds)) {
        continue
      }

      if (!transportServesSpot(definition, input.spot)) {
        continue
      }

      if (routeRejection(definition, route) !== null) {
        continue
      }

      // A single travel option must satisfy the physical requirements. Capabilities from
      // unrelated vehicles are never combined into an impossible journey.
      if (!includesAll(definition.capabilities, requiredBySpot)) {
        continue
      }

      resolved.push(resolveOption(definition, route))
    }
  }

  return resolved.sort(
    (left, right) =>
      left.minutes - right.minutes ||
      String(left.transportId).localeCompare(String(right.transportId)),
  )
}

/** 未所有でも「その capability を持っている移動手段」を持っているかを見る。 */
const isTransportInPlayerScope = (
  definition: TransportDefinition,
  state: PlayerTransportState,
  knownContactIds: ReadonlySet<string>,
): boolean =>
  definition.ownershipModel === 'always_available' ||
  state.availableTransportIds.includes(definition.id) ||
  state.ownedTransportIds.includes(definition.id) ||
  isCharterAvailableViaContact(definition, knownContactIds)

const routeCanBeUsed = (
  definition: TransportDefinition,
  routes: readonly SpotTravelRoute[],
): boolean => routes.some((route) => routeRejection(definition, route) === null)

/** その候補が route 段階でどこまで進めたか（最も奥まで通った route の拒否理由）。 */
const candidateRouteRejection = (
  definition: TransportDefinition,
  routes: readonly SpotTravelRoute[],
): TransportCandidateRejection | null => {
  let best: TransportCandidateRejection | null = null

  for (const route of routes) {
    const rejection = routeRejection(definition, route)

    if (rejection === null) {
      return null
    }

    if (best === null || rejectionRank(rejection) > rejectionRank(best)) {
      best = rejection
    }
  }

  return best
}

const missingRouteFeatures = (
  definition: TransportDefinition,
  routes: readonly SpotTravelRoute[],
): readonly RouteFeature[] => {
  const missing = new Set<RouteFeature>()

  for (const route of routes) {
    for (const feature of definition.requiredRouteFeatures) {
      if (!route.features.includes(feature)) {
        missing.add(feature)
      }
    }
  }

  return [...missing]
}

/**
 * 行ける移動手段が 1 つも無いときの理由を、Transport 候補の解決段階から組み立てる。
 *
 * 持っている capability を「不足」と表示しないための最後の砦である。
 * 具体的な Transport ID では分岐しない（ownership model と route 条件だけで説明する）。
 */
const diagnoseBlockedTransport = (input: AccessEvaluationInput): readonly AccessBlockedReason[] => {
  const { spot, transports, playerTransports } = input
  const knownContactIds = knownContactIdSetOf(input)
  const requiredBySpot = capabilityRequirements(spot)

  /*
   * 1. この Spot で営業していないサービスを持っているだけ、という状態を先に説明する。
   * （別の海域の Charter を持っていることは「capability 不足」でも「route 非対応」でもない）
   */
  const outOfServiceArea = transports.filter(
    (definition) =>
      !transportServesSpot(definition, spot) &&
      isTransportInPlayerScope(definition, playerTransports, knownContactIds) &&
      includesAll(definition.capabilities, requiredBySpot) &&
      routeCanBeUsed(definition, spot.travelOptions),
  )

  if (outOfServiceArea.length > 0) {
    return [
      {
        kind: 'out_of_service_area',
        label: '必要: この地域で営業しているサービス（手配できるのは別の地域の船・事業者）',
        transportIds: outOfServiceArea.map((definition) => String(definition.id)),
      },
    ]
  }

  // 2. 手持ちの移動手段がその capability をまったく提供しない場合だけ「不足」と言う。
  const missingCapabilities = requiredBySpot.filter(
    (capability) =>
      !transports.some(
        (definition) =>
          transportServesSpot(definition, spot) &&
          isTransportInPlayerScope(definition, playerTransports, knownContactIds) &&
          definition.capabilities.includes(capability),
      ),
  )

  if (missingCapabilities.length > 0) {
    return missingCapabilities.map((capability) => ({
      kind: 'missing_capability' as const,
      capability,
      label: `必要: ${CAPABILITY_LABELS[capability]}`,
    }))
  }

  // 3. Spot の capability を 1 台で満たせる候補だけで、残りの段階を調べる。
  const candidates = transports.filter(
    (definition) =>
      transportServesSpot(definition, spot) && includesAll(definition.capabilities, requiredBySpot),
  )
  const usable = (definition: TransportDefinition): boolean =>
    isTransportAvailable(definition, playerTransports, knownContactIds) &&
    routeCanBeUsed(definition, spot.travelOptions)

  if (candidates.some(usable)) {
    // travelOptions が空のときにここへは来ない。防御的に理由を増やさない。
    return []
  }

  const ownership = candidates.filter(
    (definition) =>
      availabilityRejection(definition, playerTransports, knownContactIds) ===
        'ownership_required' && routeCanBeUsed(definition, spot.travelOptions),
  )

  if (ownership.length > 0) {
    return [
      {
        kind: 'ownership_required',
        label: '必要: この釣り場へ行ける移動手段の所有（Shop で購入）',
        transportIds: ownership.map((definition) => String(definition.id)),
      },
    ]
  }

  const rental = candidates.filter(
    (definition) =>
      availabilityRejection(definition, playerTransports, knownContactIds) ===
        'rental_unavailable' && routeCanBeUsed(definition, spot.travelOptions),
  )

  if (rental.length > 0) {
    return [
      {
        kind: 'rental_unavailable',
        label: '必要: レンタルの手配（この釣り場で借りられる移動手段がない）',
        transportIds: rental.map((definition) => String(definition.id)),
      },
    ]
  }

  /*
   * 手持ちの候補が route のどこで止まったかを見る。最も奥まで通った候補の段階を
   * 代表にすることで、「設備が足りない」と「そもそも距離・種別が合わない」を混同しない。
   */
  const inScope = candidates.filter(
    (definition) =>
      isTransportInPlayerScope(definition, playerTransports, knownContactIds) &&
      availabilityRejection(definition, playerTransports, knownContactIds) === null,
  )
  const facilityBlocked: TransportDefinition[] = []
  let deepest: TransportCandidateRejection | null = null

  for (const definition of inScope) {
    const rejection = candidateRouteRejection(definition, spot.travelOptions)

    if (rejection === null) {
      continue
    }

    if (deepest === null || rejectionRank(rejection) > rejectionRank(deepest)) {
      deepest = rejection
    }

    if (rejection === 'facility_required') {
      facilityBlocked.push(definition)
    }
  }

  if (deepest === 'facility_required' && facilityBlocked.length > 0) {
    const missingFeatures = new Set<RouteFeature>()

    for (const definition of facilityBlocked) {
      for (const feature of missingRouteFeatures(definition, spot.travelOptions)) {
        missingFeatures.add(feature)
      }
    }

    const features = [...missingFeatures]

    return [
      {
        kind: 'facility_required',
        label: `必要: ${features.map((feature) => ROUTE_FEATURE_LABELS[feature]).join('・')}`,
        feature: features[0] as RouteFeature,
        transportIds: facilityBlocked.map((definition) => String(definition.id)),
      },
    ]
  }

  return [
    {
      kind: 'no_compatible_transport',
      label: '行き方が分からない（この釣り場へ行ける移動手段がない）',
    },
  ]
}

export const evaluateAccess = (input: AccessEvaluationInput): AccessEvaluation => {
  const { spot } = input
  const knowledgeScore = spotKnowledgeScore(input.knowledge, String(spot.id))
  const regionScore = regionKnowledgeScore(input.knowledge, String(spot.regionId))
  const reputation = input.reputation ?? 0
  const permits = input.permits ?? []
  const travelOptions = resolveTravelOptions(input)
  const blockedReasons: AccessBlockedReason[] =
    travelOptions.length === 0 ? [...diagnoseBlockedTransport(input)] : []
  const satisfiedKinds: AccessRequirementKind[] = []

  for (const requirement of spot.access) {
    switch (requirement.kind) {
      // capability 条件は Transport 候補の解決結果としてまとめて説明する。
      // requirement ごとに並べると、持っている capability まで不足に見える。
      case 'capability': {
        break
      }

      case 'knowledge': {
        const scoped = requirement.scope === 'region' ? regionScore : knowledgeScore

        if (scoped >= requirement.minimum) {
          satisfiedKinds.push('knowledge')
        } else {
          blockedReasons.push({
            kind: 'knowledge',
            label:
              requirement.scope === 'region'
                ? `必要: この水域の知識 ${String(requirement.minimum)}%`
                : `必要: この釣り場の知識 ${String(requirement.minimum)}%`,
            required: requirement.minimum,
            current: Math.round(scoped),
          })
        }
        break
      }

      case 'reputation': {
        if (!input.reputationEnabled || reputation >= requirement.minimum) {
          satisfiedKinds.push('reputation')
        } else {
          blockedReasons.push({
            kind: 'reputation',
            label: `必要: 名声 ${String(requirement.minimum)}`,
            required: requirement.minimum,
            current: reputation,
          })
        }
        break
      }

      case 'permit': {
        if (input.permitsEnabled && permits.includes(String(requirement.permitId))) {
          satisfiedKinds.push('permit')
        } else {
          blockedReasons.push({
            kind: 'permit',
            label: input.permitsEnabled ? '必要: 遊漁券' : '必要: 遊漁券（未実装）',
          })
        }
        break
      }

      case 'relationship': {
        const trust = input.contactTrust?.[String(requirement.targetId)] ?? 0

        if (trust >= requirement.minimum) {
          satisfiedKinds.push('relationship')
        } else {
          blockedReasons.push({
            kind: 'relationship',
            label: `必要: 人脈 Trust ${String(requirement.minimum)}`,
            required: requirement.minimum,
            current: Math.round(trust),
          })
        }
        break
      }

      case 'season': {
        if (input.month === undefined || requirement.months.includes(input.month as never)) {
          satisfiedKinds.push('season')
        } else {
          blockedReasons.push({
            kind: 'season',
            label: `季節外（${requirement.months.map((month) => `${String(month)}月`).join('・')}）`,
          })
        }
        break
      }
    }
  }

  /*
   * capability 条件は「1 つの移動手段がすべて満たす」ので、travelOptions がある時点で
   * 満たされている。行けない場合は diagnoseBlockedTransport が理由を出している。
   */
  if (capabilityRequirements(spot).length > 0 && travelOptions.length > 0) {
    satisfiedKinds.push('capability')
  }

  return {
    spotId: String(spot.id),
    accessible: blockedReasons.length === 0 && travelOptions.length > 0,
    travelOptions,
    blockedReasons,
    satisfiedKinds,
  }
}

export const fastestTravelOption = (
  options: readonly ResolvedTravelOption[],
): ResolvedTravelOption | null => options[0] ?? null
