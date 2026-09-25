# Recovery — バックアップ対象の分類（将来の Mac Recovery プロジェクト用）

このドキュメントはバックアップ自動化ではなく、将来の Mac Recovery プロジェクトが読むための分類。

## A. Git-recoverable（git push 済みなら再取得可能）

- 全ソース（`src/`, `scripts/`, `tests/`）
- 全ドキュメント（`docs/`, `AGENTS.md`, `README.md`, 各 `*.md`）
- content data（`src/content/data/`）
- 生成物のうち決定論的なもの（`.dev/project-map.json`, `src/content/generated/content-index.json`）— 再生成可能だが、ソースの一部として残す
- `package.json` / `package-lock.json` / `tsconfig*` / `.nvmrc` / `eslint.config.js` / `vite.config.ts` / `.gitignore` / `index.html`
- CI 設定（`.github/workflows/ci.yml`）

## B. Regenerable / downloadable（再生成可能）

- `node_modules/`（`npm ci`）
- `dist/`（`npm run build`）
- `coverage/`（test 実行時に生成）
- `src/content/generated/`（`npm run content:index` — ただし git にも入っている）
- `.dev/project-map.json`（`./dev map --write` — 同上）

## C. Must-back-up local state（git では戻せない）

- ブラウザ IndexedDB の save data（ユーザー gameplay 履歴 — ゲーム内に export があればそちらを優先）
- ローカルの `.env*`（gitignore 済み — 値が必要なら別の safe store へ）
- worktree の uncommitted work（commit していない変更は Git でも戻せない）
- `fishing-devin` など別 worktree のブランチ固有作業

## D. Secrets / re-authentication

- このリポジトリは secrets を持たない（確認済み: `.env*` は gitignore、コミット済みファイルに credential なし）
- GitHub push は SSH / credential manager に依存 — Mac の再セットアップ時に再認証が必要
- `npm` の token は不要（private repo でも dependencies は public registry）

## E. Large artifacts（backup の優先度が低い / 除外してよい）

- `node_modules/`（数百 MB — 再生成可能）
- `dist/`（再生成可能）
- `coverage/`（再生成可能）
- git objects（remote から再 clone 可能）

## Content Studio の追加分類

- `scripts/studio/`（server / CLI / UI）と `tests/studio/` — **A（Git-recoverable）**
- Studio が作るものは `src/content/data/` と `src/content/generated/` の変更だけ — 両方とも Git 管理
- Studio 固有のローカル state / secrets / 大きな artifact は**無い**（127.0.0.1 ローカルサーバ、状態は repo のファイルだけ）

## 将来の Recovery プロジェクトへの入力

- このリポジトリの完全な復元には `git clone` + `npm ci` で十分
- save data（IndexedDB）はブラウザプロファイルに依存 — Mac 全体のバックアップでしか取れない
- 再セットアップ手順は `AGENTS.md` と `docs/DEVELOPMENT.md` が完全に記述している
