# Testing — テスト戦略と実行時間

## 分類

| 種別 | 場所 | 役割 |
|---|---|---|
| unit | `src/domain/**/*.test.ts`（colocated） | domain の純粋関数・状態機械 |
| contract | `tests/contracts/` | 複数 system の接続・authority 境界 |
| architecture | `tests/architecture/` | レイヤー境界・依存方向の強制 |
| persistence | `tests/persistence/` | save/load・repository・coordinator |
| content | `tests/content/` | content データの構造・整合性 |
| statistics | `tests/statistics/` | 個体生成・progression の分布 |
| ui | `tests/ui/` | 画面 smoke・contract |
| cli | `tests/cli/` | `scripts/` の検証 |
| dev-infra | `tests/dev/` | `./dev` ツール自体の検証 |
| fixtures | `tests/fixtures/` | save / content / gear のテストデータ |

## 実行コマンド

```bash
npm run test:run          # vitest（全テスト）
npm run test              # watch
./dev check               # quick: typecheck+lint+format+content+authority+save+smoke+tests
./dev check --full        # quick + 全 simulation + build + content-scale 分析
./dev smoke               # 決定論的 gameplay path のみ
./dev save-check          # save migration round-trip のみ
npm run check             # 従来の一括（simulation+test+build）
```

## 実行時間の目安（M1 / 2026 現在）

| コマンド | 時間 |
|---|---|
| `./dev doctor` | ~2s |
| `./dev check`（quick） | ~30s |
| `./dev check --full` | ~60s |
| `npm run test:run` | ~12s |
| `npm run check` | ~36s |
| `./dev smoke` | ~2s |
| `./dev save-check` | <1s |

## Invariants — どこで守られているか

| 不変条件 | 守るもの |
|---|---|
| Content id の一意性 | `validate:content`（`catalog/references.ts` の duplicate 検査） |
| 参照切れなし | `validate:content`（references / schema） |
| レイヤー境界（Domain は依存を持たない） | eslint patterns + `tests/architecture/` |
| Level でステージを開かない | `tests/architecture/no-level-gate.test.ts` |
| Save round-trip で権威状態を保つ | `tests/persistence/` + `./dev save-check` |
| Migration は冪等・未来 version 拒否・非例外 | `migrateSave.test.ts` + `./dev save-check` |
| hydration 前に書かない | `tests/persistence/persistenceCoordinator.test.ts` |
| 同じ seed → 同じ結果 | `SeededRandomSource.test.ts` + `simulateTrip` fingerprint + `./dev smoke` |
| encounter / abrasion / catch-result が同じ landed zone を見る | `tests/ui/landedZoneAuthority.test.ts` |
| catch result は有効な species を指す | `resolveCatch.test.ts` + references 検査 |
| 不可能な tackle 組合せを拒否 | `src/domain/tackle/*.test.ts` |
| authority map のパスが実在する | `./dev authority --check` / `./dev doctor`（CI でも実行） |
| project map が鮮度を保つ | `./dev map --check`（CI） |

## 決定性

- `simulateTrip` / `./dev smoke` は seed 固定で2回実行し、fingerprint が一致することを確認する
- `SeededRandomSource` 以外からの乱数・`Date.now()` / `Math.random()` を domain で使わない（domain は時計を持たない）

## 新しいテストを書くとき

- save schema を変えた: `tests/fixtures/save.ts` に新 version fixture + `migrateSave.test.ts` に round-trip
- content kind を変えた: `tests/fixtures/content/` に合成 fixture（runtime の `src/content/data` に検証用を混ぜない — DECISIONS.md §10.1）
- authority を動かした: 対応する contract test を足す（例: `tests/contracts/`）
- dev ツールを変えた: `tests/dev/` に検証を足す
