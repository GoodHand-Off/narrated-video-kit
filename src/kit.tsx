import React from 'react';
import { AbsoluteFill, Audio, Freeze, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, chunks, type Scene, type Word } from './captions';
import { KitError } from './errors';
import { END_HOLD, WIDE_END_HOLD, headline, tileOf } from './timeline';
import { brand, color, font } from './theme';

// The engine's components: one scene per narration line with its audio and captions, the
// wide (16:9) cut of the same video, and the review sheet. Layout pieces live in parts.tsx.

const WideContext = React.createContext(false);
const SheetContext = React.createContext(false); // inside a review sheet: pictures only, no sound

/** Interpolation options that hold the end values outside the input range. */
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 before frame `a`, 1 after frame `b`, linear in between: an opacity or progress value. */
export const ramp = (f: number, a: number, b: number): number => interpolate(f, [a, b], [0, 1], clamp);

const Caption: React.FC<{ words: Word[]; hideBefore?: number }> = ({ words, hideBefore = 0 }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  if (f < hideBefore) return null;
  const parts = chunks(words);
  const i = parts.findIndex((c, k) => t >= c[0].start && (k === parts.length - 1 || t < parts[k + 1][0].start));
  if (i < 0) return null;
  const start = Math.round(parts[i][0].start * FPS);
  return (
    <div
      style={{
        position: 'absolute',
        top: 1460,
        left: 110,
        right: 110,
        textAlign: 'center',
        fontFamily: font.body,
        fontWeight: 600,
        fontSize: 54,
        lineHeight: 1.2,
        color: color.ink,
        opacity: ramp(f, start, start + 4),
      }}
    >
      {parts[i].map((w) => w.w).join(' ')}
    </div>
  );
};

/** A sound effect from `public/sfx`, starting at frame `at` of the scene. Silent in review sheets. */
export const Sfx: React.FC<{ at: number; file: string; volume?: number }> = ({ at, file, volume = 0.35 }) =>
  React.useContext(SheetContext) ? null : (
    <Sequence from={at}>
      <Audio src={staticFile(`sfx/${file}`)} volume={volume} />
    </Sequence>
  );

const Header: React.FC<{ eyebrow: string; note?: string }> = ({ eyebrow, note }) => (
  <div style={{ position: 'absolute', top: 196, width: '100%', textAlign: 'center' }}>
    <div style={{ fontFamily: font.mono, fontWeight: 500, fontSize: 30, letterSpacing: '0.12em', color: color.accent }}>{eyebrow}</div>
    {note ? <div style={{ marginTop: 12, fontFamily: font.mono, fontSize: 22, letterSpacing: '0.12em', color: color.subtle }}>{note}</div> : null}
  </div>
);

// The opening: big text from the first frame, so a scrolling viewer sees the point at once.
const Hook: React.FC<{ lines: string[]; until: number; size?: number }> = ({ lines, until, size: fixed }) => {
  const f = useCurrentFrame();
  if (f >= until) return null;
  const pop = interpolate(f, [0, 4], [0.96, 1], clamp);
  // Size to the longest line so no line wraps (900px wide, about 0.56em per character);
  // an all-caps hook passes its own size, since capitals run wider.
  const size = fixed ?? Math.max(96, Math.min(124, Math.floor(900 / (Math.max(...lines.map((l) => l.length)) * 0.56))));
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 90px 260px', opacity: 1 - ramp(f, until - 6, until) }}>
      {lines.map((l, i) => (
        <div
          key={l}
          style={{
            fontFamily: font.display,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: i === lines.length - 1 ? color.accent : color.ink,
            transform: `scale(${pop})`,
            transformOrigin: 'left center',
            marginBottom: 14,
          }}
        >
          {l}
        </div>
      ))}
    </AbsoluteFill>
  );
};

const FadeAfter: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: ramp(f, at, at + 8) }}>{f >= at ? children : null}</AbsoluteFill>;
};

/** What the wide cut's right panel shows from a scene on; `null` keeps the previous one. */
export type Aside = ((s: Scene) => React.ReactNode) | null;

/** Props of {@link NarratedVideo}. */
export type NarratedVideoProps = {
  /** From `timeline(lines).scenes`. */
  scenes: Scene[];
  /** The narration folder under `public/narration`, where the line audio lives. */
  dir: string;
  /** A short label at the top of the vertical video and the wide cut's left panel. */
  eyebrow: string;
  /** A second header line, for example `EXAMPLE · MADE-UP CUSTOMER`. */
  note?: string;
  /** One visual per scene, in order. */
  visuals: ((s: Scene) => React.ReactNode)[];
  /** Big opening text shown until frame `until` of the first scene. */
  hook?: { lines: string[]; until: number; size?: number };
  /** The wide cut's right panel, per scene. */
  aside?: Aside[];
  /** The wide cut's headline per scene, where the narration's first sentence reads badly. */
  headlines?: (string | undefined)[];
};

/**
 * A whole narrated video: background, header and each scene with its visual, narration
 * audio and captions. Inside {@link Wide} it renders as the 1920x1080 cut.
 * @throws KitError if there is not exactly one visual per scene.
 */
export const NarratedVideo: React.FC<NarratedVideoProps> = ({ scenes, dir, eyebrow, note, visuals, hook, aside, headlines }) => {
  const wide = React.useContext(WideContext);
  const silent = React.useContext(SheetContext);
  if (visuals.length !== scenes.length) {
    throw new KitError(`${dir}: ${visuals.length} visuals for ${scenes.length} narration lines.`, 'Give NarratedVideo exactly one visual per line of the script.');
  }
  const hold = Math.round((wide ? WIDE_END_HOLD : END_HOLD) * FPS);
  const video = (
    <AbsoluteFill style={{ background: color.paper }}>
      {wide ? null : <Header eyebrow={eyebrow} note={note} />}
      {scenes.map((s, i) => {
        const isLast = i === scenes.length - 1;
        return (
          <Sequence key={s.file ?? i} from={s.from} durationInFrames={isLast ? s.frames + hold : s.frames}>
            {i === 0 && hook ? (
              <>
                <Hook lines={hook.lines} until={hook.until} size={hook.size} />
                <FadeAfter at={hook.until}>{visuals[0](s)}</FadeAfter>
              </>
            ) : (
              visuals[i](s)
            )}
            {s.file && !silent ? <Audio src={staticFile(`narration/${dir}/${s.file}`)} /> : null}
            <Caption words={s.words} hideBefore={i === 0 && hook ? hook.until : 0} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
  return wide ? (
    <WideFrame scenes={scenes} eyebrow={eyebrow} note={note} hook={hook} aside={aside} headlines={headlines}>
      {video}
    </WideFrame>
  ) : (
    video
  );
};

/**
 * Renders a vertical video as the 1920x1080 cut: the vertical frame in the middle, the
 * scene's headline on the left and the `aside` panel on the right. Register it with
 * `wideFrames(frames)` as its duration.
 */
export const Wide: React.FC<{ of: React.FC }> = ({ of: Vertical }) => (
  <WideContext.Provider value={true}>
    <Vertical />
  </WideContext.Provider>
);

const SCALE = 1080 / 1920;
const COLUMN = 1080 * SCALE; // 607.5
const COLUMN_LEFT = (1920 - COLUMN) / 2;
const PANEL = 536; // each side panel, 72px in from the frame edge

const WideFrame: React.FC<Omit<NarratedVideoProps, 'dir' | 'visuals'> & { children: React.ReactNode }> = ({
  scenes,
  eyebrow,
  note,
  hook,
  aside = [],
  headlines = [],
  children,
}) => {
  const f = useCurrentFrame();
  const i = scenes.findIndex((s, k) => k === scenes.length - 1 || f < s.from + s.frames);
  const s = scenes[i];
  // The first scene's headline waits until the hook has left the middle.
  const at = i === 0 && hook ? s.from + hook.until : s.from;
  const text = headlines[i] ?? headline(s.text, i === 0 ? hook?.lines : undefined);
  const size = text.length <= 20 ? 96 : text.length <= 44 ? 80 : 66;
  // The right panel keeps the last scene that set it, so the state carries over.
  let j = i;
  while (j >= 0 && !aside[j]) j--;
  const panel = j >= 0 ? aside[j] : null;
  const mono = { fontFamily: font.mono, fontWeight: 500, letterSpacing: '0.12em' } as const;
  return (
    <AbsoluteFill style={{ background: color.paper }}>
      <div style={{ position: 'absolute', left: 72, top: 88, bottom: 88, width: PANEL }}>
        <div style={{ ...mono, fontSize: 22, color: color.accent }}>{eyebrow}</div>
        <div
          style={{
            marginTop: 44,
            fontFamily: font.display,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: color.accent,
            opacity: ramp(f, at, at + 8),
          }}
        >
          {text}
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 0, ...mono, fontSize: 24, letterSpacing: '0.06em', color: color.accent }}>{brand.site}</div>
      </div>
      {note ? <div style={{ position: 'absolute', right: 72, top: 88, width: PANEL, textAlign: 'right', ...mono, fontSize: 20, color: color.subtle }}>{note}</div> : null}
      {panel ? (
        <div style={{ position: 'absolute', right: 72, top: 150, width: PANEL, height: 850 }}>
          <Sequence from={scenes[j].from} layout="none">
            {panel(scenes[j])}
          </Sequence>
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: COLUMN_LEFT - 2,
          top: 0,
          width: COLUMN + 4,
          height: 1080,
          boxSizing: 'border-box',
          borderLeft: `2px solid ${color.line}`,
          borderRight: `2px solid ${color.line}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: COLUMN_LEFT,
          top: 0,
          width: 1080,
          height: 1920,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/**
 * A review sheet: the video frozen at each of `frames` (from `timeline().review`), tiled in
 * two rows, each tile labelled with its frame number. Register it at `sheetSize(frames)`
 * with the video's own duration, and render it with `remotion still`.
 */
export const Sheet: React.FC<{ of: React.FC; frames: number[]; wide?: boolean }> = ({ of: Video, frames, wide = false }) => {
  const tile = tileOf(wide);
  return (
    <SheetContext.Provider value={true}>
      <AbsoluteFill style={{ background: color.surface, display: 'grid', gridTemplateColumns: `repeat(${Math.ceil(frames.length / 2)}, ${tile.w}px)` }}>
        {frames.map((fr) => (
          <div key={fr} data-frame={fr} style={{ position: 'relative', width: tile.w, height: tile.h, overflow: 'hidden' }}>
            <div style={{ width: wide ? 1920 : 1080, height: wide ? 1080 : 1920, transform: `scale(${tile.w / tile.full})`, transformOrigin: 'top left' }}>
              <Freeze frame={fr}>
                <Video />
              </Freeze>
            </div>
            <div style={{ position: 'absolute', left: 6, bottom: 6, padding: '2px 6px', background: color.ink, color: color.onAccent, fontFamily: font.mono, fontSize: 12 }}>{fr}</div>
          </div>
        ))}
      </AbsoluteFill>
    </SheetContext.Provider>
  );
};

/** The logo set in `theme.ts`, or the brand name as a wordmark when there is none. */
export const Logo: React.FC<{ width: number }> = ({ width }) =>
  brand.logo ? (
    <Img src={staticFile(brand.logo)} style={{ width }} />
  ) : (
    <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: width / 7, letterSpacing: '-0.03em', color: color.accent }}>{brand.name}</div>
  );
