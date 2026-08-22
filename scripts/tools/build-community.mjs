import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const runtimeBuilder = path.join(root, 'scripts', 'tools', 'build-community-runtime.mjs');

const buildArgs = [runtimeBuilder];
if (args.has('--check')) buildArgs.push('--check');
const result = spawnSync(process.execPath, buildArgs, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log(`[build:community] ${args.has('--check') ? '社区独立运行包校验完成' : '社区独立运行包生成完成'}`);
