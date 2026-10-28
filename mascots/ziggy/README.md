# Ziggy

Ziggy the Ziguana patrols the ziex.dev code windows: a quarter of the way up the left side, across the top, a quarter of the way down the right side, then back again. Ziggy hugs the edge, with the body tucked behind the window and the two near-side legs gripping over it, and stops now and then on the top edge to look at the viewer and wave.

Open [`demo.html`](./demo.html) in a browser to see it. It works straight from disk; no server needed.

| File | Notes |
|---|---|
| [`ziggy.svg`](./ziggy.svg) | Exact copy of the original |
| [`ziggy-animated.svg`](./ziggy-animated.svg) | Rigged version: same paths, wrapped in animatable groups, with a stylesheet |
| [`ziggy-crawler.js`](./ziggy-crawler.js) | Moves Ziggy along an element's top and sides and runs the look and wave stops |
| [`demo.html`](./demo.html) | Two code windows styled like the ziex.dev home page, each with its own Ziggy |

## Rig

`ziggy-animated.svg` animates from classes on its root `<svg>`:

- `is-crawling` makes the legs trot in diagonal pairs (plant, push back, lift, swing forward) and the body bob.
- `is-looking` makes Ziggy rear up slightly and turn the pupil to the viewer.
- `is-waving` raises the near front paw and waves; use it together with `is-looking`.

The eye blinks on its own. Under `prefers-reduced-motion`, everything stays still.

## Using it on the site

The site loads this folder from the `branding` dependency, which it serves under `/assets/branding/`. The script attaches itself from its tag's data attributes:

```html
<script src="/assets/branding/mascots/ziggy/ziggy-crawler.js" defer
        data-targets="#control-flow-tabs, .code-preview-example"
        data-src="/assets/branding/mascots/ziggy/ziggy-animated.svg"
        data-size="72"></script>
```

`data-src` defaults to `ziggy-animated.svg` next to the script. From your own code instead:

```js
const ziggy = await ZiggyCrawler.attach(el, { src: "/assets/branding/mascots/ziggy/ziggy-animated.svg" });
// or { svg: someTemplate.content.firstElementChild } with the SVG inline, as demo.html does
// ziggy.wave(), ziggy.look(), ziggy.pause(), ziggy.resume(), ziggy.speed = 80, ziggy.destroy()
```

Options (also as `data-*` attributes, e.g. `data-side-reach`):

- `size`: width in px, default 88.
- `speed`: px/s, default 60.
- `hug`: how far the feet sink past the edge, as a fraction of `size`, default 0.09.
- `sideReach`: how far down each side Ziggy goes, as a fraction of the window height, default 0.25.
- `stopChance`: chance of stopping each time Ziggy crosses the top, default 0.7.
- `waveChance`: chance a stop includes a wave, default 0.75.

Ziggy is drawn as two layers inside the window's parent. The whole of Ziggy sits behind the window, and a copy showing only the near-side legs sits in front of it, so the script gives the window `z-index: 1` and the parent `isolation: isolate`. The parent needs about Ziggy's height of free space above and beside the window. `.code-example` has `overflow: hidden`, so Ziggy can't live inside the window itself. The loop pauses while the window is off screen.

`demo.html` inlines `ziggy-animated.svg` in its `<template>` so it works from disk. After changing the SVG, paste it in again.

## License

Ziggy is from the official Zig mascots, <https://codeberg.org/ziglang/logo>, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `ziggy-animated.svg` adapts it: the artwork is unchanged, and grouping and animation were added.
