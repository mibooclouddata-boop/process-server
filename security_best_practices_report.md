# process-server 보안 보강 결과

2026-10-26 / `security/auth-hardening`

별도 작업 디렉터리 `.worktrees/auth-hardening`에서 인증·권한 및 저장형 XSS를 보강했다. 공유 디렉터리의 병행 Supabase 작업은 포함하지 않는다. 실제 업무 데이터와 운영 서버는 변경하지 않았다. 지정된 security-best-practices의 Express·일반 웹·React 참조를 적용했다.

## 수정한 문제

1. **Critical: 익명 업무 API·첨부파일 접근.** `server.js:267`의 인증과 `server.js:274`의 공통 API 경계로 로그인 외 업무 API를 보호한다. `server.js:76`의 첨부파일은 로그인 및 AS 연결 여부를 확인하고 nosniff·sandbox·캐시 제한을 적용한다.
2. **Critical: 직원의 사용자 관리·ERP 전체 삭제.** `server.js:276`부터 sysadmin 전용 권한을 적용한다. ERP 업로드·구조 변경과 기준 자료 수정은 관리자 이상으로 제한한다. 직원 스캔은 allowedSteps, AS 변경은 접수자 ID 또는 AS 관리 권한을 확인한다. 마지막 시스템 관리자 삭제·강등을 차단한다.
3. **High: 평문 비밀번호·고정 초기 계정.** `passwords.js`의 개별 salt와 scrypt(N=131072,r=8,p=1), 시간 일정 비교를 사용한다. `server.js:232`에서 요청 수신 전에 평문 필드를 제거한다. 알려진 초기 비밀번호와 무효 계정은 잠그고 자동 데모 계정 생성을 제거했다. 신규·재설정 비밀번호는 12~128자다. [계정 전환·복구 절차](AUTH_MIGRATION.md)를 제공한다.
4. **High: 세션·모바일 로그인·CSRF.** 웹 HttpOnly 쿠키, 모바일 실제 서버 로그인과 메모리 Bearer 토큰을 적용했다. 자격·권한 변경 시 기존 세션을 거절한다. 변경 API의 사용자 정의 헤더, 출처 제한, 로그인 실패·동시 연산 제한을 추가했다. 모바일의 기존 작업 종류 연동은 사용자 요청으로 보류했다.
5. **High: 저장형 XSS — 보강 완료.** `dashboard.html:2808`의 고정 이벤트 처리와 `dashboard.html:2829`의 출력 이스케이프를 적용했다. AS·ERP·기준 자료·스캔·배치도·첨부파일명·출력 문서의 사용자 데이터를 텍스트로 출력한다. 동적 인라인 이벤트에서 사용자 값을 제거하고 HTML 이스케이프한 data 속성 또는 DOM 이벤트를 사용한다. 첨부 URL의 경로 구성요소도 인코딩한다. `server.js:57`은 페이지 스크립트 해시 기반 script-src-elem CSP를 적용하며 CRLF를 정규화한다. 기존 정적 인라인 이벤트는 호환성을 위해 남아 있어 CSP만으로 모든 XSS를 막는다고 주장하지 않는다. 출력 문서는 script-src 'none'을 적용한다.

PDF 미리보기는 `isEvalSupported:false`로 PDF.js의 코드 평가를 비활성화했다. 이는 [Mozilla 공식 권고](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)의 완화책이며, 최신 PDF.js로의 전환은 별도 회귀 검증이 필요하다.

## 검증

- `npm.cmd test`: 50개 통과. 실제 Express 서버와 임시 합성 데이터로 익명 API·첨부 401, 권한 부족 403, 관리자 ERP 업로드, AS multipart 및 첨부 다운로드, 작성자 위조 차단, 세션 폐기, 계정 전환·오프라인 복구, 웹·모바일 HTTP 로그인을 검증했다.
- `npm.cmd run test:xss`: 실제 Chromium(Windows Edge) 브라우저 테스트 1개 통과. 악성 문자열을 API에 저장하고 AS·ERP·기준 자료·스캔·제품 제안·배치도·첨부파일명·인쇄 HTML에서 실행되지 않는지 확인했다. CSP를 제거한 상태에서도 악성 코드 및 ERP 삭제 요청이 발생하지 않는다. CSP 활성 상태의 정상 로그인과 임의 인라인 스크립트 차단도 확인했다. PDF.js는 호출 옵션을 검증했으며 악성 PDF 파일 렌더링 자체를 재현한 테스트는 아니다.
- `git diff --check` 통과. 실제 사용자 데이터 및 운영 환경에서 테스트하지 않았다. Android/iOS 기기 빌드·실기기 검증은 하지 않았다.
- 호환 가능한 의존성 보안 업데이트를 lockfile에 적용했다. 기존 lockfile에 남아 있던 루트 Expo 의존성은 현재 package.json에 맞춰 정리되었으며 mobile/package.json은 변경하지 않았다.

## 남은 위험 및 제약

- **High: xlsx 0.18.5.** npm audit에 고위험 패키지 1개가 남는다. [Prototype Pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)에 대해 npm 제공 수정 버전이 없다. 관리자 업로드 제한은 노출을 줄일 뿐 해결이 아니다. SheetJS 배포 전환 또는 파서 교체와 파일 호환성 검증이 필요하며 즉시 병합·운영 배포를 권하지 않는다.
- **Medium: 기존 비밀번호 노출.** 해시 전환은 과거 노출을 되돌리지 않는다. 비기본 기존 비밀번호는 호환성을 위해 유지하므로 순차 재설정이 필요하다. 잠긴 관리자 계정은 배포 전에 오프라인 복구해야 한다. 평문 백업과 파일 ACL은 별도 통제 대상이다.
- **Medium: 단일 프로세스.** 세션과 로그인 제한은 메모리에 있어 재시작 시 초기화된다. 다중 인스턴스에는 공유 저장소가 필요하다. 프록시의 공용 IP 및 Secure 쿠키 설정을 확인해야 한다.
- **Medium: 공동 업무 열람.** 로그인 직원의 업무·첨부 공동 열람을 유지한다. 부서·프로젝트별 격리는 추가하지 않았다. 과거 AS의 이름 기반 작성자는 동명이인이 없을 때만 호환 처리한다.
- 모바일 기존 작업 연동은 보류되며 앱 재시작 시 재로그인한다. JSON은 단일 쓰기 프로세스를 전제로 한다. 해시 저장 이후 이전 평문 버전으로 코드만 롤백하면 로그인할 수 없다. 전체 업로드 형식·외부 CDN 의존성에 대한 종합 감사는 이번 범위 밖이다.

병합·릴리즈·운영 배포는 각각 별도 승인이 필요하다.
