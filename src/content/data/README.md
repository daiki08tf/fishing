# Content Data

ここに実コンテンツを置く。レイアウトは `<kind>/<name>.json`。

種別（`src/content/schema/index.ts` の `CONTENT_SCHEMAS` のキーと一致させる）:

- `fish-species`
- `fishing-spots`
- `transports`
- `regulations`

## 現在の内容（Phase 2 時点）

**検証用サンプル**だけを持つ。魚種 10 件と釣り場 1 件。

- `fish-species/phase1-sample-fish.json` （サンプル魚A）
- `fish-species/phase2-sample-fish-b.json` 〜 `phase2-sample-fish-j.json`
- `fishing-spots/phase1-sample-spot.json`（上記 10 種を fishTable に持つ）

これらは現実の魚種・釣り場を表すものではない。
名前もパラメータも暫定であり、釣りの状態機械とファイトを成立させるための入力である
（`id` は `phase1-sample-` / `phase2-sample-` で始まる）。

現実の魚・生態・地域を基礎にしたデータは Phase 2 / Phase 4 で投入する。
設計文書が現実データを求めるため、**検証を通すためだけの実在データを作らない**方針は
引き続き守る。

## 魚種を追加する手順

1. `fish-species/` に JSON を 1 つ追加する（既存ファイルを雛形にする）。
2. `fishing-spots/*.json` の `fishTable` に `speciesId` と `basePresence` を足す。
3. `npm run validate:content` が通ることを確認する。

これだけで Encounter に登場する。**Fishing Engine の変更も、カタログのコード変更も要らない**
（ブラウザは `import.meta.glob` でディレクトリを読む）。

検証:

```
npm run validate:content
```

別ディレクトリを検証する場合:

```
npm run validate:content -- --dir src/content/fixtures/valid
```
