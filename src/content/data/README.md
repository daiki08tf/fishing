# Content Data

ここに実コンテンツを置く。レイアウトは `<kind>/<name>.json`。

種別（`src/content/schema/index.ts` の `CONTENT_SCHEMAS` のキーと一致させる）:

- `fish-species`
- `fishing-spots`
- `transports`
- `regulations`

## Phase 1 時点の内容

Phase 1（Fishing Vertical Slice）は、次の 2 件の**検証用サンプル**だけを持つ。

- `fish-species/phase1-sample-fish.json`
- `fishing-spots/phase1-sample-spot.json`

これらは現実の魚種・釣り場を表すものではない。
名前もパラメータも暫定であり、釣りの状態機械とファイトを成立させるための入力である
（`id` は `phase1-sample-` で始まる）。

現実の魚・生態・地域を基礎にしたデータは Phase 2 / Phase 4 で投入する。
設計文書が現実データを求めるため、**検証を通すためだけの実在データを作らない**方針は
引き続き守る。

検証:

```
npm run validate:content
```

別ディレクトリを検証する場合:

```
npm run validate:content -- --dir src/content/fixtures/valid
```
