# Current Task

## Phase

**Phase 8 — Japan & International Expedition**

状態: **完了**

「東京の会社員が、近所の釣りから始めて、金と装備を揃えて世界中へ釣りに行く」骨格を
一通り遊べる形にした。Phase 7A.1 までの構造（TransportDefinition / capability access /
ResolvedTravelOption / AccessEngine / Save）は作り直していない。

## Phase 8 で実装したもの

### World Hierarchy（Content 駆動）

- 新しい Content: `countries`（9 件）/ `regions`（10 件）/ `expeditions`（2 件）
- 階層は World → Country → Region → Area → Spot。`regions[].areas` と Spot の
  `areaId` で Area を持つ（巨大な WorldManager は作らない）
- Region は `base`（現地の拠点 = HOME 相当）と `stage`（playable / planned）を持つ
- 東京近郊 13 Spot に `areaId`（Tokyo / Kanagawa / Chiba）を付与
- 将来拡張用に Canada / Norway / Australia / New Zealand / Brazil / Mexico / Thailand の
  Region 定義だけを `planned` として追加（World model が Alaska 専用でないことの確認）

### Expedition Domain（`src/domain/expedition`）

- `ExpeditionDefinition`（航空券・宿泊・許可）/ `ExpeditionPlan` / `ActiveExpedition` /
  `ExpeditionState`（current / visitedRegionIds / permits）
- `planExpedition` が「航空券（往復）＋宿泊（泊数×単価）＋許可」を合計し、内訳を
  cost component（flight / lodging / permit）で返す。泊数は min〜max に丸める
- `remainingExpeditionDays` が残り日数を返す
- 新通貨・為替・予約番号・座席・空港手続きは持たない

### 国内 / 海外の共通化

- 北海道（国内・domestic_flight）とアラスカ（海外・international_flight）を
  同じ `ExpeditionDefinition` と Store action で扱う（海外専用システムを作らない）
- WorldState に `currentRegionId` を追加。違う地域の Spot へは行けない
  （`leaveForSpot` が `not_in_region` で拒否し、Map は「遠征が必要」と表示する）
- 地域の移動は `moveToRegion`（時間を進めて地域を変える）だけ

### Alaska（第 1 の海外地域）

- 拠点 `Alaska Fishing Base`、Area は Kenai-like / Mountain / Coastal-Offshore
- Spot 6 件（Salmon River / Mountain River / Coastal Bay / Offshore Grounds /
  Glacier Creek / Trophy Lake）。すべて `dataStatus: provisional`
- 魚 10 種（Chinook / Coho / Sockeye / Chum / Pink / Rainbow Trout / Dolly Varden /
  Arctic Char / Pacific Halibut / Lake Trout）。既存の FishIndividual / Trait /
  FightEngine をそのまま使う（新しい魚生成システムは作らない）
- 北海道 Spot 3 件と魚 2 種（サクラマス / アメマス）。既存のサンプル魚も併用
- 現地の移動は Phase 7A の Transport / Access をそのまま使う
  （walk / rental car（vehicle_rental）/ rental boat（boat_rental + marina））

### Permit / Season / Knowledge

- 遠征予約に含めた Permit を `expedition.permits` に持ち、AccessEngine の `permit`
  条件にだけ効かせる（評価時は `permitsEnabled: true`）
- 天候・潮・水温は作らず、季節は Content の `seasonality.months` のみ（Phase 9 へ）
- 初めての地域に入ると Region Knowledge +20（PROVISIONAL）。ボウズでも増える既存仕様は不変

### UI

- `EXPEDITION` 画面（HOME → 遠征・旅行）。行き先 / 国・地域 / 拠点 / 航空移動時間 /
  泊数（±） / 宿泊の選択 / 費用内訳 / 総額 / 所持金 / 開始可否を表示する
- 遠征中は「遠征中: 地域」「残り N 日」「拠点」「現地の釣り場数」と「東京へ帰る」を出す
- MAP を世界対応にした（国内 / 海外の地域タブ。今いない地域は「現在この地域にいません」
  と表示して釣行不可）。Spot には Area 名を出す
- HOME は現在の拠点と遠征の残り日数を出す

### Save v7

- `world.currentRegionId` と `expedition`（current / visitedRegionIds / permits）を追加
- v6 → v7 migration は「home region を与え、遠征を空で作る」だけ。他のブロックは保持
- 遠征中の Save / reload で地域・拠点・残り日数・許可が残る

### 検証

- `npm run simulate:expedition`（新規）: 東京 → アラスカ予約 → 時間進行 → Alaska Base →
  レンタカー → Salmon River → Chinook を含む Encounter → 釣り → Codex 記録 → 拠点 →
  帰国、を 12 checks で PASS / FAIL（費用 / 時間 / 地域 / 現地移動 / 許可 / 魚 /
  記録 / 帰国 / Save / Level 非依存 / 決定論）

## Phase 7A.1（履歴）

Phase 7A の独立レビューで出た実害のある指摘の最小修正。Phase 7A の構造は作り直していない。

### Phase 7A.1 の修正

1. Motorcycle / Rental Car の route coverage
   - `standard-motorcycle` を upper lake の一般道 route に追加（安い road_access の入手手段）
   - `rental-car` を新しい Transport 検証用 PROVISIONAL Spot `suburban-road-lake` の
     一般道 route（`features: ["vehicle_rental"]`）で利用可能にした
     - upper lake に rental を足すと「車の購入前は行けない」Phase 5 の証明が壊れるため、
       既存 Spot の意味を変えずに検証用 Spot を 1 件足す方を選んだ
   - `rental-car` の time modifier を 0.5 → 0.62 にした（営業所での受け渡しぶん遅い）。
     所有車が最速・最安のままになり、既定選択が rental に奪われない
   - motorcycle は rough road / water / offshore を持たず、rental car も SUV 相当の
     能力を持たない（役割差は維持）
   - `findUnusableTransports` を Content 参照検証へ追加
     - 「初期状態で使える」または「Shop で購入できる」Transport が、どの route でも
       使えない状態を検出する
     - 入手手段が無い future-only Transport は検査対象外
2. Access 失敗理由の正確さ
   - Transport 候補の解決段階を `TRANSPORT_CANDIDATE_REJECTIONS` として区別
     （not_available / ownership_required / rental_unavailable / route_type_not_allowed /
     missing_route_capability / facility_required / out_of_range）
   - `AccessBlockedReason.kind` に missing_capability / no_compatible_transport /
     ownership_required / rental_unavailable / facility_required を追加
   - 手持ちの移動手段が提供している capability を「不足」と表示しない
     （中古車 owner に「必要: 道路からのアクセス」を出さない）
   - capability 条件は travelOptions の有無でまとめて判定する
3. 移動手段の選択 UI（Map）
   - `ResolvedTravelOption` を列挙し、transport 名・所要時間・往復費・
     費用内訳（運賃 / 走行費 / レンタル料）を表示する
   - 既定は Economy の `defaultTravelOption`（往復費が最も安い候補）。
     4 分速いだけの SUV（往復 ¥5,550）を黙って選ばず、中古車（¥1,800）を既定にする
   - プレイヤーが速い候補を選ぶと、その `transportId` で `travelToSpot` を呼ぶ
   - 既存の fastest fallback は migration / 未選択時の安全策として残す
4. 費用の透明性
   - `describeTravelCostParts` が cost component を「片道」「1釣行」付きで表示する

Phase 7B（cargo / 宿泊 / フェリー / marina 選択 UI 等）には進んでいない。

Phase 0〜6.5 は作り直していない。Phase 4 の World / Access、Phase 5 の Economy /
Shop / Used Compact Car、Phase 6 の Inventory / Loadout、Phase 6.5 の Content catalog を
拡張している。

## Phase 7A の実装

- `TransportDefinition` を data-driven 化
  - walk / train / bus / bicycle / motorcycle / compact_car / suv / rental_car /
    kayak / rental_boat / owned_boat
  - ownership、purchase / rental cost、time modifier、range、cargo、capability、
    launch / boat capability を保持
- Spot access を旧 transport tag から capability 要求へ移行
  - reachable_on_foot / public_transport / bicycle_access / road_access / rough_road /
    kayak_launch / boat_required / offshore / island_access
- `AccessEngine` は Content ID・商品名を知らず、Transport definition / ownership /
  route / capability だけで解決する
- `ResolvedTravelOption` が所要時間、片道費用、1釣行費用、cost component を返す
- Economy の従来の片道費×2を維持し、rental は 1 釣行に 1 回だけ課金
- Phase 5 の Used Compact Car / upper lake を維持
  - 95 分、片道 ¥900、往復 ¥1,800
- Save v6
  - `transport.availableTransportIds` / `ownedTransportIds` を World から分離
  - v5 の `car` と purchase を `used-compact-car` ownership へ migration
  - progression / codex / world / knowledge / finance / purchases / inventory / loadout を保持
- Content
  - Transport 11 件
  - 購入品 6 件（既存 compact car を含む）
  - Transport 検証用 PROVISIONAL Spot 5 件（Phase 7A.1 で 1 件追加）
- `npm run simulate:transport`
  - walk only / public / bicycle / motorcycle / compact car / SUV / rental car /
    kayak / rental boat / owned boat（Phase 7A.1 で motorcycle / rental car を追加）
  - Level 非依存、road / water capability 分離、ownership、cost、既存 car regression、
    deterministic を PASS / FAIL 表示

## Architecture boundary

- FishingEngine に Transport / Spot / Shop / concrete Content を持ち込まない
- AccessEngine に具体的な Transport ID・車種名・船名を持ち込まない
- Angler Level を access input / requirement に追加しない
- 所持金不足は Access ではなく Economy が扱う
- Store はルールを再実装せず、検証済み Content を Domain へ渡す
- 仕事・勤務 simulation は追加しない

## Pre-flight

Phase 7A 着手前に実ブラウザで次を確認済み。

`Shop → category filter → brand filter → gear purchase → owned → Tackle → equip →
compatibility update → save/reload`

結果: PASS。Phase 6.5 の回帰修正は不要だった。

## Scope out

- hotel 詳細 UI
- fuel / durability / repair / insurance / parking / traffic / real routing
- boat driving gameplay / fish finder
- weather / tide / season
- terminal tackle / huge Japan map / fish master import

## Next

Phase 7B 候補:

- ferry / highway / parking / lodging cost component
- 複数日 expedition の最小 Domain
- rental / marina / launch point の選択 UI
- cargo / gear capacity の釣行準備への接続
- Garage / Trip planning UI

詳細は `docs/ROADMAP.md`、判断は `docs/DECISIONS.md` を参照する。

## Final verification

- `npm run check`: PASS（65 files / 574 tests）
- `npm run simulate:catalog`: PASS
- `npm run simulate:tackle`: PASS
- `npm run simulate:day`: PASS
- `npm run simulate:trip`: PASS
- `npm run simulate:progression -- --catches 2000`: PASS
- `npm run simulate:fishing -- --seed demo`: PASS（LANDED / 174 ticks）
- `npm run sample:individuals -- --samples 10000`: PASS（全魚種 invalid=0）
- `npm run validate:content`: PASS（649 records）
- `npm run simulate:transport`: PASS（18/18 checks）
- `npm run simulate:expedition`: PASS（12/12 checks）
- 維持した値: upper lake 95 分 / 往復 ¥1,800、東京湾岸 往復 ¥840、fishing demo 174 ticks、
  simulate:day の現金推移
- UI の通し（HOME → EXPEDITION → アラスカ → MAP → Salmon River → FISHING → 拠点 → 帰国）を
  jsdom + React DOM のクリック操作で確認（27/27 ステップ PASS）。この sandbox では
  Chrome headless が起動できないため、実ブラウザでの目視確認は未実施
- production bundle: JS 702.06 kB（gzip 172.27 kB）、CSS 7.04 kB（gzip 1.86 kB）
  - eager Content による Vite の 500 kB warning は継続。Phase 7B 以降の code splitting 候補。
