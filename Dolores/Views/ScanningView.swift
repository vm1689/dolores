import SwiftUI
import UIKit
import CoreLocation

struct ScanningView: View {
    @EnvironmentObject var beaconManager: BeaconManager
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @State private var pulseScale: CGFloat = 1.0
    @Binding var selectedArtwork: Artwork?

    private let artworks = [
        ArtworkCatalog.fallbackArtworks[45434]!,
        ArtworkCatalog.fallbackArtworks[436535]!
    ]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scanIndicator
                artworkList
                Spacer()
                debugOverlay
                nowPlayingBar
            }
        }
        .onAppear {
            beaconManager.requestPermissions()
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 4) {
            Text("DOLORES")
                .font(.system(size: 13, weight: .semibold, design: .default))
                .kerning(4)
                .foregroundColor(Color("AccentColor"))

            Text("Audio Guide")
                .font(.system(size: 28, weight: .light, design: .serif))
                .foregroundColor(.white)
        }
        .padding(.top, 20)
        .padding(.bottom, 16)
    }

    // MARK: - Scan Indicator

    private var scanIndicator: some View {
        VStack(spacing: 12) {
            ZStack {
                // Pulsing rings
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .stroke(Color("AccentColor").opacity(0.15), lineWidth: 1)
                        .frame(width: 60 + CGFloat(i) * 30, height: 60 + CGFloat(i) * 30)
                        .scaleEffect(pulseScale)
                        .opacity(beaconManager.detectedBeacons.isEmpty ? 1 : 0)
                }

                // Center icon
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 28))
                    .foregroundColor(beaconManager.detectedBeacons.isEmpty ? .gray : Color("AccentColor"))
            }
            .frame(height: 80)

            Text(statusText)
                .font(.system(size: 14))
                .foregroundColor(.gray)
        }
        .padding(.bottom, 24)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulseScale = 1.15
            }
        }
    }

    private var statusText: String {
        if !beaconManager.isScanning {
            switch beaconManager.authorizationStatus {
            case .denied, .restricted:
                return "Location access required — check Settings"
            case .notDetermined:
                return "Requesting permissions..."
            default:
                return "Starting scanner..."
            }
        }
        let count = beaconManager.detectedBeacons.count
        if count == 0 {
            return "Scanning for nearby art..."
        }
        return "\(count) artwork\(count == 1 ? "" : "s") detected"
    }

    // MARK: - Artwork List

    private var artworkList: some View {
        VStack(spacing: 12) {
            ForEach(artworks) { artwork in
                ArtworkRow(
                    artwork: artwork,
                    proximity: beaconManager.detectedBeacons[artwork.beaconMajor],
                    isPlaying: audioPlayer.currentArtwork == artwork && audioPlayer.isPlaying
                )
                .onTapGesture {
                    selectedArtwork = artwork
                }
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Debug Overlay

    private var debugOverlay: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("DEBUG")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(.yellow)
            Text(beaconManager.debugLog)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.green)
            ForEach(Array(beaconManager.beaconDistances.keys.sorted()), id: \.self) { major in
                let dist = beaconManager.beaconDistances[major] ?? -1
                let rssi = beaconManager.beaconRSSI[major] ?? 0
                let feet = dist >= 0 ? String(format: "%.1f ft", dist * 3.281) : "?"
                Text("Beacon \(major): \(feet) (RSSI: \(rssi))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.yellow)
            }
            Text("triggered: \(beaconManager.triggeredMajor.map { String($0) } ?? "none")")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.yellow)
            Text("audio: \(audioPlayer.isPlaying ? "PLAYING" : "STOPPED")")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(audioPlayer.isPlaying ? .green : .yellow)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.8))
    }

    // MARK: - Now Playing Bar

    @ViewBuilder
    private var nowPlayingBar: some View {
        if let current = audioPlayer.currentArtwork {
            Button {
                selectedArtwork = current
            } label: {
                HStack(spacing: 12) {
                    ArtworkThumbnail(artwork: current)
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 6))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(current.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(current.artist)
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                            .lineLimit(1)
                    }

                    Spacer()

                    Button {
                        audioPlayer.togglePlayPause()
                    } label: {
                        Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                }
                .padding(12)
                .background(Color.white.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Artwork Row

struct ArtworkRow: View {
    let artwork: Artwork
    let proximity: CLProximity?
    let isPlaying: Bool

    var body: some View {
        HStack(spacing: 14) {
            // Artwork thumbnail
            ArtworkThumbnail(artwork: artwork)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(artwork.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(2)

                Text(artwork.artist)
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
            }

            Spacer()

            // Signal indicator
            VStack(spacing: 4) {
                signalIcon
                if isPlaying {
                    Text("Playing")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color("AccentColor"))
                }
            }
        }
        .padding(14)
        .background(Color.white.opacity(proximity != nil ? 0.08 : 0.03))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(proximity != nil ? Color("AccentColor").opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var signalIcon: some View {
        if let proximity {
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(signalBarColor(index: i, proximity: proximity))
                        .frame(width: 3, height: CGFloat(6 + i * 4))
                }
            }
        } else {
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 14))
                .foregroundColor(.gray.opacity(0.4))
        }
    }

    private func signalBarColor(index: Int, proximity: CLProximity) -> Color {
        let strength: Int
        switch proximity {
        case .immediate: strength = 3
        case .near: strength = 2
        case .far: strength = 1
        default: strength = 0
        }
        return index < strength ? Color("AccentColor") : Color.gray.opacity(0.3)
    }
}

// MARK: - Artwork Thumbnail

struct ArtworkThumbnail: View {
    let artwork: Artwork

    var body: some View {
        if let imageName = artwork.imageName,
           let uiImage = UIImage(named: imageName) ?? loadBundleImage(named: imageName) {
            Image(uiImage: uiImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            AsyncImage(url: artwork.imageURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    Rectangle().fill(Color.gray.opacity(0.2))
                        .overlay(
                            Image(systemName: "photo.artframe")
                                .foregroundColor(.gray.opacity(0.5))
                        )
                }
            }
        }
    }

    private func loadBundleImage(named name: String) -> UIImage? {
        if let url = Bundle.main.url(forResource: name, withExtension: "jpg") {
            return UIImage(contentsOfFile: url.path)
        }
        return nil
    }
}
