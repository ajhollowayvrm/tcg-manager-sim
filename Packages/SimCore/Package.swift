// swift-tools-version: 6.0
import PackageDescription

// SimCore is the game simulation. It must not import SwiftUI or UIKit,
// so `swift test` runs it on the Mac without a simulator.
let package = Package(
    name: "SimCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "SimCore", targets: ["SimCore"]),
    ],
    targets: [
        .target(name: "SimCore"),
        .testTarget(name: "SimCoreTests", dependencies: ["SimCore"]),
    ]
)
