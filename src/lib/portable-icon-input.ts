import type { Buffer as NodeBuffer } from "node:buffer";
import type { Json } from "./portable-library";

/** Normalize legacy input only; the portable writer still validates image bytes. */
export function normalizePortableIconInput(
  icon: Record<string, Json>,
  Buffer: typeof NodeBuffer,
  maxBytes: number,
) {
  if (
    icon.type === "remote" &&
    typeof icon.src === "string" &&
    /^data:image\//i.test(icon.src)
  ) {
    icon.type = "custom";
    icon.data =
      typeof icon.cache === "string" && icon.cache ? icon.cache : icon.src;
    delete icon.src;
    delete icon.cache;
  }

  const field = icon.type === "custom" ? "data" : "cache";
  const value = icon[field];
  if (typeof value !== "string") return;
  const svg = /^data:image\/svg\+xml(?:;charset=utf-8|;utf8)?,([\s\S]*)$/i.exec(
    value,
  );
  if (!svg || svg[1].length > maxBytes * 3) return;
  let decoded: string;
  try {
    decoded = decodeURIComponent(svg[1]);
  } catch {
    return; // Leave malformed input for the writer's strict validation.
  }
  const bytes = Buffer.from(decoded, "utf8");
  if (bytes.byteLength > maxBytes) return;
  icon[field] = `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}
