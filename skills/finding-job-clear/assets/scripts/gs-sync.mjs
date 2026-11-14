#!/usr/bin/env node
// Apps Script without copy-paste: pushes every apps-script/*.gs file to the "Job Feed" project in one command, and
// moves the web app (the site's data API) to the new code. Uses Google's own CLI, clasp (pinned version, run by npx).
//
//   node scripts/gs-sync.mjs setup <SCRIPT_ID>      once: links this folder to the project, keeps its settings file
//   node scripts/gs-sync.mjs push                    tests → push all files → update the web app deployment
//   node scripts/gs-sync.mjs status                  what is linked, the deployments, the code version
//
// Before the first run (one time, by the owner, never by an assistant):
//   1. https://script.google.com/home/usersettings → "Google Apps Script API" → On
//   2. npx @google/clasp@3.4.1 login   (a browser window: sign in with the same Google account as the Sheet)
// The login is stored by clasp in your user folder (~/.clasprc.json). It is a credential: never open it, never commit it.
// Full guide: tracker/skills/finding-job-clear/references/updating.md (in the template) or references/apps-script-setup.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GS = path.join(ROOT, 'apps-script');
const CLASP = ['--yes', '@google/clasp@3.4.1'];
const CONF = path.join(GS, '.clasp.json');          // which project (git-ignored)
const DEPLOY = path.join(GS, '.clasp-deploy.json'); // which web app deployment to move (git-ignored)
const MANIFEST = path.join(GS, 'appsscript.json');  // the project's settings (services, time zone, web app)
// the order the files load in Apps Script (the same order as in the editor; nothing depends on it today, but it is safe)
const ORDER = ['Code', 'Api', 'Shared', 'Watchdog', 'Leads', 'Prep', 'Visitors', 'Telegram', 'Lifecycle', 'Push'];

const say = (s) => console.log(s);
const fail = (s) => { console.error('✗ ' + s); process.exit(1); };
function run(cmd, args, opts = {}) {
  // node runs directly (paths with spaces stay whole); npx needs the shell on Windows (npx.cmd), and its args have no spaces
  const exe = cmd === 'node' ? process.execPath : cmd;
  const r = spawnSync(exe, args, { cwd: opts.cwd || GS, encoding: 'utf8', shell: cmd !== 'node' && process.platform === 'win32', stdio: opts.quiet ? 'pipe' : 'inherit' });
  if (r.status !== 0 && !opts.okToFail) fail(`${cmd} ${args.join(' ')} failed${r.stderr ? ': ' + r.stderr.trim().slice(0, 400) : ''}`);
  return r;
}
const clasp = (args, opts) => run('npx', [...CLASP, ...args], opts);
const files = () => fs.readdirSync(GS).filter((f) => f.endsWith('.gs'));
const version = () => (fs.readFileSync(path.join(GS, 'Shared.gs'), 'utf8').match(/CODE_VERSION\s*=\s*'([^']+)'/) || [])[1] || '?';
// on Windows npx runs through the shell, so every value that reaches a command line is checked to be plain first
const SAFE_VERSION = /^[\w.-]+$/, SAFE_DEPLOYMENT = /^[\w-]+$/;

function writeConf(scriptId) {
  const order = ORDER.map((n) => n + '.gs').filter((f) => fs.existsSync(path.join(GS, f)));
  const rest = files().filter((f) => !order.includes(f)).sort();
  fs.writeFileSync(CONF, JSON.stringify({ scriptId, rootDir: '.', filePushOrder: [...order, ...rest] }, null, 2) + '\n');
  fs.writeFileSync(path.join(GS, '.claspignore'), ['**/**', '!*.gs', '!appsscript.json', ''].join('\n'));
}

// the project's own settings (Tasks service, time zone, web app access) come from the live project, never made up here
function pullManifest(scriptId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-sync-'));
  try {
    fs.writeFileSync(path.join(tmp, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }));
    clasp(['pull'], { cwd: tmp });
    const m = path.join(tmp, 'appsscript.json');
    if (!fs.existsSync(m)) fail('the project has no appsscript.json (pull returned nothing)');
    fs.copyFileSync(m, MANIFEST);
    const names = fs.readdirSync(tmp).filter((f) => /\.(js|gs)$/.test(f));
    say(`✓ the project's settings were copied (appsscript.json). Files there now: ${names.join(', ') || '(none)'}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function deployments() {
  const r = clasp(['deployments'], { quiet: true, okToFail: true });
  return String(r.stdout || '').split('\n').map((l) => l.trim().match(/^-\s+(\S+)\s+@(\S+)(?:\s+-\s+(.*))?$/)).filter(Boolean)
    .map((m) => ({ id: m[1], ver: m[2], desc: m[3] || '' }));
}

const cmd = process.argv[2];
if (cmd === 'setup') {
  const id = String(process.argv[3] || '').trim();
  if (!/^[A-Za-z0-9_-]{30,}$/.test(id)) fail('usage: node scripts/gs-sync.mjs setup <SCRIPT_ID>  (Apps Script → ⚙️ Project Settings → IDs → Script ID)');
  writeConf(id);
  pullManifest(id);
  const list = deployments().filter((d) => d.ver !== 'HEAD');
  if (list.length === 1 && SAFE_DEPLOYMENT.test(list[0].id)) {
    fs.writeFileSync(DEPLOY, JSON.stringify({ deploymentId: list[0].id }, null, 2) + '\n');
    say(`✓ web app deployment found and saved (${list[0].id.slice(0, 12)}…)`);
  } else {
    say(`! ${list.length} deployments found. Write the web app's id into apps-script/.clasp-deploy.json as {"deploymentId": "..."}`);
    list.forEach((d) => say(`   ${d.id}  @${d.ver}  ${d.desc}`));
  }
  say('Ready. Next: node scripts/gs-sync.mjs push');
} else if (cmd === 'push') {
  if (!fs.existsSync(CONF)) fail('not linked yet: node scripts/gs-sync.mjs setup <SCRIPT_ID>');
  if (!fs.existsSync(MANIFEST)) fail('apps-script/appsscript.json is missing: run setup again');
  // 1. the tests and the version check, so broken code never reaches the project
  run('node', [path.join(ROOT, 'scripts', 'check-version.mjs')], { cwd: ROOT });
  const tests = fs.existsSync(path.join(GS, 'test')) ? fs.readdirSync(path.join(GS, 'test')).filter((f) => f.endsWith('.test.js')) : [];
  for (const t of tests) {
    const r = run('node', [path.join('test', t)], { quiet: true, okToFail: true });
    if (r.status !== 0) fail(`test ${t} failed, nothing was pushed:\n${(r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).slice(0, 8).join('\n')}`);
  }
  say(tests.length ? '✓ tests pass' : '✓ version check passes');
  // 2. every file at once (the whole project becomes exactly this folder)
  writeConf(JSON.parse(fs.readFileSync(CONF, 'utf8')).scriptId);
  clasp(['push', '--force']);
  say(`✓ pushed ${files().length} files (code version ${version()})`);
  // 3. the web app answers from a fixed version: move it to the new code (same address, nothing to change on the site)
  if (fs.existsSync(DEPLOY)) {
    const { deploymentId } = JSON.parse(fs.readFileSync(DEPLOY, 'utf8'));
    if (!SAFE_DEPLOYMENT.test(String(deploymentId || ''))) fail('apps-script/.clasp-deploy.json: deploymentId must be letters, digits, - and _ only');
    if (!SAFE_VERSION.test(version())) fail('Shared.gs: CODE_VERSION must be letters, digits, dots, - and _ only');
    // a new version, the same URL. No spaces in args (the Windows shell would split them); clasp may exit 0 on errors
    const r = clasp(['redeploy', deploymentId, '-d', `gs-sync-${version()}`], { quiet: true, okToFail: true });
    const out = String(r.stdout || '') + String(r.stderr || '');
    if (r.status !== 0 || /\berror\b/i.test(out)) fail('the web app was not moved to the new code: ' + out.replace(/AKfy[\w-]+/g, 'AKfy…').trim().slice(0, 300));
    say('✓ the web app now runs the new code (same address)');
  } else say('! no web app deployment saved: the site keeps the old API code until you deploy it (see setup)');
  say('Done. The next hourly run uses the new code; to check now, run runFeed once in the editor.');
} else if (cmd === 'status') {
  if (!fs.existsSync(CONF)) fail('not linked yet: node scripts/gs-sync.mjs setup <SCRIPT_ID>');
  say(`linked project: ${JSON.parse(fs.readFileSync(CONF, 'utf8')).scriptId.slice(0, 12)}…  ·  local code version ${version()}  ·  ${files().length} files`);
  say(fs.existsSync(DEPLOY) ? `web app deployment: ${JSON.parse(fs.readFileSync(DEPLOY, 'utf8')).deploymentId.slice(0, 12)}…` : 'web app deployment: not saved');
  deployments().forEach((d) => say(`   ${d.id.slice(0, 12)}…  @${d.ver}  ${d.desc}`));
} else {
  say('usage: node scripts/gs-sync.mjs setup <SCRIPT_ID> | push | status');
  process.exit(cmd ? 1 : 0);
}
