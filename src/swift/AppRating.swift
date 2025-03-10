import StoreKit
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

struct AppRating {
    
    static func trackAppLaunchDelayed() {
        let appID = "6741091005"  // Replace with your App Store ID
        let debugRating = false   // Debug mode: Always request review
        let now = Date().timeIntervalSince1970
        let oneDay: TimeInterval = 24 * 60 * 60
        let oneWeek: TimeInterval = 7 * oneDay
        let oneMonth: TimeInterval = 4 * oneWeek
        var appLaunchCount   = UserDefaults.standard.integer(forKey: "appLaunchCount")
        var lastPromptDate   = UserDefaults.standard.double(forKey:  "lastPromptDate")
        var firstLaunchDate  = UserDefaults.standard.double(forKey:  "firstLaunchDate")
        var ratingShownCount = UserDefaults.standard.integer(forKey: "ratingShownCount")
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
            #if os(iOS)
            if (ratingShownCount > 2) {
                rateManually(appID: appID)
            } else {
                if let windowScene = UIApplication.shared.connectedScenes.first
                    as? UIWindowScene {
                    SKStoreReviewController.requestReview(in: windowScene)
                }
            }
            #elseif os(macOS)
            rateManually(appID: appID)
            #endif
            UserDefaults.standard.set(now, forKey: "lastPromptDate")
            ratingShownCount += 1
            UserDefaults.standard.set(ratingShownCount, forKey: "ratingShownCount")
        }
    }

    static func trackAppLaunch() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 30.0) {
            AppRating.trackAppLaunchDelayed()
        }
    }
    
    static func rateManually(appID: String) {
        if let url = URL(string:
            "https://apps.apple.com/us/app/gyptix/id\(appID)?action=write-review") {
            #if os(iOS)
            UIApplication.shared.open(url)
            #elseif os(macOS)
            NSWorkspace.shared.open(url)
            #endif
            var ratingShownCount =
                UserDefaults.standard.integer(forKey: "ratingShownCount")
            ratingShownCount += 1
            UserDefaults.standard.set(ratingShownCount, forKey: "ratingShownCount")
        }
    }
}
