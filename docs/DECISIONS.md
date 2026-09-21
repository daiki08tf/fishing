# Decisions

この文書はFishingのProduct DecisionのSingle Source of Truthである。

他設計文書（GAME_DESIGN / PROGRESSION / DATA_MODEL / ARCHITECTURE / ROADMAP）と
記述が食い違った場合は、この文書を基準に判断し、どちらかを更新する。

## 1. World / Content

決定:

- 現代日本の現実世界をベースにする
- 実在する魚種・生態・地理・交通を利用する
- 初期の釣具ブランドは架空とする
- 後から実在ブランドをContentとして追加できる構造にする
- 実在ブランドの有無によってDomain Engineを書き換えない

実装への含意:

- 「実在か架空か」はContentの属性であり、Domainの分岐条件にしない
- ブランド追加は、コード変更ではなくContent追加として扱える形にする
- 出典（source）はContent側に保持する

## 2. Skill Points

決定:

- MVPでは振り直し可能とする
- 永久選択や高額なRespecはまだ導入しない
- 正式ルールはプレイテスト後に決定する

実装への含意:

- Skill Pointの割り振りは、後から変更できる前提で保存・計算する
- Respecを禁止する設計（戻せない前提のデータ構造）にしない

## 3. Skill Effects

Skillが緩やかに改善してよい対象:

- casting accuracy
- timing window
- line / tension tolerance
- detection clarity
- rigging efficiency

禁止:

- Skill値だけによる自動捕獲
- プレイヤー操作の完全排除
- 非現実的な単純パーセント補正

実装への含意:

- Skillは操作の成功そのものを置き換えず、操作しやすさ（窓・許容・見やすさ）を動かす
- Domainの判定に「Skillが高いので成功」という短絡経路を追加しない

## 4. Distribution

決定:

- 初期ターゲットはWeb / PWA / mobile-firstとする
- Native app packagingは将来検討する

実装への含意:

- モバイル操作を第一級として扱う
- 初期はPWAで成立する範囲を制約とする

## 5. Transport

決定:

- Transportは主要な成長軸として扱う
- 早期Prototypeでも次の体験を検証する

```
徒歩 / 電車等
  ↓
行けるSpotが限られる
  ↓
車を入手
  ↓
アクセス可能な釣り場が明確に増える
```

実装への含意:

- アクセス判定はTransportを入力に持つ（accessEngine）
- 「Levelが上がったので解禁」ではなく、
  「移動手段・装備・Knowledge・Skillが広がったので行ける」形にする
- Spot は具体的な車種 ID ではなく物理的な access capability を要求する
- Transport の具体的な商品名・車種名・船名は Content に置き、AccessEngine の分岐へ書かない
- Transport ownership は WorldState と分離し、Save の独立ブロックとして保持する
- SUV は道路系の強み、Kayak は限定的な水上アクセス、Boat は offshore と役割を分ける。
  高価な 1 台ですべてを突破できる設計にしない
- 交通費・レンタル料は既存 Economy の円を使い、独立通貨を作らない
- Transport はアクセス・時間・費用・抽象的な積載までとし、燃料残量・故障・車検・
  保険・駐車違反・渋滞・実道路 routing はシミュレーションしない

## 6. Phase 0 で定義する機械判定可能な制約

Phase 0では、CI / lint / testで機械的に判定できる制約だけを定義する。

- Levelをlocation hard lockに使わない
- Domain layerはReact / UIに依存しない
- RNGは注入可能かつseed可能にする
- Contentはtyped schemaでvalidateする
- SaveはschemaVersionを必須とする
- Domain testsはdeterministicにする
- Fish generationは物理的制約を守る
- 禁止layer dependencyをlint / testで検知する

## 7. Scope Discipline

採用しない考え方:

> 設計書に存在しないコードをCIが意味的に検出する

理由:

- 「設計書に書かれていない」ことの意味判定は機械的に安定しない
- 誤検知・見逃しのコストが高く、CIが信頼されなくなる

代わりに:

- CI / lint / testは、6の機械判定可能な制約のみを担当する
- 意味論的なProduct Scope逸脱の検出はhuman / code reviewの責務とする

## 8. 変更規律

- この文書の変更は、意志決定として記録する
- 設計文書の変更は、そのPhaseの範囲に限定する
- 実装で得た知見は設計へ戻す（設計を先に固定しすぎない）
