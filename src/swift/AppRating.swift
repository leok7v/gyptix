import StoreKit
#if os(iOS)
import UIKit
#else // os(macOS)
import AppKit
#endif

let appID = "6741091005"  // App Store ID

struct AppRating {

    static func trackAppLaunchDelayed() {
        let debugRating = false   // Debug mode: Always request review
        let now = Date().timeIntervalSince1970
        let oneDay: TimeInterval = 24 * 60 * 60
        let oneWeek: TimeInterval = 7 * oneDay
        let oneMonth: TimeInterval = 4 * oneWeek
        let uds = UserDefaults.standard
        var appLaunchCount   = uds.integer(forKey: "appLaunchCount")
        var lastPromptDate   = uds.double(forKey:  "lastPromptDate")
        var firstLaunchDate  = uds.double(forKey:  "firstLaunchDate")
        var ratingShownCount = uds.integer(forKey: "ratingShownCount")
        if firstLaunchDate == 0 {
            UserDefaults.standard.set(now, forKey: "firstLaunchDate")
            firstLaunchDate = now
        }
        if lastPromptDate == 0 {
            UserDefaults.standard.set(now, forKey: "lastPromptDate")
            lastPromptDate = now
        }
        // Determine rating frequency based on how many times it's been shown
        let ratingInterval: TimeInterval
        switch ratingShownCount {
            case 0...6:  ratingInterval = oneWeek  // Daily for first 7 times
            default:     ratingInterval = oneMonth // Monthly afterward
        }
        appLaunchCount += 1
        UserDefaults.standard.set(appLaunchCount, forKey: "appLaunchCount")
        if debugRating || (now - lastPromptDate > ratingInterval) {
            rate()
            UserDefaults.standard.set(now, forKey: "lastPromptDate")
            ratingShownCount += 1
            UserDefaults.standard.set(ratingShownCount,
                                      forKey: "ratingShownCount")
        }
    }

    static func rate() {
        #if os(iOS)
            if let windowScene = UIApplication.shared.connectedScenes.first
                as? UIWindowScene {
                SKStoreReviewController.requestReview(in: windowScene)
            }
        #else // os(macOS)
            rateManually(appID: appID)
        #endif
        var ratingShownCount =
            UserDefaults.standard.integer(forKey: "ratingShownCount")
        ratingShownCount += 1
        UserDefaults.standard.set(ratingShownCount,
                                  forKey: "ratingShownCount")
    }

    static func trackAppLaunch() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            AppRating.trackAppLaunchDelayed()
        }
    }
    
    static func rateManually(appID: String) {
        let u = "https://apps.apple.com/us/app/gyptix/id\(appID)"
        if let url = URL(string: "\(u)?action=write-review") {
            #if os(iOS)
                UIApplication.shared.open(url)
            #else // os(macOS)
                NSWorkspace.shared.open(url)
            #endif
        }
    }
}
