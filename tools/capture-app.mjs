#!/usr/bin/env node
/*
  Capture real WagePress business-panel screens into assets/work/.

  Usage:
    node tools/capture-app.mjs <email> <password> [baseUrl]

  Launches Chrome with remote debugging, signs in on the Business tab,
  visits each route below and saves a 1440x900 screenshot. Needs Node 22+
  (uses the built-in WebSocket) and Google Chrome or Edge on this machine.
*/
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTES = [
  ['01', '/payroll'],
  ['02', '/user-list'],
  ['03', '/attendance-list'],
  ['04', '/forms-dashboard'],
  ['05', '/wallet'],
  ['06', '/twc-filing'],
];

const [email, password, baseUrl = 'https://dev-company.wagepress.com'] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: node tools/capture-app.mjs <email> <password> [baseUrl]');
  process.exit(1);
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) { console.error('No Chrome or Edge found.'); process.exit(1); }

const PORT = 9333;
const outDir = resolve('assets/work');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--window-size=1440,900', '--hide-scrollbars',
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
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
        else if (msg.method) this.events.push(msg);
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
  async goto(url) {
    await this.send('Page.navigate', { url });
    await sleep(2500);
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
}

// set a React-controlled input's value so the change is picked up by state
const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

try {
  const cdp = new CDP(await waitForTarget());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('signing in…');
  await cdp.goto(`${baseUrl}/`);
  const okEmail = await cdp.evaluate(setInput('input[type="email"], input[placeholder*="Email" i]', email));
  const okPass = await cdp.evaluate(setInput('input[type="password"]', password));
  if (!okEmail || !okPass) throw new Error('Could not find the login fields — has the login page changed?');
  await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /sign in/i.test(x.textContent)); if (b) b.click(); return !!b; })()`);
  await sleep(4000);
  const stillLogin = await cdp.evaluate(`!!document.querySelector('input[type="password"]')`);
  if (stillLogin) throw new Error('Login did not go through — check the credentials.');

  // pick the first company if the account manager selector appears
  await cdp.evaluate(`(() => { const c = document.querySelector('.company-info-card, [class*="company-card"]'); if (c) c.click(); })()`);
  await sleep(1500);

  for (const [n, route] of ROUTES) {
    console.log(`capturing ${route} → assets/work/${n}.jpg`);
    await cdp.goto(`${baseUrl}${route}`);
    await sleep(1500);
    await cdp.shot(resolve(outDir, `${n}.jpg`));
  }
  console.log('done.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
