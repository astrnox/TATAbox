/**
 * M-14：离线题库包（SW 分级缓存 + 数据管理入口）回归测试
 * -------------------------------------------------
 * 验证矩阵：
 *   1) SW 定义独立的离线题库缓存与下载/清理/状态消息；
 *   2) 核心包覆盖 manifest/分片/精练/逻辑题，完整包额外含联赛真题；
 *   3) 前端 OfflineBank 暴露四个方法，且数据管理页接入按钮；
 *   4) index.html 实际加载 offline-bank.js。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-14 离线题库包', () => {
  const sw = read('sw.js');

  test('SW 独立缓存 + 三类消息', () => {
    expect(sw).toContain("var OFFLINE_BANK_CACHE = 'bioquest-offline-bank-v1';");
    expect(sw).toContain("case 'CACHE_OFFLINE_BANK'");
    expect(sw).toContain("case 'CLEAR_OFFLINE_BANK'");
    expect(sw).toContain("case 'OFFLINE_BANK_STATUS'");
    expect(sw).toContain("type: 'OFFLINE_BANK_DONE'");
  });

  test('核心包含 101 题精练/40 题逻辑与全部分片；完整包额外含联赛真题', () => {
    expect(sw).toContain("'./data/manifest.json'");
    expect(sw).toContain("'./data/quiz.json'");
    expect(sw).toContain("'./data/logic_questions.json'");
    expect(sw).toContain("urls.push('./data/' + rel);");
    expect(sw).toContain("urls.push('./resource/count.json', './resource/all.json');");
  });

  test('OfflineBank 前端接口与数据管理页按钮接线', () => {
    const api = read('js/core/offline-bank.js');
    ['downloadCore', 'downloadFull', 'clear', 'status'].forEach((name) => {
      expect(api).toContain(name + ': function');
    });
    // M-01：数据管理面板已拆至 user-data.js
    const user = read('js/pages/user-data.js');
    expect(user).toContain('id="userOfflineBankCoreBtn"');
    expect(user).toContain('id="userOfflineBankFullBtn"');
    expect(user).toContain('id="userOfflineBankClearBtn"');
    expect(user).toContain("runOfflineBankDownload(offlineCoreBtn, 'downloadCore')");
    expect(user).toContain("runOfflineBankDownload(offlineFullBtn, 'downloadFull')");
    expect(user).toContain('window.OfflineBank.clear()');
  });

  test('index.html 加载离线题库模块', () => {
    expect(read('index.html')).toMatch(/js\/core\/offline-bank\.js\?v=/);
  });

  test('下载前检查存储配额，空间不足时给出可读提示（M-07）', () => {
    const api = read('js/core/offline-bank.js');
    expect(api).toContain('navigator.storage');
    expect(api).toContain('estimate()');
    expect(api).toContain('可用存储空间不足');
    expect(api).toContain("downloadWithQuota('core'");
    expect(api).toContain("downloadWithQuota('full'");
  });
});
