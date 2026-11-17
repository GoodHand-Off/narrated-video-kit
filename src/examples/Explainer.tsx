import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FPS, chunks, stamp } from '../captions';
import type { Line } from '../captions';
import { NarratedVideo, Sfx, Wide, ramp } from '../kit';
import { timeline } from '../timeline';
import { Big, Card, Chips, EndCard, Eyebrow, Phone, Result, Small, Stack, Stamp, Thread, type Msg } from '../parts';
import type { ThumbProps } from '../Thumb';
import lines from '../../public/narration/explainer/timing.json';

// The example: a video about how this video was made. One visual per line of
// src/narration/explainer.json, each timed to the words of its line with cue(). Every cue
// runs while a scene renders, never when this file loads, so a stale cue breaks only this
// video and the other compositions keep rendering.
const { scenes, cue, review, frames } = timeline(lines as Line[]);
/** Length of the vertical example in frames. */
export const EXPLAINER_FRAMES = frames;
/** Frames the example's review sheets show. */
export const EXPLAINER_REVIEW = review;

const in10 = (f: number, at: number) => ramp(f, at, at + 10);
const STEPS = ['01 · HOOK', '02 · SCENES', '03 · WORD CUES', '04 · CAPTIONS', '05 · NO KEY', '06 · WIDE CUT', '07 · FINISH', '08 · END CARD'];
const WAITING = 'Waiting for my word…';
const LANDED = 'Landed on “now.”';
const messages = (): Msg[] => [
  { at: cue(2, 'voice'), side: 'left', label: 'CUE', text: WAITING },
  { at: cue(2, 'now'), side: 'right', text: LANDED },
];

// The first SRT cue of scene 4, numbered and timed exactly as scripts/srt.ts writes it.
function srtSample() {
  const before = scenes.slice(0, 3).reduce((n, s) => n + chunks(s.words).length, 0);
  const [first, second] = chunks(scenes[3].words);
  const from = scenes[3].from / FPS;
  return `${before + 1}\n${stamp(from + first[0].start)} --> ${stamp(from + second[0].start)}\n${first.map((w) => w.w).join(' ')}`;
}

// The running checklist in the wide cut's right panel: steps so far, the newest fading in.
const Steps: React.FC<{ n: number }> = ({ n }) => <Chips cols={1} items={STEPS.slice(0, n).map((s, k) => [`${s} ✓`, k === n - 1 ? 10 : 0])} />;

const SceneIntro: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={420}>
      <Big size={84} show={in10(f, 0)}>
        A component and a script.
      </Big>
      <Card label="SRC/EXAMPLES/EXPLAINER.TSX" size={36} show={in10(f, cue(0, 'component'))}>
        One visual per line
      </Card>
      <Card label="SRC/NARRATION/EXPLAINER.JSON" size={36} show={in10(f, cue(0, 'eight'))}>
        Eight lines of narration
      </Card>
    </Stack>
  );
};

const SceneLines: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={400}>
      <Eyebrow>ONE LINE · ONE SCENE</Eyebrow>
      <Chips items={STEPS.map((s, k) => [s, cue(1, 'line') + k * 4])} />
      <Small show={in10(f, cue(1, 'narration'))}>Each scene runs as long as its line, plus a short breath.</Small>
    </Stack>
  );
};

const SceneCue: React.FC = () => (
  <>
    <Phone>
      <Thread title="Word cues" msgs={messages()} />
    </Phone>
    <Sfx at={cue(2, 'now')} file="ding.wav" />
  </>
);

// The wide cut's right panel during the cue scene: the word's timing and the frame it becomes.
const CueAside: React.FC = () => {
  const f = useCurrentFrame();
  const now = scenes[2].words.find((w) => /^now/i.test(w.w));
  return (
    <>
      <Card label="TIMING.JSON" size={30} mono show={in10(f, cue(2, 'now'))}>
        {`{ "w": "${now?.w}", "start": ${now?.start} }`}
      </Card>
      <Result at={cue(2, 'now')}>{`= frame ${cue(2, 'now')} of the scene`}</Result>
    </>
  );
};

const SceneCaptions: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={420}>
      <Big show={in10(f, 0)}>Captions, cut at the commas.</Big>
      <Card label="BURNED IN" size={36} show={in10(f, cue(3, 'pieces'))}>
        Short pieces, one at a time
      </Card>
      <Card label="OUT/CAPTIONS/EXPLAINER.SRT" size={30} mono show={in10(f, cue(3, 'srt'))}>
        {srtSample()}
      </Card>
    </Stack>
  );
};

const SceneNoKey: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={420}>
      <Big show={in10(f, 0)}>No key? Still a video.</Big>
      <Card label="CAPTIONS-ONLY MODE" size={36} show={in10(f, cue(4, 'captionsonly'))}>
        Words at a steady pace. No audio, no key, no credits.
      </Card>
      <div style={{ marginTop: 40, marginLeft: 20 }}>
        <Stamp at={cue(4, 'review')} size={84}>
          REVIEWED
        </Stamp>
      </div>
      <Sfx at={cue(4, 'review')} file="stamp.wav" volume={0.5} />
    </Stack>
  );
};

const SceneWide: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={420}>
      <Big show={in10(f, 0)}>Tall or wide.</Big>
      <Chips
        cols={1}
        items={[
          ['1080 × 1920 · SHORTS, REELS, TIKTOK', cue(5, 'tall')],
          ['1920 × 1080 · YOUTUBE, YOUR SITE', cue(5, 'wide')],
        ]}
      />
      <Small show={in10(f, cue(5, 'middle'))}>The same component, wrapped in {'<Wide>'}.</Small>
    </Stack>
  );
};

const SceneFinish: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stack top={420}>
      <Eyebrow>FINISHING</Eyebrow>
      <Card label="NPM RUN FINISH" show={in10(f, cue(6, 'levels'))}>
        Audio leveled to −14 LUFS
      </Card>
      <Card label="SHEET-EXPLAINER" show={in10(f, cue(6, 'sheet'))}>
        A still from every scene, on one page
      </Card>
    </Stack>
  );
};

/** The example video, 1080x1920. */
export const Explainer: React.FC = () => (
  <NarratedVideo
    scenes={scenes}
    dir="explainer"
    eyebrow="HOW THIS VIDEO WAS MADE"
    hook={{ lines: ['No camera.', 'No editor.', 'Just a script.'], until: cue(0, "It's") }}
    visuals={[
      () => <SceneIntro />,
      () => <SceneLines />,
      () => <SceneCue />,
      () => <SceneCaptions />,
      () => <SceneNoKey />,
      () => <SceneWide />,
      () => <SceneFinish />,
      () => <EndCard headline="Write the script. Render the video." cta="Start from the README" ctaAt={cue(7, 'change')} />,
    ]}
    aside={[
      () => <Steps n={1} />,
      () => <Steps n={2} />,
      () => <CueAside />,
      () => <Steps n={4} />,
      () => <Steps n={5} />,
      () => <Steps n={6} />,
      () => (
        <>
          <Steps n={7} />
          <Result at={cue(6, 'sheet')}>Ready to post.</Result>
        </>
      ),
      null,
    ]}
    headlines={[undefined, undefined, undefined, undefined, undefined, undefined, 'Level the audio. Review every scene.', 'Write the script. Render the video.']}
  />
);

/** The example's wide cut, 1920x1080. */
export const ExplainerWide: React.FC = () => <Wide of={Explainer} />;

/** Two thumbnail variants to test against each other: a few words over one object. */
export const EXPLAINER_THUMBS: ThumbProps[] = [
  {
    id: 'explainer-a',
    lines: ['NO CAMERA.', 'NO EDITOR.'],
    tone: 'accent',
    object: { kind: 'card', label: 'EXPLAINER.JSON', text: 'Eight lines, eight scenes' },
  },
  {
    id: 'explainer-b',
    lines: ['VIDEOS', 'FROM A', 'SCRIPT'],
    tone: 'paper',
    object: {
      kind: 'phone',
      title: 'Word cues',
      msgs: [
        { at: 0, side: 'left', label: 'CUE', text: WAITING },
        { at: 4, side: 'right', text: LANDED },
      ],
    },
  },
];
