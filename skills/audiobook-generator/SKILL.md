# Audiobook Generator Skill

Convert PDF documents into professional audiobooks and upload them to YouTube.

## Description

This skill automates the complete audiobook generation pipeline:

1. **PDF Text Extraction** - Extracts text from PDF documents, preserving chapter structure
2. **Text Processing** - Cleans and prepares text for speech generation
3. **Chapter Detection** - Intelligently identifies chapter boundaries
4. **TTS Generation** - Converts text to speech using high-quality TTS providers (Edge TTS, OpenAI, ElevenLabs)
5. **Audio Concatenation** - Combines audio chunks into complete chapter files using ffmpeg
6. **YouTube Upload** - Automated upload to YouTube via browser automation

## Use Cases

- Convert study materials (textbooks, whitepapers) into audiobooks for interview prep
- Generate audio versions of technical documentation
- Create podcast-style content from written materials
- Accessibility: Make written content available in audio format

## Usage

```
/audiobook-generate --pdf "~/Downloads/MyBook.pdf" --output-dir "~/audiobooks" --voice "en-US-MichelleNeural"
```

### Parameters

- `pdf` (required): Path to the PDF file
- `output-dir` (optional): Directory for output audio files (default: `~/audiobooks`)
- `voice` (optional): TTS voice to use (default: configured TTS voice)
- `provider` (optional): TTS provider (`edge`, `openai`, `elevenlabs`)
- `chapters` (optional): Comma-separated chapter numbers to generate (default: all)
- `upload-youtube` (optional): Auto-upload to YouTube (default: false)
- `youtube-playlist` (optional): YouTube playlist ID to add videos to

### Examples

```
# Basic usage - generate audiobook from PDF
/audiobook-generate --pdf "~/Downloads/Databricks Big Book Of GenAI FINAL.pdf"

# Use specific voice
/audiobook-generate --pdf "~/Downloads/MyBook.pdf" --voice "en-GB-RyanNeural"

# Generate specific chapters only
/audiobook-generate --pdf "~/Downloads/MyBook.pdf" --chapters "1,2,3,5"

# Generate and upload to YouTube
/audiobook-generate --pdf "~/Downloads/MyBook.pdf" --upload-youtube true

# Full pipeline with custom settings
/audiobook-generate --pdf "~/Downloads/Study.pdf" --output-dir "~/study-audio" --provider "elevenlabs" --upload-youtube true --youtube-playlist "PLxxx"
```

## Requirements

### Software Dependencies

- **ffmpeg**: For audio processing and concatenation
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  sudo apt-get install ffmpeg

  # Windows (via Chocolatey)
  choco install ffmpeg
  ```

### TTS Provider Setup

Configure at least one TTS provider in your `moltbot.json`:

```json
{
  "messages": {
    "tts": {
      "enabled": true,
      "provider": "edge",
      "edge": {
        "enabled": true,
        "voice": "en-US-MichelleNeural"
      },
      "openai": {
        "apiKey": "sk-...",
        "model": "tts-1-hd",
        "voice": "nova"
      },
      "elevenlabs": {
        "apiKey": "...",
        "voiceId": "pMsXgVXv3BLzUgSXRplE",
        "modelId": "eleven_multilingual_v2"
      }
    }
  }
}
```

### YouTube Upload (Optional)

For YouTube upload functionality, ensure:
- Logged into YouTube in the browser tool
- Or provide YouTube credentials for automation

## Implementation Details

### Chapter Detection Algorithm

The skill uses multiple strategies to detect chapters:

1. **Table of Contents Parsing** - Extracts chapter info from TOC
2. **Heading Pattern Matching** - Detects "Chapter X", "CHAPTER X:", etc.
3. **Page Break Analysis** - Identifies major section breaks
4. **Font Size Changes** - Detects heading size changes
5. **Numbering Patterns** - Recognizes numbered sections (1., 2., 3., etc.)

### Text Processing Pipeline

1. **Cleanup** - Removes headers, footers, page numbers
2. **Hyphenation** - Joins hyphenated words split across lines
3. **Paragraph Reconstruction** - Fixes line breaks within paragraphs
4. **Acronym Expansion** - Expands common acronyms for better speech
5. **Number Formatting** - Converts numbers to speakable format

### TTS Generation Strategy

- **Chunk Size**: Text is split into ~1500 character chunks (configurable)
- **Overlap**: Small overlap between chunks to avoid cut-off sentences
- **Rate Limiting**: Respects provider rate limits with automatic retry
- **Progress Tracking**: Shows real-time progress during generation

### Audio Processing

- **Format**: MP3 (256kbps, 44.1kHz stereo)
- **Silence Padding**: Adds 1s silence between chapters
- **Normalization**: Applies volume normalization across all chunks
- **Metadata**: Embeds chapter titles, author, book title in audio files

### Output Structure

```
~/audiobooks/
  └── Databricks_Big_Book_Of_GenAI_FINAL/
      ├── metadata.json              # Book metadata
      ├── chapters/                  # Individual chapters
      │   ├── chapter_01.mp3
      │   ├── chapter_02.mp3
      │   └── ...
      ├── full_audiobook.mp3         # Complete concatenated audiobook
      └── youtube/                   # YouTube upload files
          ├── chapter_01_youtube.mp4
          ├── chapter_02_youtube.mp4
          └── ...
```

## Error Handling

The skill includes comprehensive error handling:

- **PDF Extraction Failures** - Falls back to OCR if text extraction fails
- **TTS Provider Failures** - Automatically tries fallback providers
- **Rate Limiting** - Implements exponential backoff for API rate limits
- **Resume Capability** - Can resume from last successful chapter if interrupted
- **Validation** - Validates audio files before concatenation

## Performance

### Typical Processing Times (118-page PDF example)

- PDF Extraction: ~5 seconds
- Chapter Detection: ~2 seconds
- Text Processing: ~10 seconds
- TTS Generation: ~20-60 minutes (depending on provider and length)
  - Edge TTS: Fastest (free, ~15-20 mins for 118 pages)
  - OpenAI TTS: Medium (~30-40 mins)
  - ElevenLabs: Slower but highest quality (~45-60 mins)
- Audio Concatenation: ~30 seconds
- YouTube Upload: ~5-15 minutes per chapter (depends on file size and bandwidth)

**Total Pipeline**: ~30-90 minutes for a 118-page book

### Optimization Tips

1. Use Edge TTS for fastest processing (free, good quality)
2. Process chapters in parallel (set `--parallel-chunks 3`)
3. Pre-process PDF to remove unnecessary pages (cover, index, etc.)
4. Use `--chapters` to generate specific chapters first for testing

## Limitations

- **PDF Quality**: Requires PDF with extractable text (not scanned images)
- **Language**: Best results with English content (TTS quality varies by language)
- **Length**: Very long books (500+ pages) may take several hours
- **TTS Limits**: Some providers have daily character limits
- **File Size**: YouTube has upload size limits (256GB/video)

## Future Enhancements

- [ ] Multi-language support with automatic language detection
- [ ] Voice cloning for consistent narrator voice
- [ ] Background music mixing
- [ ] Chapter-specific voice selection
- [ ] Automated thumbnail generation for YouTube
- [ ] Podcast RSS feed generation
- [ ] Spotify upload integration

## Troubleshooting

### "ffmpeg not found"
```bash
# Install ffmpeg first
brew install ffmpeg  # macOS
```

### "PDF extraction failed"
- Ensure PDF has extractable text (not a scanned image)
- Try converting scanned PDFs with OCR first
- Check file permissions

### "TTS provider failed"
- Verify API keys are correctly configured
- Check provider rate limits
- Try fallback provider (Edge TTS as free option)

### "YouTube upload failed"
- Ensure logged into YouTube in browser
- Check video file size limits
- Verify channel permissions

## License

MIT - Part of Moltbot ecosystem
