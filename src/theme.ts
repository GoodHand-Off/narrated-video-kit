import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// One place to restyle every scene, caption, end card and thumbnail.

/** The palette. Every component reads its colours from here. */
export const color = {
  ink: '#16181D', // headlines, body text, the phone frame
  muted: '#4B5260', // secondary text
  subtle: '#6B7280', // small labels
  accent: '#0E7C66', // the one brand colour
  paper: '#F6F5F1', // background
  line: '#D9D6CE', // borders
  surface: '#FFFFFF', // cards and bubbles
  onAccent: '#FFFFFF', // text on the accent colour
  stamp: '#C2410C', // the stamp only
};

// Google Fonts, fetched at render time (both SIL Open Font License).
const sans = loadSans('normal', { weights: ['400', '500', '600', '800'], subsets: ['latin'] }).fontFamily;
/** Font families: display for headlines, body for text and captions, mono for labels. */
export const font = {
  display: sans,
  body: sans,
  mono: loadMono('normal', { weights: ['500'], subsets: ['latin'] }).fontFamily,
};

/**
 * Shown on the end card and the wide cut's left panel. `logo` is a file in `public/`, or
 * leave it out to show `name` as a wordmark instead.
 */
export const brand: { name: string; site: string; logo?: string } = {
  name: 'Narrated Video Kit',
  site: 'example.com',
};
