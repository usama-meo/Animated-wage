# WagePress — homepage

A single-page marketing homepage for WagePress, the payroll, time-tracking and tax e-filing platform. Plain HTML, CSS and JavaScript, no build step.

## Run it

Open `index.html` directly, or serve the folder:

```
npx serve .
```

Two libraries load from jsDelivr at runtime and are optional: `three` renders
the hero object and `lenis` smooths scrolling. Without network access the hero
falls back to a flat SVG of the same object and scrolling stays native.

## Structure

| File | What it holds |
| --- | --- |
| `index.html` | All page markup, section by section |
| `css/styles.css` | Design tokens, layout, reveal timings, keyframes |
| `js/main.js` | Preloader, WebGL hero, reveals, generated art, lab sketches, forms |
| `assets/` | Favicon, `logo-mark.svg` (the brand mark; the inline `#wp-mark` symbol at the top of `index.html` mirrors it) plus drop-in folders for real imagery |

## Sections in order

1. Preloader — isometric cube mark, counter 000 to 100 over 1.3s, lifts away. Shown once per browser session (clear session storage or open a new tab to see it again).
2. Hero — pinned for 250vh. "PAYROLL" behind a 19-cube impossible object. Scrolling pulls it apart, reveals it is only cubes, reforms them into a square frame, zooms through it and fades to navy.
3. What it does — sticky preview on the left, six product modules on the right (Run Payroll, Teams, Time Tracking, Tax Filing, Wallet, State Unemployment).
4. The forms shelf — seven form screens (1099-NEC, 1099-MISC, W-2, 941, 940, 1095-B, W-2PR), swipeable on mobile, grid on desktop.
5. Packages — bento grid on light background with six numbered cells (Payroll, Time tracking, Tax e-filing, Payments & wallet, Compliance, Support & migration).
6. The tools — four free calculators with live canvas sketches (Paystub, Form finder, Pay planner, Tax rates).
7. The e-file engine — green card with a live canvas, fill → review → e-file.
8. Contact — chip-driven brief with team-size chips. "Start with" chips select a topic and seed the message. Submit opens a prefilled email.
9. Footer — big wordmark, page links, newsletter with a done state, trust row (IRS e-file, SOC 2, SSL), legal.

## Motion system

All reveal timings mirror the reference:

| Class | Motion |
| --- | --- |
| `.lines` | each line rises from 112%, 0.9s, 0.12s apart |
| `.reveal` | fade + 28px rise, 0.9s |
| `.rise` | fade + 28px rise, 0.8s |
| `.stagger` / `.stagger-item` | fade + 24px rise, 0.7s, 0.08s apart |

Everything respects `prefers-reduced-motion`.

## Swapping in real imagery

Every image starts as generated placeholder art. Drop real files at these
paths and the page picks them up automatically, no code change needed:

- Module previews: `assets/work/01.mp4` … `06.mp4` recordings with `01.jpg` … `06.jpg` posters (see below)
- Tool previews: the four tool cards reuse the module recordings from `assets/work` — paystub → `01.mp4` (Run Payroll), form finder → `04.mp4` (Tax Filing), pay planner → `03.mp4` (Time Tracking), tax rates → `06.mp4` (State Unemployment), each with its matching `0N.jpg` poster. To swap one, change the `poster` / `data-src` on that card's `<video class="lab-reel__video">` in `index.html`; `assets/tools/` is no longer read. If a clip fails to load the frame keeps the poster as a still.

### Recording the module flows

The six previews are short screen recordings of the real business panel, `assets/work/01.mp4` … `06.mp4`, with `01.jpg` … `06.jpg` as posters. Re-record them any time with:

```
node tools/record-flows.mjs you@company.com yourpassword
```

It signs in with Chrome, clicks through each module with a visible cursor, and encodes MP4s with ffmpeg (needs Node 22+ and ffmpeg on PATH). Pass a fourth argument to re-record only some flows, for example `... https://dev-company.wagepress.com 01,04`. Edit the `FLOWS` list at the top of the script to change what each clip shows.

The e-file engine card plays `assets/work/tour.mp4`, a ~36s tour that signs in on camera and walks every screen of the panel. Re-record just that one with `... https://dev-company.wagepress.com tour`.

`tools/capture-app.mjs` does the same for still screenshots only.
- Form screens: `assets/apps/1099-nec.webp`, `1099-misc.webp`, `w-2.webp`, `941.webp`, `940.webp`, `1095-b.webp`, `w-2pr.webp` (600 × 1298, phone screenshots)

To point at different filenames, edit the `data-src` attributes in `index.html`.

## Changing brand text

Everything brand-specific is literal text in `index.html`. Search for:

- `wage<b>press</b>` — wordmark in header, preloader, footer (the `<b>` is the green half)
- `WagePress` — full name in titles, aria labels, copyright
- `hello@wagepress.com` — every mailto and the contact form target
- `dev-company.wagepress.com` — the sign-in and start-filing links; point them at production when ready

Colours and fonts live at the top of `css/styles.css` under `:root`.

## Placeholder content to replace before launch

- The four free tools in "The tools" section are described but not built; link them when they exist
- Social links in the footer point to `#`
- Packages page, Privacy Policy and Terms pages are not linked yet
- The contact form opens a mail client; wire it to the WagePress API if you want submissions stored
