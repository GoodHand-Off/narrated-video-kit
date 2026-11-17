// @vitest-environment happy-dom
// Renders the real compositions at chosen frames with Remotion's own <Thumbnail>, and checks
// what is on screen: the hook, captions, word cues, the wide cut's panels, review sheets and
// thumbnails. Fonts are stubbed in vitest.config.ts. Remotion's <Audio> needs the timeline
// that only Studio and the renderer provide, so it is replaced by a marker that records its
// source: the tests check which sounds the kit includes, and real renders check playback.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Thumbnail } from '@remotion/player';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Line } from '../src/captions';
import { EXPLAINER_FRAMES, EXPLAINER_REVIEW, EXPLAINER_THUMBS, Explainer, ExplainerWide } from '../src/examples/Explainer';
import { TEMPLATE_FRAMES, Template, TemplateWide } from '../src/examples/Template';
import { NarratedVideo, Sheet, Wide } from '../src/kit';
import { brand } from '../src/theme';
import { Thumb, type ThumbProps } from '../src/Thumb';
import { sheetSize, timeline, wideFrames } from '../src/timeline';
import lines from '../public/narration/explainer/timing.json';
import { captionsOnly } from '../scripts/timing';

vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  Audio: ({ src }: { src: string }) => <i data-audio={src} />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = timeline(lines as Line[]);
const at = (scene: number, word: string, offset = 0) => t.scenes[scene].from + t.cue(scene, word) + offset;
const VERTICAL = { width: 1080, height: 1920 };
const WIDE = { width: 1920, height: 1080 };

let errors: unknown[] = [];
afterEach(() => {
  document.body.replaceChildren();
  errors = [];
});

async function render(component: React.FC, frame: number, size = VERTICAL, duration = EXPLAINER_FRAMES): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el, { onCaughtError: (e) => errors.push(e), onUncaughtError: (e) => errors.push(e) });
  await act(async () => {
    root.render(<Thumbnail component={component} compositionWidth={size.width} compositionHeight={size.height} frameToDisplay={frame} durationInFrames={duration} fps={30} />);
  });
  return el;
}

describe('the vertical video', () => {
  it('opens on the hook, with the header and no caption yet', async () => {
    const text = (await render(Explainer, 12)).textContent ?? '';
    expect(text).toContain('No camera.');
    expect(text).toContain('Just a script.');
    expect(text).toContain('HOW THIS VIDEO WAS MADE');
    expect(text).not.toContain('This video has');
  });

  it('shows the first scene and the caption being spoken after the hook', async () => {
    const text = (await render(Explainer, at(0, 'eight', 2))).textContent ?? '';
    expect(text).toContain('A component and a script.');
    expect(text).toContain('of eight lines.');
    expect(text).not.toContain('No camera.');
  });

  it('lands the message on the word "now", not before, with its sound', async () => {
    expect((await render(Explainer, at(2, 'now', -2))).textContent).not.toContain('Landed on');
    const el = await render(Explainer, at(2, 'now', 3));
    expect(el.textContent).toContain('Landed on “now.”');
    expect(el.querySelector('[data-audio]')?.getAttribute('data-audio')).toMatch(/sfx\/ding\.wav$/);
  });

  it('shows the SRT sample, the stamp and the end card', async () => {
    expect((await render(Explainer, at(3, 'srt', 12))).textContent).toMatch(/\d+\n?00:00:\d\d,\d{3} --> 00:00:\d\d,\d{3}/);
    expect((await render(Explainer, at(4, 'review', 8))).textContent).toContain('REVIEWED');
    const end = (await render(Explainer, EXPLAINER_FRAMES - 1)).textContent ?? '';
    expect(end).toContain('Narrated Video Kit');
    expect(end).toContain('Start from the README');
    expect(end).toContain(brand.site);
  });

  it('shows a logo instead of the wordmark when theme.ts sets one', async () => {
    brand.logo = 'logo.svg';
    try {
      const el = await render(Explainer, EXPLAINER_FRAMES - 1);
      expect(el.querySelector('img')?.getAttribute('src')).toContain('logo.svg');
      expect(el.textContent).not.toContain('Narrated Video Kit');
    } finally {
      delete brand.logo;
    }
  });
});

describe('the wide cut', () => {
  const wide = (frame: number) => render(ExplainerWide, frame, WIDE, wideFrames(EXPLAINER_FRAMES));

  it('puts the scene headline left, the site under it and the running state right', async () => {
    const text = (await wide(at(1, 'narration'))).textContent ?? '';
    expect(text).toContain('Each line of the script becomes one scene');
    expect(text).toContain(brand.site);
    expect(text).toContain('02 · SCENES ✓');
    expect(text).not.toContain('03 · WORD CUES ✓');
  });

  it('shows the cue word’s timing in the right panel', async () => {
    expect((await wide(at(2, 'now', 12))).textContent).toMatch(/"w": "now\.", "start": [\d.]+ }= frame \d+ of the scene/);
  });

  it('uses a headline override and keeps the last panel when a scene sets none', async () => {
    const text = (await wide(t.scenes[7].from + 20)).textContent ?? '';
    expect(text).toContain('Write the script. Render the video.');
    expect(text).toContain('Ready to post.');
  });
});

describe('review sheets', () => {
  it('tiles the hook and every scene, labelled with frame numbers and without sound', async () => {
    const VerticalSheet = () => <Sheet of={Explainer} frames={EXPLAINER_REVIEW} />;
    const el = await render(VerticalSheet, 0, sheetSize(EXPLAINER_REVIEW));
    const tiles = [...el.querySelectorAll('[data-frame]')];
    expect(tiles.map((d) => Number(d.getAttribute('data-frame')))).toEqual(EXPLAINER_REVIEW);
    expect(tiles[0].textContent).toContain('No camera.');
    expect(tiles[3].textContent).toContain('Landed on');
    expect(el.querySelectorAll('[data-audio]')).toHaveLength(0);
  });

  it('tiles the wide cut too', async () => {
    const WideSheet = () => <Sheet of={ExplainerWide} frames={EXPLAINER_REVIEW} wide />;
    const el = await render(WideSheet, 0, sheetSize(EXPLAINER_REVIEW, true), wideFrames(EXPLAINER_FRAMES));
    expect(el.querySelectorAll('[data-frame]')).toHaveLength(EXPLAINER_REVIEW.length);
    expect(el.textContent).toContain('Each line of the script becomes one scene');
  });
});

describe('the template', () => {
  it('shows each line’s first sentence as a headline, then an end card', async () => {
    const first = (await render(Template, 40, VERTICAL, TEMPLATE_FRAMES)).textContent ?? '';
    expect(first).toContain('SCENE 1');
    expect(first).toContain('This is the template');
    const end = (await render(Template, TEMPLATE_FRAMES - 1, VERTICAL, TEMPLATE_FRAMES)).textContent ?? '';
    expect(end).toContain('Your call to action');
    const wide = (await render(TemplateWide, 40, WIDE, wideFrames(TEMPLATE_FRAMES))).textContent ?? '';
    expect(wide).toContain('YOUR VIDEO TITLE');
  });
});

describe('thumbnails', () => {
  const thumb = (props: ThumbProps) => render(() => <Thumb {...props} />, 0, { width: 1280, height: 720 }, 120);

  it('renders both example variants', async () => {
    const a = (await thumb(EXPLAINER_THUMBS[0])).textContent ?? '';
    expect(a).toContain('NO CAMERA.');
    expect(a).toContain('EXPLAINER.JSON');
    const b = (await thumb(EXPLAINER_THUMBS[1])).textContent ?? '';
    expect(b).toContain('SCRIPT');
    expect(b).toContain('Landed on “now.”');
  });

  it('shows a note and works without an object', async () => {
    const text = (await thumb({ id: 'x', lines: ['JUST WORDS'], tone: 'paper', note: 'EXAMPLE · MADE-UP' })).textContent ?? '';
    expect(text).toContain('EXAMPLE · MADE-UP');
    expect(text).toContain('JUST WORDS');
  });
});

describe('NarratedVideo', () => {
  const custom = timeline([{ ...captionsOnly('Voiced line here.'), file: '01.mp3' }, captionsOnly('Second line.')]);
  const Custom: React.FC = () => (
    <NarratedVideo
      scenes={custom.scenes}
      dir="custom"
      eyebrow="CUSTOM"
      note="EXAMPLE · MADE-UP CUSTOMER"
      hook={{ lines: ['BIG', 'HOOK'], until: 20, size: 140 }}
      visuals={[() => <div>first visual</div>, () => <div>second visual</div>]}
    />
  );

  it('shows the note, a fixed-size hook, the line audio and each visual in turn', async () => {
    const first = await render(Custom, 10, VERTICAL, custom.frames);
    const hook = first.textContent ?? '';
    expect(hook).toContain('EXAMPLE · MADE-UP CUSTOMER');
    expect(hook).toContain('HOOK');
    expect(first.querySelector('[data-audio]')?.getAttribute('data-audio')).toMatch(/narration\/custom\/01\.mp3$/);
    expect((await render(Custom, custom.scenes[1].from + 5, VERTICAL, custom.frames)).textContent).toContain('second visual');
  });

  it('shows the note in the wide cut, with no right panel when none is given', async () => {
    const WideCustom = () => <Wide of={Custom} />;
    const text = (await render(WideCustom, custom.scenes[1].from + 5, WIDE, wideFrames(custom.frames))).textContent ?? '';
    expect(text).toContain('EXAMPLE · MADE-UP CUSTOMER');
    expect(text).toContain('Second line');
  });

  it('refuses a visual count that does not match the script', async () => {
    const Broken: React.FC = () => <NarratedVideo scenes={custom.scenes} dir="custom" eyebrow="X" visuals={[() => null]} />;
    await render(Broken, 0, VERTICAL, custom.frames);
    expect(String(errors[0])).toMatch(/custom: 1 visuals for 2 narration lines[\s\S]*exactly one visual per line/);
  });
});
