# TCG Manager on iPhone

A native iOS shell around the built web app. No Capacitor, no CocoaPods, no `www/` staging
directory. Ported from the poke-vendor / Sideline lineage, which solved the same problem.

Three files are the whole shell:

| File | What it is |
|---|---|
| `project.yml` | XcodeGen spec — the `.xcodeproj` is **generated**, never committed |
| `Sources/Shell.swift` | The entire app: a WKWebView, a URL-scheme handler, two JS bridges |
| `Resources/Assets.xcassets` | App icon + the launch-screen colour |

Target: **iPhone 17 Pro Max**, portrait, iOS 18+.

---

## Build and run

**Onto a connected iPhone, in one command:**

```sh
npm run ios:device     # build + sign + install + launch
```

**In the Simulator** (no physical device, no signing):

```sh
npm run ios:sim
```

Or open it in Xcode and ⌘R:

```sh
npm run ios:build      # vite build, THEN xcodegen generate
open ios/TCGManagerSim.xcodeproj
```

**Regenerate the app icon** after changing `public/icon.svg`:

```sh
npm run ios:icon
```

### Two things that will bite you

**`DEVELOPMENT_TEAM` is not the number in the identity's name.** The signing identity reads
`Apple Development: you@example.com (9Z2HDDXR94)` and that parenthetical is the *identity's* id,
not the team. Passing it gives:

```
error: No Account for Team "9Z2HDDXR94". Add a new account in Accounts settings…
```

…which reads like a missing Xcode account and is actually a wrong argument. The team is the
certificate's **OU** field. `ios:device` reads it for you:

```sh
security find-certificate -c "Apple Development: …" -p | openssl x509 -noout -subject
# subject=UID=…, CN=Apple Development: …, OU=2BY68WLT6R, O=…
#                                        ^^^^^^^^^^^^^ this one
```

**A free profile allows THREE sideloaded apps per device**, across every project you own — not
three per project. The fourth install fails with *"its integrity could not be verified"* and
`MIInstallerErrorDomain error 13`, which sounds like a signing problem and is not one. Delete an
app to make room — and note that removing an app deletes its **container**, and with it any save
not backed up to a cloud account.

**A free signature expires after 7 days.** The app then refuses to launch until you re-run
`npm run ios:device`. Saves survive that, because they belong to the container and the container
survives anything short of deleting the app. A paid account ($99/yr) removes both the 7-day
expiry and the 3-app cap.

**The 7 days run from when Apple issues the profile, not from when you install.** Xcode reuses a
cached profile while it is still valid, so a reinstall on day 5 inherits the 2 days that remain —
you cannot top the window up by installing again. `ios:device` handles this: when the signature has
less than 6 days left it moves the cached profile aside, which makes Xcode ask Apple for a new one,
and a new one is a full 7 days. The script prints the real expiry date when it finishes. If the
refresh fails it restores the cached profile and installs on the time that remains, rather than
leaving you with no profile at all.

**The refresh needs an Apple ID in Xcode → Settings → Accounts.** Without one the re-sign fails:

```
error: No Accounts: Add a new account in Accounts settings.
error: No profiles for 'com.ajholloway.tcgmanagersim' were found
```

The signing certificate in your keychain is not enough — it lasts a year, but it cannot mint a
profile on its own. An empty account list is silent until the cached profile expires, and then the
app is dead on the phone with no command-line way back. Check it with:

```sh
defaults read com.apple.dt.Xcode DVTDeveloperAccountManagerAppleIDLists
# "IDE.Identifiers.Prod" = ( ) ← empty means no account is signed in
```

**`npm run ios:build`, not `npm run ios:project`.** The shell bundles `dist/`, so **`npm run
build` must run first**. Xcode will happily archive a stale or missing `dist` without complaining.

**Set your own bundle ID before the first install.** `PRODUCT_BUNDLE_IDENTIFIER` is
`com.ajholloway.tcgmanagersim` in `project.yml`. It identifies the app's **container**, so changing
it after installing strands every save inside the old one.

**Web Inspector** is on (`isInspectable = true`): iPhone → Settings → Safari → Advanced → Web
Inspector, then Mac Safari → Develop → *[your iPhone]* → TCG Manager.

---

## Why a native shell instead of a plain PWA?

Four concrete problems a plain web app hits on iOS, all solved by owning the WKWebView:

1. **Pinch/double-tap zoom** — iOS Safari ignores `user-scalable=no`. In a WKWebView the app owns
   the scroll view and pins it shut.
2. **Storage origin stability** — `loadFileURL()` gives an opaque `file://` origin where
   localStorage/IndexedDB is unreliable. A custom scheme (`tcgmanager://`) gives a real, stable,
   secure origin so the save survives app updates and relaunches.
3. **Haptics** — `navigator.vibrate` is not implemented by iOS Safari/WKWebView at all. A native
   bridge (`Shell.swift`'s `haptics` message handler) translates JS vibration calls into
   `UIFeedbackGenerator`. Nothing calls it yet — see "What's not wired up" below.
4. **File downloads** — `a.download` is inert inside a WKWebView. A `saveFile` bridge routes a
   save-backup export through the iOS share sheet instead.

None of this needs Capacitor — it's one Swift file's worth of `WKURLSchemeHandler` +
`WKScriptMessageHandler` code.

## What's not wired up (yet)

This app has no remote card art (every card renders as CSS/SVG — see `SetSymbol.jsx`), so unlike
the poke-vendor lineage this shell has **no image-caching scheme handler** — there's nothing to
cache.

The **`saveFile` bridge is live**: `SettingsPanel.jsx` routes the save-backup export through it,
because `a.download` is inert inside a WKWebView. It is guarded by `window.__TCG_MANAGER_NATIVE__`,
so the browser build still uses a normal download.

The **`haptics` bridge is not called yet** — there is no `navigator.vibrate` call site in the app.
The natural fit is a pack rip in `PackRipper.jsx`. Call
`window.webkit.messageHandlers.haptics.postMessage(kind)` behind the same guard.

`ios:sim` is also the lean version of the pattern: the poke-vendor/Sideline lineage runs a full
per-screen tap-target/press-feedback audit against a `window.__PV__`-style test seam. This app
doesn't have that seam, so `ios:sim` just confirms the shell itself is sound (origin, secure
context, the native flag) rather than auditing every screen. Worth building if the app grows
enough screens that manual checking on-device gets slow.

## One Rule Not to Break

Don't change the custom URL scheme string (`tcgmanager`) once it's shipped — it's the page's
origin, and changing it orphans every save on every device that already has the app installed.
