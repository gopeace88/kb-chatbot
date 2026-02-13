"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Image,
  FileSpreadsheet,
  X,
} from "lucide-react";

const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/csv": [".csv"],
};

const ACCEPT_STRING = Object.values(ACCEPTED_TYPES).flat().join(",");

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return FileText;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return Image;
  if (ext === "csv") return FileSpreadsheet;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDropZoneProps {
  onStartIngest: (files: File[]) => void;
}

export function FileDropZone({ onStartIngest }: FileDropZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const validExts = Object.values(ACCEPTED_TYPES).flat();
    const valid = arr.filter((f) => {
      const ext = "." + (f.name.split(".").pop()?.toLowerCase() || "");
      return validExts.includes(ext);
    });
    if (valid.length > 0) {
      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const deduped = valid.filter((f) => !existingNames.has(f.name));
        return [...prev, ...deduped];
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      // reset input so same file can be selected again
      e.target.value = "";
    },
    [addFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-gray-300 hover:border-primary/50 hover:bg-muted/30",
        )}
      >
        <Upload
          className={cn(
            "mb-3 h-10 w-10",
            isDragOver ? "text-primary" : "text-gray-400",
          )}
        />
        <p className="text-sm font-medium text-gray-700">
          파일을 여기에 드래그하거나 클릭하여 선택
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, 이미지 (JPG, PNG, GIF, WEBP), 텍스트 (TXT, MD, CSV)
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Selected files list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            선택된 파일 ({files.length}개)
          </p>
          <div className="space-y-1">
            {files.map((file, i) => {
              const Icon = getFileIcon(file.name);
              return (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-border bg-white px-3 py-2"
                >
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm text-gray-700">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="rounded p-0.5 text-gray-400 hover:bg-muted hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Start button */}
      {files.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => onStartIngest(files)}>
            인제스트 시작
          </Button>
        </div>
      )}
    </div>
  );
}
