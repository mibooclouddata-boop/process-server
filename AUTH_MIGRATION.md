# 인증 전환 및 복구 절차

이 문서는 배포 승인이나 배포 실행을 의미하지 않는다. 이번 작업에서는 실제 계정·업무 데이터에 전환 명령을 실행하지 않았다.

## 변경되는 동작

- 웹 로그인은 HttpOnly / SameSite=Strict 쿠키를 사용한다. 기존 로그인 응답의 `success`, `user` 형식은 유지한다. 대시보드는 `/api/me`에서 현재 계정 정보를 확인한다.
- 모바일 로그인은 실제 `/api/login`을 호출하고 메모리에만 Bearer 토큰을 보관한다. 앱 재시작 시 재로그인한다. 기존 작업 종류의 서버 공정 연동은 사용자 요청으로 보류했다. 기존 작업 전송은 지원하지 않는 공정으로 거절되며 기록을 전송 완료로 표시하지 않는다.
- 모든 업무 API와 AS 첨부파일은 로그인해야 접근할 수 있다. AS 목록·첨부 조회는 기존 공동 업무 범위인 모든 로그인 직원에게 허용한다. 부서별 열람 제한은 추가하지 않았다.
- 사용자 관리와 ERP 전체 삭제는 `sysadmin`만 가능하다. ERP 수정·업로드, 기준 자료·컬럼 매핑 수정, 기록 삭제, 배치도 영역 수정은 `sysadmin` 또는 `admin`만 가능하다.
- AS 변경·삭제·진행 변경은 접수자 또는 `sysadmin` / `asReview` / `asApprove` 권한 계정에게 허용한다. 신규 접수자는 계정 ID로 기록한다. 과거 이름만 있는 접수는 동명이인이 없을 때만 이름으로 접수자를 판별한다. 동명이인·퇴사자 건은 AS 권한 관리자에게 맡긴다.
- 직원 스캔은 서버의 `allowedSteps`로 검증한다. 권한 목록이 비어 있으면 공정 등록을 허용하지 않는다.
- 비밀번호·권한 변경 또는 계정 삭제 시 기존 세션은 무효화된다. 세션 수명은 8시간이며 서버 재시작 때 모든 세션이 폐기된다. 운영은 단일 Node 프로세스를 전제로 한다.

## 배포 전에 준비할 사항

1. 기존 서버를 중지하고 실제 데이터 디렉터리 전체와 `uploads/`를 별도 접근 통제된 저장소에 백업한다. 평문 비밀번호를 포함할 수 있는 백업은 Git에 넣거나 일반 공유 폴더에 두지 않는다.
2. `PROCESS_DATA_DIR`를 정확한 영구 데이터 디렉터리로 지정한다. 생략 시 기존처럼 `server.js`가 있는 디렉터리를 사용한다. 새로운 디렉터리를 잘못 지정하면 빈 업무 데이터와 빈 계정 저장소로 시작하므로 먼저 확인한다. `products.json`, `column-mappings.json`도 이 디렉터리에 포함한다.
3. 공개된 초기 비밀번호 `1234` 계정과 비밀번호가 없거나 유효하지 않은 계정은 전환 후 잠긴다. 관리자가 모두 해당하면 서버를 시작하기 **전에** 아래 오프라인 명령으로 기존 관리자 비밀번호를 재설정한다. 나머지 계정은 관리자 화면의 ‘비밀번호 재설정 필요’ 표시를 확인해 고유한 12~128자 비밀번호를 설정한다.
4. HTTPS를 종료하는 프록시 뒤에서는 `SESSION_COOKIE_SECURE=true`로 설정한다. 로컬 HTTP 테스트에는 설정하지 않는다. `trust proxy`는 임의로 켜지 않았으므로 로그인 실패 제한은 실제 연결 IP 기준이다. 운영 프록시의 신뢰 범위와 공용 IP 환경을 검토한다.
5. 웹은 같은 출처를 기본으로 한다. 별도 웹 출처가 필요할 때만 `CORS_ORIGINS`에 신뢰하는 정확한 origin을 쉼표로 지정한다. 모바일은 `EXPO_PUBLIC_SERVER_URL`로 로그인과 업무 요청의 동일 서버 URL을 지정한다. 운영 모바일 주소는 HTTPS로 지정한다.

## 오프라인 관리자 복구 / 최초 계정 생성

서버를 중지한 상태에서 실행한다. 실행 중인 서버와 동시에 JSON을 수정하지 않는다. 암호를 명령행 인수·소스 파일·채팅에 넣지 않는다.

PowerShell 예시(암호는 숨김 입력):

```powershell
$env:PROCESS_DATA_DIR = '확인한 실제 데이터 디렉터리의 절대 경로'
$accountSecret = Read-Host '새 비밀번호 (12~128자)' -AsSecureString
$accountPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($accountSecret)
try {
    $env:PROCESS_ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($accountPointer)
    node reset-account.cjs admin
} finally {
    Remove-Item Env:PROCESS_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($accountPointer)
    $accountSecret.Dispose()
}
```

`admin`은 실제 복구 대상 ID로 바꾼다. 기존 계정의 이름·역할·업무 기록은 유지된다. 새 설치에서 계정이 하나도 없을 때만 `node reset-account.cjs <아이디> --bootstrap`으로 시스템 관리자를 만든다. 기본 비밀번호나 자동 생성되는 데모 계정은 없다.

명령은 대상 비밀번호를 해시로 저장하고 나머지 평문 계정도 전환한다. 이미 해시인 계정은 다시 해시하지 않는다. 정상 종료를 확인한 뒤 서버를 시작한다. 비밀번호는 출력하지 않는다.

## 자동 전환 및 검증

- 서버는 요청을 받기 전에 기존 평문 비밀번호를 개별 salt의 scrypt 해시로 변환하고 `password` 필드를 제거한다. `data.json.tmp`에 먼저 기록한 뒤 이름을 바꾼다. 파일 접근 권한은 운영체제에서 별도로 제한한다.
- 기존 비기본 비밀번호는 로그인 호환성을 위해 유지된다. 과거 평문 노출 여부를 해시 전환으로 되돌릴 수 없으므로 순차적으로 고유한 새 비밀번호로 재설정한다.
- 전환 후 관리자/직원 로그인, 사용자 관리 거절, AS 조회·첨부·수정, ERP 조회·관리자 업로드를 확인한다. 기존 세션은 다시 로그인한다.
- 테스트는 `npm.cmd test`(Windows) 또는 `npm test`로 실행한다. 통합 테스트는 OS 임시 디렉터리의 합성 데이터와 `127.0.0.1`의 임의 포트만 사용한다.

## API 클라이언트 변경

모든 POST / PUT / PATCH / DELETE 요청(로그인·로그아웃 포함)은 `X-Requested-With: process-server` 헤더가 필요하다. 웹의 `auth-client.js`는 같은 출처 API 요청에 이 헤더를 추가하며 FormData의 boundary를 보존한다. 모바일 로그인은 추가로 `X-Client-Type: mobile`을 보내 응답의 `token`을 받아 이후 `Authorization: Bearer <token>`으로 요청한다. 토큰을 URL이나 영구 저장소에 넣지 않는다.

## 복구 시 주의

이 변경은 JSON 계정 저장 형식을 변경하며 SQL DB 마이그레이션은 없다. 이전 평문 비교 코드는 새 해시로 로그인할 수 없으므로 코드만 이전 버전으로 되돌리지 않는다. 해시를 이해하는 버전으로 복구하거나 점검 시간에 보호된 백업과 해당 버전의 호환성을 검증해야 한다. 평문 백업 복원은 보안 취약점 재도입이며 백업 이후 업무 기록도 손실될 수 있다. 복구에 `data.json` 전체 덮어쓰기를 가볍게 사용하지 않는다.

## XSS 브라우저 회귀 테스트

`npm.cmd run test:xss`는 실제 Chromium 브라우저를 실행한다. Windows에서는 설치된 Edge를 기본으로 사용하며 `PLAYWRIGHT_CHANNEL`로 변경할 수 있다. 다른 OS에서는 Playwright Chromium 설치가 필요하다. 테스트는 임시 합성 데이터를 사용하며 CSP 비활성·활성 상태를 모두 검증한다.
