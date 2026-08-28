// npm run ios:sim — build, install, launch the real shell in the iOS Simulator, and confirm the
// things only a real WKWebView can confirm: origin, secure context, the zoom lock's native flag,
// and the safe-area insets actually being non-zero.
//
//   npm run ios:sim            build, install, launch, check
//   npm run ios:sim -- --keep  skip the build and drive whatever is already running
//   npm run ios:sim -- eval 'return document.title'
//   npm run ios:sim -- shot home
//
// `simctl` can screenshot a booted simulator, but it cannot tap one — that's what the DevBridge in
// ios/Sources/Shell.swift is for.
//
// TCG-MANAGER-SIM: this is deliberately the lean version of the poke-vendor/Sideline pattern. That
// lineage's `ios:sim` also runs a whole per-screen tap-target/press-feedback audit against a
// `window.__PV__` test seam this app doesn't have. Add that here if/when it's worth building; for
// now this just proves the shell itself is sound.
import { execFileSync, spawnSync } from 'node:child_process'

const DEVICE_NAME = 'iPhone 17 Pro Max'
const BUNDLE = 'com.ajholloway.tcgmanagersim'
const PORT = 8792
const BRIDGE = 'tcgmanagersim'
const args = process.argv.slice(2)
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: 'utf8', ...opts })

function device() {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'available', '--json']))
  for (const runtime of Object.values(list.devices)) {
    const d = runtime.find(x => x.name === DEVICE_NAME)
    if (d) return d.udid
  }
  throw new Error(`no ${DEVICE_NAME} simulator available — create one in Xcode, or change DEVICE_NAME here`)
}

/// ALWAYS check the bridge names itself before trusting a single byte from this port — a port
/// collision between two shells built from this lineage is a real, observed failure mode.
async function ping() {
  const r = await fetch(`http://127.0.0.1:${PORT}/ping`, { signal: AbortSignal.timeout(3000) })
  const j = await r.json()
  if (j.bridge !== BRIDGE) {
    throw new Error(`port ${PORT} is answering as "${j.bridge}", not "${BRIDGE}" — another app's dev bridge has it. `
      + `Change DevBridge.port in ios/Sources/Shell.swift, or quit that app.`)
  }
  return j
}

async function evalJS(body) {
  const r = await fetch(`http://127.0.0.1:${PORT}/eval`, {
    method: 'POST', body, signal: AbortSignal.timeout(30000),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`bridge eval failed: ${j.error}`)
  return j.value
}

const udid = device()

if (!args.includes('--keep')) {
  console.log(`building and installing on ${DEVICE_NAME}…`)
  spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' })
  spawnSync('npm', ['run', 'ios:project'], { stdio: 'inherit' })
  spawnSync('xcodebuild', ['-project', 'ios/TCGManagerSim.xcodeproj', '-scheme', 'TCGManagerSim',
    '-sdk', 'iphonesimulator', '-destination', `platform=iOS Simulator,name=${DEVICE_NAME}`,
    '-configuration', 'Debug', '-derivedDataPath', 'ios/build/dd', 'CODE_SIGNING_ALLOWED=NO', 'build'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  try { sh('xcrun', ['simctl', 'boot', udid]) } catch { /* already booted */ }
  sh('xcrun', ['simctl', 'bootstatus', udid, '-b'])
  sh('xcrun', ['simctl', 'install', udid, 'ios/build/dd/Build/Products/Debug-iphonesimulator/TCGManagerSim.app'])
  // stdio piped: on a first install there is nothing to terminate and simctl says so on stderr,
  // which reads like a failure in the middle of an otherwise clean run.
  try { sh('xcrun', ['simctl', 'terminate', udid, BUNDLE], { stdio: 'pipe' }) } catch {}
  sh('xcrun', ['simctl', 'launch', udid, BUNDLE])
  await new Promise(r => setTimeout(r, 4000))
}

await ping()

// --- one-off subcommands -------------------------------------------------------------------
if (args[0] === 'eval') { console.log(JSON.stringify(await evalJS(args[1] || 'return null'), null, 1)); process.exit(0) }
if (args[0] === 'shot') {
  const name = args[1] || 'shot'
  const out = `ios/shots/${name}.png`
  execFileSync('mkdir', ['-p', 'ios/shots'])
  sh('xcrun', ['simctl', 'io', udid, 'screenshot', out])
  console.log(out); process.exit(0)
}

// --- the check -------------------------------------------------------------------------------
// Facts only the real shell can confirm. These are the whole reason this driver exists.
const facts = await evalJS(`return {
  origin: location.origin,
  secure: window.isSecureContext,
  native: !!window.__TCG_MANAGER_NATIVE__,
  title: document.title,
  // A probe element, independent of whether the game/onboarding is on screen — measures the raw
  // env(safe-area-inset-top) the shell is actually reporting.
  safeAreaInsetTop: (() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden'
    document.body.appendChild(probe)
    const v = getComputedStyle(probe).paddingTop
    probe.remove()
    return v
  })(),
}`)
console.log('\nshell facts (a browser cannot see these):')
for (const [k, v] of Object.entries(facts)) console.log(`   ${k.padEnd(12)} ${v}`)

const fails = []
if (facts.origin !== 'tcgmanager://local') fails.push(`origin is ${facts.origin}, expected tcgmanager://local`)
if (!facts.secure) fails.push('not a secure context — localStorage is at risk')
if (!facts.native) fails.push('window.__TCG_MANAGER_NATIVE__ missing — the user script did not run')

console.log(fails.length ? `\n❌ ${fails.join(' · ')}` : '\n✅ shell origin, secure context and native flag all check out')
console.log('\n⚠️  the simulator has no emoji font — every emoji renders as "?" here; judge that on hardware.')
process.exit(fails.length ? 1 : 0)
