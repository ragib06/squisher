import type { Action, FlowState } from "./types";
import { estimateMinBytes } from "./estimate";

function defaultTargetBytes(min: number): number {
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
      const splitEnabled =
        state.kind !== "idle" && "splitEnabled" in state
          ? state.splitEnabled
          : false;
      return { kind: "filesAdded", items, targetBytes, splitEnabled };
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
      const splitEnabled =
        "splitEnabled" in state ? state.splitEnabled : false;
      return { kind: "filesAdded", items, targetBytes, splitEnabled };
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
      const splitEnabled =
        "splitEnabled" in state ? state.splitEnabled : false;
      return {
        kind: "filesAdded",
        items: state.items,
        targetBytes: action.bytes,
        splitEnabled,
      };
    }
    case "SET_SPLIT": {
      if (state.kind === "idle") return state;
      if (!("items" in state)) return state;
      const targetBytes =
        "targetBytes" in state && typeof state.targetBytes === "number"
          ? state.targetBytes
          : null;
      return {
        kind: "filesAdded",
        items: state.items,
        targetBytes,
        splitEnabled: action.enabled,
      };
    }
    case "START_COMPRESS": {
      if (state.kind !== "filesAdded") return state;
      if (state.targetBytes == null) return state;
      return {
        kind: "compressing",
        items: state.items,
        targetBytes: state.targetBytes,
        splitEnabled: state.splitEnabled,
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
        splitEnabled: state.splitEnabled,
        outputs: action.outputs,
      };
    }
    case "ERROR": {
      if (state.kind === "idle") return state;
      if (!("items" in state) || !("targetBytes" in state)) return state;
      const tb = typeof state.targetBytes === "number" ? state.targetBytes : 0;
      const splitEnabled =
        "splitEnabled" in state ? state.splitEnabled : false;
      return {
        kind: "error",
        items: state.items,
        targetBytes: tb,
        splitEnabled,
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
