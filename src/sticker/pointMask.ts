import { File } from "expo-file-system";
import { decode as decodePng } from "fast-png";

export type SelectedRegion = {
  id: string;
  x: number;
  y: number;
  maskUri: string;
  hitMap: Uint8Array;
  isBase?: boolean;
};

const HIT_SIZE = 128;

/**
 * Downsample a mask PNG into a 128×128 alpha map. Taps are matched against this
 * map so the user can toggle a region by touching anywhere inside it.
 */
export async function buildHitMap(maskUri: string): Promise<Uint8Array> {
  const bytes = await new File(maskUri).bytes();
  const decoded = decodePng(bytes);
  const width = decoded.width;
  const height = decoded.height;
  const channels = decoded.channels;
  const data = decoded.data as Uint8Array;
  const map = new Uint8Array(HIT_SIZE * HIT_SIZE);

  for (let y = 0; y < HIT_SIZE; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) / HIT_SIZE) * height));

    for (let x = 0; x < HIT_SIZE; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) / HIT_SIZE) * width));
      const index = (sy * width + sx) * channels;
      const alpha = channels >= 4 ? data[index + 3] : data[index];

      if (alpha > 16) {
        map[y * HIT_SIZE + x] = 1;
      }
    }
  }

  return map;
}

/** Check a normalized (0–1) tap against a region's mask. */
export function isHit(
  region: SelectedRegion,
  x: number,
  y: number,
): boolean {
  if (region.hitMap.length === 0) {
    return false;
  }

  const px = Math.min(HIT_SIZE - 1, Math.max(0, Math.floor(x * HIT_SIZE)));
  const py = Math.min(HIT_SIZE - 1, Math.max(0, Math.floor(y * HIT_SIZE)));
  return region.hitMap[py * HIT_SIZE + px] === 1;
}
