#!/usr/bin/env node
/**
 * RLS 策略静态审计脚本 (offline / zero-dependency)
 *
 * GitHub issue #100：为 CI 提供 RLS 策略审计步骤，无需真实数据库。
 *
 * 用法:
 *   node scripts/audit-rls.js                  # 审计 /workspace/sql 下全部 .sql
 *   AUDIT_SQL_DIR=/path/to/sql node scripts/audit-rls.js   # 自定义 sql 目录
 *
 * 逻辑 (启发式 / 静态正则，允许少量不完美)：
 *   1. 收集所有 `CREATE TABLE [IF NOT EXISTS] <name>`(忽略 CREATE TABLE ... AS 等非普通建表)。
 *   2. 收集 `ALTER TABLE <name> ENABLE / FORCE ROW LEVEL SECURITY` 已启用 RLS 的表。
 *   3. 收集 `CREATE POLICY ... ON <table>` 关联的表。
 *   判定：被创建的 public 表，若「未启用 RLS 且没有任何 POLICY」→ 判定为无 RLS 保护 → violations。
 *   内置豁免表 (无需 RLS 的辅助表)：migration_log。
 *
 * 容错：忽略大小写、public. 前缀、双引号、多行 CREATE TABLE([\s\S])。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 配置
const SQL_DIR = path.resolve(process.env.AUDIT_SQL_DIR || path.join(__dirname, '..', 'sql'));

// 已知无需 RLS 的辅助表(豁免，不判定为 violation)。
const EXEMPT_TABLES = new Set(['migration_log']);

// 正则(全部忽略大小写)
// CREATE TABLE [IF NOT EXISTS] name   —— name 支持 public. 前缀、双引号。
// [\s\S] 保证多行 CREATE TABLE 也能匹配；后面再排除 "CREATE TABLE ... AS"。
const CREATE_TABLE_RE =
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`]?)([A-Za-z_][A-Za-z0-9_.]*)\1/gi;

// ALTER TABLE name ENABLE / FORCE ROW LEVEL SECURITY
const ALTER_RLS_RE =
  /\bALTER\s+TABLE\s+(?:ONLY\s+)?(["`]?)([A-Za-z_][A-Za-z0-9_.]*)\1\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/gi;

// CREATE POLICY [IF NOT EXISTS] "name"|name ON table
// 策略名支持 双引号/单引号/裸名；表名支持 public. 前缀、双引号。
const CREATE_POLICY_RE =
  /\bCREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*)\s+ON\s+(["`]?)([A-Za-z_][A-Za-z0-9_.]*)\2/gi;

// 工具：规范化表名(去 public. 前缀 + 去包裹引号)
function normalizeTable(raw) {
  let name = String(raw || '').trim();
  // 去掉包裹用的双引号/反引号
  if (name.length >= 2) {
    const c0 = name[0];
    if ((c0 === '"' || c0 === '`') && name[name.length - 1] === c0) {
      name = name.slice(1, -1);
    }
  }
  // 去掉 public 模式前缀
  return name.toLowerCase().replace(/^public\./, '');
}

// CREATE TABLE ... AS(CTAS)/临时表 判断：匹配后紧跟 AS(或 TEMP/TEMPORARY) 视为非普通建表。
function isNonPlainCreateTable(text, match) {
  if (match === undefined || match === null) return false;
  const after = text.slice(match.index + match[0].length);
  // "CREATE TABLE ... AS" 或 ", " 分区/TABLE (未考虑) —— 仅处理 AS。
  return /^[\s,.;]*AS\b/i.test(after);
}

// 剥离 SQL 注释(`--` 行注释 + `/* ... */` 块注释)，避免注释文本里的
// "CREATE TABLE IF NOT EXISTS" 等字样被误判为真实语句(需保持换行以利多行匹配)。
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

// 主流程
function main() {
  const sqlFiles = fs.readdirSync(SQL_DIR).filter((f) => /\.sql$/i.test(f)).sort();
  if (sqlFiles.length === 0) {
    console.error(`[audit-rls] 未在 ${SQL_DIR} 找到任何 *.sql 文件`);
    process.exit(2);
  }

  // 已建表: name -> { name, rlsEnabled, policyCount, sqlFile, inExempt }
  const created = new Map();
  const rlsEnabled = new Set();
  const policyCount = new Map();

  for (const file of sqlFiles) {
    const abs = path.join(SQL_DIR, file);
    let rawText;
    try {
      rawText = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      console.error(`[audit-rls] 读取失败: ${abs} (${e.message})`);
      process.exit(2);
    }
    const rel = path.join('sql', file);
    const text = stripSqlComments(rawText);

    // 1) CREATE TABLE
    CREATE_TABLE_RE.lastIndex = 0;
    let m;
    while ((m = CREATE_TABLE_RE.exec(text)) !== null) {
      if (isNonPlainCreateTable(text, m)) continue; // 忽略 CREATE TABLE ... AS
      const name = normalizeTable(m[2]);
      if (!created.has(name)) {
        created.set(name, {
          name,
          rlsEnabled: false,
          policyCount: 0,
          sqlFile: rel,
        });
      } else if (!created.get(name).sqlFile) {
        created.get(name).sqlFile = rel;
      }
    }

    // 2) ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY
    ALTER_RLS_RE.lastIndex = 0;
    while ((m = ALTER_RLS_RE.exec(text)) !== null) {
      rlsEnabled.add(normalizeTable(m[2]));
    }

    // 3) CREATE POLICY ... ON table
    CREATE_POLICY_RE.lastIndex = 0;
    while ((m = CREATE_POLICY_RE.exec(text)) !== null) {
      const tableName = normalizeTable(m[3]);
      policyCount.set(tableName, (policyCount.get(tableName) || 0) + 1);
    }
  }

  // 组装 tables + violations
  const tables = [];
  const violations = [];
  for (const [name, t] of created) {
    t.rlsEnabled = rlsEnabled.has(name);
    t.policyCount = policyCount.get(name) || 0;
    tables.push({ name, rlsEnabled: t.rlsEnabled, policyCount: t.policyCount, sqlFile: t.sqlFile });

    // 仅有 POLICY 但未开启 RLS 时策略不会生效，不能算作已保护。
    if (!t.rlsEnabled && !EXEMPT_TABLES.has(name)) {
      violations.push(
        t.policyCount > 0
          ? `Table '${name}' (${t.sqlFile}): 有 ${t.policyCount} 条 POLICY 但未 ENABLE ROW LEVEL SECURITY，策略不会生效`
          : `Table '${name}' (${t.sqlFile}): 无 RLS 保护(未 ENABLE ROW LEVEL SECURITY，且无任何 POLICY)`
      );
    }
  }

  tables.sort((a, b) => a.name.localeCompare(b.name));

  const report = {
    files: sqlFiles.map((f) => path.join('sql', f)),
    tables,
    violations,
    ok: violations.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  process.exit(report.ok ? 0 : 1);
}

main();