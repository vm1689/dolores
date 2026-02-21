import SwiftUI
import CoreLocation
import AVFoundation

@main
struct DoloresApp: App {
    @StateObject private var beaconManager = BeaconManager()
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var realtimeService = RealtimeService()
    @State private var selectedArtwork: Artwork?
    @State private var micEnabled = true  // Mic ON by default

    /// Best artwork for conversation context
    private var conversationArtwork: Artwork? {
        audioPlayer.currentArtwork ?? selectedArtwork
    }

    /// Whether the AI conversation WebSocket is actively connected
    private var isConversationActive: Bool {
        realtimeService.isConnected
    }

    @State private var micPulse = false

    private var micToggleButton: some View {
        Button {
            toggleMic()
        } label: {
            ZStack {
                if micEnabled {
                    Circle()
                        .stroke(Color.red.opacity(0.3), lineWidth: 3)
                        .frame(width: 90, height: 90)
                        .scaleEffect(micPulse ? 1.4 : 1.0)
                        .opacity(micPulse ? 0 : 0.8)
                }

                Circle()
                    .fill(micEnabled ? Color.red : Color.white.opacity(0.08))
                    .frame(width: 78, height: 78)
                    .overlay(
                        Circle()
                            .stroke(micEnabled ? Color.red.opacity(0.6) : Color.white.opacity(0.15), lineWidth: 1.5)
                    )
                    .shadow(color: micEnabled ? Color.red.opacity(0.4) : .clear, radius: 12)

                Image(systemName: micEnabled ? "mic.fill" : "mic")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(micEnabled ? .white : .gray)
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onChange(of: micEnabled) { _, enabled in
            if enabled {
                withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) {
                    micPulse = true
                }
            } else {
                micPulse = false
            }
        }
    }

    private func toggleMic() {
        if micEnabled {
            // Turn OFF — stop everything
            micEnabled = false
            realtimeService.disconnect()
            realtimeService.stopMonitoring()
        } else {
            // Turn ON — start monitoring (or connect if no artwork/narration)
            micEnabled = true
            if selectedArtwork != nil {
                realtimeService.startMonitoring()
            } else {
                // Home screen: connect directly for general conversation
                realtimeService.connect(artwork: nil)
            }
        }
    }

    /// Speech detected during narration — stop narration, connect WebSocket
    private func connectConversation() {
        // connect() handles stopping narration + transitioning from monitoring
        realtimeService.connect(artwork: conversationArtwork)
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                ScanningView(selectedArtwork: $selectedArtwork)
                    .navigationDestination(item: $selectedArtwork) { artwork in
                        PlayerView(artwork: artwork, micEnabled: $micEnabled)
                    }
            }
            .environmentObject(beaconManager)
            .environmentObject(audioPlayer)
            .environmentObject(realtimeService)
            .onAppear {
                realtimeService.audioPlayer = audioPlayer
                // Request mic permission early so it's ready when needed
                AVAudioApplication.requestRecordPermission { _ in }
            }
            .overlay(alignment: .bottom) {
                VStack(spacing: 12) {
                    // Conversation overlay — visible when mic is on and on artwork page
                    if micEnabled && selectedArtwork != nil {
                        ConversationOverlay(
                            state: realtimeService.state,
                            userText: realtimeService.lastUserText,
                            aiText: realtimeService.lastAIText
                        ) {
                            realtimeService.interrupt()
                        }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Mic button — only on home screen
                    if selectedArtwork == nil {
                        micToggleButton
                    }
                }
                .padding(.bottom, selectedArtwork == nil ? 220 : 16)
            }
            .preferredColorScheme(.dark)
            .tint(Color("AccentColor"))
            // Cleanup when leaving artwork
            .onChange(of: selectedArtwork) { _, artwork in
                if artwork == nil {
                    realtimeService.stopMonitoring()
                    realtimeService.disconnect()
                }
            }
            // Speech detected during narration → connect AI conversation
            .onChange(of: realtimeService.speechDetectedDuringNarration) { _, detected in
                guard detected, micEnabled else { return }
                NSLog("[App] Speech detected during narration — connecting conversation")
                connectConversation()
            }
            .onChange(of: beaconManager.triggeredMajor) { _, major in
                guard let major else { return }
                guard let artwork = ArtworkCatalog.artwork(forBeaconMajor: major) else { return }

                // Disconnect any active conversation before switching artworks
                realtimeService.disconnect()
                micEnabled = true  // Reset mic to ON for new artwork

                // Play audio immediately
                audioPlayer.play(artwork: artwork)

                if selectedArtwork != artwork {
                    selectedArtwork = artwork
                }
            }
        }
    }
}
