#!/usr/bin/env node
/*
  Record short click-through flows of the WagePress business panel as MP4s
  for the homepage hover previews.

  Usage:
    node tools/record-flows.mjs <email> <password> [baseUrl]

  Output: assets/work/01.mp4 … 06.mp4 (plus 01.jpg … 06.jpg posters) and
  assets/work/tour.mp4, a login-to-every-screen tour for the engine card.
  Needs Node 22+, Google Chrome or Edge, and ffmpeg on PATH.
*/
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [email, password, baseUrl = 'https://dev-company.wagepress.com', only] = process.argv.slice(2);
// optional 4th argument: comma-separated flow numbers to re-record, e.g. "01,04"
if (!email || !password) { console.error('usage: node tools/record-flows.mjs <email> <password> [baseUrl]'); process.exit(1); }

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) { console.error('No Chrome or Edge found.'); process.exit(1); }

const W = 1440, H = 900, PORT = 9334;
let CURSOR_WAIT = 650; // shortened during the tour so it fits in ~35s
const outDir = resolve('assets/work');
const tmpRoot = resolve('.capture-frames');
mkdirSync(outDir, { recursive: true });
rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--user-data-dir=' + resolve('.capture-profile'), 'about:blank',
], { stdio: 'ignore' });

async function waitForTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not expose a debugging target');
}

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.onEvent = () => {}; }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
        else if (msg.method) this.onEvent(msg);
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result))));
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result?.value;
  }
}

/* ---------- page helpers ---------- */
const CURSOR_JS = `(() => {
  if (document.getElementById('__rec_cursor')) return;
  const c = document.createElement('div'); c.id = '__rec_cursor';
  c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;border-radius:50%;background:rgba(31,199,126,.85);box-shadow:0 0 0 6px rgba(31,199,126,.25);z-index:2147483647;pointer-events:none;transition:left .55s cubic-bezier(.22,1,.36,1),top .55s cubic-bezier(.22,1,.36,1),transform .15s;transform:translate(-50%,-50%)';
  document.body.appendChild(c);
})()`;

const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const findRect = (text, scope) => `(() => {
  const want = ${JSON.stringify(text)}.trim().toLowerCase();
  const nodes = [...document.querySelectorAll(${JSON.stringify(scope || 'a, button, [role="tab"], li, span, div')})];
  const el = nodes.find((n) => n.children.length < 4 && (n.textContent || '').trim().toLowerCase() === want && n.getBoundingClientRect().width > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

async function moveCursor(cdp, x, y) {
  await cdp.evaluate(`(() => { const c = document.getElementById('__rec_cursor'); if (c) { c.style.left = '${x}px'; c.style.top = '${y}px'; } })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(CURSOR_WAIT);
}

async function clickAt(cdp, x, y) {
  await moveCursor(cdp, x, y);
  await cdp.evaluate(`(() => { const c = document.getElementById('__rec_cursor'); if (c) c.style.transform = 'translate(-50%,-50%) scale(.7)'; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(120);
  await cdp.evaluate(`(() => { const c = document.getElementById('__rec_cursor'); if (c) c.style.transform = 'translate(-50%,-50%)'; })()`);
}

async function clickText(cdp, text, scope) {
  const r = await cdp.evaluate(findRect(text, scope));
  if (!r) { console.warn(`  (could not find "${text}")`); return false; }
  await clickAt(cdp, Math.round(r.x), Math.round(r.y));
  return true;
}

async function goto(cdp, path, wait = 2200) {
  await cdp.send('Page.navigate', { url: `${baseUrl}${path}` });
  await sleep(wait);
  await cdp.evaluate(CURSOR_JS);
}

async function scrollBy(cdp, dy, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: dy / steps });
    await sleep(70);
  }
}

async function typeInto(cdp, selector, value) {
  const r = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) return false;
  await clickAt(cdp, Math.round(r.x), Math.round(r.y));
  await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); })()`);
  for (const ch of value) {
    await cdp.send('Input.insertText', { text: ch });
    await sleep(28 + Math.random() * 30);
  }
  await sleep(150);
  return true;
}

/* ---------- the flows ---------- */
const FLOWS = [
  // full tour: login → every screen. ~35s. Used by the e-file engine card.
  { n: 'tour', name: 'tour', fresh: true, maxHold: 0.5, targetSeconds: 36, run: async (c) => {
    CURSOR_WAIT = 420;
    await goto(c, '/', 1800);
    const EMAIL_SEL = 'input[type="email"], input[placeholder*="Email" i]';
    await typeInto(c, EMAIL_SEL, email);
    await c.evaluate(setInput(EMAIL_SEL, email)); // make sure React state has the full value
    await typeInto(c, 'input[type="password"]', password);
    await c.evaluate(setInput('input[type="password"]', password));
    await clickText(c, 'Sign In', 'button');
    for (let i = 0; i < 12; i++) { await sleep(500); if (!(await c.evaluate(`!!document.querySelector('input[type="password"]')`))) break; }
    if (await c.evaluate(`!!document.querySelector('input[type="password"]')`)) {
      // fall back to a programmatic submit so the tour still gets in
      await c.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent)); if (b) b.click(); })()`);
      await sleep(4000);
    }
    if (await c.evaluate(`!!document.querySelector('input[type="password"]')`)) throw new Error('tour: login did not go through');
    await sleep(1200);
    await c.evaluate(CURSOR_JS);
    const stops = [
      ['Teams', '/user-list'], ['Projects', '/project-list'], ['Schedule tasks', '/task-list'], ['Attendance', '/attendance-list'],
      ['Payroll summary', '/payroll-summary'], ['Payroll', '/payroll'], ['Employment Tax (94x)', '/forms-dashboard'],
      ['Link Bank Account', '/link-bank-account'], ['Subscription', '/subscription'],
    ];
    for (const [label, path] of stops) {
      const ok = await clickText(c, label); await sleep(ok ? 900 : 100);
      const here = await c.evaluate('location.pathname');
      if (!ok || here === '/') await goto(c, path, 1200);
      await scrollBy(c, 220, 4); await sleep(350); await scrollBy(c, -220, 4); await sleep(250);
    }
    await goto(c, '/twc-filing', 1400);
    await clickText(c, 'Filings'); await sleep(800);
    await goto(c, '/', 1400); await sleep(800);
    CURSOR_WAIT = 650;
  } },
  { n: '01', name: 'payroll', run: async (c) => {
    await goto(c, '/'); await sleep(1200);
    await clickText(c, 'Payroll'); await sleep(1200);
    await goto(c, '/payroll', 2600);
    await clickText(c, 'Payroll History'); await sleep(600);
    await goto(c, '/payroll-history', 2200);
  } },
  { n: '02', name: 'teams', run: async (c) => {
    await goto(c, '/user-list'); await sleep(900);
    await clickText(c, 'Register', 'button'); await sleep(2000);
    await scrollBy(c, 500); await sleep(1200);
  } },
  { n: '03', name: 'time', run: async (c) => {
    await goto(c, '/project-list'); await sleep(1200);
    await clickText(c, 'Schedule tasks'); await sleep(1600);
    await clickText(c, 'Attendance'); await sleep(1800);
  } },
  { n: '04', name: 'tax', run: async (c) => {
    await goto(c, '/forms-dashboard'); await sleep(1000);
    await scrollBy(c, 700); await sleep(900);
    await scrollBy(c, -700); await sleep(500);
    await clickText(c, '94x Filings'); await sleep(1600);
    await clickText(c, 'Draft Form'); await sleep(1400);
  } },
  { n: '05', name: 'wallet', run: async (c) => {
    await goto(c, '/link-bank-account'); await sleep(1400);
    await clickText(c, 'Subscription'); await sleep(1800);
    await clickText(c, 'Payment Method'); await sleep(1800);
  } },
  { n: '06', name: 'unemployment', run: async (c) => {
    await goto(c, '/twc-filing'); await sleep(1000);
    await clickText(c, 'Setup'); await sleep(1300);
    await clickText(c, 'Authorization'); await sleep(1300);
    await clickText(c, 'Employees'); await sleep(1300);
    await clickText(c, 'Filings'); await sleep(1400);
  } },
];

/* ---------- recording ---------- */
async function record(cdp, flow) {
  const dir = join(tmpRoot, flow.n);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.onEvent = async (msg) => {
    if (msg.method !== 'Page.screencastFrame') return;
    const { data, metadata, sessionId } = msg.params;
    const file = join(dir, `f${String(frames.length).padStart(4, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch (_) { /* stopped */ }
  };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await flow.run(cdp);
  await sleep(400);
  await cdp.send('Page.stopScreencast');
  cdp.onEvent = () => {};
  if (frames.length < 2) throw new Error(`flow ${flow.n} produced no frames`);

  // poster = last frame; concat list with real durations, last frame held for a beat
  copyFileSync(frames[frames.length - 1].file, join(outDir, `${flow.n}.jpg`));
  // idle holds (network waits) are capped so the clip stays brisk; a flow can set its own cap and a target length
  const maxHold = flow.maxHold ?? 1.5;
  let total = 0, list = '';
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1 ? Math.min(maxHold, Math.max(0.04, frames[i + 1].t - frames[i].t)) : 1.2;
    total += dur;
    list += `file '${frames[i].file.replace(/\\/g, '/')}'\nduration ${dur.toFixed(3)}\n`;
  }
  const speed = flow.targetSeconds && total > flow.targetSeconds ? total / flow.targetSeconds : 1;
  list += `file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`;
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list);
  const out = join(outDir, `${flow.n}.mp4`);
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `setpts=PTS/${speed.toFixed(3)},scale=1280:-2,fps=24,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${flow.n}`);
  console.log(`  ${frames.length} frames → assets/work/${flow.n}.mp4`);
}

try {
  const cdp = new CDP(await waitForTarget());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  console.log('signing in…');
  await cdp.send('Page.navigate', { url: `${baseUrl}/` });
  await sleep(2500);
  const okEmail = await cdp.evaluate(setInput('input[type="email"], input[placeholder*="Email" i]', email));
  const okPass = await cdp.evaluate(setInput('input[type="password"]', password));
  if (!okEmail || !okPass) throw new Error('Could not find the login fields');
  await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent)); if (b) b.click(); })()`);
  await sleep(4000);
  if (await cdp.evaluate(`!!document.querySelector('input[type="password"]')`)) throw new Error('Login did not go through');

  const wanted = only ? only.split(',') : null;
  for (const flow of FLOWS) {
    if (wanted && !wanted.includes(flow.n)) continue;
    if (flow.fresh) {
      await cdp.evaluate('(() => { localStorage.clear(); sessionStorage.clear(); })()');
      await cdp.send('Network.clearBrowserCookies');
    }
    console.log(`recording ${flow.name}…`);
    await record(cdp, flow);
  }
  console.log('done.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  rmSync(tmpRoot, { recursive: true, force: true });
}
