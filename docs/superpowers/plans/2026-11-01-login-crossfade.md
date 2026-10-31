# Login Crossfade Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 선택된 교차 페이드를 로그인과 대시보드 사이에 적용하고 검증 후 초안 PR을 게시한다.
**Architecture:** cover-assets의 공통 전환 모듈이 로그인 페이지에서 실제 대시보드 프레임, 인사말, 타이머와 오류 복구를 관리한다. 대시보드는 인증 및 첫 A/S 조회 완료를 부모 모듈에 명시적으로 전달한다. 직접 진입과 새로고침은 원래 대시보드를 사용한다.
**Tech Stack:** 기존 HTML/CSS/JavaScript, Express, node:test, Playwright Edge.
**Spec:** ../specs/2026-11-01-login-crossfade-design.md

## Global Constraints

새 라이브러리 없음. 등장 360ms, 읽기 1,250ms, 교차 페이드 420ms, 응답 제한 8초. 기존 사용자 변경과 시안 폴더는 보존. main 직접 푸시 및 승인 없는 병합·배포 금지.

## Review Focus

문서/인증/데이터 실패 복구, 중단한 요청의 늦은 응답, 새로고침·뒤로가기 재생 금지, 저장소 제한과 이름의 XSS, 모션 감소와 준비 중 키보드 접근을 브라우저 테스트에 포함한다.

### Task 1: 전환 모듈과 페이지 연동

**Files:** cover-assets/login-transition.js 및 .css 신규, login.html, dashboard.html, login.test.cjs 수정; login-transition-browser.test.cjs 신규.
**Interfaces:** LoginTransition.start(user), ready(), fail(message), active, signal. 서버 인증과 기존 데이터 API 계약은 유지한다.

- [x] 로그인 테스트의 4초 타이머 기대값을 일회성 전환 시작 계약으로 변경하고 실패를 확인한다.
- [x] 실제 로그인, 대기, 준비 완료 및 재시도를 검증하는 브라우저 테스트를 작성하고 기존 코드의 실패를 확인한다.
- [x] 공통 모듈과 CSS를 구현하고 로그인/초기 인증/A/S 조회에 연결한다.
- [x] node --test login.test.cjs 및 node --test login-transition-browser.test.cjs 통과와 실제 화면을 확인한다.

### Task 2: 리뷰 및 Git 게시

**Files:** 위 Task 1의 최종 diff 및 package.json의 브라우저 검사 명령.
**Interfaces:** 실제 원격 기본 브랜치 main, 작업 브랜치 fix/login-crossfade.

- [x] npm.cmd test와 관련 기존 브라우저 검증을 실행한다.
- [x] 전체 변경과 연결 호출부에 대한 독립 리뷰를 받고 필요한 수정을 재검증한다.
- [ ] 의도한 파일만 스테이징하고 staged diff를 확인한 뒤 커밋·푸시한다.
- [ ] 동일 head의 열린 PR 확인 후 초안 PR 생성/갱신, 실제 PR diff 및 merge-base/최종 SHA 확인.
- [ ] 검사·리뷰·커밋·PR을 보고하고 해당 PR을 main에 병합할지 사용자에게 질문한다.
