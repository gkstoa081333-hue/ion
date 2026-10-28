# 이온 시그널 — 설정·배포 안내

## 파일
- `index.html` — 앱 전체 (참가자 + 관리자)
- `database.rules.json` — Firebase Realtime Database 보안 규칙

## 주소
- 참가자: `https://<배포주소>/?s=<타임ID>` → 관리자 화면 **QR 탭**에서 자동 생성
- 관리자: `https://<배포주소>/#admin`

## 1. Firebase 준비 (약 10분)
1. https://console.firebase.google.com → **프로젝트 추가** (예: `eon-signal`, 애널리틱스 끔)
2. **빌드 > Realtime Database > 데이터베이스 만들기** → 위치 `asia-southeast1(싱가포르)` → **잠금 모드**로 시작
3. 같은 화면 **규칙** 탭 → `database.rules.json` 내용 전체 붙여넣기 → **게시**
4. **빌드 > Authentication > 시작하기** → 로그인 방법에서 **이메일/비밀번호**, **익명** 두 개 사용 설정
5. Authentication **사용자** 탭 → **사용자 추가**로 운영진 계정 만들기 (2명이면 2개) → 생성된 **사용자 UID** 복사
6. Realtime Database **데이터** 탭 → 루트에 `admins` 추가 → 그 아래 `UID : true` (불리언) 로 운영진마다 한 줄씩
7. **프로젝트 설정(톱니바퀴) > 내 앱 > 웹(</>)** → 앱 등록 → 나오는 `firebaseConfig` 값을
   `index.html` 상단 `FIREBASE_CONFIG` 에 붙여넣기 (`databaseURL` 꼭 포함)

## 2. 배포 (GitHub Pages)
1. GitHub에 새 저장소 `eon-signal` (Public) 생성
2. `index.html` 업로드 → **Settings > Pages > Branch: main / root** 저장
3. 1~2분 뒤 `https://<아이디>.github.io/eon-signal/` 로 접속

(Netlify 드래그&드롭으로 올려도 똑같이 동작합니다.)

## 3. 행사 당일 순서
1. `#admin` 로그인 → **새 타임 만들기** (기수·날짜·타임)
2. **참가자 탭** → 네이버폼 엑셀에서 성별·이름·연락처 3칸 복사해 붙여넣기 → 번호표 배부
3. **QR 탭** → 인쇄해서 테이블에 비치
4. 로테이션 끝나면 **투표 탭 > 투표 시작하기**
5. 전원 제출 확인 → **투표 마감하고 결과 보기**
6. **결과 탭** → 사람마다 **문구 복사** → 카카오톡에 붙여넣어 발송 → **CSV 내보내기**로 보관

## 보안 설계 요약
- 참가자 폰에는 명단(이름·연락처)이 내려가지 않습니다. 이름+번호 뒷자리로 만든 확인 키만 대조합니다.
- 참가자는 **자기 번호의 투표 1번만** 쓸 수 있고, 다른 사람 투표·결과는 읽을 수 없습니다.
- 투표는 관리자가 **투표 시작**을 누른 동안에만 받습니다.
- 행사 후 일정 기간이 지나면 관리자 화면에서 **이 타임 삭제**로 개인정보를 지워주세요.
