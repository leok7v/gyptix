import CoreHaptics

#if os(iOS)

enum Haptic {

    private static func start(_ engine: CHHapticEngine) -> CHHapticEngine {
        try! engine.start()
        return engine
    }
    
    private static let engine = start(try! CHHapticEngine())
    private static var player: CHHapticAdvancedPatternPlayer?

    public static func play(_ pattern: [CHHapticEvent],
                            _ start: TimeInterval) {
        if player != nil { return }
        try? player?.stop(atTime: 0)
        let p = try! CHHapticPattern(events: pattern, parameters: [])
        player = try! engine.makeAdvancedPlayer(with: p)
        player?.completionHandler = { (error: Error?) in Haptic.player = nil }
        try? player?.start(atTime: start)
    }
}

public func haptic(_ args: String) -> String {
    var events = [CHHapticEvent]()
    var start: TimeInterval = 0
/// Parse one or more haptic commands separated by `;`.
    let commands = args.split(separator: ";")
    for cmd in commands {
        var transient = true
        var intensity: Float = 0.1
        var sharpness: Float = 0.0
        var relative: TimeInterval = 0
        var duration: TimeInterval = 0
        var at: TimeInterval = 0
        let pairs = cmd.split(separator: ",")
        for pair in pairs {
            let parts = pair.split(separator: ":", maxSplits: 1)
                .map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count == 2 else { continue }
            let key = parts[0]
            let val = parts[1]
            switch key {
            case "transient": transient = Bool(val) ?? transient
            case "intensity": intensity = Float(val) ?? intensity
            case "sharpness": sharpness = Float(val) ?? sharpness
            case "relative": relative = TimeInterval(Float(val) ??
                                        Float(relative))
            case "duration": duration = TimeInterval(Float(val) ??
                                        Float(duration))
            case "at":
                at = TimeInterval(Float(val) ?? Float(at))
                if events.isEmpty { start = at }
            default: continue
            }
        }

        let type: CHHapticEvent.EventType = transient ? .hapticTransient :
                                                        .hapticContinuous
        let params = [
            CHHapticEventParameter(parameterID: .hapticIntensity,
                                   value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness,
                                   value: sharpness)
        ]
        let event = CHHapticEvent(
            eventType: type,
            parameters: params,
            relativeTime: relative,
            duration: transient ? 0 : duration
        )
        events.append(event)
    }

    guard !events.isEmpty else { return "" }
    Haptic.play(events, start)
    return ""
}

// Example test chaining multiple events
public func haptic_test() {
    DispatchQueue.main.asyncAfter(deadline: .now()) {
        let args = "transient:false,intensity:0.4,sharpness:0.1,duration:0.5;" +
                   "transient:true,intensity:0.8,sharpness:0.8,relative:0.5"
        _ = haptic(args)
    }
}

#else

public func haptic(_ _: String) -> String { return "" }
public func haptic_test() {}

#endif

/// Play events (transient or continuous), cancelling any previous one.
/// - Parameters:
///   - transient:  true = .hapticTransient, false = .hapticContinuous
///   - intensity:  0.0…1.0 amplitude
///   - sharpness:  0.0…1.0 timbre
///   - at:         when to start the player (seconds, engine time)
///   - relative:   when the event fires inside the pattern (seconds)
///   - duration:   length of a continuous event (seconds; ignored if transient)
///   transient a brief, impulse-like tap
///   sharpness 0.0 (round, organic) to 1.0 (sharp, crisp)
