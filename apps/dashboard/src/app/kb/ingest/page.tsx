"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDropZone } from "@/components/ingest/file-drop-zone";
import { IngestProgress } from "@/components/ingest/ingest-progress";
import { QAReviewList } from "@/components/ingest/qa-review-list";
import { ingestApi, type QACandidate } from "@/lib/ingest-api";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";

type Phase = "idle" | "uploading" | "processing" | "review" | "done";

interface ServerHealth {
  status: "checking" | "ok" | "error";
  message?: string;
}

export default function IngestPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [serverHealth, setServerHealth] = useState<ServerHealth>({
    status: "checking",
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<QACandidate[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number>(0);

  // Check server health on mount
  useEffect(() => {
    ingestApi
      .health()
      .then((h) => {
        if (h.status === "ok") {
          setServerHealth({ status: "ok" });
        } else {
          setServerHealth({
            status: "error",
            message: "서버가 비정상 상태입니다.",
          });
        }
      })
      .catch(() => {
        setServerHealth({
          status: "error",
          message:
            "인제스트 서버에 연결할 수 없습니다. kb-cli serve 명령으로 서버를 시작해주세요.",
        });
      });
  }, []);

  const handleStartIngest = useCallback(async (files: File[]) => {
    setPhase("uploading");
    setUploadError(null);

    try {
      const result = await ingestApi.upload(files);
      setJobId(result.jobId);
      setPhase("processing");
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "업로드에 실패했습니다.",
      );
      setPhase("idle");
    }
  }, []);

  const handleProcessingComplete = useCallback((cands: QACandidate[]) => {
    setCandidates(cands);
    setPhase("review");
  }, []);

  const handleSaved = useCallback((count: number) => {
    setSavedCount(count);
    setPhase("done");
  }, []);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setJobId(null);
    setCandidates([]);
    setUploadError(null);
    setSavedCount(0);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">문서 인제스트</h1>
        {phase !== "idle" && phase !== "uploading" && (
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
            처음부터 다시
          </Button>
        )}
      </div>

      {/* Phase indicator */}
      <div className="mt-4 flex items-center gap-2">
        <PhaseStep label="업로드" step={1} active={phase === "idle" || phase === "uploading"} done={phase === "processing" || phase === "review" || phase === "done"} />
        <div className="h-px flex-1 bg-gray-200" />
        <PhaseStep label="처리" step={2} active={phase === "processing"} done={phase === "review" || phase === "done"} />
        <div className="h-px flex-1 bg-gray-200" />
        <PhaseStep label="검토/승인" step={3} active={phase === "review"} done={phase === "done"} />
      </div>

      {/* Server health warning */}
      {serverHealth.status === "checking" && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          인제스트 서버 연결 확인 중...
        </div>
      )}
      {serverHealth.status === "error" && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertCircle className="h-4 w-4" />
          {serverHealth.message}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {uploadError}
        </div>
      )}

      {/* Phase content */}
      <div className="mt-6">
        {/* Phase 1: Upload */}
        {(phase === "idle" || phase === "uploading") && (
          <Card>
            <CardContent className="p-6">
              {phase === "uploading" ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    파일 업로드 중...
                  </p>
                </div>
              ) : (
                <FileDropZone
                  onStartIngest={handleStartIngest}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 2: Processing */}
        {phase === "processing" && jobId && (
          <IngestProgress
            jobId={jobId}
            onComplete={handleProcessingComplete}
          />
        )}

        {/* Phase 3: Review */}
        {phase === "review" && jobId && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="default">
                {candidates.length}개 Q&A 후보
              </Badge>
              <Badge variant="warning">
                {candidates.filter((c) => c.isDuplicate).length}개 중복
              </Badge>
            </div>
            <QAReviewList
              candidates={candidates}
              jobId={jobId}
              onSaved={handleSaved}
            />
          </>
        )}

        {/* Phase 4: Done */}
        {phase === "done" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">
                  저장 완료
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {savedCount}개의 Q&A가 지식 베이스에 저장되었습니다.
                </p>
              </div>
              <Button onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
                추가 문서 인제스트
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PhaseStep({
  label,
  step,
  active,
  done,
}: {
  label: string;
  step: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-green-500 text-white"
            : active
              ? "bg-primary text-white"
              : "bg-gray-200 text-gray-500"
        }`}
      >
        {done ? (
          <CheckCircle className="h-3.5 w-3.5" />
        ) : (
          step
        )}
      </div>
      <span
        className={`text-sm ${
          active || done ? "font-medium text-gray-900" : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
