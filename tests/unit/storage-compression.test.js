/**
 * TATABOX — Issue #134：storage.js 大数据压缩（lz-string）单元测试
 *
 * 覆盖：
 *   1. 小 payload：保持明文写入（无压缩信封），行为与旧版一致；
 *   2. 大 payload（FSRS 快照型重复数据）：写入压缩信封，读回与原数据一致（round-trip）；
 *   3. 明文旧数据兼容读取；
 *   4. 压缩无收益（随机/不可压缩数据）时自动回退明文；
 *   5. 完整性校验不受压缩影响（settings 篡改仍可检出）；
 *   6. 未挂载 lz-string 时压缩整体透明禁用（明文直读）。
 *
 * 说明：storage.js 是浏览器脚本，测试用 mocked globals + eval 加载
 * （与仓库现有 tests/unit 风格一致）；lz-string 从仓库 js/vendor 读取，
 * 不依赖 node_modules。
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'js', 'core', 'storage.js');
const LZ_SRC = path.join(__dirname, '..', '..', 'js', 'vendor', 'lz-string.min.js');
const storageSource = fs.readFileSync(SRC, 'utf8');
const lzSource = fs.readFileSync(LZ_SRC, 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    keys() { return [...map.keys()]; },
    raw(k) { return map.get(String(k)); }
  };
}

function makeSessionStorage() {
  return {
    length: 0,
    key() { return null; },
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    clear() {}
  };
}

/**
 * 在沙箱中加载 storage.js，返回其公开函数与 localStorage 实例。
 * @param {Object} opts - { withLZ:boolean, onLine:boolean, offlineQueue:object|null }
 */
function loadStorage(opts) {
  opts = opts || {};
  const localStorage = makeLocalStorage();
  const windowObj = { addEventListener() {} };
  if (opts.withLZ !== false) {
    // 先加载 lz-string（vendor 版）。浏览器经典脚本中顶层 var 会挂到 window，
    // 但 new Function 沙箱是函数作用域，需显式回挂到 window.LZString。
    new Function('window', lzSource + '\n;window.LZString = LZString || window.LZString; return window.LZString;')(windowObj);
  }
  if (opts.offlineQueue) windowObj.OfflineQueue = opts.offlineQueue;
  const navigatorObj = { onLine: opts.onLine !== false };
  const factory = new Function(
    'window', 'localStorage', 'sessionStorage', 'navigator', 'indexedDB', 'console',
    storageSource +
    '\n;return { safeGetJSON, safeSetJSON, saveProgress, loadProgress, ' +
    'getAllLocalProgress, saveSetting, loadSetting, verifyStorageIntegrity, toggleFavorite };'
  );
  const api = factory(windowObj, localStorage, makeSessionStorage(), navigatorObj, undefined, console);
  return { api, localStorage };
}

// 构造一段「FSRS 卡片快照」型大 payload（重复结构利于压缩）
function bigPayload(n) {
  const cards = [];
  for (let i = 0; i < (n || 500); i++) {
    cards.push({
      id: 'card_' + i,
      name: '生态系统能量流动与物质循环（第' + i + '讲）',
      difficulty: 0.42 + (i % 9) / 100,
      stability: 3.1 + (i % 5) / 10,
      due: 1750000000000 + i * 86400000,
      reps: i % 7,
      state: i % 4,
      last_review: 1740000000000 + i * 3600000
    });
  }
  return { cards: cards, updatedAt: Date.now() };
}

describe('Issue #134 storage 压缩', () => {
  test('小 payload：saveProgress/loadProgress 保持明文（无信封）', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    api.saveProgress('stats', { total: 1 });
    const raw = localStorage.raw('tatabox_progress_stats');
    expect(raw.indexOf('__bqz')).toBe(-1);
    expect(api.loadProgress('stats').data.total).toBe(1);
  });

  test('大 payload：写入压缩信封且 round-trip 一致', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    const payload = bigPayload(800);
    api.saveProgress('fsrs_cards', payload);
    const raw = localStorage.raw('tatabox_progress_fsrs_cards');
    const stored = JSON.parse(raw);
    expect(stored.__bqz).toBe(1); // 已压缩
    const loaded = api.loadProgress('fsrs_cards');
    expect(loaded.data.cards.length).toBe(payload.cards.length);
    expect(loaded.data.cards[0].name).toBe(payload.cards[0].name);
    expect(loaded).toEqual({ updatedAt: loaded.updatedAt, deviceId: loaded.deviceId, data: payload });
  });

  test('压缩确实比明文小（配额收益）', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    const payload = bigPayload(800);
    api.saveProgress('fsrs_cards', payload);
    const raw = localStorage.raw('tatabox_progress_fsrs_cards');
    const plain = JSON.stringify({ updatedAt: Date.now(), deviceId: 'x', data: payload });
    expect(raw.length).toBeLessThan(plain.length * 0.9);
  });

  test('明文旧数据兼容读取', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    const legacy = { updatedAt: 1, deviceId: 'legacy', data: { v: 42 } };
    localStorage.setItem('tatabox_progress_legacy', JSON.stringify(legacy));
    expect(api.loadProgress('legacy').data.v).toBe(42);
  });

  test('压缩无收益时自动回退明文（不引入压缩信封）', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    // 高熵数据：纯随机串，压缩反而更大
    let entropy = '';
    for (let i = 0; i < 20000; i++) entropy += String.fromCharCode(33 + (Math.random() * 90) | 0);
    api.saveProgress('entropy', { blob: entropy });
    const raw = localStorage.raw('tatabox_progress_entropy');
    expect(raw.indexOf('__bqz')).toBe(-1);
    const loaded = api.loadProgress('entropy');
    expect(loaded.data.blob).toBe(entropy);
  });

  test('完整性校验不受压缩影响：篡改 settings 仍可检出', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    api.saveSetting('theme', 'dark');
    localStorage.setItem('tatabox_settings', JSON.stringify({ theme: 'dark' }) + 'X'); // 篡改
    expect(api.loadSetting('theme', 'default')).toBe('default');
    const report = api.verifyStorageIntegrity();
    expect(report.tampered).toContain('tatabox_settings');
  });

  test('未挂载 lz-string：压缩整体透明禁用（明文直读）', () => {
    const { api, localStorage } = loadStorage({ withLZ: false });
    const payload = bigPayload(800);
    api.saveProgress('fsrs_cards', payload);
    const raw = localStorage.raw('tatabox_progress_fsrs_cards');
    expect(raw.indexOf('__bqz')).toBe(-1);
    expect(api.loadProgress('fsrs_cards').data.cards.length).toBe(800);
  });

  test('getAllLocalProgress 对压缩信封统一解压', () => {
    const { api, localStorage } = loadStorage({ withLZ: true });
    api.saveProgress('fsrs_cards', bigPayload(300));
    const all = api.getAllLocalProgress();
    expect(all.fsrs_cards).toBeDefined();
    expect(all.fsrs_cards.data.cards.length).toBe(300);
  });
});