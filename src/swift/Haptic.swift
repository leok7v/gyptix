import CoreHaptics

#if os(iOS)

enum Haptic {

    private static func start(_ e: CHHapticEngine) -> CHHapticEngine {
                              try! e.start(); return e }
    private static let engine = start(try! CHHapticEngine())
    private static var player: CHHapticPatternPlayer?
    /// Play a single haptic event (transient or continuous), cancelling any previous one.
    /// - Parameters:
    ///   - transient:  true = .hapticTransient, false = .hapticContinuous
    ///   - intensity:  0.0…1.0 amplitude
    ///   - sharpness:  0.0…1.0 timbre
    ///   - at:         when to start the player (seconds, engine time)
    ///   - relative:   when the event fires inside the pattern (seconds)
    ///   - duration:   length of a continuous event (seconds; ignored if transient)
    ///   transient a brief, impulse-like tap
    ///   sharpness 0.0 (round, organic) to 1.0 (sharp, crisp)
    public static func play(
        transient: Bool = true,
        intensity: Float = 0.1,
        sharpness: Float = 0.0,
        at:        Float = 0, // seconds
        relative:  Float = 0,
        duration:  Float = 0
    ) {
        try? player?.stop(atTime: 0) // stop any in-flight pattern immediately
        let type: CHHapticEvent.EventType = transient ? .hapticTransient :
                                                        .hapticContinuous
        let params = [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
        ]
        let event: CHHapticEvent = {
            if transient {
                return CHHapticEvent(
                    eventType: type,
                    parameters: params,
                    relativeTime: TimeInterval(relative)
                )
            } else {
                return CHHapticEvent(
                    eventType: type,
                    parameters: params,
                    relativeTime: TimeInterval(relative),
                    duration: TimeInterval(duration)
                )
            }
        }()
        let pattern = try! CHHapticPattern(events: [event], parameters: [])
        player = try! engine.makePlayer(with: pattern)
        try? player?.start(atTime: TimeInterval(at))
        print("haptic")
    }
}


func haptic(_ args: String) -> String {
    var transient = true
    var intensity: Float = 0.1
    var sharpness: Float = 0.0
    var at: Float = 0
    var relative: Float = 0
    var duration: Float = 0
    for pair in args.split(separator: ",") {
        let parts = pair.split(separator: ":", maxSplits: 1)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2 else { continue }
        switch parts[0] {
        case "transient": transient = Bool(parts[1]) ?? transient
        case "intensity": intensity = Float(parts[1]) ?? intensity
        case "sharpness": sharpness = Float(parts[1]) ?? sharpness
        case "at": at = Float(parts[1]) ?? at
        case "relative": relative = Float(parts[1]) ?? relative
        case "duration": duration = Float(parts[1]) ?? duration
        default: continue
        }
    }
    Haptic.play(
        transient: transient,
        intensity: intensity,
        sharpness: sharpness,
        at: at,
        relative: relative,
        duration: duration
    )
    return ""
}

public func haptic_test() {
    DispatchQueue.main.asyncAfter(deadline: .now()) {
        _ = haptic("transient:true,intensity:0.05,sharpness:0.0")
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
        _ = haptic("transient:true,intensity:0.5,sharpness:0.5")
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
        _ = haptic("transient:false,intensity:0.2,sharpness:0.1,duration:1.0")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            _ = haptic("transient:true,intensity:0.8,sharpness:0.8")
        }
    }
}

#else

public func haptic(_ _: String) -> String { return "" }

public func haptic_test() {}

#endif


