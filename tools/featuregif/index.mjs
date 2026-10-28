// Renders the ziex.dev home page feature canvases to looping GIFs for release notes.
// Time is virtualized, so every frame is deterministic regardless of machine speed.
//
// usage: node tools/featuregif/index.mjs --version 0.1.0 [--url http://localhost:3000/] [--out release/<version>]
//          [--fps 15] [--dpr 1.6] [--width 800] [--height 480] [--bg "#0d1117"] [ids...]
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import gifenc from "gifenc";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const root = path.resolve(import.meta.dirname, "../..");

const { values: opts, positionals: only } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string", default: "http://localhost:3000/" },
    out: { type: "string" },
    fps: { type: "string", default: "15" },
    dpr: { type: "string", default: "1.6" },
    width: { type: "string", default: "800" },
    height: { type: "string", default: "480" },
    // GitHub dark mode background.
    bg: { type: "string", default: "#0d1117" },
    version: { type: "string" },
  },
});
if (!opts.version) {
  console.error("--version is required, e.g. --version 0.1.0");
  process.exit(1);
}
opts.out ??= path.join(root, "release", opts.version);
const fps = Number(opts.fps);

// Loop length (s) per scene, matched to each scene's beat cycle in ziex site/app/scripts/feature_canvas.ts.
const SCENES = {
  performance: 4.8,
  routing: 15.6,
  "api-routes": 9.6,
  "control-flow": 10.8,
  hybrid: 9.0,
  tooling: 7.0,
  deploy: 8.4,
  memory: 6.4,
};
const CSS_W = Number(opts.width);
const CSS_H = Number(opts.height);
const BG = opts.bg;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: Number(opts.dpr) });

// The site backdrop vignettes to its own page color; retint it so the edges blend into BG.
await page.addInitScript((bg) => {
  const n = parseInt(bg.slice(1), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  const addColorStop = CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop = function (offset, color) {
    return addColorStop.call(this, offset, String(color).replace("rgba(10, 10, 10,", `rgba(${rgb},`));
  };
}, BG);

await page.addInitScript(() => {
  let now = 0;
  let queue = [];
  performance.now = () => now;
  window.__requested = 0;
  window.requestAnimationFrame = (cb) => {
    window.__requested++;
    return queue.push(cb);
  };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => {
    now += ms;
    const q = queue;
    queue = [];
    q.forEach((cb) => cb(now));
  };
});

// Show the release version instead of the local dev build's.
await page.route(opts.url, async (route) => {
  const res = await route.fetch();
  const body = (await res.text()).replace(/"version":"[^"]*"/, `"version":"${opts.version}"`);
  await route.fulfill({ response: res, body });
});

await page.goto(opts.url, { waitUntil: "networkidle" });
await page.waitForSelector(".feature-canvas");
fs.mkdirSync(opts.out, { recursive: true });

for (const [id, dur] of Object.entries(SCENES)) {
  if (only.length && !only.includes(id)) continue;

  // Hide every canvas so the observers stop all loops, including any visible at load.
  await page.evaluate(() => document.querySelectorAll(".feature-canvas").forEach((c) => (c.style.display = "none")));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__step(0));

  // Pin the target canvas at a fixed size.
  await page.evaluate(
    ({ id, w, h }) => {
      const c = document.querySelector(`.feature-canvas[data-feature="${id}"]`);
      Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: w + "px", height: h + "px", zIndex: 99999, display: "block" });
      window.__requested = 0;
      window.dispatchEvent(new Event("resize"));
    },
    { id, w: CSS_W, h: CSS_H },
  );
  // Wait for the observer to restart the loop, so t=0 is the first captured tick.
  // Interval polling, since requestAnimationFrame is virtualized.
  await page.waitForFunction(() => window.__requested > 0, null, { polling: 50 });
  await page.evaluate(() => window.__step(0));

  const frames = [];
  let width = 0;
  let height = 0;
  for (let i = 0, n = Math.round(dur * fps); i < n; i++) {
    const f = await page.evaluate(
      ({ id, ms, bg }) => {
        window.__step(ms);
        const c = document.querySelector(`.feature-canvas[data-feature="${id}"]`);
        const o = document.createElement("canvas");
        o.width = c.width;
        o.height = c.height;
        const ctx = o.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, o.width, o.height);
        ctx.drawImage(c, 0, 0);
        const px = ctx.getImageData(0, 0, o.width, o.height).data;
        let s = "";
        for (let j = 0; j < px.length; j += 0x8000) s += String.fromCharCode.apply(null, px.subarray(j, j + 0x8000));
        return { w: o.width, h: o.height, data: btoa(s) };
      },
      { id, ms: 1000 / fps, bg: BG },
    );
    width = f.w;
    height = f.h;
    frames.push(new Uint8Array(Buffer.from(f.data, "base64")));
  }

  await page.evaluate(() => document.querySelectorAll(".feature-canvas").forEach((c) => c.removeAttribute("style")));

  const out = path.join(opts.out, `${id}.gif`);
  fs.writeFileSync(out, encode(frames, width, height));
  console.log(`${path.relative(root, out)}: ${width}x${height}, ${frames.length} frames, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

await browser.close();

// One palette for the whole loop, ordered dithering, and unchanged pixels written as transparent.
function encode(frames, width, height) {
  const step = Math.max(1, Math.floor(frames.length / 24));
  const sample = frames.filter((_, i) => i % step === 0);
  const joined = new Uint8Array(sample.length * frames[0].length);
  sample.forEach((d, i) => joined.set(d, i * d.length));
  const palette = quantize(joined, 255, { format: "rgb565" });
  // Snap the closest entry to BG exactly so the GIF edges are seamless against the page.
  const n = parseInt(BG.slice(1), 16);
  const bg = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dist = (c) => (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2;
  palette[palette.reduce((best, c, i) => (dist(c) < dist(palette[best]) ? i : best), 0)] = bg;
  const transparentIndex = palette.length;
  const full = [...palette, [255, 0, 255]];

  // Deterministic per pixel, so static regions stay identical across frames and diff away.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 6);
  const dither = (data) => {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const d = BAYER[(y & 3) * 4 + (x & 3)];
        out[i] = data[i] + d;
        out[i + 1] = data[i + 1] + d;
        out[i + 2] = data[i + 2] + d;
        out[i + 3] = 255;
      }
    }
    return out;
  };

  const gif = GIFEncoder();
  let prev = null;
  for (const f of frames) {
    const idx = applyPalette(dither(f), palette, "rgb565");
    const frame = prev ? idx.map((v, i) => (v === prev[i] ? transparentIndex : v)) : idx;
    gif.writeFrame(frame, width, height, {
      palette: full,
      delay: Math.round(1000 / fps),
      transparent: !!prev,
      transparentIndex,
      dispose: 1,
      repeat: 0,
    });
    prev = idx;
  }
  gif.finish();
  return gif.bytes();
}
