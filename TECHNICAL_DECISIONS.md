# Technical Decisions

A breakdown of the key technical choices I made while building this app and why.

---

## Why Claude Haiku instead of Sonnet?

I originally used Claude Sonnet for screenshot analysis since it's the more capable model. But when I deployed to Vercel, Sonnet was taking 15-20 seconds to respond — and Vercel's Hobby plan has a **10-second function timeout**. The API calls were getting killed before Claude could finish.

I switched to Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) which responds in 2-4 seconds. For this use case — reading text from TikTok/Instagram screenshots — Haiku is more than accurate enough. The tradeoff of slightly less sophisticated reasoning doesn't matter when all I need is to extract a restaurant name, location, and cuisine from on-screen text.

**Takeaway:** Don't default to the most powerful model. Match the model to the task complexity and your infrastructure constraints.

---

## Why client-side image compression instead of `sharp`?

My first approach was using `sharp` on the server to resize and compress uploaded images before sending them to Claude. This worked perfectly locally but **completely broke on Vercel**.

The problem: `sharp` is a **native C module** that compiles platform-specific binaries. My MacBook compiled it for macOS/ARM, but Vercel's serverless functions run on Linux/x86. The binary just doesn't work across architectures.

I could have fought with Vercel's build system to get native modules working, but instead I moved compression entirely to the browser using the **Canvas API**:

```javascript
const canvas = document.createElement('canvas')
canvas.getContext('2d').drawImage(img, 0, 0, width, height)
canvas.toBlob(resolve, 'image/jpeg', 0.85)
```

This also solved a second problem I didn't even know I had yet: phone screenshots are 5-8MB, but Vercel has a **4.5MB request body limit** (`FUNCTION_PAYLOAD_TOO_LARGE`). By compressing on the client first, images arrive at ~200-400KB — well under the limit.

**Takeaway:** Client-side processing can be better than server-side when you're working with serverless constraints. The browser is a powerful compute environment — use it.

---

## Why hybrid storage (localStorage + Upstash Redis)?

I needed two things:
1. **Instant persistence** — refreshing the page shouldn't lose data
2. **Cross-device sync** — adding a restaurant on my laptop should show up on my phone

localStorage handles #1 perfectly — it's synchronous, always available, and survives page refreshes. But it's sandboxed per browser, so it can't do #2.

Upstash Redis handles #2 — it's a serverless key-value database accessible from any device. But it requires a network request, which can fail.

My solution: **write to both simultaneously, read from localStorage first then let the database override.**

```javascript
const persist = (list) => {
  localStorage.setItem('kfr_restaurants', JSON.stringify(list))  // instant
  fetch('/api/restaurants', { ... }).catch(() => {})              // async, can fail
}
```

On page load:
1. Read localStorage immediately (instant, no loading state)
2. Fetch from database in the background
3. If database has data, it overwrites localStorage (database is the source of truth)
4. If database fails, localStorage data is still there

This means the app works even if the database is completely down — it just won't sync across devices until it's back up.

**Takeaway:** Don't make your app depend entirely on a single storage mechanism. Layering fast local storage with slower cloud storage gives you resilience without sacrificing UX.

---

## Why I store the whole list as one database key

Instead of giving each restaurant its own key in Redis (`restaurant:1`, `restaurant:2`, etc.), I store the entire list under a single key (`kfr_restaurants`).

This is intentionally simple:
- The list will realistically be 10-100 restaurants — tiny by any database standard
- One `GET` fetches everything, one `SET` saves everything
- No need for query logic, indexing, or pagination
- The frontend already manages the list in memory as an array

If this were a multi-user app with thousands of restaurants, I'd obviously structure it differently. But for a personal tracker, the simplest approach that works is the best one.

**Takeaway:** Don't add complexity for scale you don't need. A personal app with <100 records doesn't need a relational database schema.

---

## Why I moved CSS from inline JSX to globals.css

I originally had a `<style>` tag directly in my JSX component. It worked locally but caused **React hydration errors** in production.

The issue: during server-side rendering, Next.js HTML-encodes certain characters inside `<style>` tags. Single quotes (`'`) became `&#x27;`, which made the server-rendered HTML different from what React generated on the client. React detected the mismatch and threw a hydration error.

Moving all CSS to `globals.css` eliminated the problem entirely — the CSS is loaded as a separate file, not embedded in the component HTML.

**Takeaway:** Keep CSS out of JSX `<style>` tags in SSR frameworks. Use CSS files, CSS modules, or CSS-in-JS libraries that handle SSR properly.

---

## Why `useEffect` for localStorage instead of `useState` initializer

My first attempt at loading saved data:

```javascript
// THIS CAUSES HYDRATION ERRORS
const [restaurants, setRestaurants] = useState(() => {
  const saved = localStorage.getItem('kfr_restaurants')
  return saved ? JSON.parse(saved) : SAMPLE
})
```

This runs during the initial render — including on the server where `localStorage` doesn't exist. Even with a `typeof window` check, the server renders with `SAMPLE` data while the client renders with localStorage data, causing a mismatch.

The fix: always initialize with `SAMPLE`, then load localStorage in a `useEffect` (which only runs on the client after hydration):

```javascript
const [restaurants, setRestaurants] = useState(SAMPLE)

useEffect(() => {
  const saved = localStorage.getItem('kfr_restaurants')
  if (saved) setRestaurants(JSON.parse(saved))
}, [])
```

This way, both server and client render the same initial HTML (with `SAMPLE`), and then the client swaps in the real data after mount.

**Takeaway:** In SSR frameworks, never access browser-only APIs (`localStorage`, `window`, `navigator`) during the initial render. Always defer to `useEffect`.

---

## Why a photo proxy endpoint instead of direct Google Places URLs

Google Places photo URLs require an API key as a query parameter. If I embedded these URLs directly in `<img>` tags, my API key would be exposed in the page source.

Instead, I created `/api/photo` which:
1. Takes a photo name as a query parameter
2. Fetches the image from Google with the API key on the server
3. Streams the response body back to the client

```javascript
const res = await fetch(`https://places.googleapis.com/v1/${name}/media?...&key=${key}`)
return new Response(res.body, { headers: { 'content-type': ... } })
```

The frontend just uses `/api/photo?name=places/xxx/photos/yyy` as the image source — no API key exposed.

**Takeaway:** Never expose API keys in client-side code. Use server-side proxies to keep secrets on the server.

---

## Why the dual-range price slider uses two overlapping inputs

HTML doesn't have a native dual-handle range slider. Libraries exist but I didn't want to add a dependency for one component.

My approach: two `<input type="range">` elements stacked on top of each other with `position: absolute`. The trick is CSS:

```css
.dual-range {
  pointer-events: none;     /* disable interaction on the track */
}
.dual-range::-webkit-slider-thumb {
  pointer-events: all;      /* but enable it on the thumb */
}
```

This way, only the thumbs are interactive — you can grab either one independently. A colored `<div>` between them shows the selected range.

**Takeaway:** You can build surprisingly capable UI components with native HTML elements and a bit of creative CSS. Not everything needs a library.

---

## Why the confidence system for AI detection

Claude doesn't always correctly identify a restaurant from a screenshot — maybe the video is blurry, the caption is vague, or there's no restaurant info at all. Instead of just showing success or failure, I have Claude return a `confidence` field:

- **high** → green banner: "Detected! Edit anything below if needed."
- **low** → orange banner: "Possible match — please double-check."
- **error** → red banner: "Couldn't read it — fill in below manually."

In all cases, the form fields are editable. The confidence system sets expectations without blocking the user. Even a low-confidence guess saves time — the user just needs to correct a few fields instead of typing everything from scratch.

**Takeaway:** When working with AI that can be wrong, design for graceful degradation. Show confidence levels, make outputs editable, and always provide a manual fallback.
