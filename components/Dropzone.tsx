"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { cn } from "@/lib/utils";

const MAX_PER_FILE = 25 * 1024 * 1024;

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};

export function Dropzone({
  onFiles,
  onReject,
}: {
  onFiles: (files: File[]) => void;
  onReject: (msg: string) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const r = rejected[0];
        const e = r.errors[0];
        if (e?.code === "file-too-large")
          onReject(`${r.file.name} exceeds 25 MB`);
        else if (e?.code === "file-invalid-type")
          onReject(`${r.file.name}: unsupported type`);
        else onReject(e?.message ?? "Some files rejected");
      }
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles, onReject],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_PER_FILE,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 text-center transition-colors",
        isDragActive && "border-primary bg-primary/5",
      )}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium">
        {isDragActive ? "Drop images here" : "Drop images or click to select"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        JPG, PNG, WebP, HEIC · up to 25 MB each
      </p>
    </div>
  );
}
