/**
 * 校验 SQL 迁移体系的顺序、幂等记录与策略语义（M-04）。
 *
 * 失败场景：
 *   1) 迁移文件名版本重复或无法解析；
 *   2) v16 及以后的迁移忘记调用 migration_record（新库无法从 migration_log 还原版本）；
 *   3) CREATE POLICY 中误用触发器语境的 NEW.*（Postgres 会报错，被 DO 块 EXCEPTION
 *      静默吞掉后策略实际不存在——v6 的历史缺陷）；
 *   4) README 未把 schema.sql 作为建库真源、或未覆盖最新迁移。
 *
 * 用法：node scripts/verify-migrations.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'sql');
const TRACKER_SINCE = 16; // v16 起统一记录；v2-v15 为历史迁移，仅提示

const errors = [];
const warnings = [];

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'));
const migrations = [];

for (const file of files) {
  const m = /^migration_v(\d+)(?:_|\.|$)/i.exec(file);
  if (!m) continue;
  migrations.push({ file, version: Number(m[1]) });
}

const byVersion = new Map();
for (const item of migrations) {
  if (byVersion.has(item.version)) {
    // v2-v15 为历史迁移，v6 存在 class_memberships / security_hardening 两个并行补丁，
    // 未接入 migration_log，不构成版本追踪冲突；v16+ 必须一号一文件。
    const msg = `迁移版本重复：migration_v${item.version}（${byVersion.get(item.version)} / ${item.file}）`;
    if (item.version >= TRACKER_SINCE) errors.push(msg);
    else warnings.push(msg + '（历史并行补丁，按文件名顺序执行）');
  } else {
    byVersion.set(item.version, item.file);
  }
}

migrations.sort((a, b) => a.version - b.version);

for (const item of migrations) {
  const raw = fs.readFileSync(path.join(SQL_DIR, item.file), 'utf8');
  const sql = stripComments(raw);

  if (item.version >= TRACKER_SINCE) {
    const record = /migration_record\s*\(\s*'migration_v(\d+)'/i.exec(sql);
    if (!record) {
      errors.push(`${item.file} 未调用 migration_record('migration_v${item.version}', ...)，新库无法追踪版本`);
    } else if (Number(record[1]) !== item.version) {
      errors.push(`${item.file} 记录的版本 migration_v${record[1]} 与文件名 v${item.version} 不一致`);
    }
  } else if (!/migration_record\s*\(/i.test(sql)) {
    warnings.push(`${item.file} 为 v${item.version} 历史迁移，未接入 migration_log（仅影响版本追踪）`);
  }

  const policyRe = /CREATE\s+POLICY[\s\S]*?;/gi;
  let match;
  while ((match = policyRe.exec(sql)) !== null) {
    if (/\bNEW\./i.test(match[0])) {
      errors.push(`${item.file} 的 CREATE POLICY 使用了 NEW.*（策略表达式不支持触发器变量）`);
    }
  }
}

// tracker 必须先于所有 v16+ 迁移执行，且提供幂等记录函数
const trackerPath = path.join(SQL_DIR, 'migration_tracker.sql');
if (!fs.existsSync(trackerPath)) {
  errors.push('缺少 sql/migration_tracker.sql（migration_log 与 migration_record 的唯一来源）');
} else {
  const tracker = fs.readFileSync(trackerPath, 'utf8');
  if (!/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+migration_log/i.test(tracker)) {
    errors.push('sql/migration_tracker.sql 未幂等创建 migration_log');
  }
  if (!/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.migration_record/i.test(tracker)) {
    errors.push('sql/migration_tracker.sql 未定义 public.migration_record');
  }
}

if (!fs.existsSync(path.join(SQL_DIR, 'schema.sql'))) {
  errors.push('缺少 sql/schema.sql（新建数据库的唯一基线 schema）');
}

// README 必须把 schema.sql 作为建库真源，并覆盖最新迁移
const latest = migrations.length ? migrations[migrations.length - 1].version : 0;
for (const readme of ['README.md', 'README-en.md']) {
  const p = path.join(ROOT, readme);
  if (!fs.existsSync(p)) {
    errors.push(`缺少 ${readme}`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  if (!/schema\.sql/.test(text)) {
    errors.push(`${readme} 未说明先执行 sql/schema.sql（否则新库可能缺基线表）`);
  }
  if (!new RegExp(`migration_v${latest}`).test(text)) {
    errors.push(`${readme} 未覆盖最新迁移 migration_v${latest}`);
  }
}

if (warnings.length) {
  console.warn('[verify-migrations] 提示：');
  warnings.forEach((w) => console.warn('  - ' + w));
}

if (errors.length) {
  console.error('[verify-migrations] 失败：');
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

console.log(`[verify-migrations] 通过：${migrations.length} 个迁移，最新 v${latest}，策略语义与版本追踪一致`);
