# Content Data

ここに実コンテンツを置く。レイアウトは `<kind>/<name>.json`。

種別（`src/content/schema/index.ts` の `CONTENT_SCHEMAS` のキーと一致させる）:

- `fish-species`
- `fishing-spots`
- `transports`
- `regulations`

## 現在の内容（Phase 4 時点）

**検証用サンプル**だけを持つ。魚種 10 件と釣り場 8 件。

- `fish-species/phase1-sample-fish.json` （サンプル魚A）
- `fish-species/phase2-sample-fish-b.json` 〜 `phase2-sample-fish-j.json`
- `fishing-spots/*.json`（東京近郊を模した 8 件。魚種は Spot ごとに異なる）

魚種も釣り場も、現実の魚・場所を表すものではない。
名前もパラメータも暫定であり、釣りのループを成立させるための入力である
（`id` は `phase1-sample-` / `phase2-sample-` で始まる）。

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
   - `access`: 行くための条件（`transport` / `knowledge` / `permit` など）
   - `travelOptions`: 移動手段と所要時間（ゲーム内の分）
   - `dataStatus`: `provisional` か `verified`
2. `npm run validate:content` が通ることを確認する。

これだけで Map に並び、Access Engine が行けるかどうかを判定する。

検証:

```
npm run validate:content
```

別ディレクトリを検証する場合:

```
npm run validate:content -- --dir src/content/fixtures/valid
```
