// Core functions
export { generateEmbedding } from "./embedding.js";
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
  type DashboardStats,
  type ConversationStats,
} from "./stats.js";
