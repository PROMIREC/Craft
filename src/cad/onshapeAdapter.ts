import type { PspecV0_1 } from "@/spec/pspecTypes";

export type OnshapeAdapterResult =
  | {
      status: "NOT_IMPLEMENTED";
      message: string;
      pspec_revision: number;
    }
  | {
      status: "OK";
      message: string;
      pspec_revision: number;
      onshape_document_url: string;
      onshape_version_id: string;
    };

export async function onshapeGenerateFromPspec(pspec: PspecV0_1): Promise<OnshapeAdapterResult> {
  // Deterministic stub response. No geometry generation and no network calls.
  return {
    status: "NOT_IMPLEMENTED",
    message: "Onshape integration is not implemented in V1 foundation. This is a deterministic adapter boundary.",
    pspec_revision: pspec.revision
  };
}

