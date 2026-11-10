import XCTest

/// Drives the roster through the real UI.
///
/// The test takes screenshots only when the UI_SHOTS variable is set, because
/// screenshots make the run slower. Set the variable with the TEST_RUNNER_ prefix:
///   TEST_RUNNER_UI_SHOTS=all xcodebuild test ...      every screenshot
///   TEST_RUNNER_UI_SHOTS=20,21 xcodebuild test ...    only the screenshots whose names start with 20 or 21
/// Export the screenshots with:
///   xcrun xcresulttool export attachments --path <result>.xcresult --output-path shots/ui
final class RosterFlowUITests: XCTestCase {
    /// The screenshot name prefixes to take, from UI_SHOTS. Nil takes every screenshot.
    /// An empty list takes no screenshot.
    private static let shotPrefixes: [String]? = {
        let value = ProcessInfo.processInfo.environment["UI_SHOTS"] ?? ""
        if value == "all" { return nil }
        return value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }()

    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testNewGameMascotStarterAndRoster() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFreshStart", "-uiTestNoAnimations"]
        app.launch()

        // New game
        let studioName = app.textFields["Studio name"]
        XCTAssertTrue(studioName.waitForExistence(timeout: 5))
        studioName.tap()
        studioName.typeText("Garage Games")
        app.buttons["Create the mascot"].tap()

        // Mascot creator: kind, type, personality, colors, look, name (no role step, no relations step).
        // The mascot is a person (R14).
        XCTAssertTrue(app.staticTexts["Creature or person"].waitForExistence(timeout: 5))
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'A human character'")).firstMatch.tap()
        shot(app, "01-mascot-kind")
        app.buttons["Next"].tap()
        XCTAssertTrue(app.staticTexts["Type"].waitForExistence(timeout: 5))
        shot(app, "02-mascot-type")
        app.buttons["Next"].tap()
        shot(app, "03-mascot-personality")
        app.buttons["Next"].tap()
        shot(app, "04-mascot-colors")
        app.buttons["Next"].tap()
        app.buttons["Ponytail"].tap()
        app.buttons["Scarf"].tap()
        shot(app, "05-mascot-look")
        app.buttons["Next"].tap()
        let name = app.textFields["Name"]
        name.tap()
        name.typeText("Mara")
        shot(app, "06-mascot-name")
        app.buttons["Create the mascot"].tap()

        // Starter prompt
        XCTAssertTrue(app.staticTexts["Add a starter trio?"].waitForExistence(timeout: 5))
        shot(app, "07-starter-prompt")
        app.buttons["Create starter 1 of 3"].tap()
        // The starter stays a creature: the default kind.
        for _ in 0..<5 { app.buttons["Next"].tap() }
        app.buttons["Suggest a name"].tap()
        app.buttons["Next"].tap()
        XCTAssertTrue(app.staticTexts["Relations"].waitForExistence(timeout: 5))
        shot(app, "08-starter-relations")
        app.buttons["Create the starter"].tap()
        XCTAssertTrue(app.buttons["Skip for now"].waitForExistence(timeout: 5))
        app.buttons["Skip for now"].tap()

        // Roster
        XCTAssertTrue(app.navigationBars["Roster"].waitForExistence(timeout: 5))
        shot(app, "09-roster-two")

        // Studio: add generated characters, as a set commit will later
        app.tabBars.buttons["Studio"].tap()
        shot(app, "10-studio")
        let generate = app.buttons["Add generated characters"]
        for _ in 0..<3 where !generate.isHittable { app.swipeUp() }
        generate.tap()
        app.tabBars.buttons["Roster"].tap()
        shot(app, "11-roster-generated")

        // Detail of the mascot
        let mascotTile = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Mara'")).firstMatch
        XCTAssertTrue(mascotTile.waitForExistence(timeout: 5))
        mascotTile.tap()
        XCTAssertTrue(app.staticTexts["Appeal"].waitForExistence(timeout: 5))
        shot(app, "12-detail-top")
        app.swipeUp()
        shot(app, "13-detail-middle")
        app.swipeUp()
        shot(app, "14-detail-bottom")

        // Forms: there is no manual form button. A form arrives with a card (R26).
        XCTAssertFalse(app.buttons["Create a new form"].exists)
        XCTAssertTrue(app.staticTexts["Forms"].exists)

        // Sets: create a set, then design a card (cards.md).
        app.tabBars.buttons["Sets"].tap()
        XCTAssertTrue(app.buttons["Create a set"].waitForExistence(timeout: 5))
        app.buttons["Create a set"].tap()
        let setName = app.textFields["Set name"]
        XCTAssertTrue(setName.waitForExistence(timeout: 5))
        setName.tap()
        setName.typeText("Base Set")
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Theme'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Theme Fire"].waitForExistence(timeout: 5))
        shot(app, "17a-theme-library")
        let themeSearch = app.searchFields.firstMatch
        themeSearch.tap()
        themeSearch.typeText("Feud")
        let feudalism = app.buttons["Theme Feudalism"]
        XCTAssertTrue(feudalism.waitForExistence(timeout: 5))
        feudalism.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Feudalism'")).firstMatch.waitForExistence(timeout: 5))
        shot(app, "17-new-set")
        app.buttons["Create"].tap()
        XCTAssertTrue(app.buttons["Add a card"].waitForExistence(timeout: 5))
        app.buttons["Add a card"].tap()

        // Designer: subject, name, rarity, versions, art. The rarity tier sets the look (C15).
        let subject = app.buttons["Character Mara"]
        XCTAssertTrue(subject.waitForExistence(timeout: 5))
        subject.tap()
        shot(app, "18-designer-subject")
        app.buttons["Next"].tap()
        app.buttons["Add a title"].tap()
        let cardName = app.textFields["Card name"]
        cardName.tap()
        cardName.typeText("Destined Trainee")
        shot(app, "19-designer-name")
        app.buttons["Next"].tap()
        // One character at more than one rarity: each rarity adds a separate card (D1).
        app.buttons["Rarity Rare"].tap()
        app.buttons["Rarity Special Illustration Rare"].tap()
        shot(app, "20-designer-rarity")
        app.buttons["Next"].tap()
        // Versions: add a true alt art to the SIR card only (C16).
        XCTAssertTrue(app.buttons["Versions for Special Illustration Rare"].waitForExistence(timeout: 5))
        app.buttons["Add an alt art"].tap()
        XCTAssertTrue(app.buttons["Version Alt art"].waitForExistence(timeout: 5))
        shot(app, "21-designer-versions")
        app.buttons["Versions for Rare"].tap()
        XCTAssertTrue(app.buttons["Version Reverse holo"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Version Alt art"].exists)
        app.buttons["Next"].tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Feature '")).firstMatch.tap()
        shot(app, "22-designer-art")
        app.buttons["Add 2 cards"].tap()

        let cards = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Mara, Destined Trainee'"))
        XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(cards.count, 2)
        XCTAssertTrue(app.staticTexts["2 versions"].exists)
        shot(app, "23-set-with-card")

        // The set's ladder: each tier sets the look of its cards.
        app.buttons["Set options"].tap()
        app.buttons["Edit the rarity ladder"].tap()
        let sirTier = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Special Illustration Rare'")).firstMatch
        XCTAssertTrue(sirTier.waitForExistence(timeout: 5))
        shot(app, "24-set-ladder")
        sirTier.tap()
        XCTAssertTrue(app.navigationBars["Special Illustration Rare"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.switches["Textured surface"].waitForExistence(timeout: 5))
        shot(app, "25-tier-look")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Cancel"].tap()

        app.tabBars.buttons["Studio"].tap()
        app.swipeDown()
        app.swipeDown()

        // Studio: the rarity ladder presets.
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Rarity ladders'")).firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Rarity ladders"].waitForExistence(timeout: 5))
        shot(app, "26-ladder-presets")
    }

    @MainActor
    private func shot(_ app: XCUIApplication, _ name: String) {
        if let prefixes = Self.shotPrefixes, !prefixes.contains(where: { name.hasPrefix($0) }) { return }
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
