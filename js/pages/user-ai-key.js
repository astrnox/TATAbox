/**
 * TATABOX — AI Key 配置与用量限制（M-01 自 user.js 拆分）
 * ============================================================
 */
'use strict';

var _AI_DAILY_LIMIT = 100; // 每用户每日限 100 次 AI 调用
var _AI_KEY_STORAGE = 'bioquest_ai_key_config';
var _AI_USAGE_STORAGE = 'bioquest_ai_usage';

// 安全：API Key 存储统一委托 window.BioQuestKeyStore（闭包化单例，P1-3 修复）。
// - 页面内存：默认，刷新后需重新输入 Key；
// - 会话内记住（用户显式勾选）：额外写入 sessionStorage，同标签页刷新可恢复，关闭标签页即清除；
// - 绝不写入 localStorage，避免明文长留存磁盘；也不再使用 window 全局明文属性
//   window.__bioquest_ai_key_memory__（该属性已由 ai-key-store.js 接管并废弃）。

function _getMemKey() {
  try {
    if (window.BioQuestKeyStore && typeof window.BioQuestKeyStore.get === 'function') {
      return window.BioQuestKeyStore.get() || '';
    }
  } catch (e) {}
  return '';
}

function _setMemKey(k, remember) {
  try {
    if (window.BioQuestKeyStore && typeof window.BioQuestKeyStore.set === 'function') {
      window.BioQuestKeyStore.set(k, remember);
    }
  } catch (e) {}
}

function _loadApiKeyConfig() {
  var cfg = { provider: 'deepseek', apiKey: '', model: '', remember: false };
  try {
    var raw = localStorage.getItem(_AI_KEY_STORAGE);
    if (raw) {
      var stored = JSON.parse(raw);
      cfg.provider = stored.provider || cfg.provider;
      cfg.model = stored.model || '';
    }
  } catch (e) {}
  // 旧版 localStorage 明文 Key 的迁移由 BioQuestKeyStore.get() 内部完成并擦除
  cfg.apiKey = _getMemKey();
  cfg.remember = !!(window.BioQuestKeyStore && window.BioQuestKeyStore.isRemember &&
    window.BioQuestKeyStore.isRemember());
  return cfg;
}

function _saveApiKeyConfig(cfg, remember) {
  // API Key 一律经闭包单例保存（可选「会话内记住」），绝不落 localStorage
  _setMemKey((cfg && cfg.apiKey) || '', !!remember);
  try {
    localStorage.setItem(_AI_KEY_STORAGE, JSON.stringify({
      provider: (cfg && cfg.provider) || 'deepseek',
      model: (cfg && cfg.model) || '',
      apiKey: '' // 永不落盘
    }));
  } catch (e) {}
}

function _getApiKeyConfig() {
  return _loadApiKeyConfig();
}

// 获取今日用量（按本地日期重置，与界面「明日 0:00 重置」文案一致）
function _getApiKeyDailyUsage() {
  try {
    var raw = localStorage.getItem(_AI_USAGE_STORAGE);
    var data = raw ? JSON.parse(raw) : {};
    var today = localTodayStr(); // YYYY-MM-DD（本地时区）
    if (data.date !== today) {
      data = { date: today, count: 0 };
      localStorage.setItem(_AI_USAGE_STORAGE, JSON.stringify(data));
    }
    return data;
  } catch (e) {
    return { date: localTodayStr(), count: 0 };
  }
}

// 自增用量（调用 AI 前调用），返回 true 表示可继续，false 表示已达上限
function _incrementAiUsage() {
  var data = _getApiKeyDailyUsage();
  if (data.count >= _AI_DAILY_LIMIT) return false;
  data.count += 1;
  try {
    localStorage.setItem(_AI_USAGE_STORAGE, JSON.stringify(data));
  } catch (e) {}
  return true;
}

// 检查是否可以使用 AI（仅检查每日用量上限，不强制要求自定义 Key）
// 未配置自定义 Key 的用户可使用平台默认 Key，但同样受每日上限限制
function _canUseAi() {
  var usage = _getApiKeyDailyUsage();
  if (usage.count >= _AI_DAILY_LIMIT) {
showToast('今日 AI 调用已达上限（' + _AI_DAILY_LIMIT + ' 次），明日 0:00 重置。配置自定义 API Key 可解锁更多额度。');
    return false;
  }
  return true;
}

// 服务商 → 端点/默认模型 映射
var _AI_PROVIDER_MAP = {
  deepseek:    { base: 'https://api.deepseek.com/v1',           defaultModel: 'deepseek-chat',         name: 'DeepSeek' },
  zhipu:       { base: 'https://open.bigmodel.cn/api/paas/v4',  defaultModel: 'glm-4-flash',           name: '智谱 GLM' },
  qwen:        { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo', name: '通义千问' },
  moonshot:    { base: 'https://api.moonshot.cn/v1',            defaultModel: 'moonshot-v1-8k',        name: 'Kimi' },
  nvidia:      { base: 'https://integrate.api.nvidia.com/v1',   defaultModel: 'meta/llama-3.3-70b-instruct', name: 'NVIDIA NIM' },
  siliconflow: { base: 'https://api.siliconflow.cn/v1',         defaultModel: 'Qwen/Qwen2.5-7B-Instruct', name: '硅基流动' }
};

function _bindApiKeySettings() {
  var toggleBtn = document.getElementById('aiKeyToggleBtn');
  var keyInput = document.getElementById('aiApiKeyInput');
  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', function() {
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        toggleBtn.textContent = '隐藏';
      } else {
        keyInput.type = 'password';
        toggleBtn.textContent = '显示';
      }
    });
    // 用户聚焦输入框时清空遮罩值，允许输入新 Key
    keyInput.addEventListener('focus', function() {
      if (keyInput.value.indexOf('****') !== -1) {
        keyInput.value = '';
        keyInput.removeAttribute('data-has-key');
      }
    });
  }

  // 读取「会话内记住」勾选项
  function _rememberChecked() {
    var cb = document.getElementById('aiKeyRememberCb');
    return !!(cb && cb.checked);
  }

  var saveBtn = document.getElementById('aiKeySaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var inputVal = keyInput.value.trim();
      // 如果输入框是遮罩值（未修改），保留原 Key
      if (inputVal.indexOf('****') !== -1) {
        var existingCfg = _loadApiKeyConfig();
        inputVal = existingCfg.apiKey || '';
      }
      var cfg = {
        provider: document.getElementById('aiProviderSelect').value,
        apiKey: inputVal,
        model: document.getElementById('aiModelInput').value.trim()
      };
      if (!cfg.apiKey) {
        showToast('请输入 API Key');
        return;
      }
      _saveApiKeyConfig(cfg, _rememberChecked());
      // 恢复遮罩显示
      keyInput.value = cfg.apiKey.length > 4 ? '****' + cfg.apiKey.slice(-4) : '****';
      keyInput.type = 'password';
showToast(_rememberChecked()
  ? '已保存（会话内记住：刷新不丢失，关闭标签页自动清除）'
  : '已保存（Key 仅存当前页面内存，刷新页面后需重新输入）');
    });
  }

  var testBtn = document.getElementById('aiKeyTestBtn');
  if (testBtn) {
    testBtn.addEventListener('click', _testAiKeyConnection);
  }

  var clearBtn = document.getElementById('aiKeyClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      var cb = document.getElementById('aiKeyRememberCb');
      // 清除 Key 的同时复位「会话内记住」偏好（remember=false 会一并清除 session 中的 Key 与偏好标记）
      _saveApiKeyConfig({ provider: 'deepseek', apiKey: '', model: '' }, false);
      if (cb) cb.checked = false;
      keyInput.value = '';
      document.getElementById('aiModelInput').value = '';
      document.getElementById('aiProviderSelect').value = 'deepseek';
      showToast('已清除 API Key');
    });
  }
}

function _testAiKeyConnection() {
  var resultEl = document.getElementById('aiKeyTestResult');
  if (!resultEl) return;
  var inputVal = document.getElementById('aiApiKeyInput').value.trim();
  // 如果输入框是遮罩值，从内存单例读取真实 Key（不再触达已废弃的明文全局属性）
  if (inputVal.indexOf('****') !== -1) {
    var existingCfg = _loadApiKeyConfig();
    inputVal = existingCfg.apiKey || '';
  }
  var cfg = {
    provider: document.getElementById('aiProviderSelect').value,
    apiKey: inputVal,
    model: document.getElementById('aiModelInput').value.trim()
  };
  if (!cfg.apiKey) {
    resultEl.textContent = '请先输入 API Key';
    resultEl.style.color = 'var(--color-error,#c0553a)';
    return;
  }

  resultEl.textContent = '正在测试连接...';
  resultEl.style.color = 'var(--text-muted,#8a8a8a)';

  var prov = _AI_PROVIDER_MAP[cfg.provider] || _AI_PROVIDER_MAP.deepseek;
  var model = cfg.model || prov.defaultModel;

  // 简单发一条 chat completions 请求测试
  fetch(prov.base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: '你好' }],
      max_tokens: 10,
      stream: false
    })
  }).then(function(resp) {
    if (resp.ok) {
      resultEl.textContent = '连接成功，模型 ' + model + ' 可用';
      resultEl.style.color = 'var(--color-sage,#3a6b4a)';
      // 保存配置（携带「会话内记住」偏好）
      _saveApiKeyConfig(cfg, document.getElementById('aiKeyRememberCb')
        ? document.getElementById('aiKeyRememberCb').checked : false);
    } else {
      return resp.text().then(function(txt) {
        var msg = '连接失败（HTTP ' + resp.status + '）';
        try { var j = JSON.parse(txt); if (j.error && j.error.message) msg += '：' + j.error.message; } catch(e) {}
        resultEl.textContent = msg;
        resultEl.style.color = 'var(--color-error,#c0553a)';
      });
    }
  }).catch(function(err) {
    resultEl.textContent = '网络错误：' + errText(err);
    resultEl.style.color = 'var(--color-error,#c0553a)';
  });
}

// 暴露给其他模块使用
window._canUseAi = _canUseAi;
window._incrementAiUsage = _incrementAiUsage;
window._getApiKeyConfig = _getApiKeyConfig;
window._AI_PROVIDER_MAP = _AI_PROVIDER_MAP;
window._AI_DAILY_LIMIT = _AI_DAILY_LIMIT;

/* ============== 用户密钥（用于教师添加学生） ============== */

window._getApiKeyConfig = _getApiKeyConfig;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.aiKey = { getApiKeyConfig: _getApiKeyConfig, testAiKeyConnection: _testAiKeyConnection };
})();
