/**
 * 마켓플레이스 수집기 — DB 오퍼레이션
 *
 * sync log 관리, 중복 체크, 일괄 문의 생성 (임베딩 포함)
 */

import { eq, and, desc } from "drizzle-orm";
import {
  rawInquiries,
  collectorSyncLogs,
  type Database,
} from "@kb-chatbot/database";
import { generateEmbeddings } from "./embedding.js";

// 한 번에 임베딩할 최대 텍스트 수
const EMBEDDING_BATCH_SIZE = 50;

// ── 타입 ──

export interface SyncResult {
  syncLogId: string;
  recordsFetched: number;
  recordsCreated: number;
  errors: string[];
}

export interface InquiryToCreate {
  channel: "coupang" | "naver" | "cafe24";
  externalId: string;
  customerName: string | null;
  questionText: string;
  answerText: string | null;
  answeredAt: Date | null;
  receivedAt: Date;
}

// ── Sync Log 관리 ──

export async function createSyncLog(
  db: Database,
  platform: string,
  syncType: "full" | "incremental",
): Promise<string> {
  const [log] = await db
    .insert(collectorSyncLogs)
    .values({
      platform,
      syncType,
      status: "running",
    })
    .returning({ id: collectorSyncLogs.id });

  return log.id;
}

export async function completeSyncLog(
  db: Database,
  id: string,
  fetched: number,
  created: number,
) {
  await db
    .update(collectorSyncLogs)
    .set({
      status: "completed",
      recordsFetched: fetched,
      recordsCreated: created,
      completedAt: new Date(),
    })
    .where(eq(collectorSyncLogs.id, id));
}

export async function failSyncLog(
  db: Database,
  id: string,
  errorMessage: string,
) {
  await db
    .update(collectorSyncLogs)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(collectorSyncLogs.id, id));
}

export async function listSyncLogs(
  db: Database,
  opts: { limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  return db
    .select()
    .from(collectorSyncLogs)
    .orderBy(desc(collectorSyncLogs.startedAt))
    .limit(limit);
}

/**
 * 마지막 성공한 동기화 시간 조회 (incremental sync 기준점)
 */
export async function getLastSyncTime(
  db: Database,
  platform: string,
): Promise<Date | null> {
  const [log] = await db
    .select({ startedAt: collectorSyncLogs.startedAt })
    .from(collectorSyncLogs)
    .where(
      and(
        eq(collectorSyncLogs.platform, platform),
        eq(collectorSyncLogs.status, "completed"),
      ),
    )
    .orderBy(desc(collectorSyncLogs.startedAt))
    .limit(1);

  return log?.startedAt ?? null;
}

// ── 중복 체크 ──

export async function getExistingExternalIds(
  db: Database,
  channel: "coupang" | "naver" | "cafe24",
): Promise<Set<string>> {
  const existing = await db
    .select({ externalId: rawInquiries.externalId })
    .from(rawInquiries)
    .where(eq(rawInquiries.channel, channel));

  return new Set(
    existing
      .map((r) => r.externalId)
      .filter((id): id is string => id !== null),
  );
}

// ── 일괄 문의 생성 (임베딩 포함) ──

export async function bulkCreateInquiries(
  db: Database,
  items: InquiryToCreate[],
  openaiApiKey: string,
): Promise<number> {
  if (items.length === 0) return 0;

  let created = 0;

  for (let i = 0; i < items.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((item) => item.questionText);

    const embeddings = await generateEmbeddings(texts, openaiApiKey);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      try {
        await db
          .insert(rawInquiries)
          .values({
            channel: item.channel,
            externalId: item.externalId,
            customerName: item.customerName,
            questionText: item.questionText,
            answerText: item.answerText,
            questionEmbedding: embeddings[j],
            status: item.answerText ? "answered" : "new",
            receivedAt: item.receivedAt,
            answeredAt: item.answeredAt,
            answeredBy: item.answerText ? "marketplace" : null,
          })
          .onConflictDoNothing({
            target: [rawInquiries.channel, rawInquiries.externalId],
          });
        created++;
      } catch (err) {
        console.error(`Failed to insert inquiry ${item.externalId}:`, err);
      }
    }
  }

  return created;
}
