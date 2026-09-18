/* ==========================================================================
   WagePress — homepage behaviour
   Dependencies: three (dynamic import, optional) and Lenis (optional).
   Everything falls back gracefully if a CDN script is unavailable.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (v, a, b) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const pad3 = (n) => String(Math.round(n)).padStart(3, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const C = {
    paper: '#f5f7fa', paperDim: '#e9edf3', ink: '#0b1526', inkSoft: '#1a2436',
    muted: '#667084', accent: '#1fc77e', magenta: '#22d38a',
  };

  /* ------------------------------------------------------------------
     Isometric cube staircase — the impossible object as flat SVG.
     19 cubes: seven along x, six up y, six along z. In true isometric
     projection the last cube lands exactly on the first, closing the
     loop into a triangle that cannot exist. Used by the preloader and
     as the hero fallback when WebGL is unavailable.
     ------------------------------------------------------------------ */
  const CUBE_PATH = (() => {
    const p = [];
    for (let i = 0; i <= 6; i++) p.push([i, 0, 0]);
    for (let i = 1; i <= 6; i++) p.push([6, i, 0]);
    for (let i = 1; i <= 6; i++) p.push([6, 6, i]);
    return p;
  })();

  function mountIsoCubes(svg) {
    if (!svg) return;
    const s = 34, w = s * Math.cos(Math.PI / 6), h = s / 2;
    const f = (n) => n.toFixed(2);
    const poly = (pts, fill) => `<polygon points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${fill}"/>`;
    const cube = ([x, y, z], accent) => {
      const X = (x - z) * w, Y = (x + z) * h - y * s;
      const top = [[X, Y - s], [X + w, Y - h], [X, Y], [X - w, Y - h]];
      const right = [[X + w, Y + h], [X, Y + s], [X, Y], [X + w, Y - h]];
      const left = [[X - w, Y + h], [X, Y + s], [X, Y], [X - w, Y - h]];
      return `<g>${poly(top, accent ? C.accent : '#1c2a40')}${poly(right, accent ? C.accent : '#0a1220')}${poly(left, accent ? C.accent : '#131f31')}</g>`;
    };
    let out = `<ellipse cx="${f(3 * w)}" cy="166.60" rx="176.80" ry="30.60" fill="${C.ink}" opacity="0.07"/>`;
    out += cube(CUBE_PATH[0], true);
    CUBE_PATH.slice(1).forEach((p) => { out += cube(p, false); });
    out += cube(CUBE_PATH[0], true); // drawn again on top so the loop closes on the accent cube
    svg.setAttribute('viewBox', '-94.47 -166.60 365.60 374.00');
    svg.innerHTML = out;
  }

  /* ------------------------------------------------------------------
     Preloader: play → lift → done. Skipped on repeat visits in a session.
     ------------------------------------------------------------------ */
  function initPreloader() {
    const pre = $('.preloader');
    if (!pre) return;
    const html = document.documentElement;
    const KEY = 'wagepress-preloaded';
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch (_) { /* private mode */ }
    const remember = () => { try { sessionStorage.setItem(KEY, '1'); } catch (_) { /* ignore */ } };

    if (seen || reduced) { pre.dataset.phase = 'done'; remember(); return; }

    html.dataset.loading = '';
    mountIsoCubes($('#preloader-mark'));
    const count = $('#preloader-count');
    const start = performance.now();
    const tick = (now) => {
      const l = Math.min(1, (now - start) / 1300);
      count.textContent = pad3((1 - Math.pow(1 - l, 3)) * 100);
      if (l < 1) requestAnimationFrame(tick);
      else { remember(); pre.dataset.phase = 'lift'; }
    };
    requestAnimationFrame(tick);
    const finish = () => { pre.dataset.phase = 'done'; delete html.dataset.loading; };
    pre.addEventListener('transitionend', (e) => {
      if (pre.dataset.phase === 'lift' && e.propertyName === 'transform') finish();
    });
    // safety net: whatever happens, the page unlocks within four seconds
    setTimeout(() => { if (pre.dataset.phase !== 'done') finish(); }, 4000);
  }

  /* ------------------------------------------------------------------
     Smooth scrolling (Lenis) — optional
     ------------------------------------------------------------------ */
  let lenis = null;
  function initSmoothScroll() {
    if (reduced || typeof window.Lenis !== 'function') return;
    try { lenis = new window.Lenis({ lerp: 0.12, autoRaf: true, anchors: true }); } catch (_) { lenis = null; }
    if (lenis && !location.hash) lenis.scrollTo(0, { immediate: true });
  }

  /* ------------------------------------------------------------------
     Scroll reveals — four primitives with their own thresholds
       .reveal        opacity 0 / y 28  → 0.9s, margin -12%
       .rise          opacity 0 / y 28  → 0.8s, amount .25
       .stagger       children .stagger-item y 24 → 0.7s, 0.08s apart, amount .15
       .lines         each .line > span y 112% → 0.9s, 0.12s apart, amount .4
     ------------------------------------------------------------------ */
  function initReveals() {
    // IntersectionObserver does the work; a rect check on scroll backs it up so
    // nothing can stay hidden if an observer notification is missed (sticky
    // stages, display toggles, odd embed contexts).
    const pending = [];
    const observe = (selector, opts) => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, opts);
      const inset = opts.rootMargin ? 0.12 : 0;
      const share = opts.threshold || 0;
      $$(selector).forEach((el) => { io.observe(el); pending.push({ el, io, inset, share }); });
    };
    const sweep = () => {
      const vh = innerHeight;
      for (let i = pending.length - 1; i >= 0; i--) {
        const { el, io, inset, share } = pending[i];
        if (el.classList.contains('is-in')) { pending.splice(i, 1); continue; }
        const r = el.getBoundingClientRect();
        if (!r.height && !r.width) continue;
        const top = vh * inset, bottom = vh * (1 - inset);
        const visible = Math.min(r.bottom, bottom) - Math.max(r.top, top);
        const need = Math.max(1, Math.min(r.height * share, vh * 0.4));
        if (visible >= need) { el.classList.add('is-in'); io.unobserve(el); pending.splice(i, 1); }
      }
    };
    let ticking = false;
    const onScroll = () => { if (!ticking) { ticking = true; setTimeout(() => { ticking = false; sweep(); }, 40); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    setTimeout(sweep, 0);
    $$('.lines').forEach((el) => $$('.line > span', el).forEach((s, n) => { s.style.transitionDelay = `${(0.12 * n).toFixed(2)}s`; }));
    $$('.stagger').forEach((w) => $$('.stagger-item', w).forEach((el, i) => { el.style.transitionDelay = el.dataset.delay || `${(0.08 * i).toFixed(2)}s`; }));
    observe('.reveal', { rootMargin: '-12% 0px -12% 0px', threshold: 0 });
    observe('.rise', { threshold: 0.25 });
    observe('.stagger', { threshold: 0.15 });
    observe('.lines', { threshold: 0.4 });
  }

  /* ------------------------------------------------------------------
     Hero: WebGL impossible object that comes apart as you scroll,
     re-forms as a square window, and pulls you through it.
     ------------------------------------------------------------------ */
  async function initHero() {
    const hero = $('#hero');
    const stage = $('.hero__stage');
    if (!hero || !stage) return;
    const word = $('#hero-word'), im = $('#hero-im'), copy = $('#hero-copy'), veil = $('#hero-veil');
    const hint = $('#hero-hint'), count = $('#hero-count');
    mountIsoCubes($('#hero-fallback svg'));

    const fallback = () => { hero.dataset.webgl = 'no'; };

    let THREE;
    try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'); }
    catch (_) { return fallback(); }

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (_) { return fallback(); }

    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const el = renderer.domElement;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { position: 'absolute', inset: '0', zIndex: '1' });
    stage.prepend(el);

    const scene = new THREE.Scene();
    const inkMat = new THREE.MeshStandardMaterial({ color: 0x0f1a2c, roughness: 0.32, metalness: 0.6 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x1fc77e, roughness: 0.5, metalness: 0.1 });
    const box = new THREE.BoxGeometry(1, 1, 1);

    // starting shape: the staircase, centred on its centroid
    const centroid = new THREE.Vector3();
    CUBE_PATH.forEach(([x, y, z]) => centroid.add(new THREE.Vector3(x, y, z)));
    centroid.multiplyScalar(1 / CUBE_PATH.length);

    // target shape: a 20-cube square ring, the window
    const ring = [];
    for (let i = 0; i <= 5; i++) ring.push([i, 0]);
    for (let i = 1; i <= 5; i++) ring.push([5, i]);
    for (let i = 4; i >= 0; i--) ring.push([i, 5]);
    for (let i = 4; i >= 1; i--) ring.push([0, i]);
    const targets = ring.map(([x, y]) => new THREE.Vector3(x - 2.5, y - 2.5 + 0.3, 0));

    const group = new THREE.Group();
    scene.add(group);
    const cubes = [];
    CUBE_PATH.forEach(([x, y, z], i) => {
      const mesh = new THREE.Mesh(box, i === 0 ? accentMat : inkMat);
      const from = new THREE.Vector3(x - centroid.x, y - centroid.y, z - centroid.z);
      mesh.position.copy(from);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      cubes.push({ mesh, from, to: targets[i] });
    });
    { // the ring needs one more cube than the staircase has: it grows out of the last one
      const last = cubes[cubes.length - 1];
      const mesh = new THREE.Mesh(box, inkMat);
      mesh.position.copy(last.from);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.scale.setScalar(0.001);
      group.add(mesh);
      cubes.push({ mesh, from: last.from.clone(), to: targets[cubes.length], spawned: true });
    }

    const windowPane = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: 0x0b1526, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    windowPane.position.set(0, 0.3, 0);
    scene.add(windowPane);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: 0.13 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -5;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(10, 16, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -16;
    key.shadow.camera.right = key.shadow.camera.top = 16;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe4e9ff, 0.55);
    fill.position.set(-8, 4, -6);
    scene.add(fill);

    const camera = new THREE.OrthographicCamera();
    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h);
      const aspect = w / h, n = Math.max(14, 9.5 / aspect);
      camera.left = -n * aspect / 2; camera.right = n * aspect / 2;
      camera.top = n / 2; camera.bottom = -n / 2;
      camera.near = 0.1; camera.far = 200;
      camera.updateProjectionMatrix();
    };
    resize();
    new ResizeObserver(resize).observe(stage);

    // camera stations: the illusion angle, a reveal angle, and straight through the window
    const ISO = { az: Math.PI / 4, el: Math.asin(1 / Math.sqrt(3)) };
    const MID = { az: Math.PI / 2 - 0.3, el: 0.16 };
    const END = { az: Math.PI / 2, el: 0.02 };
    let A = 0, mx = 0, my = 0, lastHint = '';

    // the big word cycles through the services as the object comes apart
    const WORDS = [['PAY', 'ROLL'], ['TIME', 'SHEETS'], ['TAX', 'FILING'], ['PAY', 'MENTS']];
    const WORD_BAND = 0.13; // progress per word; all four show before the word fades at .52
    let wordIndex = 0;
    const tail = document.createTextNode(WORDS[0][1]);
    word.replaceChild(tail, word.childNodes[word.childNodes.length - 1]);
    const fitWord = (pair) => { word.style.fontSize = `min(${Math.min(20, 128 / (pair[0].length + pair[1].length)).toFixed(2)}vw, 30vh)`; }; // vh cap keeps the word clear of the copy on short laptop screens
    fitWord(WORDS[0]);
    const setWord = (i) => {
      if (i === wordIndex) return;
      wordIndex = i;
      im.textContent = WORDS[i][0];
      tail.nodeValue = WORDS[i][1];
      fitWord(WORDS[i]);
      word.classList.remove('is-swapping'); void word.offsetWidth; word.classList.add('is-swapping');
    };
    addEventListener('mousemove', (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; });

    const frame = () => {
      requestAnimationFrame(frame);
      const rect = hero.getBoundingClientRect();
      if (rect.bottom < -8) return;
      const total = rect.height - stage.clientHeight;
      const n = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
      A = reduced ? n : A + (n - A) * (n > 0.78 ? 0.18 : 0.08);

      const h = smooth(A, 0.04, 0.5);   // come apart + spin
      const m = smooth(A, 0, 0.5);      // camera to reveal angle
      const f = smooth(A, 0.46, 0.86);  // camera to window + zoom
      let az = lerp(ISO.az, MID.az, m), elv = lerp(ISO.el, MID.el, m);
      az = lerp(az, END.az, f); elv = lerp(elv, END.el, f);
      const wgt = reduced ? 0 : (A < 0.02 ? 0 : A) * (1 - f);
      az += 0.05 * mx * wgt; elv += 0.04 * my * wgt;
      camera.position.set(40 * Math.cos(elv) * Math.cos(az), 40 * Math.sin(elv), 40 * Math.cos(elv) * Math.sin(az));
      camera.lookAt(0, 0.3 * h, 0);

      const zoom = 1 + 26 * Math.pow(f, 1.7);
      group.rotation.y = Math.PI * h;
      cubes.forEach((c, i) => {
        const a = smooth(clamp(1.18 * h - (i / cubes.length) * 0.18, 0, 1), 0, 1);
        c.mesh.position.lerpVectors(c.from, c.to, a);
        c.mesh.scale.setScalar(Math.max(0.001, c.spawned ? smooth(a, 0.75, 1) : 1));
        c.mesh.position.multiplyScalar(lerp(1, zoom, smooth(f, 0.02, 1) * a));
      });
      windowPane.material.opacity = smooth(A, 0.36, 0.52);
      windowPane.scale.setScalar(zoom);

      // page-side effects, all driven by the same eased progress
      setWord(Math.min(WORDS.length - 1, Math.floor(A / WORD_BAND)));
      im.style.opacity = String(1 - smooth(A, 0.52, 0.72));
      word.style.opacity = String(1 - smooth(A, 0.52, 0.72));
      word.style.transform = `scale(${1 + 0.14 * A})`;
      copy.style.opacity = String(1 - smooth(A, 0.18, 0.32));
      veil.style.opacity = String(smooth(A, 0.72, 0.98));
      hint.style.opacity = count.style.opacity = A > 0.85 ? '0' : '1';
      count.textContent = pad3(100 * A);
      const label = A > 0.55 ? '( through the ledger )' : A > 0.28 ? '( only numbers, after all )' : 'scroll to inspect ↓';
      if (label !== lastHint) { hint.textContent = label; lastHint = label; }

      renderer.render(scene, camera);
    };
    frame();
    hero.dataset.webgl = 'ok';
  }

  /* ------------------------------------------------------------------
     Generated placeholder art (swapped for real files when present)
     ------------------------------------------------------------------ */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }

  function seeded(seed) {
    let s = seed * 9301 + 49297;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function coverDataURL(i) {
    const W = 820, H = 615;
    const [c, x] = makeCanvas(W, H);
    const rnd = seeded(i + 1);
    const dark = i % 2 === 1;
    x.fillStyle = dark ? C.ink : C.paper;
    x.fillRect(0, 0, W, H);
    x.fillStyle = dark ? C.paper : C.ink;

    if (i === 0) {
      for (let yy = 20; yy < H; yy += 22) for (let xx = 20; xx < W; xx += 22) {
        const v = 0.5 + 0.5 * Math.sin(xx * 0.012 + yy * 0.006);
        x.beginPath(); x.arc(xx, yy, v * 9, 0, Math.PI * 2); x.fill();
      }
    } else if (i === 1) {
      for (let k = 0; k < 12; k++) x.fillRect(80, 70 + k * 42, 120 + rnd() * 560, 12);
      x.fillStyle = C.accent; x.fillRect(80, 70 + 4 * 42, 300, 12);
    } else if (i === 2) {
      x.strokeStyle = x.fillStyle; x.lineWidth = 6;
      for (let r = 30; r < 420; r += 28) { x.beginPath(); x.arc(W * 0.62, H * 0.5, r, 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = C.accent; x.beginPath(); x.arc(W * 0.62, H * 0.5, 18, 0, Math.PI * 2); x.fill();
    } else if (i === 3) {
      const cell = 14;
      for (let yy = 0; yy < H; yy += cell) for (let xx = 0; xx < W; xx += cell) {
        if (rnd() < (xx / W + yy / H) / 2) x.fillRect(xx, yy, cell - 2, cell - 2);
      }
    } else if (i === 4) {
      x.lineWidth = 16; x.strokeStyle = x.fillStyle;
      for (let k = -H; k < W + H; k += 44) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + H, H); x.stroke(); }
      x.fillStyle = C.magenta; x.fillRect(W * 0.3, H * 0.3, W * 0.4, H * 0.4);
    } else {
      for (let k = 0; k < 900; k++) {
        x.globalAlpha = 0.35 + rnd() * 0.65;
        x.beginPath(); x.arc(rnd() * W, rnd() * H, rnd() * 5 + 1, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
    }
    x.fillStyle = dark ? C.paper : C.ink;
    x.font = '500 16px "Poppins", sans-serif';
    x.fillText(`0${i + 1} / COVER`, 24, H - 24);
    return c.toDataURL('image/png');
  }

  function initPlaceholders() {
    // module previews are real app recordings; fall back to generated art only if the poster is missing
    $$('#work-preview video, .work-item__cover video').forEach((v, i) => {
      v.src = v.dataset.src;
      const probe = new Image();
      probe.onerror = () => { v.poster = coverDataURL(i % 6); };
      probe.src = v.poster;
    });
    // tool previews reuse the module recordings; if a clip fails to load the
    // screen keeps the poster as a still instead of collapsing to an empty box
    $$('.lab-reel__video').forEach((v) => {
      v.addEventListener('error', () => {
        const screen = v.parentElement;
        if (screen && v.poster) screen.style.backgroundImage = `url("${v.poster}")`;
        v.hidden = true;
      }, { once: true });
      v.src = v.dataset.src;
    });
  }

  /* ------------------------------------------------------------------
     Work list: pointer enter / focus swaps the sticky preview
     ------------------------------------------------------------------ */
  function initWork() {
    const previews = $$('#work-preview video');
    const urlEl = $('#work-preview-url');
    const set = (i) => {
      const target = previews[i];
      if (!target || target.classList.contains('is-active')) return;
      if (urlEl) urlEl.textContent = `dev-company.wagepress.com${target.dataset.route || ''}`;
      previews.forEach((p) => { if (p !== target) p.pause(); });
      // rewinding to 0 makes the browser decode that frame fresh (a "seek"), which
      // briefly clears the picture even on a fully-buffered clip. Swapping which
      // video is .is-active right away would crossfade straight into that blank
      // beat, so the outgoing clip is kept on screen until the new one actually has
      // a frame ready — 'seeked' fires the instant that happens, almost always
      // within a frame or two since these clips are fully preloaded; the timeout is
      // just a safety net in case it never fires.
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        previews.forEach((p) => p.classList.toggle('is-active', p === target));
        target.play().catch(() => {});
      };
      target.addEventListener('seeked', reveal, { once: true });
      target.currentTime = 0;
      setTimeout(reveal, 350);
    };
    const items = $$('.work-item');
    items.forEach((it, i) => {
      // a mouse gliding down the list sweeps across every row on the way to the one
      // the user actually wants, each briefly firing pointerenter — switching (and
      // re-seeking) on every one of those would flash a blank frame per row passed.
      // Only a row the pointer actually settles on for a beat gets to switch; a
      // fly-through is cancelled by pointerleave before its timer ever fires.
      let hoverTimer = 0;
      it.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => set(i), 90); });
      it.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
      it.addEventListener('focus', () => set(i)); // keyboard nav should feel immediate
    });
    // desktop: start the first preview once the section is on screen; mobile: play covers while visible
    if (previews.length && !reduced) {
      new IntersectionObserver(([e]) => { const v = previews.find((p) => p.classList.contains('is-active')); if (!v) return; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { rootMargin: '120px' }).observe($('#work-preview'));
      // while the preview sits pinned, plain scrolling — no hover needed — should
      // still step through it one row at a time: whichever row is crossing the
      // viewport's centre band becomes the active preview.
      const centerIO = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) set(items.indexOf(entry.target)); });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      items.forEach((it) => centerIO.observe(it));
    }
    const covers = $$('.work-item__cover video');
    if (covers.length && !reduced) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); }), { rootMargin: '120px' });
      covers.forEach((v) => io.observe(v));
    }
  }

  /* ------------------------------------------------------------------
     Lab specimens: 88px canvases on a six-second cycle, only while near
     the viewport. Each takes t in [0, 1).
     ------------------------------------------------------------------ */
  function initLab() {
    const S = 88;

    function glyphwall(x, t) {
      x.clearRect(0, 0, S, S);
      const chars = 'WAGE$%·';
      const reveal = Math.min(1, 1.4 * t);
      let seed = 1 + Math.floor(90 * t);
      const rnd = () => ((seed = (16807 * seed) % 0x7fffffff) - 1) / 0x7ffffffe;
      x.font = '7.2px ui-monospace, Menlo, Consolas, monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
        const px = (c + 0.5) * 8, py = (r + 0.5) * 8;
        const d = Math.hypot(px - 44, py - 44) / 44;
        if (d > 1) continue;
        const inside = d < reveal;
        const ch = inside ? chars[(r * 11 + c) % 4] : chars[Math.floor(rnd() * chars.length)];
        x.fillStyle = `rgba(244,245,247,${inside ? 0.8 * (1 - 0.7 * d) : 0.18})`;
        x.fillText(ch, px, py);
      }
    }

    function ripple(x, t) {
      x.clearRect(0, 0, S, S);
      const a = t * Math.PI * 2;
      for (let i = 0; i < 96; i++) {
        const r = (i / 96) * Math.PI * 2;
        const n = 1 + 0.1 * Math.sin(2 * a + i);
        const px = 44 + 31.5 * n * Math.sin(3 * r + a);
        const py = 44 + 31.5 * n * Math.sin(2 * r);
        const o = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(2 * r + 3 * a));
        const key = i % 8 === 0;
        x.fillStyle = key ? `rgba(46,229,154,${o})` : `rgba(244,245,247,${0.8 * o})`;
        x.beginPath(); x.arc(px, py, key ? 1.5 : 1, 0, Math.PI * 2); x.fill();
      }
    }

    function jitter(x, t) {
      x.clearRect(0, 0, S, S);
      const word = 'wage';
      const a = t * Math.PI * 2;
      const step = S / (word.length + 1);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let i = 0; i < word.length; i++) {
        const s = 0.5 + 0.5 * Math.sin(1.3 * a + 1.7 * i);
        const size = 18 + 22 * s;
        const weight = 100 + 100 * Math.round(8 * s);
        x.save();
        x.translate(step * (i + 1), 44 + 13 * Math.sin(a + 0.9 * i));
        x.rotate(0.34 * Math.sin(0.8 * a + 1.1 * i));
        x.font = `${weight} ${size}px "Manrope", ui-sans-serif, system-ui, sans-serif`;
        x.fillStyle = `rgba(${Math.round(210 - 164 * s)}, ${Math.round(230 - 30 * s)}, ${Math.round(220 - 66 * s)}, 0.9)`;
        x.fillText(word[i], 0, 0);
        x.restore();
      }
    }

    const fns = { glyphwall, ripple, jitter };
    $$('canvas[data-sketch]').forEach((cv) => {
      const fn = fns[cv.dataset.sketch];
      if (!fn) return;
      const x = cv.getContext('2d');
      cv.width = S * DPR; cv.height = S * DPR;
      x.scale(DPR, DPR);
      fn(x, 1);
      if (reduced) return;
      let raf = 0, start = 0;
      new IntersectionObserver(([e]) => {
        cancelAnimationFrame(raf);
        if (!e.isIntersecting) return;
        start = performance.now();
        const loop = (now) => { fn(x, ((now - start) / 6000) % 1); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      }, { rootMargin: '80px' }).observe(cv);
    });

    const aa = $('#pairings-aa');
    if (aa && !reduced) {
      const words = (aa.dataset.swap || 'Aa').split('|');
      let i = 0, timer = 0;
      new IntersectionObserver(([e]) => {
        clearInterval(timer);
        if (!e.isIntersecting) return;
        timer = setInterval(() => {
          i = (i + 1) % words.length;
          aa.textContent = words[i];
          aa.classList.remove('swap'); void aa.offsetWidth; aa.classList.add('swap');
        }, 1400);
      }, { rootMargin: '80px' }).observe(aa);
    }

    // The reel: pinned for the section's scroll length, cards slide over
    // one another one at a time — same rect-driven pin as the hero.
    const reel = $('#lab-reel');
    const stage = $('.lab-reel__stage', reel || document);
    const cards = reel ? $$('.lab-reel__card', reel) : [];
    if (reel && stage && cards.length && !reduced) {
      const n = cards.length;
      const HOLD = 0.62; // share of each card's band spent settled before the next slides over it
      const fill = $('#lab-reel-fill');
      const counter = $('#lab-reel-current');
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const rect = reel.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return;
        const total = rect.height - stage.clientHeight;
        const p = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
        cards.forEach((card, i) => {
          if (i === 0) return;
          const local = clamp(p * n - (i - 1), 0, 1);
          const eased = smooth(local, HOLD, 1);
          card.style.transform = `translateX(${((1 - eased) * 100).toFixed(2)}%)`;
        });
        if (fill) fill.style.width = `${(p * 100).toFixed(1)}%`;
        const active = String(Math.min(n, Math.floor(p * n) + 1)).padStart(2, '0');
        if (counter && counter.textContent !== active) counter.textContent = active;
      };
      raf = requestAnimationFrame(loop);
    }

    const previews = reel ? $$('.lab-reel__video', reel) : [];
    if (previews.length && !reduced) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); }), { rootMargin: '120px' });
      previews.forEach((v) => io.observe(v));
    }
  }

  /* ------------------------------------------------------------------
     Workflow: pinned section, one dashboard screen per scroll step.
     Same rect-driven pin as the reel; the app window is designed at a
     fixed size and scaled to whatever room the column has.
     ------------------------------------------------------------------ */
  function initWorkflow() {
    const sec = $('#workflow');
    if (!sec) return;
    const stage = $('.wf__stage', sec);
    const grid = $('#wf-grid');
    const fit = $('#wf-fit');
    const win = $('#wf-window');
    const wires = $('#wf-wires');
    const head = $('.wf__head', sec);
    const foot = $('.wf__foot', sec);
    const screens = $$('.wf-screen', sec);
    const steps = $$('.wf-step', sec);
    const chips = $$('.wf-chip', sec);
    const chipsWrap = $('#wf-chips');
    const cards = $$('.wf-card', sec);
    const tabs = $$('#wf-tabs span', sec);
    const swaps = $$('.wf-swap__item', sec);
    const n = screens.length;
    if (!n) return;
    const DW = parseFloat(getComputedStyle(sec).getPropertyValue('--wf-w')) || 720;
    const DH = parseFloat(getComputedStyle(sec).getPropertyValue('--wf-h')) || 520;

    // scale the window to the column: never wider than the column, never taller than the room left
    const fitWindow = () => {
      const w = fit.clientWidth;
      const pad = 24 + 24 + 18;
      const room = stage.clientHeight - (head ? head.offsetHeight : 0) - (foot && foot.offsetHeight ? foot.offsetHeight + 16 : 0) - pad - 56;
      const wide = innerWidth >= 1024;
      const byH = wide ? room / DH : Infinity;
      const s = clamp(Math.min(w / DW, byH), 0.3, 1);
      sec.style.setProperty('--wf-scale', s.toFixed(4));
    };

    // wires: a curve from the window's right edge to each card's left edge
    const wireGroups = [];
    const drawWires = () => {
      if (!wires || getComputedStyle(wires).display === 'none') return;
      const box = grid.getBoundingClientRect();
      const w = win.getBoundingClientRect();
      wires.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      if (!wireGroups.length) {
        cards.forEach((_, i) => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('r', '3');
          g.append(p, c); wires.append(g); wireGroups[i] = { g, p, c };
        });
      }
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const sx = w.right - box.left - 6, sy = w.top - box.top + w.height * (0.22 + i * 0.11);
        const ex = r.left - box.left, ey = r.top - box.top + r.height / 2;
        const dx = Math.max(40, (ex - sx) * 0.55);
        wireGroups[i].p.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} C${(sx + dx).toFixed(1)} ${sy.toFixed(1)}, ${(ex - dx).toFixed(1)} ${ey.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`);
        wireGroups[i].c.setAttribute('cx', ex.toFixed(1));
        wireGroups[i].c.setAttribute('cy', ey.toFixed(1));
      });
    };

    let current = -1;
    const setActive = (i) => {
      if (i === current) return;
      current = i;
      const on = (el) => el.classList.toggle('is-active', Number(el.dataset.step) === i);
      screens.forEach(on); steps.forEach(on); cards.forEach(on); swaps.forEach(on);
      chips.forEach(on);
      wireGroups.forEach((g, k) => g.g.classList.toggle('is-active', k === i));
      const tab = screens[i].dataset.tab;
      tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
      const chip = chips[i];
      if (chip && chipsWrap && getComputedStyle(chipsWrap).display !== 'none') {
        chipsWrap.scrollTo({ left: chip.offsetLeft - 16, behavior: reduced ? 'auto' : 'smooth' });
      }
    };

    const travel = () => sec.getBoundingClientRect().height - stage.clientHeight;
    const progress = () => {
      const rect = sec.getBoundingClientRect();
      const total = travel();
      return total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
    };
    const indexAt = (p) => clamp(Math.floor(p * n), 0, n - 1);

    // click a step / chip: scroll to the middle of its band
    const goTo = (i) => {
      const top = sec.getBoundingClientRect().top + scrollY;
      const y = top + travel() * ((i + 0.5) / n);
      if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    };
    steps.forEach((li) => $('button', li).addEventListener('click', () => goTo(Number(li.dataset.step))));
    chips.forEach((c) => c.addEventListener('click', () => goTo(Number(c.dataset.step))));

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const rect = sec.getBoundingClientRect();
      if (rect.bottom < -innerHeight || rect.top > innerHeight * 2) return;
      const p = progress();
      setActive(indexAt(p));
      sec.classList.toggle('is-scrolled', p > 0.06);
    };

    const layout = () => { fitWindow(); requestAnimationFrame(drawWires); };
    layout();
    addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    setTimeout(layout, 600);
    setActive(0);
    raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     Instrument: the login-to-every-screen tour, playing while on screen
     ------------------------------------------------------------------ */
  function initInstrument() {
    const v = $('#tour-video');
    if (!v) return;
    const frame = $('#tour-frame'), toggle = $('#tour-toggle'), bar = $('#tour-progress');
    const step = $('#tour-step'), time = $('#tour-time');
    v.src = v.dataset.src;

    // what the tour is showing at each point, as a share of its length
    const STEPS = [
      [0, 'signing in'], [0.2, 'dashboard'], [0.3, 'teams'], [0.38, 'projects & tasks'], [0.46, 'attendance'],
      [0.54, 'payroll'], [0.66, 'tax forms'], [0.76, 'bank & subscription'], [0.88, 'state unemployment'], [0.96, 'back to dashboard'],
    ];
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let userPaused = false;

    v.addEventListener('timeupdate', () => {
      if (!v.duration) return;
      const p = v.currentTime / v.duration;
      if (bar) bar.style.width = `${(p * 100).toFixed(1)}%`;
      if (time) time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
      if (step) { const s = STEPS.filter(([at]) => p >= at).pop(); if (s && step.textContent !== s[1]) step.textContent = s[1]; }
    });
    v.addEventListener('loadedmetadata', () => { if (time) time.textContent = `0:00 / ${fmt(v.duration)}`; });

    const setPaused = (paused) => {
      userPaused = paused;
      frame?.classList.toggle('is-paused', paused);
      toggle?.setAttribute('aria-label', paused ? 'Play the tour' : 'Pause the tour');
      if (paused) v.pause(); else v.play().catch(() => {});
    };
    const onToggle = (e) => { e.preventDefault(); setPaused(!v.paused); };
    toggle?.addEventListener('click', onToggle);
    v.parentElement?.addEventListener('click', (e) => { if (e.target !== toggle && !toggle?.contains(e.target)) onToggle(e); });

    if (reduced) { setPaused(true); return; }
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!userPaused) v.play().catch(() => {}); } else v.pause();
    }, { rootMargin: '120px' }).observe(v);
  }

  /* ------------------------------------------------------------------
     Header tone: dark text while a light section sits under the bar
     ------------------------------------------------------------------ */
  function initHeaderTone() {
    const bars = [$('.site-header'), $('.io-link-wrap')].filter(Boolean);
    const light = $$('.hero, .on-paper');
    const veil = $('#hero-veil');
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = 40;
      // the hero counts as light only until its navy veil has faded in at the end of the pin
      const onLight = light.some((sec) => {
        const r = sec.getBoundingClientRect();
        if (!(r.top <= y && r.bottom > y)) return false;
        if (veil && sec.classList.contains('hero') && parseFloat(veil.style.opacity || '0') > 0.5) return false;
        return true;
      });
      const menuOpen = document.body.classList.contains('menu-open');
      bars.forEach((b) => b.classList.toggle('on-light', onLight && !menuOpen));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
    return update;
  }

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  function initMenu() {
    const btn = $('.menu-btn');
    const menu = $('#mobile-menu');
    if (!btn || !menu) return;
    const setOpen = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      document.body.style.overflow = open ? 'hidden' : '';
      document.body.classList.toggle('menu-open', open);
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      if (typeof headerTone === 'function') headerTone();
    };
    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    matchMedia('(min-width: 768px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ------------------------------------------------------------------
     Nav "Services" dropdown — desktop hover/click panel + mobile
     collapsible sub-list, both keyboard and outside-click aware.
     ------------------------------------------------------------------ */
  function initNavDropdown() {
    $$('.nav-drop').forEach((drop) => {
      const btn = $('.nav-drop__btn', drop);
      const panel = $('.nav-drop__panel', drop);
      if (!btn || !panel) return;
      let closeTimer = 0;
      const setOpen = (open) => {
        btn.setAttribute('aria-expanded', String(open));
        panel.classList.toggle('is-open', open);
      };
      btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
      drop.addEventListener('pointerenter', () => { clearTimeout(closeTimer); setOpen(true); });
      drop.addEventListener('pointerleave', () => { closeTimer = setTimeout(() => setOpen(false), 150); });
      drop.addEventListener('focusout', (e) => { if (!drop.contains(e.relatedTarget)) setOpen(false); });
      document.addEventListener('click', (e) => { if (!drop.contains(e.target)) setOpen(false); });
      addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); }
      });
    });
    $$('.mobile-menu__drop-btn').forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        panel.classList.toggle('is-open', open);
      });
    });
  }

  /* ------------------------------------------------------------------
     Magnetic wrapper (mouse only)
     ------------------------------------------------------------------ */
  function initMagnetic() {
    $$('.magnetic').forEach((m) => {
      const strength = 0.3;
      m.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || reduced) return;
        const r = m.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * strength;
        const dy = (e.clientY - (r.top + r.height / 2)) * strength;
        m.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      m.addEventListener('pointerleave', () => { m.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------
     Forms
     ------------------------------------------------------------------ */
  function initForms() {
    const form = $('#contact-form');
    if (form) {
      const textarea = form.elements.namedItem('message');
      const status = $('#contact-status');
      const submit = $('button[type="submit"]', form);
      const idle = status.textContent;

      $$('[data-chips="multi"] .chip', form).forEach((chip) => chip.addEventListener('click', () => {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      }));
      $$('[data-chips="single"] .chip', form).forEach((chip) => chip.addEventListener('click', () => {
        const was = chip.getAttribute('aria-pressed') === 'true';
        $$('[data-chips="single"] .chip', form).forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', String(!was));
      }));
      // "start with" chips: select the matching topic and seed the message if it is empty
      $$('[data-chips="prompt"] .chip', form).forEach((chip) => chip.addEventListener('click', () => {
        const topic = $$('[data-chips="multi"] .chip', form).find((c) => c.textContent.trim() === chip.dataset.topic);
        if (topic) topic.setAttribute('aria-pressed', 'true');
        if (textarea.value.trim().length === 0) textarea.value = chip.dataset.seed || '';
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (form.elements.namedItem('website').value) return; // honeypot
        if (!form.reportValidity()) return;
        const picked = (name) => $$(`[data-name="${name}"] .chip[aria-pressed="true"]`, form).map((c) => c.textContent.trim()).join(', ');
        const body = [
          `From: ${form.elements.namedItem('name').value}`,
          `Reply to: ${form.elements.namedItem('email').value}`,
          `Regarding: ${picked('regarding') || '—'}`,
          `Team size: ${picked('team') || '—'}`,
          '',
          textarea.value,
        ].join('\n');
        submit.disabled = true;
        submit.textContent = 'sending…';
        location.href = `mailto:hello@wagepress.com?subject=${encodeURIComponent('A payroll brief for WagePress')}&body=${encodeURIComponent(body)}`;
        setTimeout(() => {
          submit.disabled = false;
          submit.textContent = 'send it over';
          status.textContent = 'Your mail app is opening with the letter in it.';
          setTimeout(() => { status.textContent = idle; }, 6000);
        }, 1200);
      });
    }

    const news = $('#news-form');
    if (news) {
      news.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!news.reportValidity()) return;
        const btn = $('button', news);
        btn.disabled = true; btn.textContent = '…';
        setTimeout(() => {
          const done = document.createElement('p');
          done.className = 'footer__news-done';
          done.setAttribute('role', 'status');
          done.textContent = 'You are on the list. Nothing else lands in between.';
          news.replaceWith(done);
        }, 700);
      });
    }
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  // each module boots on its own so one failure can never lock the page behind the preloader
  let headerTone = null;
  const boot = (name, fn) => { try { return fn(); } catch (err) { console.error(`[wagepress] ${name} failed`, err); return null; } };
  boot('preloader', initPreloader);
  boot('smooth-scroll', initSmoothScroll);
  headerTone = boot('header-tone', initHeaderTone);
  boot('reveals', initReveals);
  boot('hero', () => initHero().catch((err) => { console.error('[wagepress] hero failed', err); $('#hero').dataset.webgl = 'no'; }));
  boot('placeholders', initPlaceholders);
  boot('work', initWork);
  boot('lab', initLab);
  boot('workflow', initWorkflow);
  boot('instrument', initInstrument);
  boot('menu', initMenu);
  boot('nav-dropdown', initNavDropdown);
  boot('magnetic', initMagnetic);
  boot('forms', initForms);
})();
