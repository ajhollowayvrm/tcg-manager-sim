import SwiftUI

@main
struct TCGManagerApp: App {
    @State private var store = GameStore(saves: Self.saveManager())

    init() {
        // UI tests pass `-uiTestNoAnimations` to make the run faster. Each test
        // step waits for the screen animations to stop. The real app keeps them.
        if ProcessInfo.processInfo.arguments.contains("-uiTestNoAnimations") {
            UIView.setAnimationsEnabled(false)
        }
    }

    /// UI tests pass `-uiTestFreshStart` to start from an empty save folder
    /// that is separate from the real save.
    private static func saveManager() -> SaveManager {
        guard ProcessInfo.processInfo.arguments.contains("-uiTestFreshStart") else { return SaveManager() }
        let directory = URL.temporaryDirectory.appending(path: "UITestSaves", directoryHint: .isDirectory)
        try? FileManager.default.removeItem(at: directory)
        return SaveManager(directory: directory)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(Theme.accent)
        }
    }
}
