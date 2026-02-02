# Interview Prep Audio Generator

Generate audio summaries (MP4) from PDFs or text and send to WhatsApp for interview preparation.

## Quick Start

```bash
# From PDF
moltbot interview-prep \
  --input ~/Documents/tech-paper.pdf \
  --phone "+1234567890"

# From text file
moltbot interview-prep \
  --input ~/notes.txt \
  --phone "+1234567890"

# With custom voice and provider
moltbot interview-prep \
  --input ~/paper.pdf \
  --phone "+1234567890" \
  --provider openai \
  --voice alloy
```

## Features

- **PDF Support**: Extracts text from PDFs automatically
- **Text Input**: Also accepts raw text or text files
- **Multiple TTS Providers**: Edge TTS (free), OpenAI, ElevenLabs
- **MP4 Output**: Creates video file for WhatsApp compatibility
- **Auto-delivery**: Sends directly to WhatsApp

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | string | ✅ | PDF file path, text file path, or raw text |
| `phone` | string | ✅ | WhatsApp number (E.164 format, e.g., +1234567890) |
| `voice` | string | ❌ | TTS voice name (provider-specific) |
| `provider` | string | ❌ | TTS provider: edge (default), openai, elevenlabs |
| `maxLength` | number | ❌ | Max characters to convert (default: 4000) |
| `skipWhatsApp` | boolean | ❌ | Skip sending, only generate MP4 (default: false) |

## Output

Files are saved to `~/interview-prep/{timestamp}/`:
- `content.txt` - Cleaned text content
- `interview-prep.mp4` - Final video file (sent to WhatsApp)
- `metadata.json` - Generation metadata

## Examples

### Basic PDF to WhatsApp
```bash
moltbot interview-prep \
  --input ~/Downloads/research-paper.pdf \
  --phone "+19876543210"
```

### Generate MP4 without sending
```bash
moltbot interview-prep \
  --input ~/notes.txt \
  --phone "+19876543210" \
  --skipWhatsApp true
```

### Long document (truncate to 2000 chars)
```bash
moltbot interview-prep \
  --input ~/long-paper.pdf \
  --phone "+19876543210" \
  --maxLength 2000
```

## Requirements

- **ffmpeg**: Required for MP4 conversion
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt install ffmpeg
  ```

- **WhatsApp Connection**: Requires active WhatsApp connection (see `moltbot channels status`)

## TTS Providers

### Edge TTS (Default, Free)
No configuration needed. Fast and free.

### OpenAI TTS
Requires API key in config:
```json
{
  "messages": {
    "tts": {
      "openai": {
        "apiKey": "sk-..."
      }
    }
  }
}
```

### ElevenLabs
Requires API key in config:
```json
{
  "messages": {
    "tts": {
      "elevenlabs": {
        "apiKey": "..."
      }
    }
  }
}
```

## Use Cases

- **Interview Prep**: Convert tech papers to audio for commute listening
- **Study Notes**: Turn written notes into audio reviews
- **Quick Summaries**: Generate audio from meeting notes
- **Mobile Learning**: Consume technical content hands-free

## Limitations

- Maximum text length enforced to prevent very long audio files
- MP4 has static black background (video wrapper for audio)
- WhatsApp requires active connection to send

## See Also

- [audiobook-generator](../audiobook-generator/) - Full audiobook generation with chapters
- [TTS Documentation](../../docs/features/tts.md) - Text-to-speech configuration
