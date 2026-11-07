/**
 * ============================================================
 * TATABOX — 拍照录题模块
 * 拍照/上传图片（仅本地存档）+ 手动输入题目文字
 * 调用后端 /photo-quiz 让 AI 生成选项、答案与解析
 * 历史记录保存在 localStorage（最近 20 条）
 * ============================================================
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'tatabox_photo_quiz_history';
  var MAX_HISTORY = 20;
  var _stylesInjected = false;
  var _stream = null;        // MediaStream
  var _currentPhoto = null;  // dataURL (400x300)

  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var css = '' +
      '.pq-page{max-width:760px;margin:0 auto;padding:18px 16px 80px}' +
      '.pq-title{font-family:var(--font-serif,"Noto Serif SC",serif);font-size:1.25rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin:0 0 4px}' +
      '.pq-sub{font-size:0.8rem;color:var(--text-muted,#8a8a8a);margin:0 0 14px;line-height:1.5}' +
      '.pq-section{background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:12px;padding:16px;margin-bottom:14px}' +
      '.pq-section h3{font-size:0.95rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin:0 0 8px}' +
      '.pq-video-wrap{position:relative;width:100%;max-width:400px;aspect-ratio:4/3;background:#000;border-radius:8px;overflow:hidden;margin:0 auto}' +
      '.pq-video-wrap video,.pq-video-wrap img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.pq-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px}' +
      '.pq-btn{padding:9px 18px;border-radius:16px;font-size:0.85rem;font-weight:600;cursor:pointer;border:none;transition:all .15s}' +
      '.pq-btn-primary{background:var(--color-sage,#5a7d5c);color:#fff}' +
      '.pq-btn-primary:hover{transform:translateY(-1px);box-shadow:var(--shadow-md)}' +
      '.pq-btn-secondary{background:var(--surface-secondary,#faf7f2);color:var(--text-secondary,#4a4a4a);border:1px solid var(--border-default,#e0dcd5)}' +
      '.pq-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}' +
      '.pq-textarea{width:100%;box-sizing:border-box;min-height:120px;padding:12px;border:1px solid var(--border-default,#e0dcd5);border-radius:8px;font-size:0.9rem;font-family:inherit;resize:vertical;background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a)}' +
      '.pq-textarea:focus{outline:none;border-color:var(--color-sage,#5a7d5c)}' +
      '.pq-result-card{background:var(--surface-secondary,#faf7f2);border-radius:12px;padding:16px;border:1px solid var(--border-light,#ece8e1)}' +
      '.pq-result-q{font-size:0.95rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin:0 0 12px;line-height:1.6}' +
      '.pq-options{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}' +
      '.pq-option{display:flex;gap:10px;padding:10px 12px;background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:8px;font-size:0.88rem;line-height:1.5;cursor:pointer;transition:all .15s}' +
      '.pq-option:hover{border-color:var(--color-sage,#5a7d5c)}' +
      '.pq-option.correct{background:rgba(90,125,92,.12);border-color:var(--color-sage,#5a7d5c)}' +
      '.pq-opt-label{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--surface-tertiary,#f0ebe0);color:var(--color-deep,#1a3a2a);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700}' +
      '.pq-option.correct .pq-opt-label{background:var(--color-sage,#5a7d5c);color:#fff}' +
      '.pq-answer-row{font-size:0.85rem;color:var(--color-sage,#5a7d5c);font-weight:600;margin-bottom:10px}' +
      '.pq-analysis{font-size:0.85rem;line-height:1.7;color:var(--text-secondary,#4a4a4a);padding:12px;background:var(--surface-primary,#fff);border-left:3px solid var(--color-sage,#5a7d5c);border-radius:0 8px 8px 0}' +
      '.pq-loading{text-align:center;padding:30px;color:var(--text-muted,#8a8a8a);font-size:0.88rem}' +
      '.pq-empty{text-align:center;padding:20px;color:var(--text-muted,#8a8a8a);font-size:0.85rem}' +
      '.pq-history-toggle{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}' +
      '.pq-history-toggle h3{margin:0}' +
      '.pq-history-list{margin-top:12px;display:flex;flex-direction:column;gap:8px}' +
      '.pq-history-item{padding:10px 12px;background:var(--surface-secondary,#faf7f2);border:1px solid var(--border-light,#ece8e1);border-radius:8px;cursor:pointer;font-size:0.85rem;transition:all .15s}' +
      '.pq-history-item:hover{border-color:var(--color-sage,#5a7d5c)}' +
      '.pq-history-item-q{color:var(--text-primary,#1a1a1a);font-weight:500;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pq-history-item-meta{font-size:0.72rem;color:var(--text-muted,#8a8a8a)}' +
      '.pq-clear{font-size:0.75rem;color:var(--color-error,#e53e3e);cursor:pointer;background:none;border:none;padding:4px 8px}' +
      '.pq-thumb{width:60px;height:45px;object-fit:cover;border-radius:8px;margin-right:10px;flex-shrink:0}' +
      '.pq-history-item-row{display:flex;align-items:center}' +
      '.pq-warn{font-size:0.78rem;color:var(--color-amber,#c4956a);margin-top:8px;line-height:1.5}' +
      '.pq-ocr-btn{padding:9px 18px;border-radius:16px;font-size:0.85rem;font-weight:600;cursor:pointer;border:none;background:var(--color-amber,#c4956a);color:#fff;transition:all .15s}' +
      '.pq-ocr-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:var(--shadow-md)}' +
      '.pq-ocr-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.pq-ocr-status{margin-top:8px;padding:8px 12px;border-radius:8px;font-size:0.8rem;line-height:1.5;background:rgba(90,125,92,0.06);color:var(--text-secondary,#4a4a4a);display:none}' +
      '.pq-ocr-progress{margin-top:6px;height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden}' +
      '.pq-ocr-progress-fill{width:0;height:100%;background:var(--color-sage,#5a7d5c);transition:width .3s}';
    var style = document.createElement('style');
    style.id = 'bioquest-photo-quiz-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  var escapeHtml = window.escapeHtml;

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveHistory(list) {
    var data = list.slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // 容量超限时，丢弃首条（含照片）再试一次
      try {
        var stripped = data.map(function (item, i) {
          return i === 0 ? Object.assign({}, item, { photo: null }) : item;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped.slice(1)));
      } catch (e2) { /* 静默 */ }
    }
  }

  function stopCamera() {
    if (_stream) {
      _stream.getTracks().forEach(function (t) { t.stop(); });
      _stream = null;
    }
  }

  /* ============== OCR 识别（视觉模型优先 + Tesseract 兜底） ============== */
  var _tesseractLoaded = false;
  function _loadTesseract(callback) {
    if (_tesseractLoaded && typeof window.Tesseract !== 'undefined') {
      callback(null); return;
    }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function() { _tesseractLoaded = true; callback(null); };
    s.onerror = function() { callback(new Error('OCR 引擎加载失败')); };
    document.head.appendChild(s);
  }

  // 图像预处理：放大 2x + 灰度 + 对比度增强 + 二值化
  function _preprocessImage(dataUrl, callback) {
    var img = new Image();
    img.onload = function() {
      var scale = 2;
      var w = img.width * scale, h = img.height * scale;
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var imgData = ctx.getImageData(0, 0, w, h);
      var d = imgData.data;
      // 灰度
      for (var i = 0; i < d.length; i += 4) {
        var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      // 对比度增强
      var minV = 255, maxV = 0;
      for (var j = 0; j < d.length; j += 4) {
        if (d[j] < minV) minV = d[j];
        if (d[j] > maxV) maxV = d[j];
      }
      var range = Math.max(1, maxV - minV);
      for (var k = 0; k < d.length; k += 4) {
        var v = ((d[k] - minV) / range) * 255;
        d[k] = d[k + 1] = d[k + 2] = v;
      }
      // 二值化
      for (var m = 0; m < d.length; m += 4) {
        var bv = d[m] > 140 ? 255 : 0;
        d[m] = d[m + 1] = d[m + 2] = bv;
      }
      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL('image/png'));
    };
    img.onerror = function() { callback(dataUrl); };
    img.src = dataUrl;
  }

  function _postprocessOcrText(text) {
    if (!text) return '';
    var corrections = [
      [/[，,\s]+$/gm, ''],
      [/[\u3000]+/g, ' '],
      [/\n{3,}/g, '\n\n'],
      [/=\s*\n\s*=/g, '=='],
      [/\(\s+/g, '('],
      [/\s+\)/g, ')'],
      [/\s+\,/g, ','],
      [/\s+\./g, '.'],
      [/\s+，/g, '，'],
      [/\s+。/g, '。']
    ];
    for (var i = 0; i < corrections.length; i++) {
      text = text.replace(corrections[i][0], corrections[i][1]);
    }
    return text.trim();
  }

  // 拍照录题 OCR 主入口
  // imgData: dataURL；ui: { statusEl, progressFill, statusEl } 用于更新 UI
  // 【最小侵入】优先走 OcrEngine（4级降级流水线），不可用时回退原有 Vision+Tesseract 两级
  function _ocrImage(imgData, ui, onDone) {
    var statusEl = ui.statusEl;
    var progressFill = ui.progressFill;
    var COLOR_SUCCESS = 'var(--color-sage,#3a6b4a)';
    var COLOR_WARN    = 'var(--color-amber,#c4956a)';
    var COLOR_ERROR   = 'var(--color-error,#c0553a)';

    var setText = function(t, color) {
      if (statusEl) {
        statusEl.textContent = t;
        statusEl.style.color = color || '';
      }
    };
    var setProgress = function(p) {
      if (progressFill) progressFill.style.width = p + '%';
    };

    if (window.OcrEngine && typeof window.OcrEngine.recognize === 'function') {
      window.OcrEngine.recognize(imgData, {
        // 生物题目常见长度：题干+选项通常超过10字，严格一点可避免无意义识别结果被误当"成功"
        minTextLength: 3
      }, {
        setText: function (t, kind) {
          var c = '';
          if (kind === 'success') c = COLOR_SUCCESS;
          else if (kind === 'warn') c = COLOR_WARN;
          else if (kind === 'error') c = COLOR_ERROR;
          setText(t, c);
        },
        setProgress: setProgress,
        setEngine: function (engineName) {
          // 可扩展：显示当前正在使用的引擎徽标
          try { sessionStorage.setItem('tatabox_ocr_last_engine', engineName); } catch (e) {}
        }
      }, function (result) {
        if (result && result.text) {
          onDone(result.text, result.engine || 'ocr-engine');
          return;
        }
        // OcrEngine 全失败（极端情况），再用原实现的 _ocrTesseract 最后兜底一次
        console.warn('[photo-quiz] OcrEngine 全级未命中，最后兜底：原生 Tesseract');
        setText('多级引擎未识别，最终兜底识别中...', COLOR_WARN);
        _ocrTesseract(imgData, ui, onDone);
      });
      return;
    }

    console.warn('[photo-quiz] OcrEngine 未就绪，走旧版 Vision+Tesseract 双级逻辑');
    // 策略 1：优先使用视觉多模态 OCR（最佳准确率，支持斜体）
    if (window.AiClient && typeof window.AiClient.visionRecognize === 'function' &&
        (typeof window.AiClient.hasVisionSupport !== 'function' || window.AiClient.hasVisionSupport())) {
      setProgress(30);
      setText('使用 AI 视觉模型识别中（准确率最高，支持斜体）...');

      window.AiClient.visionRecognize({
        image: imgData,
        onDone: function(text) {
          text = (text || '').trim();
          if (text) {
            setProgress(100);
            setText('✓ AI 视觉识别完成，请校对', COLOR_SUCCESS);
            onDone(text, 'vision');
            return;
          }
          setText('AI 未识别到文本，回退本地 OCR...', COLOR_WARN);
          _ocrTesseract(imgData, ui, onDone);
        },
        onError: function(err) {
          console.warn('[photo-quiz] 视觉 OCR 失败，回退 Tesseract:', err && err.message);
          setText('视觉 OCR 失败，回退本地 OCR...', COLOR_WARN);
          _ocrTesseract(imgData, ui, onDone);
        }
      }).catch(function(err) {
        console.warn('[photo-quiz] 视觉 OCR 异常，回退 Tesseract:', err);
        _ocrTesseract(imgData, ui, onDone);
      });
    } else {
      // 策略 2：未配置 AI Key，使用 Tesseract
      setText('未配置 AI Key，使用本地 OCR（建议在「我的 → 设置」配置 API Key 以获得更好效果）', COLOR_WARN);
      _ocrTesseract(imgData, ui, onDone);
    }
  }

  function _ocrTesseract(imgData, ui, onDone) {
    var statusEl = ui.statusEl;
    var progressFill = ui.progressFill;
    _loadTesseract(function(err) {
      if (err) {
        if (statusEl) {
          statusEl.textContent = '✗ ' + err.message;
          statusEl.style.color = 'var(--color-error,#c0553a)';
        }
        onDone('', 'tesseract');
        return;
      }
      if (statusEl) statusEl.textContent = '图像预处理中...';
      if (progressFill) progressFill.style.width = '10%';

      _preprocessImage(imgData, function(processedData) {
        if (statusEl) statusEl.textContent = '本地 OCR 识别中... 0%';

        var tryRecognize = function(psm, fallback) {
          window.Tesseract.recognize(processedData, 'chi_sim+eng', {
            tessedit_pageseg_mode: psm,
            logger: function(m) {
              if (m.status === 'recognizing text') {
                var pct = Math.round(m.progress * 100);
                if (progressFill) progressFill.style.width = (10 + pct * 0.85) + '%';
                if (statusEl) statusEl.textContent = '本地 OCR 识别中... ' + pct + '% (PSM ' + psm + ')';
              } else if (m.status && statusEl) {
                statusEl.textContent = m.status + '...';
              }
            }
          }).then(function(result) {
            var text = (result && result.data && result.data.text) || '';
            text = _postprocessOcrText(text);
            if (text.length < 5 && fallback) {
              if (statusEl) statusEl.textContent = '尝试另一种识别模式...';
              tryRecognize(3, false);
              return;
            }
            if (progressFill) progressFill.style.width = '100%';
            if (statusEl) {
              statusEl.textContent = text ? '✓ 本地识别完成，请校对' : '✗ 未识别到文本，请手动输入';
              statusEl.style.color = text ? 'var(--color-sage,#3a6b4a)' : 'var(--color-error,#c0553a)';
            }
            onDone(text, 'tesseract');
          }).catch(function(e) {
            if (fallback) {
              if (statusEl) statusEl.textContent = '识别失败，重试中...';
              tryRecognize(3, false);
              return;
            }
            if (statusEl) {
              statusEl.textContent = '✗ OCR 失败：' + (e.message || e);
              statusEl.style.color = 'var(--color-error,#c0553a)';
            }
            onDone('', 'tesseract');
          });
        };
        tryRecognize(6, true);
      });
    });
  }

  function startCamera(videoEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('当前浏览器不支持摄像头'));
    }
    return navigator.mediaDevices.getUserMedia({ video: true }).then(function (stream) {
      _stream = stream;
      videoEl.srcObject = stream;
      return videoEl.play().catch(function () { /* 自动播放被阻止，静默 */ });
    });
  }

  // Canvas 截帧 + 压缩到 400x300（object-fit: cover）
  function capturePhoto(videoEl) {
    var canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    var ctx = canvas.getContext('2d');
    var vw = videoEl.videoWidth || 400;
    var vh = videoEl.videoHeight || 300;
    var scale = Math.max(400 / vw, 300 / vh);
    var dw = vw * scale, dh = vh * scale;
    var dx = (400 - dw) / 2, dy = (300 - dh) / 2;
    ctx.drawImage(videoEl, dx, dy, dw, dh);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  // 从文件读取图片，缩放到 400x300
  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 300;
          var ctx = canvas.getContext('2d');
          var scale = Math.max(400 / img.width, 300 / img.height);
          var dw = img.width * scale, dh = img.height * scale;
          var dx = (400 - dw) / 2, dy = (300 - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function analyzeQuestion(questionText) {
    return fetch('/photo-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: questionText })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (data) {
      if (data.error) throw new Error(data.error);
      return data;
    });
  }

  function answerToText(answer) {
    if (!answer) return '';
    if (typeof answer === 'string') return answer;
    return Object.keys(answer).filter(function (k) { return answer[k]; }).join('');
  }

  function renderResult(resultEl, data) {
    if (!data || (!data.question && !data.analysis)) {
      resultEl.innerHTML = '<div class="pq-empty">未识别到有效题目，请补充更完整的题目文字</div>';
      return;
    }
    var html = '<div class="pq-result-card">';
    if (data.question) {
      html += '<div class="pq-result-q">' + escapeHtml(data.question) + '</div>';
    }

    var options = data.options || {};
    var answer = data.answer || '';
    var ansText = answerToText(answer);
    var optLabels = ['A', 'B', 'C', 'D'];

    html += '<div class="pq-options">';
    optLabels.forEach(function (label) {
      var text = options[label] || '';
      if (!text) return;
      var isCorrect = (typeof answer === 'string' && answer === label)
        || (answer && typeof answer === 'object' && answer[label]);
      html += '<div class="pq-option' + (isCorrect ? ' correct' : '') + '" data-label="' + label + '">';
      html += '<span class="pq-opt-label">' + label + '</span>';
      html += '<span>' + escapeHtml(text) + '</span>';
      html += '</div>';
    });
    html += '</div>';

    if (ansText) {
      html += '<div class="pq-answer-row">正确答案：' + escapeHtml(ansText) + '</div>';
    }
    if (data.analysis) {
      html += '<div class="pq-analysis">' + escapeHtml(data.analysis).replace(/\n/g, '<br>') + '</div>';
    }
    html += '</div>';
    resultEl.innerHTML = html;
  }

  function renderHistory(histListEl, items, onPick) {
    if (!items.length) {
      histListEl.innerHTML = '<div class="pq-empty">暂无录题记录</div>';
      return;
    }
    var html = '';
    items.forEach(function (item, idx) {
      var q = (item.question || '').slice(0, 50);
      var date = new Date(item.createdAt || Date.now());
      var dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      html += '<div class="pq-history-item" data-idx="' + idx + '">';
      html += '<div class="pq-history-item-row">';
      if (item.photo) {
        html += '<img class="pq-thumb" src="' + item.photo + '" alt="题目照片">';
      }
      html += '<div style="flex:1;min-width:0">';
      html += '<div class="pq-history-item-q">' + escapeHtml(q) + (item.question && item.question.length > 50 ? '…' : '') + '</div>';
      html += '<div class="pq-history-item-meta">' + dateStr + ' · 答案：' + escapeHtml(item.answer || '—') + '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    histListEl.innerHTML = html;

    histListEl.querySelectorAll('.pq-history-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.dataset.idx, 10);
        if (onPick) onPick(items[idx]);
      });
    });
  }

  function renderPage(target) {
    injectStyles();

    var html = '<div class="pq-page">';
    html += '<h1 class="pq-title">拍照录题</h1>';
    html += '<p class="pq-sub">拍照或上传图片，OCR 自动识别题目文字，AI 生成选项、答案与解析</p>';

    // 摄像头/图片区
    html += '<div class="pq-section">';
    html += '<div class="pq-video-wrap" id="pq-video-wrap"><video id="pq-video" playsinline muted></video></div>';
    html += '<div class="pq-actions">';
    html += '<button class="pq-btn pq-btn-primary" id="pq-start-cam">开启摄像头</button>';
    html += '<button class="pq-btn pq-btn-secondary" id="pq-capture" disabled>拍照</button>';
    html += '<button class="pq-btn pq-btn-secondary" id="pq-upload">上传图片</button>';
    html += '<button class="pq-btn pq-btn-secondary" id="pq-clear-photo" style="display:none">清除照片</button>';
    html += '<button class="pq-btn pq-btn-secondary" id="pq-retake" style="display:none">重新拍摄</button>';
    html += '<button class="pq-btn pq-btn-secondary" id="pq-add-shot" style="display:none">再拍一张</button>';
    html += '<input type="file" id="pq-file" accept="image/*" style="display:none">';
    html += '</div>';
    html += '<button class="pq-ocr-btn" id="pq-ocr" disabled>OCR 识别题目文字</button>';
    html += '<div class="pq-ocr-status" id="pq-ocr-status">';
    html += '<div id="pq-ocr-text"></div>';
    html += '<div class="pq-ocr-progress"><div class="pq-ocr-progress-fill" id="pq-ocr-progress-fill"></div></div>';
    html += '</div>';
    html += '<div class="pq-warn">提示：拍照或上传图片后点击「OCR 识别」可自动提取题目文字（已配置 API Key 时使用 AI 视觉模型，准确率最高且支持斜体；未配置时使用本地 OCR 引擎）</div>';
    html += '</div>';

    // 题目输入区
    html += '<div class="pq-section">';
    html += '<h3>题目文字</h3>';
    html += '<textarea class="pq-textarea" id="pq-question" placeholder="请输入或粘贴完整题目文字（含选项若有）…"></textarea>';
    html += '<div class="pq-actions" style="justify-content:flex-end;margin-top:10px">';
    html += '<button class="pq-btn pq-btn-primary" id="pq-analyze">AI 解析</button>';
    html += '</div>';
    html += '</div>';

    // 结果区
    html += '<div class="pq-section" id="pq-result-section" style="display:none">';
    html += '<h3>解析结果</h3>';
    html += '<div id="pq-result"></div>';
    html += '</div>';

    // 历史记录区
    html += '<div class="pq-section">';
    html += '<div class="pq-history-toggle" id="pq-history-toggle">';
    html += '<h3>历史记录 <span style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);font-weight:400">（最近 ' + MAX_HISTORY + ' 条）</span></h3>';
    html += '<div><button class="pq-clear" id="pq-clear-history">清空</button> <span id="pq-history-arrow" style="font-size:0.85rem;color:var(--text-muted,#8a8a8a)">▾</span></div>';
    html += '</div>';
    html += '<div class="pq-history-list" id="pq-history-list"></div>';
    html += '</div>';

    html += '</div>';

    target.innerHTML = html;

    var videoWrap = document.getElementById('pq-video-wrap');
    var startBtn = document.getElementById('pq-start-cam');
    var captureBtn = document.getElementById('pq-capture');
    var uploadBtn = document.getElementById('pq-upload');
    var clearPhotoBtn = document.getElementById('pq-clear-photo');
    var fileInput = document.getElementById('pq-file');
    var questionInput = document.getElementById('pq-question');
    var analyzeBtn = document.getElementById('pq-analyze');
    var resultSection = document.getElementById('pq-result-section');
    var resultEl = document.getElementById('pq-result');
    var histListEl = document.getElementById('pq-history-list');
    var histToggle = document.getElementById('pq-history-toggle');
    var histArrow = document.getElementById('pq-history-arrow');
    var clearHistBtn = document.getElementById('pq-clear-history');
    var ocrBtn = document.getElementById('pq-ocr');
    var ocrStatusBox = document.getElementById('pq-ocr-status');
    var ocrTextEl = document.getElementById('pq-ocr-text');
    var ocrProgressFill = document.getElementById('pq-ocr-progress-fill');

    var historyItems = loadHistory();
    var historyCollapsed = false;

    function refreshHistory() {
      renderHistory(histListEl, historyItems, function (item) {
        questionInput.value = item.question || '';
        if (item.result) {
          resultSection.style.display = '';
          renderResult(resultEl, item.result);
        }
        if (item.photo) {
          showPhoto(item.photo);
        } else {
          showVideo();
        }
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    refreshHistory();

    var _extraShots = [];  // 再拍一张的额外照片
    var retakeBtn = document.getElementById('pq-retake');
    var addShotBtn = document.getElementById('pq-add-shot');

    function showVideo() {
      _currentPhoto = null;
      videoWrap.innerHTML = '<video id="pq-video" playsinline muted></video>';
      clearPhotoBtn.style.display = 'none';
      if (retakeBtn) retakeBtn.style.display = 'none';
      if (addShotBtn) addShotBtn.style.display = 'none';
      if (ocrBtn) ocrBtn.disabled = true;
      if (ocrStatusBox) ocrStatusBox.style.display = 'none';
      if (_stream) {
        var v = document.getElementById('pq-video');
        v.srcObject = _stream;
        v.play().catch(function () {});
      }
    }

    function showPhoto(dataUrl) {
      _currentPhoto = dataUrl;
      // 安全修复（P1 XSS）：dataUrl 来自 canvas.toDataURL，理论安全；但仍转义防止极端构造
      var _safeSrc = String(dataUrl).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      videoWrap.innerHTML = '<img src="' + _safeSrc + '" alt="题目照片">';
      clearPhotoBtn.style.display = '';
      // 拍完照后显示"重新拍摄"和"再拍一张"
      if (retakeBtn) retakeBtn.style.display = '';
      if (addShotBtn) addShotBtn.style.display = '';
      if (ocrBtn) ocrBtn.disabled = false;
      if (ocrStatusBox) ocrStatusBox.style.display = 'none';
    }

    function renderExtraShots() {
      var existing = document.getElementById('pq-extra-shots');
      if (existing) existing.remove();
      if (_extraShots.length === 0) return;
      var wrap = document.createElement('div');
      wrap.id = 'pq-extra-shots';
      wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
      _extraShots.forEach(function (shot, idx) {
        var item = document.createElement('div');
        item.style.cssText = 'position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border-light,#ddd);';
        // 安全修复（P1 XSS）：shot 转义后再注入 src 属性
        var _safeShot = String(shot).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        item.innerHTML = '<img src="' + _safeShot + '" style="width:100%;height:100%;object-fit:cover;">' +
          '<button data-idx="' + idx + '" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;padding:0;">×</button>';
        wrap.appendChild(item);
      });
      videoWrap.parentNode.insertBefore(wrap, videoWrap.nextSibling);
      wrap.querySelectorAll('button[data-idx]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          _extraShots.splice(parseInt(btn.dataset.idx, 10), 1);
          renderExtraShots();
        });
      });
    }

    // 重新拍摄：丢弃当前照片，回到摄像头预览
    if (retakeBtn) {
      retakeBtn.addEventListener('click', function () {
        _extraShots = [];
        renderExtraShots();
        showVideo();
      });
    }

    // 再拍一张：保留当前照片到额外列表，回到摄像头预览拍下一张
    if (addShotBtn) {
      addShotBtn.addEventListener('click', function () {
        if (_currentPhoto) {
          _extraShots.push(_currentPhoto);
          renderExtraShots();
        }
        showVideo();
      });
    }

    // OCR 识别按钮：调用视觉模型或本地 Tesseract，识别结果自动填入题目输入框
    ocrBtn.addEventListener('click', function () {
      if (!_currentPhoto) {
        if (typeof window.showToast === 'function') window.showToast('请先拍照或上传图片');
        return;
      }
      ocrBtn.disabled = true;
      ocrBtn.textContent = '识别中…';
      ocrStatusBox.style.display = '';
      ocrProgressFill.style.width = '0%';
      ocrTextEl.textContent = '准备识别...';
      ocrTextEl.style.color = 'var(--text-muted,#8a8a8a)';

      _ocrImage(_currentPhoto, {
        statusEl: ocrTextEl,
        progressFill: ocrProgressFill
      }, function (text, source) {
        ocrBtn.disabled = false;
        ocrBtn.textContent = 'OCR 识别题目文字';
        if (text) {
          // 追加到已有内容后（避免覆盖用户已输入的内容）
          var existing = questionInput.value.trim();
          questionInput.value = existing ? (existing + '\n\n' + text) : text;
          if (typeof window.showToast === 'function') {
            window.showToast('OCR 识别完成（' + (source === 'vision' ? 'AI 视觉' : '本地引擎') + '），请校对');
          }
          questionInput.focus();
        } else {
          if (typeof window.showToast === 'function') window.showToast('未识别到文本，请手动输入');
        }
      });
    });

    // 开启/关闭摄像头
    startBtn.addEventListener('click', function () {
      if (_stream) {
        stopCamera();
        startBtn.textContent = '开启摄像头';
        captureBtn.disabled = true;
        showVideo();
        return;
      }
      if (!document.getElementById('pq-video')) {
        showVideo();
      }
      var v = document.getElementById('pq-video');
      startBtn.disabled = true;
      startBtn.textContent = '开启中…';
      startCamera(v).then(function () {
        startBtn.disabled = false;
        startBtn.textContent = '关闭摄像头';
        captureBtn.disabled = false;
      }).catch(function (err) {
        startBtn.disabled = false;
        startBtn.textContent = '开启摄像头';
        if (typeof window.showToast === 'function') {
          window.showToast('摄像头开启失败：' + (err.message || err));
        } else {
          alert('摄像头开启失败：' + (err.message || err));
        }
      });
    });

    // 拍照
    captureBtn.addEventListener('click', function () {
      if (!_stream) return;
      var v = document.getElementById('pq-video');
      if (!v) return;
      try {
        var photo = capturePhoto(v);
        showPhoto(photo);
      } catch (e) {
        if (typeof window.showToast === 'function') window.showToast('拍照失败：' + (e.message || e));
      }
    });

    // 上传图片
    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      readImageFile(f).then(showPhoto).catch(function (err) {
        if (typeof window.showToast === 'function') window.showToast('图片加载失败：' + (err.message || err));
      });
      fileInput.value = '';
    });

    // 清除照片
    clearPhotoBtn.addEventListener('click', showVideo);

    // AI 解析
    analyzeBtn.addEventListener('click', function () {
      var q = questionInput.value.trim();
      if (!q) {
        if (typeof window.showToast === 'function') window.showToast('请先输入题目文字');
        return;
      }
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '解析中…';
      resultSection.style.display = '';
      resultEl.innerHTML = '<div class="pq-loading">AI 正在分析题目…</div>';
      analyzeQuestion(q).then(function (data) {
        renderResult(resultEl, data);
        historyItems.unshift({
          question: q,
          photo: _currentPhoto,
          answer: answerToText(data.answer),
          result: data,
          createdAt: Date.now()
        });
        historyItems = historyItems.slice(0, MAX_HISTORY);
        saveHistory(historyItems);
        refreshHistory();
      }).catch(function (err) {
        resultEl.innerHTML = '<div class="pq-empty">解析失败：' + escapeHtml(err.message || err) + '</div>';
      }).then(function () {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'AI 解析';
      });
    });

    // 历史折叠
    histToggle.addEventListener('click', function (e) {
      if (e.target === clearHistBtn) return;
      historyCollapsed = !historyCollapsed;
      histListEl.style.display = historyCollapsed ? 'none' : '';
      histArrow.textContent = historyCollapsed ? '▸' : '▾';
    });

    // 清空历史
    clearHistBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('确定清空全部录题历史吗？')) return;
      historyItems = [];
      saveHistory([]);
      refreshHistory();
    });
  }

  function initPhotoQuiz(target) {
    if (!target) {
      target = (typeof AppState !== 'undefined' && AppState.rootElement) ? AppState.rootElement : document.getElementById('page-content');
    }
    renderPage(target);
  }

  // 离开 /photo-quiz 时自动关闭摄像头
  window.addEventListener('hashchange', function () {
    if (!/\/photo-quiz/.test(window.location.hash)) {
      stopCamera();
    }
  });

  window.initPhotoQuiz = initPhotoQuiz;
  window.renderPhotoQuizPage = renderPage;
})();
