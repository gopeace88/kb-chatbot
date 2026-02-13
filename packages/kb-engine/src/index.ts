// Core functions
export { generateEmbedding, generateEmbeddings, type EmbeddingOptions } from "./embedding.js";
export { searchKnowledgeBase, type SearchResult } from "./search.js";
export { generateAnswer } from "./answer.js";
export { refineInquiry, type RefinedQA } from "./refine.js";

// Pipeline
export { answerPipeline, type AnswerPipelineResult } from "./pipeline.js";

// CRUD operations
export {
  // KB
  createKBItem,
  updateKBItem,
  getKBItem,
  listKBItems,
  publishKBItem,
  archiveKBItem,
  incrementUsageCount,
  updateHelpful,
  type CreateKBItemInput,
  type UpdateKBItemInput,
  type ListKBItemsFilter,
  // Inquiries
  createInquiry,
  listInquiries,
  getInquiry,
  answerInquiry,
  refineAndCreateKB,
  type CreateInquiryInput,
  type ListInquiriesFilter,
  // Conversations
  createConversation,
  listConversations,
  getLatestConversation,
  updateConversationFeedback,
  type CreateConversationInput,
} from "./crud.js";

// Stats
export {
  getDashboardStats,
  getConversationStats,
  getRAGStats,
  type DashboardStats,
  type ConversationStats,
  type RAGStats,
} from "./stats.js";

// Collector
export {
  createSyncLog,
  completeSyncLog,
  failSyncLog,
  listSyncLogs,
  getLastSyncTime,
  getExistingExternalIds,
  bulkCreateInquiries,
  type SyncResult,
  type InquiryToCreate,
} from "./collector.js";

// Customer Links
export {
  getCustomerLink,
  upsertCustomerLink,
  listCustomerLinks,
  getCustomerStats,
  type CustomerLink,
  type CustomerStats,
  type ListCustomerLinksFilter,
} from "./customer-links.js";

// Cafe24 Token Store
export {
  DbTokenStore,
  type TokenStore,
  type TokenData,
} from "./cafe24-tokens.js";
