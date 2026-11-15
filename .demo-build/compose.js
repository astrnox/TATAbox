const { spawn } = require('child_process');
const path = require('path');

const DIR = '/workspace/.demo-build/scenes';
const OUT = '/workspace/docs/contest/trae-app-awards-2026/演示视频.mp4';
const FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc';
const FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc';
const W = 1920, H = 1080, FPS = 30, FADE = 0.5;

const scenes = [
  { f: '01-home.jpg', d: 16, t: '打开即刷：每天一道竞赛题，无需注册' },
  { f: '01b-home-lower.jpg', d: 15, t: '3541 道真题底账 · 4 大模块 · 全真模拟' },
  { f: '02-answering.jpg', d: 14, t: '逐条判断，即时标记对错' },
  { f: '03-result.jpg', d: 16, t: '自动判分，错题自动收录' },
  { f: '04-practice.jpg', d: 16, t: '按模块、来源、难度做专项练习' },
  { f: '05-graph.jpg', d: 18, t: '知识图谱：一眼看清掌握分布' },
  { f: '06-cards.jpg', d: 14, t: '间隔重复记忆卡，把知识留到长期' },
  { f: '07-wrongbook.jpg', d: 15, t: '错题与复盘：AI 分析 + 同类题练习' },
  { f: '08-credit-board.jpg', d: 14, t: '信用排行榜：把学习投入变成可信声誉' },
  { f: '09-credit-center.jpg', d: 14, t: '信用中心：一份可验证的成长记录' },
  { f: '10-outro.jpg', d: 18, t: '' }
];

const inputs = [];
scenes.forEach(s => {
  inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.d), '-i', path.join(DIR, s.f));
});

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");

const parts = [];
scenes.forEach((s, i) => {
  const frames = s.d * FPS;
  const zoomIn = i % 2 === 0;
  const z = zoomIn
    ? `1.00+0.045*on/${frames}`
    : `1.045-0.045*on/${frames}`;
  const chain = [
    `[${i}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
    `crop=${W * 2}:${H * 2}`,
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`,
    'setsar=1',
    'format=yuv420p'
  ];
  if (s.t) {
    chain.push(
      `drawbox=x=0:y=ih-168:w=iw:h=168:color=0x0B1A12@0.80:t=fill`,
      `drawbox=x=96:y=ih-132:w=132:h=5:color=0xC4956A@0.95:t=fill`,
      `drawtext=fontfile='${FONT}':text='${esc(s.t)}':fontcolor=0xF7F4EC:fontsize=47:x=96:y=h-104:shadowcolor=0x000000@0.5:shadowx=2:shadowy=2`
    );
  } else {
    chain.push(
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x0B1A12@1.0:t=fill`,
      `drawtext=fontfile='${FONT_BOLD}':text='TATABOX':fontcolor=0xF7F4EC:fontsize=140:x=(w-text_w)/2:y=h/2-190`,
      `drawtext=fontfile='${FONT}':text='中国高中生物竞赛题库':fontcolor=0xEADFCF:fontsize=64:x=(w-text_w)/2:y=h/2-10`,
      `drawtext=fontfile='${FONT}':text='tatabox.cc.cd':fontcolor=0xC4956A:fontsize=56:x=(w-text_w)/2:y=h/2+90`,
      `drawtext=fontfile='${FONT}':text='3541 道真题 · 无需注册 · 可离线刷题':fontcolor=0xD9D2C4:fontsize=40:x=(w-text_w)/2:y=h/2+190`
    );
  }
  parts.push(chain.join(',') + `[v${i}]`);
});

let last = 'v0';
let offset = 0;
for (let i = 1; i < scenes.length; i++) {
  offset += scenes[i - 1].d - FADE;
  const outLabel = (i === scenes.length - 1) ? 'vx' : `x${i}`;
  parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${outLabel}]`);
  last = outLabel;
}

const total = scenes.reduce((a, s) => a + s.d, 0) - FADE * (scenes.length - 1);
parts.push(`[${last}]fade=t=in:st=0:d=0.8,fade=t=out:st=${(total - 1).toFixed(2)}:d=1[vout]`);

const filter = parts.join(';');
const args = [
  '-y', '-loglevel', 'warning',
  ...inputs,
  '-filter_complex', filter,
  '-map', '[vout]',
  '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-t', String(scenes.reduce((a, s) => a + s.d, 0) - FADE * (scenes.length - 1)),
  OUT
];

console.log('total ~', (scenes.reduce((a, s) => a + s.d, 0) - FADE * (scenes.length - 1)).toFixed(1) + 's');
const p = spawn('ffmpeg', args, { stdio: 'inherit' });
p.on('exit', c => process.exit(c));
