"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ingestApi,
  type IngestEvent,
  type QACandidate,
} from "@/lib/ingest-api";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
} from "lucide-react";

interface FileProgress {
  fileName: string;
  status: "pending" | "extracting" | "chunking" | "generating" | "done" | "error";
  statusText: string;
  chunksCurrent?: number;
  chunksTotal?: number;
}

interface LogEntry {
  time: string;
  message: string;
  isError?: boolean;
}

interface IngestProgressProps {
  jobId: string;
  onComplete: (candidates: QACandidate[], availableImages?: Record<string, string>) => void;
}

function getStatusIcon(status: FileProgress["status"]) {
  switch (status) {
    case "done":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "pending":
      return <FileText className="h-4 w-4 text-gray-400" />;
    default:
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
}

function now(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function IngestProgress({ jobId, onComplete }: IngestProgressProps) {
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [overallStatus, setOverallStatus] = useState<"processing" | "complete" | "error">("processing");
  const overallStatusRef = useRef<"processing" | "complete" | "error">("processing");
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    overallStatusRef.current = overallStatus;
  }, [overallStatus]);

  const addLog = (message: string, isError = false) => {
    setLogs((prev) => [...prev, { time: now(), message, isError }]);
  };

  useEffect(() => {
    const es = ingestApi.streamProgress(jobId, (event: IngestEvent) => {
      const data = event.data;

      switch (event.type) {
        case "file_start": {
          const fileName = data.fileName as string;
          setFileProgress((prev) => [
            ...prev,
            { fileName, status: "extracting", statusText: "텍스트 추출 중..." },
          ]);
          addLog(`[${fileName}] 처리 시작`);
          break;
        }
        case "text_extracted": {
          const fileName = data.fileName as string;
          const chars = (data.textLength ?? data.characters ?? 0) as number;
          setFileProgress((prev) =>
            prev.map((f) =>
              f.fileName === fileName
                ? { ...f, status: "chunking", statusText: `텍스트 추출 완료 (${chars.toLocaleString()}자)` }
                : f,
            ),
          );
          addLog(`[${fileName}] 텍스트 추출 완료 - ${chars.toLocaleString()}자`);
          break;
        }
        case "chunks_created": {
          const fileName = data.fileName as string;
          const count = (data.chunkCount ?? data.count ?? 0) as number;
          setFileProgress((prev) =>
            prev.map((f) =>
              f.fileName === fileName
                ? {
                    ...f,
                    status: "generating",
                    statusText: `${count}개 청크 생성됨, Q&A 생성 대기...`,
                    chunksTotal: count,
                    chunksCurrent: 0,
                  }
                : f,
            ),
          );
          addLog(`[${fileName}] ${count}개 청크 생성 완료`);
          break;
        }
        case "pages_rendered": {
          const fileName = data.fileName as string;
          const pageCount = data.pageCount as number;
          const hasR2 = Object.values((data.pageImages as Record<string, string>) || {}).some(
            (url) => typeof url === "string" && url.startsWith("http"),
          );
          addLog(
            `[${fileName}] ${pageCount}페이지 이미지 렌더링 완료${hasR2 ? " (R2 업로드됨)" : ""}`,
          );
          break;
        }
        case "qa_generating": {
          const fileName = data.fileName as string;
          const chunkIndex = (data.chunkIndex as number) + 1;
          setFileProgress((prev) =>
            prev.map((f) => {
              if (f.fileName !== fileName) return f;
              const total = (data.totalChunks as number | undefined) ?? f.chunksTotal ?? 0;
              return {
                ...f,
                status: "generating",
                statusText: total > 0
                  ? `청크 ${chunkIndex}/${total} Q&A 생성 중...`
                  : `청크 ${chunkIndex} Q&A 생성 중...`,
                chunksCurrent: chunkIndex,
                chunksTotal: total,
              };
            }),
          );
          const totalStr = data.totalChunks ? `/${data.totalChunks}` : "";
          addLog(`[${fileName}] 청크 ${chunkIndex}${totalStr} Q&A 생성 중...`);
          break;
        }
        case "qa_generated": {
          const fileName = data.fileName as string;
          const count = (data.candidates as QACandidate[])?.length ?? (data.count as number) ?? 0;
          addLog(`[${fileName}] Q&A ${count}개 생성됨`);
          break;
        }
        case "dedup_checking": {
          const fileName = data.fileName as string;
          addLog(`[${fileName}] 중복 검사 중... (${data.count}개 Q&A)`);
          break;
        }
        case "file_done": {
          const fileName = data.fileName as string;
          const candidateCount = data.candidateCount as number;
          setFileProgress((prev) =>
            prev.map((f) =>
              f.fileName === fileName
                ? { ...f, status: "done", statusText: `완료 - Q&A ${candidateCount}개 생성` }
                : f,
            ),
          );
          addLog(`[${fileName}] 처리 완료 - Q&A ${candidateCount}개`);
          break;
        }
        case "complete": {
          setOverallStatus("complete");
          addLog("모든 파일 처리 완료!");
          // Fetch final job data with retry (server may still be finalizing candidates)
          const fetchWithRetry = async (retries = 3, delay = 500): Promise<void> => {
            for (let i = 0; i < retries; i++) {
              try {
                const job = await ingestApi.getJob(jobId);
                if (job.candidates.length > 0 || i === retries - 1) {
                  onComplete(job.candidates, job.availableImages);
                  if (job.candidates.length === 0) {
                    addLog("경고: 생성된 Q&A가 없습니다. 파일 내용을 확인해주세요.", true);
                  }
                  return;
                }
                // 0 candidates but retries left — wait and try again
                addLog(`Q&A 데이터 로딩 대기 중... (${i + 1}/${retries})`);
                await new Promise((r) => setTimeout(r, delay));
              } catch (err) {
                if (i === retries - 1) {
                  addLog(`Q&A 후보 데이터 로딩 실패: ${err instanceof Error ? err.message : err}`, true);
                  setOverallStatus("error");
                  return;
                }
                await new Promise((r) => setTimeout(r, delay));
              }
            }
          };
          fetchWithRetry();
          break;
        }
        case "error": {
          const message = (data.message as string) || "알 수 없는 오류";
          const stage = data.stage as string | undefined;
          const fileName = data.fileName as string | undefined;
          if (fileName) {
            setFileProgress((prev) =>
              prev.map((f) =>
                f.fileName === fileName
                  ? { ...f, status: "error", statusText: `오류: ${message}` }
                  : f,
              ),
            );
          }
          // Only mark overall as error for pipeline-level failures
          if (stage === "pipeline") {
            setOverallStatus("error");
          }
          addLog(`오류: ${message}`, true);
          break;
        }
      }
    });

    es.onerror = () => {
      // SSE connection error — may have closed normally on complete
      if (overallStatusRef.current === "processing") {
        addLog("서버 연결이 끊겼습니다.", true);
      }
    };

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Auto-scroll log area
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* File progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {overallStatus === "processing" && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {overallStatus === "complete" && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {overallStatus === "error" && (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            파일 처리 진행
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fileProgress.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              서버에서 파일을 수신 중...
            </div>
          ) : (
            <div className="space-y-3">
              {fileProgress.map((fp) => (
                <div key={fp.fileName} className="flex items-start gap-3">
                  {getStatusIcon(fp.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {fp.fileName}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        fp.status === "error"
                          ? "text-red-600"
                          : "text-muted-foreground",
                      )}
                    >
                      {fp.statusText}
                    </p>
                    {fp.status === "generating" &&
                      fp.chunksTotal != null &&
                      fp.chunksCurrent != null &&
                      fp.chunksTotal > 0 && (
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${(fp.chunksCurrent / fp.chunksTotal) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log area */}
      <Card>
        <CardHeader>
          <CardTitle>처리 로그</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto rounded-md bg-gray-50 p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">대기 중...</p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "py-0.5",
                    log.isError ? "text-red-600" : "text-gray-600",
                  )}
                >
                  <span className="text-muted-foreground">[{log.time}]</span>{" "}
                  {log.message}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
