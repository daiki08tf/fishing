# Data Model

## 1. 目的

このゲームは最終的に以下の規模を想定する。

- 1000+ Fish Species
- 1000+ Fishing Spots
- 多数の地域
- 多数の釣法
- 多数のタックル
- 時間・季節・天候・潮・水温等の条件
- 地域別ルール

そのため、魚やSpotをコードにハードコードしない。

データ駆動を原則とする。

## 2. FishSpecies

概念モデル:

```ts
type FishSpecies = {
  id: string
  japaneseName: string
  scientificName?: string

  taxonomy?: {
    family?: string
    genus?: string
  }

  waterTypes: ("fresh" | "brackish" | "salt")[]

  distribution: RegionRef[]
  habitats: HabitatType[]
  depthRange?: Range
  temperatureRange?: Range

  seasonality?: SeasonalProfile
  timeActivity?: TimeProfile
  tidePreference?: TideProfile
  currentPreference?: CurrentProfile

  diet?: string[]
  baits?: string[]
  lureCategories?: string[]
  fishingMethods?: string[]

  lengthModel: LengthDistribution
  weightModel?: WeightModel

  fightProfile: FightProfile

  rarity: number

  sourceRefs?: SourceRef[]
}
```

## 3. FishIndividual

```ts
type FishIndividual = {
  id: string
  speciesId: string

  lengthCm: number
  weightKg: number

  condition: number

  traits: FishTrait[]

  fightSeed: string

  caughtAt?: string
  spotId?: string
  capturedAt?: string

  percentile?: number
}
```

個体の保存は原則「実際にプレイヤーが接触した魚」に限定し、世界中の全魚を事前生成しない。

## 4. FishTrait

初期候補:

```ts
type FishTrait =
  | "trophy"
  | "old"
  | "strong_runner"
  | "heavy"
  | "scarred"
  | "aggressive"
```

将来魚種固有Traitを追加できる。

Traitはファンタジー能力ではなく、現実的な個体差として説明できるものを優先する。

## 5. Region

```ts
type Region = {
  id: string
  name: string
  parentId?: string

  type:
    | "country"
    | "prefecture"
    | "area"
    | "water_system"
    | "water_body"
}
```

例:

Japan
→ Kanagawa
→ Sagami Bay
→ Miura
→ specific area

## 6. FishingSpot

```ts
type FishingSpot = {
  id: string
  name: string

  regionId: string

  environment: EnvironmentType

  access: AccessRequirement[]
  travelOptions: SpotTravelRoute[]

  habitatTags: string[]

  depth?: DepthProfile
  current?: CurrentProfile

  fishTable: FishOccurrence[]

  regulations?: RegulationRef[]

  knowledgeConfig: SpotKnowledgeConfig

  sourceRefs?: SourceRef[]
}
```

## 7. FishOccurrence

魚種とSpotの出現関係。

```ts
type FishOccurrence = {
  speciesId: string

  basePresence: number

  season?: SeasonalProfile
  time?: TimeProfile
  tide?: TideProfile
  weather?: WeatherProfile
  temperature?: Range

  preferredHabitats?: string[]

  sizeModifier?: number
}
```

「Spotに魚種を置く」のではなく、条件に応じてEncounter Weightを算出する。

## 8. Encounter

概念式:

```
EncounterWeight =
  BasePresence
  × SeasonFactor
  × TimeFactor
  × WeatherFactor
  × TideFactor
  × WaterTemperatureFactor
  × HabitatFactor
  × MethodFactor
  × LureOrBaitFactor
```

完全な科学シミュレーターではなく、現実の傾向をゲームとして扱える抽象度にする。

## 9. Transport

```ts
type TransportDefinition = {
  id: string
  name: string

  transportType:
    | "walk"
    | "train"
    | "bus"
    | "bicycle"
    | "motorcycle"
    | "compact_car"
    | "suv"
    | "rental_car"
    | "kayak"
    | "rental_boat"
    | "owned_boat"

  ownershipModel: "always_available" | "owned" | "rental"
  purchasePrice?: number
  rentalCost?: number

  travelCostModel:
    | { kind: "free" }
    | { kind: "route_fare" }
    | { kind: "per_km"; yenPerKm: number; minimumOneWayCost: number }
  travelTimeModifier: number
  maxRangeKm?: number

  cargo: { gearUnits: number; maxWeightKg: number }
  capabilities: AccessCapability[]
  requiredRouteFeatures: RouteFeature[]
  launchCapability: "none" | "portable" | "ramp" | "marina"
  boatCapability: "none" | "nearshore" | "offshore"
  passengerCapacity: number
}

type PlayerTransportState = {
  availableTransportIds: string[]
  ownedTransportIds: string[]
}

type SpotTravelRoute = {
  id: string
  transportTypes: TransportType[]
  requiredCapabilities: AccessCapability[]
  features: RouteFeature[]
  baseMinutes: number
  distanceKm: number
  baseOneWayCost: number
}
```

Transport は Access / travel / economy のための抽象であり、燃料残量・故障・車検・
実道路 routing のシミュレーションは持たない。具体的な車種・船名は Content に置き、
AccessEngine は ID や名称では分岐しない。

`baseOneWayCost` は従来どおり片道の固定費で、往復時に 2 倍する。
レンタル料は `rentalCost` として 1 釣行に 1 回だけ加算する。将来の ferry / highway /
parking / lodging は cost component を増やして扱う。

## 10. AccessRequirement

SpotアクセスはLevelではなく条件で定義する。

例:

```ts
type AccessRequirement =
  | { kind: "capability"; capability: AccessCapability }
  | { kind: "knowledge"; minimum: number }
  | { kind: "reputation"; minimum: number }
  | { kind: "permit"; permitId: string }
  | { kind: "relationship"; targetId: string; minimum: number }
  | { kind: "season"; months: number[] }
```

`AccessCapability` は `reachable_on_foot` / `public_transport` / `bicycle_access` /
`road_access` / `rough_road` / `kayak_launch` / `boat_required` / `offshore` /
`island_access` を現在の語彙とする。Spot が capability を要求し、利用可能な
TransportDefinition がそれを提供する。Angler Level は入力にも条件にも含めない。

### 行けない理由（Phase 7A.1）

`AccessBlockedReason.kind` は条件そのものではなく、**Transport 候補が落ちた段階**も表す。

```ts
type AccessBlockedReasonKind =
  | AccessRequirementKind           // knowledge / reputation / permit / relationship / season
  | "missing_capability"            // 手持ちの移動手段がその capability を持たない
  | "no_compatible_transport"       // capability はあるが、行ける route が無い
  | "ownership_required"            // 行ける車両の所有が必要（未購入）
  | "rental_unavailable"            // レンタルが player state に無い
  | "facility_required"             // route に必要な設備（営業所 / マリーナ等）が無い
```

Transport 候補の解決は
`not_available` → `ownership_required` / `rental_unavailable` →
`route_type_not_allowed` → `missing_route_capability` → `facility_required` →
`out_of_range` の順に段階を区別する。**手持ちの移動手段が提供している capability を
「不足」と表示しない**（例: 中古車を持つプレイヤーに「道路からのアクセス」を要求しない）。

## 10.1 Trip UI の既定選択

行ける Spot では `ResolvedTravelOption` を列挙し、プレイヤーが移動手段を選ぶ。
既定は Economy の `defaultTravelOption`（往復費が最も安い候補、同額なら速い順）である。
「4 分速いだけの高額な候補を黙って選び、高い往復費を課す」ことを避ける。
費用は `costComponents`（運賃 / 走行費 / レンタル料）を内訳として表示する。

## 11. PlayerProgression

```ts
type PlayerProgression = {
  anglerLevel: number
  anglerXp: number

  skillPoints: number

  skills: {
    casting: number
    lineControl: number
    hooking: number
    fighting: number
    landing: number
    detection: number
    rigging: number
  }

  reputation: number

  methodProficiency: Record<string, number>
}
```

## 12. Knowledge

```ts
type KnowledgeState = {
  fish: Record<string, number>
  spots: Record<string, number>
  regions: Record<string, number>
  methods: Record<string, number>
}
```

0〜100等のスコアを内部値として使う場合でも、UIでは必ずしも数値をそのまま見せる必要はない。

## 13. Gear

Phase 6 で実装した。ブランドは**架空**とし、実在ブランドは同じ形のまま
Content を追加して載せる（`docs/DECISIONS.md` §1）。ブランド自体は性能を持たず、
性能差は各製品の現実由来スペックで表現する。

### Brand / Series / Model

```
Brand（架空）
└ Series（製品シリーズ。表示・整理の概念）
   └ Model（Rod / Reel / ... の1製品）
```

- Series は UI / Content の整理概念であり、FishingEngine は Series 名を知らない。
- Reel は標準化された `sizeClass`（1000〜30000）を持てる。
  番手は整理軸であり、実性能は `gearRatio` / `retrieveCmPerTurn` / `maxDragKg` /
  `weightG` / `lineCapacity` / `smoothness` / `control` から解決する。
- Rod は `power` / `action` と、Series の用途カテゴリ（Ajing / Seabass / Surf 等）を持つ。
- `sizeClass` / `series` は Engine の分岐条件にしない（装備を増やしても Engine は変わらない）。

### 現実属性とゲーム調整値の分離

Content に置くのは**現実由来の属性**（長さ・ルアー重量域・ドラッグ力・ライン強度・
号数・ギア比など）だけである。ゲーム上の係数（感度係数・control 補正・相性スケール）は
`GearTuning` 側の調整値として分離する。

### コアデータ

### Rod

- length
- power
- action
- lureWeightRange
- lineRating
- weight
- sensitivity

### Reel

- size
- gearRatio
- drag
- weight
- lineCapacity
- retrieveRate
- dragStartup（ドラッグの出だしの滑らかさ）
- rigidity（剛性）
- windingTorque（巻き上げトルク）
- response（巻き出しのレスポンス）

番手（`sizeClass`）はクラスを表す整理軸であり、性能そのものではない。
実性能は上のスペックから `resolveTackle` が解決する。
同じ番手でもブランド・Series ごとに spec が異なる（価格だけの差にしない）。

### Line

- material（nylon / fluorocarbon / PE）
- diameter
- strength
- stretch
- abrasionResistance
- visibility

### Leader

- material
- strength
- diameter
- abrasionResistance
- visibility

### Hook

- size
- strength
- hookType
- penetration
- holdingPower
- gauge

`size` は正の数が号数（`6` = 6番。数字が大きいほど小さい針）、
負の数が `N/0`（`-1` = 1/0。数字が大きいほど大きい針）を表す。

### Lure

- category
- length
- weight
- depth
- action
- visualProfile
- targetProfile

### Bait

- baitType
- presentation
- targetProfile

### Method（釣法）

`lure` / `light_lure` / `bait` / `bottom`。
釣法 × offering（Lure / Bait）の相性が Encounter の重みを変える。
「特定の offering でないと釣れない」hard lock は作らない。

### Loadout / Inventory

```ts
type Loadout = {
  rodId: GearId
  reelId: GearId
  lineId: GearId
  leaderId: GearId | null  // リーダー無しも可
  hookId: GearId
  offeringId: GearId       // Lure または Bait
  methodId: string
}

type Inventory = { ownedGearIds: GearId[] }
```

装備効果は現実の性能として説明できる範囲を基本とする。

互換性は `fatal / warning / suboptimal / good / excellent` を区別し、
**致命的な組み合わせだけ**を装備不可とする。多少外れた構成は使える。

## 14. Regulation

```ts
type Regulation = {
  id: string
  regionId?: string
  spotId?: string
  speciesId?: string

  type:
    | "permit"
    | "closed_season"
    | "closed_area"
    | "size_limit"
    | "bag_limit"
    | "method_restriction"

  validFrom?: string
  validTo?: string

  sourceRefs: SourceRef[]
}
```

## 15. SourceRef

現実データと照合するため、ソース情報を持てる構造を用意する。

```ts
type SourceRef = {
  id: string
  url?: string
  title: string
  publisher?: string
  accessedAt?: string
  verifiedAt?: string
}
```

特に法令・遊漁ルールは日付を伴って管理する。

## 16. RNG

乱数生成はシード可能にする。

用途:

- 個体生成
- サイズ
- Trait
- 魚の行動
- Encounter

目的:

- 再現可能なテスト
- バグ調査
- バランス検証

UIコンポーネントから直接ランダム生成しない。


## 17. 仕事（採用しない）

仕事はゲームシステムにしない。

- CareerState / JobDefinition / Career XP / Cross-Skill は採用しない
- 会社員という設定は、月次の定期収入としてのみ表現する（§18 の FinanceState）
- 勤務時間・通勤・有給・仕事イベントはデータとして持たない
- プレイヤーの釣行を仕事の予定で制限しない

時間帯・曜日・季節・天候・潮は、釣りの条件として World / Environment 側で扱う。

## 18. Economy Philosophy

経済は詳細な家計シミュレーターにしない。

内部的には以下程度で十分。

```ts
type FinanceState = {
  cash: number
  salaryIncome: number
  simplifiedLivingCost: number
}
```

生活費はまとめて自動控除する。

プレイヤーが判断する主な支出は釣り関連資産・移動・遠征。

経済バランスは「何を先に買うか」の迷いを作るために使い、通常の釣行そのものを長期間禁止するためには使わない。
