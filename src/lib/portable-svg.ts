import type { Buffer as NodeBuffer } from "node:buffer";

/** Ignore verified embedded raster images when checking SVG external references. */
export function svgWithLocalImages(
  svg: string,
  Buffer: typeof NodeBuffer,
  maxBytes: number,
) {
  return svg.replace(/<image\b[^>]*>/gi, (tag) =>
    tag.replace(
      /(\s)(?:xlink:)?href\s*=\s*(["'])data:image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,([A-Za-z0-9+/]*={0,2})\2/gi,
      (attribute, space, quote, mime: string, payload: string) => {
        if (
          !payload ||
          payload.length % 4 ||
          payload.length > Math.ceil(maxBytes / 3) * 4
        )
          return attribute;
        const bytes = Buffer.from(payload, "base64");
        if (bytes.length > maxBytes || bytes.toString("base64") !== payload)
          return attribute;
        const hex = (end: number) => bytes.subarray(0, end).toString("hex");
        const valid: Record<string, boolean> = {
          png:
            bytes.length >= 24 &&
            hex(8) === "89504e470d0a1a0a" &&
            bytes.subarray(12, 16).toString() === "IHDR",
          jpeg: bytes.length >= 4 && hex(3) === "ffd8ff",
          gif:
            bytes.length >= 13 &&
            /^(GIF87a|GIF89a)$/.test(bytes.subarray(0, 6).toString()),
          webp:
            bytes.length >= 12 &&
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP",
          "x-icon":
            bytes.length >= 22 &&
            hex(4) === "00000100" &&
            bytes.readUInt16LE(4) > 0,
          "vnd.microsoft.icon":
            bytes.length >= 22 &&
            hex(4) === "00000100" &&
            bytes.readUInt16LE(4) > 0,
        };
        return valid[mime.toLowerCase()]
          ? `${space}href=${quote}#embedded${quote}`
          : attribute;
      },
    ),
  );
}
