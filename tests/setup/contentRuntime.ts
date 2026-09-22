import { bucketsFromBuiltInContent } from '../../src/content/catalog/mergeContent'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { contentRuntime } from '../../src/content/runtime/contentRuntime'

/**
 * テスト（node / SSR）では全 Content が同期的に読める。
 *
 * ブラウザでは Content Pack を遅延ロードする（Phase 15）が、SSR で
 * 画面の markup を検証するテストでは pack 読み込みを待てないため、
 * ここで runtime を満たしておく（本番の読み込み経路はテスト側で別途検証する）。
 */
contentRuntime.hydrateFully(bucketsFromBuiltInContent(loadContentFromDirectory()))
