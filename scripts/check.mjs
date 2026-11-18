import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(directory + '/' + item.name) : [directory + '/' + item.name]);
}
const files = ['src', 'web', 'scripts', 'test'].filter(existsSync).flatMap(walk).filter(file => /\.(js|mjs)$/.test(file));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(file + '\n' + result.stderr);
  if (file.startsWith('src/') && !file.startsWith('src/web-dist/')) {
    const text = readFileSync(file, 'utf8');
    if (/\b(fetch|setTimeout|setInterval|localStorage|document|window)\s*\(/.test(text)) throw new Error('原生脚本误用浏览器接口：' + file);
    if (!file.endsWith('/main.js') && /JSB\.require\s*\(/.test(text)) throw new Error('模块重复导入：' + file);
  }
}
console.log('JavaScript 语法及运行环境检查通过：' + files.length + ' 个文件');
