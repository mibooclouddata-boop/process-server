# Supabase 전환 계획 및 이번 단계 경계

기준: 2026-10-26, main `2fb1505`, 작업 브랜치 `feat/supabase-auth-foundation`.
기존 미커밋 인증 보강 작업을 보존해 확장한다. 운영 데이터는 읽거나 변경하지 않는다.

최신 main의 PR #16/#17은 AS 전용 구조이며 공정·ERP·지도·모바일 앱·SSE가 제거되었다. 이 변경을 보존한다. 아래의 공정/ERP/지도 데이터 구조와 권한은 구버전 분석 및 보관 데이터 이전 참고이며 현재 API를 복원하거나 신규 테이블을 생성하지 않는다. allowedSteps는 기존 권한 정보를 잃지 않도록 프로필에 보존하되 현재 AS 권한 판정에는 사용하지 않는다. 모바일은 HTTP bearer 인증 계약만 유지한다.

## 확인된 계정 운영 방식

- 직원 이메일·전화번호는 수집하거나 사용하지 않는다.
- 관리자가 아이디/사번, 비밀번호, 권한을 발급한다. 복구는 관리자가 본인 확인 후 비밀번호를 변경해 별도 안전한 채널로 전달한다.
- Supabase password 인증용 주소는 무작위 UUID 기반 `@staff.invalid` 내부 식별자다. 실제 메일 발송, 이메일 복구, 공개 가입은 사용하지 않는다.
- 로그인 ID와 Auth 계정 연결은 서버 전용 매핑에서만 조회한다. 사용자 존재 여부·내부 주소·Auth 오류 원문을 로그인 응답으로 노출하지 않는다.
- 관리자 비밀번호 변경/권한 변경은 세션 버전 증가 및 기존 세션 폐기를 동반해야 한다. 공개 비밀번호 찾기 API는 만들지 않는다.

## 데이터 구조

| 기존 원본 | 목표 구조 | 식별·이전 원칙 |
|---|---|---|
| data.json users | auth.users + staff_profiles + private.staff_login_identifiers | 프로필 UUID는 불변, Auth UUID는 별도 unique FK. 로그인 ID 변경은 프로필 ID와 무관 |
| allowedSteps / asReview / asApprove | staff_profiles의 검증된 공정 코드 배열·boolean | 클라이언트 입력이나 Auth user_metadata를 권한 근거로 사용하지 않음 |
| 로그인 세션 | app_sessions | 무작위 토큰의 SHA-256만 저장, Auth access token은 서버 암호화키로 암호화. refresh token 미보관, 만료 시 재로그인 |
| data.json records | process_records (후속 이전) | actor_id → staff_profiles.id, barcode/type/qty/time, 이름은 표시용 당시 스냅샷 |
| as.json list/monthSeq | as_records, as_stages, as_history, as_month_sequences (후속 이전) | 작성자·완료자·이력 행위자 UUID, 납기 date, 시간 timestamptz, 금액 bigint/numeric. 번호 발급은 트랜잭션 |
| uploads + files 메타데이터 | 비공개 as-attachments 버킷 + as_attachments | AS UUID/파일 UUID 경로, 원본 파일명은 메타데이터. 공개 URL 금지 |
| master/products | materials, products (후속 이전) | 바코드 unique, 외부 코드와 내부 PK 분리 |
| map/location | map_areas, material_assignments, location_events (후속 이전) | 작업자 UUID, 바코드·구역 FK |
| erp/erp_columns/column-mappings | erp_rows, erp_columns, import_mappings (후속 이전) | 유동적인 수입 원본만 jsonb, 검색 필드는 정규 컬럼 |

현재 단계 SQL은 인증 기반과 비공개 첨부 접근을 위한 최소 메타데이터만 제공한다. 전체 업무 테이블 이전·CRUD 교체는 하지 않는다. 공개되는 ID는 UUID를 사용하며 추가 확장 없이 사용 가능한 gen_random_uuid()를 선택한다. FK 조회 인덱스와 RLS를 명시한다.

## 권한표 및 기존 동작 분석

기존 server.js의 역할·allowedSteps 검사, as-workflow-ui.js의 편집 조건, dashboard.html의 사용자/공정 설정을 기준으로 한다.

| 기능 | 시스템 관리자 sysadmin | 업무 관리자 admin | 작업자 worker |
|---|---|---|---|
| 내 프로필·업무 조회 | 허용 | 허용 | 허용 |
| 사용자 목록·발급·권한·비밀번호 관리 | 허용 | 거부 | 거부 |
| 공정 스캔 | 모든 공정 | 모든 공정 | allowedSteps에 있는 공정만 |
| 공정 기록 삭제·기준자료 변경·맵 구역 설정 | 허용 | 허용 | 거부 |
| ERP 전체 삭제 | 허용 | 거부 | 거부 |
| 자재 구역 배정·위치 등록 | 허용 | 허용 | 허용 (기존 업무 기능 유지) |
| AS 조회·접수 | 허용 | 허용 | 허용 |
| AS 수정·삭제·단계 전환 | 허용 | 본인 작성 또는 AS 플래그 | 본인 작성 또는 AS 플래그 |
| AS 첨부 읽기 | 허용 | 활성 계정 허용 | 활성 계정 허용 (기존 AS 전체 조회와 동일) |
| AS 첨부 쓰기 | 허용 | 본인 작성 또는 AS 플래그 | 본인 작성 또는 AS 플래그 |

공정: incoming, inspect_wait, inspect_done, paint_wait, paint_done, deliver_wait, deliver_done.
현재 AS 진행은 접수→제작 요청→도장 요청→납품 요청→완료이며, asReview/asApprove는 각각 독립 결재 단계가 아니라 AS 관리 권한으로 쓰인다. 이 의미를 유지한다. 이름 일치로 소유권을 인정하던 경로는 제거한다. ID 미연결 과거 건은 관리자가 매핑하기 전까지 일반 사용자의 편집 권한을 부여하지 않는다.

Supabase 준비 모드는 인증·프로필·권한 검사와 관리자 계정 발급/변경을 서버 진입점에 연결한다. 업무 데이터는 아직 JSON이므로 전체 전환 완료로 간주하지 않는다. 사용자 관리 요청은 Supabase 전용 모듈로 전달하며 JSON 계정에 쓰지 않는다. 발급 시 Auth 생성 후 프로필/매핑을 원자적으로 저장하고 실패하면 Auth 계정을 정리한다. 정리 실패로 남은 계정도 프로필이 없어 접근할 수 없다.

## 이전·검증·복구 순서

1. 운영과 분리된 Supabase 프로젝트, 백업 파일, 검증 전용 데이터 폴더를 준비한다. 운영 파일의 자동 비밀번호 변환을 실행하지 않는다.
2. 기존 로그인 ID 중복/공백/대소문자 정책과 퇴사·비활성 계정, 공정·AS 권한표를 관리자와 대조한다. 실제 비밀번호·개인정보를 보고서에 적지 않는다.
3. 직원별 불변 프로필 UUID를 한 번 발급하고 legacy ID→UUID 매핑을 안전한 저장소에 보관한다. 이름만 남은 작성자는 동명이인·삭제 계정 때문에 자동 확정하지 않고 검토 대기 목록으로 분리한다.
4. 관리자 전용 발급 도구로 무작위 내부 주소와 Auth 계정을 만든다. 공개 가입은 끈다. 기존 scrypt 해시는 그대로 이전할 수 있다고 가정하지 않고 관리자가 초기 비밀번호를 재발급한다. 부분 실패 시 미완성 프로필은 inactive 유지한다.
5. DB 스키마/RLS를 검증 환경에만 적용하고 계정·권한·세션·파일 정책을 역할별로 테스트한다. 정책 생성 전 기존 permissive 정책과 공개 버킷 여부를 반드시 검사한다.
6. 이후 별도 승인 작업으로 업무 테이블을 채우고 작성자/행위자 FK, 행 수·금액 합계·AS 번호·일정·첨부 SHA-256을 대조한다. 영구 원본 파일은 삭제하지 않는다.
7. 파일은 Storage API로 업로드한다. DB storage 메타테이블 직접 INSERT로 파일 업로드를 대신하지 않는다. 업로드/메타데이터 실패는 재시도 가능한 상태로 기록한다.
8. 검증·전환 승인 후에만 쓰기 정지→최종 증분 반영→버전 확정→배포한다. 이 작업에서는 수행하지 않는다.
9. 복구 시 앱·DB·첨부 버전을 함께 점검한다. 코드 롤백이 데이터 복구는 아니다. 전환 후 새 데이터가 생겼다면 옛 JSON 서버로 단순 전환하지 않는다.

## 근거 문서

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/storage/security/access-control
- 적용 스킬: .agents/skills/security-best-practices/SKILL.md, C:/Users/사용자/.codex/skills/supabase-postgres-best-practices/SKILL.md (이미 설치됨)
