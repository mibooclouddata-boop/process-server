# Supabase 인증 준비 코드 사용 및 남은 연동 작업

## 안전한 설정

실제 키를 채팅·명령행 인수·소스·스크린샷에 넣지 않는다. 서버 호스팅의 Secret/Environment 설정이나 접근권한을 제한한 로컬 `.env.local`을 사용한다. `.env.example`에는 이름과 빈 값만 제공한다.

1. 운영과 분리된 검증 프로젝트를 만든다. Auth의 공개 신규 가입, 이메일/전화 복구 흐름을 사용하지 않는다.
2. `.env.example`을 `.env.local`로 복사해 로컬 편집기로 설정한다. `SUPABASE_URL`, publishable 키(또는 legacy anon 키), 서버 secret 키(또는 legacy service_role 키)를 서버에만 넣는다. 변수 이름은 예시 그대로 사용한다.
3. `SESSION_ENCRYPTION_KEY`에는 암호학적으로 무작위인 32바이트를 hex 64자로 만든 값을 넣는다. Secret Manager에서 생성·보관한다. 키 변경 시 기존 세션은 모두 사용 불가하므로 재로그인을 안내한다.
4. `PROCESS_DATA_DIR`는 반드시 새 검증 폴더로 지정한다. 기존 `data.json`/업무 JSON/첨부 폴더를 지정하지 않는다. `AUTH_PROVIDER=supabase`를 명시적으로 설정한다. 잘못된 설정 시 로컬 인증으로 우회하지 않고 시작을 거부한다.
5. SQL 네 파일(001~003, `202611010004_shared_as_access.sql`)을 검토한 뒤 **검증 프로젝트에만** 순서대로 적용한다. 실제 프로젝트에는 실행하지 않았다. `private` 스키마를 Data API exposed schemas에 추가하지 않는다.
6. 빈 검증 프로젝트의 첫 관리자만 `supabase-bootstrap.cjs`로 만든다. 접근 제한된 `.env.local` 또는 Secret Manager에 `BOOTSTRAP_LOGIN_ID`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD`를 설정한 후 `node --env-file=.env.local supabase-bootstrap.cjs --empty-project`를 실행한다. 비밀번호는 명령행에 넣지 않는다. 성공 후 일회성 BOOTSTRAP 설정을 제거한다. 기존 프로필이 있으면 SQL이 거부한다. 내부 주소는 무작위 UUID이며 이메일 발송 없이 확인 처리한다.
7. 이후 관리자 화면에서 계정 발급·권한 수정·비밀번호 재설정·활성 상태를 관리한다. 비밀번호 변경은 계정 잠금/세션 폐기 → Auth 변경 → 성공한 경우만 활성 복구 순서다. 마지막 활성 sysadmin의 비활성화·강등·비밀번호 재설정은 차단한다. 재설정하려면 두 번째 관리자를 준비한다. 비밀번호는 12~128자이며 별도 안전한 채널로 전달한다.
8. Node 22 이상에서 `node --env-file=.env.local server.js`로 검증 서버를 실행한다. 일반 `npm start`는 .env 파일을 자동으로 읽지 않는다. 서버 환경변수로 주입한 경우 `npm start`를 사용한다.

운영에서는 HTTPS와 `SESSION_COOKIE_SECURE=true`가 필수다. Reverse proxy 신뢰 범위·CORS 허용 origin은 배포 환경에 맞게 한정한다. 임의 X-Forwarded-For를 신뢰하지 않는다. 최신 main에서 모바일 앱은 제거되었으며 이 PR은 모바일용 HTTP bearer 계약만 유지한다. 향후 클라이언트에는 서버 URL만 전달하고 `EXPO_PUBLIC_`, `VITE_`, `NEXT_PUBLIC_` 변수에 관리자 키를 넣지 않는다.

## API 계약

- `POST /api/login`: 기존 `{id,password}` 유지. 웹은 HttpOnly/SameSite 쿠키, 네이티브 모바일은 `X-Client-Type: mobile` 요청에 한해 불투명 bearer 토큰 응답. 모든 쓰기는 `X-Requested-With: process-server` 필요.
- `GET /api/me`: 서버가 검증한 현재 프로필만 응답. `id`는 불변 UUID, `loginId`는 직원이 입력하는 ID/사번. 내부 이메일·Auth UUID·비밀번호·키·Supabase 토큰은 응답하지 않는다.
- `POST /api/logout`: 서버 세션 삭제. 사용자 브라우저의 캐시된 프로필은 인증 근거가 아니다.
- `/api/users`: sysadmin만 목록 조회(최대 1,000명)·POST 발급, `/api/users/:UUID` PUT 권한/비밀번호/활성 수정. DELETE는 참조 보존을 위한 비활성화다. SQL에서도 현재 관리자 권한을 재검증한다. 감사 기록에는 비밀번호를 저장하지 않는다.
- `GET /api/as-attachments/:id`: 인증 후 직원 JWT로 메타데이터 RLS와 Storage RLS를 적용해 다운로드. 공개 URL이나 관리자 키를 반환하지 않는다. 운영 첨부를 옮기거나 기존 목록 URL을 자동 변경하지 않는다.
- AS 접수·진행·수정·삭제·복원·이력은 로그인한 모든 활성 직원에게 허용한다. 사용자 API는 폐기한 `asReview`/`asApprove` 입력을 400으로 거절하고 응답에도 포함하지 않는다.

## 공동 AS 정책 변경 적용과 복구

`202611010004_shared_as_access.sql`은 기존 `private.staff_can_manage_as(uuid)`만 교체한다. 기존 AS에 연결된 첨부의 Storage INSERT/DELETE를 활성 직원에게 허용하며, 익명·비활성 계정·연결 없는 파일·덮어쓰기는 계속 차단한다. 공개 버킷이나 업무 테이블 직접 쓰기 권한을 추가하지 않는다.

기존 세 마이그레이션을 적용한 검증 환경에는 004만 추가한다. 이 저장소 변경 자체가 실제 DB 적용은 아니며, 운영에서는 백업과 실제 역할별 검증 후 별도 승인된 릴리즈에 적용한다. 로컬 JSON AS 경로와 실제 Supabase Storage 경로를 함께 사용할 경우 코드와 DB 정책의 배포 시점을 맞춰야 한다.

기존 `as_review`/`as_approve` 열과 값은 호환·복구를 위해 보존하지만 현재 앱의 권한 근거로 사용하지 않는다. 구버전으로 복구할 때는 앱 버전만 되돌리지 말고, 002에 기록된 기존 함수 본문도 `CREATE OR REPLACE FUNCTION`으로 함께 복구한다. 002 전체를 재실행하지 않는다. 정책 복구는 공동 작업 중 변경한 AS 데이터나 삭제 이력을 되돌리지 않는다.

세션은 DB에 해시된 토큰과 암호화한 upstream access token을 저장한다. Auth getUser와 최신 프로필을 요청마다 확인한다. refresh token은 보관하지 않으며 Auth token 수명 또는 8시간 중 짧은 시점에 만료한다. 화면의 기존 로그인 상태 유지가 이 만료 시간을 연장하지는 않는다. 모바일 재시작 후에는 다시 로그인한다. 관리자 권한/활성 상태 변경 시 SQL 트리거가 세션 버전을 올린다. 단순 이름 변경은 사용자 ID와 소유권을 바꾸지 않는다.

일반 API는 매 요청마다 검증한다. 최신 main에서 제거된 SSE·공정·ERP API는 복원하지 않으며 계속 404를 반환한다.

## 로컬 검증

```
npm ci --ignore-scripts
npm run test:supabase
npm test
```

테스트는 임시 폴더, 합성 직원 계정, loopback HTTP 모의 Supabase, PGlite 메모리 PostgreSQL을 사용한다. Supabase 공식 SDK의 실제 HTTP 요청 형식과 Express 라우트를 통과한다. 로컬 PostgreSQL 테스트에는 최소한의 auth/storage 시스템 스키마를 구성한다. 실제 Supabase GoTrue/Storage 서버 전체를 실행한 검증과는 다르다.

## 실제 연동 전에 남은 작업

- 실제 검증 프로젝트에 SQL 적용, Auth 설정·가입 차단·내부 주소 허용 동작, getUser/계정 비활성화 확인.
- 관리자 발급·변경의 실제 Auth 연동 검증. DB 장애로 재설정이 pending에 남으면 운영자가 보호된 SQL 환경에서 해당 감사 ID로 `server_staff_finish_reset(operation_uuid,false)`를 호출해 실패 확정한 뒤, 관리자가 비밀번호를 다시 설정하고 활성화한다. 성공 여부가 불명확할 때 true로 완료하지 않는다. 고아 Auth 계정 정리·감사 조회 UI는 후속 작업이다.
- 운영 규모에 맞는 만료 세션·rate-limit 정리 작업과 로그인 속도 제한 튜닝. 내부 주소·인증 요청 본문이 프록시/APM 로그에 남지 않도록 필터링.
- DB·Storage의 실제 RLS 역할 테스트, 파일 업로드·메타데이터 원자성/보상 처리, MIME 검사/악성 파일 검사, 기존 첨부 URL 연결.
- 업무 JSON 전체를 Postgres 저장소로 바꾸는 작업, 사번/동명이인/삭제 계정과 UUID 매핑, 기존 데이터 대조. 현재 로컬 AS/공정 데이터 쓰기는 JSON이다.
- 향후 모바일 클라이언트 실기기, 실제 Supabase 연결 웹 로그인, HTTPS 쿠키·CORS·다중 서버 동작 확인. 현재 AS 화면의 XSS 방어는 로컬 실제 브라우저에서 검증했다.
- 전체 Supabase 전환 및 운영 배포는 별도 작업이다. 현재 업무 JSON의 동시 쓰기·충돌·백업/복구 개선도 남아 있다.

## 참고

- [Auth 사용자 검증](https://supabase.com/docs/reference/javascript/auth-getuser)
- [서버 키와 공개 키](https://supabase.com/docs/guides/getting-started/api-keys)
- [비공개 Storage 접근 정책](https://supabase.com/docs/guides/storage/security/access-control)
