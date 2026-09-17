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
    const observe = (selector, opts) => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, opts);
      $$(selector).forEach((el) => io.observe(el));
    };
    $$('.lines').forEach((el) => $$('.line > span', el).forEach((s, n) => { s.style.transitionDelay = `${(0.12 * n).toFixed(2)}s`; }));
    $$('.stagger').forEach((w) => $$('.stagger-item', w).forEach((el, i) => { el.style.transitionDelay = `${(0.08 * i).toFixed(2)}s`; }));
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
    const fitWord = (pair) => { word.style.fontSize = `${Math.min(20, 128 / (pair[0].length + pair[1].length)).toFixed(2)}vw`; };
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

  function screenDataURL(i, name) {
    const W = 600, H = 1298;
    const [c, x] = makeCanvas(W, H);
    const dark = i % 3 !== 1;
    const bg = dark ? C.ink : C.paper, fg = dark ? C.paper : C.ink;
    const soft = dark ? 'rgba(244,245,247,0.12)' : 'rgba(16,17,19,0.08)';
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = fg; x.font = '600 28px "Poppins", sans-serif';
    x.fillText('9:41', 48, 78);
    x.fillRect(W - 110, 56, 62, 26); x.fillStyle = bg; x.fillRect(W - 106, 60, 54, 18);
    x.fillStyle = fg; x.font = '600 64px "Manrope", sans-serif';
    x.fillText(name, 48, 220);
    x.font = '500 22px "Poppins", sans-serif';
    x.fillStyle = dark ? 'rgba(244,245,247,0.55)' : C.muted;
    x.fillText('TAX YEAR 2025 — DUE SOON', 48, 262);
    x.fillStyle = fg; x.font = '600 120px "Manrope", sans-serif';
    x.fillText('$' + (4 + i * 3) + 'k', 48, 460);
    x.fillStyle = C.accent; x.fillRect(48, 500, 120 + i * 30, 8);
    for (let k = 0; k < 4; k++) {
      const y = 580 + k * 150;
      x.fillStyle = soft; x.fillRect(48, y, W - 96, 118);
      x.fillStyle = fg; x.fillRect(72, y + 32, 180 - k * 20, 12);
      x.fillStyle = dark ? 'rgba(244,245,247,0.4)' : 'rgba(16,17,19,0.4)'; x.fillRect(72, y + 64, 260, 10);
    }
    x.fillStyle = soft; x.fillRect(0, H - 140, W, 140);
    for (let k = 0; k < 4; k++) {
      x.fillStyle = k === 0 ? C.accent : fg; x.globalAlpha = k === 0 ? 1 : 0.45;
      x.beginPath(); x.arc(110 + k * 127, H - 82, 12, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    return c.toDataURL('image/png');
  }

  function loadReal(img) {
    const src = img.dataset.src;
    if (!src) return;
    const probe = new Image();
    probe.onload = () => { img.src = src; };
    probe.src = src;
  }

  function initPlaceholders() {
    // module previews are real app recordings; fall back to generated art only if the poster is missing
    $$('#work-preview video, .work-item__cover video').forEach((v, i) => {
      v.src = v.dataset.src;
      const probe = new Image();
      probe.onerror = () => { v.poster = coverDataURL(i % 6); };
      probe.src = v.poster;
    });
    $$('.app-card').forEach((card, i) => {
      const img = $('img', card);
      img.src = screenDataURL(i, $('.app-card__name', card).textContent.trim());
      loadReal(img);
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
    $$('.work-item').forEach((it, i) => {
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
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = 40;
      const onLight = light.some((sec) => { const r = sec.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
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
  boot('instrument', initInstrument);
  boot('menu', initMenu);
  boot('magnetic', initMagnetic);
  boot('forms', initForms);
})();
