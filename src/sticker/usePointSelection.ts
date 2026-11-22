import { useCallback, useEffect, useRef, useState } from "react";

import StickerVision, {
  type StickerRenderResult,
} from "@modules/sticker-vision";
import type { StickerRenderOptions } from "@/sticker/options";
import { buildHitMap, isHit, type SelectedRegion } from "@/sticker/pointMask";

export type PointSelection = {
  points: { x: number; y: number; include: true }[];
  includeBase: boolean;
};

type PointSelectionArgs = {
  imageUri: string | null;
  /** Load the automatic mask only while the point editor is on screen. */
  enabled: boolean;
  options: StickerRenderOptions;
  onApplied: (
    result: StickerRenderResult,
    selection: PointSelection,
  ) => void;
};

/**
 * Drives the magic-wand region editor: loads the automatic mask as the first
 * region, toggles regions on tap, and applies the selection back to the photo.
 */
export function usePointSelection({
  imageUri,
  enabled,
  options,
  onApplied,
}: PointSelectionArgs) {
  const [regions, setRegions] = useState<SelectedRegion[]>([]);
  const [baseLoading, setBaseLoading] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const subscription = StickerVision.addListener(
      "onPointModelDownloadProgress",
      ({ progress }) => setDownloadProgress(progress),
    );

    return () => subscription.remove();
  }, []);

  // A new photo always starts from a clean selection.
  useEffect(() => {
    setRegions([]);
    setError(null);
    loadedFor.current = null;
  }, [imageUri]);

  useEffect(() => {
    if (!enabled || !imageUri || loadedFor.current === imageUri) {
      return;
    }

    let cancelled = false;
    setBaseLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await StickerVision.baseMaskAsync(
          imageUri,
          optionsRef.current,
        );
        let hitMap: Uint8Array = new Uint8Array(0);
        try {
          hitMap = await buildHitMap(result.uri);
        } catch {
          // The base mask can still be shown; it just cannot be toggled off.
        }

        if (cancelled) {
          return;
        }

        loadedFor.current = imageUri;
        setRegions([
          {
            id: "base",
            x: 0,
            y: 0,
            maskUri: result.uri,
            hitMap,
            isBase: true,
          },
        ]);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "自动抠图蒙版读取失败，可以直接点选。",
          );
        }
      } finally {
        if (!cancelled) {
          setBaseLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setBaseLoading(false);
    };
  }, [imageUri, enabled]);

  const toggleAt = useCallback(
    async (x: number, y: number) => {
      if (!imageUri || baseLoading || segmenting || applying) {
        return;
      }

      const hit = [...regions]
        .reverse()
        .find((region) => isHit(region, x, y));

      if (hit) {
        setRegions((previous) =>
          previous.filter((region) => region.id !== hit.id),
        );
        return;
      }

      setSegmenting(true);
      setDownloadProgress(null);
      setError(null);

      try {
        const result = await StickerVision.segmentAtPointAsync(
          imageUri,
          x,
          y,
        );

        let hitMap: Uint8Array = new Uint8Array(0);
        try {
          hitMap = await buildHitMap(result.uri);
        } catch {
          // The mask is still usable; without a hit map it just cannot be
          // toggled off by touching it.
        }

        setRegions((previous) => [
          ...previous,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            x,
            y,
            maskUri: result.uri,
            hitMap,
          },
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "这个位置没有分割出区域，换一个点试试。",
        );
      } finally {
        setSegmenting(false);
        setDownloadProgress(null);
      }
    },
    [imageUri, regions, baseLoading, segmenting, applying],
  );

  const clear = useCallback(() => {
    if (baseLoading || segmenting || applying) {
      return;
    }

    setRegions([]);
  }, [baseLoading, segmenting, applying]);

  const apply = useCallback(async () => {
    if (!imageUri || applying || baseLoading || regions.length === 0) {
      return;
    }

    const selection: PointSelection = {
      points: regions
        .filter((region) => !region.isBase)
        .map((region) => ({ x: region.x, y: region.y, include: true })),
      includeBase: regions.some((region) => region.isBase),
    };

    if (!selection.includeBase && selection.points.length === 0) {
      setError("至少选中一个区域。");
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const result = await StickerVision.applyPointsAsync(
        imageUri,
        selection.points,
        { ...optionsRef.current, includeBase: selection.includeBase },
      );

      onApplied(result, selection);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "应用选区失败，再试一次。",
      );
    } finally {
      setApplying(false);
    }
  }, [imageUri, regions, applying, baseLoading, onApplied]);

  return {
    regions,
    baseLoading,
    segmenting,
    applying,
    downloadProgress,
    error,
    hasBase: regions.some((region) => region.isBase),
    busy: baseLoading || segmenting || applying,
    toggleAt,
    clear,
    apply,
  };
}
