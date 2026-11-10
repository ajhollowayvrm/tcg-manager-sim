import Foundation
import SimCore

/// App state that is not part of the simulation.
struct UIState: Codable, Equatable {
    var starterPromptDone = false
}

/// The file on disk: the world plus app state.
struct SaveFile: Codable {
    static let currentVersion = 1

    var version: Int
    var savedAt: Date
    var world: World
    var ui: UIState
}

enum SaveError: LocalizedError {
    case newerVersion

    var errorDescription: String? {
        switch self {
        case .newerVersion: "This save comes from a newer version of the game."
        }
    }
}

/// One save slot in Documents/Saves. The Files app can see this folder
/// (UIFileSharingEnabled), so a save can be copied out without iCloud.
///
/// Save safety:
/// - Each write is atomic: a crash cannot leave a half-written file.
/// - Before each write, the previous file is copied to a backup.
/// - "Start a new game" moves the old save to an archive. It never deletes it.
struct SaveManager {
    let directory: URL

    init(directory: URL = URL.documentsDirectory.appending(path: "Saves", directoryHint: .isDirectory)) {
        self.directory = directory
    }

    var mainURL: URL { directory.appending(path: "TCGManager-save.json") }
    var backupURL: URL { directory.appending(path: "TCGManager-backup.json") }

    private var files: FileManager { .default }

    func save(_ file: SaveFile) throws {
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try Self.encoder.encode(file)
        if files.fileExists(atPath: mainURL.path) {
            if files.fileExists(atPath: backupURL.path) {
                try files.removeItem(at: backupURL)
            }
            try files.copyItem(at: mainURL, to: backupURL)
        }
        try data.write(to: mainURL, options: .atomic)
    }

    /// Loads the main file. If the main file is damaged, loads the backup.
    func load() throws -> SaveFile? {
        guard files.fileExists(atPath: mainURL.path) else {
            return files.fileExists(atPath: backupURL.path) ? try Self.decode(Data(contentsOf: backupURL)) : nil
        }
        do {
            return try Self.decode(Data(contentsOf: mainURL))
        } catch {
            guard files.fileExists(atPath: backupURL.path) else { throw error }
            return try Self.decode(Data(contentsOf: backupURL))
        }
    }

    /// Moves the current save to a dated archive file.
    func archive() throws {
        guard files.fileExists(atPath: mainURL.path) else { return }
        let stamp = Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false))
            .replacingOccurrences(of: ":", with: "-")
        let archiveURL = directory.appending(path: "TCGManager-archive-\(stamp).json")
        try files.moveItem(at: mainURL, to: archiveURL)
        if files.fileExists(atPath: backupURL.path) {
            try files.removeItem(at: backupURL)
        }
    }

    /// Reads a save file. An old world is migrated to the current version first.
    static func decode(_ data: Data) throws -> SaveFile {
        var json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        if var world = json["world"] as? [String: Any],
           let version = world["version"] as? Int, version < World.currentVersion {
            try World.migrate(&world)
            json["world"] = world
        }
        let file = try decoder.decode(SaveFile.self, from: JSONSerialization.data(withJSONObject: json))
        if file.version > SaveFile.currentVersion || file.world.version > World.currentVersion {
            throw SaveError.newerVersion
        }
        return file
    }

    static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
