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
- 入手できる Transport（初期利用可能 / Shop で購入可能）は、Content 上どの route でも
  使えない状態を許さない（`validate:content` が検出する）。入手手段が無い future-only は
  将来の route 追加を妨げないよう検査対象外にする
- 行けない理由は capability 条件の列挙ではなく、Transport 候補が落ちた段階
  （capability 不足 / 行ける route が無い / 所有が必要 / レンタル不可 / 設備不足）で説明する。
  持っている capability を「不足」と表示しない
- 移動手段はプレイヤーが選ぶ。既定は最も安い候補とし、速いだけの高額な候補を
  黙って選ばない（費用の内訳も出す）
- 世界は Country → Region → Area → Spot の Content 階層で表す。巨大な WorldManager を
  作らない。地域を「今いる場所（world.currentRegionId）」として持ち、違う地域の Spot へは
  遠征で移動してから行く
- 国内（北海道）と海外（アラスカ）は同じ Expedition の仕組みで扱う。海外専用システムを
  作らない。違いは Content（航空券の費用・時間、宿泊、許可）だけに置く
- 遠征の費用は「航空券（往復）＋宿泊＋許可」をまとめて予約する。空港・パスポート・ビザ・
  手荷物・座席・為替・実際の予約・現地法規の詳細はシミュレーションしない
- 現地の移動は Phase 7A の Transport / Access をそのまま使う。国・地域による分岐は
  Content に置き、Engine（AccessEngine / FishingEngine）には書かない
- 地域の解放条件に Angler Level を使わない。行けるかどうかは資金・許可・移動手段・
  Knowledge で決まる（Lv1 でも金と許可があればアラスカへ行ける）
- Permit は遠征予約に含める簡易な所持リストとし、`permit` 条件を持つ Spot にだけ効く
- 追加した魚（アラスカ / 北海道）は PROVISIONAL とし、既存の FishIndividual /
  Trait / FightEngine をそのまま使う（新しい魚生成システムを作らない）
- Environment（季節 / 時間帯 / 天候 / 潮 / 水）は WorldTime と地域の気候プロファイル
  （Content）から決定論的に解決する。天気・潮汐の外部 API は使わず、Math.random も
  Domain に入れない。商用の気象・潮汐シミュレーションは作らない
- Environment を FishingEngine へ直接渡さない。Conditions Resolver が
  resolved numerical modifiers へ写し、Engine は数値だけを受け取る
- 地域ごとの違いは Content（climate / 魚種の environmentAffinity）に置き、
  国・地域・魚種による分岐を Engine に書かない。天候の乱数も「同じ日付・地域なら同じ」にする
- 条件が悪くても魚種の Encounter 重みを 0 にしない（下限 0.35）。「絶対に釣れない」を作らず、
  good / neutral / poor の差だけを感じさせる
- 大型魚は「Hard gate」ではなく確率で難しくする。軽いタックルでも獲れるが、
  ラインブレイク / フックアウトが増える（理想は Light でも理論上は獲れること）
- 大型個体の強さは個体サイズから解決し、魚種固有の分岐を Engine に足さない
- Fish Finder は Gear カテゴリ `electronics`（1 種）として既存 Inventory に載せる。
  Electronics アーキテクチャを巨大化しない（Search Water は反応と手がかりだけ）
- Environment は再生成できるため Save を増やさない（v7 のまま）。Search Water の結果は
  釣行中の一時情報として保存しない
- **Catchability is soft by default / Physical impossibility is the only normal hard gate**（Phase 9.1）。
  タックルクラス（Rod / Reel / Line / Leader）で魚種の eligibility を決めない
- 釣法・offering の相性は soft multiplier（目安: excellent 1.8 / good 1.3 / neutral 1.0 /
  poor 0.5 / very poor 0.15）。相性だけを理由に確率を 0 にしない
- ルアー / フックが魚に対して物理的に大きすぎる場合だけ Bite = 0 を許す。
  小さすぎる場合は可能のまま（確率・保持・掛かりが悪くなる）
- 物理サイズは実データ（ルアーの長さ・フックの rank・魚の体長と捕食プロファイル）で判断し、
  具体 ID で分岐しない。サイズデータが無い offering（餌など）は neutral として扱う
- ファイトの難しさは Bite 確率とは別に扱う（食いついた後の世界で表現する）
- 「魚がいるのに食わない」を fishTable から消すことで表現しない

### Phase 10 — Text Fishing Battle（HOOKED 以降）

- **Fishing combat is decision-driven, not button-spam driven.**
  1 コマンド = 1 battle step。同じボタンを速く連打しても有利にならない
  （FIGHTING / LANDING は tick では進まず、プレイヤーのコマンドだけで進む）
- 魚の行動は 8 種の generic な behaviour（normal / run / surge / head_shake / dive /
  come_toward / rest / second_run）。魚種名や国では分岐せず、
  既存の fightProfile・Trait・個体サイズから解決した数値だけで重みが決まる
- 行動は文章で予兆（telegraph）を出してから発動する。
  「読んで次の一手を選ぶ」ことがゲームの中心であり、反射神経は要求しない
- コマンドは固定ダメージボタンではない。同じ REEL でも、魚の行動・テンション・
  タックルで結果が変わる（RUN 中の POWER_REEL は危険、COME_TOWARD 中の REEL は有効）
- 高テンション（LINE_BREAK）と slack（HOOK_ESCAPE）の両方を危険にする。
  「常に GIVE / 常に REEL / 常に POWER_REEL」が最適解にならない
- タックルは「失敗の余地（margin）」を変える。Light でも大型魚は理論上獲れるが、
  effective tension limit が低く、break / hook escape が増える。
  Heavy は安定するが、掛かり（Bite / Hook）では万能ではない
- 小さい魚のファイトは短い（1〜3 コマンド）。大型・記録級は長い（15〜30+）。
  戦闘の長さは個体とタックルとプレイヤーの判断で変わる
- Domain は BattleEvent / behaviour / numeric result を返し、文章は UI の表現である。
  Domain の判定を文章文字列で行わない
- Knowledge は予兆の文章の精度にだけ効く（結果は変えない）。
  Knowledge が低くてもゲームは成立する

### Phase 10.1 — Playtest Cleanup（runtime Content と fixture の分離）

- **プレイヤーが見る Content（`src/content/data`）に検証用の合成魚を置かない。**
  合成魚（サンプル魚 A〜J）は `tests/fixtures/content/fish-species/` に置き、
  test / simulation だけが `loadFixtureContent()` で追加読み込みする。
  runtime の Spot は常に `src/content/data` だけを参照する
- 通常プレイの画面に内部情報（seed / tick / 内部 state 名 / phase code）を出さない。
  開発用の導線は `import.meta.env.DEV` のときだけ表示する
- 古い Save に「今の Content に無い魚種 id」が残っていてもアプリは落ちない。
  表示（記録種数）は今の Content にある魚種だけを数え、**Save 自体は書き換えない**
- プレイテストのやり直しは、開発ビルドの HOME にある「セーブデータを初期化」で行う。
  起動時に勝手に Save を消す処理は入れない
- 釣行中の FishingEngine は、釣果記録の副作用（世界時間 → Environment → Conditions、
  成長 → 倍率）では作り直さない。セッション開始時の入力で固定する
  （作り直すと、取り込んだ瞬間に画面が最初の状態へ戻ってしまう）

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
