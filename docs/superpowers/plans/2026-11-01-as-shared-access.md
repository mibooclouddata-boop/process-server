# AS 공동 작업 권한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 활성 직원에게 AS 전체 작업을 허용하고 AS 권한 설정 제거 및 비활성 계정 생성 오류를 수정한다.
**Architecture:** 기존 인증 경계를 유지하고 서비스·UI의 소유자 예외를 제거한다. Supabase는 추가 마이그레이션으로 정책을 맞추며 기존 열을 보존한다.
**Tech Stack:** Node.js, Express, plain JS/HTML, PostgreSQL, node:test, PGlite, Playwright.
**Spec:** ../specs/2026-11-01-as-shared-access-design.md

## Global Constraints
- 실제 업무 데이터·비밀키·운영 서비스 사용 금지. 모든 쓰기는 테스트 데이터와 작업 코드에 한정한다.
- 원본 작업 트리 및 기존 변경 보존. 커밋·푸시·배포 금지.
- 사용자 관리 sysadmin 제한, 비활성·익명 차단, 파일/버전/사유 검증 보존.

## Review Focus
- 직원 B가 A의 AS 전체 수명주기를 처리해도 기록에는 B가 남아야 한다.
- 익명·비활성·재설정 필요 계정은 AS 변경이 불가해야 한다.
- 삭제/복원 사유 및 동시 수정 충돌은 공동 작업에서도 검사해야 한다.
- 권한 탭 제거 후 사용자 생성·키보드 탭 이동·계정 중지가 정상이어야 한다.
- Supabase Storage는 기존 연결 파일만 허용하고 익명·비활성·덮어쓰기는 계속 차단해야 한다.

## Task 1: 활성 상태 및 AS 공동 작업
**Files:** server.js, as-service.js, as-workflow-ui.js; user-management.test.cjs, as-integrity.test.cjs, as-workflow.test.js.
**Interfaces:** canManage(actor), asJobCanEdit(item), POST /api/users active default true.
- [x] 신규 active:false 저장/로그인 거절, 다른 직원의 수정·진행·삭제·복원·이력 및 잘못된 actor 검사를 추가하고 실패를 확인한다.
- [x] active 보존과 공통 활성 직원 검사를 구현한다. 작성자·변경자 정보는 보존한다.
- [x] 해당 테스트 통과 확인.

## Task 2: AS 권한 설정 제거와 Supabase 일치
**Files:** server.js, as-session.js, supabase-auth.js, supabase-admin.js, dashboard.html, user-admin-ui.js, supabase/migrations/202611010004_shared_as_access.sql; 관련 사용자/API/RLS/브라우저 테스트.
**Interfaces:** 사용자 응답/입력에서 asReview/asApprove 제거, private.staff_can_manage_as(uuid) 활성 직원+기존 AS 검사.
- [x] API 권한 필드 제거, 키보드/계정관리 흐름 및 공동 첨부 정책 테스트를 먼저 작성하고 실패를 확인한다.
- [x] 앱의 AS 권한 필드·UI 제거. 기존 DB 열은 보존하고 정책 함수만 새 마이그레이션으로 교체한다.
- [x] 관련 테스트 및 전체 npm test에 해당하는 파일 목록 실행. 로컬 브라우저 테스트와 화면 확인. 전체 93개 및 브라우저 3개 통과.

## Task 3: 검토 및 문서
- [x] 보안/운영 문서에 공동 작업 정책과 마이그레이션 적용·복구 유의사항을 기록한다.
- [x] 최종 diff를 독립 리뷰하고 필요 수정 및 검증을 수행한다. 독립 소스 리뷰에서 중요·경미 회귀 발견 없음.
- [x] 원본 상태 보존과 작업 브랜치 diff를 확인하고 결과·실제 DB 미적용을 보고한다. 원본에는 다른 동시 작업의 변경이 있어 별도 작업 트리를 유지한다.
