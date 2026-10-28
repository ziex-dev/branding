# Runner

[`runner.js`](./runner.js) makes Ziguana runners dash across the ziex.dev footer and some home page sections (`.performance`, `.deployment`, `.feature-examples`, `.benchmarks`). They taunt with a speech bubble, flee when chased, and react with a sound and an effect when clicked.

It moved here from the site's `app/assets/runner.js`. The site loads it from the `branding` dependency:

```html
<script src="/assets/branding/mascots/runner/runner.js" defer></script>
```

The styles (`.footer-runner*`) stay with the page in the site's `home.css`. The mascot image defaults to `/assets/mascot.svg`; set `data-mascot="…"` on the script tag to use a different one.
