import assert from "node:assert/strict";
import { selectClarifyCandidates } from "../src/pipeline.ts";
import type { SearchResult } from "../src/search.ts";

function result(id: string, question: string, similarity: number): SearchResult {
  return {
    id,
    question,
    answer: `${question} 답변`,
    category: null,
    imageUrl: null,
    similarity,
  };
}

const ambiguous = selectClarifyCandidates([
  result("1", "첫 번째 질문", 0.6),
  result("2", "두 번째 질문", 0.58),
  result("3", "세 번째 질문", 0.56),
  result("4", "네 번째 질문", 0.55),
]);
assert.equal(ambiguous.length, 3);
assert.deepEqual(ambiguous.map((item) => item.question), [
  "첫 번째 질문",
  "두 번째 질문",
  "세 번째 질문",
]);

const highConfidence = selectClarifyCandidates([
  result("1", "확실한 질문", 0.8),
]);
assert.equal(highConfidence.length, 0);

const lowConfidence = selectClarifyCandidates([
  result("1", "낮은 질문", 0.4),
]);
assert.equal(lowConfidence.length, 0);

const deduped = selectClarifyCandidates([
  result("1", "중복 질문", 0.65),
  result("1", "중복 질문", 0.62),
  result("2", "다른 질문", 0.61),
]);
assert.deepEqual(deduped.map((item) => item.id), ["1", "2"]);
