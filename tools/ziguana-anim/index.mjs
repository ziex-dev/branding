// Builds the animated Ziguana from the static artwork.
// The art is one flat illustration (a single black silhouette backs every limb), so nothing
// is cut apart and rotated. The whole runner moves as one piece, and the motion comes from
// the parts that are separate on screen: trail, HUD, eye, dust and added speed streaks.
// Every cycle divides LOOP, so the result loops seamlessly (and can be exported as a GIF).
//
// usage: node tools/ziguana-anim/index.mjs [--in compressed/ziex-ziguana-cleaned.svg] [--out compressed/ziex-ziguana-animated.svg]
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const { values: opts } = parseArgs({
  options: {
    in: { type: "string", default: path.join(root, "compressed/ziex-ziguana-cleaned.svg") },
    out: { type: "string", default: path.join(root, "compressed/ziex-ziguana-animated.svg") },
  },
});

const LOOP = 4; // seconds
const STRIDE = LOOP / 8; // one footfall

const src = fs.readFileSync(opts.in, "utf8");
const defs = src
  .match(/<defs>([\s\S]*?)<\/defs>/)[1]
  .replace(/\s*<clipPath id="clip-artboard">[\s\S]*?<\/clipPath>/, "");
const art = src.slice(src.indexOf('<g id="artwork"'));
const el = art.match(/<(path|circle|rect|ellipse|line|polyline|polygon)\b[^>]*?\/>/g);
if (el.length !== 740) throw new Error(`expected 740 shapes, found ${el.length}; indices below need re-mapping`);

// Paint-order indices into `el`, found by rendering each shape in isolation.
const IDX = {
  trail: [0, 369], // streaks + browser-window icons, all behind the silhouette
  glyphSpeed: [370, 371],
  glyphHttp: [372, 372],
  glyphCode: [373, 373],
  visor: 395, // dark screen the face sits in
  z: 422,
  eye: [423, 426],
  pupil: 425,
  dots: [714, 717], // window buttons: ring, light, ring, light
  globeLon: [724, 725],
  url: 726,
  bars: [727, 734], // two side bars of four shapes each
};
const range = ([a, b]) => el.slice(a, b + 1).join("\n");
const d = (i) => el[i].match(/ d="([^"]+)"/)[1];

// --- speed streaks: fan out from behind the jetpack toward the lower left -------------
const STREAK_COLORS = ["#ef7f39", "#47b4ed", "#4ade80", "#79f6f8", "#f0a55d", "#3d90db"];
const rand = mulberry32(7);
const streaks = [];
for (let k = 0; k < 16; k++) {
  // t=0 is the top edge of the fan (steep), t=1 the bottom edge (nearly flat).
  const t = k / 15;
  const x1 = 255 + t * 50 + rand() * 16;
  const y1 = 135 + t * 190 + rand() * 10;
  const len = 230 - t * 70 + rand() * 50;
  const ang = (36 - t * 30 + rand() * 4) * (Math.PI / 180);
  const x2 = x1 - Math.cos(ang) * len;
  const y2 = y1 + Math.sin(ang) * len;
  const cx = (x1 + x2) / 2 + 6;
  const cy = (y1 + y2) / 2 - 4;
  const dur = [1, 0.8, 0.5, 2 / 3][k % 4];
  const w = (2.2 + rand() * 3).toFixed(1);
  streaks.push(
    `<path class="streak" pathLength="100" stroke="url(#streak-${k % STREAK_COLORS.length})" stroke-width="${w}" ` +
      `style="animation-duration:${dur}s;animation-delay:${(-rand() * dur).toFixed(2)}s" ` +
      `d="M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`,
  );
}
const streakDefs = STREAK_COLORS.map(
  (c, i) =>
    `<linearGradient id="streak-${i}" x1="320" x2="0" y1="0" y2="0" gradientUnits="userSpaceOnUse">` +
    `<stop stop-color="${c}" stop-opacity=".95"/><stop offset=".55" stop-color="${c}" stop-opacity=".55"/>` +
    `<stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`,
).join("\n");

// --- dust puffs kicked up behind each footfall; ground-fixed, outside the bobbing runner ---
// Each puff is a three-lobe cloud: ink outline underneath, then base, then a highlight,
// so it matches the cel-shaded dust in the artwork.
const FEET = [
  { x: 500, y: 426, at: 0 }, // front heel lands on even strides
  { x: 232, y: 430, at: STRIDE }, // rear foot pushes off on odd strides
];
const puffs = [];
for (const foot of FEET) {
  for (let k = 0; k < 3; k++) {
    const r = 7 + rand() * 5;
    const dx = -(40 + k * 18 + rand() * 24);
    const dy = -(8 + rand() * 16);
    const x = foot.x - k * 14 + rand() * 6;
    const y = foot.y - k * 3 - rand() * 4;
    const delay = foot.at + k * 0.06;
    const lobes = [
      [0, 0, r],
      [-0.85 * r, 0.3 * r, 0.7 * r],
      [0.8 * r, 0.35 * r, 0.6 * r],
    ];
    const circles = (grow, dx = 0, dy = 0, scale = 1) =>
      lobes
        .map(([lx, ly, lr]) => `<circle cx="${(x + lx + dx).toFixed(1)}" cy="${(y + ly + dy).toFixed(1)}" r="${(lr * scale + grow).toFixed(1)}"/>`)
        .join("");
    puffs.push(
      `<g class="puff" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;animation-delay:${delay.toFixed(2)}s">` +
        `<g fill="#1d1a16">${circles(1.6)}</g>` +
        `<g fill="#8d7d6b">${circles(0)}</g>` +
        `<g fill="#bfb096">${circles(0, -0.18 * r, -0.22 * r, 0.62)}</g>` +
        `</g>`,
    );
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-14 -14 679 480">
  <!--
    Ziex Ziguana, animated. Generated by tools/ziguana-anim/index.mjs; edit that, not this file.
    #runner bounces once per stride, the trail flutters, streaks and glyphs fly back,
    the HUD scans and blinks, the eye blinks, and dust puffs kick up at each footfall.
    Loop: ${LOOP}s.
  -->
  <style><![CDATA[
    #runner {
      transform-box: view-box;
      transform-origin: 420px 432px;
      animation: stride ${STRIDE}s cubic-bezier(.45,0,.55,1) infinite;
    }
    @keyframes stride {
      0%, 100% { transform: translateY(0) scale(1.006, .99); }
      45%      { transform: translateY(-7px) rotate(-.7deg) scale(.996, 1.006); }
    }

    #trail-body {
      transform-box: view-box;
      transform-origin: 330px 230px;
      animation: flutter ${STRIDE / 2}s ease-in-out infinite alternate;
    }
    @keyframes flutter {
      from { transform: scaleX(1) skewY(0deg); }
      to   { transform: scaleX(1.03) skewY(-.6deg); }
    }

    .streak {
      fill: none;
      stroke-linecap: round;
      stroke-dasharray: 34 140;
      animation: streak linear infinite;
    }
    @keyframes streak {
      from { stroke-dashoffset: 30; }
      to   { stroke-dashoffset: -110; }
    }

    .glyph { animation: glyph 2s cubic-bezier(.3,0,.7,1) infinite; }
    .glyph-http { animation-delay: -.7s; }
    .glyph-code { animation-delay: -1.4s; }
    @keyframes glyph {
      0%   { transform: translate(14px, -5px); opacity: 0; }
      20%  { opacity: 1; }
      75%  { opacity: 1; }
      100% { transform: translate(-22px, 8px); opacity: 0; }
    }

    #z-glow {
      filter: url(#glow);
      animation: z-glow 2s ease-in-out infinite;
    }
    @keyframes z-glow {
      0%, 100% { opacity: .25; }
      50%      { opacity: .85; }
    }
    #z-logo { animation: z-glitch ${LOOP}s steps(1) infinite; }
    @keyframes z-glitch {
      0%, 60%, 63%, 100% { transform: none; }
      61% { transform: translate(-2px, 1px); }
      62% { transform: translate(2px, -1px); }
    }

    #scan {
      mix-blend-mode: screen;
      animation: scan 2s cubic-bezier(.4,0,.6,1) infinite;
    }
    @keyframes scan {
      0%   { transform: translateY(0); opacity: 0; }
      10%  { opacity: 1; }
      70%  { transform: translateY(150px); opacity: 1; }
      71%, 100% { transform: translateY(150px); opacity: 0; }
    }

    #eye {
      transform-box: fill-box;
      transform-origin: 50% 50%;
      animation: blink ${LOOP}s ease-in-out infinite;
    }
    @keyframes blink {
      0%, 86%, 92%, 100% { transform: scaleY(1); }
      89% { transform: scaleY(.06); }
    }
    #pupil { animation: look ${LOOP}s ease-in-out infinite; }
    @keyframes look {
      0%, 30%, 62%, 100% { transform: translateX(0); }
      38%, 54% { transform: translateX(-4px); }
    }

    .led { animation: led 1s steps(1) infinite; }
    .led-2 { animation-delay: -.5s; }
    @keyframes led {
      0%   { fill: #4ade80; }
      50%  { fill: #184049; }
    }

    #globe-lon {
      transform-box: view-box;
      transform-origin: 609px 25px;
      animation: spin 2s linear infinite;
    }
    @keyframes spin {
      0%, 100% { transform: scaleX(1); }
      25%      { transform: scaleX(2.6); }
      50%      { transform: scaleX(1); }
      75%      { transform: scaleX(.15); }
    }

    #caret { animation: caret 1s steps(1) infinite; }
    @keyframes caret { 50% { opacity: 0; } }

    .bar   { animation: bar 1s ease-in-out infinite; }
    .bar-2 { animation-delay: -.5s; }
    @keyframes bar {
      0%, 100% { opacity: 1; }
      50%      { opacity: .45; }
    }

    .puff {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: 50% 80%;
      animation: puff ${STRIDE * 2}s cubic-bezier(.2,.7,.4,1) infinite;
    }
    @keyframes puff {
      0%   { transform: translate(0, 0) scale(.35); opacity: 0; }
      8%   { opacity: 1; }
      55%  { opacity: .9; }
      100% { transform: translate(var(--dx), var(--dy)) scale(1.35); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; }
    }
  ]]></style>

  <defs>
${defs.trimEnd()}
    ${streakDefs}
    <linearGradient id="scan-band" x1="0" x2="0" y1="0" y2="1">
      <stop stop-color="#79f6f8" stop-opacity="0"/>
      <stop offset=".8" stop-color="#79f6f8" stop-opacity=".22"/>
      <stop offset="1" stop-color="#adfffd" stop-opacity=".5"/>
    </linearGradient>
    <clipPath id="clip-visor">
      <path d="${d(IDX.visor)}"/>
    </clipPath>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
  </defs>

  <g id="runner">
    <!-- Speed trail -->
    <g id="trail">
      <g id="trail-body">
${range(IDX.trail)}
      </g>
      <g id="streaks">
${streaks.join("\n")}
      </g>
      <g class="glyph glyph-speed">
${range(IDX.glyphSpeed)}
      </g>
      <g class="glyph glyph-http">
${range(IDX.glyphHttp)}
      </g>
      <g class="glyph glyph-code">
${range(IDX.glyphCode)}
      </g>
    </g>

    <!-- Character -->
    <g id="character">
${el.slice(374, IDX.z).join("\n")}
      <path id="z-glow" fill="#4ade80" d="${d(IDX.z)}"/>
      <g id="z-logo">
${el[IDX.z]}
      </g>
      <g id="eye">
${el.slice(IDX.eye[0], IDX.pupil).join("\n")}
        <g id="pupil">
${el[IDX.pupil]}
        </g>
${el.slice(IDX.pupil + 1, IDX.eye[1] + 1).join("\n")}
      </g>
${el.slice(IDX.eye[1] + 1, IDX.dots[0]).join("\n")}
      <g id="hud-dots">
${el[IDX.dots[0]]}
${el[IDX.dots[0] + 1].replace("<path", '<path class="led"')}
${el[IDX.dots[0] + 2]}
${el[IDX.dots[0] + 3].replace("<path", '<path class="led led-2"')}
      </g>
${el.slice(IDX.dots[1] + 1, IDX.globeLon[0]).join("\n")}
      <g id="globe-lon">
${range(IDX.globeLon)}
      </g>
${el[IDX.url]}
      <rect id="caret" x="565.6" y="35.4" width="1.1" height="7" rx=".5" fill="#adfffd"/>
      <g class="bar">
${el.slice(IDX.bars[0], IDX.bars[0] + 4).join("\n")}
      </g>
      <g class="bar bar-2">
${el.slice(IDX.bars[0] + 4, IDX.bars[1] + 1).join("\n")}
      </g>
${el.slice(IDX.bars[1] + 1).join("\n")}
      <g clip-path="url(#clip-visor)">
        <rect id="scan" x="450" y="16" width="190" height="34" fill="url(#scan-band)"/>
      </g>
    </g>
  </g>


  <!-- Dust kicked up at each footfall -->
  <g id="dust-fx">
${puffs.join("\n")}
  </g>
</svg>
`;

fs.writeFileSync(opts.out, svg);
console.log(`wrote ${path.relative(root, opts.out)} (${(svg.length / 1024).toFixed(0)} KB)`);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
