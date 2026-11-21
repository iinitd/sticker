import jpeg from "jpeg-js";
import { decode as decodePng, encode as encodePng } from "fast-png";

export type DecodedImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type RegionInfo = {
  id: number;
  area: number;
  r: number;
  g: number;
  b: number;
};

export type RegionStage = DecodedImage & {
  labels: Int32Array;
  regions: RegionInfo[];
};

function toRGBA(data: Uint8Array, channels: number): Uint8Array {
  if (channels === 4) {
    return data;
  }

  const pixels = data.length / channels;
  const out = new Uint8Array(pixels * 4);

  for (let index = 0; index < pixels; index += 1) {
    const source = index * channels;
    const target = index * 4;
    out[target] = data[source] ?? 0;
    out[target + 1] = channels > 1 ? data[source + 1] ?? 0 : out[target];
    out[target + 2] = channels > 2 ? data[source + 2] ?? 0 : out[target];
    out[target + 3] = channels > 3 ? data[source + 3] ?? 255 : 255;
  }

  return out;
}

export function decodeImage(bytes: Uint8Array): DecodedImage {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
    });

    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const decoded = decodePng(bytes);

    if (decoded.depth !== 8) {
      throw new Error("目前只支持 8 位 PNG。");
    }

    return {
      width: decoded.width,
      height: decoded.height,
      data: toRGBA(decoded.data as Uint8Array, decoded.channels),
    };
  }

  throw new Error("只支持 JPEG/PNG。HEIC 请先截图或导出为 JPEG。");
}

export function downsampleImage(
  image: DecodedImage,
  maxSide: number,
): DecodedImage {
  const longest = Math.max(image.width, image.height);

  if (longest <= maxSide) {
    return image;
  }

  const scale = maxSide / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  const stepX = image.width / width;
  const stepY = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * stepY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * stepY));

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * stepX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * stepX));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const source = (sy * image.width + sx) * 4;
          r += image.data[source];
          g += image.data[source + 1];
          b += image.data[source + 2];
          a += image.data[source + 3];
          count += 1;
        }
      }

      const target = (y * width + x) * 4;
      data[target] = Math.round(r / count);
      data[target + 1] = Math.round(g / count);
      data[target + 2] = Math.round(b / count);
      data[target + 3] = Math.round(a / count);
    }
  }

  return { width, height, data };
}

function boxBlur(
  data: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(data.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const index = (sy * width + sx) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          count += 1;
        }
      }

      const target = (y * width + x) * 4;
      out[target] = Math.round(r / count);
      out[target + 1] = Math.round(g / count);
      out[target + 2] = Math.round(b / count);
      out[target + 3] = data[target + 3];
    }
  }

  return out;
}

function mergeSmallRegions(
  source: Uint8Array,
  labels: Int32Array,
  regions: RegionInfo[],
  width: number,
  height: number,
): { labels: Int32Array; regions: RegionInfo[] } {
  let currentLabels = labels;
  let currentRegions = regions;
  const minArea = Math.max(200, Math.floor((width * height) / 800));

  for (let pass = 0; pass < 3; pass += 1) {
    const parent = new Int32Array(currentRegions.length);
    for (let index = 0; index < parent.length; index += 1) {
      parent[index] = index;
    }

    const find = (value: number): number => {
      let root = value;
      while (parent[root] !== root) {
        root = parent[root];
      }
      while (parent[value] !== value) {
        const next = parent[value];
        parent[value] = root;
        value = next;
      }
      return root;
    };

    const union = (a: number, b: number) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) {
        parent[rootB] = rootA;
      }
    };

    const edges = new Map<number, Map<number, number>>();
    const addEdge = (a: number, b: number) => {
      if (a === b) {
        return;
      }
      let row = edges.get(a);
      if (!row) {
        row = new Map();
        edges.set(a, row);
      }
      row.set(b, (row.get(b) ?? 0) + 1);
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const id = currentLabels[index];
        if (x + 1 < width) {
          addEdge(id, currentLabels[index + 1]);
        }
        if (y + 1 < height) {
          addEdge(id, currentLabels[index + width]);
        }
      }
    }

    for (const region of currentRegions) {
      if (region.area >= minArea) {
        continue;
      }
      const neighbors = edges.get(region.id);
      if (!neighbors) {
        continue;
      }
      let best = -1;
      let bestCount = -1;
      for (const [neighbor, count] of neighbors) {
        if (count > bestCount) {
          bestCount = count;
          best = neighbor;
        }
      }
      if (best >= 0) {
        union(region.id, best);
      }
    }

    const rootToId = new Map<number, number>();
    const nextRegions: RegionInfo[] = [];
    const nextLabels = new Int32Array(currentLabels.length);

    for (let index = 0; index < currentLabels.length; index += 1) {
      const root = find(currentLabels[index]);
      let id = rootToId.get(root);

      if (id === undefined) {
        id = nextRegions.length;
        rootToId.set(root, id);
        nextRegions.push({ id, area: 0, r: 0, g: 0, b: 0 });
      }

      nextLabels[index] = id;
      const pixel = index * 4;
      nextRegions[id].area += 1;
      nextRegions[id].r += source[pixel];
      nextRegions[id].g += source[pixel + 1];
      nextRegions[id].b += source[pixel + 2];
    }

    for (const region of nextRegions) {
      region.r = Math.round(region.r / region.area);
      region.g = Math.round(region.g / region.area);
      region.b = Math.round(region.b / region.area);
    }

    currentLabels = nextLabels;
    currentRegions = nextRegions;
  }

  return { labels: currentLabels, regions: currentRegions };
}

export function segmentRegions(image: DecodedImage): RegionStage {
  const { width, height, data } = image;
  const blurred = boxBlur(data, width, height, 2);
  const labels = new Int32Array(width * height).fill(-1);
  const regions: RegionInfo[] = [];
  const stack = new Int32Array(width * height);

  const keyAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return (
      ((blurred[index] >> 6) << 4) |
      ((blurred[index + 1] >> 6) << 2) |
      (blurred[index + 2] >> 6)
    );
  };

  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1) {
      continue;
    }

    const startX = start % width;
    const startY = Math.floor(start / width);
    const key = keyAt(startX, startY);
    const id = regions.length;
    let area = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let top = 0;
    stack[top] = start;
    labels[start] = id;

    while (top >= 0) {
      const index = stack[top];
      top -= 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const pixel = index * 4;

      area += 1;
      sumR += data[pixel];
      sumG += data[pixel + 1];
      sumB += data[pixel + 2];

      if (x > 0 && labels[index - 1] === -1 && keyAt(x - 1, y) === key) {
        labels[index - 1] = id;
        top += 1;
        stack[top] = index - 1;
      }
      if (
        x + 1 < width &&
        labels[index + 1] === -1 &&
        keyAt(x + 1, y) === key
      ) {
        labels[index + 1] = id;
        top += 1;
        stack[top] = index + 1;
      }
      if (y > 0 && labels[index - width] === -1 && keyAt(x, y - 1) === key) {
        labels[index - width] = id;
        top += 1;
        stack[top] = index - width;
      }
      if (
        y + 1 < height &&
        labels[index + width] === -1 &&
        keyAt(x, y + 1) === key
      ) {
        labels[index + width] = id;
        top += 1;
        stack[top] = index + width;
      }
    }

    regions.push({
      id,
      area,
      r: Math.round(sumR / area),
      g: Math.round(sumG / area),
      b: Math.round(sumB / area),
    });
  }

  const merged = mergeSmallRegions(data, labels, regions, width, height);

  return {
    width,
    height,
    data,
    labels: merged.labels,
    regions: merged.regions,
  };
}

export function buildBasePng(image: DecodedImage): Uint8Array {
  return encodePng({
    width: image.width,
    height: image.height,
    data: image.data,
    channels: 4,
  });
}

export function buildOverlayPng(
  stage: RegionStage,
  selectedIds: Set<number>,
): Uint8Array {
  const { width, height, labels } = stage;
  const out = new Uint8Array(width * height * 4);

  if (selectedIds.size === 0) {
    return encodePng({ width, height, data: out, channels: 4 });
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const id = labels[index];
      const target = index * 4;

      if (!selectedIds.has(id)) {
        continue;
      }

      out[target] = 91;
      out[target + 1] = 91;
      out[target + 2] = 214;
      out[target + 3] = 110;

      const right = x + 1 < width ? labels[index + 1] : -1;
      const below = y + 1 < height ? labels[index + width] : -1;

      if (!selectedIds.has(right) || !selectedIds.has(below)) {
        out[target] = 36;
        out[target + 1] = 36;
        out[target + 2] = 42;
        out[target + 3] = 200;
      }
    }
  }

  return encodePng({ width, height, data: out, channels: 4 });
}

export function buildMaskPng(
  stage: RegionStage,
  selectedIds: Set<number>,
): Uint8Array {
  const { width, height, labels } = stage;
  const out = new Uint8Array(width * height * 4);

  for (let index = 0; index < labels.length; index += 1) {
    if (selectedIds.has(labels[index])) {
      out[index * 4] = 255;
      out[index * 4 + 1] = 255;
      out[index * 4 + 2] = 255;
      out[index * 4 + 3] = 255;
    }
  }

  return encodePng({ width, height, data: out, channels: 4 });
}
