/**
 * ============================================================
 * TATABOX — 百科模块 (Wiki Module)
 * ============================================================
 * 一个纯前端、基于 localStorage 的生物学词条 Wiki。
 * 功能：
 *   1. 词条 CRUD（创建 / 阅读 / 编辑 / 删除）
 *   2. 全文搜索 + 分类筛选 + 标签筛选
 *   3. 从维基百科（中文 / English）自动抓取并导入词条
 *      —— 使用 Wikipedia REST API 与 Action API（均支持 CORS，origin=*）
 *   4. 从百度百科抓取（经 r.jina.ai 阅读器中转，实验性）
 *   5. 手动粘贴 Markdown 导入（通用兜底）
 *   6. Markdown 渲染复用 window.BioQuestMarkdown（内置 DOMPurify 消毒）
 *
 * 设计参考：TiddlyWiki / MyWiki / m.html 等纯前端单文件 Wiki。
 * 数据全部存储在浏览器 localStorage，无后端依赖。
 * ============================================================
 */

'use strict';

(function () {
  var STORAGE_KEY = 'bioquest_wiki_entries_v1';
  var SEED_FLAG_KEY = 'bioquest_wiki_seeded_v1';
  var SEED_URL = 'data/wiki-seed.json?v=20260812a';

  // Supabase 配置（匿名 key 公开，仅用于公开读取词条；表结构见 sql/wiki_entries.sql）
  var SB_URL = 'https://qxehkfucvmxuojjkdaqy.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';
  var SB_TABLE = 'wiki_entries';

  // 学科分类（与 topics.json / knowledge-graph 配色保持一致）
  var CATEGORIES = [
    '细胞生物学', '分子生物学', '生物化学', '遗传学',
    '动物学', '植物学', '微生物学', '生态学'
  ];

  // 分类 → 主题色（用于徽章着色，与 ebook.css 的关联知识点配色一致）
  var CATEGORY_COLORS = {
    '细胞生物学': '#3a5ba4',
    '分子生物学': '#6a4aa4',
    '生物化学': '#a47a2a',
    '遗传学': '#a45a2a',
    '动物学': '#a43a5a',
    '植物学': '#3a8a3a',
    '微生物学': '#2a8aa4',
    '生态学': '#2a7c4a'
  };

  var state = {
    entries: [],
    filter: { keyword: '', category: '', tag: '' },
    view: 'list',          // list | detail
    currentId: null,
    editingId: null        // 编辑模式时的词条 id（null=新建）
  };

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('[Wiki] 读取本地词条失败:', e.message);
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
      return true;
    } catch (e) {
      console.error('[Wiki] 保存失败:', e.message);
      toast('保存失败：' + (e.message || '存储空间不足'), 'error');
      return false;
    }
  }

  // 从 Supabase 读取词条（公开读）。失败或表不存在时返回 null，交由本地种子兜底。
  function loadSupabaseEntries() {
    var url = SB_URL + '/rest/v1/' + SB_TABLE + '?select=id,title,aliases,summary,content,category,tags,source,source_url,created_at,updated_at&order=title.asc&limit=1000';
    return fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) return null;
        return rows.map(function (row) {
          return {
            id: row.id,
            title: row.title,
            aliases: row.aliases || [],
            summary: row.summary || '',
            content: row.content || '',
            category: row.category || '',
            tags: row.tags || [],
            source: row.source || 'wikipedia',
            sourceUrl: row.source_url || '',
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
          };
        });
      })
      .catch(function () { return null; });
  }

  // 从本地种子文件加载
  function loadLocalSeed() {
    return fetch(SEED_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var seeds = (data && data.entries) || [];
        var now = Date.now();
        seeds.forEach(function (e, i) {
          e.createdAt = now - (seeds.length - i) * 86400000;
          e.updatedAt = e.createdAt;
        });
        return seeds;
      })
      .catch(function () { return []; });
  }

  function ensureSeed() {
    if (localStorage.getItem(SEED_FLAG_KEY)) {
      state.entries = loadEntries();
      return;
    }
    // 优先从 Supabase 取数；失败/为空则回退到本地种子文件
    loadSupabaseEntries()
      .then(function (supabaseEntries) {
        if (supabaseEntries && supabaseEntries.length) {
          state.entries = supabaseEntries;
        } else {
          return loadLocalSeed().then(function (local) {
            state.entries = local;
          });
        }
      })
      .then(function () {
        saveEntries();
        localStorage.setItem(SEED_FLAG_KEY, '1');
        renderAll();
      })
      .catch(function (err) {
        console.warn('[Wiki] 种子加载失败，以空 Wiki 启动:', (err && err.message) || err);
        state.entries = [];
        localStorage.setItem(SEED_FLAG_KEY, '1');
        renderAll();
      });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return window.escapeHtml(s);
  }

  // 仅允许 http(s) 协议的 URL（用于渲染到 href，防止 javascript: 等协议）
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function renderMd(text) {
    if (typeof window.BioQuestMarkdown === 'function') {
      return window.BioQuestMarkdown(text, { autoLink: true, openExternal: true, sanitize: true });
    }
    return '<p>' + esc(text) + '</p>';
  }

  function newId() {
    return typeof window.generateId === 'function'
      ? window.generateId({ prefix: 'wiki-' })
      : 'wiki-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }


  /**
   * 获取当前编辑者信息（头像 + 用户名/昵称）
   * 优先取全局登录用户；当前页面未加载登录模块时，回退读取
   * localStorage「bioquest_user_info」（由登录页写入），未登录则标记为「游客」
   */
  function getCurrentAuthor() {
    var author = { username: '游客', display_name: '游客', avatar: '' };
    try {
      if (typeof window.isLoggedIn === 'function' && window.isLoggedIn()) {
        var u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
        if (u) {
          author.username = u.username || u.email || '用户';
          author.display_name = u.display_name || u.username || '用户';
          if (typeof window.getAvatarUrl === 'function') {
            try { author.avatar = window.getAvatarUrl() || ''; } catch (e) { author.avatar = ''; }
          }
          return author;
        }
      }
    } catch (e) { /* 静默 */ }
    // 轻页面（如 wiki.html 未加载 supabase-client）回退读取持久化用户信息
    try {
      var raw = localStorage.getItem('bioquest_user_info');
      if (raw) {
        var info = JSON.parse(raw);
        if (info && (info.display_name || info.username)) {
          author.display_name = info.display_name || info.username || '用户';
          author.username = info.username || author.display_name || '用户';
          author.avatar = info.avatar || '';
        }
      }
    } catch (e) { /* 静默 */ }
    return author;
  }

  /**
   * 行级差量统计：返回新增行数与删除行数（类似 GitHub 的 +N / -N）
   * 空字符串视为 0 行，忽略空行，避免「新建」时产生虚假的删除计数。
   */
  function diffStats(oldText, newText) {
    function splitLines(s) {
      if (!String(s)) return [];
      return String(s).split('\n').filter(function (l) { return l.length > 0; });
    }
    var o = splitLines(oldText);
    var n = splitLines(newText);
    var om = {}, nm = {};
    o.forEach(function (l) { om[l] = (om[l] || 0) + 1; });
    n.forEach(function (l) { nm[l] = (nm[l] || 0) + 1; });
    var added = 0, deleted = 0;
    var seen = {};
    function visit(l) {
      if (seen[l]) return;
      seen[l] = 1;
      var d = (nm[l] || 0) - (om[l] || 0);
      if (d > 0) added += d; else deleted += -d;
    }
    Object.keys(om).forEach(visit);
    Object.keys(nm).forEach(visit);
    return { added: added, deleted: deleted };
  }

  // 简易 MD5（用于生成维基共享资源缩略图 URL）
  function md5(string) {
    function RotateLeft(lValue, iShiftBits) {
      return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function AddUnsigned(lX, lY) {
      var lX4, lY4, lX8, lY8, lResult;
      lX8 = (lX & 0x80000000);
      lY8 = (lY & 0x80000000);
      lX4 = (lX & 0x40000000);
      lY4 = (lY & 0x40000000);
      lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
      if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
      if (lX4 | lY4) {
        if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
        else return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
      } else return (lResult ^ lX8 ^ lY8);
    }
    function F(x, y, z) { return (x & y) | ((~x) & z); }
    function G(x, y, z) { return (x & z) | (y & (~z)); }
    function H(x, y, z) { return (x ^ y ^ z); }
    function I(x, y, z) { return (y ^ (x | (~z))); }
    function FF(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
    function GG(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
    function HH(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
    function II(a, b, c, d, x, s, ac) { a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac)); return AddUnsigned(RotateLeft(a, s), b); }
    function ConvertToWordArray(string) {
      var lWordCount;
      var lMessageLength = string.length;
      var lNumberOfWords_temp1 = lMessageLength + 8;
      var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
      var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
      var lWordArray = Array(lNumberOfWords - 1);
      var lBytePosition = 0;
      var lByteCount = 0;
      while (lByteCount < lMessageLength) {
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
        lByteCount++;
      }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
      return lWordArray;
    }
    function WordToHex(lValue) {
      var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
      for (lCount = 0; lCount <= 3; lCount++) {
        lByte = (lValue >>> (lCount * 8)) & 255;
        WordToHexValue_temp = "0" + lByte.toString(16);
        WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
      }
      return WordToHexValue;
    }
    var x = [];
    var k, AA, BB, CC, DD, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    string = unescape(encodeURIComponent(string));
    x = ConvertToWordArray(string);
    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
      AA = a; BB = b; CC = c; DD = d;
      a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
      d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
      c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
      b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
      a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
      d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
      c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
      b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
      a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
      d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
      c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
      b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
      a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
      d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
      c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
      b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
      a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
      d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
      c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
      b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
      a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
      d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
      c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
      b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
      a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
      d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
      c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
      b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
      a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
      d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
      c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
      b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
      a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
      d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
      c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
      b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
      a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
      d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
      c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
      b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
      a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
      d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
      c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
      b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
      a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
      d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
      c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
      b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
      a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
      d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
      c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
      b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
      a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
      d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
      c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
      b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
      a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
      d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
      c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
      b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
      a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
      d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
      c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
      b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
      a = AddUnsigned(a, AA);
      b = AddUnsigned(b, BB);
      c = AddUnsigned(c, CC);
      d = AddUnsigned(d, DD);
    }
    return (WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d)).toLowerCase();
  }

  // 根据维基文件名生成 upload.wikimedia.org 缩略图 URL
  function wikimediaThumbUrl(fileName, width) {
    var name = String(fileName || '').replace(/\s+/g, '_');
    if (!name) return '';
    width = width || 400;
    var hash = md5(unescape(encodeURIComponent(name)));
    var enc = encodeURIComponent(name).replace(/%2F/gi, '/');
    var base = 'https://upload.wikimedia.org/wikipedia/commons/';
    var thumb = base + hash.charAt(0) + '/' + hash.slice(0, 2) + '/' + enc + '/' + width + 'px-' + enc;
    // Commons 对 SVG 缩略图要求补 .png 后缀（位图化约定），否则 404
    if (/\.svg$/i.test(name)) thumb += '.png';
    return thumb;
  }

  // 维基维护/导航类图标（质量标记、跨语言导航等）——非内容配图，导入时排除
  var WIKI_JUNK_IMAGE_RE = /Ambox|Question[_ ]book|Edit-clear|Symbol_|Loudspeaker|Wiki[_ ]letter|Crystal[_ ]Clear|BSicon|Gnome-|Commons-logo|Padlock|Cscr-|Wiktionary|Wikibooks|Wikiquote|Wikisource|Wikiversity|Wikivoyage|_stub\.|Stub\.|Increase2?\.png|Decrease2?\.png|Portal\.png|Font_awesome|Information_icon|No_image/i;

  // 将维基表格 {| ... |} 转为 Markdown 表格
  function wikitableToMarkdown(tbl) {
    var lines = String(tbl || '').split('\n');
    var rows = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;
      if (ln.indexOf('{|') === 0) continue;
      if (ln.indexOf('|}') === 0) break;
      if (ln.indexOf('|-') === 0) { if (cur) rows.push(cur); cur = null; continue; }
      var ch = ln.charAt(0);
      if (ch === '|' || ch === '!') {
        var isHeadRow = ch === '!';
        var rest = ln.slice(1);
        // 去掉 style="..." 属性
        rest = rest.replace(/^style="[^"]*"\s*/i, '').replace(/^style=[\w-]+/i, '').trim();
        // 去掉行尾的单个 |（行终止符），再按内联分隔符拆分
        rest = rest.replace(/\s*\|\s*$/, '');
        var sepRe = isHeadRow ? /\s*!!\s*/ : /\s*\|\|\s*/;
        var cellArr = rest.split(sepRe);
        cellArr.forEach(function (cell) {
          cell = String(cell).trim();
          // 内嵌 [[链接]] / 粗体等简单清理
          cell = cell.replace(/\[\[(?:\s*[^\]|]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''([^']+)'''/g, '$1').replace(/''([^']+)''/g, '$1');
          if (!cur) cur = [];
          cur.push({ text: cell, head: isHeadRow });
        });
      }
    }
    if (cur) rows.push(cur);
    if (!rows.length) return '';
    var header = rows.shift();
    var hdr = '| ' + header.map(function (c) { return c.text.replace(/\|/g, '\\|'); }).join(' | ') + ' |';
    var sep = '| ' + header.map(function () { return '---'; }).join(' | ') + ' |';
    var body = rows.map(function (r) {
      return '| ' + r.map(function (c) { return c.text.replace(/\|/g, '\\|'); }).join(' | ') + ' |';
    }).join('\n');
    return hdr + '\n' + sep + (body ? '\n' + body : '');
  }

  // 从维基文本中抽取表格与图片
  function parseWikitextMedia(wt) {
    var tables = [];
    var images = [];
    var raw = String(wt || '');
    // 表格块 → Markdown（从原文抽取）
    raw.replace(/\{\|[\s\S]*?\|\}/g, function (tbl) {
      var md = wikitableToMarkdown(tbl);
      if (md) tables.push(md);
      return '';
    });
    // 图片从「原文」抽取（含信息框/表格内的配图），去重 + 过滤维护图标 + 上限 12
    var seen = {};
    raw.replace(/\[\[(?:File|Image|文件):\s*([^\]|]+)(?:\|[^\]]*)?\]\]/gi, function (_m, name) {
      var n = String(name || '').trim();
      if (!n || seen[n] || WIKI_JUNK_IMAGE_RE.test(n)) return '';
      seen[n] = 1;
      if (images.length < 12) images.push(n);
      return '';
    });
    return { tables: tables.join('\n\n'), images: images };
  }

  function findEntry(id) {
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === id) return state.entries[i];
    }
    return null;
  }

  // 收集所有标签（用于标签筛选）
  function allTags() {
    var map = {};
    state.entries.forEach(function (e) {
      (e.tags || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; });
    });
    return Object.keys(map).map(function (t) { return { name: t, count: map[t] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  var toastTimer = null;
  function toast(msg, type) {
    type = type || 'info';
    var box = $('#wikiToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'wikiToast';
      box.className = 'wiki-toast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.className = 'wiki-toast wiki-toast-' + type + ' show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'wiki-toast wiki-toast-' + type; }, 2600);
  }

  function filteredEntries() {
    var kw = state.filter.keyword.trim().toLowerCase();
    var cat = state.filter.category;
    var tag = state.filter.tag;
    return state.entries.filter(function (e) {
      if (cat && e.category !== cat) return false;
      if (tag && (!e.tags || e.tags.indexOf(tag) === -1)) return false;
      if (kw) {
        var hay = [e.title, e.summary, e.content, (e.aliases || []).join(' '), (e.tags || []).join(' ')]
          .join(' ').toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      // 按 updatedAt 降序
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function renderAll() {
    renderToolbarCounts();
    renderCategoryChips();
    renderTagChips();
    renderList();
  }

  function renderToolbarCounts() {
    var el = $('#wikiCount');
    if (el) el.textContent = String(state.entries.length);
  }

  function renderCategoryChips() {
    var wrap = $('#wikiCategoryFilters');
    if (!wrap) return;
    var html = '<button class="wiki-chip' + (!state.filter.category ? ' active' : '') + '" data-cat="">全部</button>';
    CATEGORIES.forEach(function (c) {
      var n = state.entries.filter(function (e) { return e.category === c; }).length;
      if (n === 0 && state.filter.category !== c) return; // 隐藏空分类（除非当前选中）
      html += '<button class="wiki-chip' + (state.filter.category === c ? ' active' : '') + '" data-cat="' + esc(c) + '" style="--chip-c:' + (CATEGORY_COLORS[c] || 'var(--color-primary)') + '">' + esc(c) + '<span class="wiki-chip-n">' + n + '</span></button>';
    });
    wrap.innerHTML = html;
  }

  function renderTagChips() {
    var wrap = $('#wikiTagFilters');
    if (!wrap) return;
    var tags = allTags();
    if (tags.length === 0) { wrap.innerHTML = ''; return; }
    var html = '<button class="wiki-chip sm' + (!state.filter.tag ? ' active' : '') + '" data-tag="">全部</button>';
    tags.slice(0, 24).forEach(function (t) {
      html += '<button class="wiki-chip sm' + (state.filter.tag === t.name ? ' active' : '') + '" data-tag="' + esc(t.name) + '">' + esc(t.name) + '<span class="wiki-chip-n">' + t.count + '</span></button>';
    });
    wrap.innerHTML = html;
  }

  function sourceBadge(e) {
    var s = e.source || 'manual';
    var label = ({
      seed: '内置', wikipedia: '维基', wikipedia_en: '维基EN', baidu: '百度', manual: '自建'
    })[s] || s;
    return '<span class="wiki-source-badge src-' + esc(s) + '" title="来源：' + esc(label) + '">' + esc(label) + '</span>';
  }

  function renderList() {
    var grid = $('#wikiGrid');
    if (!grid) return;
    var list = filteredEntries();
    if (list.length === 0) {
      grid.innerHTML = '<div class="wiki-empty">' +
        (state.entries.length === 0
          ? '<p>百科还是空的。</p><p>点击「新建词条」开始编写，或「从维基导入」一键抓取生物学名词。</p>'
          : '<p>没有匹配的词条，试试清除筛选条件。</p>') +
        '</div>';
      return;
    }
    var html = '';
    list.forEach(function (e) {
      var color = CATEGORY_COLORS[e.category] || 'var(--color-primary)';
      var tagsHtml = (e.tags || []).slice(0, 4).map(function (t) {
        return '<span class="wiki-card-tag" data-tag="' + esc(t) + '">' + esc(t) + '</span>';
      }).join('');
      var summary = e.summary || stripMd(e.content).slice(0, 90);
      html += '<article class="wiki-card" data-id="' + esc(e.id) + '" style="--cat-c:' + color + '">' +
        '<div class="wiki-card-top">' +
          '<span class="wiki-card-cat">' + esc(e.category || '未分类') + '</span>' +
          sourceBadge(e) +
        '</div>' +
        '<h3 class="wiki-card-title">' + esc(e.title) + '</h3>' +
        '<p class="wiki-card-summary">' + esc(summary) + '</p>' +
        (tagsHtml ? '<div class="wiki-card-tags">' + tagsHtml + '</div>' : '') +
        '<div class="wiki-card-meta"><span>' + relTime(e.updatedAt) + '</span></div>' +
        '</article>';
    });
    grid.innerHTML = html;
  }

  function stripMd(text) {
    if (!text) return '';
    return String(text).replace(/[#*`>\[\]\-_=~|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function relTime(ts) {
    if (!ts) return '';
    try {
      if (typeof window.timeAgo === 'function') return window.timeAgo(ts);
      return window.timeAgo ? window.timeAgo(ts) : '';
    } catch (e) { return ''; }
  }

  // 渲染词条编辑历史（头像 + 用户名/昵称 + 增删统计，类似 GitHub）
  function renderHistoryHtml(e) {
    var hist = (e && Array.isArray(e.history)) ? e.history.slice().reverse() : [];
    if (!hist.length) return '';
    var items = hist.map(function (r) {
      var author = r.author || { display_name: '游客', username: '游客', avatar: '' };
      var name = author.display_name || author.username || '游客';
      var avatarHtml = author.avatar
        ? '<img src="' + esc(author.avatar) + '" alt="" referrerpolicy="no-referrer">'
        : esc(name.charAt(0));
      var add = r.added || 0, del = r.deleted || 0;
      return '<div class="wiki-hist-item">' +
        '<div class="wiki-hist-avatar">' + avatarHtml + '</div>' +
        '<div class="wiki-hist-main">' +
          '<div class="wiki-hist-name">' + esc(name) +
            '<span class="wiki-hist-msg">' + esc(r.message || '') + '</span>' +
            '<span class="wiki-hist-diff">' +
              (add ? '<span class="wiki-diff-add">+' + add + '</span>' : '') +
              (del ? '<span class="wiki-diff-del">−' + del + '</span>' : '') +
            '</span>' +
          '</div>' +
          '<div class="wiki-hist-time">' + esc(relTime(r.ts) || '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="wiki-history">' +
      '<div class="wiki-history-title">编辑历史</div>' +
      items +
    '</div>';
  }

  function openDetail(id) {
    var e = findEntry(id);
    if (!e) return;
    state.view = 'detail';
    state.currentId = id;
    var color = CATEGORY_COLORS[e.category] || 'var(--color-primary)';
    var body = $('#wikiDetailBody');
    var tagsHtml = (e.tags || []).map(function (t) {
      return '<span class="wiki-card-tag" data-tag="' + esc(t) + '">' + esc(t) + '</span>';
    }).join('');
    var aliases = (e.aliases || []).filter(Boolean).join('、');
    body.innerHTML =
      '<div class="wiki-detail-top" style="--cat-c:' + color + '">' +
        '<span class="wiki-card-cat">' + esc(e.category || '未分类') + '</span>' +
        sourceBadge(e) +
      '</div>' +
      '<h2 class="wiki-detail-title">' + esc(e.title) + '</h2>' +
      (aliases ? '<p class="wiki-detail-aliases">别名：' + esc(aliases) + '</p>' : '') +
      (e.summary ? '<p class="wiki-detail-summary">' + esc(e.summary) + '</p>' : '') +
      '<div class="wiki-detail-content">' + renderMd(e.content || '') + '</div>' +
      (tagsHtml ? '<div class="wiki-card-tags">' + tagsHtml + '</div>' : '') +
      (e.sourceUrl ? '<p class="wiki-detail-source">来源链接：<a href="' + esc(safeUrl(e.sourceUrl)) + '" target="_blank" rel="noopener noreferrer">' + esc(e.sourceUrl) + '</a></p>' : '') +
      '<p class="wiki-detail-time">最后更新：' + esc(relTime(e.updatedAt) || '—') + '</p>' +
      renderHistoryHtml(e);

    // 绑定操作按钮
    var editBtn = $('#wikiDetailEdit');
    if (editBtn) editBtn.dataset.id = id;
    var delBtn = $('#wikiDetailDelete');
    if (delBtn) delBtn.dataset.id = id;

    openModal('wikiDetailModal');
  }

  function openEditor(id) {
    state.editingId = id || null;
    var e = id ? findEntry(id) : null;
    var f = $('#wikiEditorForm').elements;
    f.title.value = e ? e.title : '';
    f.aliases.value = e ? (e.aliases || []).join('、') : '';
    f.category.value = e ? e.category : '';
    f.tags.value = e ? (e.tags || []).join('、') : '';
    f.summary.value = e ? (e.summary || '') : '';
    f.content.value = e ? (e.content || '') : '';
    updateEditorPreview();
    $('#wikiEditorTitle').textContent = e ? '编辑词条' : '新建词条';
    openModal('wikiEditorModal');
    setTimeout(function () { f.title.focus(); }, 50);
  }

  function updateEditorPreview() {
    var ta = $('#wikiEditorForm').elements['content'];
    var prev = $('#wikiEditorPreview');
    prev.innerHTML = renderMd(ta.value);
  }

  function saveEditor(ev) {
    ev.preventDefault();
    var f = $('#wikiEditorForm').elements;
    var title = f.title.value.trim();
    if (!title) { toast('请填写标题', 'error'); f.title.focus(); return; }
    var content = f.content.value.trim();
    if (!content) { toast('请填写正文内容', 'error'); f.content.focus(); return; }

    var entry = state.editingId ? findEntry(state.editingId) : null;
    var now = nowIso();
    var tags = splitByDelim(f.tags.value);
    var aliases = splitByDelim(f.aliases.value);

    // 记录本次提交（作者头像/昵称 + 增删统计），类似 GitHub 提交历史
    var wasNew = !entry;
    var oldContent = entry ? entry.content : '';
    var stats = diffStats(oldContent, content);
    var revision = {
      ts: now,
      message: wasNew ? '新建词条' : '编辑内容',
      added: stats.added,
      deleted: stats.deleted,
      author: getCurrentAuthor()
    };

    if (entry) {
      entry.title = title;
      entry.aliases = aliases;
      entry.category = f.category.value.trim();
      entry.tags = tags;
      entry.summary = f.summary.value.trim();
      entry.content = content;
      entry.updatedAt = now;
      if (!Array.isArray(entry.history)) entry.history = [];
      entry.history.push(revision);
    } else {
      entry = {
        id: newId(),
        title: title,
        aliases: aliases,
        category: f.category.value.trim(),
        tags: tags,
        summary: f.summary.value.trim(),
        content: content,
        source: 'manual',
        sourceUrl: '',
        createdAt: now,
        updatedAt: now,
        history: [revision]
      };
      state.entries.unshift(entry);
    }
    saveEntries();
    closeModal('wikiEditorModal');
    renderAll();
    toast(state.editingId ? '已更新' : '已创建', 'success');
  }

  function splitByDelim(str) {
    return String(str || '').split(/[、,，;;\n]+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function deleteEntry(id) {
    var e = findEntry(id);
    if (!e) return;
    if (!confirm('确定删除词条「' + e.title + '」？此操作不可撤销。')) return;
    state.entries = state.entries.filter(function (x) { return x.id !== id; });
    saveEntries();
    closeModal('wikiDetailModal');
    renderAll();
    toast('已删除', 'success');
  }

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('show');
    // 若没有其它模态打开，恢复滚动
    if (!$all('.wiki-modal.show').length) document.body.style.overflow = '';
  }

  //  从维基百科 / 百度百科导入

  // 维基百科 plain-text extract → markdown
  function wikiTextToMd(text) {
    if (!text) return '';
    var t = String(text);
    // 标题：== xx == → ## xx ；=== xx === → ### xx（MediaWiki 中 N 个 = 对应 HN）
    t = t.replace(/^(={2,})(.+?)\1\s*$/gm, function (_m, eq, h) {
      var lvl = Math.min(eq.length, 6);
      var prefix = '';
      for (var i = 0; i < lvl; i++) prefix += '#';
      return prefix + ' ' + h.trim();
    });
    // 粗体 '''x''' → **x** ；斜体 ''x'' → *x*
    t = t.replace(/'''(.+?)'''/g, '**$1**');
    t = t.replace(/''(.+?)''/g, '*$1*');
    // 内部链接 [[A|B]] → B ；[[A]] → A
    t = t.replace(/\[\[[^\]]*\|([^\]]+)\]\]/g, '$1');
    t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
    // 外部链接 [http://x label] → label
    t = t.replace(/\[https?:\/\/[^\s\]]+\s([^\]]+)\]/g, '$1');
    // 模板 {{...}} → 移除（贪婪到行末的 }}
    t = t.replace(/\{\{[^}]*\}\}/g, '');
    // HTML 注释
    t = t.replace(/<!--[\s\S]*?-->/g, '');
    return t.trim();
  }

  // Wikipedia Action API：获取 plain-text extract
  function fetchWikipediaExtract(title, lang) {
    lang = lang || 'zh';
    var api = 'https://' + lang + '.wikipedia.org/w/api.php';
    var url = api + '?action=query&format=json&prop=extracts|info&explaintext=1&inprop=url&redirects=1' +
      '&titles=' + encodeURIComponent(title) + '&origin=*';
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var pages = (data && data.query && data.query.pages) || {};
        var keys = Object.keys(pages);
        if (!keys.length) throw new Error('未找到该词条');
        var p = pages[keys[0]];
        if (p.missing !== undefined) throw new Error('维基百科中未找到「' + title + '」');
        return {
          title: p.title,
          extract: p.extract || '',
          url: (p.fullurl) || ('https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(p.title))
        };
      });
  }

  // 获取维基原文 wikitext（含表格与图片标记），用于补全导入的表格/图片
  function fetchWikipediaWikitext(title, lang) {
    lang = lang || 'zh';
    var api = 'https://' + lang + '.wikipedia.org/w/api.php';
    var url = api + '?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&redirects=1' +
      '&titles=' + encodeURIComponent(title) + '&origin=*';
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var pages = (data && data.query && data.query.pages) || {};
        var keys = Object.keys(pages);
        if (!keys.length) return '';
        var p = pages[keys[0]];
        if (p.missing !== undefined) return '';
        var rev = p.revisions && p.revisions[0];
        var slot = rev && rev.slots && rev.slots.main;
        if (slot) return slot['*'] || slot.content || '';
        if (rev) return rev['*'] || '';
        return '';
      });
  }

  // Wikipedia REST API：获取摘要 + 缩略图（更友好的 summary）
  function fetchWikipediaSummary(title, lang) {
    lang = lang || 'zh';
    var url = 'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { if (r.status === 404) throw new Error('未找到该词条'); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        return {
          title: data.title,
          summary: data.extract || '',
          thumbnail: (data.thumbnail && data.thumbnail.source) || '',
          url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || ''
        };
      });
  }

  // 百度百科：经 r.jina.ai 阅读器中转抓取（实验性，可能受限于网络/速率）
  function fetchBaiduViaReader(title) {
    var target = 'https://baike.baidu.com/item/' + encodeURIComponent(title);
    var readerUrl = 'https://r.jina.ai/' + target;
    return fetch(readerUrl, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (md) {
        if (!md || md.length < 50) throw new Error('抓取内容为空');
        // r.jina.ai 返回的 markdown 顶部通常含 Title: / URL Source: / Markdown Content:
        var cleaned = cleanReaderMarkdown(md);
        return {
          title: title,
          markdown: cleaned.body,
          url: target
        };
      });
  }

  function cleanReaderMarkdown(md) {
    // 提取 Title 与正文
    var title = '';
    var mTitle = md.match(/^Title:\s*(.+)$/m);
    if (mTitle) title = mTitle[1].trim();
    // 截掉 URL Source 行及之后到 Markdown Content 之间的元信息
    var body = md;
    var mContent = md.match(/Markdown Content:\s*\n?([\s\S]*)$/);
    if (mContent) body = mContent[1];
    else {
      // 移除前导元数据行
      body = md.replace(/^(Title|URL Source|Markdown Content):.*\n?/gm, '');
    }
    return { title: title, body: body.trim() };
  }

  // 执行导入
  function runImport() {
    var f = $('#wikiImportForm').elements;
    var source = f.source.value;
    var title = f.title.value.trim();
    if (source !== 'manual' && !title) { toast('请输入词条名称', 'error'); f.title.focus(); return; }

    var btn = $('#wikiImportBtn');
    var statusEl = $('#wikiImportStatus');
    btn.disabled = true;
    btn.classList.add('loading');
    statusEl.className = 'wiki-import-status info';
    statusEl.textContent = '正在抓取「' + (title || '手动内容') + '」…';

    var promise;
    if (source === 'zh' || source === 'en') {
      var lang = source === 'zh' ? 'zh' : 'en';
      // 同时抓取：摘要 + 纯文本正文 + 原文（补全表格与图片）
      promise = Promise.all([
        fetchWikipediaSummary(title, lang),
        fetchWikipediaExtract(title, lang),
        fetchWikipediaWikitext(title, lang)
      ]).then(function (arr) {
        var sum = arr[0], ext = arr[1], wt = arr[2];
        var media = parseWikitextMedia(wt);
        var parts = [];
        // 词条主图（来自 REST 摘要缩略图）
        if (sum.thumbnail) parts.push('![图片来源：' + (ext.title || title) + '](' + sum.thumbnail + ')');
        // 正文纯文本
        var body = wikiTextToMd(ext.extract) || '';
        if (body) parts.push(body);
        // 表格（转成 Markdown 表格）
        if (media.tables) parts.push(media.tables);
        // 图片（生成维基共享资源缩略图链接）
        var imgs = [];
        (media.images || []).slice(0, 12).forEach(function (fn) {
          var u = wikimediaThumbUrl(fn, 400);
          if (u) imgs.push('![' + fn.replace(/\.(jpg|jpeg|png|gif|svg|webp)$/i, '') + '](' + u + ')');
        });
        if (imgs.length) parts.push(imgs.join('\n'));
        var content = parts.filter(Boolean).join('\n\n');
        return {
          title: ext.title || sum.title || title,
          summary: sum.summary || '',
          content: content,
          category: '',
          source: source === 'zh' ? 'wikipedia' : 'wikipedia_en',
          sourceUrl: ext.url || sum.url,
          thumbnail: sum.thumbnail
        };
      });
    } else if (source === 'baidu') {
      promise = fetchBaiduViaReader(title).then(function (r) {
        return {
          title: r.title || title,
          summary: stripMd(r.markdown).slice(0, 120),
          content: r.markdown,
          category: '',
          source: 'baidu',
          sourceUrl: r.url
        };
      });
    } else {
      // 手动粘贴
      var manualTitle = f.manualTitle.value.trim();
      var manualContent = f.manualContent.value.trim();
      if (!manualTitle) { toast('请填写标题', 'error'); btn.disabled = false; btn.classList.remove('loading'); return; }
      if (!manualContent) { toast('请粘贴正文内容', 'error'); btn.disabled = false; btn.classList.remove('loading'); return; }
      promise = Promise.resolve({
        title: manualTitle,
        summary: stripMd(manualContent).slice(0, 120),
        content: manualContent,
        category: '',
        source: 'manual',
        sourceUrl: ''
      });
    }

    promise.then(function (data) {
      // 填入编辑器，让用户确认 / 补充分类与标签
      closeModal('wikiImportModal');
      // 新建编辑器并预填
      state.editingId = null;
      var ef = $('#wikiEditorForm').elements;
      ef.title.value = data.title;
      ef.aliases.value = '';
      ef.category.value = data.category || '';
      ef.tags.value = '';
      ef.summary.value = data.summary || '';
      ef.content.value = data.content || '';
      updateEditorPreview();
      $('#wikiEditorTitle').textContent = '导入预览（可编辑后保存）';
      openModal('wikiEditorModal');
      statusEl.className = 'wiki-import-status success';
      statusEl.textContent = '抓取成功，请在编辑器中确认后保存。';
      btn.disabled = false;
      btn.classList.remove('loading');
    }).catch(function (err) {
      console.warn('[Wiki] 导入失败:', err);
      statusEl.className = 'wiki-import-status error';
      var hint = '';
      if (source === 'baidu') hint = '（百度百科需经阅读器中转，可能被限流；可改用「手动粘贴」）';
      else if (source === 'zh' || source === 'en') hint = '（请确认词条名称拼写，或网络是否可访问维基百科）';
      statusEl.textContent = '抓取失败：' + err.message + hint;
      btn.disabled = false;
      btn.classList.remove('loading');
    });
  }

  // 切换导入源时显示/隐藏手动粘贴区
  function syncImportSourceUI() {
    var f = $('#wikiImportForm').elements;
    var source = f.source.value;
    var manualBox = $('#wikiManualBox');
    var titleBox = $('#wikiImportTitleBox');
    if (manualBox) manualBox.style.display = (source === 'manual') ? '' : 'none';
    if (titleBox) titleBox.style.display = (source === 'manual') ? 'none' : '';
  }

  function exportBackup() {
    try {
      var blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'bioquest-wiki-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出备份', 'success');
    } catch (e) {
      toast('导出失败：' + e.message, 'error');
    }
  }

  function bindEvents() {
    // 搜索（防抖）
    var search = $('#wikiSearch');
    if (search) {
      var onSearch = (typeof window.debounce === 'function' ? window.debounce : function (fn) { return fn; })(function () {
        state.filter.keyword = search.value;
        renderList();
      }, 200);
      search.addEventListener('input', onSearch);
    }

    // 分类 / 标签筛选（事件委托）
    document.body.addEventListener('click', function (ev) {
      var catChip = ev.target.closest('[data-cat]');
      if (catChip && $('#wikiCategoryFilters').contains(catChip)) {
        state.filter.category = catChip.dataset.cat;
        renderCategoryChips();
        renderList();
        return;
      }
      var tagChip = ev.target.closest('[data-tag]');
      if (tagChip && ($('#wikiTagFilters').contains(tagChip) || tagChip.closest('.wiki-card-tags') || tagChip.closest('.wiki-detail-content'))) {
        var tn = tagChip.dataset.tag;
        if (!tn) { // "全部"
          state.filter.tag = '';
        } else {
          state.filter.tag = (state.filter.tag === tn) ? '' : tn;
        }
        renderTagChips();
        renderList();
        if ($('#wikiTagFilters')) $('#wikiTagFilters').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // 词条卡片点击 → 详情
      var card = ev.target.closest('.wiki-card[data-id]');
      if (card && $('#wikiGrid').contains(card)) {
        openDetail(card.dataset.id);
        return;
      }
    });

    // 工具栏按钮
    var newBtn = $('#wikiNewBtn');
    if (newBtn) newBtn.addEventListener('click', function () { openEditor(null); });
    var importBtn = $('#wikiImportOpenBtn');
    if (importBtn) importBtn.addEventListener('click', function () {
      syncImportSourceUI();
      openModal('wikiImportModal');
    });
    var exportBtn = $('#wikiExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportBackup);

    // 模态框关闭
    $all('.wiki-modal-close, .wiki-modal-backdrop').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = el.closest('.wiki-modal');
        if (modal) closeModal(modal.id);
      });
    });
    // ESC 关闭最上层模态
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var opened = $all('.wiki-modal.show');
        if (opened.length) closeModal(opened[opened.length - 1].id);
      }
    });

    // 编辑器
    var editorForm = $('#wikiEditorForm');
    if (editorForm) {
      editorForm.addEventListener('submit', saveEditor);
      var contentTa = editorForm.elements['content'];
      if (contentTa) {
        var onPreview = (typeof window.debounce === 'function' ? window.debounce : function (fn) { return fn; })(updateEditorPreview, 250);
        contentTa.addEventListener('input', onPreview);
      }
      // 插入 Markdown 快捷按钮
      $all('[data-md-insert]').forEach(function (btn) {
        btn.addEventListener('click', function () { insertMdSnippet(btn.dataset.mdInsert); });
      });
    }
    var editorCancel = $('#wikiEditorCancel');
    if (editorCancel) editorCancel.addEventListener('click', function () { closeModal('wikiEditorModal'); });

    // 详情操作
    var detailEdit = $('#wikiDetailEdit');
    if (detailEdit) detailEdit.addEventListener('click', function () { openEditor(detailEdit.dataset.id); });
    var detailDelete = $('#wikiDetailDelete');
    if (detailDelete) detailDelete.addEventListener('click', function () { deleteEntry(detailDelete.dataset.id); });

    // 导入
    var importForm = $('#wikiImportForm');
    if (importForm) {
      importForm.addEventListener('submit', function (ev) { ev.preventDefault(); runImport(); });
      var sourceSel = importForm.elements['source'];
      if (sourceSel) sourceSel.addEventListener('change', syncImportSourceUI);
    }
    var importCancel = $('#wikiImportCancel');
    if (importCancel) importCancel.addEventListener('click', function () { closeModal('wikiImportModal'); });
  }

  function insertMdSnippet(kind) {
    var ta = $('#wikiEditorForm').elements['content'];
    if (!ta) return;
    var wrap = function (pre, post) {
      var s = ta.selectionStart, e = ta.selectionEnd;
      var sel = ta.value.slice(s, e);
      var val = ta.value.slice(0, s) + pre + sel + (post || pre) + ta.value.slice(e);
      ta.value = val;
      ta.focus();
      ta.selectionStart = s + pre.length;
      ta.selectionEnd = e + pre.length;
      updateEditorPreview();
    };
    var linePrefix = function (pfx) {
      var s = ta.selectionStart;
      var lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      ta.value = ta.value.slice(0, lineStart) + pfx + ta.value.slice(lineStart);
      ta.focus();
      updateEditorPreview();
    };
    if (kind === 'bold') wrap('**', '**');
    else if (kind === 'italic') wrap('*', '*');
    else if (kind === 'code') wrap('`', '`');
    else if (kind === 'h2') linePrefix('## ');
    else if (kind === 'h3') linePrefix('### ');
    else if (kind === 'link') wrap('[', '](https://)');
    else if (kind === 'list') linePrefix('- ');
    else if (kind === 'quote') linePrefix('> ');
  }

  /**
   * wiki.html?entry=<id> 直达词条（知识图谱/词云「读百科」跳转用）。
   * 种子是异步加载的，轮询等待条目就绪后打开详情（约 6 秒兜底放弃）。
   */
  function _openEntryFromUrl() {
    var m = /[?&]entry=([^&#]+)/.exec(window.location.search || '');
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (findEntry(id)) {
        clearInterval(timer);
        openDetail(id);
      } else if (tries > 20) {
        clearInterval(timer);
      }
    }, 300);
  }

  function init() {
    bindEvents();
    ensureSeed(); // ensureSeed 内部会触发 renderAll
    _openEntryFromUrl();
    // 暴露调试接口
    window.BioQuestWiki = {
      getEntries: function () { return state.entries; },
      reload: function () { state.entries = loadEntries(); renderAll(); },
      resetSeed: function () {
        localStorage.removeItem(SEED_FLAG_KEY);
        localStorage.removeItem(STORAGE_KEY);
        ensureSeed();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
