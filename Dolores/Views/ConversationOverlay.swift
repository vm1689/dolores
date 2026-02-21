import SwiftUI

struct ConversationOverlay: View {
    let state: ConversationState
    var userText: String?
    var aiText: String?
    var onInterrupt: (() -> Void)?

    var body: some View {
        VStack(spacing: 8) {
            // Transcription snippet
            if let text = displayText {
                Text(text)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.horizontal, 16)
                    .transition(.opacity)
            }

            // Status pill
            HStack(spacing: 12) {
                indicator
                    .frame(width: 24, height: 24)

                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(labelColor)
            }
            .onTapGesture {
                if state == .aiSpeaking || state == .thinking {
                    onInterrupt?()
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.06))
                    .background(
                        Capsule()
                            .fill(.ultraThinMaterial)
                    )
                    .clipShape(Capsule())
            )
            .overlay(
                Capsule()
                    .stroke(borderColor, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.3), radius: 16, y: 6)
        }
        .animation(.easeInOut(duration: 0.25), value: state)
        .animation(.easeInOut(duration: 0.2), value: displayText)
    }

    private var displayText: String? {
        switch state {
        case .thinking, .aiSpeaking:
            if let t = userText { return "\"\(t)\"" }
            return nil
        default:
            return nil
        }
    }

    // MARK: - Styling

    private var labelColor: Color {
        switch state {
        case .idle: return .gray
        case .monitoring: return .white.opacity(0.7)
        case .connecting: return .white.opacity(0.6)
        case .listening: return .white
        case .userSpeaking: return Color("AccentColor")
        case .thinking: return .white.opacity(0.7)
        case .aiSpeaking: return .white
        }
    }

    private var borderColor: Color {
        switch state {
        case .userSpeaking: return Color("AccentColor").opacity(0.4)
        case .aiSpeaking: return Color.white.opacity(0.15)
        default: return Color.white.opacity(0.08)
        }
    }

    // MARK: - Label

    private var label: String {
        switch state {
        case .idle:
            return "Ready to listen"
        case .monitoring:
            return "Ask me anything..."
        case .connecting:
            return "Connecting..."
        case .listening:
            return "Ask me anything..."
        case .userSpeaking:
            return "Listening..."
        case .thinking:
            return "Thinking..."
        case .aiSpeaking:
            return "Speaking... tap to interrupt"
        }
    }

    // MARK: - Indicator

    @ViewBuilder
    private var indicator: some View {
        switch state {
        case .idle:
            Image(systemName: "waveform")
                .font(.system(size: 13))
                .foregroundColor(.gray)

        case .connecting:
            ProgressView()
                .scaleEffect(0.65)
                .tint(.white.opacity(0.6))

        case .monitoring:
            LiveDot(color: Color("AccentColor"))

        case .listening:
            LiveDot(color: Color("AccentColor"))

        case .userSpeaking:
            WaveformBars(color: Color("AccentColor"))

        case .thinking:
            BouncingDots()

        case .aiSpeaking:
            WaveformBars(color: .white)
        }
    }
}

// MARK: - Live Dot (pulsing)

private struct LiveDot: View {
    let color: Color
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.25))
                .scaleEffect(pulse ? 1.8 : 0.6)
                .opacity(pulse ? 0 : 0.8)

            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
    }
}

// MARK: - Waveform Bars

private struct WaveformBars: View {
    let color: Color
    @State private var phase = false

    var body: some View {
        HStack(spacing: 2.5) {
            ForEach(0..<4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(color)
                    .frame(width: 3, height: phase ? heights[i] : 3)
                    .animation(
                        .easeInOut(duration: 0.4)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.1),
                        value: phase
                    )
            }
        }
        .onAppear { phase = true }
    }

    private var heights: [CGFloat] { [10, 16, 7, 13] }
}

// MARK: - Bouncing Dots

private struct BouncingDots: View {
    @State private var bounce = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white.opacity(0.7))
                    .frame(width: 5, height: 5)
                    .offset(y: bounce ? -3 : 3)
                    .animation(
                        .easeInOut(duration: 0.45)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.12),
                        value: bounce
                    )
            }
        }
        .onAppear { bounce = true }
    }
}
