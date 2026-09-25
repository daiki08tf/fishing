# Save Compatibility — save 設計と migration 規則

## 構造

```
SaveGame.ts                versioned 型（v1..v9）
saveSchema.ts              versioned zod schema（検証のみ）
migrateSave.ts             純粋関数の migration（例外を投げない）
saveFactory.ts             初期 Save の組み立て
SaveRepository.ts          interface（domain 側）
indexedDbSaveRepository.ts ブラウザ実装
inMemorySaveRepository.ts  テスト/フォールバック実装
persistenceCoordinator.ts  hydration + 書き込みの配線（app 層）
```

## 現在の schema

`CURRENT_SAVE_SCHEMA_VERSION = 9`（`src/domain/save/SaveGame.ts`）。

各 version の差分は `SaveGame.ts` のコメントに記録されている（v1: 技術基盤 / v2: progression+codex / v3: world / v4: economy / v5: tackle / v6: transport / v7: expedition / v8: canonical species id / v9: trade）。

## 規則

1. **破壊的変更は必ず version bump + migration**。schema を黙って変えない。
2. **migration は純粋関数**。同じ入力から同じ結果。例外を投げず `SaveMigrationResult` で理由を返す。
3. **未来 version は読まない**（`unsupported_future_version`）。壊れた解釈でデータを失わない。
4. **migration チェーンは古い順**。`migrateV8ToV9(migrateV7ToV8(...))` の形で合成する。
5. **fixture は `tests/fixtures/save.ts`**。新 version ごとに `createValidSaveVN` を足し、`./dev save-check` の FIXTURES に登録する。
6. **derived 値は persist しない**。例: environment は world time から導くので save に入れない。`PersistedPlayerSlice`（`src/state/playerStore.ts`）が save boundary。
7. **hydration 完了前は書かない**。coordinator が初期状態で既存 save を上書きする事故を防ぐ。

## 検証

```bash
./dev save-check                     # 全 fixture version の migration round-trip
npm run test:run -- migrateSave      # migration unit tests
npm run test:run -- persistence      # repository/coordinator tests
```

`./dev save-check` が行うこと:

- v1..v9 fixture → JSON serialize/parse（IndexedDB 境界相当）→ `migrateSave` → current schema で zod 検証 → 再 serialize → 再 migrate（冪等性）
- repository round-trip（save → loadRaw → migrate の等価性）
- 未来 version 拒否・壊れた入力の安全な失敗

## 既知の設計判断

- `career` は Phase 5 で正式に決まるまで中立値を入れる（`createInitialSave` が PROVISIONAL）
- v8 で species id を地域依存から canonical へ移行した — 保存構造は同じでキーだけ正規化
- `purchases` は v4 時点で独立ブロック化（finance とは別）
