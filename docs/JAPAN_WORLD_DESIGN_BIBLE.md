# Japan World Design Bible (Rev.3)

Phase 18.5B 成果物。コード変更なしの設計文書。
承認後、日本全域 Content を段階的に実装するための基準とする。
Rev.2: 設計レビュー反映版（Region 粒度・journey 一般化・ferry・season 配線・
habitat 語彙・Progression・規模・Phase 19A scope を再検証済み）。
Rev.3: Gate 1（`stage:'planned'` 実挙動の実コード追跡）と Gate 2（19A/19B 境界）
を反映。Phase 19A Implementation Contract 確定版。

---

## 1. Current World Audit

### 1.1 階層モデル（実装済み）

```
Country (countries/*.json)
  └─ Region (regions/*.json, RegionDefinition)
       ├─ base: RegionBase          … 遠征中の拠点
       ├─ areas: RegionArea[]        … id + name のみ（Spot が areaId で参照）
       ├─ climate: ClimateProfile    … 水温・天候重み・潮位・半球
       └─ stage: 'playable' | 'planned'
            └─ FishingSpot (fishing-spots/*.json)
                 ├─ environment: open string
                 ├─ access: AccessRequirement[]
                 ├─ travelOptions: SpotTravelRoute[]
                 ├─ visibility: 'public' | 'hidden'
                 ├─ habitatTags / depth / current / fishingZones
                 ├─ fishTable: FishOccurrence[]（season/time/tide/temperature/zoneAffinity/sizeModifier）
                 └─ knowledgeConfig / sourceRefs
```

- Area は「name だけ」の薄い単位。行動差は Spot の access/travelOptions/environment が担う。
- `World → Country → Region → Area → Spot` は `regionId`/`areaId` 参照だけで表現する。

### 1.2 移動・Access（実装済み）

- **AccessEngine**: `spot.access`（capability/knowledge/reputation/permit/relationship/season）+
  `spot.travelOptions` × `TransportDefinition` の突合で ResolvedTravelOption を生成。
- **TransportType**（12）: walk/train/bus/bicycle/motorcycle/compact_car/suv/rental_car/
  kayak/rental_boat/owned_boat/charter_boat。
- **AccessCapability**（9）: reachable_on_foot / public_transport / bicycle_access / road_access /
  rough_road / kayak_launch / boat_required / offshore / island_access。
- **RouteFeature**（4）: vehicle_rental / launch_point / boat_rental / marina。
- Charter は `operatorContactId` + `serviceRegionIds` + `ownershipModel: rental` で、
  「その地域で営業する船長を知っていれば乗れる」を data-driven に表現済み。
- **island_access** は既存。供給は船系 Transport のみ（rental_boat/owned_boat/
  small-owned-boat/charter）。

### 1.3 遠征（実装済み）

- `ExpeditionDefinition` = regionId + **flight**（domestic/international, 片道円・分）+
  nights(min/default/max) + lodgings + permit?
- `world.currentRegionId` を Expedition 経由でのみ変更（`moveToRegion`）。
  遠征していない Region の Spot には Domain が強制的に行かせない（`not_in_region`）。
- `flight` の実参照点は 5 箇所のみ（Expedition.ts / content/schema/expedition.ts /
  ExpeditionScreen.tsx / simulate-world-expansion.ts / 13 JSON）。改名コストは小さい。
- **Angler Level は Access 条件に存在しない**（tests で機械検査済み）。
  進行は移動手段・Knowledge・Trust・資金で表現する。

### 1.4 人脈・発見（実装済み）

- `ContactDefinition`（captain/guide/local_fisher/rental_staff、regionId 紐付け、initiallyKnown）。
- `ContactReward`（intel / discover_spot / introduce_contact、minTrust、targetId）。
- Trust の authority は `TradeState.contactTrust`（Buyer への販売・Charter 釣行で上昇）。
- Hidden Spot の Discovery authority は `world.discoveredSpotIds`（＝ `isSpotKnown`）。
  Discovery と Access は分離済み（知っていても Access 未達なら行けない）。

### 1.5 環境・水深・海況（実装済み）

- Environment: 季節（半球対応）/ 時間帯 / 天候 / 潮 / 水温・透明度・流れ・風
  （決定論的、ClimateProfile 駆動）。
- SeaState（calm/moderate/rough）→ MarineReadiness が Platform 別に出艇可否を判定
  （kayak は calm のみ、nearshore_boat は rough 不可、offshore_boat は常時可、shore 常時可）。
- FishingPlatform（shore/kayak/nearshore_boat/offshore_boat）は trip.transportId から derive。
- Depth/Cast deployment → `initialLineOutM` → FightCapability → バトル（Phase 17→18 接続済み）。
- FishingMethod presentation: cast/vertical/drift/troll + supportedPlatforms。
  実装済み method 9 件（bait/bottom/light_lure/lure/live_bait_drift/offshore_casting/
  tai_rubber/trolling/vertical_jigging）。

### 1.6 機械的チェック（`npm run check` が強制する前提）

- playable Region（home 除く）は **Expedition 必須**。
- playable Region は Spot ≥1 + `region:<id>` pack + `species:<id>` shard（fishTable から自動導出）。
- hidden Spot は **discover_spot reward 必須** + **明示 fishingZones 必須**。
- Phase 16 以降の野生 Spot は **魚種 4+**（bycatch ポリシー、Region 集合 `PHASE_16_REGIONS` に列挙）。
- 全 runtime Species は SpeciesTradeProfile 必須。scientificName 重複は warn。
- 生成物（content-index / ownership / species-shards）はコミット済みと一致必須
  （`npm run content:index` 再生成）。

### 1.7 判明した dead / 半実装

- `access.season`: `month` が evaluateAccess に**渡されていない**ため常に satisfied。
  使っている Spot は **0 件**（全 Spot 走査済み）。
- `access.reputation`: `reputationEnabled` が立たないため常に satisfied（dead）。使用 **0 件**。
- `waterKindOf`: `estuary/bay_shore/nearshore/offshore` 以外の environment 語彙は
  全て freshwater 扱い（潮=null）。新 env 語彙を足すと **潮が消える** ので注意。
- `ExpeditionDefinition.flight`: 移動は航空のみ。国内フェリー・車・特急は表現不能。
- UI は移動手段の `transportName` を表示する（transportType ではない）。
  新 Transport 種別の追加に UI 改修は要らない。

---

## 2. Existing Japan Structure

| Region | stage | Areas | Spots (public/hidden) | 特徴 |
|---|---|---|---|---|
| tokyo-area（home） | playable | 4（東京/神奈川/千葉/埼玉） | 29（25/4） | 淡水〜湾奥〜相模湾。全 env 種、管理釣り場、カヤック |
| izu-peninsula | playable | 3 | 12（9/3） | 磯・サーフ・沖。Captain リョウ→潮目 Big Game |
| tohoku-pacific | playable | 3 | 9（7/2） | 磯・サーフ・渓流・三陸系 |
| hokkaido | playable | 4 | 11（8/3） | 渓流・湖・磯・沖。イトウ等固有種 |
| hokuriku-japan-sea | playable | 3 | 9（7/2） | 日本海・ノドグロ・冬 |
| okinawa | playable | 3 | 10（7/3） | リーフ・礁湖・GT。南方 Big Game |

- Japan Spot 合計: **80**（世界合計 150 の約半分）。
- Japan 参照 Species: **100 / 229**（Hokkaido/Okinawa 固有種あり、西日本海側の固有種はほぼ無い）。
- 国内遠征コスト実績: izu ¥44k / tohoku ¥58.5k / hokuriku ¥68k / hokkaido ¥68k / okinawa ¥88k。
- Charter: captain-taro(tokyo)/ryo(izu)/daisuke(hokkaido) + intel/introduce/discover 報酬網が稼働中。

---

## 3. Region 粒度の再検証（Rev.2 追加）

Region を増やす基準は地理ではなく
**progression / travel / fishing identity / access graph / content density / future expansion**。
「Region = 遠征単位 + 拠点 + Charter 営業範囲 + ClimateProfile」である点が効く:
Area にすると「その Area 内の Spot は Region 拠点から日帰り圏」になる。
**滞在型の島遠征は Area では表せず Region が必要**（拠点が島に移るため）。

### 3.1 重点ペアの判定

| ペア | 結論 | 理由 |
|---|---|---|
| goto-iki vs tsushima | **分離維持** | 遠征経路が別港（長崎〜福江 / 博多〜厳原）。五島は「列島＝複数島を跨ぐ磯ホッピング」、対馬は「単島＝対馬海流の速い潮と浅茅湾の静内海が同居」。access graph の形が違う |
| kii-peninsula 独立 | **維持** | 「本州のまま黒潮本流に最も近い」唯一の Region。本土遠征コストで沖 Big Game の入口。izu は「入門磯+東西海岸差」、kii は「黒潮フロンティア+熊野/紀ノ川の内陸渓流」で役割が違う |
| shikoku 独立 | **維持** | 「岬磯（足摺・室戸）+ 宇和内海 + 清流川（四万十）」の 3 面性。kii と黒潮磯は近いが、kii=沖向き（潮目・回遊魚）、shikoku=岸向き（磯師の聖地）+内海で釣り方が違う |
| sanin vs oki | **Region 維持（fallback あり）** | 隠岐を山陰の Area にすると拠点は本土のまま=「日帰りフェリー磯」になる。隠岐は島に滞在して磯を攻める遠征が identity なので Region 化。ただし content budget が厳しい場合の fallback: `sanin` 内の `oki` Area + ferry route（island_access）で表現可能（§3.3） |
| izu-peninsula vs izu-islands | **分離維持** | 半島=車/電車の本土磯（Early-Mid）、諸島=フェリー滞在型（Mid-Late）。「初の島遠征」の教習所として後者を置く |
| kyushu-north vs goto/tsushima | **分離維持** | 九州北部=本土拠点の日帰り圏（博多湾の穏 vs 玄界灘の荒のコントラスト）。五島・対馬は島遠征で Late。Access 階層が一段違う |
| kyushu-south / amami / okinawa / sakishima | **維持（序列は cost だけでなく機構で）** | 錦江湾(安定内湾)+日南/薩摩(外洋) → 奄美(本土種×南方種の混在帯=唯一) → 沖縄(リーフ+GT 入門) → 先島(最南端、宮古平坦リーフ vs 八重山ジャングル磯)。okinawa が amami より安い既存コストでも、先島は「本島からさらに離島 access」で一段上 |
| ogasawara | **「最難関」以上** | 難度ではなく**移動自体が壁**: 航空なし・25h フェリー・min nights 4+ で「行く覚悟」が gameplay。隔絶外洋の魚相は副産物 |

### 3.2 統合 fallback（content budget が厳しい場合）

優先度順に畳める設計にしておく（ID 削除ではなく Area 化 + stage 調整）:

1. `oki-islands` → `sanin` Region 内の `oki` Area（ferry route で表現、島滞在感は失う）
2. `tsushima` → `goto-iki` を `kyushu-islands` に改名し tsushima/iki/goto を Area 化
   （遠征経路が別港なので非推奨だが可能）
3. `shikoku` → `kii-peninsula` を `nanki-shikoku` に拡張（黒潮磯の近接）
4. `kyushu-north` + `kyushu-south` → `kyushu`（広すぎるため最後の手段）

**推奨は 19 Region のまま。** ただし実装順序で先に作る Region が決まれば、
後続は `stage:'planned'` のまま保留できるため爆発しない。

---

## 4. Proposed Japan Region Map（Rev.2 確定）

| # | RegionId | 名称 | 一意の gameplay（この Region で特に強く成立するもの） | 進行帯 |
|---|---|---|---|---|
| 1 | tokyo-area | 東京近郊 | 徒歩/電車/自転車だけで淡水〜汽水〜湾〜沖を一周できる唯一の home 圏 | Early |
| 2 | izu-peninsula | 伊豆半島 | 本土で最も早く磯+沖+Charter+人脈+潮目 Big Game に触れる導入 Region | Early-Mid |
| 3 | tohoku-pacific | 東北太平洋 | サケ・マスの季節性（遡上・北上）が最も強く出る冷水 Region | Early-Mid |
| 4 | hokkaido | 北海道 | 固有種（イトウ等）を持つ唯一の Region。滞在型大遠征 | Mid |
| 5 | hokuriku-japan-sea | 北陸・日本海 | 「冬が主役」の日本海入門（寒ブリ・ノドグロ・深場） | Mid |
| 6 | okinawa | 沖縄本島 | リーフと GT の入門（既存） | Mid-Late |
| 7 | setouchi | 瀬戸内海 | 「潮時・瀬・渡船」が釣り成立の主条件になる唯一の内海 | Mid |
| 8 | sanin | 山陰 | 「行ける日を読む」荒天攻略（windy/rain 重い気候 + season spot） | Mid |
| 9 | oki-islands | 隠岐諸島 | フェリー滞在型の「本土より一枚上の磯」 | Mid-Late |
| 10 | kii-peninsula | 紀伊半島 | 本州のまま黒潮本流に最も近い唯一の本土 Big Game 入口 | Mid-Late |
| 11 | shikoku | 四国 | 岬磯(岸)の聖地 + 宇和内海 + 清流川の 3 面同居 | Mid-Late |
| 12 | izu-islands | 伊豆諸島 | 初の本格島遠征（本土→船→島港→磯の多段 Access 雛形） | Mid-Late |
| 13 | kyushu-north | 九州北部 | 博多湾(穏)と玄界灘(荒)が同一 Region に同居するコントラスト | Mid |
| 14 | kyushu-south | 九州南部 | 錦江湾(活火山の内湾) + 日南/薩摩外洋。南西諸島の玄関 | Mid-Late |
| 15 | goto-iki | 五島・壱岐 | 列島を跨ぐ磯ホッピング（島内移動自体が探索） | Late |
| 16 | tsushima | 対馬 | 対馬海流の速い潮 + 浅茅湾の静内海の極端な同居 + 国境の遠さ | Late |
| 17 | amami | 奄美 | 本土種と南方種が混在する唯一の移行帯 | Late |
| 18 | sakishima | 宮古・八重山 | 国内最南端のリーフ/外洋。宮古(平坦リーフ) vs 八重山(ジャングル磯) | Late |
| 19 | ogasawara | 小笠原 | 移動自体が最大の壁（25h フェリー・min nights 強制・隔絶外洋） | Endgame |

**合計 19 Region（既存 6 + 新規 13）。** 未実装は `stage:'planned'` で先行宣言可。

---

## 5. Region → Area Hierarchy

Area は「行動・釣り方・Access が変わる単位」。地図上の市区町村分割にしない。

### setouchi（瀬戸内海）
- `setouchi-urban` 都市港湾帯 — 公共交通で行ける基礎圏
- `setouchi-islands` 島嶼部 — **渡船（ferry）Access が主題**
- `setouchi-straits` 潮流の速い瀬（鳴門/来島/関門系）— 潮時必須
- `setouchi-open` 外海境界（豊後水道/紀伊水道口）— 沖・大物気配

### sanin（山陰）
- `sanin-east` 東部磯・港（鳥取〜島根東部）
- `sanin-west` 西部日本海（島根西部〜山口日本海側）
- `sanin-winter` 冬の日本海（season 条件 Spot を集約）

### oki-islands（隠岐）
- `oki-port` 島前/島後の港 — フェリー到着点・拠点
- `oki-rocks` 地磯・沖磯 — 磯 Access 主題
- `oki-offshore` 沖の瀬 — Charter 限定

### kii-peninsula（紀伊半島）
- `kii-ise` 伊勢・志摩側（湾内・英虞湾系）
- `kii-nanki` 南紀（串本・那智勝浦の黒潮磯/沖）
- `kii-inland` 内陸渓流（紀ノ川〜熊野川系）

### shikoku（四国）
- `shikoku-uwakai` 宇和海（湾内・養殖縁・磯）
- `shikoku-capes` 岬磯（足摺・室戸）
- `shikoku-rivers` 四万十・仁淀川系（清流）

### izu-islands（伊豆諸島）
- `izu-oshima` 大島（最も近い島、基礎島遠征）
- `izu-south-isles` 八丈・三宅系（遠い島、大型魚の気配）
- `izu-isle-offshore` 島の沖（Charter・カツオ/近海）

### kyushu-north（九州北部）
- `kyushu-hakata` 博多湾・都市港湾
- `kyushu-genkai` 玄界灘（磯・荒い外海）
- `kyushu-west-coast` 西海岸（平戸〜島原側）

### kyushu-south（九州南部）
- `kyushu-kinko` 錦江湾（桜島の内湾、安定圏）
- `kyushu-nichinan` 日南海岸（サーフ・磯）
- `kyushu-satsuma` 薩摩外洋（甑島・沖の気配）

### goto-iki（五島・壱岐）
- `goto-port` 福江島の港 — 拠点
- `goto-rocks` 上五島〜下五島の磯群（島内移動で磯を跨ぐ）
- `iki-island` 壱岐
- `goto-offshore` 沖の瀬・オフショア

### tsushima（対馬）
- `tsushima-north` 上対馬（厳原・外洋側磯・対馬海流）
- `tsushima-south` 下対馬（浅茅湾の複雑な内海）
- `tsushima-offshore` 対馬海流の沖

### amami（奄美）
- `amami-north` 奄美北部（空港・港・湾内）
- `amami-south` 奄美南部（磯・リーフ縁・混在魚相）
- `amami-outer` 沖磯・離島

### sakishima（宮古・八重山）
- `sakishima-miyako` 宮古島（平坦リーフ・砂浜・磯）
- `sakishima-yaeyama` 八重山（石垣・西表の磯/河口/ジャングル）
- `sakishima-blue` 外洋・沖の瀬（Charter 必須の本番水域）

### ogasawara（小笠原）
- `ogasawara-chichijima` 父島（港・岸・湾内 — 25h フェリーの到着点）
- `ogasawara-rocks` 父島の磯・無人島際
- `ogasawara-open-sea` 外洋（カツオ・シイラ・外洋 Big Game 本番）

---

## 6. Spot Archetype Plan

**語彙制約（§11-2）**: environment は当面、既存 8 語彙
（`river / canal / estuary / lake / bay_shore / nearshore / offshore / managed_pond`）を再利用する。
磯は `bay_shore`+`habitatTags`、サーフは `nearshore`+tags、瀬は `nearshore`+`current:strong` のように
**habitatTags / current / depth / fishingZones で差別化**する。

### 6.1 habitatTags 統制語彙（Rev.2 追加）

open string の乱立を防ぐため、Bible では以下の語彙だけを使う（追加は設計レビュー経由）:

- 地形: `harbor`, `urban`, `wall`, `rock`, `reef`, `tidepool`, `sand`, `surf`, `flat`,
  `mud`, `island`, `remote`, `cape`, `channel`, `river`, `stream`, `mountain`, `lake`,
  `reservoir`, `pond`, `managed`, `lagoon`, `coral`, `mangrove`, `estuary`
- 水: `brackish`, `fresh`, `cold_water`, `warm_water`, `subtropical`, `deep`, `shallow`
- 流れ・沖: `tide_race`, `current_edge`, `offshore`, `open_water`, `blue_water`, `pinnacle`, `bank`, `ridge`
- 人為・制度: `ferry_served`, `charter_only`, `permit_required`

### 6.2 日本各地の表現検証（Rev.2 追加）

| 表現したいもの | 既存 schema での表現 |
|---|---|
| 瀬戸内の強潮流 | `nearshore` + `[tide_race, channel]` + `current.preference:'strong'` + fishTable の tide 依存（rising/falling で効く魚） |
| 山陰の荒磯 | `bay_shore` + `[rock, cape, cold_water]` + ClimateProfile の `weatherWeights.windy/rain` を重く + （配線後）`access.season` で冬限定 Spot |
| 北海道の冷水域 | ClimateProfile `annualMeanWaterC` 低め + species の `temperatureRange` 低域 + `river/lake` env |
| 奄美の亜熱帯 | `annualMeanWaterC` 高め・`seasonalSwingC` 小 + `[subtropical, reef]` + 本土種×南方種の混在 fishTable |
| 沖縄/先島の reef | 既存 okinawa 踏襲: `bay_shore`/`nearshore` + `[reef, lagoon, coral]` + `[reef_edge]` |
| 小笠原の外洋 | `offshore` + `[open_water, blue_water]` + 深い `depthRangeM` + `current:strong` |
| 深場 | `offshore` + `[deep, ridge]` + `depthRangeM:{min:80,max:200}` 等 + DepthCapability でタックル側を絞る |
| 渡船の島 | `bay_shore`/`nearshore` + `[island]` + route `transportTypes:['ferry']` + `requiredCapabilities:['island_access']`（§8-2） |

**結論: 日本各地の表現は既存 env 語彙 + habitatTags + current/depth/season/climate で足りる。
新しい WaterKind / Environment schema は不要**（§11-2 の任意拡張のみ残る）。

### 6.3 Archetype 一覧

| Archetype | environment | 典型 habitatTags | Access 傾向 | Progression role |
|---|---|---|---|---|
| Urban Harbor / Canal | bay_shore / canal | harbor, urban, wall | reachable_on_foot / public_transport | Early の顔 |
| Estuary Flat | estuary | brackish, flat, mud | public_transport / road_access | 汽水種・夜釣り |
| Surf Beach | nearshore | sand, surf | road_access / public_transport | ヒラメ・キス・回遊 |
| Rocky Shore（地磯） | bay_shore | rock, reef, tidepool | road_access / rough_road | 磯釣りの基礎 |
| Remote Rock（沖磯） | nearshore | rock, remote, island | island_access / boat_required + relationship 可 | Trust のご褒美 |
| Tide Race（瀬） | nearshore | tide_race, channel | boat_required or 磯 Access + tide 依存 | 瀬戸内の主題 |
| Offshore Bank / Grounds | offshore | offshore, bank | boat_required + offshore | 沖釣り標準 |
| Current Edge / Pinnacle | offshore | offshore, current_edge, pinnacle | charter + relationship + offshore | Big Game 水面 |
| Island Shore | bay_shore / nearshore | island, rock | island_access（ferry or boat） | 島遠征の着地 |
| Deep Ridge | offshore | deep, ridge | offshore + 大容量タックル推奨 | Endgame 沖 |
| River / Stream | river | river, stream, mountain | public_transport / road_access / rough_road | 淡水層 |
| Lake / Reservoir | lake | lake, reservoir | road_access | 淡水・ボート可 |
| Managed Pond | managed_pond | managed, pond | reachable_on_foot + permit | 初心者救済 |

Spot 配置ポリシー:
- 各 Region: public 4〜7 + hidden 1〜3（hidden は必ず discover_spot reward + fishingZones）。
- offshore / island / relationship-gated は Region identity に応じて配分。
- Phase 16 以降 Region は wild public spot に fishTable 4+ が機械強制されるため
  各 Spot の bycatch を Region 内で設計する（§9）。

---

## 7. Transport / Access Graph

### 7.1 既存機構の再利用マッピング

| やりたいこと | 使う機構 | 現状 |
|---|---|---|
| 日帰り移動（港/磯/川） | Spot.travelOptions × TransportDefinition | OK |
| 本土→遠征先（拠点移動） | ExpeditionDefinition | flight 固定 → §8.1 で一般化 |
| 島の港→島内 Spot | travelOptions（walk/public/rental） | OK |
| 港→島の磯（渡船） | ferry transport（§8.2）+ island_access route | 要 ferry 追加 |
| 本土/島の港→沖磯・沖 | rental_boat / charter（boat_required, offshore） | OK |
| Charter が現地限定 | serviceRegionIds + operatorContactId + knownContactIds | OK |
| 「人を介して場所を知る」 | introduce_contact → discover_spot → discoveredSpotIds | OK |
| 「人を介して行ける」 | access relationship（Trust 閾値） | OK |
| 「許可が要る」 | permit requirement + ExpeditionPermit | OK |
| 「行ける日を読む」 | SeaState → MarineReadiness（船系） / access season | season は §8.3 で配線 |
| 「潮時が効く」 | FishOccurrence.tide + Spot current | OK |
| 段階的島遠征 | expedition → base → ferry/island_access route → spot → contact → hidden | ferry 追加後 OK |

### 7.2 代表 Access Graph（実例化）

**瀬戸内 島嶼部**:
`base（本州側港）→ ferry route → 島の港 Spot → local_fisher contact → Trust → 沖磯/瀬 hidden`

**五島**:
`expedition（長崎〜福江 ferry/rail）→ goto-port → 地磯 → guide/captain Trust → remote rock / offshore`

**対馬**:
`expedition（博多〜厳原 ferry）→ tsushima-south 内海 → 上対馬磯 → 対馬海流沖（Charter + relationship）`

**小笠原**:
`expedition（竹芝〜父島 25h ferry、min nights 4〜6）→ 港/岸 → 地磯 → Captain Trust → 外洋 Big Game ground`

**隠岐**:
`expedition（境港/七類〜隠岐 ferry）→ 港 → 地磯 → 沖磯（渡船/Charter）→ 隠岐沖 hidden`

**紀伊**:
`expedition（南紀 drive/rail）→ kii-nanki 磯 → 那智勝浦系沖（Charter）→ 黒潮 current edge hidden`

---

## 8. Schema Gaps と最小変更（Rev.2 で確定）

**いずれも Save schema（v9）には触れない**（全て Content/Domain の additive 拡張）。

### 8.1 Expedition journey 一般化（必要・最小）

現状 `flight` 固定で、航空以外（国内フェリー・特急・車）を表現できない。
特に**小笠原・隠岐・対馬・伊豆諸島・五島はフェリーが本筋**であり、flight 偽装は破綻する。

**最小変更案（採用）**:
- `ExpeditionDefinition.flight` → `journey` に改名（形状は同一: `{kind, name, oneWayCostYen, oneWayMinutes}`）。
- `FLIGHT_TYPES` → `JOURNEY_KINDS` へ拡張:
  `domestic_flight / international_flight / ferry / rail / drive`。
  - `overnight_ferry` / `long_distance_ferry` は kind を増やさず `oneWayMinutes` で表現
    （25h なら 1530 分。区別は `name` と minutes が担う）。
  - `mixed journey`（電車→フェリー等）は**作らない**。1 leg の合算 cost/minutes で表現
    （乗継・路線探索は設計非対象）。
- `planExpedition` の参照を `definition.journey` に改めるだけ。`ExpeditionPlan` /
  `ActiveExpedition` の保存フィールドは不変（journey kind は Save に載らない）。
- 既存 13 件の expedition JSON は `flight` → `journey` + kind を既存値に写す機械的移行。
- UI（ExpeditionScreen）は `journey.name`/`oneWayCostYen`/`oneWayMinutes` を読むだけ。
- 影響面: Expedition.ts / content/schema/expedition.ts / ExpeditionScreen.tsx /
  simulate-world-expansion.ts / 13 JSON / 関連テスト。**後方互換は Content 改名で担保**
  （Save 非影響・既存挙動は同一値を保持）。

### 8.2 ferry TransportType（追加する — 比較検討済み）

**既存 boat 系で代用した場合の問題**:

| 観点 | boat 系代用 | ferry TransportType 追加 |
|---|---|---|
| semantics | 「渡船」が rental_boat/charter_boat に偽装される。船長の船≠定期渡船 | 定期渡船として正確 |
| access | ferry が `boat_required`/`offshore` を満たしてしまい、港→沖磯が誤許可 | ferry は `public_transport + island_access` のみ供給。`boat_required`/`offshore` は満たさない＝「港までしか行かない」が正しい |
| cost | rentalCost/チャーター料の語彙に歪む | route の `baseOneWayCost` を運賃として使える（route_fare） |
| travel time | 問題ない | 同じ（baseMinutes × modifier） |
| UI | `transportName` 表示のため「渡船」名を出せるが型が嘘 | `transportName: '渡船'` で自然。UI 改修不要 |
| future content | Region ごとの渡船（`serviceRegionIds`）を安全に増やせる | 同じく可能かつ semantic が保たれる |

**採用**: `TRANSPORT_TYPES` に `ferry` を additive 追加 + generic `island-ferry`
TransportDefinition（`always_available`, `public_transport + island_access`,
`boatCapability:'none'`, `route_fare`）。島岸 Spot の route は
`transportTypes:['ferry']` + `requiredCapabilities:['island_access']`。

### 8.3 access.season の配線（必要・最小）

- **実態**: `month` が evaluateAccess に渡らず常に satisfied（dead）。
  使っている Spot は 0 件。
- **変更**: `worldSession.leaveForSpot` 内で `month: world.time.month` を evaluateAccess に渡す
  （**署名変更なし**。playerStore も変更不要）。
- **往路のみ**適用し、**帰路（leaveSpot）には渡さない**: 月末跨ぎの釣行で帰れなくなる
  edge case を防ぐ（帰路は season を再評価しない）。
- **Save**: 影響なし（永続フィールド追加なし）。
- **決定性**: 使うのは**ゲーム内 `world.time.month`**。実世界の日付・timezone には依存しない。
  決定論的 simulation の `WorldTime` に従うため再現性は維持される。
- **既存 content 副作用**: 0 件しか使っていないため挙動変化なし。
- **用途**: 山陰の冬限定 Spot・北陸/東北の季節 Spot 等。「行ける月を読む」を Access で表現。

### 8.4 使わない/触らないもの

- `access.reputation` は dead のまま**使用禁止**（将来 Reputation 実装時まで Spot に書かない）。
- 新しい WaterKind / 複数 HOME / 実道路 routing / 予約システム / 実気象は作らない。
- `waterKindOf` の saltwater 語彙登録は**任意**（§6.2 の通り habitatTags 運用で足りるため）。

---

## 9. Progression Graph（Rev.2 詳細化）

Level 非依存の設計制約上、進行は「**資金 × 移動時間 × 移動手段 × 人脈 × Knowledge × 水深**」で組む。
一本道にしない：複数の遠征ルートを Early から分岐させる。

### 9.1 難度のメカニズム（「強い魚がいるから Late」ではない）

| 進行帯 | 主な壁 |
|---|---|
| Early | 徒歩/電車/自転車で完結。資金不要。Knowledge 蓄積のみ |
| Early-Mid | 初遠征（¥44〜70k）。rental_car / charter の初利用。Captain/人脈の導入 |
| Mid | 遠征 ¥60〜90k + 滞在泊数 + ferry/渡船 + 天候・季節を読む + offshore 船の初要求 |
| Mid-Late | 島遠征（滞在型）+ Charter Trust 編 + hidden Spot discovery + 深場 tackle |
| Late | 高コスト島遠征（¥90〜150k）+ relationship ゲートの沖/磯 + Big Game tackle |
| Endgame | 長時間移動（25h）+ min nights + 高 Trust + 外洋 + Big Game record 挑戦 |

### 9.2 5 ルート分岐

```
Early（home）
  tokyo-area … 徒歩/電車/自転車/管理釣り場/カヤック
    │
Early-Mid（¥44〜70k。Charter/人脈/季節の導入）
  ├─ izu-peninsula ……… 磯+沖+Captain リョウ（潮目 hidden）
  ├─ tohoku-pacific …… 三陸磯・渓流・季節のサケ/マス
  ├─ hokuriku-japan-sea  日本海の顔・冬の強み・深場導入
  ├─ setouchi ………… 潮読み・渡船（ferry 追加の主題 Region）
  ├─ sanin …………… 荒天攻略（行ける日を読む）
  ├─ kii-peninsula …… 本州のまま黒潮。本土 Big Game 入口
  └─ kyushu-north …… 博多湾(穏)/玄界灘(荒)コントラスト
    │
Mid（¥68〜95k + 滞在/船/天候）
  ├─ hokkaido …………… 固有種・大遠征・内陸/沿岸の広さ
  ├─ shikoku …………… 岬磯+宇和内海+清流の 3 面
  ├─ okinawa …………… リーフ・GT 入門（既存）
  ├─ kyushu-south …… 錦江湾+日南/薩摩。南西諸島の玄関
  └─ izu-islands ……… 初の本格島遠征（多段 Access 雛形）
    │
Mid-Late / Late（島・沖 ¥90〜150k + Trust/discovery/depth）
  ├─ oki-islands ……… フェリー滞在型の磯（sanin からの派生も可）
  ├─ goto-iki ………… 列島磯ホッピング（島内移動が探索）
  ├─ tsushima ………… 対馬海流+浅茅湾の極端同居
  ├─ amami …………… 本土×南方の混在帯
  └─ sakishima ……… 最南端リーフ/外洋（okinawa からさらに一段）
    │
Endgame（国内最難度 ¥200k+ / 長時間 / 高 Trust / 外洋）
  └─ ogasawara ……… 25h ferry・min nights・Captain・外洋 Big Game
```

### 9.3 一本道でないことの保証

- **expedition には前提条件が存在しない**（sequential unlock 機構は無い）。
  順序は**コスト・min nights・Spot 側の knowledge/relationship/capability 条件**が作る soft order。
- 5 つの独立ルート（太平洋/北/日本海/西/南）が Early-Mid で分岐し、
  Endgame（ogasawara）だけが収束点。各ルートは途中で合流・迂回可能。
- 例: `tokyo → setouchi → kyushu-north → goto-iki` と `tokyo → sanin → oki` は
  同じ Mid-Late 帯で別 access graph を経る。

---

## 10. Fish / Season Matrix（設計配置・実装しない）

既存 Species ID 優先。**新種は実装しない**（future candidate として分離）。

| Region | representative（既存ID） | target class | bycatch（既存ID） | seasonality 方針 | method 傾向 |
|---|---|---|---|---|---|
| setouchi | madai, kurodai, tachiuo, sawara | 湾内中型〜瀬の真鯛 | kamasu, maaji, sappa, konoshiro | 春マダイ/秋タチウオ/冬カワハギ系 | bottom, bait, light_lure, tai_rubber |
| sanin | nodoguro, ainame, kurosoi, buri(寒) | 日本海根魚・寒ブリ | hatahata, hokke, mebaru, kasago | 冬が主役（荒天×旬） | bottom, bait, offshore_casting |
| oki-islands | hiramasa, ishidai, mejina | 磯の大型ヒラマサ/イシダイ | kurodai, kijihata, aohata, maaji | 夏〜秋の磯、冬は荒天 | lure, offshore_casting, bait |
| kii-peninsula | katsuo, hiramasa, kanpachi | 黒潮回遊魚・磯大物 | mejina, kamasu, isaki, muroaji | 夏〜秋カツオ、周年ヒラマサ | offshore_casting, lure, live_bait_drift |
| shikoku | mejina, ishidai, hiramasa | 岬磯のフカセ/大物 | kurodai, sawara, maaji, isaki | 春秋の磯、夏の沖 | lure, bait, offshore_casting |
| izu-islands | katsuo, hiramasa, mejina, mahi-mahi | 島磯・近海回遊 | kijihata, muroaji, kamasu, surgeonfish | 夏〜秋が旬、冬は風 | lure, offshore_casting, live_bait_drift |
| kyushu-north | kurodai, madai, hiramasa | 玄界灘磯・湾内 | kamasu, sawara, maaji, sappa | 春秋主体、冬ブリ気配 | bait, lure, bottom |
| kyushu-south | kanpachi, hiramasa, sawara | 錦江湾・日南磯 | kamasu, maaji, kijihata, isaki | 周年、夏のカンパチ | lure, offshore_casting, bait |
| goto-iki | hiramasa, ishidai, kanpachi, kijihata | 磯/沖の上位魚 | kurodai, aohata, maaji, mejina | 秋〜冬磯、夏沖 | lure, offshore_casting, vertical_jigging |
| tsushima | buri, hiramasa, ishidai | 対馬海流の大型 | kurodai, kijihata, maaji, kamasu | 冬ブリ、春秋ヒラマサ | lure, offshore_casting, vertical_jigging |
| amami | aohata, kijihata, maaji, surgeonfish | 亜熱帯混在磯/リーフ縁 | menada, takasago, datsu, budai | 周年、夏リーフ | bait, lure, light_lure |
| sakishima | GT系, red-emperor, longtail-tuna, datsu | 南方リーフ/外洋 | takasago, hamafuefuki, coral-trout, onikamasu | 周年、夏本番 | offshore_casting, lure, trolling |
| ogasawara | katsuo, mahi-mahi, bigeye-trevally, GT系 | 外洋 Big Game | muroaji, surgeonfish, kijihata | 夏カツオ/シイラ、周年外洋 | offshore_casting, trolling, live_bait_drift |

**Future content candidates（この Phase では作らない）**:
- キンメダイ / ムツ系（深場・隠岐/北陸/小笠原沖の character）
- クエ（九州・南西諸島の超高級根魚）
- ヒラスズキ（磯スズキ、山陰/四国/九州）
- 本マグロ / キハダ / カジキ類（黒潮・小笠原・対馬海峡の外洋 Big Game）
- アオリイカ・コウイカ系（瀬戸内/日本海の秋〜春。eging method 候補）
- イトヨリ/レンコダイ系（九州・瀬戸内の沖 bycatch）
- 沖縄深場系（アカマチ/ハマダイ相当。sakishima の character）

新 Species を実装する時は Species JSON + **SpeciesTradeProfile** + distribution 更新がセット。

---

## 11. Existing Systems Reuse Plan

新しい authority / 永続 state を**作らない**前提で全要素をマッピングする。

| World 要件 | 再利用する既存機構 | 追加 Content |
|---|---|---|
| Region 追加 | RegionDefinition + areas + base + climate | regions/*.json |
| 遠征 | ExpeditionDefinition（**journey 化後**）+ lodgings + nights + permit | expeditions/*.json |
| Spot | FishingSpot（environment/access/travelOptions/fishTable/zones/visibility） | fishing-spots/*.json |
| 島 Access | island_access capability + travelOptions + ferry transport（§8.2） | transports + routes |
| 人脈→場所 | Contact + ContactReward(introduce/discover) + discoveredSpotIds | contacts + contact-rewards |
| 人脈→乗船 | charter operatorContactId + serviceRegionIds + Trust | transports + contacts |
| 季節 | FishOccurrence.season/tide/time + （配線後）access.season | fishTable / access 値 |
| 海況で行けない | SeaState → MarineReadiness（船系のみ） | ClimateProfile 調整のみ |
| 水深/深場 | depth profile + fishingZones + DepthCapability | Spot depth/zone 値 |
| Big Game 化 | hidden + offshore + relationship + Charter + FightCapability | Spot/access/reward |
| 許可 | permit requirement + ExpeditionPermit | expedition permit + spot access |
| Knowledge ゲート | access knowledge (spot/region) | Spot access 値 |

結論: **World 設計の大部分は既存 schema で表現できる**。新規 Domain 変更は
§8.1（journey）・§8.2（ferry）・§8.3（season 配線）の 3 件のみで、全て additive。

---

## 12. Save Compatibility Risks

- 本計画は **Content 追加が主体**。Save schema v9 は維持可能。
- `world.discoveredSpotIds` / `visitedRegionIds` / `permits` / `contactTrust` /
  `claimedRewardIds` は全て ID リスト駆動で additive に安全。
- 唯一の注意点:
  - `world.currentRegionId` に新 Region が入るのは自然（RegionId は string ラップ）。
  - 進行中の遠征（ActiveExpedition）が旧 definitionId を指すケースは
    Content 削除をしない限り発生しない（**定義 ID は削除しない**運用を徹底）。
  - §8.1 の journey 改名は ActiveExpedition の保存フィールドに影響しない
    （journey kind を保存していないため）。
  - §8.3 の season 配線は永続 state を増やさない。
- 結論: **v9 維持のまま実装可能**。Domain 拡張があっても schema bump 不要。

---

## 13. Content Scale Estimate（Rev.2: min / target / upper）

| 項目 | minimum | target | upper-bound | 備考 |
|---|---|---|---|---|
| RegionDefinition | +13 | +13 | +14 | sakishima 分割時のみ +1 |
| RegionArea | +26 | +39 | +60 | Region あたり 2 / 3 / 4〜5 |
| ExpeditionDefinition | +13 | +13 | +14 | playable Region は必須 |
| FishingSpot | +65 | +91 | +130 | Region あたり 5 / 7 / 10 |
| Hidden Spot（内訳） | +13 | +26 | +39 | Region あたり 1 / 2 / 3 |
| TransportDefinition | +9 | +16 | +26 | generic ferry 1〜2 + Region charter 7〜12 + 地域 rental/小型船 |
| ContactDefinition | +13 | +26 | +40 | Region あたり 1 / 2 / 3 |
| ContactReward | +20 | +50 | +80 | hidden × discover + introduce + intel |
| BuyerDefinition | +13 | +20 | +30 | Trust 稼ぎ入口として Region あたり 1〜2 |
| 新 Species | 0 | 0 | 0 | 今期は 0（§10 下段は将来候補） |
| SpeciesTradeProfile | 0 | 0 | 0 | 新 Species 0 のため |
| fishTable occurrence 行 | +325 | +455 | +650 | Spot × ~5 件の occurrence |

- **target 時の世界合計**: Region 27 / Spot 約 240（既存 150 + 約 90）/ Species 229（不変）。
  「数百〜1000+ Spot に耐える」設計内で、**content 爆発にはならない**。
- bundle 影響: Region pack は lazy のため **boot gzip は不変**。total JS は Region あたり
  約 20〜45kB 増（target で +300〜600kB）だが pack 分割で吸収可能。

---

## 14. Phase 19A / 19B Boundary 確定（Rev.3）

- **Phase 19A**: World skeleton + 最小基盤変更のみ。**pilot Region は含めない**。
- **Phase 19B**: 最初の Region vertical slice。第一候補は **setouchi**
  （ferry / island_access / public transport / current / tide / hidden / Trust /
  Discovery / Charter を 1 Region で広く検証できるため）。

### Phase 19B への明示的な implementation requirement（19A review の引継ぎ）

- **`island-ferry` の available 化**: `island-ferry` は `always_available` だが
  `INITIAL_AVAILABLE_TRANSPORT_IDS` に未登録のため、19B で ferry route を使う Spot を
  追加する際は、プレイヤーの `availableTransportIds` に `island-ferry` を入れる措置が
  必須（route が存在しても未登録だと `not_available` で option に出ない）。
  19A では意図的に変更していない（ferry route 0 件のため無影響）。

---

## 15. Gate 1 — `stage:'planned'` の実挙動（実コード追跡済み）

`RegionDefinition → contentLoader → content-index → runtime pack → UI selector` の
参照経路を追跡した結果。**推測ではなくコード上の事実**。

| Surface | planned 表示 | 根拠（実コード） | 19A への影響 |
|---|---|---|---|
| World Map / Region selector | **非表示** | `MapScreen.tsx:115` `stage==='playable' \|\| id===currentRegionId` で filter | なし |
| Expedition destination list | **非表示** | `ExpeditionScreen.tsx:124` destinations は `expeditions` から構築。planned Region に expedition を置くと `references.ts:336` で ERROR（"region is not playable"） | なし（planned に expedition を置かない規約で担保済み） |
| Spot selector / Spot 画面 | **到達不能** | Spot は region pack 経由でしか読み込まれず、planned Region は pack を持たない。Domain 側も `leaveForSpot` が `not_in_region` で拒否 | なし |
| Home / Fishing UI | **非表示** | `world.currentRegionId` のみ参照。planned へは `moveToRegion`（expedition 経由）が存在しない | なし |
| Codex の Region セクション | **非表示** | `CodexScreen.tsx:66` `stage==='playable'` filter | なし |
| Contacts / Trade / FishBox | **非表示** | `useRegionPack(currentRegionId)` のみ。planned は current に成り得ない | なし |
| contentRuntime.ensureRegion(planned) | **安全な no-op** | `findPackForRegion`→undefined + species pack なし → `Promise.all([])` で即解決 | なし |
| content-index の RegionSummary | 掲載（packKey=null） | `build-content-index.ts` は全 Region を summary に載せる。表示ではなく index metadata | なし |
| species.distribution に planned Region を書いた場合 | 図鑑の地名表示に出得る | `CodexScreen` の region 名 map は全 Region から構築 | **規約**: playable 昇格まで species.distribution に planned Region を書かない |

### Gate 1 判定: **A — planned は既に非表示**

- **追加の filter 実装は不要**。
- **重要な派生制約**: `stage:'planned'` の Region は **definition-only** でなければならない。
  Spot / Buyer / Contact / ContactReward / Expedition を持つと pack 未所有の orphan として
  `validate-content` / `scaleCheck` が ERROR を出す（`scaleCheck.ts:334` (orphan) / `references.ts:336` (not playable)）。
  したがって 19A の skeleton は **Region JSON（id/name/areas/base/climate/stage）のみ**。

---

## 16. Phase 19A — Final Scope（確定）

### Must

1. **Japan planned Region skeleton**: 新規 13 Region の RegionDefinition
   （`stage:'planned'`、id/name/areas/base/climate のみ。Spot/Expedition/Contact/Buyer は置かない）
2. **Expedition flight → journey 一般化**（§8.1）
3. **`ferry` TransportType 追加**（§8.2）
4. **generic `island-ferry` TransportDefinition** 追加
5. **game-month → access.season 配線**（§8.3、往路のみ）
6. `npm run content:index` 再生成 + `npm run check` 全緑
7. Bible（本書）コミット

（Gate 1 の結果、「planned Region visibility safety」の追加実装は**不要**と確定。）

### Explicitly NOT in 19A

- Setouchi Spot 実装 / いかなる Region の `playable` 昇格
- Region 固有 Fish distribution / 新 Species / 新 method
- Captain / Contact / hidden Spot / reward 網の新規追加
- Region balance / World economy rebalance
- 新しい progression system / mixed-leg journey / real-world date-time 依存
- Save version bump / 既存 ID の削除・変更

### Expected changed files

- `src/domain/expedition/Expedition.ts` — `ExpeditionFlight` → `ExpeditionJourney`、
  `FLIGHT_TYPES` → `JOURNEY_KINDS`（+ferry/rail/drive）、`flight` → `journey`、planExpedition 更新
- `src/domain/expedition/index.ts` — export 名更新
- `src/domain/expedition/expedition.test.ts` — journey 参照更新
- `src/content/schema/expedition.ts` — `flight` → `journey`（zod、`transportType`→`kind`）
- `src/ui/expedition/ExpeditionScreen.tsx` — `definition.journey.*` 表示
- `scripts/simulate-world-expansion.ts` — journey 参照 + レポートの flightType 表記
- `src/domain/access/Transport.ts` — `TRANSPORT_TYPES` に `ferry` 追加
- `src/content/schema/transport.ts` — `transportTypeSchema` は enum 自動追従（変更不要の見込み。確認のみ）
- `src/content/data/transports/island-ferry.json` — 新規（`transportType:'ferry'`,
  `ownershipModel:'always_available'`, `capabilities:['public_transport','island_access']`,
  `boatCapability:'none'`, `launchCapability:'none'`, `travelCostModel:'route_fare'`）
- `src/domain/access/accessEngine.test.ts` — ferry の capability semantics テスト
- `src/domain/world/worldSession.ts` — `leaveForSpot` で `month: world.time.month` を
  evaluateAccess に渡す（**往路のみ**。`leaveSpot` は渡さない）
- `src/domain/world/worldSession.test.ts` — season gate テスト
- `src/content/data/regions/{setouchi,sanin,oki-islands,kii-peninsula,shikoku,izu-islands,
  kyushu-north,kyushu-south,goto-iki,tsushima,amami,sakishima,ogasawara}.json` — 新規 13 件
- `src/content/data/expeditions/*.json` ×13 — `flight` → `journey` 機械移行
- `src/content/generated/*` — `npm run content:index` 再生成
- `docs/JAPAN_WORLD_DESIGN_BIBLE.md` — 本書

### Data migration（既存 13 Expedition JSON）

```diff
-  "flight": {
-    "transportType": "domestic_flight",
+  "journey": {
+    "kind": "domestic_flight",
     "name": "国内線 東京→伊豆",
     "oneWayCostYen": 14000,
     "oneWayMinutes": 90
   }
```

- 全 13 件で `flight` → `journey`、`transportType` → `kind` の機械的改名のみ。
- **cost / minutes / nights / lodgings / permit は一切変更しない**（値の同一性を diff で検証）。

### Compatibility invariants

- Save v9 維持（journey kind / ferry type / season month は永続化されない）
- 既存 Expedition の cost / travel time / nights / permit 不変
- 既存 Region / Spot の access・表示・挙動 不変
- 既存の expedition 表示（名称・往復料金・移動時間）不変（フィールド名のみ変更）
- 決定論的 simulation 維持（month は `world.time` = ゲーム内時計由来。実世界日時・timezone 非依存）
- `leaveSpot`（帰路）に month を渡さない（月末跨ぎで帰れなくなる edge を防ぐ）

### Tests required

| 観点 | テスト |
|---|---|
| journey schema | zod が `journey` を受理し `flight` を拒否（strictObject） |
| 既存 expedition 互換 | 13 件全てが同じ totalCost / minutes を plan する回帰 |
| ferry semantics | ferry は `public_transport` と `island_access` を満たす |
| ferry 非該当 | ferry は `boat_required` / `offshore` を満たさない |
| ferry route | `transportTypes:['ferry']` + `requiredCapabilities:['island_access']` の route が解決される |
| season allowed | `access.season` に今月を含む Spot へ行ける |
| season denied | 含まない月は `inaccessible` + 季節外ラベル |
| 帰路 regression | season Spot への帰路は常に許可（月末跨ぎ edge） |
| planned visibility | planned Region が Map selector / expedition destinations に出ない |
| planned 制約 | planned Region に Spot/Expedition を置くと validation error |
| existing Spot regression | 既存 Spot の access 解決が不変（month 配線後も同一） |
| content validation | `npm run validate:content` + scale check 全緑 |
| 総合 | `npm run check` 全緑 |

### Main risks

- journey 改名の参照漏れ → 型エラーが機械的に拾う（tsc）。参照点は 5 箇所 + 13 JSON と小さい
- planned Region に誤って Spot 等を置くと validation error → 運用ルール §17 で禁止済み
- ferry enum 追加による zod / UI への波及 → `transportName` 表示のため UI 改修なし。
  shop-items で ferry を売らない（always_available のため購入導線不要）

---

## 17. 運用ルール（実装時の共通規約）

- **RegionId/SpotId/AreaId/SpeciesId は削除しない**（進行中 Save の参照切れ防止）。
- hidden Spot は必ず `discover_spot` reward + 明示 `fishingZones`。
- `access.reputation` は**使用しない**（dead）。`access.season` は §8.3 配線後に限り使用可。
- 新 env 語彙は §6.1 の habitatTags 統制語彙で表現する（waterKindOf 未登録語彙は潮を消す）。
- Species の新規追加はこの Bible の対象外（future candidate として管理）。
- Charter/ferry は `serviceRegionIds` で営業範囲を必ず宣言する。
- Region 追加は `stage:'planned'` → Spot/Expedition 完備後に `playable` 昇格を徹底。
- **`stage:'planned'` Region は definition-only**：Spot / Buyer / Contact / ContactReward /
  Expedition を置かない（Gate 1 で確認済み — pack 未所有の orphan error になる）。
- **`species.distribution` に planned Region を書かない**（図鑑の地名表示に出るため。
  playable 昇格と同時に書く）。
- 遠征 journey は 1 leg のみ（multi-leg は設計非対象）。

---

## 18. Design Review Findings（Rev.3 — Gate 解消済み）

| 重要度 | 件数 | 内容 |
|---|---|---|
| Blocking | 0 | — |
| High | 0 | — |
| Medium | **0** | (a) planned Region 表示 → §15 Gate 1 で実コード追跡済み（全 Surface 非表示、追加実装不要）。(b) pilot 境界 → §14 で確定（19A = skeleton のみ、pilot = 19B setouchi） |
| Low | 3 | (a) scientificName 重複 warn（既存、非 blocking）。(b) expedition 前提条件が無いため進行は soft order（仕様として許容）。(c) `waterKindOf` の語彙拡張は任意（habitatTags 運用で回避可） |

**判定: Phase 18.5B Bible は Approved 相当。Phase 19A は §16 の contract に従い Ready for Implementation。**
