import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { Line } from '../captions';
import { NarratedVideo, Wide, ramp } from '../kit';
import { Big, EndCard, Eyebrow, Stack } from '../parts';
import { headline, timeline } from '../timeline';
import lines from '../../public/narration/template/timing.json';

// A starting point for your own video: one generic visual per line and no word cues, so it
// works for a script of any length. Copy this file and src/narration/template.json, point
// the import above at your own timing, and replace the visuals one scene at a time.
const { scenes, review, frames } = timeline(lines as Line[]);
/** Length of the vertical template in frames. */
export const TEMPLATE_FRAMES = frames;
/** Frames the template's review sheet shows. */
export const TEMPLATE_REVIEW = review;

const Scene: React.FC<{ n: number; text: string }> = ({ n, text }) => {
  const f = useCurrentFrame();
  return (
    <Stack top={520}>
      <Eyebrow show={ramp(f, 0, 10)}>{`SCENE ${n}`}</Eyebrow>
      <Big show={ramp(f, 4, 14)}>{headline(text)}</Big>
    </Stack>
  );
};

/** The template video, 1080x1920: each line's first sentence as a headline, then an end card. */
export const Template: React.FC = () => (
  <NarratedVideo
    scenes={scenes}
    dir="template"
    eyebrow="YOUR VIDEO TITLE"
    visuals={scenes.map((s, i) =>
      i === scenes.length - 1 ? () => <EndCard headline={headline(s.text)} cta="Your call to action" ctaAt={30} /> : () => <Scene n={i + 1} text={s.text} />,
    )}
  />
);

/** The template's wide cut, 1920x1080. */
export const TemplateWide: React.FC = () => <Wide of={Template} />;
