const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { build } = require('esbuild');

const fixture = `<div class="f95wg-thread"><div class="f95wg-strip">
<span class="f95wg-strip-label">Versions</span>
<span class="f95wg-strip-version is-latest" data-xf-init="tooltip" data-original-title="from v1.0 EA7 Hf2: New content: · Red Riding Hood outfit. · Red Riding Hood cinematic. · Goblin game over cinematic.">v1.0 EA8 <span class="f95wg-muted">· <time datetime="2026-10-21T00:42:08+0100" data-timestamp="1792539728" data-date="Oct 21, 2026" data-time="12:42 AM" data-short="11d" title="Oct 21, 2026 at 12:42 AM">Oct 21, 2026</time></span></span>
<span class="f95wg-strip-version" data-original-title="from v1.0 EA7 hotfix1: Fixed Chloe still being bald in the magic armor cinematic. · Fixed the strange camera angle in double recruit. · Fixed double recruit not randomizing who goes first. · Reworked how cinematic block filters are applied, they should work universally now without me having to remember to add special edge case handling.">v1.0 EA7 Hf2 <span class="f95wg-muted">· <time datetime="2026-10-07T08:27:14+0100" data-timestamp="1791358034" data-date="Oct 7, 2026" data-time="8:27 AM" data-short="24d" title="Oct 7, 2026 at 8:27 AM">Oct 7, 2026</time></span></span>
<span class="f95wg-strip-version" data-original-title="from v1.0 EA7">v1.0 EA7 hotfix1 <span class="f95wg-muted">· <time datetime="2026-10-06T13:27:35+0100" data-timestamp="1791289655" data-date="Oct 6, 2026" data-time="1:27 PM" data-short="25d" title="Oct 6, 2026 at 1:27 PM">Oct 6, 2026</time></span></span>
<span class="f95wg-muted f95wg-strip-gap">a new version about every 15 days</span>
</div></div>`;

const checks = `
import { F95_THREAD_PAGE_V1_PARSER, applyF95ThreadPageMetadata } from './apps/f95-module/core/f95ThreadPageV1';
import * as tags from './apps/f95-module/core/f95Tags';
import { f95ModuleDefinition } from './apps/f95-module/module';
import { runF95RefreshSync } from './apps/f95-module/core/f95Refresh';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { F95DetailPanel } from './apps/f95-module/ui/F95DetailPanel';
import { F95VersionHistoryStrip } from './apps/f95-module/ui/F95VersionHistoryStrip';
import { getLatestF95Release, normalizeF95ReleaseDate, parseF95VersionHistory, readStoredF95VersionHistory, serializeF95VersionHistory } from './apps/f95-module/core/f95VersionHistory';
const fixture = ${JSON.stringify(fixture)};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const history = parseF95VersionHistory(fixture);
assert(history.entries.length === 3, 'all three releases');
assert(history.entries.map(entry => entry.version).join('|') === 'v1.0 EA8|v1.0 EA7 Hf2|v1.0 EA7 hotfix1', 'labels exclude nested dates');
assert(history.entries[0].releasedAt === '2026-10-20T23:42:08.000Z', 'timezone-aware latest release');
assert(history.entries[0].isLatest && !history.entries[1].isLatest, 'explicit latest marker');
assert(history.entries[1].changelog.endsWith('special edge case handling.'), 'complete long changelog');
assert(history.entries[2].changelog === 'from v1.0 EA7', 'short tooltip');
assert(history.entries[0].dateTitle === 'Oct 21, 2026 at 12:42 AM' && history.entries[0].shortDate === '11d', 'source date fields');
assert(history.cadence === 'a new version about every 15 days', 'cadence');
assert(F95_THREAD_PAGE_V1_PARSER.parse('216420', fixture).version === 'v1.0 EA8', 'widget controls current version');
assert(parseF95VersionHistory('<div></div>') === null, 'missing widget');
const legacy = F95_THREAD_PAGE_V1_PARSER.parse('216420', '<script type="application/ld+json">' + JSON.stringify({ articleBody: 'Version: old' }) + '</script>');
assert(legacy.version === 'old' && legacy.versionHistory === null, 'legacy fallback');
assert(getLatestF95Release(parseF95VersionHistory(fixture.replace(' is-latest', ''))).version === 'v1.0 EA8', 'date fallback');
assert(normalizeF95ReleaseDate('', '1792539728') === '2026-10-20T23:42:08.000Z', 'epoch fallback');
assert(normalizeF95ReleaseDate('invalid', '') === '', 'invalid dates do not compare');
assert(normalizeF95ReleaseDate('2026-10-21T00:42:08+0100', '1') === '2026-10-20T23:42:08.000Z', 'datetime takes precedence');
const fallback = parseF95VersionHistory(fixture.replace('data-original-title="from v1.0 EA7"', 'title="from &quot;previous&quot; &amp; earlier"'));
assert(fallback.entries[2].changelog === 'from "previous" & earlier', 'title fallback and entity decoding');
history.entries[0].changelog += '\\n[custom:example] Unicode: \\u00e9';
history.entries[0].changelog += String.fromCharCode(92) + 'n literal backslash';
assert(JSON.stringify(readStoredF95VersionHistory(serializeF95VersionHistory(history))) === JSON.stringify(history), 'JSON round trip');
assert(readStoredF95VersionHistory('{bad') === null && readStoredF95VersionHistory('{"schemaVersion":1,"entries":[]}') === null, 'invalid storage');
window.__f95TestResult = { parser: 'passed', history, storedHistory: serializeF95VersionHistory(history) };
const metadata = F95_THREAD_PAGE_V1_PARSER.parse('216420', fixture);
const initialTags = [{ key: tags.F95_THREAD_ID_TAG, value: '216420' }];
const initialized = applyF95ThreadPageMetadata(initialTags, metadata);
assert(tags.getF95BooleanTagValue(initialized, tags.F95_UP_TO_DATE_TAG, true), 'initial fetch is a baseline');
assert(tags.getF95TagValue(initialized, tags.F95_VERSION_HISTORY_TAG).includes('EA7 hotfix1'), 'history persisted');
const oldTags = [...initialTags, { key: tags.F95_VERSION_TAG, value: '1.0 EA7 Hf2' }, { key: tags.F95_LAST_UPDATED_TAG, value: '2026-10-01T12:00:00Z' }];
const updated = applyF95ThreadPageMetadata(oldTags, metadata);
assert(!tags.getF95BooleanTagValue(updated, tags.F95_UP_TO_DATE_TAG, true), 'newer dated release marks update');
assert(tags.getF95TagValue(updated, tags.F95_LAST_UPDATED_TAG) === '2026-10-01T12:00:00Z', 'RSS watermark preserved');
const updateMarker = tags.getF95TagValue(updated, tags.F95_UPDATE_MARKER_TAG);
assert(updateMarker.startsWith('release:216420:'), 'stable release event marker');
assert(tags.getF95TagValue(applyF95ThreadPageMetadata(updated, metadata), tags.F95_UPDATE_MARKER_TAG) === updateMarker, 'repeat fetch stable');
const acknowledged = tags.setF95TagValue(updated, tags.F95_UP_TO_DATE_TAG, 'true');
assert(tags.getF95BooleanTagValue(applyF95ThreadPageMetadata(acknowledged, metadata), tags.F95_UP_TO_DATE_TAG), 'same release remains acknowledged');
const notificationContribution = f95ModuleDefinition.contributes.find(item => item.slot === 'notification.feed');
const notificationContext = { games: [{ path: 'test-game', name: 'Example', metadata: { customTags: updated } }] };
const notification = notificationContribution.getItems(notificationContext)[0];
assert(notification.metadata.notificationMarker === updateMarker && notification.message.includes('v1.0 EA8'), 'existing notification contribution');
assert(notification.createdAt === '2026-10-20T23:42:08.000Z', 'notification release date');
const olderHistory = { ...metadata.versionHistory, entries: metadata.versionHistory.entries.slice(1).map((entry, index) => ({ ...entry, isLatest: index === 0 })) };
const olderMetadata = { ...metadata, version: 'v1.0 EA7 Hf2', versionHistory: olderHistory };
const olderApplied = applyF95ThreadPageMetadata(acknowledged, olderMetadata);
assert(tags.getF95BooleanTagValue(olderApplied, tags.F95_UP_TO_DATE_TAG), 'rollback does not notify');
assert(tags.getF95TagValue(olderApplied, tags.F95_RELEASE_AT_TAG) === metadata.versionHistory.entries[0].releasedAt, 'baseline never regresses');
const newerHistory = { ...metadata.versionHistory, entries: [{ ...metadata.versionHistory.entries[0], version: 'v1.0 EA9', releasedAt: '2026-11-01T12:00:00.000Z' }] };
const newerApplied = applyF95ThreadPageMetadata(acknowledged, { ...metadata, version: 'v1.0 EA9', versionHistory: newerHistory });
assert(!tags.getF95BooleanTagValue(newerApplied, tags.F95_UP_TO_DATE_TAG, true), 'subsequent release resurfaces');
assert(tags.getF95TagValue(newerApplied, tags.F95_UPDATE_MARKER_TAG) !== updateMarker, 'later release gets new marker');
const invalidHistory = { ...newerHistory, entries: [{ ...newerHistory.entries[0], releasedAt: '' }] };
assert(tags.getF95BooleanTagValue(applyF95ThreadPageMetadata(acknowledged, { ...metadata, versionHistory: invalidHistory }), tags.F95_UP_TO_DATE_TAG), 'invalid release date does not notify');
const correctedHistory = { ...metadata.versionHistory, entries: [{ ...metadata.versionHistory.entries[0], releasedAt: '2026-11-01T12:00:00.000Z' }] };
assert(tags.getF95BooleanTagValue(applyF95ThreadPageMetadata(acknowledged, { ...metadata, versionHistory: correctedHistory }), tags.F95_UP_TO_DATE_TAG), 'same-version date correction does not notify');
assert(tags.getF95TagValue(applyF95ThreadPageMetadata(updated, legacy), tags.F95_VERSION_HISTORY_TAG) === tags.getF95TagValue(updated, tags.F95_VERSION_HISTORY_TAG), 'missing widget preserves history');
window.__f95TestResult.notifications = 'passed';
window.__f95AsyncChecks = async () => {
  const originalFetch = globalThis.fetch;
  let savedTags = null;
  let feedDate = '2026-10-21T00:42:08+0100';
  globalThis.fetch = async () => ({ ok: true, text: async () => '<rss><channel><item><title>Example [v1.0 EA8]</title><link>https://f95zone.to/threads/216420</link><guid>feed-216420</guid><pubDate>' + feedDate + '</pubDate></item></channel></rss>' });
  const refreshContext = {
    configState: { installed: true, enabled: true, state: { syncIntervalSeconds: 0 } },
    games: [{ path: 'test-game', name: 'Example', metadata: { customTags: updated.filter(tag => tag.key !== tags.F95_LAST_UPDATED_TAG) } }],
    galleryClient: { saveGameMetadata: async payload => { savedTags = payload.metadata.customTags; } },
    logAppEvent: async () => {},
    toErrorMessage: error => String(error),
  };
  try {
    await runF95RefreshSync(refreshContext);
    assert(savedTags && !tags.getF95BooleanTagValue(savedTags, tags.F95_UP_TO_DATE_TAG, true), 'first RSS sync preserves pending release update');
    assert(tags.getF95TagValue(savedTags, tags.F95_UPDATE_MARKER_TAG) === updateMarker, 'RSS initialization preserves release event');
    refreshContext.games[0].metadata.customTags = savedTags;
    feedDate = '2026-11-02T12:00:00Z';
    await runF95RefreshSync(refreshContext);
    assert(tags.getF95TagValue(savedTags, tags.F95_UPDATE_MARKER_TAG).startsWith('rss:216420:'), 'later RSS event remains supported');
    assert(tags.getF95TagValue(savedTags, tags.F95_RELEASE_AT_TAG) === metadata.versionHistory.entries[0].releasedAt, 'RSS does not overwrite release baseline');
    window.__f95TestResult.rss = 'passed';
  } finally {
    globalThis.fetch = originalFetch;
  }
};
let root;
window.__f95Render = (longContent = false) => {
  if (!root) {
    const container = document.createElement('main');
    container.id = 'f95-test-root';
    document.body.append(container);
    root = createRoot(container);
  }
  const context = { moduleId: 'f95', moduleDisplayName: 'F95', configState: { installed: true, enabled: true, state: {} }, game: { path: 'test-game', name: 'Example', metadata: { customTags: updated } }, moduleTags: updated };
  const content = longContent ? createElement(F95VersionHistoryStrip, { history: { ...metadata.versionHistory, entries: [{ ...metadata.versionHistory.entries[0], version: 'VeryLongVersionLabel'.repeat(20), changelog: 'Long changelog paragraph. '.repeat(400) }] } }) : createElement(F95DetailPanel, { context });
  root.render(content);
};
`;

if (!process.versions.electron) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { stdio: 'inherit', env: environment });
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true } });
    try {
      const bundle = await build({ stdin: { contents: checks, resolveDir: path.resolve(__dirname, '..'), loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
      await window.loadURL('about:blank');
      await window.webContents.executeJavaScript(bundle.outputFiles[0].text);
      await window.webContents.executeJavaScript('window.__f95AsyncChecks()');
      const result = await window.webContents.executeJavaScript('window.__f95TestResult');
      assert.equal(result.parser, 'passed');
      assert.equal(result.notifications, 'passed');
      assert.equal(result.rss, 'passed');
      const rootPath = path.resolve(__dirname, '..');
      const libraryBundle = await build({ entryPoints: [path.join(rootPath, 'apps/full-desktop/electron/game-library.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
      const libraryModule = new Module(path.join(rootPath, 'f95-library-test.cjs'), module);
      libraryModule.paths = module.paths;
      libraryModule._compile(libraryBundle.outputFiles[0].text, path.join(rootPath, 'f95-library-test.cjs'));
      const library = libraryModule.exports;
      const testFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'lgg-f95-nfo-'));
      try {
        const storedHistory = result.storedHistory;
        await library.saveGameMetadata({ gamePath: testFolder, title: 'Example', metadata: { ...library.createDefaultMetadata(), customTags: [{ key: 'module_f95_version_history', value: storedHistory }] } });
        const reread = await library.readGameMetadata(testFolder, 'Example', []);
        assert.equal(reread.customTags.find(tag => tag.key === 'module_f95_version_history').value, storedHistory);
      } finally {
        await fs.rm(testFolder, { recursive: true, force: true });
      }

      const screenshotFolder = process.argv.includes('--screenshots') ? await fs.mkdtemp(path.join(os.tmpdir(), 'lgg-f95-screenshots-')) : null;
      const nextFrame = () => window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      for (const client of ['full-desktop', 'web-client']) {
        const css = await fs.readFile(path.join(rootPath, 'apps', client, 'src/styles/base.css'), 'utf8');
        const styleKey = await window.webContents.insertCSS(css + '\nbody { margin: 0; min-width: 0; } #f95-test-root { box-sizing: border-box; max-width: 1040px; margin: auto; padding: 16px; }');
        for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
          window.setContentSize(width, height);
          await window.webContents.executeJavaScript('window.__f95Render()');
          await nextFrame();
          const layout = await window.webContents.executeJavaScript(`({ count: document.querySelectorAll('.f95-version-history__entry').length, overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth, latest: document.querySelector('.f95-version-history__entry--latest')?.textContent })`);
          assert.equal(layout.count, 3);
          assert.equal(layout.overflows, false, `${client} ${width}px layout must not overflow`);
          assert.ok(layout.latest.includes('v1.0 EA8'));
          await window.webContents.executeJavaScript("(() => { const element = document.querySelectorAll('.f95-version-history__entry')[1]; element.focus({ preventScroll: true }); element.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()");
          await nextFrame();
          const tooltip = await window.webContents.executeJavaScript(`(() => { const element = document.querySelector('[role="tooltip"]'); const rect = element.getBoundingClientRect(); return { text: element.textContent, bounded: rect.left >= 0 && rect.top >= 0 && rect.right <= document.documentElement.clientWidth && rect.bottom <= innerHeight && document.documentElement.scrollWidth <= document.documentElement.clientWidth }; })()`);
          assert.ok(tooltip.text.includes('special edge case handling.'));
          assert.equal(tooltip.bounded, true, `${client} ${width}px tooltip must fit viewport`);
          if (screenshotFolder) {
            await fs.writeFile(path.join(screenshotFolder, `${client}-${width}.png`), (await window.webContents.capturePage()).toPNG());
          }
          await window.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
          await nextFrame();
          assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('[role=tooltip]'))"), false);
          await window.webContents.executeJavaScript("document.querySelector('.f95-version-history__entry').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))");
          await nextFrame();
          assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('[role=tooltip]'))"), true);
          await window.webContents.executeJavaScript("document.querySelector('.f95-version-history__entry').click()");
          await nextFrame();
          await window.webContents.executeJavaScript("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
          await nextFrame();
          assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('[role=tooltip]'))"), false);
          await window.webContents.executeJavaScript('document.activeElement.blur()');
        }
        await window.webContents.executeJavaScript('window.__f95Render(true)');
        await nextFrame();
        await window.webContents.executeJavaScript("(() => { const element = document.querySelector('.f95-version-history__entry'); element.focus({ preventScroll: true }); element.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()");
        await nextFrame();
        const longLayout = await window.webContents.executeJavaScript(`({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollable: document.querySelector('[role=tooltip]').scrollHeight > document.querySelector('[role=tooltip]').clientHeight })`);
        assert.equal(longLayout.overflow, false, 'long version label wraps');
        assert.equal(longLayout.scrollable, true, 'long changelog scrolls');
        await window.webContents.removeInsertedCSS(styleKey);
      }
      console.log('F95 parser, .nfo persistence, release detection, RSS compatibility, notifications and responsive tooltip checks passed.');
      if (screenshotFolder) console.log(`Screenshots: ${screenshotFolder}`);
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}