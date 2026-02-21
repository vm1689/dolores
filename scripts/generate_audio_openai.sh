#!/bin/bash
# Generate narration audio using OpenAI TTS API
# Usage: OPENAI_API_KEY=sk-... ./scripts/generate_audio_openai.sh
#
# Prerequisites: curl, OPENAI_API_KEY environment variable
# Output: Dolores/Resources/great_wave.mp3, Dolores/Resources/wheat_field.mp3

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "Error: OPENAI_API_KEY not set"
    echo "Usage: OPENAI_API_KEY=sk-... $0"
    exit 1
fi

VOICE="nova"
MODEL="tts-1"
OUTPUT_DIR="Dolores/Resources"

mkdir -p "$OUTPUT_DIR"

# --- The Great Wave off Kanagawa ---
echo "Generating narration for The Great Wave off Kanagawa..."
curl -s https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL"'",
    "voice": "'"$VOICE"'",
    "input": "Under a towering wave, three boats full of fishermen struggle against the churning sea. In the distance, Mount Fuji sits calmly beneath the chaos — small, still, eternal. This is Hokusai'\''s most famous print from the series Thirty-six Views of Mount Fuji, created when the artist was around seventy years old. The Great Wave captures the raw power of nature set against human vulnerability. Hokusai used Prussian blue, a pigment recently imported from Europe, to achieve the vivid blues that define this image. The composition draws from both Japanese printmaking traditions and Western perspective techniques. It has become one of the most recognized works of art in the world, influencing Impressionists like Monet and Debussy'\''s orchestral piece La Mer. The print measures just about ten by fifteen inches, yet its impact is monumental. Every detail — the spray of the wave, the curve of Fuji, the tiny figures clinging to their boats — was carved in reverse on a woodblock, then printed by hand. Hokusai believed he was only beginning to master his craft. He once wrote that by the age of one hundred and ten, every dot and stroke would be as though alive."
  }' \
  --output "$OUTPUT_DIR/great_wave.mp3"

echo "✓ great_wave.mp3 generated"

# --- Wheat Field with Cypresses ---
echo "Generating narration for Wheat Field with Cypresses..."
curl -s https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL"'",
    "voice": "'"$VOICE"'",
    "input": "Swirling clouds roll above a golden wheat field, while dark cypress trees rise like flames against the sky. Van Gogh painted this during his stay at the Saint-Paul-de-Mausole asylum in Saint-Rémy-de-Provence, just months after his famous breakdown. He called the cypresses beautiful as regards lines and proportions, like an Egyptian obelisk. The painting vibrates with thick, rhythmic brushstrokes — the wheat ripples, the sky pulses, and the cypresses twist upward with an almost living energy. Van Gogh made several versions of this composition, considering it among his best summer landscapes. The Met'\''s version is the final one, completed in his studio. Despite his inner turmoil, there is a profound serenity here — nature rendered not as it looks, but as it feels. The color palette is extraordinary. Golden yellows and ochres clash against deep greens and blues, while white clouds churn with an intensity that seems to echo the artist'\''s own restless mind. Van Gogh wrote to his brother Theo that the cypresses were always occupying his thoughts, saying he wanted to make something of them like the canvases of sunflowers. This painting is that vision, fully realized."
  }' \
  --output "$OUTPUT_DIR/wheat_field.mp3"

echo "✓ wheat_field.mp3 generated"
echo ""
echo "Done! Audio files saved to $OUTPUT_DIR/"
