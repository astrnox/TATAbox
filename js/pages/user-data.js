/**
 * TATABOX — 数据管理面板（M-01 自 user.js 拆分）
 * ============================================================
 */
'use strict';

function renderDataManagement(container) {
  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">数据管理</div>
      <div class="user-card-subtitle">备份、恢复与清理学习数据</div>

      <div class="user-data-actions">
        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导出加密备份</div>
            <div class="user-data-action-desc">使用自定义备份密码加密导出 (.bqb，PBKDF2 + AES-GCM)，用于数据迁移与灾难还原</div>
          </div>
          <button class="btn btn-sm btn-primary" id="userExportBtn">导出备份</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导出我的数据</div>
            <div class="user-data-action-desc">输出可读的明文 JSON，包含学习记录、收藏、错题与统计，供自行查看与留存（GDPR/个保法数据可携权）</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userExportPlainBtn">导出明文</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">导入学习数据</div>
            <div class="user-data-action-desc">从之前导出的 JSON / .bqb 备份恢复数据（会合并而非覆盖；加密备份需输入原密码）</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userImportBtn">导入</button>
          <input type="file" accept=".json,.bqb,application/json,application/octet-stream" class="user-import-input" id="userImportInput">
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">离线题库（核心）</div>
            <div class="user-data-action-desc">缓存题库分片、101 题精练与 40 题逻辑题，断网也能继续刷题</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userOfflineBankCoreBtn">下载核心包</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">离线题库（完整）</div>
            <div class="user-data-action-desc">额外缓存联赛真题与 IBO 双语真题（约 5MB），适合长期离线备考</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="userOfflineBankFullBtn">下载完整包</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">离线题库状态</div>
            <div class="user-data-action-desc" id="userOfflineBankStatus">正在读取…</div>
          </div>
          <button class="btn btn-sm btn-danger" id="userOfflineBankClearBtn">清除离线包</button>
        </div>

        <div class="user-data-action">
          <div class="user-data-action-info">
            <div class="user-data-action-label">清除所有数据</div>
            <div class="user-data-action-desc" style="color: var(--color-error, #c0553a);">此操作不可恢复，请先导出备份</div>
          </div>
          <button class="btn btn-sm btn-danger" id="userClearBtn">清除数据</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('userExportBtn').addEventListener('click', () => {
    if (typeof exportData !== 'function') {
      showToast('导出模块未就绪');
      return;
    }
    showPasswordPrompt({
      title: '导出加密备份',
      desc: '请设置备份密码（至少 6 位）。导入时需要同一密码，忘记密码将无法解密。',
      minLength: 6,
      okText: '导出'
    }, async function (password) {
      var result = await exportData({ password: password });
      showToast(result ? '加密备份已导出' : '数据导出失败');
    });
  });

  document.getElementById('userExportPlainBtn').addEventListener('click', async () => {
    if (typeof exportData === 'function') {
      var result = await exportData({ encrypted: false });
      showToast(result ? '明文数据已导出（我的数据 .json）' : '数据导出失败');
    } else {
      showToast('导出模块未就绪');
    }
  });

  document.getElementById('userImportBtn').addEventListener('click', () => {
    document.getElementById('userImportInput').click();
  });

  document.getElementById('userImportInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof importData !== 'function') return;
      const text = ev.target.result;

      // 仅 v3（PBKDF2 派生）备份需要密码；v2 旧备份沿用历史密钥，直接兼容导入
      let meta = null;
      try { meta = JSON.parse(text); } catch (e) {}
      const needsPassword = !!(meta && meta.encrypted === true &&
        (meta.kdf === 'PBKDF2-SHA256' || Number(meta.v) >= 3));

      const runImport = async function (password) {
        const success = await importData(text, { password: password || '' });
        if (success) {
          showToast('数据导入成功');
          refreshAllData();
        } else {
          showToast('数据导入失败，请检查文件格式或备份密码');
        }
      };

      if (needsPassword) {
        showPasswordPrompt({
          title: '导入加密备份',
          desc: '该备份使用密码加密，请输入导出时设置的密码。',
          minLength: 1,
          okText: '导入'
        }, runImport);
      } else {
        await runImport('');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // M-14：离线题库包（Service Worker 独立缓存，仅公开题库数据）
  var offlineBankStatusEl = document.getElementById('userOfflineBankStatus');

  function refreshOfflineBankStatus() {
    if (!offlineBankStatusEl) return;
    if (!window.OfflineBank) {
      offlineBankStatusEl.textContent = '当前环境不支持离线缓存';
      return;
    }
    window.OfflineBank.status().then(function (res) {
      if (!res || res.error) {
        offlineBankStatusEl.textContent = '读取失败：' + ((res && res.error) || '未知错误');
        return;
      }
      var label = res.full ? '完整包' : (res.core ? '核心包' : '尚未下载');
      offlineBankStatusEl.textContent = label + (res.entries ? '（' + res.entries + ' 个文件）' : '');
    });
  }

  function runOfflineBankDownload(btn, method) {
    if (!window.OfflineBank) {
      showToast('离线模块未就绪，请刷新页面后重试');
      return;
    }
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '下载中…';
    window.OfflineBank[method]().then(function (res) {
      if (res && res.type === 'OFFLINE_BANK_DONE') {
        if (res.failed) {
          showToast('已缓存 ' + res.cached + ' 个文件，' + res.failed + ' 个失败，请联网后重试');
        } else {
          var size = res.bytes ? '（约 ' + (Math.round(res.bytes / 104857.6) / 10) + ' MB）' : '';
          showToast('离线题库已缓存：' + res.cached + ' 个文件' + size);
        }
        refreshOfflineBankStatus();
      } else {
        showToast('离线缓存失败：' + ((res && res.error) || '未知错误'));
      }
    }).catch(function (err) {
      showToast('离线缓存失败：' + ((err && err.message) || '未知错误'));
    }).then(function () {
      btn.disabled = false;
      btn.textContent = originalText;
    });
  }

  var offlineCoreBtn = document.getElementById('userOfflineBankCoreBtn');
  if (offlineCoreBtn) {
    offlineCoreBtn.addEventListener('click', function () {
      runOfflineBankDownload(offlineCoreBtn, 'downloadCore');
    });
  }
  var offlineFullBtn = document.getElementById('userOfflineBankFullBtn');
  if (offlineFullBtn) {
    offlineFullBtn.addEventListener('click', function () {
      runOfflineBankDownload(offlineFullBtn, 'downloadFull');
    });
  }
  var offlineClearBtn = document.getElementById('userOfflineBankClearBtn');
  if (offlineClearBtn) {
    offlineClearBtn.addEventListener('click', function () {
      if (!window.OfflineBank) {
        showToast('离线模块未就绪，请刷新页面后重试');
        return;
      }
      showConfirmDialog(
        '!',
        '清除离线题库？',
        '仅删除本机缓存的题库包，不影响学习记录与云端正本数据；断网时将无法继续刷题。',
        function () {
          window.OfflineBank.clear().then(function (res) {
            if (res && res.error) showToast('清除失败：' + res.error);
            else showToast('离线题库已清除');
            refreshOfflineBankStatus();
          });
        }
      );
    });
  }
  refreshOfflineBankStatus();

  document.getElementById('userClearBtn').addEventListener('click', () => {
    showConfirmDialog(
      '!',
      '确认清除所有数据？',
      '此操作将删除全部学习记录、收藏、错题、统计、习惯、AI 配置与本地缓存等所有 bioquest_* 数据，且不可恢复。建议先导出备份。',
      () => {
        try {
          // 清除 Web Storage + IndexedDB 用户数据库（clearAllLocalData 现已一并删除 Dexie 数据，
          // 如 cards/reviews/wrongbook/sessions/settings，以及可重建的 BioQuestCache 缓存）
          var wipePromise;
          if (typeof window.clearAllLocalData === 'function') {
            wipePromise = window.clearAllLocalData();
          } else {
            // 兜底：仅清 Web Storage
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (k && (k.indexOf('tatabox_') === 0 || k.indexOf('bioquest_') === 0)) localStorage.removeItem(k);
            }
            wipePromise = Promise.resolve([]);
          }
          // 一并清除 AI Key 内存与会话内 Key
          if (typeof window.BioQuestKeyStore === 'object' && window.BioQuestKeyStore.clear) {
            try { window.BioQuestKeyStore.clear(); } catch (e) {}
          }
          wipePromise.then(function () {
            showToast('所有数据已清除');
            refreshAllData();
          }, function () {
            showToast('部分数据可能未完全清除（请关闭其他标签页后重试）');
            refreshAllData();
          });
        } catch (e) {
          showToast('清除失败: ' + e.message);
        }
      }
    );
  });
}

function showPasswordPrompt(options, onSubmit) {
  options = options || {};
  var minLen = Number(options.minLength) || 1;

  var overlay = document.createElement('div');
  overlay.className = 'user-confirm-overlay';

  var dialog = document.createElement('div');
  dialog.className = 'user-confirm-dialog';

  var icon = document.createElement('div');
  icon.className = 'user-confirm-icon';
  icon.textContent = '密';

  var title = document.createElement('div');
  title.className = 'user-confirm-title';
  title.textContent = options.title || '输入密码';

  var desc = document.createElement('div');
  desc.className = 'user-confirm-text';
  desc.textContent = options.desc || '';

  var input = document.createElement('input');
  input.type = 'password';
  input.id = 'userPwdInput';
  input.autocomplete = 'new-password';
  input.style.cssText = [
    'width:100%', 'box-sizing:border-box', 'margin-top:12px', 'padding:10px 12px',
    'border:1px solid var(--border-light,#e3e0d8)', 'border-radius:8px', 'font-size:0.88rem',
    'background:var(--surface-primary,#fff)', 'color:var(--text-primary,#1a1a1a)', 'outline:none'
  ].join(';');

  var errorEl = document.createElement('div');
  errorEl.id = 'userPwdError';
  errorEl.style.cssText = 'min-height:18px;margin-top:6px;font-size:0.78rem;color:var(--color-error,#c0553a);';

  var actions = document.createElement('div');
  actions.className = 'user-confirm-actions';

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-sm btn-secondary';
  cancelBtn.textContent = '取消';

  var okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn btn-sm btn-primary';
  okBtn.textContent = options.okText || '确认';

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  dialog.appendChild(icon);
  dialog.appendChild(title);
  dialog.appendChild(desc);
  dialog.appendChild(input);
  dialog.appendChild(errorEl);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  function submit() {
    var value = input.value.trim();
    if (value.length < minLen) {
      errorEl.textContent = '密码长度至少 ' + minLen + ' 位';
      input.focus();
      return;
    }
    close();
    if (typeof onSubmit === 'function') onSubmit(value);
  }

  cancelBtn.addEventListener('click', close);
  okBtn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  setTimeout(function () { input.focus(); }, 0);
}

function showConfirmDialog(icon, title, text, onConfirm) {
  var esc = function (s) {
    return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
  var safeIcon = esc(icon);
  const overlay = document.createElement('div');
  overlay.className = 'user-confirm-overlay';
  overlay.innerHTML = `
    <div class="user-confirm-dialog">
      <div class="user-confirm-icon">${safeIcon}</div>
      <div class="user-confirm-title">${esc(title)}</div>
      <div class="user-confirm-text">${esc(text)}</div>
      <div class="user-confirm-actions">
        <button class="btn btn-sm btn-secondary" id="confirmCancel">取消</button>
        <button class="btn btn-sm btn-danger" id="confirmOk">确认清除</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#confirmCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirmOk').addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

window.renderDataManagement = renderDataManagement;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.data = { renderDataManagement: renderDataManagement };
})();
