import Foundation
import AVFoundation
import MediaPlayer
import Combine
import UIKit

@MainActor
final class AudioPlayerService: NSObject, ObservableObject {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var currentArtwork: Artwork?

    private var audioPlayer: AVAudioPlayer?
    private var timer: Timer?

    override init() {
        super.init()
        configureAudioSession()
        setupRemoteTransportControls()
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Use .playAndRecord so mic monitoring can run alongside narration
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            print("Audio session configuration failed: \(error.localizedDescription)")
        }
    }

    private func setupRemoteTransportControls() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.resume()
            }
            return .success
        }

        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.pause()
            }
            return .success
        }

        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in
                self?.seek(to: event.positionTime)
            }
            return .success
        }
    }

    func play(artwork: Artwork) {
        // Don't restart if already playing this artwork
        if currentArtwork == artwork && isPlaying { return }

        // Stop current playback
        audioPlayer?.stop()
        audioPlayer = nil
        stopProgressTimer()

        // Re-activate audio session
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            print("Audio session activation failed: \(error.localizedDescription)")
        }

        currentArtwork = artwork

        guard let url = Bundle.main.url(forResource: artwork.audioFileName, withExtension: "mp3") else {
            print("Audio file not found: \(artwork.audioFileName).mp3")
            return
        }

        do {
            audioPlayer = try AVAudioPlayer(contentsOf: url)
            audioPlayer?.delegate = self
            audioPlayer?.volume = 1.0
            audioPlayer?.prepareToPlay()
            let started = audioPlayer?.play() ?? false

            isPlaying = started
            duration = audioPlayer?.duration ?? 0
            currentTime = 0

            updateNowPlayingInfo()
            startProgressTimer()
        } catch {
            print("Audio playback failed: \(error.localizedDescription)")
        }
    }

    func pause() {
        audioPlayer?.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func resume() {
        audioPlayer?.play()
        isPlaying = true
        updateNowPlayingInfo()
    }

    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            resume()
        }
    }

    func seek(to time: TimeInterval) {
        audioPlayer?.currentTime = time
        currentTime = time
        updateNowPlayingInfo()
    }

    func stop() {
        NSLog("[Audio] stop() called — audioPlayer: %@, isPlaying: %@", audioPlayer != nil ? "exists" : "nil", isPlaying ? "true" : "false")
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        currentArtwork = nil
        stopProgressTimer()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        NSLog("[Audio] stop() complete")
    }

    func configureForConversation() {
        // Fully stop narration — not just pause (session changes can undo pause)
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
        stopProgressTimer()
        print("[Audio] Narration stopped for conversation")
    }

    func configureForPlayback() {
        // Session is already .playAndRecord — nothing to change
    }

    var progress: Double {
        guard duration > 0 else { return 0 }
        return currentTime / duration
    }

    private func startProgressTimer() {
        stopProgressTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.audioPlayer else { return }
                self.currentTime = player.currentTime

                if !player.isPlaying && self.isPlaying && player.currentTime >= player.duration - 0.1 {
                    self.isPlaying = false
                    self.stopProgressTimer()
                }
            }
        }
    }

    private func stopProgressTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func updateNowPlayingInfo() {
        guard let artwork = currentArtwork else { return }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: artwork.title,
            MPMediaItemPropertyArtist: artwork.artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]

        if artwork.imageURL != nil {
            let config = MPMediaItemArtwork(boundsSize: CGSize(width: 300, height: 300)) { _ in
                UIImage(systemName: "photo.artframe") ?? UIImage()
            }
            info[MPMediaItemPropertyArtwork] = config
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}

// MARK: - AVAudioPlayerDelegate

extension AudioPlayerService: @preconcurrency AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.currentTime = self.duration
            self.stopProgressTimer()
            self.updateNowPlayingInfo()
        }
    }
}
