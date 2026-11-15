const { spawn, execSync } = require('child_process');
const fs = require('fs');

const A = process.env.A_FILE;
const B = process.env.B_FILE;
const OUT = '/workspace/docs/contest/trae-app-awards-2026/演示视频.mp4';
const FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc';
const FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc';
const FPS = 30, FADE = 0.6;

const dur = (f) => parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${f}"`).toString());
const evA = JSON.parse(fs.readFileSync('/workspace/.demo-build/events-A.json', 'utf8'));
const evB = JSON.parse(fs.readFileSync('/workspace/.demo-build/events-B.json', 'utf8'));

const A_SS = +(evA.offset + evA.ev.menu - 3.4).toFixed(2);
const B_SS = +(evB.offset + 1.0).toFixed(2);
const A_DUR = +(dur(A) - A_SS).toFixed(2);
const B_DUR = +(dur(B) - B_SS).toFixed(2);
const END_DUR = 9.0;
const B_START = +(A_DUR - FADE).toFixed(2);
const END_START = +(A_DUR + B_DUR - 2 * FADE).toFixed(2);
const TOTAL = +(A_DUR + B_DUR + END_DUR - 2 * FADE).toFixed(2);

const m = (k) => +(evA.offset + evA.ev[k] - A_SS).toFixed(2);

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");

const caps = [
  [0.3, m('menu') + 0.8, '打开菜单，进入「专项练习」'],
  [m('menu') + 1.0, 6.6, '按数据源筛选：CNBO 联赛真题 2873 道'],
  [6.8, m('start') - 0.1, '选竞赛模式，题库按模块与专题组织'],
  [m('start') + 0.1, m('submit0') + 0.4, '第 1 题：单选题，选出正确选项'],
  [m('submit0') + 0.8, m('next0') - 0.3, '提交即判分，并逐选项给出解析'],
  [m('next0') + 0.4, m('submit1') - 0.2, '第 2 题：四陈述判断题，逐条判断'],
  [m('submit1') + 0.8, m('next1') - 0.3, '每条单独判对错，并标出标准答案'],
  [m('next1') + 0.4, m('submit2') - 0.2, '第 3 题继续作答，累计得分实时更新'],
  [m('submit2') + 0.8, m('next2') - 0.3, '四陈述全部判完，直接汇总本题得分'],
  [m('next2') + 0.4, m('submit3') - 0.2, '第 4 题：正确率与已答题数同步统计'],
  [m('submit3') + 0.7, m('next3') - 2.7, '答完立刻给出得分与逐项解析'],
  [m('next3') - 2.4, m('back') - 0.3, '一轮 20 题，就这样一题题刷下去'],
  [m('back') + 0.7, +(B_START - 0.4).toFixed(2), '按 Esc 回到列表，换模块或难度继续'],
  [+(B_START + 1.0).toFixed(2), +(B_START + 13.5).toFixed(2), '知识图谱：按模块看掌握分布与薄弱点'],
  [+(B_START + 13.5).toFixed(2), +(END_START - 0.2).toFixed(2), '信用排行榜与信用中心：贡献可累积、可查证']
];

const capChain = caps.map(([s, e, t]) =>
  `drawtext=fontfile='${FONT}':text='${esc(t)}':fontcolor=0xF7F4EC:fontsize=42:x=72:y=h-100:` +
  `box=1:boxcolor=0x0B1A12@0.78:boxborderw=22:enable='between(t,${s},${e})'`
).join(',');

const norm = (i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`;

const endChain = [
  norm(2),
  `drawtext=fontfile='${FONT_BOLD}':text='TATABOX':fontcolor=0xF7F4EC:fontsize=140:x=(w-text_w)/2:y=h/2-190`,
  `drawtext=fontfile='${FONT}':text='中国高中生物竞赛题库':fontcolor=0xEADFCF:fontsize=62:x=(w-text_w)/2:y=h/2-14`,
  `drawtext=fontfile='${FONT}':text='tatabox.cc.cd':fontcolor=0xC4956A:fontsize=54:x=(w-text_w)/2:y=h/2+86`,
  `drawtext=fontfile='${FONT}':text='3541 道真题 · 无需注册 · 可离线刷题':fontcolor=0xD9D2C4:fontsize=38:x=(w-text_w)/2:y=h/2+186`
].join(',');

const filter = [
  norm(0) + '[a]',
  norm(1) + '[b]',
  endChain + '[e]',
  `[a][b]xfade=transition=fade:duration=${FADE}:offset=${(A_DUR - FADE).toFixed(2)}[ab]`,
  `[ab][e]xfade=transition=fade:duration=${FADE}:offset=${(A_DUR + B_DUR - 2 * FADE).toFixed(2)}[abx]`,
  `[abx]${capChain},fade=t=in:st=0:d=0.7,fade=t=out:st=${(TOTAL - 1).toFixed(2)}:d=1[vout]`
].join(';');

const args = [
  '-y', '-loglevel', 'warning',
  '-ss', String(A_SS), '-t', String(A_DUR), '-i', A,
  '-ss', String(B_SS), '-t', String(B_DUR), '-i', B,
  '-f', 'lavfi', '-t', String(END_DUR), '-i', 'color=c=0x0B1A12:s=1920x1080:r=30',
  '-filter_complex', filter,
  '-map', '[vout]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-t', String(TOTAL), OUT
];

console.log('A_SS', A_SS, 'A', A_DUR, 'B_SS', B_SS, 'B', B_DUR, 'total', TOTAL);
console.log(caps.map(c => c.map(v => v).join(' | ')).join('\n'));
const p = spawn('ffmpeg', args, { stdio: 'inherit' });
p.on('exit', c => process.exit(c));
