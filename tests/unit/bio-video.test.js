/**
 * TATABOX — 生物动画视频栏目（js/pages/bio-video.js）单元测试
 * 方案 v2.0 阶段 1.5（P1-5：新模块必须有自动化保护，不能只靠手测）
 *
 * 覆盖：
 *   1. `_loadVideos` 对缺 license（或其他授权要素）条目的过滤——
 *      前端版权兜底防线（P0-2 第 2 道）的行为；
 *   2. 清单 JSON 解析失败 / fetch 失败 → 回落空数组且不抛异常（空态而非崩溃）；
 *   3. 署名行渲染：CC 条目实际输出 attribution 文本与来源链接（附录 B 第 5 条），
 *      且经 esc() 转义（P0-4：模块内自建本地 esc，不依赖不存在的 window.esc）。
 *
 * 加载方式：testEnvironment 为 node（无 DOM），读源码后 eval 到手工提供的
 * window/fetch 假全局上，取模块挂载的 window.__bioVideo 测试钩子。
 */

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'pages', 'bio-video.js'),
  'utf8'
);

let BV = null;

beforeAll(() => {
  global.window = {};
  (0, eval)(SRC); // 模块 IIFE：挂载 init/render 与测试钩子
  BV = global.window.__bioVideo;
  expect(BV).toBeDefined();
});

afterAll(() => {
  delete global.window;
  delete global.fetch;
});

afterEach(() => {
  BV._state.list = [];
  BV._state.currentId = null;
  if (global.fetch && global.fetch.mockClear) global.fetch.mockClear();
});

/** 构造一条五要素齐全的合格条目 */
function makeVideo(overrides) {
  return Object.assign(
    {
      id: 'demo',
      title: '示例视频',
      file: 'videos/demo.mp4',
      poster: 'videos/demo.jpg',
      license: 'CC BY 2.5',
      source: 'https://commons.wikimedia.org/wiki/File:Demo.webm',
      attribution: 'Author Name《Demo》（Wikimedia Commons，CC BY 2.5）',
      steps: ['步骤一', '步骤二'],
      sizeBytes: 1048576,
      durationSec: 10
    },
    overrides || {}
  );
}

function mockFetchJson(payloadOrThrow, ok) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: ok === undefined ? true : ok,
    json: async () => {
      if (payloadOrThrow instanceof Error) throw payloadOrThrow;
      return payloadOrThrow;
    }
  });
}

describe('1. 版权兜底过滤（缺授权要素的条目不进列表）', () => {
  test('缺 license 的条目被过滤，合格条目保留', async () => {
    mockFetchJson({
      videos: [
        makeVideo({ id: 'ok' }),
        makeVideo({ id: 'no-license', license: undefined }),
        makeVideo({ id: 'no-file', file: '' })
      ]
    });
    const list = await BV.loadVideos();
    expect(list.map((v) => v.id)).toEqual(['ok']);
  });

  test('缺 source / poster / attribution 的条目同样被过滤', async () => {
    mockFetchJson({
      videos: [
        makeVideo({ id: 'a', source: undefined }),
        makeVideo({ id: 'b', poster: null }),
        makeVideo({ id: 'c', attribution: '' }),
        makeVideo({ id: 'keep' })
      ]
    });
    const list = await BV.loadVideos();
    expect(list.map((v) => v.id)).toEqual(['keep']);
  });

  test('eligible 判定函数与过滤口径一致（P0-2 五要素核心四件）', () => {
    expect(BV.eligible(makeVideo())).toBe(true);
    expect(BV.eligible(makeVideo({ license: undefined }))).toBe(false);
    expect(BV.eligible(makeVideo({ file: undefined }))).toBe(false);
    expect(BV.eligible(makeVideo({ poster: undefined }))).toBe(false);
    expect(BV.eligible(makeVideo({ source: undefined }))).toBe(false);
    expect(BV.eligible(null)).toBe(false);
  });
});

describe('2. 清单异常时回落空数组且不抛异常', () => {
  test('JSON 解析失败 → 空数组', async () => {
    mockFetchJson(new Error('Unexpected token < in JSON'));
    await expect(BV.loadVideos()).resolves.toEqual([]);
    expect(BV._state.list).toEqual([]);
  });

  test('fetch 网络失败 → 空数组', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(BV.loadVideos()).resolves.toEqual([]);
  });

  test('HTTP 非 2xx → 空数组', async () => {
    mockFetchJson({}, false);
    await expect(BV.loadVideos()).resolves.toEqual([]);
  });

  test('videos 字段不是数组 / 缺失 → 空数组', async () => {
    mockFetchJson({ videos: { not: 'array' } });
    await expect(BV.loadVideos()).resolves.toEqual([]);
  });

  test('空清单 → 列表渲染「视频整理中，敬请期待」空态', () => {
    const html = BV.listHTML([]);
    expect(html).toContain('视频整理中，敬请期待');
  });
});

describe('3. 署名行渲染（CC 条目必须实际展示 attribution）', () => {
  test('playerHTML 输出 attribution 文本、license 与来源链接', () => {
    const v = makeVideo();
    const html = BV.playerHTML(v);
    expect(html).toContain(v.attribution);
    expect(html).toContain('授权：CC BY 2.5');
    expect(html).toContain(v.source);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  test('playerHTML 的动态文本经 esc() 转义（P0-4）', () => {
    const v = makeVideo({
      title: '<img src=x onerror=alert(1)>',
      attribution: "A<B> & 'C'"
    });
    const html = BV.playerHTML(v);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A&lt;B&gt; &amp; &#39;C&#39;');
  });

  test('listHTML 卡片输出 license chip 与 poster 封面', () => {
    const html = BV.listHTML([makeVideo()]);
    expect(html).toContain('bv-chip');
    expect(html).toContain('CC BY 2.5');
    expect(html).toContain('videos/demo.jpg');
    expect(html).toContain('data-video-id="demo"');
  });

  test('标签分类行：卡片与播放页均渲染 tags（bv-tag 芯片）', () => {
    const v = makeVideo({ tags: ['拟真', '动画'] });
    const card = BV.listHTML([v]);
    expect(card).toContain('bv-tags');
    expect(card).toContain('<span class="bv-tag">拟真</span>');
    expect(card).toContain('<span class="bv-tag">动画</span>');
    const player = BV.playerHTML(v);
    expect(player).toContain('<span class="bv-tag">拟真</span>');
  });

  test('标签经 esc() 转义，非字符串/空标签被丢弃', () => {
    const v = makeVideo({ tags: ['<b>x</b>', '', '  ', null, '实拍'] });
    const html = BV.listHTML([v]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('<span class="bv-tag">实拍</span>');
    expect(html).not.toContain('bv-tag"> </span>');
  });

  test('无 tags 字段不输出标签行（向后兼容旧清单）', () => {
    const html = BV.listHTML([makeVideo()]);
    expect(html).not.toContain('bv-tags');
  });

  test('流量提示与文字版步骤（P2-1/P2-2）渲染', () => {
    const html = BV.playerHTML(makeVideo());
    expect(html).toContain('Wi-Fi');
    expect(html).toContain('约 1.0 MB');
    expect(html).toContain('内容步骤（文字版）');
    expect(html).toContain('<li>步骤一</li>');
  });

  test('playsinline / preload=metadata 属性强制存在（C9/P2-1）', () => {
    const html = BV.playerHTML(makeVideo());
    expect(html).toContain('playsinline');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('poster="videos/demo.jpg"');
  });

  test('formatSize / formatDuration 展示口径', () => {
    expect(BV.formatSize(194067)).toBe('190 KB');
    expect(BV.formatSize(15 * 1024 * 1024)).toBe('15.0 MB');
    expect(BV.formatSize(undefined)).toBe('');
    expect(BV.formatDuration(10)).toBe('0:10');
    expect(BV.formatDuration(61)).toBe('1:01');
    expect(BV.formatDuration(undefined)).toBe('');
  });
});
