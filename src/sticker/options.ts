// All sticker rendering knobs live here. The native module only applies what
// this object passes, so changing these values is a JS-only change.
//
// Ratios are relative to the shorter side of the source image, which keeps the
// border and edge treatment consistent across portrait and landscape photos.
export const STICKER_RENDER_OPTIONS = {
  // Output square size in pixels. 1024 leaves room for a crisp 240px export.
  outputSize: 1024,
  // Longest side used for Vision and compositing. Larger is slower.
  maxDimension: 1600,
  // White outline thickness.
  borderWidthRatio: 0.018,
  // Positive grows the subject, negative shrinks it. A slight negative value
  // pulls background-coloured fringe pixels outside the cutout.
  edgeGrowRatio: -0.0007,
  // Morphological closing radius that fills small holes in the mask.
  closeHoleRatio: 0.0025,
  // Transparent padding around the sticker inside the square.
  insetRatio: 0.03,
  // Whether the automatic cutout is part of the point-selection set.
  includeBase: true,
} as const;

export type StickerRenderOptions = {
  outputSize?: number;
  maxDimension?: number;
  borderWidthRatio?: number;
  edgeGrowRatio?: number;
  closeHoleRatio?: number;
  insetRatio?: number;
  includeBase?: boolean;
};
