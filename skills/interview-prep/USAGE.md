# Interview Prep Usage Guide

## Quick Start

### Via WhatsApp (Recommended)

1. **Send a PDF to your Moltbot WhatsApp**
2. **Ask the bot to create an interview prep audio:**
   ```
   Can you create an interview prep audio from this PDF and send it back to me?
   ```

The bot will:
- Extract text from the PDF
- Generate TTS audio
- Convert to MP4 format
- Send it back to you on WhatsApp

### Via CLI (Direct)

If you have Moltbot CLI installed:

```bash
# From PDF
moltbot agent --message "Use the interview-prep tool on ~/Documents/tech-paper.pdf and send to +1234567890"

# With custom settings
moltbot agent --message "Use interview-prep tool: input=~/paper.pdf, phone=+1234567890, provider=openai, voice=nova"
```

## Usage Examples

### Example 1: Tech Paper for Interview Prep

**Scenario:** You have a PDF about system design patterns that you want to listen to during your commute.

```bash
# Via WhatsApp
Send PDF to Moltbot → "Create interview prep audio from this and send it back"

# Via CLI
moltbot agent --message "interview-prep: pdf=~/Downloads/system-design.pdf, phone=+19876543210"
```

**Result:**
- Extracts text from PDF (~10-50 pages typical)
- Generates 5-15 minute audio summary
- MP4 file sent to your WhatsApp
- Accessible in `~/interview-prep/{timestamp}/`

### Example 2: Study Notes to Audio

**Scenario:** You have written study notes in a text file and want audio for review.

```bash
# Via WhatsApp (send text file)
Send TXT to Moltbot → "Make this into an audio summary for interview prep"

# Via CLI
moltbot agent --message "interview-prep: input=~/Documents/study-notes.txt, phone=+19876543210, maxLength=2000"
```

**Result:**
- Converts first 2000 characters to audio
- ~3-5 minute audio file
- MP4 sent to WhatsApp

### Example 3: Long Paper (Truncate to Summary)

**Scenario:** You have a 100-page research paper but only want the first 3000 characters as audio.

```bash
moltbot agent --message "interview-prep: input=~/research.pdf, phone=+19876543210, maxLength=3000"
```

**Result:**
- Extracts first 3000 chars from PDF
- ~5-7 minute audio
- Perfect for high-level overview

### Example 4: Generate MP4 Only (No WhatsApp Send)

**Scenario:** You want to generate the MP4 locally without sending to WhatsApp.

```bash
moltbot agent --message "interview-prep: input=~/paper.pdf, phone=+1234567890, skipWhatsApp=true"
```

**Result:**
- MP4 generated at `~/interview-prep/{timestamp}/interview-prep.mp4`
- Not sent to WhatsApp (even though phone is required parameter)

### Example 5: Custom Voice (OpenAI)

**Scenario:** You prefer OpenAI's "nova" voice for better quality.

**Prerequisites:**
- OpenAI API key configured in `~/.clawdbot/config/config.json`

```bash
moltbot agent --message "interview-prep: input=~/paper.pdf, phone=+19876543210, provider=openai, voice=nova"
```

**Available OpenAI voices:**
- `alloy` - Balanced, neutral
- `echo` - Clear, expressive
- `fable` - Warm, storytelling
- `onyx` - Deep, authoritative
- `nova` - Bright, energetic
- `shimmer` - Soft, calm

### Example 6: Raw Text Input

**Scenario:** You have text content directly (not a file).

```bash
moltbot agent --message 'interview-prep: input="Key concepts for interview: 1. System design patterns... 2. Database indexing... 3. Load balancing...", phone=+19876543210'
```

**Result:**
- Converts inline text to audio
- Quick way to create audio from paste/copy content

## Output Structure

Every interview prep generation creates a timestamped directory:

```
~/interview-prep/2024-01-15T10-30-00/
├── content.txt           # Cleaned text content (TTS-ready)
├── interview-prep.mp4    # Final MP4 video file
└── metadata.json         # Generation metadata
```

### metadata.json Example

```json
{
  "timestamp": "2024-01-15T10-30-00",
  "sourceType": "pdf",
  "input": "~/Documents/system-design.pdf",
  "phone": "+19876543210",
  "provider": "edge",
  "voice": "en-US-MichelleNeural",
  "maxLength": 4000,
  "textLength": 3542,
  "files": {
    "text": "~/interview-prep/2024-01-15T10-30-00/content.txt",
    "audio": "~/.clawdbot/audio/abc123.mp3",
    "mp4": "~/interview-prep/2024-01-15T10-30-00/interview-prep.mp4"
  },
  "whatsapp": {
    "messageId": "3A1234567890ABCDEF",
    "toJid": "19876543210@s.whatsapp.net"
  }
}
```

## Configuration

### TTS Provider Setup

#### Edge TTS (Default, Free)
No setup required! Just works out of the box.

#### OpenAI TTS
Add to `~/.clawdbot/config/config.json`:

```json
{
  "messages": {
    "tts": {
      "openai": {
        "apiKey": "sk-proj-...",
        "model": "gpt-4o-mini-tts",
        "voice": "nova"
      }
    }
  }
}
```

#### ElevenLabs
Add to `~/.clawdbot/config/config.json`:

```json
{
  "messages": {
    "tts": {
      "elevenlabs": {
        "apiKey": "...",
        "voiceId": "pMsXgVXv3BLzUgSXRplE",
        "modelId": "eleven_multilingual_v2"
      }
    }
  }
}
```

### WhatsApp Setup

Ensure WhatsApp is connected:

```bash
moltbot channels status
```

If not connected:

```bash
moltbot channels add whatsapp
```

## Tips & Best Practices

### 1. **Optimal Text Length**
- **Short summaries** (2000-4000 chars): 3-7 minutes of audio
- **Medium content** (4000-8000 chars): 7-15 minutes of audio
- **Long content** (>8000 chars): Consider breaking into multiple parts

### 2. **Choose the Right Voice**
- **Edge TTS**: Free, fast, good quality (default)
- **OpenAI**: Better naturalness, more voice options
- **ElevenLabs**: Best quality, but costs money

### 3. **PDF Quality Matters**
- Scanned PDFs (images) won't work - text must be extractable
- Test with `pdftotext yourfile.pdf` to verify text extraction

### 4. **WhatsApp File Size Limits**
- WhatsApp has a ~16MB file size limit for media
- Keep audio under 20 minutes to stay within limits
- Use `maxLength` to control output size

### 5. **Batch Processing**
For multiple files, process separately:

```bash
# Process 3 papers
for file in ~/papers/*.pdf; do
  moltbot agent --message "interview-prep: input=$file, phone=+19876543210"
done
```

## Troubleshooting

### "PDF file not found"
- Use absolute paths: `~/Documents/file.pdf` or `/Users/you/file.pdf`
- Check file exists: `ls ~/Documents/file.pdf`

### "TTS failed"
- Check provider API key is configured
- Verify provider is enabled in config
- Try default Edge TTS: `provider=edge`

### "WhatsApp send failed"
- Check WhatsApp connection: `moltbot channels status --probe`
- Reconnect: `moltbot channels add whatsapp`
- Verify phone number format: `+1234567890` (E.164)

### "ffmpeg not found"
Install ffmpeg:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (via chocolatey)
choco install ffmpeg
```

### Audio is too long
Reduce `maxLength`:

```bash
moltbot agent --message "interview-prep: input=~/paper.pdf, phone=+19876543210, maxLength=2000"
```

## Workflow Integration

### Morning Commute Routine

1. **Night before:** Email PDFs to yourself
2. **Morning:** Forward PDF to Moltbot WhatsApp
3. **Ask:** "Create interview prep audio from this"
4. **Receive:** MP4 in ~30-60 seconds
5. **Listen:** During commute

### Study Session Workflow

1. **Take notes** in any text editor
2. **Save** as `study-notes.txt`
3. **Generate audio:** Send file to Moltbot → "Make audio"
4. **Review** while exercising/walking

### Weekly Tech Paper Review

1. **Bookmark papers** throughout the week
2. **Friday evening:** Batch process all papers
3. **Weekend:** Listen to summaries during chores/exercise

## Advanced Usage

### Custom Text Cleaning

If you need custom text preprocessing, you can:

1. Pre-process PDF text yourself
2. Save cleaned text to file
3. Use `input=~/cleaned-text.txt`

### Integration with Other Tools

#### With Zapier/IFTTT
- Email → Moltbot WhatsApp → Auto-generate audio
- Save to Google Drive → Trigger generation

#### With Shortcuts (iOS)
Create a shortcut that:
1. Accepts PDF from share sheet
2. Sends to Moltbot WhatsApp
3. Requests audio generation

## Performance

| Text Length | Edge TTS Time | OpenAI Time | ElevenLabs Time |
|-------------|---------------|-------------|-----------------|
| 1000 chars  | ~10-15s       | ~15-20s     | ~20-30s         |
| 2000 chars  | ~15-25s       | ~25-35s     | ~35-50s         |
| 4000 chars  | ~25-40s       | ~40-60s     | ~60-90s         |
| 8000 chars  | ~45-75s       | ~75-120s    | ~120-180s       |

*Times include: PDF extraction + TTS generation + MP4 conversion + WhatsApp upload*

## Cost Estimates

### Edge TTS
- **Free** - No API costs

### OpenAI TTS (gpt-4o-mini-tts)
- **$0.015 per 1000 characters**
- 4000 char summary = ~$0.06

### ElevenLabs
- **Pricing varies by plan**
- Typically $0.30-$1.00 per 1000 characters
- 4000 char summary = ~$1.20-$4.00

## FAQ

**Q: Can I use this for non-PDF files?**
A: Yes! Text files (.txt), raw text input, and PDFs all work.

**Q: Does it support multiple languages?**
A: Yes, if your TTS provider supports it. ElevenLabs has the best multi-language support.

**Q: Can I customize the MP4 background?**
A: Currently uses a static black background. Future versions may support custom images.

**Q: Will this work on large PDFs (100+ pages)?**
A: Yes, but use `maxLength` to limit output. Full 100-page conversion would create a very long audio file.

**Q: Can I share the MP4 on other platforms?**
A: Yes! The MP4 is saved locally. You can share it anywhere - Email, Slack, Discord, etc.

**Q: Does this support summarization/AI editing?**
A: Currently extracts text as-is. Future versions will add AI summarization.

---

**Need help?** Open an issue at https://github.com/moltbot/moltbot/issues
