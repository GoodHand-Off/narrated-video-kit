import React from 'react';
import { AbsoluteFill, Freeze } from 'remotion';
import { Card, Phone, Thread, type Msg } from './parts';
import { color, font } from './theme';

/** The object on a thumbnail's right side: a card or a phone with a message thread. */
export type ThumbObject = { kind: 'card'; label: string; text: string } | { kind: 'phone'; title: string; msgs: Msg[] };
/** One thumbnail variant. `id` becomes the composition `thumb-<id>`; `tone` picks the background. */
export type ThumbProps = { id: string; lines: string[]; tone: 'accent' | 'paper'; note?: string; object?: ThumbObject };

const Subject: React.FC<{ object: ThumbObject }> = ({ object }) =>
  object.kind === 'phone' ? (
    <Phone at={{ left: 880, top: 70, scale: 0.62 }}>
      <Thread title={object.title} msgs={object.msgs} />
    </Phone>
  ) : (
    <div style={{ position: 'absolute', left: 790, top: 230, width: 430, transform: 'rotate(-3deg)' }}>
      <Card label={object.label} size={34} show={1}>
        {object.text}
      </Card>
    </div>
  );

/**
 * A 1280x720 thumbnail: a few big words on the left, one object from the video on the
 * right, frozen once every entrance has settled.
 */
export const Thumb: React.FC<ThumbProps> = ({ lines, tone, note, object }) => {
  const dark = tone === 'accent';
  // Size to the longest line, so the words fill about 60% of the width.
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.max(96, Math.min(170, Math.floor(680 / (longest * 0.66))));
  return (
    <Freeze frame={90}>
      <AbsoluteFill style={{ background: dark ? color.accent : color.paper, overflow: 'hidden' }}>
        {note ? (
          <div
            style={{
              position: 'absolute',
              left: 56,
              top: 40,
              fontFamily: font.mono,
              fontWeight: 500,
              fontSize: 20,
              letterSpacing: '0.12em',
              color: dark ? 'rgba(255,255,255,0.75)' : color.subtle,
            }}
          >
            {note}
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: 56, top: 0, bottom: 0, width: 780, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
          {lines.map((l, i) => {
            const block = !dark && i === lines.length - 1;
            return (
              <div
                key={l}
                style={{
                  fontFamily: font.display,
                  fontWeight: 800,
                  fontSize: size,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  color: dark || block ? color.onAccent : color.ink,
                  background: block ? color.accent : undefined,
                  padding: block ? '0 0.1em' : undefined,
                  marginLeft: block ? '-0.1em' : undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {l}
              </div>
            );
          })}
        </div>
        {object ? <Subject object={object} /> : null}
      </AbsoluteFill>
    </Freeze>
  );
};
