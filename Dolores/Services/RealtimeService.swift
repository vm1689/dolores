import Foundation
import AVFoundation
import Combine
import UIKit
import os

// MARK: - Conversation State

enum ConversationState: Equatable {
    case idle
    case monitoring    // Mic on, listening for speech during narration
    case connecting
    case listening
    case userSpeaking
    case thinking
    case aiSpeaking
}

// MARK: - RealtimeService (Gemini Live API)

@MainActor
final class RealtimeService: ObservableObject {

    // MARK: Published State

    @Published private(set) var state: ConversationState = .idle
    @Published private(set) var error: String?
    @Published var debugLog: [String] = []
    @Published var zoomedImage: UIImage?
    @Published private(set) var lastUserText: String?
    @Published private(set) var lastAIText: String?

    // MARK: Private Properties

    private var webSocket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var audioEngine: AVAudioEngine?
    private var currentArtwork: Artwork?
    private(set) var isConnected = false
    private var isSessionReady = false  // Wait for setupComplete before sending audio
    private var artworkImageBase64: String?  // Base64 JPEG of current artwork for zoom
    private var zoomGeneration: Int = 0  // Tracks zoom/reset ordering to discard stale results
    private var reconnectCount = 0
    private let maxReconnects = 2
    private var hasLoadedArtworkImage = false

    // Audio format: Gemini expects 16kHz input, sends 24kHz output
    private let inputSampleRate: Double = 16_000
    private let outputSampleRate: Double = 24_000

    // Streaming audio playback via AVAudioPlayerNode
    private var playerNode: AVAudioPlayerNode?
    private var playerFormat: AVAudioFormat?
    private var audioChunkCount = 0

    // Speech detection thresholds
    private let monitoringThreshold: Float = 0.005
    private let bargeInThreshold: Float = 0.08  // Higher threshold to distinguish real speech from echo
    private var bargeInScore: Int = 0
    private let bargeInTrigger = 4
    private var rmsLogCounter = 0

    // Local speech detection for UI state (userSpeaking / thinking)
    private var speechScore: Int = 0
    private let speechThreshold: Float = 0.03
    private let speechTrigger = 3

    /// Set to true when speech is detected during monitoring (narration playing)
    @Published var speechDetectedDuringNarration = false
    private var isMonitoring = false

    // Audio buffering during monitoring→connected transition
    private var isBuffering = false
    private var bufferedAudio: [String] = []

    // Rolling buffer — keeps last ~3 seconds of audio during monitoring
    // so the user's first question isn't lost during WebSocket setup
    private var monitoringBuffer: [String] = []
    private let maxMonitoringBuffer = 30  // ~3 seconds at 10 frames/sec

    // Accumulated transcription — server sends word-by-word, we collect into full sentence
    private var accumulatedUserText: String = ""
    private var zoomDebounceTask: Task<Void, Never>?

    /// Direct reference to audio player — stops narration on speech detection
    var audioPlayer: AudioPlayerService?

    // MARK: - Logging

    private static let logger = Logger(subsystem: "com.dolores.audioguide", category: "RealtimeService")

    private func log(_ message: String) {
        Self.logger.info("\(message, privacy: .public)")
        NSLog("[Realtime] %@", message)
        Task { @MainActor in
            self.debugLog.append(message)
            if self.debugLog.count > 30 {
                self.debugLog.removeFirst()
            }
        }
    }

    // MARK: - Public API

    func connect(artwork: Artwork?) {
        // Kill narration
        audioPlayer?.stop()

        // If transitioning from monitoring, keep the audio engine running and buffer audio
        if isMonitoring {
            log("Transitioning from monitoring → connected (engine kept alive, buffering \(monitoringBuffer.count) rolling frames)")
            isMonitoring = false
            bargeInScore = 0
            isBuffering = true
            bufferedAudio = monitoringBuffer  // Prepend rolling buffer (has the user's question)
            monitoringBuffer = []
        } else if state != .idle {
            disconnect()
        }

        state = .connecting
        log("Connecting to Gemini...")
        connectInternal(artwork: artwork)
    }

    /// Start mic monitoring without WebSocket — detects speech during narration
    func startMonitoring() {
        guard !isMonitoring, !isConnected else { return }
        log("Requesting mic permission for monitoring...")

        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self, !self.isConnected else { return }
                if granted {
                    self.log("Mic permission granted — starting monitor")
                    self.beginMonitoring()
                } else {
                    self.log("Mic permission denied — cannot monitor")
                    self.state = .idle
                }
            }
        }
    }

    private func beginMonitoring() {
        guard !isMonitoring, !isConnected else { return }
        isMonitoring = true
        bargeInScore = 0
        speechDetectedDuringNarration = false
        state = .monitoring

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            log("Monitor audio session error: \(error.localizedDescription)")
        }

        startAudioEngine()
        log("Monitoring started — speak to interrupt narration")
    }

    func stopMonitoring() {
        guard isMonitoring else { return }
        isMonitoring = false
        bargeInScore = 0
        stopAudioEngine()
        if state == .monitoring { state = .idle }
        log("Monitoring stopped")
    }

    /// Tap-to-interrupt: stop AI speech and start listening
    func interrupt() {
        guard state == .aiSpeaking || state == .thinking else { return }
        log("User interrupted (tap)")
        stopPlayback()
        state = .listening
        speechScore = 0
    }

    func disconnect() {
        stopPlayback()
        stopAudioEngine()
        closeWebSocket()
        bargeInScore = 0
        speechScore = 0
        isMonitoring = false
        isBuffering = false
        bufferedAudio = []
        isSessionReady = false
        state = .idle
        currentArtwork = nil
        isConnected = false
        error = nil
        audioChunkCount = 0
        zoomedImage = nil
        artworkImageBase64 = nil
        reconnectCount = 0
        hasLoadedArtworkImage = false
        lastUserText = nil
        lastAIText = nil
        monitoringBuffer = []
        accumulatedUserText = ""
        zoomDebounceTask?.cancel()
        zoomDebounceTask = nil
        log("Disconnected")
    }

    // MARK: - Connection

    private func connectInternal(artwork: Artwork?) {
        currentArtwork = artwork
        error = nil

        guard let apiKey = Bundle.main.infoDictionary?["GEMINI_API_KEY"] as? String,
              !apiKey.isEmpty else {
            log("ERROR: No Gemini API key in Info.plist")
            error = "Gemini API key not configured"
            state = .idle
            return
        }

        // If engine is already running (from monitoring), skip permission
        if audioEngine != nil {
            log("Engine already running — opening WebSocket directly")
            openWebSocket(apiKey: apiKey, artwork: artwork)
        } else {
            log("Requesting mic permission...")
            requestMicPermissionThenConnect(apiKey: apiKey, artwork: artwork)
        }
    }

    private func requestMicPermissionThenConnect(apiKey: String, artwork: Artwork?) {
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                if granted {
                    self.log("Mic permission granted")
                    self.openWebSocket(apiKey: apiKey, artwork: artwork)
                } else {
                    self.log("ERROR: Mic permission denied")
                    self.error = "Microphone permission denied"
                    self.state = .idle
                }
            }
        }
    }

    // MARK: - WebSocket

    private func openWebSocket(apiKey: String, artwork: Artwork?) {
        let endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=\(apiKey)"
        guard let url = URL(string: endpoint) else { return }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        let session = URLSession(configuration: config)
        urlSession = session
        let ws = session.webSocketTask(with: url)
        webSocket = ws
        ws.resume()

        isConnected = true
        log("WebSocket opened — sending setup")
        receiveLoop()

        // Send setup as first message
        sendSetup(artwork: artwork)
    }

    private func closeWebSocket() {
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
    }

    private func sendSetup(artwork: Artwork?) {
        let artworkContext: String
        if let artwork {
            artworkContext = """
            The visitor is currently looking at "\(artwork.title)" by \(artwork.artist) (\(artwork.date)). \
            Medium: \(artwork.medium).

            About this work: \(artwork.description)
            """
        } else {
            artworkContext = "The visitor is browsing the museum and hasn't selected a specific artwork yet."
        }

        let systemPrompt = """
        You are Dolores, a passionate docent at The Metropolitan Museum of Art. Never say you're an AI or Gemini.

        \(artworkContext)

        Response structure (follow this every time):
        1. HOOK — Open with something vivid or surprising about the detail they asked about. Draw them in.
        2. LOOK CLOSER — Walk them through 2–3 specific visual elements: colors, brushstrokes, figures, composition. Use language like "See how…", "Look at the way…", "Notice right here…" as if you're pointing at the painting.
        3. THE STORY — A short, compelling backstory or fun fact that connects to what they're seeing. Make it feel like a secret only you know.
        4. LEAVE THEM CURIOUS — End with something that makes them want to look again or ask another question.

        Rules:
        - 4–6 sentences total. Longer than a quick answer, but still conversational — never lecture.
        - Vary your energy. Sometimes be awed, sometimes conspiratorial, sometimes playful. Don't sound the same every time.
        - ALWAYS tie every response to THIS specific artwork. Reference the title, the artist, and visible details.
        - Talk like you're standing right next to the visitor, physically pointing at things on the canvas.
        - If you don't know something, say so honestly — then pivot to something fascinating you do know about the piece.
        - If asked about unrelated topics, briefly answer then weave back to the artwork.
        """

        let setup: [String: Any] = [
            "setup": [
                "model": "models/gemini-2.5-flash-native-audio-latest",
                "generationConfig": [
                    "responseModalities": ["AUDIO"],
                    "speechConfig": [
                        "voiceConfig": [
                            "prebuiltVoiceConfig": [
                                "voiceName": "Aoede"
                            ]
                        ]
                    ]
                ] as [String: Any],
                "systemInstruction": [
                    "parts": [["text": systemPrompt]]
                ],
                "realtimeInputConfig": [
                    "automaticActivityDetection": [
                        "disabled": false,
                        "startOfSpeechSensitivity": "START_SENSITIVITY_HIGH",
                        "endOfSpeechSensitivity": "END_SENSITIVITY_HIGH",
                        "silenceDurationMs": 500
                    ] as [String: Any],
                    "activityHandling": "START_OF_ACTIVITY_INTERRUPTS"
                ] as [String: Any],
                "inputAudioTranscription": [:] as [String: Any],
                "outputAudioTranscription": [:] as [String: Any]
            ] as [String: Any]
        ]

        sendJSON(setup)
        log("Sent setup")
    }

    private func sendJSON(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let string = String(data: data, encoding: .utf8) else {
            log("ERROR: Failed to serialize JSON")
            return
        }

        webSocket?.send(.string(string)) { [weak self] error in
            if let error {
                Task { @MainActor in
                    self?.log("Send error: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Receive Loop

    private func receiveLoop() {
        webSocket?.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.isConnected else { return }

                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.handleServerEvent(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleServerEvent(text)
                        }
                    @unknown default:
                        break
                    }
                    self.receiveLoop()

                case .failure(let error):
                    if self.isConnected {
                        self.log("WebSocket error: \(error.localizedDescription)")
                        self.attemptReconnect()
                    }
                }
            }
        }
    }

    // MARK: - Auto-Reconnect

    private func attemptReconnect() {
        guard reconnectCount < maxReconnects else {
            log("Max reconnects reached — giving up")
            error = "Connection lost"
            disconnect()
            return
        }

        reconnectCount += 1
        let artwork = currentArtwork
        log("Reconnecting (\(reconnectCount)/\(maxReconnects))...")

        // Tear down WebSocket only (keep audio engine alive)
        closeWebSocket()
        isConnected = false
        isSessionReady = false
        state = .connecting

        guard let apiKey = Bundle.main.infoDictionary?["GEMINI_API_KEY"] as? String,
              !apiKey.isEmpty else {
            disconnect()
            return
        }

        // Small delay before reconnect
        Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            self.openWebSocket(apiKey: apiKey, artwork: artwork)
        }
    }

    // MARK: - Server Event Handling

    private func handleServerEvent(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        // 1. Setup complete — session is ready
        if json["setupComplete"] != nil {
            log("setupComplete — session ready")
            isSessionReady = true
            reconnectCount = 0

            // Start audio engine if not already running
            if audioEngine == nil {
                startAudioEngine()
            }
            isMonitoring = false
            state = .listening

            // Load artwork image locally for zoom pipe (NOT sent over WebSocket)
            loadArtworkImage()

            // Flush buffered audio
            if isBuffering {
                let count = bufferedAudio.count
                log("Flushing \(count) buffered audio frames...")
                for frame in bufferedAudio {
                    let msg: [String: Any] = [
                        "realtimeInput": [
                            "audio": [
                                "mimeType": "audio/pcm;rate=16000",
                                "data": frame
                            ]
                        ]
                    ]
                    sendJSON(msg)
                }
                bufferedAudio = []
                isBuffering = false
                log("Buffer flushed")
            }
            return
        }

        // 2. Server content — model response or control signals
        guard let serverContent = json["serverContent"] as? [String: Any] else {
            // Log all non-setupComplete event types
            let keys = json.keys.filter { $0 != "setupComplete" }
            if !keys.isEmpty {
                log("Server event: \(keys.sorted())")
            }
            return
        }

        // Handle interruption (server detected user speaking during AI response)
        if serverContent["interrupted"] as? Bool == true {
            log("Server: interrupted by user speech")
            stopPlayback()
            state = .listening
            speechScore = 0
            return
        }

        // Handle model turn — audio data
        if let modelTurn = serverContent["modelTurn"] as? [String: Any],
           let parts = modelTurn["parts"] as? [[String: Any]] {
            for part in parts {
                if let inlineData = part["inlineData"] as? [String: Any],
                   let b64 = inlineData["data"] as? String {
                    handleAudioChunk(b64)
                }
            }
        }

        // Handle turn complete
        if serverContent["turnComplete"] as? Bool == true {
            log("turnComplete — \(audioChunkCount) chunks streamed")
            audioChunkCount = 0
            // Player node will finish playing remaining buffers,
            // then we transition to listening via the completion handler
            if state == .aiSpeaking {
                scheduleEndOfTurnTransition()
            }
        }

        // Handle input transcription (user's speech — arrives word-by-word)
        if let inputTranscription = serverContent["inputTranscription"] as? [String: Any],
           let text = inputTranscription["text"] as? String, !text.isEmpty {
            accumulatedUserText += text
            lastUserText = accumulatedUserText.trimmingCharacters(in: .whitespaces)
            log("User: \(lastUserText ?? "")")

            // Debounce zoom trigger — wait 1.5s after last word to get full sentence
            zoomDebounceTask?.cancel()
            zoomDebounceTask = Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                guard !Task.isCancelled else { return }
                let fullText = self.accumulatedUserText.trimmingCharacters(in: .whitespaces)
                if fullText.count > 10 {
                    self.log("Zoom trigger: \"\(fullText)\"")
                    self.triggerZoomFromTranscription(fullText)
                }
                self.accumulatedUserText = ""
            }
        }

        // Handle output transcription (model's speech transcribed)
        if let outputTranscription = serverContent["outputTranscription"] as? [String: Any],
           let text = outputTranscription["text"] as? String, !text.isEmpty {
            log("Dolores: \(text)")
            lastAIText = text
        }
    }

    // MARK: - Artwork Image (local only — for REST zoom pipe)

    /// Loads the artwork image locally for the zoom REST pipe.
    /// Does NOT send anything over the WebSocket — clientContent doesn't support images.
    private func loadArtworkImage() {
        guard !hasLoadedArtworkImage else { return }

        guard let artwork = currentArtwork,
              let imageName = artwork.imageName,
              let url = Bundle.main.url(forResource: imageName, withExtension: "jpg"),
              let imageData = try? Data(contentsOf: url),
              let uiImage = UIImage(data: imageData) else {
            log("No bundled artwork image for zoom")
            return
        }
        hasLoadedArtworkImage = true

        // Compress for REST zoom call (~1MB max)
        let maxBytes = 1024 * 1024
        var zoomData = imageData
        if zoomData.count > maxBytes {
            var quality: CGFloat = 0.6
            while quality > 0.1 {
                if let compressed = uiImage.jpegData(compressionQuality: quality), compressed.count <= maxBytes {
                    zoomData = compressed
                    break
                }
                quality -= 0.1
            }
        }
        artworkImageBase64 = zoomData.base64EncodedString()
        log("Artwork image loaded for zoom (\(zoomData.count / 1024)kB)")
    }

    /// Trigger zoom from AI's spoken text — completely separate from the voice WebSocket
    private func triggerZoomFromTranscription(_ text: String) {
        guard artworkImageBase64 != nil else { return }

        zoomGeneration += 1
        let thisGeneration = zoomGeneration
        log("Zoom pipe: analyzing transcription for visual detail")

        Task {
            let image = await requestZoomedImage(description: text)
            guard self.zoomGeneration == thisGeneration else {
                log("Zoom result discarded (stale)")
                return
            }
            if let image {
                log("Cropped image received (\(Int(image.size.width))x\(Int(image.size.height)))")
                self.zoomedImage = image
            } else {
                log("Zoom: no image returned")
            }
        }
    }

    private func requestZoomedImage(description: String) async -> UIImage? {
        guard let artworkBase64 = artworkImageBase64 else {
            log("No artwork image for zoom")
            return nil
        }

        guard let apiKey = Bundle.main.infoDictionary?["GEMINI_API_KEY"] as? String,
              !apiKey.isEmpty else {
            log("No API key for zoom REST call")
            return nil
        }

        let urlString = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=\(apiKey)"
        guard let url = URL(string: urlString) else { return nil }

        let prompt = """
        The visitor asked about this artwork: "\(description)".
        Identify the most relevant visual area of the artwork related to their question.
        Use code execution with PIL to crop and zoom into that region from the input image and save the cropped result.
        The crop should show roughly 30-50% of the image, focused on the detail most relevant to their question.
        If the question is very general (like "tell me about this"), crop the most visually striking area.
        """

        let body: [String: Any] = [
            "contents": [
                [
                    "parts": [
                        [
                            "inlineData": [
                                "mimeType": "image/jpeg",
                                "data": artworkBase64
                            ]
                        ],
                        ["text": prompt]
                    ]
                ]
            ],
            "tools": [
                ["codeExecution": [:] as [String: Any]]
            ],
            "generationConfig": [
                "temperature": 0.2
            ]
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else {
            log("Failed to serialize zoom request")
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData
        request.timeoutInterval = 30

        log("Sending zoom REST request...")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else { return nil }
            log("Zoom response status: \(httpResponse.statusCode)")

            guard httpResponse.statusCode == 200 else {
                if let errorText = String(data: data, encoding: .utf8) {
                    log("Zoom error: \(String(errorText.prefix(200)))")
                }
                return nil
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let candidates = json["candidates"] as? [[String: Any]],
                  let content = candidates.first?["content"] as? [String: Any],
                  let parts = content["parts"] as? [[String: Any]] else {
                let snippet = String(data: data.prefix(500), encoding: .utf8) ?? "nil"
                log("Zoom: could not parse response: \(snippet)")
                return nil
            }

            let partTypes = parts.map { part -> String in
                if part["text"] != nil { return "text" }
                if part["executableCode"] != nil { return "executableCode" }
                if part["codeExecutionResult"] != nil { return "codeExecutionResult" }
                if part["inlineData"] != nil { return "inlineData" }
                return "unknown(\(part.keys.sorted()))"
            }
            log("Zoom response parts: \(partTypes)")

            // Look for inlineData part (the generated/cropped image)
            for part in parts {
                if let inlineData = part["inlineData"] as? [String: Any],
                   let mimeType = inlineData["mimeType"] as? String,
                   mimeType.starts(with: "image/"),
                   let b64 = inlineData["data"] as? String,
                   let imageData = Data(base64Encoded: b64),
                   let image = UIImage(data: imageData) {
                    log("Zoom: got cropped image (\(imageData.count / 1024)kB)")
                    return image
                }
            }

            // Log codeExecutionResult for debugging
            for part in parts {
                if let result = part["codeExecutionResult"] as? [String: Any] {
                    let outcome = result["outcome"] as? String ?? "unknown"
                    let output = (result["output"] as? String ?? "").prefix(200)
                    log("Zoom: codeExecutionResult outcome=\(outcome), output=\(output)")
                }
            }
            log("Zoom: no image in response parts")
            return nil
        } catch {
            log("Zoom request failed: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Streaming Audio Playback

    private func handleAudioChunk(_ base64: String) {
        guard let data = Data(base64Encoded: base64) else {
            log("ERROR: Failed to decode audio base64")
            return
        }

        audioChunkCount += 1

        if state != .aiSpeaking {
            state = .aiSpeaking
            log("AI speaking... (streaming)")
        }

        // Convert PCM16 → Float32 and schedule on player node
        scheduleAudioData(data)

        if audioChunkCount <= 2 {
            log("Audio chunk #\(audioChunkCount): \(data.count) bytes")
        }
    }

    private func scheduleAudioData(_ pcmData: Data) {
        guard let playerNode, let playerFormat else { return }

        let frameCount = pcmData.count / 2  // PCM16 = 2 bytes per frame
        guard frameCount > 0 else { return }

        guard let buffer = AVAudioPCMBuffer(pcmFormat: playerFormat, frameCapacity: AVAudioFrameCount(frameCount)) else { return }
        buffer.frameLength = AVAudioFrameCount(frameCount)

        let floatPtr = buffer.floatChannelData![0]
        pcmData.withUnsafeBytes { raw in
            let int16Ptr = raw.bindMemory(to: Int16.self)
            for i in 0..<frameCount {
                floatPtr[i] = Float(int16Ptr[i]) / 32768.0
            }
        }

        playerNode.scheduleBuffer(buffer)
    }

    private func stopPlayback() {
        playerNode?.stop()
        playerNode?.play()  // Re-arm for next response
        audioChunkCount = 0
    }

    /// After turnComplete, schedule an empty buffer with completion to transition state
    private func scheduleEndOfTurnTransition() {
        guard let playerNode, let playerFormat else {
            state = .listening
            speechScore = 0
            return
        }

        // Schedule a tiny silent buffer with completion handler
        let silentBuffer = AVAudioPCMBuffer(pcmFormat: playerFormat, frameCapacity: 1)!
        silentBuffer.frameLength = 1
        silentBuffer.floatChannelData![0][0] = 0

        playerNode.scheduleBuffer(silentBuffer) { [weak self] in
            Task { @MainActor in
                guard let self, self.state == .aiSpeaking else { return }
                self.log("Playback finished — listening")
                self.state = .listening
                self.speechScore = 0
            }
        }
    }

    // MARK: - Audio Engine (Mic Capture)

    private func startAudioEngine() {
        do {
            let session = AVAudioSession.sharedInstance()
            // voiceChat mode provides echo cancellation so mic stays live during AI speech
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
            let route = session.currentRoute.outputs.map { "\($0.portName)(\($0.portType.rawValue))" }.joined(separator: ", ")
            log("Audio route: \(route)")
        } catch {
            log("ERROR: Audio session setup: \(error.localizedDescription)")
        }

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let hwFormat = inputNode.inputFormat(forBus: 0)
        log("Mic format: \(hwFormat.sampleRate)Hz, \(hwFormat.channelCount)ch")

        guard hwFormat.sampleRate > 0, hwFormat.channelCount > 0 else {
            log("ERROR: Invalid mic format — no mic available?")
            error = "Microphone unavailable"
            state = .idle
            return
        }

        // Target: 16kHz Int16 mono (what Gemini expects)
        guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: inputSampleRate, channels: 1, interleaved: true) else {
            log("ERROR: Failed to create target format")
            return
        }

        // Attach player node for streaming AI audio output (24kHz Float32 mono)
        let pNode = AVAudioPlayerNode()
        let pFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: outputSampleRate, channels: 1, interleaved: false)!
        engine.attach(pNode)
        engine.connect(pNode, to: engine.mainMixerNode, format: pFormat)
        playerNode = pNode
        playerFormat = pFormat

        // Mic input tap
        inputNode.installTap(onBus: 0, bufferSize: 4800, format: hwFormat) { [weak self] buffer, _ in
            guard let self else { return }
            self.processAndSendMicBuffer(buffer, hwFormat: hwFormat, targetFormat: targetFormat)
        }

        do {
            try engine.start()
            pNode.play()
            audioEngine = engine
            log("Audio engine started — mic + player node active")
        } catch {
            log("ERROR: Engine start failed: \(error.localizedDescription)")
            self.error = "Microphone unavailable"
            state = .idle
        }
    }

    private nonisolated func processAndSendMicBuffer(_ buffer: AVAudioPCMBuffer, hwFormat: AVAudioFormat, targetFormat: AVAudioFormat) {
        let ratio = 16_000.0 / hwFormat.sampleRate
        let frameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
        guard frameCount > 0 else { return }

        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else { return }
        guard let converter = AVAudioConverter(from: hwFormat, to: targetFormat) else { return }

        var gotData = false
        var conversionError: NSError?
        converter.convert(to: convertedBuffer, error: &conversionError) { _, outStatus in
            if gotData {
                outStatus.pointee = .noDataNow
                return nil
            }
            gotData = true
            outStatus.pointee = .haveData
            return buffer
        }

        guard conversionError == nil, convertedBuffer.frameLength > 0 else { return }

        let int16Ptr = convertedBuffer.int16ChannelData![0]
        let byteCount = Int(convertedBuffer.frameLength) * 2
        let data = Data(bytes: int16Ptr, count: byteCount)
        let base64 = data.base64EncodedString()

        // Calculate RMS
        let frameLength = Int(convertedBuffer.frameLength)
        var sumOfSquares: Float = 0
        for i in 0..<frameLength {
            let sample = Float(int16Ptr[i]) / 32768.0
            sumOfSquares += sample * sample
        }
        let rms = sqrtf(sumOfSquares / Float(max(frameLength, 1)))

        Task { @MainActor in
            self.handleMicAudio(base64: base64, rms: rms)
        }
    }

    private func stopAudioEngine() {
        playerNode?.stop()
        playerNode = nil
        playerFormat = nil
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
    }

    // MARK: - Send Mic Audio

    private func handleMicAudio(base64: String, rms: Float) {
        rmsLogCounter += 1
        let logInterval = (isMonitoring || isBuffering) ? 10 : 30
        if rmsLogCounter % logInterval == 0 {
            log("RMS: \(String(format: "%.4f", rms)) | state: \(state)\(isBuffering ? " [buf: \(bufferedAudio.count)]" : "")")
        }

        // Buffering during monitoring→connected transition
        if isBuffering {
            bufferedAudio.append(base64)
            return
        }

        // Monitoring mode — detect speech to auto-start conversation
        if !isConnected {
            // Keep a rolling buffer of recent audio so we capture the first question
            monitoringBuffer.append(base64)
            if monitoringBuffer.count > maxMonitoringBuffer {
                monitoringBuffer.removeFirst()
            }
            detectSpeechForAutoStart(rms: rms)
            return
        }

        // Don't send until session is ready
        guard isSessionReady else { return }

        // While AI is speaking: DON'T send audio (prevents echo loop)
        // Instead, monitor RMS locally for barge-in
        if state == .aiSpeaking {
            if rms > bargeInThreshold {
                bargeInScore += 2
            } else {
                bargeInScore = max(0, bargeInScore - 1)
            }
            if bargeInScore >= bargeInTrigger {
                log("Barge-in detected (RMS: \(String(format: "%.3f", rms))) — stopping AI, listening")
                bargeInScore = 0
                stopPlayback()
                state = .listening
                speechScore = 0
            }
            return
        }

        // Track speech for UI state
        updateSpeechState(rms: rms)
        bargeInScore = 0

        // Send audio to Gemini (using 'audio' field, not deprecated 'mediaChunks')
        let msg: [String: Any] = [
            "realtimeInput": [
                "audio": [
                    "mimeType": "audio/pcm;rate=16000",
                    "data": base64
                ]
            ]
        ]
        sendJSON(msg)
    }

    // MARK: - Local Speech State Tracking (cosmetic)

    private func updateSpeechState(rms: Float) {
        if rms > speechThreshold {
            speechScore = min(speechScore + 2, 10)
        } else {
            speechScore = max(speechScore - 1, 0)
        }

        if state == .listening && speechScore >= speechTrigger {
            state = .userSpeaking
        } else if state == .userSpeaking && speechScore == 0 {
            state = .thinking
        }
    }

    // MARK: - Auto-start from narration

    private func detectSpeechForAutoStart(rms: Float) {
        if rms > monitoringThreshold {
            bargeInScore += 2
        } else {
            bargeInScore = max(0, bargeInScore - 1)
        }
        if bargeInScore >= bargeInTrigger {
            log("Speech detected — audioPlayer: \(audioPlayer != nil ? "SET" : "NIL")")
            bargeInScore = 0
            audioPlayer?.stop()
            speechDetectedDuringNarration = true
            log("speechDetectedDuringNarration = true")
        }
    }

}
