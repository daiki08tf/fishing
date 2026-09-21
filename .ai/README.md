# Shared Model Handoff

このディレクトリは、DeepSeek / Bonsai / Codex など複数のモデルが
**同じプロジェクトを引き継げるようにするため**の共有ハンドオフである。
モデル固有のファイルは作らない。全モデルが同じファイルを読む。

## 原則

1. **Git とリポジトリ内のファイルが唯一の正**（source of truth）である。
   会話ログやモデルの記憶は正ではない。
2. 作業を始める前に必ず次を読む。
   - `README.md`
   - `docs/`（GAME_DESIGN / PROGRESSION / DATA_MODEL / ARCHITECTURE / ROADMAP / DECISIONS）
   - `.ai/current-task.md`
   - `.ai/handoff.md`
3. `docs/DECISIONS.md` は Product Decision の SSOT である。
   設計文書と食い違った場合は `docs/DECISIONS.md` を基準にし、どちらかを更新する。
4. ハンドオフには**耐久性のある事実**だけを書く。
   思考過程・内部推論・チャットログの全文は書かない。
5. 意味のある作業の最後に `.ai/current-task.md` と `.ai/handoff.md` を更新する。
6. **秘密情報を書かない。** API キー、トークン、パスワード、Cookie、
   認証ヘッダー、環境変数の値、資格情報は決して記載しない。
   必要な場合は「値は伏せる」とだけ書く。
7. **マシン固有の絶対パスを書かない。**
   - ホームディレクトリ配下のフルパスなど、マシン固有の絶対パスを記録しない。
   - worktree やチャットの UUID を含む一時的なパスも記録しない。
   - パスはリポジトリ相対で書く。
   - 実行時の位置は Git コマンドで解決する。

     ```
     git rev-parse --show-toplevel   # 作業ディレクトリの root
     git rev-parse --abbrev-ref HEAD # 現在のブランチ
     ```
   - コミットは可能な限りメッセージで参照する（hash は amend で変わり得る）。

## ファイル

- `current-task.md` — 現在の Phase、目的、許可された作業範囲、非目標、完了条件
- `handoff.md` — 完了した作業、ブランチ、関連ファイル、検証状況、ブロッカー、
  次の推奨タスク、実装上の重要な判断

## 運用

- 作業開始時: `current-task.md` の「Allowed scope」を守る。
- 作業終了時: `handoff.md` を更新し、検証コマンドの結果を残す。
- Phase をまたぐ場合: `current-task.md` を次の Phase に書き換える。
