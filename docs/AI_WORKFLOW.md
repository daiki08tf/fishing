# AI Workflow — AI agent / orchestration との境界

このリポジトリは AI コーディングエージェントによる継続開発を前提に設計されている。

## Front door

`AGENTS.md` — 新しい agent はここから読む。5 分で doctor / check / impact / context が使える。

## AI が使うコマンド

```bash
./dev doctor             # repo が healthy か（read-only）
./dev status --json      # 機械可読の状態
./dev context <concept>  # token 節約型の概念コンテキスト
./dev impact <concept>   # 変更影響
./dev scope              # 変更範囲の分類
./dev handoff            # handoff テンプレート
./dev check [--full]     # 検証
./dev save-check         # save 互換性
./dev smoke              # 決定論的 smoke
```

すべて read-only か `.dev/project-map.json` の生成のみ。agent が安全に繰り返し実行できる。

## 機械可読な出力

`--json` を受け付けるのは今のところ `./dev status` のみ。他のコマンドは PASS/WARN/FAIL の構造化テキスト（`scripts/dev/lib/output.ts` の `CheckResult`）。将来の orchestration 層は exit code と `PASS|WARN|FAIL` 行を parse すればよい。API server は作らない。

## Content Studio（実装済み）

Content Studio は実装済み。`scripts/studio/`（`docs/CONTENT_STUDIO.md` 参照）。

- Web UI: `npm run studio` → http://127.0.0.1:4310
- CLI / AI 向け: `./dev studio <list|get|schema|refs|options|validate|diff|write>`（`--json` 可）
- 書き込みは `scripts/studio/write.ts` のパイプライン経由のみ（schema → id 重複 → 仮想 corpus 参照検査 → atomic write → generated 再生成 → post-check）
- 参照の表示用メタデータは `scripts/studio/references.ts` の REFERENCE_SPECS（権威は `catalog/references.ts`）
- generated index は Studio が直接編集しない — write 後に `content:index` 相当で再生成される

## Personal AI Development OS の境界（将来）

orchestration 層がこのリポジトリを呼ぶときに使える安定した入口:

| 目的 | コマンド | 出力 |
|---|---|---|
| 健康診断 | `./dev doctor` | PASS/WARN/FAIL + exit code |
| 検証 | `./dev check` / `./dev check --full` | 同上 |
| 状態 | `./dev status --json` | JSON |
| 概念の取得 | `./dev context <id>` | 構造化テキスト |
| 変更範囲 | `./dev scope` | system 別分類 |
| 引き継ぎ | `./dev handoff` | テンプレート markdown |

これ以上の API / server はこのリポジトリでは提供しない。CLI が安定した境界になる。

## agent が「やってはいけない」こと

- gameplay authority をインフラの都合で変更しない
- save schema を version bump なしで変えない
- `npm run check` / `./dev check` を通さずに push しない
- user の未コミット作業を reset / stash / 上書きしない
- content の balance を validator の文脈で判断しない
- secrets / runtime artifacts を commit しない
