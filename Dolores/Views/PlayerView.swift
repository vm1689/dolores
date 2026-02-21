import SwiftUI
import UIKit

struct PlayerView: View {
    let artwork: Artwork
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var realtimeService: RealtimeService
    @Environment(\.dismiss) private var dismiss
    @State private var isDragging = false
    @State private var dragProgress: Double = 0
    @Binding var micEnabled: Bool

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    artworkImage
                    metadata
                    playerControls
                    descriptionSection
                }
                .padding(.bottom, 40)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    micEnabled.toggle()
                    if micEnabled {
                        // Turn mic back on — start monitoring
                        realtimeService.startMonitoring()
                    } else {
                        // Turn mic off — stop everything
                        realtimeService.disconnect()
                        realtimeService.stopMonitoring()
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(micEnabled ? Color.red : Color.white.opacity(0.08))
                            .frame(width: 36, height: 36)
                            .overlay(
                                Circle()
                                    .stroke(micEnabled ? Color.red.opacity(0.6) : Color.white.opacity(0.15), lineWidth: 1)
                            )

                        Image(systemName: micEnabled ? "mic.fill" : "mic")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(micEnabled ? .white : .gray)
                    }
                }
            }
        }
        .onAppear {
            // Play narration if not already playing this artwork
            if audioPlayer.currentArtwork != artwork {
                audioPlayer.play(artwork: artwork)
            }
            // Start monitoring after a short delay (let narration establish first)
            if micEnabled {
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000) // 2s
                    guard micEnabled, !realtimeService.isConnected else { return }
                    realtimeService.startMonitoring()
                }
            }
        }
        .onDisappear {
            realtimeService.stopMonitoring()
            if realtimeService.isConnected {
                realtimeService.disconnect()
                audioPlayer.configureForPlayback()
            }
        }
    }

    // MARK: - Artwork Image

    private var artworkImage: some View {
        ZStack {
            Group {
                if let imageName = artwork.imageName,
                   let uiImage = UIImage(named: imageName) ?? loadBundleImage(named: imageName) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 360)
                } else {
                    AsyncImage(url: artwork.imageURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxHeight: 360)
                        case .failure:
                            imagePlaceholder
                        default:
                            imagePlaceholder
                                .overlay(ProgressView().tint(.gray))
                        }
                    }
                }
            }
            .opacity(realtimeService.zoomedImage != nil ? 0.3 : 1)

            // Zoomed image overlay
            if let zoomed = realtimeService.zoomedImage {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: zoomed)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 360)

                    Text("ZOOMED")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.black.opacity(0.6))
                        .clipShape(Capsule())
                        .padding(8)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.easeInOut(duration: 0.4), value: realtimeService.zoomedImage != nil)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 10)
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    private func loadBundleImage(named name: String) -> UIImage? {
        if let url = Bundle.main.url(forResource: name, withExtension: "jpg") {
            return UIImage(contentsOfFile: url.path)
        }
        return nil
    }

    private var imagePlaceholder: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.gray.opacity(0.15))
            .frame(height: 280)
            .overlay(
                Image(systemName: "photo.artframe")
                    .font(.system(size: 40))
                    .foregroundColor(.gray.opacity(0.3))
            )
    }

    // MARK: - Metadata

    private var metadata: some View {
        VStack(spacing: 6) {
            Text(artwork.title)
                .font(.system(size: 22, weight: .semibold, design: .serif))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)

            Text(artwork.artist)
                .font(.system(size: 16))
                .foregroundColor(Color("AccentColor"))

            Text("\(artwork.date) · \(artwork.medium)")
                .font(.system(size: 13))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
    }

    // MARK: - Player Controls

    private var playerControls: some View {
        VStack(spacing: 16) {
            // Progress bar
            VStack(spacing: 6) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        // Track
                        Capsule()
                            .fill(Color.white.opacity(0.15))
                            .frame(height: 4)

                        // Fill
                        Capsule()
                            .fill(Color("AccentColor"))
                            .frame(width: max(0, geo.size.width * currentProgress), height: 4)

                        // Thumb (visible when dragging)
                        if isDragging {
                            Circle()
                                .fill(Color("AccentColor"))
                                .frame(width: 12, height: 12)
                                .offset(x: max(0, min(geo.size.width - 12, geo.size.width * dragProgress - 6)))
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                isDragging = true
                                dragProgress = max(0, min(1, value.location.x / geo.size.width))
                            }
                            .onEnded { value in
                                isDragging = false
                                let fraction = max(0, min(1, value.location.x / geo.size.width))
                                audioPlayer.seek(to: fraction * audioPlayer.duration)
                            }
                    )
                }
                .frame(height: 12)

                // Time labels
                HStack {
                    Text(formatTime(audioPlayer.currentTime))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.gray)
                    Spacer()
                    Text(formatTime(audioPlayer.duration))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.gray)
                }
            }

            // Play/Pause button
            Button {
                audioPlayer.togglePlayPause()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color("AccentColor"))
                        .frame(width: 64, height: 64)

                    Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white)
                        .offset(x: audioPlayer.isPlaying ? 0 : 2)
                }
            }

        }
        .padding(.horizontal, 32)
        .padding(.top, 28)
    }

    private var currentProgress: Double {
        isDragging ? dragProgress : audioPlayer.progress
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Rectangle()
                    .fill(Color("AccentColor"))
                    .frame(width: 3, height: 18)
                Text("About This Work")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .textCase(.uppercase)
                    .kerning(1.5)
            }

            Text(artwork.description)
                .font(.system(size: 15, weight: .regular, design: .serif))
                .foregroundColor(.gray)
                .lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        guard time.isFinite && !time.isNaN else { return "0:00" }
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
