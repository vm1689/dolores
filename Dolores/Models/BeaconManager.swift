import Foundation
import CoreLocation
import Combine
import UserNotifications

@MainActor
final class BeaconManager: NSObject, ObservableObject {
    @Published var detectedBeacons: [Int: CLProximity] = [:] // major → proximity
    @Published var nearestBeaconMajor: Int?
    @Published var isScanning = false
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var beaconDistances: [Int: Double] = [:] // major → estimated meters
    @Published var beaconRSSI: [Int: Int] = [:] // major → RSSI
    @Published var debugLog: String = "Waiting..."

    /// Set the moment a beacon is first detected — triggers navigation + playback
    @Published var triggeredMajor: Int?

    #if targetEnvironment(simulator)
    let isSimulator = true
    #else
    let isSimulator = false
    #endif

    private let locationManager = CLLocationManager()
    private let beaconUUID = UUID(uuidString: ArtworkCatalog.beaconUUID)!
    private var beaconConstraints: [CLBeaconIdentityConstraint] = []
    private var beaconRegions: [CLBeaconRegion] = []

    // Keep beacons alive for 5 seconds after last detection
    private var beaconLastSeen: [Int: Date] = [:]
    private let beaconTimeout: TimeInterval = 5.0
    private var cleanupTimer: Timer?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.allowsBackgroundLocationUpdates = !isSimulator
        locationManager.pausesLocationUpdatesAutomatically = false
        setupBeaconRegions()
    }

    private func setupBeaconRegions() {
        for major in ArtworkCatalog.allBeaconMajors {
            let constraint = CLBeaconIdentityConstraint(
                uuid: beaconUUID,
                major: CLBeaconMajorValue(major)
            )
            let region = CLBeaconRegion(
                beaconIdentityConstraint: constraint,
                identifier: "artwork-beacon-\(major)"
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            region.notifyEntryStateOnDisplay = true
            beaconConstraints.append(constraint)
            beaconRegions.append(region)
        }
    }

    func requestPermissions() {
        locationManager.requestAlwaysAuthorization()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func startScanning() {
        guard !isScanning else { return }
        isScanning = true

        for region in beaconRegions {
            locationManager.startMonitoring(for: region)
        }
        for constraint in beaconConstraints {
            locationManager.startRangingBeacons(satisfying: constraint)
        }

        cleanupTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.cleanupStaleBeacons()
            }
        }
    }

    func stopScanning() {
        isScanning = false
        cleanupTimer?.invalidate()
        cleanupTimer = nil
        for region in beaconRegions {
            locationManager.stopMonitoring(for: region)
        }
        for constraint in beaconConstraints {
            locationManager.stopRangingBeacons(satisfying: constraint)
        }
        detectedBeacons.removeAll()
        beaconLastSeen.removeAll()
        nearestBeaconMajor = nil
    }

    private func cleanupStaleBeacons() {
        let now = Date()
        for (major, lastSeen) in beaconLastSeen {
            if now.timeIntervalSince(lastSeen) > beaconTimeout {
                detectedBeacons.removeValue(forKey: major)
                beaconLastSeen.removeValue(forKey: major)
            }
        }
        if detectedBeacons.isEmpty {
            nearestBeaconMajor = nil
        }
    }

    private func sendLocalNotification(for major: Int) {
        guard let artwork = ArtworkCatalog.artwork(forBeaconMajor: major) else { return }
        let content = UNMutableNotificationContent()
        content.title = "Artwork Nearby"
        content.body = "You're near \"\(artwork.title)\" by \(artwork.artist)"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "beacon-\(major)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - CLLocationManagerDelegate

extension BeaconManager: @preconcurrency CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorizationStatus = status
            if status == .authorizedAlways || status == .authorizedWhenInUse {
                self.startScanning()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard let beaconRegion = region as? CLBeaconRegion,
              let major = beaconRegion.beaconIdentityConstraint.major else { return }
        let majorInt = Int(major)
        Task { @MainActor in
            // Region entry = beacon detected — trigger immediately
            print("Region entered for beacon \(majorInt)")
            self.triggeredMajor = majorInt
            self.sendLocalNotification(for: majorInt)
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didRange beacons: [CLBeacon],
        satisfying constraint: CLBeaconIdentityConstraint
    ) {
        Task { @MainActor in
            let now = Date()

            for beacon in beacons {
                let major = Int(truncating: beacon.major)
                let proximity: CLProximity = beacon.proximity == .unknown ? .far : beacon.proximity
                self.detectedBeacons[major] = proximity
                self.beaconLastSeen[major] = now
                self.beaconRSSI[major] = beacon.rssi

                // Estimate distance from RSSI (approximate)
                let accuracy = beacon.accuracy // meters, -1 if unknown
                if accuracy >= 0 {
                    self.beaconDistances[major] = accuracy
                }

                let proximityName: String
                switch beacon.proximity {
                case .immediate: proximityName = "IMMEDIATE (<0.5m)"
                case .near: proximityName = "NEAR (0.5-3m)"
                case .far: proximityName = "FAR (3m+)"
                default: proximityName = "UNKNOWN"
                }

                let distStr = accuracy >= 0 ? String(format: "%.1fm", accuracy) : "?"
                self.debugLog = "B\(major): \(proximityName) ~\(distStr) RSSI:\(beacon.rssi)"

                // Trigger navigation + playback at immediate proximity (~2 feet)
                if proximity == .immediate && self.triggeredMajor != major {
                    self.debugLog = "TRIGGERED B\(major)! Playing audio"
                    self.triggeredMajor = major
                }
            }

            if beacons.isEmpty {
                self.debugLog = "No beacons in range"
            }

            let nearest = self.detectedBeacons
                .min(by: { $0.value.rawValue < $1.value.rawValue })
            self.nearestBeaconMajor = nearest?.key
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location manager error: \(error.localizedDescription)")
    }

    nonisolated func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        print("Monitoring failed for region \(region?.identifier ?? "unknown"): \(error.localizedDescription)")
    }
}
