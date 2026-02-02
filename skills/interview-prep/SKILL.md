# Interview Prep Audio Generator Skill

Convert PDFs and text into audio summaries (MP4) and send to WhatsApp for interview preparation.

## Overview

This skill streamlines interview prep by converting technical papers, study notes, or any text content into audio files that can be consumed on-the-go. The MP4 output is optimized for WhatsApp delivery.

## Workflow

```mermaid
graph LR
    A[PDF/Text Input] --> B[Extract Text]
    B --> C[Clean for TTS]
    C --> D[Generate Audio MP3]
    D --> E[Convert to MP4]
    E --> F[Send to WhatsApp]
```

## Technical Details

### Text Extraction
- **PDF**: Uses `pdfjs-dist` library (same as audiobook-generator)
- **Text Files**: Direct UTF-8 read
- **Raw Text**: Accepts inline text content

### Text Cleaning
Applies the following transformations for TTS compatibility:
- Remove multiple spaces
- Remove page numbers
- Fix hyphenated line breaks
- Remove URLs
- Expand abbreviations (e.g., i.e., etc.)
- Sanitize `<` and `>` characters (breaks Edge TTS)

### Audio Generation
Leverages the existing `textToSpeech()` system:
- **Edge TTS** (default): Free, fast, good quality
- **OpenAI TTS**: `gpt-4o-mini-tts` model
- **ElevenLabs**: Highest quality, paid

### MP4 Conversion
Uses ffmpeg to create video wrapper:
```bash
ffmpeg -f lavfi -i "color=c=black:s=1280x720" \
  -i audio.mp3 \
  -shortest \
  -c:v libx264 -c:a aac \
  -pix_fmt yuv420p \
  -y output.mp4
```

- **Resolution**: 1280x720 (720p)
- **Video Codec**: H.264 (libx264)
- **Audio Codec**: AAC
- **Background**: Static black image

### WhatsApp Delivery
Uses `sendMessageWhatsApp()` from web provider:
- Sends MP4 as media attachment
- Includes caption: "📚 Interview prep audio ready!"
- Returns message ID and JID

## Configuration

### TTS Settings
Configure in `~/.clawdbot/config/config.json`:

```json
{
  "messages": {
    "tts": {
      "enabled": true,
      "provider": "edge",
      "edge": {
        "voice": "en-US-MichelleNeural"
      },
      "openai": {
        "apiKey": "sk-...",
        "model": "gpt-4o-mini-tts",
        "voice": "alloy"
      },
      "elevenlabs": {
        "apiKey": "...",
        "voiceId": "pMsXgVXv3BLzUgSXRplE"
      }
    }
  }
}
```

### WhatsApp Connection
Requires active WhatsApp connection. Check status:
```bash
moltbot channels status
```

## Usage Examples

### Basic Usage (PDF)
```bash
moltbot interview-prep \
  --input ~/Documents/system-design-paper.pdf \
  --phone "+1234567890"
```

### Custom Voice and Provider
```bash
moltbot interview-prep \
  --input ~/study-notes.txt \
  --phone "+1234567890" \
  --provider openai \
  --voice nova
```

### Generate Only (Skip WhatsApp)
```bash
moltbot interview-prep \
  --input ~/paper.pdf \
  --phone "+1234567890" \
  --skipWhatsApp true
```

### Truncate Long Documents
```bash
moltbot interview-prep \
  --input ~/long-paper.pdf \
  --phone "+1234567890" \
  --maxLength 2000
```

## Output Structure

```
~/interview-prep/{timestamp}/
├── content.txt          # Cleaned text content
├── <temp>.mp3          # Generated audio (temporary)
├── interview-prep.mp4  # Final MP4 (sent to WhatsApp)
└── metadata.json       # Generation metadata
```

### Metadata Format
```json
{
  "timestamp": "2024-01-15T10-30-00",
  "sourceType": "pdf",
  "input": "~/paper.pdf",
  "phone": "+1234567890",
  "provider": "edge",
  "voice": "en-US-MichelleNeural",
  "maxLength": 4000,
  "textLength": 3542,
  "files": {
    "text": "~/interview-prep/.../content.txt",
    "audio": "~/.clawdbot/audio/....mp3",
    "mp4": "~/interview-prep/.../interview-prep.mp4"
  },
  "whatsapp": {
    "messageId": "...",
    "toJid": "1234567890@s.whatsapp.net"
  }
}
```

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| PDF file not found | Invalid path | Check file path, use absolute or ~/relative |
| TTS failed | No API key or service down | Check config, verify API keys |
| ffmpeg not found | ffmpeg not installed | `brew install ffmpeg` (macOS) |
| WhatsApp send failed | No active connection | Run `moltbot channels status --probe` |

## Performance

Typical generation times:
- **PDF Extraction**: ~0.1-0.5s (100-page doc)
- **TTS Generation**: ~5-30s (Edge TTS, 4000 chars)
- **MP4 Conversion**: ~1-3s (ffmpeg)
- **WhatsApp Send**: ~2-5s (upload + delivery)

**Total**: ~10-40 seconds for typical use case

## Dependencies

- `@sinclair/typebox` - Schema validation
- `pdfjs-dist` - PDF text extraction (from audiobook-generator)
- `ffmpeg` (system binary) - MP4 conversion
- `src/tts/tts.ts` - Text-to-speech generation
- `src/web/outbound.ts` - WhatsApp sending

## Future Enhancements

Potential improvements:
- [ ] AI-powered summarization before TTS
- [ ] Chapter detection for long documents
- [ ] Custom background images/visualizations for MP4
- [ ] Support for PowerPoint/Word documents
- [ ] Multi-language support
- [ ] Batch processing for multiple files
- [ ] Custom audio effects (speed, pitch)

## Comparison with audiobook-generator

| Feature | interview-prep | audiobook-generator |
|---------|---------------|---------------------|
| **Use Case** | Quick summaries for mobile | Full audiobooks with chapters |
| **Output** | MP4 (WhatsApp) | MP3 (local) |
| **Length** | Short (default 4000 chars) | Full document |
| **Delivery** | WhatsApp auto-send | Local files only |
| **Chapter Support** | No | Yes |
| **YouTube Upload** | No | Yes |
| **Processing Time** | ~10-40s | ~20-60 mins |

## License

Same as parent Moltbot project.
