/**
 * ============================================================
 * TATABOX — 前端 AI 客户端（纯前端，无 server.py 依赖）
 * 默认使用智谱 GLM-4-Flash（免费），支持 Metaso 知识库作为备选
 * 支持 DeepSeek/智谱/通义/Kimi/NVIDIA/SiliconFlow 作为备选
 * ============================================================
 */
(function () {
  'use strict';

  // 知识库 ID（Issue #106：优先读取独立配置文件 js/core/config.js 注入的
  // window.BQ_CONFIG.METASO_SUBJECT_ID；此处保留默认值作为无配置时的兜底）
  var METASO_SUBJECT_ID = '2045811707737636864';
  function _metasoSubjectId() {
    if (typeof window !== 'undefined' && window.BQ_CONFIG &&
        typeof window.BQ_CONFIG.METASO_SUBJECT_ID === 'string' &&
        window.BQ_CONFIG.METASO_SUBJECT_ID) {
      return window.BQ_CONFIG.METASO_SUBJECT_ID;
    }
    return METASO_SUBJECT_ID;
  }

  // 服务商 → base_url + 默认模型
  var PROVIDER_MAP = {
    zhipu:       { base: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash', name: '智谱 GLM' },
    metaso:      { base: 'https://metaso.cn/api/v1', defaultModel: 'gpt-3.5-turbo', name: '秘塔 Metaso' },
    deepseek:    { base: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', name: 'DeepSeek' },
    qwen:        { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo', name: '通义千问' },
    moonshot:    { base: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', name: 'Kimi' },
    nvidia:      { base: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.3-70b-instruct', name: 'NVIDIA NIM' },
    siliconflow: { base: 'https://api.siliconflow.cn/v1', defaultModel: 'Qwen/Qwen2.5-7B-Instruct', name: '硅基流动' }
  };

  // 服务商 → 文生图模型（用于生成题目配图）
  var IMAGE_MODELS = {
    zhipu:       { base: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-3-flash', name: '智谱 CogView-3-Flash（免费）' },
    siliconflow: { base: 'https://api.siliconflow.cn/v1', model: 'stabilityai/stable-diffusion-3-medium', name: '硅基流动 SD3' }
  };

  // 服务商 → 视觉多模态模型（用于图片 OCR、识图等）
  // 按优先级排序：1. 智谱 GLM-4V（中文 OCR 最强）2. 通义 Qwen-VL 3. SiliconFlow Qwen2-VL 4. NVIDIA Llama-Vision
  var VISION_MODELS = {
    zhipu:       { base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-flash', name: '智谱 GLM-4V' },
    qwen:        { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-plus', name: '通义 Qwen-VL' },
    siliconflow: { base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2-VL-72B-Instruct', name: '硅基 Qwen2-VL' },
    nvidia:      { base: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.2-90b-vision-instruct', name: 'NVIDIA Llama-Vision' }
  };

  // P0-1/S-001 修复：移除硬编码内置 API Key，全面转向 BYOK（用户自带 Key）。
  // 安全说明：本文件不再以任何形式写死/携带 LLM API Key。
  //   - Key 由 user.js 在「我的 → 设置」配置，仅保存在页面内存
  //     （window.__bioquest_ai_key_memory__），不落 localStorage、不入 git；
  //   - loadConfig() 返回值不再包含 apiKey（控制台调用也不会泄露）；
  //   - 无 Key 时 AI 入口显示配置引导，刷题/错题本/卡片/实验等核心功能不受影响。
  var DEFAULT_PROVIDER = 'zhipu'; // 无用户配置时的默认服务商（智谱 glm-4-flash 免费）

  var AI_DAILY_USAGE_LIMIT = 9999;            // 用户要求：不要权限限制，额度放最大
  var AI_DEFAULT_MAX_TOKENS = 2048;         // 默认最大生成 token 数
  var AI_STREAM_MAX_TOKENS = 1024;          // 流式问答默认最大 token 数
  var AI_ERROR_TEXT_LIMIT = 200;            // 错误响应文本截断长度
  var AI_STREAM_IDLE_TIMEOUT_MS = 60000;    // 流式响应空闲超时（自动结束）
  var AI_DEFAULT_IMAGE_SIZE = '1024x1024';  // 文生图默认尺寸
  var AI_RETRY_MAX_ATTEMPTS = 3;           // 自动重试最大次数（专门应对 ERR_INCOMPLETE_CHUNKED_ENCODING 等网络断流）
  var AI_RETRY_BASE_DELAY_MS = 800;        // 重试退避基础延迟

  //   - 对 TypeError (网络层错误、chunked 编码不完整) 自动重试
  //   - 对 HTTP 5xx / 429 (限流/服务器错误) 自动重试
  //   - 4xx (除 429) 不重试，直接抛错
  function _isRetriableError(err, resp) {
    if (!err && resp) {
      // 服务器端错误或限流 → 重试
      return resp.status === 429 || resp.status >= 500;
    }
    if (!err) return false;
    var msg = (err.message || String(err)).toLowerCase();
    // ERR_INCOMPLETE_CHUNKED_ENCODING 对应浏览器原生错误
    if (msg.indexOf('chunk') >= 0 || msg.indexOf('incomplete') >= 0) return true;
    if (msg.indexOf('networkerror') >= 0 || msg.indexOf('network error') >= 0) return true;
    if (msg.indexOf('load failed') >= 0 || msg.indexOf('fetch') >= 0) return true;
    if (msg.indexOf('timeout') >= 0 || msg.indexOf('eof') >= 0) return true;
    if (msg.indexOf('connection') >= 0) return true;
    // TypeError 一般就是网络层 / CORS / 断流类错误 → 重试
    if (err instanceof TypeError) return true;
    return false;
  }

  // 覆盖 OpenAI 格式 / DashScope 格式 / Zhipu 格式 / 纯文本错误
  // 若遇到"modelCode 不存在 / Invalid model"等已知模型类错误，自动在错误信息末尾追加诊断建议
  function _extractApiError(status, rawText) {
    var msg = 'HTTP ' + status;
    var txt = (typeof rawText === 'string') ? rawText : '';
    var details = '';
    var isModelError = false;
    var isAuthError = (status === 401 || status === 403);
    var isRateError   = (status === 429);

    function addHint(d) {
      if (!d) return;
      if (details.length + d.length + 2 < AI_ERROR_TEXT_LIMIT * 1.5) {
        details += (details ? '；' : '') + d;
      }
    }

    try {
      var j = JSON.parse(txt);
      // OpenAI 标准
      if (j.error && typeof j.error === 'object') {
        var em = j.error.message;
        var ec = j.error.code || j.error.type || j.error.param || '';
        if (typeof em === 'string') addHint(em);
        if (typeof ec === 'string' && ec && ec !== em) addHint('错误码 ' + ec);
        if (j.error.code && String(j.error.code).toLowerCase().indexOf('model') >= 0) isModelError = true;
        if (em && /invalid model|model not found|model.*not exist|模型.*不[存在效]|modelcode[\s：:]|model_code/i.test(em)) isModelError = true;
      } else if (typeof j.message === 'string') {
        addHint(j.message);
        if (/invalid model|model not found|model.*not exist|模型.*不[存在效]|modelcode[\s：:]|error.*model/i.test(j.message)) isModelError = true;
      } else if (typeof j.msg === 'string') {
        addHint(j.msg);
        if (/模型.*不[存在效]|modelcode[\s：:]|invalid model/i.test(j.msg)) isModelError = true;
      } else if (typeof j.error_msg === 'string') {
        addHint(j.error_msg);
        if (/模型.*不[存在效]|modelcode[\s：:]|invalid model/i.test(j.error_msg)) isModelError = true;
      } else if (typeof j.err_msg === 'string') {
        addHint(j.err_msg);
        if (/模型.*不[存在效]|modelcode[\s：:]|invalid model/i.test(j.err_msg)) isModelError = true;
      }
      // Zhipu/DashScope 顶层 code 字段：若为参数类错误且 message/details 命中模型关键字 → 视为模型错误
      var topCode = (typeof j.code === 'string') ? j.code : (typeof j.code === 'number' ? String(j.code) : '');
      if (/invalid(parameter|request)|badrequest|bad_request|paramerror/i.test(topCode) || topCode === '400') {
        var joined = (details || '') + ' ' + (typeof j.code === 'string' ? j.code : '');
        if (/模型|modelcode[\s：:]|model[_ -]?name|invalid.*model/i.test(joined)) isModelError = true;
      }
      // 某些平台把请求 ID 放出来也没用；如果 details 还是空，尽量用其他字段
      if (!details && typeof j.code !== 'undefined') addHint('错误码 ' + String(j.code));
    } catch (e) {
      // 不是 JSON，截断纯文本
      if (txt) addHint(txt.slice(0, AI_ERROR_TEXT_LIMIT));
    }

    // 再查一次：raw txt 兜底（DashScope/Zhipu 各种中文变体，兼容半角/全角冒号）
    if (!isModelError) {
      if (/modelcode[\s：:]*不[存在效]|模型名(?:不[存在效]|无效)|invalid model name|模型.*不存在/i.test(txt)) isModelError = true;
    }

    if (details) msg += '：' + details;

    // 追加人类可读的诊断建议（模型错误优先，避免 400 通用建议掩盖更精确的提示）
    if (isModelError) {
      msg += '。请前往「我的 → 设置」确认所选服务商与"模型名称"匹配，可清空模型名使用推荐默认模型（已内置别名自动纠正，刷新后重试）。';
    } else if (isAuthError) {
      msg += '。API Key 无效或权限不足，请前往「我的 → 设置」检查 Key；若是服务商默认内置 Key 过期，可配置自有 Key 解决。';
    } else if (isRateError) {
      msg += '。该服务商已限流，请稍后重试或切换到其他服务商。';
    } else if (status === 400) {
      msg += '。请求参数异常，可尝试清空"模型名称"使用系统推荐模型。';
    }
    return msg;
  }

  function fetchWithRetry(url, options, attemptLeft, baseDelay) {
    attemptLeft = attemptLeft != null ? attemptLeft : AI_RETRY_MAX_ATTEMPTS;
    baseDelay = baseDelay || AI_RETRY_BASE_DELAY_MS;
    return fetch(url, options).then(function (resp) {
      if (_isRetriableError(null, resp) && attemptLeft > 1) {
        console.warn('[ai-client] HTTP ' + resp.status + ' 可重试，剩余 ' + (attemptLeft - 1) + ' 次');
        return new Promise(function (resolve) {
          setTimeout(function () {
            // 消费掉响应体避免 memory leak
            try { resp.text().catch(function () {}); } catch (e) {}
            resolve(fetchWithRetry(url, options, attemptLeft - 1, baseDelay * 2));
          }, baseDelay);
        });
      }
      return resp;
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw err; // 用户主动取消 → 不重试
      if (_isRetriableError(err) && attemptLeft > 1) {
        var triesLeft = attemptLeft - 1;
        console.warn('[ai-client] 网络错误「' + (err.message || err) + '」，重试 ' + triesLeft + ' 次…');
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            fetchWithRetry(url, options, triesLeft, baseDelay * 2).then(resolve, reject);
          }, baseDelay);
        });
      }
      // 用完重试次数 → 抛出最终错误（带清晰诊断）
      if (_isRetriableError(err)) {
        var finalErr = new Error('AI 未返回内容，请重试（网络连接中断，已自动重试 ' + AI_RETRY_MAX_ATTEMPTS + ' 次仍失败）。详细：' + (err.message || err));
        finalErr.cause = err;
        throw finalErr;
      }
      throw err;
    });
  }

  /* ============================================================
   * Issue P1-16（#135）：AI 请求限流与去重
   * ------------------------------------------------------------
   * 1) 速率限制：相邻请求最小启动间隔（AI_MIN_INTERVAL_MS，默认
   *    600ms ≈ 100 次/分钟），超出的请求自动排队而非直接拒绝；
   * 2) 并发上限：同时在飞的 AI 请求最多 AI_MAX_CONCURRENT 个，
   *    防止快速连点并发打爆配额；
   * 3) 排队超时：等待超过 AI_QUEUE_TIMEOUT_MS 直接报错，不无限堆积；
   * 4) 请求去重：同指纹（endpoint+body 哈希）的非流式请求在复用
   *    窗口内共享同一 Promise，快速重复点击只发一次真实请求。
   * 说明：流式请求（streamChat）因各调用方持有独立 onChunk 回调，
   *    不做结果复用，但同样受速率限制与并发上限约束；
   *    tutor/discussion 模块已有的"新请求 abort 旧请求"逻辑保持不变。
   * ============================================================ */
  var AI_MAX_CONCURRENT = 3;        // 同时在飞的 AI 请求上限
  var AI_MIN_INTERVAL_MS = 600;     // 相邻请求最小启动间隔（滑动窗口节流）
  var AI_QUEUE_TIMEOUT_MS = 15000;  // 排队等待上限（超时报错）
  var AI_DEDUP_TTL_MS = 5000;       // 去重指纹复用窗口（请求发起后）
  var AI_DEDUP_MAP_MAX = 64;        // 去重表容量上限（防内存无限增长）

  var _aiQueue = [];                // 等待启动的请求队列
  var _aiInFlight = 0;              // 在飞请求计数
  var _aiLastStartAt = 0;           // 上一次请求启动时间戳
  var _aiDedupMap = new Map();      // fingerprint -> { promise, ts }
  var _aiDrainTimer = null;         // 节流排空定时器（去重）

  function _hashString(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
    return (h >>> 0).toString(36);
  }

  /** 请求指纹：endpoint + 请求体哈希（非流式去重用） */
  function _requestFingerprint(url, bodyObj) {
    var bodyStr = '';
    try { bodyStr = JSON.stringify(bodyObj); } catch (e) {}
    return url + '#' + _hashString(bodyStr);
  }

  /**
   * P1-16：统一的 AI 请求调度入口（限流 + 并发上限 + 排队 + 去重）。
   * @param {Function} starter 无参函数，启动真实请求并返回 Promise
   * @param {string|null} fingerprint 请求指纹（非 null 时启用并发去重）
   * @returns {Promise}
   */
  function _scheduleAiRequest(starter, fingerprint) {
    // 去重命中：同指纹请求仍在复用窗口内 → 共享同一 Promise
    if (fingerprint) {
      var hit = _aiDedupMap.get(fingerprint);
      if (hit && (Date.now() - hit.ts) < AI_DEDUP_TTL_MS) return hit.promise;
    }

    var promise = new Promise(function (resolve, reject) {
      _aiQueue.push({ starter: starter, resolve: resolve, reject: reject, enqueuedAt: Date.now() });
      _drainAiQueue();
    });

    if (fingerprint) {
      var entry = { promise: promise, ts: Date.now() };
      _aiDedupMap.set(fingerprint, entry);
      // 容量控制：超限时清掉最旧的过期项
      if (_aiDedupMap.size > AI_DEDUP_MAP_MAX) {
        var cutoff = Date.now() - AI_DEDUP_TTL_MS;
        _aiDedupMap.forEach(function (v, k) { if (v.ts < cutoff) _aiDedupMap.delete(k); });
      }
      // 共享的 promise 附加空 catch，避免无人处理拒绝时触发全局告警
      promise.catch(function () {});
    }
    return promise;
  }

  function _drainAiQueue() {
    while (_aiQueue.length > 0) {
      if (_aiInFlight >= AI_MAX_CONCURRENT) return;
      // 最小启动间隔（滑动窗口节流）：未到间隔则定时后重试
      var wait = AI_MIN_INTERVAL_MS - (Date.now() - _aiLastStartAt);
      if (wait > 0) {
        if (!_aiDrainTimer) {
          _aiDrainTimer = setTimeout(function () {
            _aiDrainTimer = null;
            _drainAiQueue();
          }, wait + 5);
        }
        return;
      }
      var job = _aiQueue.shift();
      // 排队超时：还没启动就超时 → 拒绝并继续处理后续任务
      if (Date.now() - job.enqueuedAt > AI_QUEUE_TIMEOUT_MS) {
        job.reject(new Error('AI 请求排队超时（当前请求过多），请稍后重试'));
        continue;
      }
      _aiInFlight++;
      _aiLastStartAt = Date.now();
      Promise.resolve()
        .then(job.starter)
        .then(job.resolve, job.reject)
        .then(function () {
          _aiInFlight--;
          _drainAiQueue();
        });
    }
  }

  /** P1-16：调度器状态（供诊断/测试） */
  function _schedulerStats() {
    return {
      inFlight: _aiInFlight,
      queued: _aiQueue.length,
      dedupEntries: _aiDedupMap.size,
      maxConcurrent: AI_MAX_CONCURRENT,
      minIntervalMs: AI_MIN_INTERVAL_MS
    };
  }

  // 加载用户配置（与 user.js 共享 localStorage key）
  // 统一规则（P0-1/S-001 修复，BYOK）：
  //   1) 用户在「我的 → 设置」配置的 Key 保存在页面内存，通过 _getApiKey() 读取；
  //   2) loadConfig() 只返回非敏感偏好（provider/model），绝不携带 apiKey；
  //   3) 无 Key 时不兜底任何内置密钥，由 canUse() 给出配置引导。
  function _isValidKey(k) {
    if (!k) return false;
    if (typeof k !== 'string') return false;
    var s = k.trim();
    if (!s) return false;
    // 常见占位符/示例值/空 Key 写法
    var blk = ['your', 'xxx', 'xxx...', 'sk-', 'please', 'demo', 'changeme', 'change_me', 'none', 'null', 'undefined', 'test',
               'your-key', 'your-key-here', 'yourapikey', 'your_api_key', 'yourkeyhere',
               'sample', 'example', 'placeholder', 'abc', 'abc123', 'foobar', 'foo', 'bar'];
    var low = s.toLowerCase();
    for (var i = 0; i < blk.length; i++) {
      if (low === blk[i]) return false;
      if (blk[i] === 'sk-' && low === 'sk-') return false;
    }
    if (s.length < 8) return false; // 过短不可能是真实 Key
    return true;
  }

  // 模型名归一化（为每个 provider 建立"别名 → 官方模型 ID"映射）
  // 原因：用户会写错/切换 provider 后保留旧模型名/用空格下划线代替连字符，导致 400 modelCode 不存在。
  // 防御策略：若归一化后仍明显不属于该 provider 的家族模型，回落到 PROVIDER_MAP.defaultModel。
  function _normalizeModel(provider, modelName) {
    if (!modelName) return null;
    var m = String(modelName).trim();
    if (!m) return null;
    var ml = m.toLowerCase().replace(/[\s_]+/g, '-').replace(/--+/g, '-');

    function fallin(patterns) {
      for (var i = 0; i < patterns.length; i++) {
        if (ml.indexOf(patterns[i]) >= 0) return true;
      }
      return false;
    }

    switch (provider) {
      case 'zhipu': {
        if (ml.indexOf('glm') !== 0 && ml !== '') {
          if (ml.indexOf('cogview') >= 0) return null; // 文生图模型，不在这里映射
          if (ml.indexOf('4v') >= 0 || ml.indexOf('vision') >= 0) return 'glm-4v-flash';
          return PROVIDER_MAP.zhipu.defaultModel; // 明显不匹配，回落到默认
        }
        if (ml.indexOf('4v') >= 0 || ml.indexOf('vision') >= 0) {
          // glm-4v-* 系列
          if (ml.indexOf('plus') >= 0) return 'glm-4v-plus';
          return 'glm-4v-flash';
        }
        if (ml.indexOf('flash') >= 0) return 'glm-4-flash';
        if (ml.indexOf('plus') >= 0)  return 'glm-4-plus';
        if (ml.indexOf('long') >= 0)  return 'glm-4-long';
        if (ml.indexOf('air') >= 0)   return 'glm-4-air';
        if (ml.indexOf('5') >= 0)     return 'glm-5-flash';
        return 'glm-4-flash';         // 任何其他 glm 统一成默认免费模型
      }
      case 'qwen': {
        // 通义千问 DashScope：模型名全是 qwen- 前缀
        if (ml.indexOf('qwen') !== 0 && ml.indexOf('qw') !== 0) {
          // 含其他平台家族关键词 → 明显不匹配，回落
          if (fallin(['glm','deepseek','moonshot','llama','qwen-math','qwen-coder'])) {
            if (ml.indexOf('math') >= 0) return 'qwen-math-plus';
            if (ml.indexOf('coder') >= 0) return 'qwen-coder-plus';
          }
          return PROVIDER_MAP.qwen.defaultModel;
        }
        if (ml.indexOf('vl') >= 0 || ml.indexOf('vision') >= 0 || ml.indexOf('vplus') >= 0) {
          if (ml.indexOf('max') >= 0) return 'qwen-vl-max';
          if (ml.indexOf('plus') >= 0) return 'qwen-vl-plus';
          return 'qwen-vl-plus';
        }
        if (ml.indexOf('long') >= 0)     return 'qwen-long';
        if (ml.indexOf('max') >= 0)      return 'qwen-max';
        if (ml.indexOf('plus') >= 0)     return 'qwen-plus';
        if (ml.indexOf('turbo') >= 0)    return 'qwen-turbo';
        if (ml.indexOf('omni') >= 0)     return 'qwen-omni-turbo';
        if (ml.indexOf('coder') >= 0)    return 'qwen-coder-plus';
        if (ml.indexOf('math') >= 0)     return 'qwen-math-plus';
        // qwen3 系列
        if (ml.indexOf('3-72b') >= 0)    return 'qwen3-72b';
        if (ml.indexOf('3-32b') >= 0)    return 'qwen3-32b';
        if (ml.indexOf('3-14b') >= 0)    return 'qwen3-14b';
        if (ml.indexOf('3-8b')  >= 0)    return 'qwen3-8b';
        if (ml.indexOf('3-4b')  >= 0)    return 'qwen3-4b';
        if (ml.indexOf('3-0.5b')>= 0)    return 'qwen3-0.5b';
        if (ml.indexOf('3')     >= 0)    return 'qwen3-8b'; // 笼统 qwen3 → 8b
        return 'qwen-turbo'; // 其他回落
      }
      case 'deepseek': {
        if (ml.indexOf('deepseek') !== 0 && ml.indexOf('ds-') !== 0) {
          if (ml.indexOf('reasoner') >= 0) return 'deepseek-reasoner';
          if (fallin(['glm','qwen','moonshot','llama'])) return PROVIDER_MAP.deepseek.defaultModel;
        }
        if (ml.indexOf('reasoner') >= 0 || ml.indexOf('r1') >= 0) return 'deepseek-reasoner';
        if (ml.indexOf('chat')     >= 0 || ml.indexOf('v3') >= 0) return 'deepseek-chat';
        return 'deepseek-chat';
      }
      case 'moonshot': {
        if (ml.indexOf('moonshot') !== 0 && ml.indexOf('kimi') !== 0) {
          if (fallin(['glm','qwen','deepseek','llama'])) return PROVIDER_MAP.moonshot.defaultModel;
        }
        if (ml.indexOf('128k') >= 0) return 'moonshot-v1-128k';
        if (ml.indexOf('32k')  >= 0) return 'moonshot-v1-32k';
        if (ml.indexOf('8k')   >= 0) return 'moonshot-v1-8k';
        return 'moonshot-v1-8k';
      }
      case 'nvidia': {
        // NVIDIA NIM 默认 meta/llama-3.3-70b-instruct；用户会把斜杠/大小写写错
        if (ml.indexOf('llama') < 0 && ml.indexOf('mistral') < 0 && ml.indexOf('nemotron') < 0 && ml.indexOf('qwen') < 0) {
          return PROVIDER_MAP.nvidia.defaultModel;
        }
        // 统一成"组织/模型-版本-尺寸-能力"的官方目录格式（命中则替换）
        var llama33_70b = /llama[_\-]?3\.?3[_\-]?70b/i;
        var llama33_8b  = /llama[_\-]?3\.?3[_\-]?8b/i;
        var llama32_90b = /llama[_\-]?3\.?2[_\-]?90b/i;
        var llama32_vision = /llama[_\-]?3\.?2.*vision|llama[_\-]?vision/i;
        if (llama32_vision.test(m)) return 'meta/llama-3.2-90b-vision-instruct';
        if (llama32_90b.test(m))   return 'meta/llama-3.2-90b-vision-instruct';
        if (llama33_70b.test(m))   return 'meta/llama-3.3-70b-instruct';
        if (llama33_8b.test(m))    return 'meta/llama-3.3-8b-instruct';
        return PROVIDER_MAP.nvidia.defaultModel;
      }
      case 'siliconflow': {
        // 硅基流动：格式都是 "Org/Model-Variant-Size"
        if (ml.indexOf('/') >= 0) return m; // 已带组织名，原样返回
        // 用户简写：Qwen2.5-7B-Instruct → Qwen/Qwen2.5-7B-Instruct
        var mRaw = m; // 保留原大小写（Org 名区分大小写）
        if (/^qwen[\s_\-.]?2[\s_\-.]?5[\s_\-.]?7b/i.test(mRaw))  return 'Qwen/Qwen2.5-7B-Instruct';
        if (/^qwen[\s_\-.]?2[\s_\-.]?5[\s_\-.]?14b/i.test(mRaw)) return 'Qwen/Qwen2.5-14B-Instruct';
        if (/^qwen[\s_\-.]?2[\s_\-.]?5[\s_\-.]?32b/i.test(mRaw)) return 'Qwen/Qwen2.5-32B-Instruct';
        if (/^qwen[\s_\-.]?2[\s_\-.]?5[\s_\-.]?72b/i.test(mRaw)) return 'Qwen/Qwen2.5-72B-Instruct';
        if (/^qwen[\s_\-.]?3[\s_\-.]?[\d.]+b/i.test(mRaw))       return 'Qwen/Qwen3-8B';
        if (/^llama[\s_\-.]?3[\s_\-.]?1[\s_\-.]?8b/i.test(mRaw)) return 'meta-llama/Llama-3.1-8B-Instruct';
        if (/^deepseek[\s_\-.]?v3|deepseek[\s_\-.]?chat/i.test(mRaw)) return 'deepseek-ai/DeepSeek-V3';
        // 其他回落默认
        return PROVIDER_MAP.siliconflow.defaultModel;
      }
      case 'metaso':
        return 'gpt-3.5-turbo';
      default:
        return m;
    }
  }

  function loadConfig() {
    // P0-1/S-001 修复：只返回非敏感偏好（provider/model），不含 apiKey。
    // 实际 Key 由 _getApiKey() 从页面内存读取，仅供内部 fetch 使用。
    var prefs = { provider: DEFAULT_PROVIDER, model: '' };
    try {
      var rawPref = localStorage.getItem('tatabox_ai_key_config');
      if (rawPref) {
        var stored = JSON.parse(rawPref);
        if (stored) {
          prefs.provider = stored.provider || prefs.provider;
          prefs.model = stored.model || '';
        }
      }
    } catch (e) {}

    var model = _normalizeModel(prefs.provider, prefs.model) ||
      (PROVIDER_MAP[prefs.provider] ? PROVIDER_MAP[prefs.provider].defaultModel : '');
    return { provider: prefs.provider, model: model };
  }

  // 读取当前有效 API Key（仅内部使用，不对外返回）：
  //   P1-3 修复：统一走 window.BioQuestKeyStore 闭包单例读取。
  //   该单例负责旧版 localStorage 明文迁移与「会话内记住」的恢复，
  //   不再在 window 上暴露可直读的明文属性 window.__bioquest_ai_key_memory__。
  function _getApiKey() {
    try {
      if (typeof window.BioQuestKeyStore === 'object' && typeof window.BioQuestKeyStore.get === 'function') {
        var k = window.BioQuestKeyStore.get();
        return _isValidKey(k) ? k : '';
      }
    } catch (e) {}
    // 兜底：极早期版本可能在 window 上残留明文（理论上已被 ai-key-store 迁移清除）
    try {
      if (window && typeof window.__bioquest_ai_key_memory__ === 'string') return window.__bioquest_ai_key_memory__;
    } catch (e) {}
    return '';
  }

  // 检查每日用量上限
  function getUsage() {
    try {
      var raw = localStorage.getItem('tatabox_ai_usage');
      var data = raw ? JSON.parse(raw) : {};
      var today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) {
        data = { date: today, count: 0 };
        localStorage.setItem('tatabox_ai_usage', JSON.stringify(data));
      }
      return data;
    } catch (e) { return { date: new Date().toISOString().slice(0, 10), count: 0 }; }
  }

  function incrementUsage() {
    var data = getUsage();
    if (data.count >= AI_DAILY_USAGE_LIMIT) return false;
    data.count += 1;
    try { localStorage.setItem('tatabox_ai_usage', JSON.stringify(data)); } catch (e) {}
    return true;
  }

  function canUse() {
    var cfg = loadConfig();
    var data = getUsage();
    // 调用额度（已放大到 9999，基本不限）
    if (data.count >= AI_DAILY_USAGE_LIMIT) return { ok: false, reason: '今日 AI 调用已达上限（' + AI_DAILY_USAGE_LIMIT + ' 次），明日 0:00 重置' };
    // P0-1/S-001 修复：无内置兜底 Key，一律 BYOK。未配置则给出配置引导。
    if (!_isValidKey(_getApiKey())) {
      return { ok: false, reason: '尚未配置 AI API Key，请前往「我的 → 设置」填写你自己的免费 Key（智谱 glm-4-flash、DeepSeek 均有免费额度）。' };
    }
    return { ok: true, useBackend: false, config: cfg };
  }

  /**
   * 流式对话（SSE）
   * @param {Object} opts - { messages, temperature, maxTokens, onChunk, onDone, onError, signal }
   * @returns {Promise<void>}
   */
  function streamChat(opts) {
    var check = canUse();
    if (!check.ok) {
      if (opts.onError) opts.onError(new Error(check.reason));
      return Promise.reject(new Error(check.reason));
    }

    // 历史上这里会走到 server.py 的 /chat 代理端点，但该端点在 agent sandbox
    // 预览环境返回 HTTP 501（NOT IMPLEMENTED）。
    // P0-1/S-001 修复后：无内置兜底 Key，一律走 check.config 下的 PROVIDER_MAP
    // 直连用户自配 Key；未配置时 canUse() 已在入口拦截并给出引导。
    var cfg = check.config;
    if (!cfg) cfg = loadConfig();
    var prov = PROVIDER_MAP[cfg.provider] || PROVIDER_MAP.deepseek;
    var model = cfg.model || prov.defaultModel;
    var url = prov.base + '/chat/completions';

    var body = {
      model: model,
      messages: opts.messages,
      temperature: opts.temperature != null ? opts.temperature : 0.7,
      max_tokens: opts.maxTokens || AI_DEFAULT_MAX_TOKENS,
      stream: true
    };
    // 秘塔知识库：注入 subject_id
    if (cfg.provider === 'metaso' && _metasoSubjectId()) {
      body.subject_id = _metasoSubjectId();
    }

    return _scheduleAiRequest(function () {
      // P1-16：排队期间用户可能已中止（切换问题/停止生成）→ 静默结束
      if (opts.signal && opts.signal.aborted) return Promise.resolve();
      return fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _getApiKey(),
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: opts.signal
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (txt) {
            throw new Error(_extractApiError(resp.status, txt));
          });
        }
        incrementUsage();
        return _pumpSse(resp, opts);
      }).catch(function (err) {
        if (err.name === 'AbortError') return;
        // 流式失败 → 自动回退非流式
        console.warn('[ai-client] 流式失败，回退非流式:', err.message);
        _streamFallbackToChat(opts, cfg, model);
      });
    }, null); // 流式请求各调用方持有独立回调，不做结果去重（仅限流）
  }

  // 流式失败时回退到非流式（Metaso 等API流式不稳定时使用）
  function _streamFallbackToChat(opts, cfg, model) {
    var prov = PROVIDER_MAP[cfg.provider] || PROVIDER_MAP.metaso;
    var url = prov.base + '/chat/completions';
    var body = {
      model: model || cfg.model || prov.defaultModel,
      messages: opts.messages,
      temperature: opts.temperature != null ? opts.temperature : 0.7,
      max_tokens: opts.maxTokens || AI_DEFAULT_MAX_TOKENS,
      stream: false
    };
    if (cfg.provider === 'metaso' && _metasoSubjectId()) {
      body.subject_id = _metasoSubjectId();
    }
    fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + _getApiKey()
      },
      body: JSON.stringify(body),
      signal: opts.signal
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          throw new Error(_extractApiError(resp.status, txt));
        });
      }
      return resp.json();
    }).then(function (data) {
      // 检查 Metaso 错误格式
      if (data.code && data.code !== 200) {
        throw new Error(data.message || 'API 返回错误码 ' + data.code);
      }
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) {
        throw new Error('API 返回内容为空');
      }
      if (opts.onChunk) opts.onChunk(content);
      if (opts.onDone) opts.onDone();
    }).catch(function (err) {
      if (err.name === 'AbortError') return;
      if (opts.onError) opts.onError(err);
    });
  }

  /**
   * 对话接口（Issue #136：全链路流式支持）
   *  - opts.stream === true 或传入 opts.onChunk 时自动走 SSE 流式分块输出；
   *  - 流式响应最终以 { choices:[{ message:{ role:'assistant', content } }] } 形态 resolve，
   *    与原有非流式返回结构一致，调用方无需改动；
   *  - 未传 onChunk / stream 时保持原「一次性完整返回」行为。
   */
  function chat(opts) {
    var check = canUse();
    if (!check.ok) return Promise.reject(new Error(check.reason));

    // 移除 /chat 后端代理（该端点在预览环境返回 501），一律直连 PROVIDER_MAP
    var cfg = check.config;
    if (!cfg) cfg = loadConfig();
    var prov = PROVIDER_MAP[cfg.provider] || PROVIDER_MAP.deepseek;
    var model = cfg.model || prov.defaultModel;
    var url = prov.base + '/chat/completions';

    var wantsStream = !!opts && (opts.stream === true || typeof opts.onChunk === 'function');

    var body = {
        model: model,
        messages: opts.messages,
        temperature: opts.temperature != null ? opts.temperature : 0.3,
        max_tokens: opts.maxTokens || AI_STREAM_MAX_TOKENS,
        stream: !!wantsStream
      };
      if (cfg.provider === 'metaso' && _metasoSubjectId()) {
        body.subject_id = _metasoSubjectId();
      }

    // Issue #136：流式对话（opts.onChunk / opts.stream 触发）
    if (wantsStream) {
      return _scheduleAiRequest(function () {
        return fetchWithRetry(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + _getApiKey(),
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(body),
          signal: opts.signal
        }).then(function (resp) {
          if (!resp.ok) {
            return resp.text().then(function (txt) {
              throw new Error(_extractApiError(resp.status, txt));
            });
          }
          incrementUsage();
          var full = '';
          var settled = false;
          return new Promise(function (resolve, reject) {
            function finish(chunkText) {
              if (settled) return;
              settled = true;
              resolve({ choices: [{ message: { role: 'assistant', content: chunkText } }] });
            }
            function fail(err) {
              if (settled) return;
              settled = true;
              if (opts.onError) opts.onError(err);
              reject(err);
            }
            // 复用 SSE 解析：增量 onChunk / onDone / onError
            _pumpSse(resp, {
              signal: opts.signal,
              onChunk: function (chunk) {
                full += chunk;
                if (opts.onChunk) opts.onChunk(chunk);
                if (opts.onProgress) opts.onProgress(full);
              },
              onDone: function () { finish(full); },
              onError: function (err) { fail(err); }
            }).catch(function (err) {
              // 流中途 reader 异常：AbortError 由 pump 内部处理，其余按出错结束
              fail(err && err.name === 'AbortError' ? new Error('AI 请求已中止') : err);
            });
          });
        }).catch(function (err) {
          if (err.name === 'AbortError') throw err;
          if (opts.onError) opts.onError(err);
          throw err;
        });
      }, _requestFingerprint(url, body));
    }

    // P1-16：非流式请求走调度器（限流 + 并发上限 + 同指纹并发去重）
    return _scheduleAiRequest(function () {
      return fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _getApiKey()
        },
        body: JSON.stringify(body),
        signal: opts.signal
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (txt) {
            throw new Error(_extractApiError(resp.status, txt));
          });
        }
        incrementUsage();
        return resp.json();
      }).catch(function (err) {
        if (err.name === 'AbortError') throw err;
        // 纯前端项目无后端，直连失败直接抛错
        throw err;
      });
    }, _requestFingerprint(url, body));
  }

  function _pumpSse(resp, opts) {
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var IDLE_TIMEOUT = AI_STREAM_IDLE_TIMEOUT_MS;
    var idleTimer = null;
    var aborted = false;
    var firstChunk = true;

    function clearIdle() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    }
    function resetIdle() {
      clearIdle();
      idleTimer = setTimeout(function () {
        if (!aborted) {
          console.warn('[ai-client] 流式空闲超时(60s)，自动结束');
          aborted = true;
          try { reader.cancel(); } catch (e) {}
          if (opts.onDone) opts.onDone();
        }
      }, IDLE_TIMEOUT);
    }
    resetIdle();

    function pump() {
      return reader.read().then(function (result) {
        if (aborted) return;
        resetIdle();
        if (result.done) {
          clearIdle();
          if (opts.onDone) opts.onDone();
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });

        // 首次收到数据时检测非 SSE 错误响应
        if (firstChunk) {
          firstChunk = false;
          var peek = buffer.trim();
          // 检测 JSON 错误响应（如 {"code":5000,"message":"..."}）
          if (peek.charAt(0) === '{') {
            try {
              var errObj = JSON.parse(peek);
              if (errObj.code || errObj.error) {
                var rawErrMsg = errObj.message || (errObj.error && errObj.error.message) || 'API 返回错误';
                var errMsg = _extractApiError(errObj.status || errObj.code || 400, peek);
                // 如果 _extractApiError 没拿到具体 message，就 fallback 用原始
                if (!errMsg || /HTTP \d+$/.test(errMsg)) errMsg = rawErrMsg || 'API 返回错误';
                aborted = true;
                try { reader.cancel(); } catch (e) {}
                if (opts.onError) opts.onError(new Error(errMsg));
                return;
              }
            } catch (e) { /* 不是完整 JSON，继续 SSE 解析 */ }
          }
        }

        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line === 'data: [DONE]') continue;
          if (line.indexOf('data: ') !== 0) continue;
          try {
            var obj = JSON.parse(line.slice(6));
            var delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
            if (!delta) continue;
            if (delta.content && opts.onChunk) {
              opts.onChunk(delta.content);
            }
          } catch (e) { /* 忽略解析错误 */ }
        }
        return pump();
      }).catch(function (err) {
        clearIdle();
        if (aborted) return;
        if (err && err.name === 'AbortError') return;
        if (opts.onDone) opts.onDone();
      });
    }
    return pump();
  }

  function _backendAvailable() {
    // 通过端口探测：localhost:8000 是否响应
    // 这里简单返回 true，让 fetch 失败时尝试回退；若后端不在则回退也失败，前端报错
    return true;
  }

  function _streamViaBackend(opts) {
    // 兼容旧 /chat 端点（server.py 提供）
    return fetchWithRetry('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: opts.messages[opts.messages.length - 1].content,
        mode: opts.mode || 'general',
        history: opts.messages.slice(0, -1).map(function (m) {
          return { role: m.role, content: m.content };
        })
      }),
      signal: opts.signal
    }).then(function (resp) {
      // 后端不在运行（Python http.server 返回 404 HTML 错误页）
      // 必须检查 resp.ok，否则会把 HTML 错误页当作 SSE 流解析，导致 AI 无声失败
      if (!resp.ok) {
        var err = new Error('AI 后端不可用（/chat 返回 HTTP ' + resp.status + '）。请前往「我的 → 设置」配置 AI API Key 以使用 AI 功能。');
        err.code = 'BACKEND_UNAVAILABLE';
        if (opts.onError) opts.onError(err);
        return;
      }
      // 检查 Content-Type 是否为 SSE 流
      var ct = resp.headers.get('content-type') || '';
      if (ct.indexOf('text/event-stream') < 0 && ct.indexOf('application/json') < 0 && ct.indexOf('text/plain') < 0) {
        var err2 = new Error('AI 后端未正确响应（Content-Type: ' + ct + '）。请前往「我的 → 设置」配置 AI API Key。');
        err2.code = 'BACKEND_UNAVAILABLE';
        if (opts.onError) opts.onError(err2);
        return;
      }
      incrementUsage();
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      var idleTimer = null;
      var aborted = false;
      function resetIdle() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
          if (!aborted) {
            aborted = true;
            try { reader.cancel(); } catch (e) {}
            if (opts.onDone) opts.onDone();
          }
        }, AI_STREAM_IDLE_TIMEOUT_MS);
      }
      resetIdle();
      function pump() {
        return reader.read().then(function (result) {
          if (aborted) return;
          resetIdle();
          if (result.done) { if (idleTimer) clearTimeout(idleTimer); if (opts.onDone) opts.onDone(); return; }
          buf += decoder.decode(result.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line === 'data: [DONE]' || line.indexOf('data: ') !== 0) continue;
            try {
              var obj = JSON.parse(line.slice(6));
              if (obj.content && opts.onChunk) opts.onChunk(obj.content);
              if (obj.error && opts.onError) opts.onError(new Error(obj.error));
            } catch (e) {}
          }
          return pump();
        }).catch(function (err) {
          if (idleTimer) clearTimeout(idleTimer);
          if (aborted) return;
          if (err && err.name === 'AbortError') return;
          if (opts.onDone) opts.onDone();
        });
      }
      return pump();
    }).catch(function (err) {
      if (err.name === 'AbortError') return;
      if (opts.onError) opts.onError(err);
    });
  }

  function _chatViaBackend(opts) {
    return fetchWithRetry('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: opts.messages[opts.messages.length - 1].content,
        mode: opts.mode || 'general',
        history: opts.messages.slice(0, -1).map(function (m) {
          return { role: m.role, content: m.content };
        })
      }),
      signal: opts.signal
    }).then(function (r) {
      // 后端不在运行（Python http.server 返回 404 HTML 错误页）
      // 必须检查 resp.ok 和 Content-Type，否则 r.json() 解析 HTML 会抛 "Unexpected token '<'"
      if (!r.ok) {
        throw new Error('AI 后端不可用（/chat 返回 HTTP ' + r.status + '）。请前往「我的 → 设置」配置 AI API Key 以使用 AI 功能。');
      }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') < 0 && ct.indexOf('text/plain') < 0) {
        throw new Error('AI 后端未正确响应（Content-Type: ' + ct + '）。请前往「我的 → 设置」配置 AI API Key。');
      }
      incrementUsage();
      return r.json();
    }).then(function (data) {
      // 归一化为 OpenAI 格式，保持与 chat() 直连路径返回类型一致
      if (data && data.choices && data.choices[0] && data.choices[0].message) return data;
      if (data && typeof data.content === 'string') {
        return { choices: [{ message: { role: 'assistant', content: data.content } }] };
      }
      return { choices: [{ message: { role: 'assistant', content: '' } }] };
    });
  }

  /**
   * 使用用户配置的视觉模型识别图片文字（OCR）
   * @param {Object} opts - { image, prompt, onDone, onError, signal }
   *   image: dataURL（如 data:image/jpeg;base64,...）
   *   prompt: 提示词（默认要求保留斜体标记）
   * @returns {Promise<void>}
   */
  function visionRecognize(opts) {
    var cfg = loadConfig();
    if (!_getApiKey()) {
      if (opts.onError) opts.onError(new Error('未配置 AI API Key，无法使用视觉 OCR'));
      return Promise.reject(new Error('未配置 AI API Key'));
    }

    // 选择视觉模型：优先使用用户当前服务商的视觉模型；若当前服务商不支持视觉，按优先级回退
    var visionProvider = null;
    if (VISION_MODELS[cfg.provider]) {
      visionProvider = VISION_MODELS[cfg.provider];
      visionProvider.key = cfg.provider;
    } else {
      // DeepSeek / Kimi 暂无视觉，回退到智谱
      visionProvider = VISION_MODELS.zhipu;
      visionProvider.key = 'zhipu';
    }

    var url = visionProvider.base + '/chat/completions';
    var prompt = opts.prompt || '请识别图片中的所有文字（包括中文、英文、数字、符号）。要求：\n1. 完整保留原文，按从上到下、从左到右的阅读顺序输出\n2. 数学公式用 LaTeX 语法输出（如 $x^2$ 、$\\frac{1}{2}$）\n3. 若文字为斜体，用 *斜体文字* 的 Markdown 语法标记\n4. 不要添加任何解释、说明或前后缀，只输出识别到的纯文字内容\n5. 表格用 Markdown 表格语法输出\n6. 图片中的图形、装饰、水印等非文字内容请忽略';

    var body = JSON.stringify({
      model: visionProvider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: opts.image } }
        ]
      }],
      temperature: 0.1,
      max_tokens: AI_DEFAULT_MAX_TOKENS,
      stream: false
    });

    return _scheduleAiRequest(function () {
      // P1-16：OCR 批量场景同样受速率限制/并发上限约束（防刷配额）
      if (opts.signal && opts.signal.aborted) return Promise.resolve('');
      return fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _getApiKey()
        },
        body: body,
        signal: opts.signal
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (txt) {
            throw new Error(_extractApiError(resp.status, txt));
          });
        }
        incrementUsage();
        return resp.json();
      }).then(function (data) {
        var text = '';
        try {
          text = data.choices[0].message.content || '';
        } catch (e) {}
        // 清理模型可能加的代码块包裹
        text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
        if (opts.onDone) opts.onDone(text);
        return text;
      }).catch(function (err) {
        if (err.name === 'AbortError') return '';
        if (opts.onError) opts.onError(err);
        throw err;
      });
    }, null); // 图片 base64 体积大，不做指纹去重（仅限流）
  }

  // 检查当前配置是否支持视觉 OCR
  function hasVisionSupport() {
    var cfg = loadConfig();
    // 必须有 API Key 且当前服务商在视觉模型表中（避免 DeepSeek/Kimi 误用智谱端点导致 401）
    return !!_getApiKey() && !!VISION_MODELS[cfg.provider];
  }

  // 检查当前配置是否支持文生图
  function hasImageGenSupport() {
    var cfg = loadConfig();
    return !!_getApiKey() && !!IMAGE_MODELS[cfg.provider];
  }

  /**
   * 文生图：根据提示词生成图片
   * @param {Object} opts - { prompt, size, onDone, onError, signal }
   *   prompt: 图片描述提示词
   *   size: 图片尺寸，默认 '1024x1024'
   * @returns {Promise<{url: string}>} 返回图片URL（智谱直接返回URL）
   */
  function generateImage(opts) {
    opts = opts || {};
    var cfg = loadConfig();
    if (!_getApiKey()) {
      var err = new Error('未配置 AI API Key，无法使用文生图功能');
      if (opts.onError) opts.onError(err);
      return Promise.reject(err);
    }

    // 选择文生图模型：优先用户当前服务商，否则回退智谱（免费）
    var imgProvider = null;
    if (IMAGE_MODELS[cfg.provider]) {
      imgProvider = IMAGE_MODELS[cfg.provider];
      imgProvider.key = cfg.provider;
    } else {
      imgProvider = IMAGE_MODELS.zhipu;
      imgProvider.key = 'zhipu';
    }

    var url = imgProvider.base + '/images/generations';
    var body = {
      model: imgProvider.model,
      prompt: opts.prompt || '生物学科教学插图',
      size: opts.size || AI_DEFAULT_IMAGE_SIZE,
      n: 1
    };

    return fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + _getApiKey()
      },
      body: JSON.stringify(body),
      signal: opts.signal
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          throw new Error(_extractApiError(resp.status, txt));
        });
      }
      incrementUsage();
      return resp.json();
    }).then(function (data) {
      var imgUrl = '';
      try {
        // 智谱/OpenAI 格式：data.data[0].url
        if (data.data && data.data[0] && data.data[0].url) {
          imgUrl = data.data[0].url;
        }
        // SiliconFlow 可能返回 b64_json
        else if (data.data && data.data[0] && data.data[0].b64_json) {
          imgUrl = 'data:image/png;base64,' + data.data[0].b64_json;
        }
      } catch (e) {}
      if (!imgUrl) {
        throw new Error('文生图返回数据格式异常');
      }
      if (opts.onDone) opts.onDone(imgUrl);
      return { url: imgUrl };
    }).catch(function (err) {
      if (err.name === 'AbortError') return;
      if (opts.onError) opts.onError(err);
      throw err;
    });
  }

  // 借鉴 OpenMAIC PR #788：瞬时错误（429/5xx/网络）指数退避重试

  /**
   * 自动重试包装器
   * @param {Function} fn - 返回 Promise 的函数
   * @param {Object} opts - { maxRetries?: 3, backoff?: 'exponential'|'linear', baseDelay?: 1000 }
   */
  function withRetry(fn, opts) {
    opts = opts || {};
    var maxRetries = opts.maxRetries || AI_RETRY_MAX_ATTEMPTS;
    var baseDelay = opts.baseDelay || AI_RETRY_BASE_DELAY_MS;
    var mode = opts.backoff || 'exponential';

    return new Promise(function (resolve, reject) {
      var attempt = 0;
      function run() {
        attempt++;
        Promise.resolve()
          .then(fn)
          .then(resolve)
          .catch(function (err) {
            var isTransient = err && (
              err.status === 429 ||
              (err.status && err.status >= 500) ||
              err.name === 'NetworkError' ||
              err.name === 'TypeError'  // fetch 失败
            );
            if (!isTransient || attempt >= maxRetries) {
              reject(err);
              return;
            }
            var delay = mode === 'exponential'
              ? baseDelay * Math.pow(2, attempt - 1)
              : baseDelay * attempt;
            console.warn('[ai-client] 第 ' + attempt + ' 次失败，' + delay + 'ms 后重试:', err.message || err);
            setTimeout(run, delay);
          });
      }
      run();
    });
  }

  /**
   * Per-stage LLM 路由配置（PRD §7.2）
   * 不同课堂阶段用不同模型，平衡质量与成本
   * 默认全用 GLM-4-Flash（免费），用户配了强模型时按表升级
   */
  var STAGE_MODEL_MAP = {
    classroom_outline:   { temperature: 0.7, preferStrong: true  },  // 课堂大纲（需教学设计）
    teacher_script:      { temperature: 0.6, preferStrong: false },  // AI 老师讲稿（低延迟流式）
    variant_question:    { temperature: 0.3, preferStrong: true  },  // 变式题（需严谨）
    quick_qa:            { temperature: 0.5, preferStrong: false },  // 简单答疑（高频低成本）
    code_review:         { temperature: 0.2, preferStrong: true  },  // 代码评审（需严谨）
    whiteboard_cmd:      { temperature: 0.2, preferStrong: false },  // 白板绘图指令
    socratic_guide:      { temperature: 0.5, preferStrong: false },  // 苏格拉底引导
    peer_review:         { temperature: 0.6, preferStrong: false }   // 同伴评审
  };

  /**
   * 按阶段调用 LLM（带重试）
   * @param {string} stage - STAGE_MODEL_MAP 的 key
   * @param {Array} messages - OpenAI 格式 messages
   * @param {Object} streamOpts - 流式回调 { onChunk, onDone, onError }
   * @returns {Promise}
   */
  function callByStage(stage, messages, streamOpts) {
    streamOpts = streamOpts || {};
    var stageCfg = STAGE_MODEL_MAP[stage] || STAGE_MODEL_MAP.quick_qa;
    var cfg = loadConfig();

    // Metaso 使用单一模型，不需要 preferStrong 切换
    var useStrong = stageCfg.preferStrong && _getApiKey() && cfg.provider !== 'zhipu' && cfg.provider !== 'metaso';

    var callOpts = {
      messages: messages,
      temperature: stageCfg.temperature,
      onChunk: streamOpts.onChunk,
      onDone: streamOpts.onDone,
      onError: streamOpts.onError,
      signal: streamOpts.signal
    };

    // 流式不重试（流断了无法续传），仅非流式重试
    if (streamOpts.onChunk) {
      return streamChat(callOpts);
    }

    // 非流式：chat() 返回 OpenAI 格式 JSON，这里提取文本字符串给调用方
    return withRetry(function () {
      return chat(callOpts).then(function (data) {
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content || '';
        }
        if (data && typeof data.content === 'string') return data.content;
        return '';
      });
    }, { maxRetries: 3, backoff: 'exponential' });
  }

  window.AiClient = {
    streamChat: streamChat,
    chat: chat,
    canUse: canUse,
    incrementUsage: incrementUsage,
    getUsage: getUsage,
    loadConfig: loadConfig,
    visionRecognize: visionRecognize,
    hasVisionSupport: hasVisionSupport,
    generateImage: generateImage,
    hasImageGenSupport: hasImageGenSupport,
    // v3.1 新增
    withRetry: withRetry,
    callByStage: callByStage,
    // P1-16（Issue #135）新增：请求调度器诊断接口（限流/并发/去重状态）
    schedulerStats: _schedulerStats,
    // 让调用方（tutor/discussion）直接用，不用每次 new AbortController
    createAbortSignal: function () {
      var ctrl = new AbortController();
      return { controller: ctrl, signal: ctrl.signal };
    },
    STAGE_MODEL_MAP: STAGE_MODEL_MAP,
    PROVIDER_MAP: PROVIDER_MAP,
    VISION_MODELS: VISION_MODELS,
    IMAGE_MODELS: IMAGE_MODELS,
    METASO_SUBJECT_ID: _metasoSubjectId()
  };
})();
