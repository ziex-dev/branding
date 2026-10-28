// Ziggy patrols the outside of an element (e.g. a code window): a quarter of the way up the
// left side, across the top, a quarter of the way down the right side, then turns around and
// comes back.
(function () {
  "use strict";

  // Ziggy's artboard is 379 × 316; the feet touch the ground around (171, 294).
  const ASPECT = 316 / 379;
  const FOOT_X = 0.45;
  const FOOT_Y = 0.93;

  const DEFAULTS = {
    svg: null, // rigged Ziggy <svg> (cloned, so a <template>'s content works)
    src: null, // or a URL to fetch ziggy-animated.svg from
    size: 88, // px, Ziggy's width
    speed: 60, // px per second along the edge
    hug: 0.09, // how far the feet sink past the edge, as a fraction of `size`
    sideReach: 0.25, // how far down each side Ziggy goes, as a fraction of the element's height
    stopChance: 0.7, // chance of stopping each time Ziggy crosses the top edge
    waveChance: 0.75, // chance a stop includes a wave
  };

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(signal.reason);
      });
    });

  // Only the near-side legs are drawn above the window; the rest of Ziggy stays behind it.
  const STYLE_ID = "ziggy-crawler-style";
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ".ziggy-crawler--front .ziggy-rig > :not(.ziggy-leg-near):not(.ziggy-leg-rear) { visibility: hidden; }";
    document.head.append(style);
  }

  class Crawler {
    constructor(target, options) {
      this.opts = { ...DEFAULTS, ...options };
      if (!this.opts.svg) throw new Error("ZiggyCrawler: options.svg or options.src is required");
      injectStyle();
      this.target = target;
      this.stage = target.parentElement;
      if (getComputedStyle(this.stage).position === "static") this.stage.style.position = "relative";
      this.stage.style.isolation = "isolate";
      if (getComputedStyle(target).position === "static") target.style.position = "relative";
      if (getComputedStyle(target).zIndex === "auto") target.style.zIndex = "1";

      const w = this.opts.size;
      const h = w * ASPECT;
      this.anchor = { x: w * FOOT_X, y: h * FOOT_Y };
      this.layers = [this.layer(0, "back"), this.layer(2, "front")];
      this.layers[0].el.addEventListener("click", () => this.wave());
      this.layers[1].el.addEventListener("click", () => this.wave());

      this.dir = 1; // 1: left side → top → right side; -1: back again
      this.facing = 1; // drawn direction, eased toward `dir` while turning around
      this.busy = null; // AbortController of the running stop or turn
      this.paused = false;
      this.visible = true;
      this.wasOnTop = true;
      this.stopAt = null;
      this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

      this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
      this.io.observe(this.stage);

      // Start a little way along the top edge.
      const path = this.path();
      this.s = path.topStart + path.topLen * (this.reduced ? 0.7 : 0.2);
      this.setPose(this.reduced ? [] : ["is-crawling"]);
      this.place();
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }

    layer(z, name) {
      const el = document.createElement("div");
      el.className = `ziggy-crawler ziggy-crawler--${name}`;
      if (name === "back") {
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Ziggy the Ziguana");
      } else {
        el.setAttribute("aria-hidden", "true");
      }
      Object.assign(el.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: `${this.opts.size}px`,
        height: `${this.opts.size * ASPECT}px`,
        transformOrigin: `${this.anchor.x}px ${this.anchor.y}px`,
        cursor: "pointer",
        zIndex: String(z),
        willChange: "transform",
      });
      const svg = this.opts.svg.cloneNode(true);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.display = "block";
      svg.style.overflow = "visible";
      el.append(svg);
      this.stage.append(el);
      return { el, svg };
    }

    // An open path: up the left side, round the top-left corner, across the top, round the
    // top-right corner, down the right side. Each side covers `sideReach` of the height.
    path() {
      const t = this.target;
      const x = t.offsetLeft;
      const y = t.offsetTop;
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const r = Math.min(parseFloat(getComputedStyle(t).borderTopLeftRadius) || 0, w / 2, h / 2);
      const side = Math.max(0, h * this.opts.sideReach - r);
      const arc = (Math.PI / 2) * r;
      const top = w - 2 * r;
      const corner = (cx, cy, deg) => {
        const rad = (deg * Math.PI) / 180;
        // Facing along the tangent: 90° ahead of the radius.
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), a: deg + 90 };
      };
      const segs = [
        { len: side, at: (d) => ({ x, y: y + r + side - d, a: 270 }) },
        { len: arc, at: (d) => corner(x + r, y + r, 180 + (d / arc) * 90) },
        { len: top, at: (d) => ({ x: x + r + d, y, a: 360 }), top: true },
        { len: arc, at: (d) => corner(x + w - r, y + r, -90 + (d / arc) * 90) },
        { len: side, at: (d) => ({ x: x + w, y: y + r + d, a: 90 }) },
      ];
      return { segs, total: segs.reduce((n, sg) => n + sg.len, 0), topStart: side + arc, topLen: top };
    }

    pointAt(s, path) {
      let d = Math.min(Math.max(s, 0), path.total);
      for (const sg of path.segs) {
        if (d <= sg.len) return { ...sg.at(d), top: !!sg.top };
        d -= sg.len;
      }
      const last = path.segs[path.segs.length - 1];
      return { ...last.at(last.len), top: false };
    }

    place() {
      const path = this.path();
      const p = this.pointAt(this.s, path);
      // Sink into the edge along Ziggy's own "down", so the feet tuck behind the window.
      const sink = this.opts.size * this.opts.hug;
      const rad = (p.a * Math.PI) / 180;
      const x = p.x - Math.sin(rad) * sink;
      const y = p.y + Math.cos(rad) * sink;
      const transform = `translate(${x - this.anchor.x}px, ${y - this.anchor.y}px) rotate(${p.a}deg) scaleX(${this.facing})`;
      for (const l of this.layers) l.el.style.transform = transform;
      return { p, path };
    }

    // loop 
    tick(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.reduced && !this.paused && !this.busy && this.visible) {
        this.s += this.opts.speed * dt * this.dir;
        const path = this.path();
        const onTop = this.pointAt(this.s, path).top;
        // Crossing onto the top edge: maybe plan a stop somewhere along it.
        if (onTop && !this.wasOnTop && Math.random() < this.opts.stopChance) {
          const f = 0.25 + Math.random() * 0.5;
          this.stopAt = path.topStart + path.topLen * (this.dir > 0 ? f : 1 - f);
        }
        this.wasOnTop = onTop;
        if (this.stopAt !== null && (this.dir > 0 ? this.s >= this.stopAt : this.s <= this.stopAt)) {
          this.s = this.stopAt;
          this.stopAt = null;
          this.greet(Math.random() < this.opts.waveChance);
        } else if (this.s >= path.total || this.s <= 0) {
          this.s = Math.min(Math.max(this.s, 0), path.total);
          this.turnAround();
        }
      }
      this.place();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }

    setPose(classes) {
      const cls = ["ziggy", ...classes].join(" ");
      for (const l of this.layers) l.svg.setAttribute("class", cls);
    }

    crawlPose() {
      return this.reduced || this.paused ? [] : ["is-crawling"];
    }

    async run(steps) {
      this.busy?.abort();
      const ctl = (this.busy = new AbortController());
      try {
        await steps(ctl.signal);
      } catch {
        return; // interrupted by a newer routine
      }
      this.busy = null;
      this.setPose(this.crawlPose());
    }

    // Stop, look at the viewer, maybe wave, then carry on.
    greet(wave) {
      return this.run(async (signal) => {
        this.setPose(["is-looking"]);
        await sleep(650, signal);
        if (wave) {
          this.setPose(["is-looking", "is-waving"]);
          await sleep(1650, signal);
          this.setPose(["is-looking"]);
        }
        await sleep(wave ? 500 : 1100, signal);
        this.setPose([]);
        await sleep(250, signal);
      });
    }

    // At the end of a side: pause, flip to face the other way, head back.
    turnAround() {
      return this.run(async (signal) => {
        this.setPose([]);
        await sleep(300, signal);
        this.setPose(["is-crawling"]);
        const from = this.facing;
        const to = -this.dir;
        const start = performance.now();
        const dur = 320;
        for (;;) {
          const k = Math.min(1, (performance.now() - start) / dur);
          this.facing = from + (to - from) * (0.5 - Math.cos(Math.PI * k) / 2);
          if (k === 1) break;
          await sleep(16, signal);
        }
        this.dir = to;
        this.wasOnTop = false;
      });
    }

    wave() {
      return this.greet(true);
    }
    look() {
      return this.greet(false);
    }
    pause() {
      this.paused = true;
      if (!this.busy) this.setPose([]);
    }
    resume() {
      this.paused = false;
      if (!this.busy) this.setPose(this.crawlPose());
    }
    set speed(v) {
      this.opts.speed = v;
    }
    destroy() {
      cancelAnimationFrame(this.frame);
      this.busy?.abort();
      this.io.disconnect();
      for (const l of this.layers) l.el.remove();
    }
  }

  const svgCache = new Map();
  function loadSvg(src) {
    if (!svgCache.has(src)) {
      svgCache.set(
        src,
        fetch(src)
          .then((r) => {
            if (!r.ok) throw new Error(`ZiggyCrawler: ${src}: HTTP ${r.status}`);
            return r.text();
          })
          .then((text) => document.importNode(new DOMParser().parseFromString(text, "image/svg+xml").documentElement, true)),
      );
    }
    return svgCache.get(src);
  }

  // Returns the crawler, or a promise of it when the SVG has to be fetched first.
  function attach(target, options = {}) {
    if (options.svg || !options.src) return new Crawler(target, options);
    return loadSvg(options.src).then((svg) => new Crawler(target, { ...options, svg }));
  }

  window.ZiggyCrawler = { attach };

  // Auto-attach from the script tag's data attributes.
  const script = document.currentScript;
  if (script && script.dataset.targets) {
    const ds = script.dataset;
    const opts = { src: ds.src || new URL("ziggy-animated.svg", script.src).href };
    for (const key of ["size", "speed", "hug", "sideReach", "stopChance", "waveChance"]) {
      if (ds[key] !== undefined) opts[key] = Number(ds[key]);
    }
    const start = () => {
      for (const el of document.querySelectorAll(ds.targets)) {
        Promise.resolve(attach(el, opts)).catch((err) => console.warn(err));
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
