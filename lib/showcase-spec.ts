import bindings from "../public/showcase/bindings.json";
import { DEFAULT_CAN_SPEC, type CanPreset } from "./can-spec";
/** Fixed public print presets derived only from exact, immutable file hashes.
 * No extra role privileges or metadata changes on approved versions. Explicit saved specs win. */
export function appendShowcaseSpecs(
  files: Record<string, any>[],
  visuals: Record<string, any>[],
) {
  for (const f of files) {
    if (
      f.kind !== "preview" ||
      visuals.some((v) => v.version_id === f.version_id)
    )
      continue;
    const binding = bindings.find((b) => b.sha256 === f.sha256);
    if (binding)
      visuals.push({
        version_id: f.version_id,
        spec: { ...DEFAULT_CAN_SPEC, preset: binding.preset as CanPreset },
      });
  }
}
