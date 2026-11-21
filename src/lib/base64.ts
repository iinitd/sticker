const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);

  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }

  return table;
})();

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const fullGroups = Math.floor(clean.length / 4);
  const remainder = clean.length % 4;
  const output = new Uint8Array(
    fullGroups * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0),
  );

  let inputIndex = 0;
  let outputIndex = 0;

  while (inputIndex < clean.length) {
    const a = LOOKUP[clean.charCodeAt(inputIndex)] ?? 0;
    const b = LOOKUP[clean.charCodeAt(inputIndex + 1)] ?? 0;
    const c = LOOKUP[clean.charCodeAt(inputIndex + 2)] ?? 0;
    const d = LOOKUP[clean.charCodeAt(inputIndex + 3)] ?? 0;

    output[outputIndex] = (a << 2) | (b >> 4);
    outputIndex += 1;

    if (outputIndex < output.length) {
      output[outputIndex] = ((b & 15) << 4) | (c >> 2);
      outputIndex += 1;
    }

    if (outputIndex < output.length) {
      output[outputIndex] = ((c & 3) << 6) | d;
      outputIndex += 1;
    }

    inputIndex += 4;
  }

  return output;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;

    output += ALPHABET[a >> 2];
    output += ALPHABET[((a & 3) << 4) | (b >> 4)];
    output +=
      index + 1 < bytes.length
        ? ALPHABET[((b & 15) << 2) | (c >> 6)]
        : "=";
    output += index + 2 < bytes.length ? ALPHABET[c & 63] : "=";
  }

  return output;
}
