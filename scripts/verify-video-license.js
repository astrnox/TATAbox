#!/usr/bin/env node
'use strict';
/*
 * verify-video-license.js — 生物动画视频栏目版权准入 CI 硬门禁（方案 v2.0 P0-2）
 *
 * 纯静态审计脚本，零依赖，不联网。全部输入来自磁盘文件。
 *
 * 背景：data/videos.json 是仓库公开数据，任何人一个 PR 都可能塞进无授权视频。
 * 仅靠前端渲染层过滤（bio-video.js 兜底）形同虚设，因此把授权校验前置到 CI：
 * 任一违规 → 输出违规明细并 exit 1，阻断合并。
 *
 * 校验内容（对应方案 §1.4「入库必填五要素」与 §1.3 C7）：
 *   1. data/videos.json 存在、可解析、videos 为数组（空数组允许：栏目进入空态）
 *   2. 每条五要素齐全：license / source / attribution / poster / steps
 *      （steps 必须为非空字符串数组，充当无字幕时的内容替代 —— P2-2）
 *   3. license 必须落在白名单枚举内（方案 §1.4 允许的四类授权）
 *   4. source 必须是 http(s) URL（授权证据页可点击复核）
 *   5. file/poster 实体文件存在、路径限定 videos/ 目录内（防路径穿越）
 *   6. 体积红线：mp4 单文件 ≤15MB（阶段 -1 结论：GitHub Pages 100MB 硬限，
 *      默认参考值 15MB）；poster ≤80KB（方案 §4.3 P3/P4）
 *   7. id 唯一；若提供 sizeBytes 字段则必须与实体字节数一致（台账诚实性）
 *
 * 输出：JSON  { manifest, entries:[{id,license,bytes,posterBytes,ok}], violations:[] }
 *   ok=true/false；存在 violation 时 exit 1。
 *
 * 用法：node scripts/verify-video-license.js
 * 负向自验（方案 §2 阶段 0 第 5 步）：临时删掉一条 license → 必须 exit 1，验完还原。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'data', 'videos.json');

// 授权白名单枚举（方案 §1.4 允许项）：
//   ① 公有领域  ② CC BY / CC BY-SA（须署名展示）  ③ 免署名免费授权  ④（教育机构逐条核对，
//     涉及新协议时必须扩充本枚举并在 PR 中附 license 页证据，禁止用模糊字符串绕过）
//   CC BY 3.0 于 2026-10-17 按 ④ 流程扩充（HHMI BioInteractive / Sprouts / NIG 等
//   Commons 教育动画授权页均为 CC BY 3.0，每条 source 指向对应文件页可复核）
const LICENSE_WHITELIST = new Set([
  'Public Domain',
  'CC0 1.0',
  'CC BY 2.0',
  'CC BY 2.5',
  'CC BY 3.0',
  'CC BY 4.0',
  'CC BY-SA 3.0',
  'CC BY-SA 4.0',
  'Mixkit License',
  'Pexels License',
  'Pixabay Content License',
]);

// 体积红线（阶段 -1 结论：GitHub Pages 单文件 100MB 硬限；默认参考值 15MB / 80KB）
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const MAX_POSTER_BYTES = 80 * 1024;

const VIDEO_EXT = /\.mp4$/i;
const POSTER_EXT = /\.(jpe?g|png|webp)$/i;

function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

/** 限定在 videos/ 目录内的相对路径（返回 null 表示非法） */
function safeAssetPath(rel) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const norm = rel.replace(/\\/g, '/');
  if (!norm.startsWith('videos/')) return null;
  if (norm.includes('..')) return null;
  const abs = path.resolve(ROOT, norm);
  if (!abs.startsWith(path.join(ROOT, 'videos') + path.sep)) return null;
  return abs;
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function run() {
  const violations = [];
  const entries = [];

  if (!fs.existsSync(MANIFEST)) {
    violations.push('清单缺失：data/videos.json 不存在');
    console.log(JSON.stringify({ manifest: null, entries, violations }, null, 2));
    console.log('\nok=false  violations=' + violations.length);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    violations.push('清单解析失败：data/videos.json 不是合法 JSON — ' + e.message);
    console.log(JSON.stringify({ manifest: null, entries, violations }, null, 2));
    console.log('\nok=false  violations=' + violations.length);
    process.exit(1);
  }

  const videos = manifest && manifest.videos;
  if (!Array.isArray(videos)) {
    violations.push('结构错误：videos 字段必须是数组');
  } else {
    const seenIds = new Set();
    videos.forEach((v, i) => {
      const where = '第 ' + (i + 1) + ' 条' + (v && v.id ? '（' + v.id + '）' : '');
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        violations.push(where + '：条目必须是对象');
        return;
      }

      // id / title：展示与去重所需
      if (!nonEmptyString(v.id)) violations.push(where + '：缺少 id');
      else if (seenIds.has(v.id)) violations.push(where + '：id 重复（' + v.id + '）');
      else seenIds.add(v.id);
      if (!nonEmptyString(v.title)) violations.push(where + '：缺少 title');

      // —— 五要素（§1.4）——
      if (!nonEmptyString(v.license)) {
        violations.push(where + '：缺少 license（版权准入五要素之一，P0-2）');
      } else if (!LICENSE_WHITELIST.has(v.license.trim())) {
        violations.push(
          where + '：license 不在白名单枚举内："' + v.license + '"，允许值：' +
          [...LICENSE_WHITELIST].join(' | ')
        );
      }
      if (!nonEmptyString(v.source)) {
        violations.push(where + '：缺少 source（授权证据页 URL）');
      } else if (!isHttpUrl(v.source)) {
        violations.push(where + '：source 必须是 http(s) 授权证据页 URL：' + v.source);
      }
      if (!nonEmptyString(v.attribution)) {
        violations.push(where + '：缺少 attribution（署名文本，CC 条目必须展示）');
      }
      if (!nonEmptyString(v.poster)) {
        violations.push(where + '：缺少 poster');
      }
      if (!Array.isArray(v.steps) || v.steps.length === 0 || !v.steps.every(nonEmptyString)) {
        violations.push(where + '：steps 必须是非空字符串数组（无字幕时的内容替代，P2-2）');
      }

      // —— 实体文件存在性与体积 ——
      let bytes = null;
      if (nonEmptyString(v.file)) {
        if (!VIDEO_EXT.test(v.file)) {
          violations.push(where + '：file 必须是 .mp4：' + v.file);
        }
        const abs = safeAssetPath(v.file);
        if (!abs) {
          violations.push(where + '：file 路径非法（必须位于 videos/ 目录内）：' + v.file);
        } else if (!fs.existsSync(abs)) {
          violations.push(where + '：视频实体不存在：' + v.file);
        } else {
          bytes = fs.statSync(abs).size;
          if (bytes > MAX_VIDEO_BYTES) {
            violations.push(
              where + '：视频超限 ' + (bytes / 1024 / 1024).toFixed(2) + 'MB > 15MB（P3）'
            );
          }
          if (typeof v.sizeBytes === 'number' && v.sizeBytes !== bytes) {
            violations.push(
              where + '：sizeBytes 台账与实体不一致（' + v.sizeBytes + ' ≠ ' + bytes + '）'
            );
          }
        }
      } else {
        violations.push(where + '：缺少 file');
      }

      let posterBytes = null;
      if (nonEmptyString(v.poster)) {
        if (!POSTER_EXT.test(v.poster)) {
          violations.push(where + '：poster 必须是图片：' + v.poster);
        }
        const abs = safeAssetPath(v.poster);
        if (!abs) {
          violations.push(where + '：poster 路径非法（必须位于 videos/ 目录内）：' + v.poster);
        } else if (!fs.existsSync(abs)) {
          violations.push(where + '：poster 实体不存在：' + v.poster);
        } else {
          posterBytes = fs.statSync(abs).size;
          if (posterBytes > MAX_POSTER_BYTES) {
            violations.push(
              where + '：poster 超限 ' + (posterBytes / 1024).toFixed(1) + 'KB > 80KB（P4）'
            );
          }
        }
      }

      entries.push({
        id: nonEmptyString(v.id) ? v.id : '#' + (i + 1),
        license: nonEmptyString(v.license) ? v.license : null,
        bytes,
        posterBytes,
      });
    });
  }

  const ok = violations.length === 0;
  console.log(
    JSON.stringify(
      {
        manifest: 'data/videos.json',
        counts: { videos: Array.isArray(videos) ? videos.length : 0, whitelistedLicenses: LICENSE_WHITELIST.size },
        entries,
        violations,
      },
      null,
      2
    )
  );
  console.log(
    '\nok=' + ok +
    '  videos=' + (Array.isArray(videos) ? videos.length : 0) +
    '  violations=' + violations.length +
    '  maxVideo=' + MAX_VIDEO_BYTES + 'B  maxPoster=' + MAX_POSTER_BYTES + 'B'
  );
  process.exitCode = ok ? 0 : 1;
}

run();
