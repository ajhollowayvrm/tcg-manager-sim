// Visit every tab crossed with every sub-tab, with the browser console
// attached, and fail if any panel throws or renders empty.
//
// WHY THIS EXISTS. There is no test runner, no linter and no typecheck in this
// repo, and vite compiles a free identifier without a word — so a component
// that reads an undefined variable builds green and then blanks the screen at
// runtime. That is not hypothetical: SetBuilder read `upgrades` without ever
// receiving it as a prop, threw a ReferenceError on every render, and since
// there is no error boundary anywhere React unmounted the whole root. The set
// builder was completely unreachable and every other check in the repo passed.
//
// playtest.mjs drives the reducer headlessly and is the only check on the
// SIMULATION. This is its counterpart for the UI: it proves the app renders.
// It is deliberately shallow — it does not assert what a panel says, only that
// it says something and does not throw — because that is exactly the class of
// bug nothing else here can see.
//
// Usage:  node tools/uisweep.mjs [port] [width] [height]
// Expects a build already served at that port, e.g.
//   npm run build && (cd dist && python3 -m http.server 4173) &
//   node tools/uisweep.mjs 4173
// Exits non-zero if anything threw or came up empty.

import { chromium } from 'playwright'

const PORT = process.argv[2] ?? '4173'
// A phone viewport by default: there is one layout at every width now, and the
// game is played on a phone.
const W = Number(process.argv[3] ?? 440)
const H = Number(process.argv[4] ?? 956)
// Below this a panel is treated as blank. A genuinely empty state still prints
// its own "nothing here yet" line, which clears this comfortably.
const MIN_CHARS = 25

const browser = await chromium.launch({
  // Preinstalled in this environment; playwright would otherwise download one.
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  hasTouch: W < 600,
  isMobile: W < 600,
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)) })

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// Onboarding: name the company and the game, then launch. Filling every input
// rather than naming them keeps this working when onboarding changes shape.
await page.locator('button').first().click()
for (const i of Array(await page.locator('input').count()).keys()) {
  try { await page.locator('input').nth(i).fill('Sweep Co') } catch { /* not a text field */ }
}
await page.locator('button').last().click()
await page.waitForTimeout(900)

let bad = 0
const tabs = await page.locator('.tabbar__btn').allTextContents()
if (!tabs.length) { console.error('No tab bar found — the shell did not render.'); process.exit(1) }

for (let t = 0; t < tabs.length; t++) {
  await page.locator('.tabbar__btn').nth(t).click()
  await page.waitForTimeout(350)
  const subs = await page.locator('.substabs__btn').allTextContents()
  const tabName = tabs[t].replace(/\s+/g, ' ').trim()
  for (let s = 0; s < Math.max(1, subs.length); s++) {
    const before = errors.length
    if (subs.length) {
      await page.locator('.substabs__btn').nth(s).click()
      await page.waitForTimeout(400)
    }
    // `main` rather than [role=tabpanel]: the tab panel and the sub-tab panel
    // are nested and both carry that role, so the strict locator resolves to
    // two and throws — which, caught, silently reads as "every panel is empty".
    const body = (await page.locator('main').first().innerText().catch(() => '')).trim()
    const threw = errors.length > before
    const empty = body.length < MIN_CHARS
    if (threw || empty) bad++
    const flag = threw ? '  <<< THREW' : empty ? '  <<< EMPTY' : ''
    console.log(`  ${tabName} > ${(subs[s] ?? '(none)').trim().padEnd(14)} ${String(body.length).padStart(5)} chars${flag}`)
    if (threw) console.log('      ' + errors[before].slice(0, 200))
  }
}

// The set builder is not a tab, so it needs its own visit — and it is the thing
// this sweep was written for.
console.log('\n  the set builder')
const before = errors.length
await page.locator('button', { hasText: /Design a Set/i }).first().click()
await page.waitForTimeout(900)
const chars = (await page.locator('.modal__sheet, .builder').first().innerText().catch(() => '')).trim().length
if (errors.length > before) {
  bad++
  console.log(`      THREW: ${errors[before].slice(0, 200)}`)
} else if (chars < MIN_CHARS) {
  bad++
  console.log('      <<< EMPTY')
} else {
  console.log(`      ${chars} chars, no errors`)
}

await browser.close()
console.log(`\n${bad ? `${bad} problem(s)` : 'every panel renders, nothing threw'}`)
process.exit(bad ? 1 : 0)
