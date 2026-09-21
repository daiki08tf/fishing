# Content Data

ここに実コンテンツを置く。レイアウトは `<kind>/<name>.json`。

種別（`src/content/schema/index.ts` の `CONTENT_SCHEMAS` のキーと一致させる）:

- `fish-species`
- `fishing-spots`
- `transports`
- `countries`（Phase 8: 国）
- `regions`（Phase 8: 地域。base / areas を持つ）
- `expeditions`（Phase 8: 遠征。航空券・宿泊・許可）
- `regulations`
- `shop-items`
- `brands`
- `gear-series`（Brand → Series → Model の Series）
- `gear`（Rod / Reel / Line / Leader / Hook / Lure / Bait）
- `methods`（釣法）

## 現在の内容（Phase 10.1 時点）

ここにあるのは**プレイヤーが実際に釣る Content**である。
名前は実在の魚・釣り場を思わせるが、**数値はすべて PROVISIONAL**（暫定）であり、
生物学的な事実でも現実の釣果データでもない。

- `fish-species/*.json`（26 件。東京近郊 13 / 北海道 3 / アラスカ 10）
  - すべて `sourceRefs` に PROVISIONAL であることを明示している
  - **検証用の合成魚（サンプル魚 A〜J）はここに置かない。**
    釣りのループを検証するための合成魚種は `tests/fixtures/content/fish-species/` にあり、
    test / simulation だけが明示的に追加読み込みする
    （`tests/fixtures/content.ts` の `loadFixtureContent`）
- `fishing-spots/*.json`（22 件。東京近郊 13 / アラスカ 6 / 北海道 3）
  - 東京近郊: うち 5 件が Transport 検証用。`suburban-road-lake` は Phase 7A.1 で追加
  - アラスカ: Phase 8。Salmon River / Mountain River / Coastal Bay / Offshore Grounds /
    Glacier Creek / Trophy Lake（すべて `dataStatus: provisional`）
  - 北海道: Phase 8。北国の河川 / 湖 / 海岸（すべて `dataStatus: provisional`）
- `countries/*.json`（9 件。`domestic` と表示用 currency metadata）
- `regions/*.json`（10 件。`stage: playable` は東京近郊 / 北海道 / アラスカ。
  他は将来拡張用の `planned`。階層は Country → Region → Area → Spot。
  Phase 9 で `climate`（水温の年平均 / 季節の振れ幅 / 天候の出やすさ / 潮の位相）を持つ）
- `expeditions/*.json`（2 件。北海道 / アラスカ。航空券（往復）・宿泊・許可の費用）
- `transports/*.json`（徒歩・公共交通・二輪・車・SUV・Kayak・Boat の 11 件）
- `gear/*.json`（Rod / Reel / Line / Leader / Hook / Lure / Bait / Electronics）
  - Phase 9: `electronics` カテゴリ（`basic-fish-finder`。装備スロットには入らない）
- `methods/*.json`（`lure` / `light_lure` / `bait` / `bottom`）
- `brands/*.json`（架空ブランド 13 件。**性能倍率を持たない**）
- `gear-series/*.json`（Brand → Series → Model の Series。表示と整理の概念。89 件）
- `shop-items/*.json`（中古コンパクトカーなど）

`gear/` は `content/master-draft` ブランチの Content Master（CSV）から
**必要な分だけ移植**したものである（CSV を Runtime で読む構成にはしていない）。
移植の対応:

- ブランド名・Series 名・製品名は Master の値を使う（架空。DECISIONS §1）
- `sizeClass` / `variant` は Master の値、実性能は Master のスペックから写す
- Master の `Rigidity` / `WindingTorque` / `Response` / `DragStartup` は
  0〜100 を 0〜1 に正規化して Content に入れる
- Master の `Casting` / `ActionScore` / `FinesseAffinity` / `PowerAffinity` は
  **Content に入れない**（ゲーム調整値であり、現実の製品仕様ではないため。
  相当する差は weight / length / depth / type などの現実属性で表現する）
- リールの `lineCapacity` は Master の `LineCapacityIndex` と番手から導出する
- フックの `Size`（`#6` / `2/0`）は符号付きの数値へ変換する（`6` / `-2`）

釣り場の名前は現実の水域を思わせるものを含むが、**名前もパラメータも暫定**であり、
釣りのループを成立させるための入力である。
魚種の `id` は `kanto-`（東京近郊）/ `hokkaido-` / `alaska-` で始まる。

魚種の `methodAffinity` / `offeringAffinity` も
**PROVISIONAL の暫定値**であり、生物学的事実ではない。
目的は「同じ Spot でも釣法・offering で Encounter の重みが変わる」ことの検証である。

Phase 9 で魚種に `environmentAffinity`（季節 / 時間帯 / 天候 / 潮 / 流れ / 水温の嗜好）を
追加した。これも **PROVISIONAL の暫定値**であり、生物学的な事実ではない。
未設定の魚は neutral（1）として扱う。

### 実在の場所を扱うときの約束

釣り場の名前は現実の水域を思わせるものが含まれるが、**魚種・規制・立入可否・
遊漁ルールを根拠なく断定しない**。そのため全 Spot に `dataStatus` を持たせている。

- `provisional`（現在の全 Spot）: 概略・未検証。UI にも「暫定データ」と表示する
- `verified`: `sourceRefs` に基づく（Phase 4 では未使用）

検証できない詳細は書かず、`unknown` のままにする。
設計文書が現実データを求めるため、**検証を通すためだけの実在データを作らない**方針は
引き続き守る。

## 魚種を追加する手順

1. `fish-species/` に JSON を 1 つ追加する（既存ファイルを雛形にする）。
2. 使いたい `fishing-spots/*.json` の `fishTable` に `speciesId` と `basePresence` を足す。
3. `npm run validate:content` が通ることを確認する。

これだけで Encounter に登場する。**Fishing Engine の変更も、カタログのコード変更も要らない**
（ブラウザは `import.meta.glob` でディレクトリを読む）。

## 釣り場を追加する手順

1. `fishing-spots/` に JSON を 1 つ追加する。
   - `access`: 行くための条件（`capability` / `knowledge` / `permit` など）
   - `travelOptions`: route が許す Transport type、設備、距離、基準時間、片道固定費
   - `dataStatus`: `provisional` か `verified`
2. `npm run validate:content` が通ることを確認する。

これだけで Map に並び、Access Engine が行けるかどうかを判定する。

## Transport を追加する手順

1. `transports/` に `TransportDefinition` JSON を追加する。
2. 購入品なら同じ ID を `shop-items/` の `grantsTransportId` から参照し、価格を一致させる。
3. Spot route の `transportTypes` と `requiredCapabilities` / `features` を設定する。
4. `npm run validate:content` と `npm run simulate:transport` を実行する。

具体的な車種・船名を AccessEngine に追加しない。Spot も商品 ID ではなく capability を要求する。

## 装備（Gear）を追加する手順

1. `gear/` に JSON を 1 つ追加する。
   - 現実由来の属性だけを書く（長さ・ルアー重量域・ドラッグ力・ライン強度など）
   - ゲーム調整の係数は書かない（`src/domain/gear/GearTuning.ts` 側）
   - `brandId` / `series` は任意。書く場合は `brands/` に実在する id を指す
   - Reel は `sizeClass`（1000〜30000）と `variant`（`S` / `HG` など）を持てる
2. `npm run validate:content` が通ることを確認する（参照切れもここで検出する）。

これだけで Shop に並び、Tackle 画面で選択できる。
**FishingEngine の変更も、Tackle Resolver の変更も要らない。**

## ブランドを追加する手順

1. `brands/` に JSON を 1 つ追加する。
2. Gear の `brandId` から参照する。

ブランドは表示と整理のためだけの属性である。
**ブランドに性能倍率を持たせない**（性能差は各製品のスペックで表現する）。

## Series を追加する手順

1. `gear-series/` に JSON を 1 つ追加する（`brandId` / `category` / `tier`）。
2. Gear の `seriesId` から参照する。

`seriesId` は `brandId` と `category` が一致している必要がある
（`npm run validate:content` が検出する）。

検証:

```
npm run validate:content
```

別ディレクトリを検証する場合:

```
npm run validate:content -- --dir src/content/fixtures/valid
```
