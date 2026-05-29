export type ImageItem = {
  id: string;
  file: File;
  name: string;
  type: string;
  originalSize: number;
  width: number;
  height: number;
  previewUrl: string;
};

export type FeasibilityVerdict =
  | { kind: "feasible"; minBytes: number; maxBytes: number }
  | { kind: "no_compression"; maxBytes: number }
  | { kind: "infeasible"; minBytes: number; maxBytes: number };

export type SplitPlan = {
  parts: ImageItem[][];
  partsCount: number;
  partMinBytes: number[];
};

export type SplitVerdict =
  | { kind: "feasibleSplit"; plan: SplitPlan }
  | { kind: "infeasibleSplit"; oversizedItem: ImageItem; minSinglePartBytes: number };

export type CompressOutput = {
  blob: Blob;
  finalBytes: number;
  name: string;
};

export type FlowState =
  | { kind: "idle" }
  | {
      kind: "filesAdded";
      items: ImageItem[];
      targetBytes: number | null;
      splitEnabled: boolean;
    }
  | {
      kind: "compressing";
      items: ImageItem[];
      targetBytes: number;
      splitEnabled: boolean;
      progress: number;
      message: string;
    }
  | {
      kind: "done";
      items: ImageItem[];
      targetBytes: number;
      splitEnabled: boolean;
      outputs: CompressOutput[];
    }
  | {
      kind: "error";
      items: ImageItem[];
      targetBytes: number;
      splitEnabled: boolean;
      message: string;
    };

export type Action =
  | { type: "ADD_FILES"; items: ImageItem[] }
  | { type: "REMOVE_FILE"; id: string }
  | { type: "CLEAR_FILES" }
  | { type: "SET_TARGET"; bytes: number | null }
  | { type: "SET_SPLIT"; enabled: boolean }
  | { type: "START_COMPRESS" }
  | { type: "PROGRESS"; progress: number; message: string }
  | { type: "COMPRESS_DONE"; outputs: CompressOutput[] }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };
