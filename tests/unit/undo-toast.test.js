/**
 * TATABOX — P1-21：可撤销删除（Undo）单元测试
 *
 * 覆盖：
 *   1. app.js 定义 showUndoToast 且暴露 window.showUndoToast；
 *   2. wrongbook 删除路径在删除前捕获行快照；
 *   3. 删除成功后通过 showUndoToast 给出“撤销”入口；
 *   4. 撤销回调通过 window.addWrongQuestion 恢复快照并重渲染。
 * 说明：showUndoToast 依赖 DOM，无法在 node 直接执行，故采用源码级集成断言，
 * 与 tests/unit/app-routes.test.js 保持一致的做法。
 */

const fs = require('fs');
const path = require('path');

const APP_SRC = path.join(__dirname, '..', '..', 'js', 'core', 'app.js');
const WB_SRC = path.join(__dirname, '..', '..', 'js', 'pages', 'wrongbook.js');
const appSource = fs.readFileSync(APP_SRC, 'utf8');
const wbSource = fs.readFileSync(WB_SRC, 'utf8');

describe('P1-21 Undo：showUndoToast 提供方', () => {
  test('app.js 定义 showUndoToast 并暴露到 window', () => {
    expect(appSource).toMatch(/function showUndoToast\(message, onUndo, options\)/);
    expect(appSource).toMatch(/window\.showUndoToast = showUndoToast;/);
  });

  test('撤销条包含可点击的“撤销”按钮（无内联脚本）', () => {
    // M-01：反馈弹窗已拆出 app.js，showUndoToast 之后的边界改为文件末尾
    const fn = appSource.slice(appSource.indexOf('function showUndoToast'));
    expect(fn).toContain('undoBtn');
    expect(fn).toMatch(/undoBtn\.addEventListener\(['"]click['"]/);
    expect(fn).toContain('options.label || \'撤销\'');
  });
});

describe('P1-21 Undo：错题删除接入', () => {
  test('删除前捕获 _currentList 中的行快照', () => {
    const seg = wbSource.slice(wbSource.indexOf('async function _deleteQuestion'), wbSource.indexOf('async function initWrongbook'));
    expect(seg).toMatch(/var snapshot = null;/);
    expect(seg).toMatch(/_currentList\[i\][\s\S]*snapshot/);
  });

  test('删除成功后使用 showUndoToast 呈现撤销入口', () => {
    const seg = wbSource.slice(wbSource.indexOf('async function _deleteQuestion'), wbSource.indexOf('async function initWrongbook'));
    expect(seg).toContain('window.showUndoToast');
    expect(seg).toContain('\'错题已删除\'');
  });

  test('撤销回调通过 window.addWrongQuestion 恢复快照并重渲染', () => {
    const seg = wbSource.slice(wbSource.indexOf('async function _deleteQuestion'), wbSource.indexOf('async function initWrongbook'));
    expect(seg).toContain('window.addWrongQuestion(snap)');
    expect(seg).toContain('await initWrongbook();');
  });
});