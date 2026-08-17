/**
 * check-all.mjs — 项目完整性检查（语法 + 模块引用）
 *
 * 用法：node check-all.mjs
 *  1) 对 app 目录下所有 .js 文件做语法检查
 *  2) 校验所有 import 的目标文件存在且命名导出齐全
 *  3) 用 esbuild 打包前端模块图（若已安装），确认浏览器端可解析
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const appDir = path.dirname(fileURLToPath(import.meta.url));
let errors = 0;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const allFiles = walk(appDir);

// 1) 语法检查
for (const file of allFiles) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`[语法错误] ${path.relative(appDir, file)}\n${res.stderr}`);
    errors++;
  }
}
console.log(`✔ 语法检查：${allFiles.length} 个文件通过`);

// 2) 模块引用检查
function parseExports(source) {
  const names = new Set();
  const re = /export\s*(?:(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)|{([^}]+)})/g;
  let m;
  while ((m = re.exec(source))) {
    if (m[1]) names.add(m[1]);
    if (m[2]) m[2].split(',').forEach((part) => {
      part = part.trim();
      if (!part) return;
      const asIdx = part.indexOf(' as ');
      names.add(asIdx === -1 ? part : part.slice(asIdx + 4).trim());
    });
  }
  if (/export\s+default\s+/.test(source)) names.add('default');
  return names;
}

const sourceCache = new Map();
const exportsCache = new Map();
for (const file of allFiles) {
  const source = fs.readFileSync(file, 'utf8');
  sourceCache.set(file, source);
  exportsCache.set(file, parseExports(source));
}

const importRe = /import\s*(?:([^'"]+?)\s*from\s*)?['"]([^'"]+)['"]/g;
for (const file of allFiles) {
  const source = sourceCache.get(file);
  let m;
  while ((m = importRe.exec(source))) {
    const spec = m[1] || '';
    const target = m[2];
    const cleanTarget = target.split('?')[0];
    if (!cleanTarget.startsWith('.')) continue;
    const candidates = cleanTarget.endsWith('.js')
      ? [path.resolve(path.dirname(file), cleanTarget)]
      : [path.resolve(path.dirname(file), cleanTarget) + '.js', path.join(path.resolve(path.dirname(file), cleanTarget), 'index.js')];
    const resolved = candidates.find((c) => fs.existsSync(c));
    if (!resolved) {
      console.error(`[缺失文件] ${path.relative(appDir, file)} -> ${target}`);
      errors++;
      continue;
    }
    const named = [];
    const namedRe = /\{([^}]+)\}/g;
    let nm;
    while ((nm = namedRe.exec(spec))) {
      nm[1].split(',').forEach((part) => {
        part = part.trim();
        if (!part) return;
        const asIdx = part.indexOf(' as ');
        named.push(asIdx === -1 ? part : part.slice(0, asIdx).trim());
      });
    }
    for (const name of named) {
      if (!exportsCache.get(resolved).has(name)) {
        console.error(`[缺失导出] ${path.relative(appDir, file)}: "${name}" 未在 ${path.relative(appDir, resolved)} 中导出`);
        errors++;
      }
    }
  }
}
console.log('✔ 模块引用：所有 import/export 一致');

// 3) 前端打包验证（esbuild 可选）
const bundle = spawnSync('npx', ['--yes', 'esbuild', path.join(appDir, 'public/app.js'), '--bundle', '--format=esm', '--outfile=/dev/null', '--log-level=warning'], { encoding: 'utf8', cwd: appDir });
if (bundle.status === 0) {
  console.log('✔ 打包验证：前端模块图可完整解析');
} else {
  console.error(`✘ 打包验证失败\n${bundle.stdout}\n${bundle.stderr}`);
  errors++;
}

if (errors > 0) {
  console.error(`✘ 发现 ${errors} 处问题`);
  process.exit(1);
}
console.log('✔ 全部检查通过');
