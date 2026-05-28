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

export type FlowState =
  | { kind: "idle" }
  | { kind: "filesAdded"; items: ImageItem[]; targetBytes: number | null }
  | {
      kind: "compressing";
      items: ImageItem[];
      targetBytes: number;
      progress: number;
      message: string;
    }
  | {
      kind: "done";
      items: ImageItem[];
      targetBytes: number;
      pdfBlob: Blob;
      finalBytes: number;
    }
  | {
      kind: "error";
      items: ImageItem[];
      targetBytes: number;
      message: string;
    };

export type Action =
  | { type: "ADD_FILES"; items: ImageItem[] }
  | { type: "REMOVE_FILE"; id: string }
  | { type: "CLEAR_FILES" }
  | { type: "SET_TARGET"; bytes: number | null }
  | { type: "START_COMPRESS" }
  | { type: "PROGRESS"; progress: number; message: string }
  | { type: "COMPRESS_DONE"; pdfBlob: Blob; finalBytes: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };
