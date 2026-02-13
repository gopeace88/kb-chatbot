/**
 * 마켓플레이스 문의 수집 오케스트레이션
 *
 * 쿠팡/네이버/Cafe24 API에서 문의를 가져와 raw_inquiries에 저장한다.
 * DB 오퍼레이션은 @kb-chatbot/kb-engine의 collector 모듈을 사용.
 */

import type { Database } from "@kb-chatbot/database";
import {
  createSyncLog,
  completeSyncLog,
  failSyncLog,
  getLastSyncTime,
  getExistingExternalIds,
  bulkCreateInquiries,
  type SyncResult,
  type InquiryToCreate,
} from "@kb-chatbot/kb-engine";
import { CoupangClient } from "./coupang-client.js";
import { NaverCommerceClient } from "./naver-client.js";
import { Cafe24Client } from "./cafe24-client.js";

// re-export for route usage
export { listSyncLogs, type SyncResult } from "@kb-chatbot/kb-engine";

// ── 쿠팡 동기화 ──

export async function syncCoupang(
  db: Database,
  client: CoupangClient,
  openaiApiKey: string,
  syncType: "full" | "incremental" = "incremental",
): Promise<SyncResult> {
  const syncLogId = await createSyncLog(db, "coupang", syncType);
  const errors: string[] = [];
  let totalFetched = 0;
  let totalCreated = 0;

  try {
    let createdAfter: string | undefined;
    if (syncType === "incremental") {
      const lastSync = await getLastSyncTime(db, "coupang");
      if (lastSync) {
        createdAfter = lastSync.toISOString().split("T")[0];
      }
    }

    const existingIds = await getExistingExternalIds(db, "coupang");

    let page = 1;
    let totalPages = 1;

    do {
      const result = await client.fetchInquiries(page, createdAfter);
      totalPages = result.totalPages;
      totalFetched += result.inquiries.length;

      const newInquiries = result.inquiries
        .filter((inq) => !existingIds.has(inq.inquiryId))
        .map(
          (inq): InquiryToCreate => ({
            channel: "coupang",
            externalId: inq.inquiryId,
            customerName: inq.customerName || null,
            questionText: `[${inq.productName}] ${inq.content}`,
            answerText: inq.answer,
            answeredAt: inq.answeredAt ? new Date(inq.answeredAt) : null,
            receivedAt: new Date(inq.createdAt),
          }),
        );

      if (newInquiries.length > 0) {
        const created = await bulkCreateInquiries(db, newInquiries, openaiApiKey);
        totalCreated += created;
        for (const inq of newInquiries) {
          existingIds.add(inq.externalId);
        }
      }

      page++;
    } while (page <= totalPages);

    await completeSyncLog(db, syncLogId, totalFetched, totalCreated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await failSyncLog(db, syncLogId, msg);
  }

  return { syncLogId, recordsFetched: totalFetched, recordsCreated: totalCreated, errors };
}

// ── 네이버 동기화 ──

export async function syncNaver(
  db: Database,
  client: NaverCommerceClient,
  openaiApiKey: string,
  syncType: "full" | "incremental" = "incremental",
): Promise<SyncResult> {
  const syncLogId = await createSyncLog(db, "naver", syncType);
  const errors: string[] = [];
  let totalFetched = 0;
  let totalCreated = 0;

  try {
    let startDate: string | undefined;
    if (syncType === "incremental") {
      const lastSync = await getLastSyncTime(db, "naver");
      if (lastSync) {
        startDate = lastSync.toISOString().split("T")[0];
      }
    }

    const existingIds = await getExistingExternalIds(db, "naver");

    let page = 1;
    let totalPages = 1;

    do {
      const result = await client.fetchInquiries(page, startDate);
      totalPages = result.totalPages;
      totalFetched += result.inquiries.length;

      const newInquiries = result.inquiries
        .filter((inq) => !existingIds.has(String(inq.id)))
        .map(
          (inq): InquiryToCreate => ({
            channel: "naver",
            externalId: String(inq.id),
            customerName: inq.writerNickname || null,
            questionText: inq.questionTitle
              ? `${inq.questionTitle}\n${inq.questionContent}`
              : inq.questionContent,
            answerText: inq.answerContent,
            answeredAt: inq.answeredDate ? new Date(inq.answeredDate) : null,
            receivedAt: new Date(inq.createdDate),
          }),
        );

      if (newInquiries.length > 0) {
        const created = await bulkCreateInquiries(db, newInquiries, openaiApiKey);
        totalCreated += created;
        for (const inq of newInquiries) {
          existingIds.add(inq.externalId);
        }
      }

      page++;
    } while (page <= totalPages);

    await completeSyncLog(db, syncLogId, totalFetched, totalCreated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await failSyncLog(db, syncLogId, msg);
  }

  return { syncLogId, recordsFetched: totalFetched, recordsCreated: totalCreated, errors };
}

// ── Cafe24 동기화 ──

export async function syncCafe24(
  db: Database,
  client: Cafe24Client,
  openaiApiKey: string,
  boardNo = 4,
  syncType: "full" | "incremental" = "incremental",
): Promise<SyncResult> {
  const syncLogId = await createSyncLog(db, "cafe24", syncType);
  const errors: string[] = [];
  let totalFetched = 0;
  let totalCreated = 0;

  try {
    let startDate: string | undefined;
    if (syncType === "incremental") {
      const lastSync = await getLastSyncTime(db, "cafe24");
      if (lastSync) {
        startDate = lastSync.toISOString().split("T")[0];
      }
    }

    const existingIds = await getExistingExternalIds(db, "cafe24");

    let page = 1;
    let hasMore = true;

    do {
      const result = await client.fetchBoardArticles(boardNo, page, startDate);
      totalFetched += result.articles.length;

      const newInquiries = result.articles
        .filter((a) => !existingIds.has(String(a.article_no)))
        .map(
          (a): InquiryToCreate => ({
            channel: "cafe24",
            externalId: String(a.article_no),
            customerName: a.writer || null,
            questionText: a.title
              ? `${a.title}\n${a.content}`
              : a.content,
            answerText: a.reply_content,
            answeredAt: a.replied_date ? new Date(a.replied_date) : null,
            receivedAt: new Date(a.created_date),
          }),
        );

      if (newInquiries.length > 0) {
        const created = await bulkCreateInquiries(db, newInquiries, openaiApiKey);
        totalCreated += created;
        for (const inq of newInquiries) {
          existingIds.add(inq.externalId);
        }
      }

      hasMore = result.articles.length === 100;
      page++;
    } while (hasMore);

    await completeSyncLog(db, syncLogId, totalFetched, totalCreated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await failSyncLog(db, syncLogId, msg);
  }

  return { syncLogId, recordsFetched: totalFetched, recordsCreated: totalCreated, errors };
}
