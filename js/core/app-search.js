

/**
 * 搜索页面渲染 — 独立完整页面
 */
function renderSearchPage() {
  var container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div class="search-page">
      <div class="search-hero">
        <h1 class="search-hero-title">知识搜索</h1>
        <p class="search-hero-subtitle">搜索全量题库与生竞专业资源</p>
        <div class="search-bar" style="position:relative;">
          <input type="text" class="search-bar-input" id="search-page-input" placeholder="输入生物学关键词，如：细胞膜、光合作用、遗传定律..." autocomplete="off" />
          <button class="search-bar-btn" id="search-page-btn">搜索</button>
          <div class="search-quick-hint" id="search-quick-hint"></div>
        </div>
      </div>
      <div class="search-filters" id="search-filters">
        <span class="search-filter-label">搜索范围：</span>
        <span class="search-filter-chip selected" data-source="local">题库搜索</span>
        <span class="search-filter-chip selected" data-source="zhixin">质心论坛</span>
        <span class="search-filter-chip selected" data-source="baidu">百度</span>
        <span class="search-filter-chip selected" data-source="zhihu">知乎</span>
        <span class="search-filter-chip" data-source="bing">Bing</span>
        <span class="search-filter-chip" data-source="scholar">Scholar</span>
        <span class="search-filter-chip" data-source="wiki">Wikipedia</span>
        <span class="search-filter-chip" data-source="cnki">知网</span>
        <span class="search-filter-chip" data-source="biolib">BioLib</span>
        <span class="search-filter-chip" data-source="biooo">BioOO</span>
        <span class="search-filter-chip" data-source="naoke">脑壳生物</span>
      </div>
      <div class="search-module-filters" id="search-module-filters">
        <span class="search-filter-label">模块筛选：</span>
        <span class="search-module-chip selected" data-module="">全部</span>
        <span class="search-module-chip" data-module="module_1">模块1</span>
        <span class="search-module-chip" data-module="module_2">模块2</span>
        <span class="search-module-chip" data-module="module_3">模块3</span>
        <span class="search-module-chip" data-module="module_4">模块4</span>
        <span class="search-module-chip" data-module="exam">考试题</span>
      </div>
      <div class="search-results-area" id="search-results-area">
        <div class="search-empty-state">
          <div class="search-empty-icon">[TATABOX]</div>
          <p>输入关键词开始搜索</p>
          <p class="search-empty-hint">支持搜索本地题库和多个生竞专业网站</p>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  var searchInput = document.getElementById('search-page-input');
  var searchBtn = document.getElementById('search-page-btn');
  var resultsArea = document.getElementById('search-results-area');
  var filterChips = document.querySelectorAll('.search-filter-chip');
  var moduleChips = document.querySelectorAll('.search-module-chip');
  var quickHint = document.getElementById('search-quick-hint');

  // 当前选中的模块
  var currentModule = '';

  // 搜索源选择
  filterChips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      chip.classList.toggle('selected');
    });
  });

  // 模块筛选选择
  moduleChips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      moduleChips.forEach(function(c) { c.classList.remove('selected'); });
      chip.classList.add('selected');
      currentModule = chip.getAttribute('data-module');
      // 如果已有搜索词，重新搜索
      if (searchInput.value.trim()) doSearch();
    });
  });

  // 点击外部关闭快速提示
  document.addEventListener('click', function(e) {
    if (quickHint && !quickHint.contains(e.target) && e.target !== searchInput) {
      quickHint.style.display = 'none';
    }
  });

  // 搜索执行
  var searchTimer = null;
  var currentSearchId = 0; // 用于取消过期的搜索请求

  // Supabase 直连搜索题目
  function _searchQuestionsFromSupabase(query, module) {
    var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb || !query) return Promise.resolve({ results: [], total: 0 });
    var q = sb.from('questions').select('*').ilike('question', '%' + query + '%').limit(20);
    if (module) q = q.eq('module', String(module));
    return q.then(function(result) {
      if (result.error || !result.data) return { results: [], total: 0 };
      var results = result.data.map(function(item) {
        return {
          type: item.type, question: item.question,
          subQuestions: item.sub_questions || [],
          explanation: item.explanation || '', subject: item.subject || '',
          difficulty: item.difficulty || 'medium', module: item.module
        };
      });
      return { results: results, total: results.length };
    }).catch(function() { return { results: [], total: 0 }; });
  }

  var doSearch = function() {
    var query = searchInput.value.trim();
    if (!query) {
      resultsArea.innerHTML = '<div class="search-empty-state"><div class="search-empty-icon">暂无结果</div><p>输入关键词开始搜索</p></div>';
      return;
    }

    var selectedSources = [];
    filterChips.forEach(function(c) {
      if (c.classList.contains('selected')) selectedSources.push(c.getAttribute('data-source'));
    });

    if (selectedSources.length === 0) {
      resultsArea.innerHTML = '<div class="search-no-result">请至少选择一个搜索范围</div>';
      return;
    }

    var searchId = ++currentSearchId;
    resultsArea.innerHTML = '<div class="search-loading"><div class="search-loading-spinner"></div>搜索中...</div>';

    // 本地题库搜索（通过 Supabase 直连）
    var localPromise = selectedSources.indexOf('local') >= 0
      ? _searchQuestionsFromSupabase(query, currentModule)
      : Promise.resolve({ results: [], total: 0 });

    // 外部搜索（暂不支持，返回空结果）
    var externalSources = selectedSources.filter(function(s) { return s !== 'local'; });
    var externalPromise = Promise.resolve({ results: [] });

    Promise.all([localPromise, externalPromise]).then(function(responses) {
      // 检查是否已被新搜索取代
      if (searchId !== currentSearchId) return;

      var localData = responses[0];
      var externalData = responses[1];
      var html = '';

      var localResults = localData.results || [];
      var localTotal = localData.total || 0;

      if (localResults.length > 0) {
        html += '<div class="search-section"><div class="search-section-title">题库搜索 <span class="search-section-count">共 ' + localTotal + ' 题匹配</span></div>';
        localResults.forEach(function(item) {
          var stem = item.question || '';
          var shortStem = stem.length > 150 ? stem.slice(0, 150) + '...' : stem;
          var subject = item.subject || '';
          var concept = item.concept || '';
          var difficulty = item.difficulty || '';
          var moduleLabel = item.module || '';
          var explanation = item.explanation || '';

          // 模块显示名
          var moduleDisplay = moduleLabel;
          if (moduleLabel === 'module_1') moduleDisplay = '模块1';
          else if (moduleLabel === 'module_2') moduleDisplay = '模块2';
          else if (moduleLabel === 'module_3') moduleDisplay = '模块3';
          else if (moduleLabel === 'module_4') moduleDisplay = '模块4';
          else if (moduleLabel === 'exam') moduleDisplay = '考试题';

          // 难度徽章
          var diffBadge = '';
          if (difficulty) {
            var diffNum = parseInt(difficulty) || 0;
            var diffLabel = '';
            var diffClass = '';
            if (diffNum >= 1 && diffNum <= 2) { diffLabel = '简单'; diffClass = 'search-diff-easy'; }
            else if (diffNum === 3) { diffLabel = '中等'; diffClass = 'search-diff-medium'; }
            else if (diffNum >= 4 && diffNum <= 5) { diffLabel = '困难'; diffClass = 'search-diff-hard'; }
            else if (typeof difficulty === 'string') {
              diffLabel = difficulty;
              diffClass = 'search-diff-medium';
            }
            if (diffLabel) diffBadge = '<span class="search-diff-badge ' + diffClass + '">' + escapeHtml(diffLabel) + '</span>';
          }

          html += '<div class="search-result-card search-result-local" data-question-id="' + escapeHtml(item.id || '') + '">';
          html += '<div class="search-result-stem">' + highlightMatch(escapeHtml(shortStem), query) + '</div>';
          if (explanation) {
            var shortExp = explanation.length > 100 ? explanation.slice(0, 100) + '...' : explanation;
            html += '<div class="search-result-explanation">' + highlightMatch(escapeHtml(shortExp), query) + '</div>';
          }
          html += '<div class="search-result-meta">';
          if (subject) html += '<span class="search-result-tag">' + highlightMatch(escapeHtml(subject), query) + '</span>';
          if (concept) html += '<span class="search-result-tag">' + highlightMatch(escapeHtml(concept), query) + '</span>';
          if (moduleDisplay) html += '<span class="search-result-module">' + escapeHtml(moduleDisplay) + '</span>';
          html += diffBadge;
          html += '</div></div>';
        });

        // 分页提示
        if (localTotal > 30) {
          html += '<div class="search-more-hint">显示前 30 条，共 ' + localTotal + ' 条匹配</div>';
        }
        html += '</div>';
      }

      var allExternal = externalData.results || [];

      if (allExternal.length > 0) {
        // 为每条结果提取 tags
        var taggedResults = [];
        allExternal.forEach(function(item) {
          var textToTag = (item.abstract || item.title || item.name || '');
          var tags = extractTags(textToTag);
          // 如果提取不到 tags，用来源名作为默认 tag
          if (tags.length === 0) tags = [item.name || '其他'];
          taggedResults.push({
            item: item,
            tags: tags,
            mainTag: tags[0]
          });
        });

        // 按 mainTag 分组
        var groups = {};
        taggedResults.forEach(function(tr) {
          var g = tr.mainTag;
          if (!groups[g]) groups[g] = [];
          groups[g].push(tr);
        });

        // 排序：结果数多的 group 排前面
        var sortedGroups = Object.keys(groups).sort(function(a, b) {
          return groups[b].length - groups[a].length;
        });

        // 渲染每个分组
        sortedGroups.forEach(function(tagName) {
          var itemsInGroup = groups[tagName];

          html += '<div class="search-tag-group">';
          html += '<div class="search-tag-group-header">';
          html += '<span class="search-tag-group-name">#' + escapeHtml(tagName) + '</span>';
          html += '<span class="search-tag-group-count">' + itemsInGroup.length + ' 条结果</span>';
          html += '</div>';
          html += '<div class="search-tag-group-items">';

          itemsInGroup.forEach(function(tr) {
            var item = tr.item;
            var allTags = tr.tags;

            html += '<div class="search-result-card">';

            // 标题（最突出）
            if (item.title) {
              html += '<div class="search-result-title">' + escapeHtml(item.title) + '</div>';
            }

            // 摘要（次要）
            if (item.abstract) {
              html += '<div class="search-result-abstract">' + escapeHtml(item.abstract) + '</div>';
            }

            // 该条的所有 tag（核心：用tag描述内容）
            if (allTags.length > 0) {
              html += '<div class="search-result-tags">';
              allTags.forEach(function(t) {
                var isActive = t === tagName;
                html += '<span class="search-tag' + (isActive ? ' search-tag-active' : '') + '">' + escapeHtml(t) + '</span>';
              });
              html += '</div>';
            }

            // 来源信息（淡化，放在底部）
            if (item.name) {
              html += '<div class="search-result-source">来源: ' + escapeHtml(item.name) + '</div>';
            }

            // 链接
            if (item.url) {
              html += '<a class="search-result-goto" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">查看原文 &rarr;</a>';
            }

            html += '</div>';
          });

          html += '</div></div>'; // group-items + tag-group
        });
      }

      // 无结果
      if (!html && localResults.length === 0) {
        html = '<div class="search-no-result">未找到与"' + escapeHtml(query) + '"相关的结果</div>';
      } else if (!html) {
        html = '<div class="search-no-result">未找到外部结果</div>';
      }

      resultsArea.innerHTML = html;

      // 本地题目点击跳转练习
      resultsArea.querySelectorAll('.search-result-local').forEach(function(card) {
        card.addEventListener('click', function() {
          var qId = card.getAttribute('data-question-id');
          if (qId && typeof navigateTo === 'function') {
            sessionStorage.setItem('tatabox_redo_question', qId);
            navigateTo('/practice');
          }
        });
      });
    });
  };

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch();
  });

  // 输入时实时搜索（防抖 300ms）
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function() {
      var query = searchInput.value.trim();
      if (query.length >= 2) {
        // 实时搜索题库（Supabase 直连）
        _searchQuestionsFromSupabase(query, null)
          .then(function(data) {
            var results = data.results || [];
            if (results.length > 0) {
              var hintHtml = '';
              results.slice(0, 5).forEach(function(item) {
                var stem = (item.question || '').slice(0, 60);
                hintHtml += '<div class="search-quick-item" data-qid="' + (item.id || '') + '">' + escapeHtml(stem) + '</div>';
              });
              quickHint.innerHTML = hintHtml;
              quickHint.style.display = 'block';

              quickHint.querySelectorAll('.search-quick-item').forEach(function(el) {
                el.addEventListener('click', function() {
                  sessionStorage.setItem('tatabox_redo_question', el.getAttribute('data-qid'));
                  if (typeof navigateTo === 'function') navigateTo('/practice');
                });
              });
            } else {
              quickHint.style.display = 'none';
            }
          })
          .catch(function() {
            quickHint.style.display = 'none';
          });
      } else {
        quickHint.style.display = 'none';
      }
    }, 300);
  });

  // URL 参数支持（P1-5：对入参做清洗，限制长度并剔除控制字符）
  var urlQuery = new URLSearchParams(window.location.hash.split('?')[1] || '').get('q');
  urlQuery = (urlQuery && typeof sanitizeUrlParam === 'function') ? sanitizeUrlParam(urlQuery, 100) : urlQuery;
  if (urlQuery) {
    searchInput.value = urlQuery;
    doSearch();
  } else {
    searchInput.focus();
  }
}


/**
 * 高亮匹配文本
 */
function highlightMatch(text, query) {
  if (!query || !text) return text;
  // 对查询中的特殊正则字符进行转义
  var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('(' + escaped + ')', 'gi');
  return text.replace(re, '<mark class="search-highlight">$1</mark>');
}


/**
 * 本地搜索函数 — 搜索错题和练习记录（保留用于离线场景）
 */
function searchLocalQuestions(query) {
  if (!query || query.length < 1) return [];
  var lower = query.toLowerCase();
  var results = [];

  // 从 localStorage 中搜索错题和收藏
  var wrongQuestions = typeof getWrongQuestions === 'function' ? (getWrongQuestions() || []) : [];
  wrongQuestions.forEach(function(w) {
    var text = (w.questionText || '').toLowerCase();
    if (text.indexOf(lower) >= 0) {
      results.push({
        question: w.questionText,
        subject: w.subject || '',
        concept: '',
        module: w.module || '',
        id: w.qId || '',
        source: 'wrong'
      });
    }
  });

  // 从练习记录中搜索
  var records = typeof getRecords === 'function' ? (getRecords() || []) : [];
  records.forEach(function(r) {
    if (r.questions) {
      r.questions.forEach(function(q) {
        var text = (q.question || '').toLowerCase();
        var concept = (q.concept || '').toLowerCase();
        if (text.indexOf(lower) >= 0 || concept.indexOf(lower) >= 0) {
          results.push({
            question: q.question,
            subject: q.subject || '',
            concept: q.concept || '',
            module: r.module || '',
            id: '',
            source: 'record'
          });
        }
      });
    }
  });

  // 去重
  var seen = {};
  return results.filter(function(r) {
    var questionText = r.question || '';
    var key = questionText.slice(0, 50);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 30);
}


/**
 * 从文本中提取关键词标签
 */
function extractTags(text) {
  if (!text || text.length < 4) return [];

  // 清理 HTML 标签
  text = text.replace(/<[^>]+>/g, ' ');

  // 中文停用词
  var stopWords = {
    '的':1,'了':1,'是':1,'在':1,'有':1,'和':1,'与':1,'或':1,'等':1,'及':1,'其':1,
    '这':1,'那':1,'个':1,'一':1,'二':1,'三':1,'可以':1,'进行':1,'通过':1,
    '关于':1,'以及':1,'对':1,'中':1,'上':1,'下':1,'内':1,'外':1,'以':1,
    '为':1,'被':1,'由':1,'将':1,'把':1,'让':1,'使':1,'会':1,'能':1,'可能':1,
    'the':1,'a':1,'an':1,'is':1,'are':1,'was':1,'were':1,'of':1,'to':1,'in':1,
    'for':1,'and':1,'or':1,'not':1,'with':1,'on':1,'at':1,'by':1,'from':1,'as':1,
    'it':1,'this':1,'that':1,'which':1,'who':1,'what':1,'how':1,'when':1,'where':1,
    'also':1,'more':1,'than':1,'some':1,'such':1,'into':1,'over':1,'after':1,'before':1,
    'between':1,'under':1,'during':1,'without':1,'within':1,'about':1,'above':1,'below':1,
    '我们':1,'他们':1,'它们':1,'她':1,'他':1,'我':1,'你':1,'大家':1,'通常':1,
    '一般':1,'包括':1,'主要':1,'重要':1,'相关':1,'不同':1,'相同':1,'各种':1,
    '一种':1,'一个':1,'这个':1,'那个':1,'什么':1,'如何':1,'为什么':1,'因为':1,
    '所以':1,'但是':1,'然而':1,'因此':1,'另外':1,'此外':1,'首先':1,'其次':1,
    '最后':1,'然后':1,'或者':1,'而且':1,'并且':1,'同时':1,'虽然':1,'尽管':1,
    '如果':1,'除非':1,'只要':1,'无论':1,'不管':1,'即使':1,'就算':1
  };

  // 分词：按标点、空格、常见分隔符分割
  var segments = text.split(/[\s,.;:!?"'（）【】《》\[\]{}、，。！？；：""''—–\-\n\r\t\/\\|@#\$%^&*()+<>=~`]+/);

  var freq = {};
  segments.forEach(function(s) {
    s = s.trim();
    // 过滤条件：长度 2-15 字符，不是纯数字，不是停用词
    if (s.length >= 2 && s.length <= 15 && !stopWords[s.toLowerCase()] && !/^\d+$/.test(s)) {
      freq[s] = (freq[s] || 0) + 1;
    }
  });

  // 取频率最高的 5 个
  var topTags = Object.keys(freq).sort(function(a, b) { return freq[b] - freq[a]; }).slice(0, 5);

  return topTags;
}


// 聚合搜索功能

function showSearchModal(prefillQuery) {
  if (typeof navigateTo === 'function') {
    navigateTo('/search');
    setTimeout(function() {
      var input = document.getElementById('search-page-input');
      if (input && prefillQuery) {
        input.value = prefillQuery;
        var btn = document.getElementById('search-page-btn');
        if (btn) btn.click();
      }
    }, 200);
  }
}


function closeSearchModal() {
  // 兼容性保留空函数
}

window.showSearchModal = showSearchModal;

window.closeSearchModal = closeSearchModal;

window.renderSearchPage = renderSearchPage;

window.searchLocalQuestions = searchLocalQuestions;

window.extractTags = extractTags;
