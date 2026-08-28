//  Shell.swift — the whole iOS app.
//
//  TCG Manager Simulator is a Vite/React app. This file is the native shell around its built
//  `dist/` tree and nothing more: it hosts a WKWebView, serves the bundle over a custom URL
//  scheme, and does the things a web page cannot do for itself on iOS. There is deliberately no
//  framework here (no Capacitor, no CocoaPods) — the app needs a handful of native capabilities,
//  not a platform.
//
//  Ported from the poke-vendor / Sideline lineage (see ios/README.md). The reasoning below is
//  carried over from there; TCG-MANAGER-SIM notes mark what's different in this app.
//
//  What the shell exists to fix, in order of how much it matters:
//
//  1. ORIGIN. The save is a JSON blob in localStorage (see src/game/persistence.js) and storage is
//     keyed to origin. Loading with loadFileURL() gives an opaque file:// origin where WebKit's
//     storage behaviour is unreliable, so the page is served over a custom scheme instead (see
//     BundleSchemeHandler). WKWebView treats a registered custom scheme as a real, secure, STABLE
//     origin — saves survive app updates and window.isSecureContext stays true.
//  2. ZOOM. iOS Safari has ignored `user-scalable=no` since iOS 10 as an accessibility policy, so a
//     web page cannot stop double-tap and pinch zoom however it writes its viewport meta. In a
//     WKWebView the scroll view is ours, so it is pinned shut three ways below.
//  3. BOUNCE. Rubber-band overscroll, kept where a native app would have it (see the note).
//  4. HAPTICS bridge. TCG-MANAGER-SIM: nothing in the web app calls this yet — the game has no
//     navigator.vibrate call site today. It's wired up anyway because it's the natural fit for the
//     pack-rip moment (src/components/PackRipper.jsx) if that ever grows haptic feedback, and
//     because navigator.vibrate is not implemented AT ALL in iOS Safari/WKWebView, so a future call
//     site would silently do nothing without this bridge already in place.
//  5. FILE-SAVE bridge. TCG-MANAGER-SIM: also currently unused — there's no save-export feature in
//     the app today. Wired up for the same reason as haptics: `URL.createObjectURL` + `a.download`
//     is INERT in a WKWebView, so if a save-backup export is ever added, it needs this share-sheet
//     path from day one rather than discovering the bug later.
//
//  TCG-MANAGER-SIM: no ArtSchemeHandler here. The game draws every card as CSS/SVG (see
//  SetSymbol.jsx) — there is no remote card art to cache, so poke-vendor's image-caching scheme
//  handler and its URLCache setup are dropped rather than ported unused.

import UIKit
import WebKit
#if DEBUG
import Network
#endif

enum Shell {
    /// Registered with WKWebView as a custom scheme. Changing this string changes the page's origin,
    /// which orphans every save on every device that already has the app. Don't.
    static let scheme = "tcgmanager"
    static let pageURL = URL(string: "\(scheme)://local/index.html")!
    /// --bg from styles.css. Used for the window, the view and the web view so there is no white
    /// flash between the launch screen and the first paint.
    static let background = UIColor(red: 0x0a / 255.0, green: 0x0a / 255.0, blue: 0x0f / 255.0, alpha: 1)
}

// MARK: - Serving the bundle

/// Serves the built Vite app over `tcgmanager://`.
///
/// Answers a real tree: index.html, assets/*.js, assets/*.css and the favicon. Resolves any
/// bundled path, refuses anything escaping the bundle, and maps MIME by extension.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    /// BARE types, with no `; charset=` parameter on any of them.
    ///
    /// `URLResponse.mimeType` takes the type alone; the encoding belongs in `textEncodingName`.
    /// Passing "text/html; charset=utf-8" here does not fail — WebKit simply does not recognise it
    /// as HTML, falls back to plain text, and renders the whole app as a `<pre>` of its own source.
    /// The app still launches, still shows something, and is completely dead.
    private static let mimeTypes: [String: String] = [
        "html": "text/html",
        "js":   "text/javascript",
        "mjs":  "text/javascript",
        "css":  "text/css",
        "json": "application/json",
        "webmanifest": "application/manifest+json",
        "map":  "application/json",
        "svg":  "image/svg+xml",
        "png":  "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "webp": "image/webp", "ico": "image/x-icon", "gif": "image/gif",
        "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf",
    ]

    /// Text types need an encoding, and the page declares UTF-8. Handing it over here rather than
    /// letting WebKit guess keeps the em dashes and the emoji the UI leans on throughout.
    private static let textTypes: Set<String> = ["text/html", "text/javascript", "text/css",
                                                 "application/json", "application/manifest+json",
                                                 "image/svg+xml"]

    /// A task that has been stopped must not be messaged again — doing so throws an ObjC exception
    /// that takes the app with it. Serving is synchronous so this is belt-and-braces.
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("dist") else {
            return fail(task, id, "no dist in bundle")
        }

        var rel = task.request.url?.path ?? "/"
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        rel.removeFirst()

        let file = root.appendingPathComponent(rel).standardizedFileURL
        // Refuse anything that escapes the bundle, however it was spelled.
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file) else {
            return fail(task, id, "not found: \(rel)")
        }

        let mime = Self.mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = URLResponse(url: task.request.url!, mimeType: mime,
                                   expectedContentLength: data.count,
                                   textEncodingName: Self.textTypes.contains(mime) ? "utf-8" : nil)
        guard !stopped.contains(id) else { return }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private func fail(_ task: WKURLSchemeTask, _ id: ObjectIdentifier, _ why: String) {
        guard !stopped.contains(id) else { return }
        NSLog("[Shell] 404 \(why)")
        task.didFailWithError(NSError(domain: "TCGManagerSim", code: 404,
                                      userInfo: [NSLocalizedDescriptionKey: why]))
    }
}

// MARK: - The one view controller

final class ShellViewController: UIViewController {

    private var webView: WKWebView!
    #if DEBUG
    private var devBridge: DevBridge?
    #endif

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Shell.background

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: Shell.scheme)
        config.websiteDataStore = .default()          // persistent: this is where the save lives
        config.userContentController.add(self, name: "haptics")
        config.userContentController.add(self, name: "saveFile")
        // Tell the page it is running inside the shell, before any of its own script runs, so it
        // can prefer the native bridges over web fallbacks that don't work here. The gesture block
        // is the web half of (2): WebKit raises `gesturestart` for a pinch, and refusing it here
        // means the zoom lock does not rest solely on the scroll-view delegate below.
        config.userContentController.addUserScript(WKUserScript(
            source: """
                window.__TCG_MANAGER_NATIVE__ = true;
                document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
                """,
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false   // single-page app; swipe-back is wrong
        webView.isOpaque = false
        webView.backgroundColor = Shell.background
        webView.scrollView.backgroundColor = Shell.background

        // (2) Zoom, shut three ways: the scale clamp, refusing to nominate a view to zoom, and a
        // delegate that snaps back if anything still manages to move it.
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.delegate = self

        // (3) Rubber-band, but only where a native app would have it.
        //
        // Off is right in SAFARI, where the bounce exposes the browser behind the page; it is wrong
        // here, where this is a real UIScrollView over a background matching the page, so a bounce
        // exposes the app's own colour — and every native list on the platform bounces.
        // `alwaysBounceVertical` stays FALSE, which is the half worth keeping: a screen whose
        // content does not fill the frame should not wobble.
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = false
        // No automatic inset juggling — the page handles the safe area itself through
        // env(safe-area-inset-*) (see index.html's viewport-fit=cover and src/styles/index.css's
        // --gap/tabbar padding), which only reports correctly if the web view is edge to edge.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false

        webView.isInspectable = true   // Safari Web Inspector over USB (unconditional at iOS 18)

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        // Pinned to the view, NOT the safe area layout guide: edge to edge is what makes
        // viewport-fit=cover and the page's own env(safe-area-inset-*) padding work.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: Shell.pageURL))

        // Debug builds only. See DevBridge for why it exists and why it cannot ship.
        #if DEBUG
        devBridge = DevBridge(webView: webView)
        devBridge?.start()
        #endif
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}

// MARK: - Zoom refusal

extension ShellViewController: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if scrollView.zoomScale != 1 { scrollView.zoomScale = 1 }
    }
}

// MARK: - Navigation policy

extension ShellViewController: WKNavigationDelegate {
    /// The app never navigates away from itself. Anything that tries is a real outbound link, so it
    /// belongs in Safari rather than replacing the app with a page it can't come back from.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == Shell.scheme { return decisionHandler(.allow) }
        if url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    /// A failed load here is almost always the scheme handler, and the symptom (a blank dark
    /// screen) looks identical to a slow boot. Say so in the log rather than leaving it ambiguous.
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[Shell] navigation failed: \(error.localizedDescription)")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[Shell] provisional navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - The two bridges

extension ShellViewController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "haptics": fireHaptic(String(describing: message.body))
        case "saveFile": presentSaveSheet(message.body)
        default: break
        }
    }

    /// (4) Haptics. Fire-and-forget — nothing to hand back, so this stays the simple form. The web
    /// side would call e.g. `window.webkit.messageHandlers.haptics.postMessage('light')`.
    private func fireHaptic(_ kind: String) {
        switch kind {
        case "light":   UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium":  UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy":   UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "rigid":   UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        case "soft":    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case "select":  UISelectionFeedbackGenerator().selectionChanged()
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":   UINotificationFeedbackGenerator().notificationOccurred(.error)
        default: break
        }
    }

    /// (5) File save. `URL.createObjectURL` + `a.download` is INERT in a WKWebView. The page hands
    /// over {name, text} and gets the system share sheet, which can write to Files, Mail, AirDrop,
    /// anywhere.
    private func presentSaveSheet(_ body: Any) {
        guard let dict = body as? [String: Any],
              let name = dict["name"] as? String,
              let text = dict["text"] as? String else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(name.isEmpty ? "tcg-manager-sim-save.json" : name)
        guard (try? text.write(to: url, atomically: true, encoding: .utf8)) != nil else { return }

        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // Required on iPad, harmless on iPhone.
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY,
                                                                 width: 0, height: 0)
        present(sheet, animated: true)
    }
}

// MARK: - Dev bridge (debug builds only)

#if DEBUG
/// A loopback HTTP listener that runs JavaScript inside the live web view.
///
/// It exists for one reason. `simctl` can screenshot a booted simulator, but it cannot tap one. So
/// without a bridge there is no way to drive the shell from a script, and every change to how the
/// app FEELS has to be checked by hand on a device.
///
/// Three properties keep it out of the product:
///  1. `#if DEBUG` fences the whole section. Release archives carry no byte of it.
///  2. It binds 127.0.0.1 by name. Unreachable from another machine, and macOS raises no
///     "accept incoming connections" prompt.
///  3. It adds no JavaScript API and no user script. The page cannot detect it, so no app code can
///     come to depend on it — the same rule the two real bridges follow.
final class DevBridge {

    /// Fixed, so a driver script needs no discovery step.
    ///
    /// ⚠️ PICK A PORT NO OTHER SHELL ON THIS MACHINE USES, AND HAVE THE DRIVER CHECK `/ping`. A
    /// port collision between two shells built from this same lineage is a known, observed failure
    /// mode (poke-vendor's ios/README documents one) — the failure does not look like one: this
    /// process logs "listening", the driver gets clean 200s, and the JSON it gets back describes a
    /// completely different app. `/ping` names the bridge, and the driver MUST refuse to talk to a
    /// bridge that answers with someone else's name.
    static let port: UInt16 = 8792
    static let name = "tcgmanagersim"

    private var listener: NWListener?
    private weak var webView: WKWebView?

    init(webView: WKWebView) { self.webView = webView }

    func start() {
        guard let port = NWEndpoint.Port(rawValue: Self.port) else { return }
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: port)
        guard let listener = try? NWListener(using: params) else {
            NSLog("[DevBridge] port \(Self.port) is busy — bridge is off")
            return
        }
        listener.newConnectionHandler = { [weak self] conn in
            conn.start(queue: .main)
            self?.receive(conn, buffer: Data())
        }
        listener.start(queue: .main)
        self.listener = listener
        NSLog("[DevBridge] listening on http://127.0.0.1:\(Self.port)")
    }

    // MARK: Reading a request

    /// A body arrives in as many TCP chunks as the sender likes, so `Content-Length` is the only
    /// reliable end marker. Keep reading until the buffer holds the headers AND the whole body.
    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 22) { [weak self] chunk, _, done, error in
            guard let self else { return conn.cancel() }
            guard error == nil else { return conn.cancel() }

            var buf = buffer
            if let chunk { buf.append(chunk) }

            guard let (head, body) = Self.split(buf), body.count >= Self.contentLength(head) else {
                if done { conn.cancel() } else { self.receive(conn, buffer: buf) }
                return
            }
            self.handle(conn, head: head, body: Data(body.prefix(Self.contentLength(head))))
        }
    }

    /// Splits a raw request at the blank line. Returns the header block and the body that follows.
    private static func split(_ buf: Data) -> (String, Data)? {
        guard let r = buf.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        return (String(decoding: buf[..<r.lowerBound], as: UTF8.self), buf[r.upperBound...])
    }

    /// Swift counts CR LF as ONE Character (it is one extended grapheme cluster), so splitting on
    /// the Character "\n" matches nothing in a CRLF request. The stdlib split that takes a
    /// multi-character separator handles it correctly and needs iOS 16; this app targets 18.
    private static func headerLines(_ head: String) -> [String] {
        head.split(separator: "\r\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    }

    private static func contentLength(_ head: String) -> Int {
        for line in headerLines(head) {
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2, parts[0].lowercased() == "content-length" else { continue }
            return Int(parts[1].trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        }
        return 0
    }

    // MARK: Answering it

    private func handle(_ conn: NWConnection, head: String, body: Data) {
        let path = Self.headerLines(head).first?
            .split(separator: " ").dropFirst().first.map(String.init) ?? "/"

        // The driver checks this name before it trusts anything else on this port. See the note on
        // `port` — another app's bridge answering here is a real, observed failure mode.
        if path.hasPrefix("/ping") {
            return reply(conn, "{\"ok\":true,\"bridge\":\"\(Self.name)\",\"port\":\(Self.port)}")
        }
        // Hands back what the parser actually made of the request. The one tool that tells you
        // whether a null answer came from the JavaScript or from this file.
        if path.hasPrefix("/echo") {
            return reply(conn, "{\"ok\":true,\"bytes\":\(body.count),"
                + "\"length\":\(Self.contentLength(head)),"
                + "\"head\":\(Self.jsonString(head)),"
                + "\"body\":\(Self.jsonString(String(decoding: body, as: UTF8.self)))}")
        }
        guard path.hasPrefix("/eval") else {
            return reply(conn, #"{"ok":false,"error":"unknown path"}"#, status: "404 Not Found")
        }
        eval(String(decoding: body, as: UTF8.self)) { [weak self] json in
            self?.reply(conn, json)
        }
    }

    /// `callAsyncJavaScript` rather than `evaluateJavaScript`, so the caller can `await` — setting
    /// state and then waiting for React to re-render both matter. The wrapper returns ONE JSON
    /// string, so every value comes back on a single path and Swift maps no types at all.
    private func eval(_ js: String, done: @escaping (String) -> Void) {
        guard let webView else { return done(#"{"ok":false,"error":"no web view"}"#) }
        let wrapped = """
        try {
          const value = await (async () => { \(js)
          })();
          return JSON.stringify({ ok: true, value: value === undefined ? null : value });
        } catch (e) {
          return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
        }
        """
        webView.callAsyncJavaScript(wrapped, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value):
                // The wrapper always resolves to a JSON string. Anything else is a bug HERE, so say
                // so rather than reporting a successful null and sending the caller hunting in JS.
                done(value as? String
                     ?? "{\"ok\":false,\"error\":\(Self.jsonString("bridge returned \(type(of: value)): \(value)"))}")
            case .failure(let error):
                done("{\"ok\":false,\"error\":\(Self.jsonString(error.localizedDescription))}")
            }
        }
    }

    private func reply(_ conn: NWConnection, _ json: String, status: String = "200 OK") {
        let body = Data(json.utf8)
        let head = "HTTP/1.1 \(status)\r\n"
            + "Content-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\n"
            + "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }

    /// Quotes and escapes a string the way JSON needs. Only an error message goes through here.
    private static func jsonString(_ s: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [s]) else { return "\"\"" }
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }
}
#endif

// MARK: - Entry point

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = Shell.background
        window.rootViewController = ShellViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
