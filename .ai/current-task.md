# Current Task

## Phase

**Phase 7A.1 — Transport / Access Domain の最小修正**

状態: **完了**

Phase 7A（Transport / Access Domain）の独立レビューで出た実害のある指摘を、Phase 7B へ
進む前に最小修正した。Phase 7A の構造（TransportDefinition / capability access /
ResolvedTravelOption / Save v6）は作り直していない。

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

- `npm run check`: PASS（62 files / 557 tests）
- `npm run simulate:catalog`: PASS
- `npm run simulate:tackle`: PASS
- `npm run simulate:day`: PASS
- `npm run simulate:trip`: PASS
- `npm run simulate:progression -- --catches 2000`: PASS
- `npm run simulate:fishing -- --seed demo`: PASS（LANDED / 174 ticks）
- `npm run sample:individuals -- --samples 10000`: PASS（全魚種 invalid=0）
- `npm run validate:content`: PASS（607 records）
- `npm run simulate:transport`: PASS（18/18 checks）
- 維持した値: upper lake 95 分 / 往復 ¥1,800、東京湾岸 往復 ¥840、fishing demo 174 ticks、
  simulate:day の現金推移
- production bundle: JS 660.66 kB（gzip 165.01 kB）、CSS 6.86 kB（gzip 1.81 kB）
  - eager Content による Vite の 500 kB warning は継続。Phase 7B 以降の code splitting 候補。
