export type Bundle = { id: string; name: string; color: string };
export const defaultBundle: Bundle = {
  id: "shared",
  name: "Shared diagrams",
  color: "#6288e8",
};
export const bundleColors = [
  "#6288e8",
  "#9b76df",
  "#2f9b89",
  "#dc9a43",
  "#dc729a",
  "#529fbf",
];
export type DiagramMetadata = { name?: string; bundle_id?: string };
export class MetadataError extends Error {}
export function bundleDetails(name: unknown, color: unknown) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 64)
    throw new MetadataError("Bundle names must contain 1–64 characters.");
  if (typeof color !== "string" || !/^#[a-f\d]{6}$/i.test(color))
    throw new MetadataError("Choose a valid bundle color.");
  return { name: name.trim(), color };
}
