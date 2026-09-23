# Phase 19B — Setouchi Vertical Slice Design

Status: APPROVED → IMPLEMENTED (Rev.2 — Final Gate 監査反映済み、Phase 19B で実装)
Authority: `docs/JAPAN_WORLD_DESIGN_BIBLE.md` Rev.3 + main `21e6871` 実コード監査
Scope: 設計のみ。コード変更・commit・branch は本書では行わない。

---

## 1. Current System Audit（main 実測）

### 1.1 生きている機構（19B でそのまま使える）

| 機構 | 実装箇所 | 備考 |
|---|---|---|
| Tide 4相サイクル | `environmentResolver.ts` `tideFor`（745分周期、low/rising/high/falling、決定論的、日跨ぎ連続） | `climate.tidePhaseOffset` で Region ごとに位相ずらし可。UI notes に潮ラベル表示済み |
| Species 環境嗜好 | `FishingConditions.ts` `speciesEnvironmentMultiplier` | `environmentAffinity.{preferredSeasons, preferredTimeOfDay, weatherAffinity, tideAffinity, flowAffinity, preferredTemperatureC}` が Encounter 重みに live。species JSON への content-only 編集 |
| Spot `current` → Drift | `Drift.ts` / `resolveDeployment.ts` | `current.preference` が drift 強度になり、外れ投入を `drifted` にする。「強潮流で精密な投入が難しい」を表現可能 |
| Zone 別存在量 | `zoneAffinityMultiplier`（Casting.ts） | occurrence 単位。zoneAffinity=0 で「その Zone にはいない」 |
| AccessEngine | capabilities / route transportTypes / `access.season`（19A 配線済み、往路のみ） | ferry = `public_transport`+`island_access` のみ供給 |
| Hidden Spot / Discovery | `visibility:'hidden'` + `world.discoveredSpotIds` + `discover_spot` reward | Access と分離済み |
| Contact / Trust / Reward | `claimEligibleRewards`（trust >= minTrust で付与） | kinds: `intel` / `discover_spot` / `introduce_contact` |
| Charter | `operatorContactId` + `serviceRegionIds` + `knownContactIds` | operator を知っていれば利用可能。Charter 利用で operator の Trust 上昇（`charterTrust`） |
| Buyer | `regionId` スコープ、売却で Trust 上昇 | Buyer は常に known（`knownContactIdsOf`） |
| Expedition | `journey.{kind,name,oneWayCostYen,oneWayMinutes}` + nights + lodgings + 任意 permit | kind に `rail`/`ferry` 利用可（19A） |
| Sleep | `sleepUntilMorning` | 日を進める → tide 位相が日ごとにずれる（dayIndex 連動） |
| Region pack / species shard | `build-content-index.ts` | playable Region は pack + `species:<region>` shard を自動生成 |

### 1.2 Dead / 非接続の機構（19B content で書いても効果なし）

| 機構 | 状態 |
|---|---|
| `FishOccurrence.tide / season / time / temperature / preferredHabitats` | schema 上は valid だが消費するコードがない。**19B では記述禁止**（誤解を生む）。Spot ごとの潮・季節差は species affinity と fishTable 構成で表す |
| `climate.tideRange` | どこからも参照されない。潮位差の大小は現状意味を持たない |
| `spot.current` → Encounter 重み | Drift には使われるが、魚の出現重みには直接効かない（効くのは species の `flowAffinity` × environment の flow） |
| `water.flow` の潮連動 | flow は environment 種別固定 + 雨で+1段。「潮止まりで流れが止まる」動的表現は存在しない |

### 1.3 Ferry availability（19A handoff の実態）

- `island-ferry`: `ownershipModel:'always_available'`、`travelCostModel: route_fare`
- **しかし `isTransportAvailable` は常に `availableTransportIds.includes(id)` を要求**し、`always_available` は最後の `owned` チェックを素通りするだけで availability を与えない
- `INITIAL_AVAILABLE_TRANSPORT_IDS` = walk/train/bus/rental-car/rental-boat（island-ferry なし）
- `transport` state は Save に verbatim persist され、load 時の正規化・merge がない

→ **現状のまま ferry route を置くと「route はあるが誰も乗れない」状態になる。19B で必ず解決する。**

### 1.4 Trust 上昇経路（設計上の制約）

Trust が上るのは次の 2 経路のみ:

1. Buyer への売却（`sellCatches` → `trustProfile`）
2. Charter 利用（`charterTrust` → operator contact）

`local_fisher` / `guide` 型 Contact は **どちらでもない限り Trust を貯める手段がない**。したがって「地元の釣り人から情報」は local_fisher Contact 単独では成立せず、**島の Buyer（魚屋・民宿兼）を Trust chain の起点にする**のが既存機構に最も自然。

---

## 2. Setouchi Identity — 「潮を読む Fishing」

中心テーマ: **同じ Spot でも「いつ来たか」で釣れる魚が変わる**。これを新システムではなく以下の既存機構の組合せで実現する:

- **潮相性の強い魚を「瀬・水道」Spot に集中配置**する（sawara, kijihata, aohata, ishidai, kanto-seabass, kanto-maaji, sappa, anago, muroaji 等は既に `tideAffinity`/`flowAffinity` を持つ）
- **本土の港は潮に鈍い魚中心**にして「いつでも釣れるが単調」、水道系 Spot は「上げ/下げで爆発、潮止まりで別の顔」にする
- `spot.current: strong` で Drift 圧力を出し「潮が効く場所ほど投入精度が要求される」
- 朝夕まずめ × 上げ潮の重なりを species の `preferredTimeOfDay` × `tideAffinity` の積で自然に生む（掛け算なので両方揃うと顕著）

「潮を読む」の学習導線は UI 既存要素で完結する: 条件 notes の潮ラベル + Knowledge が上がると出る speciesHint + Fish Finder。

### やらないこと

- 潮流ベクトル / 潮汐表シミュレーション（新 system）
- `water.flow` の潮連動（new system。19C+ 候補）
- `FishOccurrence.tide` の配線（small extension だが 19B では不要 — species affinity で十分表現可能。19C 候補）

---

## 3. Region / Area Structure

`regions/setouchi.json` は 19A で 4 Area を定義済み（実装順に整理）:

| Area | 役割 | 19B |
|---|---|---|
| `setouchi-urban` 都市港湾帯 | 本土側拠点。Expedition 到着点 | 実装 |
| `setouchi-islands` 島嶼部 | ferry で渡る島の岸 | 実装 |
| `setouchi-straits` 瀬（強潮流） | 潮を読む中核。hidden + charter | 実装（hidden のみ） |
| `setouchi-open` 外海境界 | 外洋・大物 | **19C 以降** |

命名規則は既存に倣う: Spot ID `<region>-<descriptor>`、hidden は `<region>-hidden-<x>`。実在地名は直接採用せず「都市港湾」「島」「水道/瀬」という機能的地名（hokuriku, izu と同粒度）。

---

## 4. Spot Plan（5 Spots）

| Spot | Area | env | access | visibility | 核となる体験 |
|---|---|---|---|---|---|
| `setouchi-harbor-front` | urban | `bay_shore` | walk/train (`public_transport`) | public | 港湾ライトゲーム。潮に鈍い魚中心、いつでも釣れる |
| `setouchi-tetrapod-bank` | urban | `bay_shore` | walk | public | 堤防・テトラ帯。クロダイ系・カマス・根魚。夕夜が効く |
| `setouchi-island-shore` | islands | `nearshore` | **ferry route** (`transportTypes:['ferry']`, `requiredCapabilities:['island_access','public_transport']`, ~35min, ¥1,200) | public | ferry 初体験。磯のメジナ・イサキ |
| `setouchi-hidden-channel-edge` | straits | `nearshore` | ferry + walk（island_access） | **hidden** | **潮を読む Spot**。潮相性の強い魚に fishTable を集中。`current:{preference:'strong'}` で Drift 圧力 |
| `setouchi-hidden-se-offshore` | straits | `offshore` | **charter route** (`['charter_boat']`, `['boat_required','offshore']`, marina) | **hidden** | 沖の瀬。マダイ・イシダイ・カンパチ。Charter + Drift の集大成 |

※ `rental-boat` は初期 available なため、hidden-offshore の route を `charter_boat` 限定にすることで「地元 Captain との接続が必須」の構造を守る。rental-boat 用の陸〜沖ルートは置かない（19B の島嶼部では boat rental の運用 context を作らない）。

---

## 5. Ferry Access Plan（REQUIRED HANDOFF の解決）

### Gate 1 監査結果（`always_available` semantics の全件検証）

**`always_available` 全件**: walk / train / bus / island-ferry（他に存在しない）

**`availableTransportIds` への追加経路（全経路）**:
1. `createInitialTransportState`（`INITIAL_AVAILABLE_TRANSPORT_IDS` = walk/train/bus/rental-car/rental-boat）
2. `grantOwnedTransport`（購入時。`playerStore.ts:880`）
3. `migrateV5ToV6` の `LEGACY_ALWAYS_AVAILABLE`（v5→v6 レガシー変換のみ）

**关键な証明**: 「後から unlock される always_available Transport」への経路は**存在しない**。購入は `owned` 専用、報酬に transport unlock kind はなく、Region 到達 unlock 機構もない。すなわち現 architecture では `always_available` は「購入不要だが availability unlock が必要」を意味し得ない — unlock 手段自体がないため、list 非登録の always_available は**永久に使用不能**という状態にしかならない。`always_available` の唯一の一貫した意味は「所有不要かつ常時利用可能」であり、list への二重登録は冗長だった、と解釈するのが既存コードに最も忠実。

**封印意図の確認**: list 外の always_available は island-ferry のみ。これは 19A で意図的に「封印」されたのではなく、ferry route 不在の間は無害だった + 19B へ handoff されたもの。他に意図的に封印された always_available Transport は存在しない。

**UI/Player-state への波及**: `availableTransportIds` は UI 一覧に使われていない（`src/ui` に参照なし）。表示されるのは route ごとの ResolvedTravelOption のみ。global 化で「手持ち移動手段一覧」に勝手に出る、といった coupling はない。

### 選択肢の再比較

| 案 | old Save | semantic 一貫性 | scope | 将来の公共交通 | hidden coupling | testability | 判定 |
|---|---|---|---|---|---|---|---|
| A. global `always_available` 実効化 | ◎（state 非依存） | ◎（名前どおり） | ~6行+test | ◎ 自動対応 | なし（UI 非依存） | ◎ | **採用** |
| B. initial list + load merge 正規化 | ○（要 merge コード） | △（state が冗長に） | 中 | △ 毎回 list+merge | Save 正規化の新規則 | ○ | 不採用 |
| C. ferry ID 限定分岐 | ◎ | ✕（accessEngine の「ID 分岐しない」規約違反） | 小 | ✕ | ID 直書き | △ | 不採用 |
| D. Region 到達/報酬 unlock | ○ | △ | 新機構 | △ | 新規永続化か派生 | △ | 不採用（機構不在） |
| E. `operatorContactId` 流用 | ○ | ✕（ferry が contact 依存＋charterTrust が乗船で動く） | 小 | ✕ | charter semantics 混線 | △ | 不採用 |

### A の実装詳細

- `isTransportAvailable`: `definition.ownershipModel === 'always_available' \|\| state.availableTransportIds.includes(id)`（charter 経路は従来どおり OR）
- `isTransportInPlayerScope`（accessEngine.ts:341、診断メッセージ用）にも同じ条件を適用 — 適用しないと ferry で行ける Spot でも診断が「capability 不足」側に倒れる可能性があるため、2 箇所を同一 semantics に揃える
- `availabilityRejection` の `always_available` 分岐（`'not_available'`）は到達不能になる — 削除または残置を実装時に整理
- `INITIAL_AVAILABLE_TRANSPORT_IDS` は変更しない（Save・新規 state とも影響最小）

「データ上は ferry route があるが使えない」状態はこれで解消。ferry route が存在するのは setouchi のみなので他 Region への波及はない。

---

## 6. Tide / Current Gameplay — 実装分類

| 表現したいこと | 手段 | 分類 |
|---|---|---|
| 上げ/下げ潮で魚の活性が変わる | species `tideAffinity`（既に多数の候補魚が持つ） | **existing** |
| 潮止まりで狙いが変わる | fishTable を「潮依存魚」と「潮不問魚」で混ぜる構成 | **content-only** |
| 朝夕 × 潮の掛け合わせ | `preferredTimeOfDay` × `tideAffinity` の積（実装済み） | **existing** |
| 強潮で投入が難しい | `spot.current: strong` → Drift | **existing** |
| Spot 内の潮通しの良い筋 | `fishingZones` + `zoneAffinity`（「水道筋」zone に潮依存魚を寄せる） | **content-only** |
| 潮止まりで流れが物理的に緩む | water.flow の潮連動 | **new system → 19B 除外（19C 候補）** |
| Spot 個別の潮時間割 | occurrence.tide の配線 | **small extension → 19B 除外（19C 候補）** |
| 特定メソッドが強潮で不利 | 現状 drift 以外の method ペナルティなし | **new system → 19B 除外** |

**規約: 19B の FishOccurrence に `tide`/`season`/`time`/`temperature`/`preferredHabitats` を書かない**（dead field。書くと「効く」と誤読される）。代わりに species affinity + basePresence + zoneAffinity を使う。

---

## 7. Fishing Style Matrix（4 + 1）

| Style | Spot | 条件 | 主な魚 |
|---|---|---|---|
| 港湾ライトゲーム | harbor-front | 常時・徒歩 | sappa, kanto-maaji, mebaru, aigo |
| 堤防の底物・回遊 | tetrapod-bank | 夕〜夜が効く | kanto-kurodai, kamasu, magochi, kanto-seabass |
| 島の磯（ferry） | island-shore | ferry 利用 | mejina, isaki, kijihata, kasago |
| 水道の潮読み | hidden-channel-edge | **上げ/下げ潮** + Discovery | sawara, tachiuo, kanto-seabass, muroaji |
| 沖の瀬（charter） | hidden-se-offshore | charter + Trust + Drift | madai, ishidai, kanpachi, hiramasa |

---

## 8. Fish Matrix（全て既存 Species。新 Species 0）

| Spot | representative | secondary | bycatch | 潮・時間 |
|---|---|---|---|---|
| harbor-front | sappa, kanto-maaji | mebaru | aigo, konoshiro | maaji は上げ潮・朝夕に affinity 済み。sappa も tide あり |
| tetrapod-bank | kanto-kurodai, kamasu | magochi | kasago | seabass（夜）を低 presence で混ぜる |
| island-shore | mejina, isaki | kijihata | aigo, suzumedai(夏) | 磯物は緩やかな潮好み |
| hidden-channel-edge | sawara, tachiuo | kanto-seabass, muroaji | kamasu | sawara/muroaji/seabass は tide affinity 保有。sawara: 上げ1.15・秋冬、seabass: 夜×上げ。tachiuo は neutral 枠 |
| hidden-se-offshore | madai | ishidai, kijihata | kanpachi, hiramasa(稀) | ishidai/kijihata は affinity 済み |

### Species affinity 監査（Gate: Fish affinity audit）

| Species | tide | flow | season | time | 役割 |
|---|---|---|---|---|---|
| sappa | rising 1.15 | moderate 1.1 | 春夏秋 | 朝マズメ/朝/夕 | harbor 主役・潮で動く |
| kanto-maaji | **rising 1.20** | slow/mod 1.05 | 春夏秋 | 朝マズメ/夕 | harbor 主役・最も潮に敏感 |
| mebaru | — | — | — | — | harbor（潮不問の安定枠） |
| aigo | rising 1.15 | mod 1.1 | 夏秋 | 朝夕 | 底物・エサ釣り向き |
| konoshiro | — | — | — | — | harbor bycatch |
| kanto-kurodai | — | — | — | — | tetrapod 主役（潮不問） |
| kamasu | — | — | — | — | tetrapod/channel |
| magochi | — | — | — | — | tetrapod 底物 |
| kanto-seabass | rising 1.15 | — | 夏秋 | **夜/朝マズメ** | channel 夜枠 |
| mejina | — | — | — | — | island 主役 |
| isaki | — | — | — | — | island 主役 |
| kijihata | rising 1.15 | mod 1.1 | 夏秋 | 朝夕 | island/channel 根魚 |
| kasago | — | — | — | — | island bycatch |
| suzumedai | rising 1.15 | mod 1.1 | **夏のみ** | 朝夕 | island 季節限定 |
| sawara | rising 1.15 | mod 1.1 | **秋冬** | 朝夕 | **channel 目玉** |
| tachiuo | — | — | — | — | channel（neutral。将来的に夜/秋冬 affinity 候補） |
| muroaji | rising 1.15 | mod 1.1 | 夏秋 | 朝夕 | channel 群れ |
| madai | — | — | — | — | offshore 目玉（潮不問でも成立: 価値はサイズ/希少性） |
| ishidai | high 1.15・rising 1.1 | mod 1.1 | 春夏秋 | 朝夕夜 | offshore 大型根魚 |
| kanpachi | — | — | — | — | offshore rare |
| hiramasa | — | — | — | — | offshore rare |

**結論: 19B は Species authority 変更ゼロで成立する。** channel-edge の主役は全員 tide/flow affinity 保有済みで、潮相による Encounter 差は既存値だけで出る（rising 時に sawara/seabass/muroaji が 1.15〜1.20 倍、潮不問枠との相対差が「潮を読む」体感を作る）。

**既存 Region への影響**: 変更しないため影響ゼロ。`distribution` への setouchi 追加のみ（Codex 地域表示の正しさのため必須。encounter には無関係）。

**19C 候補（19B では実施しない）**: madai/isaki/mejina/tachiuo への生態的に一貫した environmentAffinity 追加 — 瀬戸内固有値ではなく global 値として検討。

### 不足魚種（future candidates — 実装禁止、記録のみ）

- `kurodai`（汎名。kanto-kurodai の地域非依存版）
- `chichibu`/`kue` 等の大物根魚、`shiira`（瀬戸内は夏のシイラも象徴的だが mahi-mahi で代用検討可）
- メバル亜種・カサゴ系の細分化

---

## 9. Contact / Trust / Discovery Graph

```
setouchi-harbor-coop (Buyer, urban)          … 本土側の売却先
        │ 売却 → Trust
        ├─ intel @5    「島に渡るなら港前のフェリーだよ」
        └─ intel @15   「島の魚屋は潮の話に詳しい」

setouchi-island-market (Buyer, islands)      … Trust chain の起点（魚屋・民宿兼）
        │ 売却 → Trust
        ├─ intel @5          「水道の潮が効く時間を教える」
        ├─ discover_spot @15 → setouchi-hidden-channel-edge
        └─ introduce_contact @30 → captain-setouchi

captain-setouchi (Contact: captain, initiallyKnown:false)
        │ charter 利用 → Trust（charterTrust）
        ├─ intel @10         「沖の瀬の見極め」
        └─ discover_spot @20 → setouchi-hidden-se-offshore
```

### Trust chain 数値監査（Gate）

売却 Trust = `perTransactionBase + qualityWeight × averageQuality`（cap `maxPerTransaction`）。Charter Trust = `4 + min(2, catches)`（ボウズでも +4）。

island-market の trustProfile を `base:2 / qualityWeight:6 / max:6`（izu-uoichiba 同等）と想定した場合、1 売却 ≈ 3〜5 Trust:

| Unlock | required | source | 1回あたり | 想定回数 | 開くもの |
|---|---|---|---|---|---|
| intel（フェリー案内） | 5 | island-market 売却 | ~4 | 1〜2 売却 | ferry の存在を lore で補強 |
| discover_spot channel-edge | 15 | 同上 | ~4 | **3〜5 売却** | hidden 水道 Spot |
| introduce_contact captain | 30 | 同上 | ~4 | **6〜9 売却**（数日の釣行で自然到達） | charter 利用可能化 |
| captain intel | 10 | charter 利用 | 4〜6 | 2 航海 | lore |
| captain discover_spot offshore | 20 | 同上 | 4〜6 | **3〜4 航海** | hidden 沖の瀬 |

「魚1匹で全開放」でも「数十時間の売却地獄」でもない — 数日の遠征で自然に段階が進む設定。数値は実装時に微調整可（Vertical Slice 成立確認レベル）。

- 「数値ゲート感」を減らすため、reward message は潮・瀬・島の具体的な情報として書く（intel は lore+ヒントとして機能）
- `local_fisher` 型は Trust を貯められないため採用しない（§1.4）。島の情報源は Buyer に寄せるのが既存機構で最も自然

---

## 10. Charter Design

`charter-boat-setouchi`（新規 Transport JSON）:

- `transportType: 'charter_boat'`, `ownershipModel: 'rental'`
- `operatorContactId: 'captain-setouchi'` → **島の魚屋の紹介（introduce_contact）がないと利用不能**
- `serviceRegionIds: ['setouchi']`
- `capabilities: ['boat_required','offshore','island_access']`, `launchCapability: 'marina'`, `boatCapability: 'offshore'`
- `requiredRouteFeatures: ['boat_rental','marina']`
- `rentalCost`: 既存 charter（¥42,000/伊豆）と同水準 ¥35,000〜45,000

「強い Spot へのボタン」にしないための構造:

- hidden-se-offshore は `current:strong` で Drift が速い → 投入精度・装備が問われる
- fishTable は madai/ishidai 等の強い FightProfile 持ち → タックル要求
- 行くだけでは片道コスト + charter 料が掛かる → 潮の良い時間を狙う動機が経済的にも成立

---

## 11. Player Journey（実プレイ順）

### 11.1 観察 → 判断 → 選択 → 結果（Gate 2 監査済み）

プレイヤーがゲーム内情報だけで「潮を読む」判断を完結できるかを、既存 UI で検証:

**見えるもの（既存 UI、新規 UI 不要）**:
- `ConditionPanel`（SpotScreen/FishingScreen）: 現在の**潮相**（干潮/上げ潮/満潮/下げ潮）・**流れ**（なし〜強い）・水温・濁り・天候・時刻・釣況 summary・「狙いやすい: 魚名」ヒント（Knowledge/FF に応じて精度向上）
- SpotScreen: environment ラベル・水深・海況・Zone 一覧・仕掛け適合ヒント
- HomeScreen: Spot 一覧（visibility 制御済み）+「今日の条件」
- Codex: 魚種・地域・水種（affinity 詳細は出さない — 攻略 Wiki 不要の範囲内。潮嗜好は intel と観察で学ぶ設計）
- Contact intel / reward message: 「水道は上げ潮に効く」等の言葉で教える（content-only）

| Spot | 観察できる情報 | 判断 | 選択 | 結果 |
|---|---|---|---|---|
| harbor-front | 潮・流れ表示、狙いやすい魚 | 「潮が止まっても釣れる」 | いつでも行ける | 安定した小物（潮不問〜弱依存） |
| tetrapod-bank | 同上+時間帯 | 「夕〜夜が効きそう」 | 夕方に釣行 | kurodai/seabass（夜時間 affinity） |
| island-shore | 同上 + ferry option の表示 | 「島に行ける」 | ferry route 選択 | 磯物（緩やかな潮好み） |
| hidden-channel-edge | 潮=上げ/下げ時に狙いやすい魚が変化 | 「上げ潮に来ると爆発する」 | 潮相を見て釣行・zone 選択 | sawara/muroaji/seabass が rising で 1.15〜1.20 倍 |
| hidden-se-offshore | 流れ=強い・水深 | 「強潮で投入が流される」 | charter + 装備選択 | Drift が効く中で大型魚 |

**「攻略 Wiki なしで理解可能」**: 成立。潮表示は常時表示、狙いやすい魚のヒントは Knowledge/FF で段階的に明確化、Contact intel が「潮を見よ」を言語化する。

**残存ギャップ（Low）**: `SpotScreen.ENVIRONMENT_LABELS` に `nearshore`/`offshore` の日本語ラベルがなく raw 文字列が出る（既存 48 Spot も同じ状態）。19B で 2 行の label 追加を許容範囲として提案（新規 UI ではなく表示辞書の補完）。

### 11.2 Step-by-step 机上 simulation（既存 mechanics のみ）

| # | Player action | Required state | Runtime authority | State change | 新たに開くもの |
|---|---|---|---|---|---|
| 1 | Expedition 選択・出発 | cash ≥ plan cost | `planExpedition` / `startExpedition` | `expedition.current` 作成、`currentRegionId=setouchi`、time +210min | setouchi region pack load |
| 2 | harbor-front で釣る | `leaveForSpot`（walk/train route OK） | `evaluateAccess` | trip 開始、時間経過 | Spot Knowledge 蓄積 |
| 3 | 釣果を harbor-coop に売る | AT_SPOT→帰宅→Trade | `sellCatches` | cash+、coop Trust+ | intel@5/@15 claim |
| 4 | island-shore へ ferry | route に ferry option（`island_access`） | `evaluateAccess`（**19B の semantics 修正で island-ferry が利用可能**） | trip=ferry、時間+35min | 島の魚・Knowledge |
| 5 | 島で釣り→island-market 売却 | 同上 | `sellCatches` | market Trust+ | 3〜5 売却で discover_spot@15 |
| 6 | hidden-channel-edge が Map に出る | reward claim | `discoverSpotFromContact` → `discoveredSpotIds` | visibility 解禁 | 潮読み Spot 到達 |
| 7 | 上げ潮に channel-edge へ | 時間調整（釣行・移動・sleep） | `resolveFishingConditions` | — | 潮依存魚の Encounter 上昇を体感 |
| 8 | market Trust 30 で captain 紹介 | reward claim | `introduce_contact` → `isContactKnown` | knownContactIds に captain 追加 | charter-boat-setouchi が route option に出る |
| 9 | charter で沖へ | known captain + cash | `evaluateAccess`（`operatorContactId` + `serviceRegionIds`） | trip=charter | 沖釣り・charterTrust |
| 10 | 3〜4 航海で Trust 20 | — | `applyCharterTripOutcome` | captain Trust+ | discover_spot@20 → hidden-se-offshore |
| 11 | hidden-se-offshore へ | discover + charter | 同上 | — | slice 到達点 |

**design gap なし** — 全 step が既存 runtime authority で成立する（唯一の新規コードは step 4 の `always_available` semantics）。

---

## 12. Implementation Classification

| Feature | Existing | Content-only | Small ext | New system |
|---|---|---|---|---|
| Region playable 化（stage 変更） | ✓ | ✓ | | |
| 5 Spot + fishTable + zones | | ✓ | | |
| ferry route（TravelOption） | ✓ | ✓ | | |
| island-ferry 実効化（`always_available` semantics、2 関数） | | | **✓ 必須** | |
| `ENVIRONMENT_LABELS` への nearshore/offshore 追加 | | | ✓（表示辞書、2行） | |
| charter-boat-setouchi | ✓ 機構 | ✓ | | |
| Contacts ×2 / Buyers ×2 / Rewards ×5 | ✓ 機構 | ✓ | | |
| setouchi-expedition（journey rail） | ✓ 機構 | ✓ | | |
| species `distribution` 更新 | | ✓ | | |
| species `environmentAffinity` 追加 | — | **19B では実施しない**（19C 候補） | | |
| 潮→flow 連動 | | | | ✓ 19B 除外 |
| occurrence.tide 配線 | | | 19C 候補 | |
| 「潮待ち」wait アクション | | | 19C 候補 | |

---

## 13. Required Data Changes

| ファイル | 変更 |
|---|---|
| `src/content/data/regions/setouchi.json` | `stage: 'planned' → 'playable'`。base/areas/climate は維持 |
| `src/content/data/expeditions/setouchi-expedition.json` | 新規。`journey:{kind:'rail', name:'新幹線 東京→瀬戸内', oneWayCostYen:~17000, oneWayMinutes:~210}`、nights{min:1,default:2,max:5}、lodgings ×2、permit なし |
| `src/content/data/fishing-spots/setouchi-*.json` | 新規 ×5（§4） |
| `src/content/data/transports/charter-boat-setouchi.json` | 新規（§10） |
| `src/content/data/buyers/setouchi-harbor-coop.json` / `setouchi-island-market.json` | 新規 ×2 |
| `src/content/data/contacts/captain-setouchi.json` | 新規（initiallyKnown:false） |
| `src/content/data/contact-rewards/setouchi-*.json` | 新規 ×5（§9） |
| `src/content/data/fish-species/{使用種}.json` | `distribution` に setouchi 追加のみ（**environmentAffinity 変更なし**） |
| generated（`content-index` / `content-ownership` / `packs/region-setouchi.ts` / `packs/species-setouchi.ts` / `world.ts`） | `npm run content:index` で再生成 |

## 14. Required Code Changes

| 箇所 | 変更 | 規模 |
|---|---|---|
| `src/domain/access/accessEngine.ts` | `isTransportAvailable` + `isTransportInPlayerScope` + `availabilityRejection` で `always_available` を実効化 | ~6行 |
| `src/ui/spot/SpotScreen.tsx` | `ENVIRONMENT_LABELS` に `nearshore`/`offshore` 追加 | 2行 |
| `tests/` | §16 のテスト追加・更新 | — |

**これ以外のコード変更は不要。** Save・schema・engine・その他 UI の変更なし。

## 15. Save Compatibility

- Save v9 維持。新規永続フィールドなし（discoveredSpotIds / contactTrust / claimedRewardIds / expedition.permits 既存）
- ferry 実効化は derived 判定の変更で、Save schema・migration とも無関係。新旧 Save で同一挙動
- `journey.kind:'rail'` は Save payload に入らない（19A と同じ理由）

## 16. Tests Required

**Transport / Access:**
1. old Save 相当の transport state（`availableTransportIds` に island-ferry なし）でも island-ferry が利用可能
2. new Save でも同様に利用可能
3. `always_available` regression（walk/train/bus の挙動不変）
4. owned/unlockable Transport regression（`owned` は従来どおり所有必須、`rental` は従来どおり list 必須）
5. ferry capability regression（boat_required/offshore を満たさない — 19A テスト維持）
6. island Spot は ferry capability（`island_access`）を要求し、ferry でのみ到達可能

**Region / Content:**
7. Setouchi expedition（rail journey）の schema + plan 生成
8. Region pack loading（`region:setouchi` + `species:setouchi` shard）
9. public Spot access（harbor-front/tetrapod-bank は walk/train で到達可能）
10. hidden Spot は初期非表示
11. planned → playable validation（setouchi 昇格が validation を通る）
12. no new Species（species 件数不変を contract test で固定）
13. 残り 12 planned Region の definition-only 維持

**Progression loop:**
14. Trust reward unlock（売却 → claimEligibleRewards → intel/discover_spot）
15. Captain introduction（introduce_contact → knownContactIds → charter 利用可能化）
16. Charter access（operatorContactId + serviceRegionIds）
17. offshore access（hidden-se-offshore は charter なしでは到達不能）

**Environment:**
18. tide/current で Encounter 重みが変わる（rising vs low で channel-edge の species 構成差 — deterministic）
19. deterministic encounter regression
20. `spot.current:strong` → drift が deployment に効く

**Save / 全体:**
21. Save v9 compatibility（v8→v9 migration + v9 round-trip、transport state 非依存で ferry 利用可能）
22. full `npm run check`

## 17. Risks

| 重要度 | 内容 |
|---|---|
| Blocking | なし |
| High | なし |
| Medium | なし |
| Low | (a) `FishOccurrence.tide` 等の dead field は schema 上 valid のまま — 誤記述防止のため本書に規約明記（実装側の防御は 19C 候補の「使用警告 lint」）。(b) `always_available` semantics 変更は初適用 — 既存 walk/train/bus は initial list 入りで不変、island-ferry のみが「使える」に変わる。regression テストで固定。(c) `ENVIRONMENT_LABELS` の nearshore/offshore 欠落は既存 gap — 19B で label 追加（2行）。(d) `kanto-*` species ID の命名違和感 — 19C+ rename 候補として記録のみ。(e) tideRange は dead field — 19C+ で潮位差表現に再利用するか整理 |

## 18. Phase 19B exact scope

**Must:**

1. setouchi `stage:'playable'` 化 + setouchi-expedition（rail journey）
2. Spot ×5（§4、うち hidden ×2）
3. ferry route 実装 + `always_available` 実効化（small extension、§5 Gate 1 確定）
4. `ENVIRONMENT_LABELS` への nearshore/offshore 追加（2行、表示辞書）
5. charter-boat-setouchi + captain-setouchi + introduce_contact 経路
6. Buyer ×2 + Contact rewards ×5（§9 graph、数値は実装時に微調整）
7. species `distribution` 更新のみ（**Species affinity 変更なし**）
8. generated 再生成 + §16 テスト + `npm run check`

**Not in 19B:** setouchi-open Area の Spot、新 Species、Species affinity 変更、local_fisher 型の活用、潮→flow 連動、occurrence.tide 配線、wait アクション、permit、Region 完成度 100%、その他のコード変更

## 19. Deferred Setouchi content

- `setouchi-open` 外海境界 Area（大物・外洋瀬）
- 本土〜島の追加 Spot（干潟・河口・夜釣り公園等）
- `local_fisher` 型 Contact（Trust 経路の拡張が先）
- 追加 Buyer（島側 2 軒目・競り市場）
- species rename（kanto-* → 汎名）
- ferry の便数・時刻表の概念（現状 abstract route で十分）

## 20. Phase 19C+ expansion path

1. `water.flow` の潮連動（潮止まり = flow 低下）— 「潮を読む」の物理裏付け
2. `FishOccurrence.tide`/`season` 配線 — Spot 個別の潮時間割
3. 「潮待ち」wait アクション — 戦略的時間消費
4. setouchi-open + 外洋 Big Game 接続（Phase 18 系譜と合流）
5. 次 Region vertical slice: oki-islands（ferry+島嶼）または kii-peninsula（黒潮）
