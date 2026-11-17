import React from 'react';
import { Composition } from 'remotion';
import { EXPLAINER_FRAMES, EXPLAINER_REVIEW, EXPLAINER_THUMBS, Explainer, ExplainerWide } from './examples/Explainer';
import { FPS } from './captions';
import { TEMPLATE_FRAMES, TEMPLATE_REVIEW, Template, TemplateWide } from './examples/Template';
import { Sheet } from './kit';
import { sheetSize, wideFrames } from './timeline';
import { Thumb } from './Thumb';

// Every video is registered four ways: vertical, wide, and a review sheet of each.
// Add your own videos the same way, then their thumbnails at the bottom.
const ExplainerSheet: React.FC = () => <Sheet of={Explainer} frames={EXPLAINER_REVIEW} />;
const ExplainerWideSheet: React.FC = () => <Sheet of={ExplainerWide} frames={EXPLAINER_REVIEW} wide />;
const TemplateSheet: React.FC = () => <Sheet of={Template} frames={TEMPLATE_REVIEW} />;

/** Every composition Remotion can render: the example and the template in both formats, their sheets, and the thumbnails. */
export const Root: React.FC = () => (
  <>
    <Composition id="explainer" component={Explainer} durationInFrames={EXPLAINER_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="explainer-wide" component={ExplainerWide} durationInFrames={wideFrames(EXPLAINER_FRAMES)} fps={FPS} width={1920} height={1080} />
    {/* A sheet runs as long as its video, so the frozen frames fall inside the timeline. */}
    <Composition id="sheet-explainer" component={ExplainerSheet} durationInFrames={EXPLAINER_FRAMES} fps={FPS} {...sheetSize(EXPLAINER_REVIEW)} />
    <Composition id="sheet-explainer-wide" component={ExplainerWideSheet} durationInFrames={wideFrames(EXPLAINER_FRAMES)} fps={FPS} {...sheetSize(EXPLAINER_REVIEW, true)} />
    <Composition id="template" component={Template} durationInFrames={TEMPLATE_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="template-wide" component={TemplateWide} durationInFrames={wideFrames(TEMPLATE_FRAMES)} fps={FPS} width={1920} height={1080} />
    <Composition id="sheet-template" component={TemplateSheet} durationInFrames={TEMPLATE_FRAMES} fps={FPS} {...sheetSize(TEMPLATE_REVIEW)} />
    {EXPLAINER_THUMBS.map((t) => (
      <Composition key={t.id} id={`thumb-${t.id}`} component={Thumb} defaultProps={t} durationInFrames={120} fps={FPS} width={1280} height={720} />
    ))}
  </>
);
