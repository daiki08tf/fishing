# Development — 開発ワークフロー

## 環境

- Node: `.nvmrc`（24）
- `npm ci` で依存を入れる。`npm install` で新しい依存を足す場合は既存の方針を確認すること（重い依存は避ける）

## 起動

```bash
npm run dev       # vite dev server（ブラウザで http://localhost:5173）
npm run build     # typecheck + vite build
npm run preview   # build 済みを確認
```

## 開発者 CLI

```bash
./dev doctor           # 環境 + repo + 生成物 + authority map の診断（read-only）
./dev status           # git/branch/map の即時サマリ（--json で機械可読）
./dev map              # project map 概要 / --write で再生成 / --check で鮮度確認
./dev authority [id]   # authority map（./dev authority で一覧）
./dev impact <id>      # 変更影響分析
./dev scope            # git diff の範囲分類（--staged / --base <ref>）
./dev context <id>     # AI 用軽量コンテキスト
./dev handoff          # handoff テンプレート
./dev save-check       # save migration round-trip
./dev smoke            # 決定論的 gameplay smoke
./dev content-check    # content 構造検証
./dev check [--full]   # 統合検証
```

## 編集の流れ

1. `./dev context <concept>` で関係ファイルと不変条件を把握
2. 実装
3. `./dev check`（quick: 編集ごと）
4. `./dev scope` で触れた範囲を確認
5. save / authority を触ったら `./dev save-check` と `./dev impact <id>`
6. `./dev check --full`（merge / handoff 前）

## 生成物

| ファイル | 生成 | コミット |
|---|---|---|
| `.dev/project-map.json` | `./dev map --write` | する（決定論的） |
| `.dev/authority-map.json` | 手書き（authority の定義） | する |
| `.dev/systems.json` | 手書き（system の分類） | する |
| `src/content/generated/content-index.json` | `npm run content:index` | する |
| `dist/` / `coverage/` / `node_modules/` | build / test / install | しない |

`./dev doctor` が生成物の鮮度を検査する。`.dev/project-map.json` は import 構造・authority 定義・system 分類が変わったら再生成する（`./dev map --check` が CI で検出する）。

## 変更規律（docs/DECISIONS.md §8 と同じ）

- 振る舞いを変える場合は明記する
- save schema を壊す場合は version bump + migration
- ゲームプレイの authority をインフラの都合で変更しない
- 失敗した run の情報も残す（実験・歴史データを消さない）
