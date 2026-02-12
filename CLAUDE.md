# KB-Chatbot Project

## Overview
카카오톡 채널 기반 AI 고객 지원 챗봇 + 지식 베이스 엔진

## Architecture
- **Runtime**: Cloudflare Workers (서버리스)
- **Vector DB**: pgvector (PostgreSQL)
- **Embedding**: OpenAI text-embedding-3-small
- **AI**: OpenAI GPT-4 (답변 생성), Claude (추후 검토)
- **Chatbot**: 카카오 i 오픈빌더 + 스킬 서버 (CF Workers)
- **Dashboard**: CF Pages (프레임워크 TBD)
- **DB**: Cloudflare D1 or Neon PostgreSQL (pgvector 지원 필요)

## Core Components

### 1. Knowledge Base Engine
- 벡터 검색 (pgvector + OpenAI 임베딩)
- 지식 저장: 원본(문의+답변) + AI 정제본(Q&A) 이중 저장
- 축적 흐름: 문의 해결 → AI가 Q&A 초안 자동 생성 → 운영자 컨펌/수정 → 지식 베이스 등록
- 검색 흐름: 새 문의 → 임베딩 → 유사 Q&A 검색 → 있으면 자동 답변 / 없으면 AI 생성

### 2. KakaoTalk Channel Bot (카카오 오픈빌더 스킬 서버)
- 고객 문의 → 지식 베이스 검색 → 자동 답변
- 해결 안 되면 상담사 연결
- 고객 등록: 카카오 싱크 (전화번호 수집) + 제품 등록

### 3. Operator Dashboard
- 지식 베이스 관리 (Q&A 확인/수정/삭제)
- 카톡 상담 내역 확인
- 고객 관리
- 멀티유저 (여러 상담사)

### 4. Marketplace Inquiry Collector
- 쿠팡 Open API: 고객문의 조회 + 답변
- 네이버 커머스 API: 상품문의 조회 + 답변
- 수집된 문의 → 지식 베이스에 축적

## Data Sources (지식 베이스 데이터 소스)
1. 카카오톡 채널 문의 (자동 수집)
2. 쿠팡 고객문의 (API 자동 수집)
3. 네이버 스마트스토어 문의 (API 자동 수집)
4. 운영자 수동 입력

## User Flow
```
고객이 제품 구매 (쿠팡/네이버/와디즈/자사몰)
  → 제품 박스/안내서에 카카오톡 채널 QR코드
  → 고객이 채널 추가 + 문의
  → 지식 베이스에서 유사 Q&A 검색
  → 매칭되면 자동 답변
  → 없으면 AI 생성 답변 or 상담사 연결
  → 해결된 문의는 지식 베이스에 축적
```

## Knowledge Base Lifecycle
```
문의 해결 (카톡 or 마켓플레이스)
  → 원본 저장 (문의 텍스트 + 답변 텍스트 + 임베딩 벡터)
  → AI가 Q&A로 정제 (질문 요약 + 답변 정리 + 임베딩 벡터)
  → 운영자가 확인/수정 → 컨펌
  → 지식 베이스에 등록 (검색 대상이 됨)
```

## Prerequisites
- 카카오톡 채널 (생성 완료, 비즈니스 심사 중)
- 카카오 디벨로퍼스 계정
- 쿠팡 Open API 키
- 네이버 커머스 API 키
- Cloudflare 계정
- OpenAI API 키

## Development Guidelines
- 혼자 깊게 계획하지 말고 사용자와 충분히 논의할 것
- 유지보수 쉽게, 멀티유저 필수
- 서버리스 아키텍처 (CF Workers + Pages)
- 단순하게 시작, 점진적으로 확장
