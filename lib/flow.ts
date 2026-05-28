import type { Action, FlowState } from "./types";
import { estimateMinBytes } from "./estimate";

function defaultTargetBytes(min: number): number {
  // Pick a value at or above min that round-trips cleanly through the
  // input's display rounding (whole KB, or 0.1 MB granularity).
  if (min >= 1024 * 1024) {
    const tenths = Math.ceil(min / (1024 * 1024 / 10));
    return Math.round((tenths / 10) * 1024 * 1024);
  }
  return Math.ceil(min / 1024) * 1024;
}

export const initialState: FlowState = { kind: "idle" };

export function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case "ADD_FILES": {
      const existing =
        state.kind !== "idle" && "items" in state ? state.items : [];
      const items = [...existing, ...action.items];
      const prevTarget =
        state.kind !== "idle" && "targetBytes" in state
          ? state.targetBytes
          : null;
      const targetBytes =
        typeof prevTarget === "number" && prevTarget > 0
          ? prevTarget
          : defaultTargetBytes(estimateMinBytes(items));
      return { kind: "filesAdded", items, targetBytes };
    }
    case "REMOVE_FILE": {
      if (state.kind === "idle") return state;
      if (!("items" in state)) return state;
      const items = state.items.filter((i) => i.id !== action.id);
      const removed = state.items.find((i) => i.id === action.id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      if (items.length === 0) return { kind: "idle" };
      const targetBytes =
        "targetBytes" in state && typeof state.targetBytes === "number"
          ? state.targetBytes
          : null;
      return { kind: "filesAdded", items, targetBytes };
    }
    case "CLEAR_FILES": {
      if (state.kind !== "idle" && "items" in state) {
        for (const it of state.items) URL.revokeObjectURL(it.previewUrl);
      }
      return { kind: "idle" };
    }
    case "SET_TARGET": {
      if (state.kind === "idle") return state;
      if (!("items" in state)) return state;
      return {
        kind: "filesAdded",
        items: state.items,
        targetBytes: action.bytes,
      };
    }
    case "START_COMPRESS": {
      if (state.kind !== "filesAdded") return state;
      if (state.targetBytes == null) return state;
      return {
        kind: "compressing",
        items: state.items,
        targetBytes: state.targetBytes,
        progress: 0,
        message: "Starting…",
      };
    }
    case "PROGRESS": {
      if (state.kind !== "compressing") return state;
      return { ...state, progress: action.progress, message: action.message };
    }
    case "COMPRESS_DONE": {
      if (state.kind !== "compressing") return state;
      return {
        kind: "done",
        items: state.items,
        targetBytes: state.targetBytes,
        pdfBlob: action.pdfBlob,
        finalBytes: action.finalBytes,
      };
    }
    case "ERROR": {
      if (state.kind === "idle") return state;
      if (!("items" in state) || !("targetBytes" in state)) return state;
      const tb = typeof state.targetBytes === "number" ? state.targetBytes : 0;
      return {
        kind: "error",
        items: state.items,
        targetBytes: tb,
        message: action.message,
      };
    }
    case "RESET": {
      if (state.kind !== "idle" && "items" in state) {
        for (const it of state.items) URL.revokeObjectURL(it.previewUrl);
      }
      return { kind: "idle" };
    }
    default:
      return state;
  }
}
