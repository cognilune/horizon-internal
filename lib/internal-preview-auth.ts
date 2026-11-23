import { createHmac } from "node:crypto";

export function signInternalPreviewAsset(
  secret: string,
  projectId: string,
  slot: string,
  timestamp: number,
) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "horizon-internal-preview-asset-v1",
        timestamp,
        projectId,
        slot,
      ]),
    )
    .digest("base64url");
}
