# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.0 - 2026-11-17

First release.

- `npm run make -- <composition>`: render, level narrated audio (measured and printed, -14 LUFS, -2 dBTP ceiling) and write the SRT in one command.
- Timing engine: one scene per narration line, strict word cues (`cue(scene, 'word', nth)`), burned-in captions cut at punctuation and dashes.
- `Wide`: any vertical video as a 1920x1080 cut, with a headline panel and a running-state panel.
- Review sheets rendered inside Remotion (`sheet-<id>`), and 1280x720 thumbnails.
- `npm run narrate`: ElevenLabs voice with word timestamps and a cache keyed by each line's content, or `--captions-only` with no key. The key lives in `.env.elevenlabs` or the shell. `remotion.config.ts` gives Remotion a private empty env file for each run and refuses secret-like `REMOTION_*` variables, so no secret reaches the Studio page. `--prune` deletes voiced lines no longer used.
- `npm run finish -- <in> <out> --video <id>`: two-pass loudness leveling to -14 LUFS, skipped for captions-only videos (`--force` levels any file), and `npm run srt`; both use the ffmpeg bundled with Remotion.
- Example video, "How this video was made", in vertical and wide, with captions-only timing and no voice, plus a template for new videos.
- Every failure a user can fix stops with the next step; scripts, timing, provider responses and command-line arguments are validated.
- Node 22 and 24 (20.19+ also works); tests with coverage of 90% of lines or more.
