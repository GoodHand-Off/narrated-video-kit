import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Logo, clamp, ramp } from './kit';
import { brand, color, font } from './theme';

// Layout pieces for scenes. Sizes are for the 1080x1920 frame; the wide cut scales the
// whole frame, so nothing here needs a wide version. `show` is an opacity from 0 to 1,
// usually ramp(frame, cue, cue + 10).

/** A column 110px in from each side, starting `top` pixels down: where scene content goes. */
export const Stack: React.FC<{ children: React.ReactNode; top?: number }> = ({ children, top = 380 }) => (
  <div style={{ position: 'absolute', top, left: 110, right: 110 }}>{children}</div>
);

/** A headline in display type that slides up as `show` goes from 0 to 1. */
export const Big: React.FC<{ show: number; children: React.ReactNode; tone?: string; size?: number }> = ({
  show,
  children,
  tone = color.ink,
  size = 92,
}) => (
  <div
    style={{
      fontFamily: font.display,
      fontWeight: 800,
      fontSize: size,
      lineHeight: 1.05,
      letterSpacing: '-0.025em',
      color: tone,
      marginBottom: 40,
      opacity: show,
      transform: `translateY(${(1 - show) * 24}px)`,
    }}
  >
    {children}
  </div>
);

/** A supporting sentence in body type. */
export const Small: React.FC<{ show: number; children: React.ReactNode }> = ({ show, children }) => (
  <div style={{ fontFamily: font.body, fontWeight: 500, fontSize: 44, lineHeight: 1.25, color: color.muted, opacity: show }}>{children}</div>
);

/** A small all-caps label in the accent colour. */
export const Eyebrow: React.FC<{ children: React.ReactNode; show?: number }> = ({ children, show = 1 }) => (
  <div style={{ fontFamily: font.mono, fontSize: 28, letterSpacing: '0.12em', color: color.accent, marginBottom: 30, opacity: show }}>
    {children}
  </div>
);

/** A white card with an accent edge: a small label and an optional body. `mono` sets the body as code. */
export const Card: React.FC<{ label: string; children?: React.ReactNode; show: number; size?: number; mono?: boolean }> = ({
  label,
  children,
  show,
  size = 40,
  mono,
}) => (
  <div
    style={{
      background: color.surface,
      border: `2px solid ${color.line}`,
      borderLeft: `14px solid ${color.accent}`,
      borderRadius: 10,
      padding: size < 40 ? '22px 34px' : '30px 40px',
      marginBottom: size < 40 ? 20 : 28,
      opacity: show,
      transform: `translateX(${(1 - show) * 30}px)`,
    }}
  >
    <div style={{ fontFamily: font.mono, fontSize: 24, letterSpacing: '0.12em', color: color.accent }}>{label}</div>
    {children ? (
      <div
        style={{
          marginTop: 10,
          fontFamily: mono ? font.mono : font.body,
          fontWeight: 500,
          fontSize: size,
          lineHeight: 1.25,
          whiteSpace: mono ? 'pre-wrap' : undefined,
          fontVariantLigatures: mono ? 'none' : undefined, // show code as typed: --> stays -->

          color: color.ink,
        }}
      >
        {children}
      </div>
    ) : null}
  </div>
);

/** Short labels in a grid, each fading in at its own frame. */
export const Chips: React.FC<{ items: [label: string, at: number][]; cols?: number }> = ({ items, cols = 2 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, marginBottom: 32 }}>
      {items.map(([label, at]) => (
        <div
          key={label}
          style={{
            padding: '22px 20px',
            background: color.surface,
            border: `2px solid ${color.line}`,
            borderLeft: `10px solid ${color.accent}`,
            borderRadius: 8,
            fontFamily: font.mono,
            fontSize: 24,
            letterSpacing: '0.08em',
            color: color.ink,
            opacity: ramp(f, at, at + 8),
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
};

/** Where a {@link Phone} sits and how big it is. */
export type PhoneAt = { left: number; top: number; scale: number };
/**
 * A phone that springs in. `at` places it; the default is its place in the vertical video.
 * At scale 0.66 (370 by 720 pixels) it fits the wide cut's right panel.
 */
export const Phone: React.FC<{ children: React.ReactNode; at?: PhoneAt }> = ({ children, at = { left: 260, top: 330, scale: 1 } }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 18 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: at.left,
        top: at.top,
        width: 560,
        height: 1090,
        borderRadius: 64,
        background: color.ink,
        padding: 14,
        boxShadow: '0 30px 60px rgba(22,24,29,0.18)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 60}px) scale(${at.scale})`,
        transformOrigin: 'top left',
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden' }}>{children}</div>
    </div>
  );
};

/** A message that springs in at frame `at`. Left bubbles are the other person, right ones you. */
export type Msg = { at: number; side: 'left' | 'right'; text: string; label?: string };
const Bubble: React.FC<Msg> = ({ at, side, text, label }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 15 } });
  const left = side === 'left';
  return (
    <div style={{ alignSelf: left ? 'flex-start' : 'flex-end', maxWidth: '86%', marginBottom: 18, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
      {label ? <div style={{ fontFamily: font.mono, fontSize: 16, letterSpacing: '0.12em', color: color.subtle, marginBottom: 6 }}>{label}</div> : null}
      <div
        style={{
          background: left ? color.paper : color.accent,
          border: left ? `2px solid ${color.line}` : undefined,
          color: left ? color.ink : color.onAccent,
          borderRadius: 22,
          padding: '16px 20px',
          fontFamily: font.body,
          fontSize: 25,
          lineHeight: 1.3,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** A message thread on a light screen, for inside a {@link Phone}. */
export const Thread: React.FC<{ title: string; msgs: Msg[] }> = ({ title, msgs }) => (
  <AbsoluteFill style={{ background: color.surface, padding: '80px 26px 0' }}>
    <div
      style={{
        textAlign: 'center',
        fontFamily: font.body,
        fontWeight: 600,
        fontSize: 30,
        color: color.ink,
        paddingBottom: 20,
        borderBottom: `2px solid ${color.line}`,
      }}
    >
      {title}
    </div>
    <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column' }}>
      {msgs.map((m) => (
        <Bubble key={m.at} {...m} />
      ))}
    </div>
  </AbsoluteFill>
);

/** A rubber stamp that thumps in at frame `at`. Use it once per video, for the result. */
export const Stamp: React.FC<{ at: number; size?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, size = 92, style, children }) => {
  const f = useCurrentFrame();
  const scale = interpolate(f, [at, at + 6], [2.1, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div
      style={{
        display: 'inline-block',
        opacity: ramp(f, at, at + 6),
        transform: `rotate(-8deg) scale(${scale})`,
        border: `${Math.round(size / 10)}px solid ${color.stamp}`,
        borderRadius: size / 6.5,
        padding: `${Math.round(size / 15)}px ${Math.round(size / 2.7)}px`,
        fontFamily: font.display,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '0.06em',
        lineHeight: 1.2,
        color: color.stamp,
        background: 'rgba(255,255,255,0.6)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A result line in large type, right-aligned, for the wide cut's right panel. */
export const Result: React.FC<{ children: React.ReactNode; at?: number }> = ({ children, at = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        fontFamily: font.display,
        fontWeight: 800,
        fontSize: 64,
        lineHeight: 1.05,
        letterSpacing: '-0.025em',
        color: color.ink,
        textAlign: 'right',
        opacity: ramp(f, at, at + 10),
      }}
    >
      {children}
    </div>
  );
};

/** The last scene: logo or wordmark, a headline, then the call to action and site at `ctaAt`. */
export const EndCard: React.FC<{ headline: string; cta: string; ctaAt: number }> = ({ headline, cta, ctaAt }) => {
  const f = useCurrentFrame();
  const a = ramp(f, 0, 14);
  const b = ramp(f, ctaAt, ctaAt + 10);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 260 }}>
      <div style={{ opacity: a }}>
        <Logo width={640} />
      </div>
      <div
        style={{
          marginTop: 60,
          maxWidth: 820,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 76,
          lineHeight: 1.05,
          letterSpacing: '-0.025em',
          color: color.ink,
          opacity: a,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          marginTop: 56,
          background: color.accent,
          color: color.onAccent,
          fontFamily: font.body,
          fontWeight: 600,
          fontSize: 42,
          padding: '26px 48px',
          borderRadius: 6,
          opacity: b,
        }}
      >
        {cta}
      </div>
      <div style={{ marginTop: 34, fontFamily: font.mono, fontWeight: 500, fontSize: 36, letterSpacing: '0.06em', color: color.accent, opacity: b }}>
        {brand.site}
      </div>
    </AbsoluteFill>
  );
};
