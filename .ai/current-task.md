# Current Task

## Phase

**Phase 7A — Transport / Access Domain**

状態: **完了**

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
  - Transport 検証用 PROVISIONAL Spot 4 件
- `npm run simulate:transport`
  - walk only / public / bicycle / compact car / SUV / kayak / rental boat / owned boat
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

- `npm run check`: PASS（58 files / 529 tests）
- `npm run simulate:catalog`: PASS
- `npm run simulate:tackle`: PASS
- `npm run simulate:day`: PASS
- `npm run simulate:trip`: PASS
- `npm run simulate:progression -- --catches 2000`: PASS
- `npm run simulate:fishing -- --seed demo`: PASS（LANDED / 174 ticks）
- `npm run sample:individuals -- --samples 10000`: PASS（全魚種 invalid=0）
- `npm run validate:content`: PASS（606 records）
- `npm run simulate:transport`: PASS（12/12 checks）
- production bundle: JS 655.69 kB（gzip 163.68 kB）、CSS 6.09 kB（gzip 1.67 kB）
  - eager Content による Vite の 500 kB warning は継続。Phase 7B 以降の code splitting 候補。
