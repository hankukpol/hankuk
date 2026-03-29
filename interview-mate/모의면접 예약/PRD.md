# PRD: 모의면접 예약 & 조 편성 시스템

## 1. 개요

### 1.1 목적
한국경찰학원의 모의면접 운영을 위한 **예약 시스템**과 **조 편성(조 방) 시스템**을 구축한다.

### 1.2 배경
- 경찰/소방 직렬별 **개별 모의면접**을 네이버 예약과 유사하게 시간·인원 관리
- 면접 스터디 **조 편성** 후 학생들이 **조 방**에서 조원 확인 → **카카오톡 단톡방**으로 이동하여 본격 소통
- 조 방의 목적: 조원 확인 + 간단 소통 + 카톡 단톡방 개설을 위한 **임시 모임 공간**
- 실제 모의면접은 개별적으로 학원에서 일정 공지 → 지원/임의 편성으로 진행
- 조 편성의 목적: 면접 스터디 그룹 구성 (학원 스터디 공간 활용)
- 기존 조 편성 프로그램(`d:/앱 프로그램/면접/면접 조 편성/`)과 CSV 호환
- 무료, 결제 기능 없음
- 1년에 2회만 사용

### 1.3 기술 스택
| 구분 | 기술 |
|------|------|
| 프론트엔드 | Next.js 14 (App Router, TypeScript) |
| 스타일링 | Tailwind CSS |
| 데이터베이스 | Supabase (PostgreSQL) |
| 실시간 채팅 | Supabase Realtime |
| 배포 | Vercel (무료 티어) |
| 파일 파싱 | ExcelJS (엑셀 업로드/내보내기) |

### 1.4 디자인 가이드

> **중요**: 모든 UI 구현은 `디자인_가이드.md` 파일을 기준으로 한다.
> 아래는 이 프로젝트에 특화된 추가 지침이며, `디자인_가이드.md`와 충돌 시 디자인 가이드가 우선한다.

#### 레퍼런스
- **네이버 예약 페이지** 디자인을 참고하여 깔끔하고 직관적인 UI 구현

#### 직렬 브랜드 컬러 (`디자인_가이드.md` 3.2절 참조)
| 직렬 | DEFAULT | light | dark |
|------|---------|-------|------|
| 경찰 | `#1B4FBB` | `#EBF0FB` | `#0D2D6B` |
| 소방 | `#C55A11` | `#FEF3EC` | `#7A3608` |

- CSS 변수 `--division-color`, `--division-color-light`, `--division-color-dark` 사용
- track(police/fire)에 따라 동적 전환

#### 이 프로젝트 추가 규칙
- **절대 금지**: 황금색, 연한 노란색, 그라데이션, AI 스타일 디자인, 과도한 장식
- **모바일 퍼스트**: 최대 컨텐츠 너비 `480px` (학생용), 관리자는 `1024px`+
- **시간 슬롯 카드** (예약 페이지): 기본 흰색+border, 선택시 `division-color-light`+`2px solid`, 마감시 회색+`#999`
- **캘린더**: 오늘=브랜드 원형, 선택=브랜드 채움, 비활성=`#CCC`, 일요일=빨간, 토요일=파란

---

## 2. 시스템 구조

### 2.1 아키텍처
```
[학생 브라우저] ←→ [Next.js (Vercel)] ←→ [Supabase (DB + Realtime)]
                        ↑
                   [관리자 브라우저]
```

### 2.2 페이지 구조 (URL)
```
/                                  → 메인 (직렬/기능 선택)
/reservation?track=police          → 경찰 면접 예약
/reservation?track=fire            → 소방 면접 예약
/my-reservation?track=...          → 내 예약 조회/수정/취소
/apply?track=police                → 경찰 조 편성 지원
/apply?track=fire                  → 소방 조 편성 지원
/join/[inviteCode]                 → 초대 링크로 조 방 입장
/room?token=xxx                    → 조 방 (채팅 + 조원 목록)
/status?token=xxx                  → 대기자 현황 조회
/admin?key=ADMIN_SECRET            → 관리자 대시보드
```

### 2.3 인증

#### 학생 인증 (Phone-based, 로그인 없음)
1. 학생이 연락처 입력 → `registered_students` 테이블에서 확인
2. 확인되면 `access_token` (랜덤 12자리) 발급 → URL에 포함
3. 모든 API 요청에 `x-access-token` 헤더로 전달
4. 링크 분실 시 연락처 재입력으로 동일 토큰 복구

#### 관리자 인증
- 환경변수 `ADMIN_KEY`에 비밀키 저장
- URL 파라미터 `key=`로 전달, 모든 admin API에서 검증

---

## 3. 데이터베이스 스키마 (Supabase PostgreSQL)

```sql
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE track_type AS ENUM ('police', 'fire');
CREATE TYPE room_status AS ENUM ('recruiting', 'formed', 'closed');
CREATE TYPE member_role AS ENUM ('creator', 'leader', 'member');
-- creator: 방 생성자 (관리 권한)
-- leader: 조장 (면접 시 조 대표 역할)
-- member: 일반 멤버
CREATE TYPE member_status AS ENUM ('joined', 'left');

-- =============================================
-- 1. academy_settings - 학원 설정 (1행만 존재)
-- =============================================
CREATE TABLE academy_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_name TEXT NOT NULL DEFAULT '한국경찰학원',  -- 학원 이름 (관리자 설정)
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. sessions - 면접 회차 (연 2회)
-- =============================================
-- 세션 상태: active(현재 운영중) / archived(종료/비활성화)
-- 한 track당 active 세션은 최대 1개만 허용

CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                        -- '2026년 상반기 경찰 면접반' (관리자가 직접 설정)
  track track_type NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  reservation_open_at TIMESTAMPTZ,           -- 예약 오픈 시각
  reservation_close_at TIMESTAMPTZ,          -- 예약 마감 시각
  apply_open_at TIMESTAMPTZ,                 -- 조 편성 지원 오픈
  apply_close_at TIMESTAMPTZ,               -- 조 편성 지원 마감
  interview_date DATE,                       -- 면접일
  max_group_size INT DEFAULT 10,
  min_group_size INT DEFAULT 6,
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ                    -- 비활성화 시각
);

-- =============================================
-- 2. reservation_slots - 예약 슬롯
-- =============================================
CREATE TABLE reservation_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT NOT NULL,
  reserved_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slots_session_date ON reservation_slots(session_id, date);

-- =============================================
-- 3. reservations - 예약 내역
-- =============================================
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id UUID REFERENCES reservation_slots(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT '확정' CHECK (status IN ('확정', '취소')),
  cancel_reason TEXT,
  booked_by TEXT DEFAULT '학생' CHECK (booked_by IN ('학생', '관리자')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 동일 session에서 동일 연락처 중복 예약 방지
CREATE UNIQUE INDEX idx_reservations_unique
  ON reservations(session_id, phone) WHERE status = '확정';

-- =============================================
-- 4. registered_students - 등록 명단
-- =============================================
CREATE TABLE registered_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('남', '여')),
  series TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, phone)
);

-- =============================================
-- 5. students - 지원 완료 학생
-- =============================================
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('남', '여')),
  series TEXT NOT NULL,
  region TEXT NOT NULL,
  age INT CHECK (age BETWEEN 18 AND 60),
  score NUMERIC,                             -- 필기성적
  access_token TEXT NOT NULL UNIQUE,          -- URL 인증용
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, phone)
);

CREATE INDEX idx_students_token ON students(access_token);

-- =============================================
-- 6. group_rooms - 조 방
-- =============================================
CREATE TABLE group_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  room_name TEXT,                             -- '1조', '홍길동의 조'
  invite_code TEXT NOT NULL UNIQUE,           -- 6자리 초대 코드
  password TEXT NOT NULL,                     -- 방 비밀번호 (관리자 또는 생성자 설정)
  status room_status DEFAULT 'recruiting',
  creator_student_id UUID REFERENCES students(id),
  created_by_admin BOOLEAN DEFAULT false,
  max_members INT DEFAULT 10,
  request_extra_members INT DEFAULT 0,       -- 추가 인원 요청 수 (0이면 요청 없음)
  request_extra_reason TEXT,                  -- 추가 인원 요청 사유
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rooms_invite ON group_rooms(invite_code);

-- =============================================
-- 7. room_members - 방 멤버
-- =============================================
CREATE TABLE room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role member_role DEFAULT 'member',
  status member_status DEFAULT 'joined',
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(room_id, student_id)
);

-- =============================================
-- 8. chat_messages - 채팅 메시지
-- =============================================
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),   -- NULL이면 시스템 메시지
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_room ON chat_messages(room_id, created_at DESC);

-- =============================================
-- 9. student_profiles - 자기소개 카드
-- =============================================
CREATE TABLE student_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  intro TEXT CHECK (char_length(intro) <= 100),        -- 한 줄 소개
  show_phone BOOLEAN DEFAULT false,                     -- 연락처 공개 동의
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 10. study_polls - 스터디 일정 투표
-- =============================================
CREATE TABLE study_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES group_rooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES students(id),
  title TEXT NOT NULL,                                  -- '첫 스터디 언제 할까요?'
  options JSONB NOT NULL,                               -- [{id, label, date, time}]
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 11. poll_votes - 투표 응답
-- =============================================
CREATE TABLE poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID REFERENCES study_polls(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  selected_options JSONB NOT NULL,                      -- [optionId, optionId, ...]
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, student_id)
);

-- =============================================
-- 12. waiting_pool - 개인지원 대기자
-- =============================================
CREATE TABLE waiting_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  assigned_room_id UUID REFERENCES group_rooms(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, student_id)
);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
-- 모든 테이블 RLS 활성화
-- 학생 인증은 phone-based (Supabase Auth 미사용)
-- 모든 데이터 접근은 API Route에서 service_role로 처리
-- Realtime 구독용 anon SELECT 정책만 허용:

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_read" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "members_read" ON room_members FOR SELECT USING (true);
```

---

## 4. 기능 1: 모의면접 예약 시스템

### 4.1 관리자 기능

#### 슬롯 생성
- 입력: 날짜(범위), 요일 선택, 시작~종료시간, 간격(30분/1시간), 정원
- 예: 2026-04-01~05, 월~금, 09:00~17:00, 1시간, 정원 20명 → 40개 슬롯 일괄 생성

#### 슬롯 관리
- 날짜별 그룹핑된 슬롯 목록, 활성/비활성 토글, 정원 수정, 삭제

#### 예약 오픈/마감 시간 설정
- sessions 테이블의 `reservation_open_at`, `reservation_close_at` 수정

#### 예약 현황
- 전체 예약 목록 (이름, 연락처, 슬롯, 상태), 검색/필터

#### 대리 예약
- 관리자가 학생 이름/연락처 + 슬롯 선택하여 등록 (`booked_by='관리자'`)

#### 예약 취소
- 사유 입력 후 취소, `reserved_count` 자동 감소

### 4.2 학생 기능

#### 예약 화면 (네이버 예약 스타일)
```
┌──────────────────────────────────┐
│  3.30(월) · 회차를 선택해 주세요    │
│                                    │
│     <  2026.03  >                  │
│  일  월  화  수  목  금  토          │
│  ...  캘린더 그리드  ...            │
│                                    │
│  회차를 선택하세요.                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ │
│  │오전10:00│ │오전11:00│ │오후12:00│ │
│  │  2매   │ │  3매   │ │  7매   │ │
│  └────────┘ └────────┘ └────────┘ │
│                                    │
│  이름: [          ]                │
│  연락처: [          ]              │
│  [예약하기]                        │
└──────────────────────────────────┘
```
- 잔여 인원 "N매" 표시, 마감 슬롯 회색 "마감"
- 동일 연락처 중복 예약 방지 (DB 유니크 인덱스)

#### 내 예약 조회/수정/취소
- 연락처 입력 → 예약 조회
- 시간 변경: 트랜잭션으로 기존 취소 + 새 예약 원자적 처리
- 취소: 확인 후 처리, 이력 유지

#### 기간 외 화면
- 오픈 전: "예약 오픈 일시: YYYY-MM-DD HH:mm" 표시
- 마감 후: "예약이 마감되었습니다" 표시

### 4.3 동시성 처리
PostgreSQL 트랜잭션 + `FOR UPDATE` 잠금:
```sql
BEGIN;
SELECT reserved_count, capacity FROM reservation_slots
  WHERE id = $1 FOR UPDATE;
-- reserved_count < capacity 확인
INSERT INTO reservations (...);
UPDATE reservation_slots SET reserved_count = reserved_count + 1 WHERE id = $1;
COMMIT;
```

---

## 5. 기능 2: 조 편성 & 조 방 시스템

### 5.1 전체 흐름 개요

```
[학생] ──┬── 이미 함께할 조원이 있음 ──→ 조 방 생성 + 비밀번호 설정
         │                              ↓
         │                         초대링크+비밀번호 공유 (카톡 등)
         │                              ↓
         │                         조원들이 링크+비밀번호로 입장
         │                              ↓
         │                         조 방에서 채팅으로 소통
         │
         └── 조원이 없음 (개인지원) ──→ 대기자 명단 등록
                                        ↓
                                   [관리자] 대기자 CSV 내보내기
                                        ↓
                                   기존 조 편성 프로그램으로 조 편성
                                        ↓
                                   결과 CSV 가져오기 → 조 방 자동 생성
                                        ↓
                                   관리자가 비밀번호 설정 후
                                   학생에게 SMS로 링크+비밀번호 전달
                                        ↓
                                   학생이 조 방 입장 → 채팅 소통
```

### 5.2 관리자 기능

#### 5.2.1 등록 명단 관리
- **엑셀/CSV 업로드**: 면접반 등록 학생 명단
  - 필수: 이름, 연락처 / 선택: 성별, 직렬
  - ExcelJS로 xlsx/csv 파싱
- **수동 추가**: 이름+연락처 직접 입력 (늦은 등록 학생)
- **명단 조회/삭제**: 테이블 표시

#### 5.2.2 지원 기간 설정
- `sessions.apply_open_at` / `apply_close_at` 수정
- 마감 후 학생 지원/수정 차단 (조 방 채팅은 유지)

#### 5.2.3 조 방 관리 & 모니터링
- **전체 조 방 대시보드**:
  - 모든 방 카드 형태 목록 (방 이름, 상태, 인원수/정원, 조장명, 비밀번호)
  - 방 클릭 → 상세 보기: 조원 전체 정보(이름, 연락처, 직렬, 지역, 나이, 성적, 역할)
  - **채팅 모니터링**: 관리자가 모든 방의 채팅 내역을 읽기 전용으로 열람 가능
  - 필터: 상태별(모집중/편성완료/마감), 인원 부족 방, 검색
- **방 상태 변경**: `recruiting` → `formed` → `closed`
- **비밀번호 설정/변경**: 관리자가 각 방의 비밀번호를 설정/변경
- **강제 멤버 추가/삭제**
- **조장 지정/변경**: 관리자가 특정 멤버를 조장으로 지정
- **관리자 공지**: 관리자가 특정 방 또는 전체 방에 시스템 메시지 전송 가능

#### 5.2.4 대기자 관리 & 조 편성
- **대기자 목록 조회**: 개인지원 학생 전체 목록
- **CSV 내보내기** (조 편성 프로그램 호환):
  - 헤더: `이름,연락처,성별,직렬,지역,나이,필기성적,조`
  - 이미 조 방에 있는 학생: 같은 조 번호
  - 대기자: 조 컬럼 빈값
  - UTF-8 BOM CSV
- **조 편성 결과 가져오기**:
  - 기존 프로그램 출력 CSV 업로드
  - 조 번호별 자동 조 방 생성
  - 관리자가 각 방 비밀번호 일괄 설정
  - 대기자 → 해당 조 방에 자동 배정

#### 5.2.5 통계 대시보드
관리자 메인 화면에 한눈에 현황 파악 가능:

| 지표 | 표시 형태 |
|------|----------|
| 등록 대비 지원율 | "45/60명 (75%)" 프로그레스 바 |
| 조 편성 완료율 | "6/8조 편성 완료" 프로그레스 바 |
| 대기자 수 | "15명 대기 중" 카운터 |
| 방별 인원 분포 | 가로 막대 차트 (방 이름 + 인원수/정원) |
| 예약 현황 요약 | 슬롯별 예약률 히트맵 |

- 경찰/소방 탭으로 전환
- 실시간 갱신 (페이지 로드 시)

#### 5.2.6 SMS 발송 준비
- 조 편성 완료 후 학생별 정보 CSV 생성:
  ```
  이름,연락처,조,초대링크,비밀번호
  홍길동,010-1234-5678,3조,https://domain.com/join/K3P9X2,abc123
  ```
- 이 CSV를 학원 SMS 발송 도구에 임포트하여 일괄 발송

### 5.3 학생 기능

#### 5.3.1 본인 확인 (등록 명단 검증)
- 연락처 입력 → `registered_students`에서 조회
- 등록됨: 이름 자동 표시 + 지원 폼
- 미등록: "등록된 학원생이 아닙니다" 에러
- 연락처 정규화: `010-XXXX-XXXX`

#### 5.3.2 지원 정보 입력

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| 이름 | text (자동) | O | 등록명단에서 자동, 수정 불가 |
| 연락처 | text (자동) | O | 본인확인 값, 수정 불가 |
| 성별 | select | O | 남/여 |
| 직렬 | select | O | 경찰: 일반,경채,101경비단,경행,법무회계,사이버,인사 / 소방: 공채,구급,구조,학과,화학,정보통신 |
| 지역 | select | O | 서울,대구,경북,부산,인천,경기,충남,충북,전남,전북,강원,제주,세종,울산,경남,기타 |
| 나이 | number | O | 만 나이 |
| 필기성적 | number | X | 소수점 허용 |

#### 5.3.3 조 방 선택

지원 정보 입력 후 두 가지 선택:

**A. "같이 할 조원이 있어요" → 조 방 생성**
1. 학생이 **방 이름** 입력 (예: "홍길동의 조")
2. 학생이 **비밀번호** 설정 (4~8자리)
3. 조 방 생성 → 초대 코드 발급 (6자리)
4. **초대 링크 + 비밀번호**를 카카오톡/SMS로 조원에게 공유
5. 학생이 생성자(creator)로 방에 자동 입장

**B. "개인 지원" (기본)**
1. 대기자 명단에 등록
2. "조 편성 후 문자로 안내드립니다" 메시지 표시
3. 나중에 관리자가 조 편성 → 조 방 생성 → SMS로 초대링크+비밀번호 전달

#### 5.3.4 조 방 입장 (초대 링크)

1. `/join/K3P9X2` 접속
2. 연락처 입력 → 등록 명단 검증
3. **비밀번호 입력** → 일치 확인
4. 이미 지원 정보가 있으면 바로 입장, 없으면 지원 정보 입력 후 입장
5. 입장 시 시스템 메시지: "홍길동님이 입장했습니다"

**비밀번호 검증 플로우:**
```
┌───────────────────────────────┐
│  조 방 입장                     │
│                                │
│  연락처: [010-    -    ]       │
│  비밀번호: [        ]          │
│                                │
│  [입장하기]                    │
│                                │
│  비밀번호를 모르시나요?           │
│  → 학원 또는 방 생성자에게       │
│    문의해주세요                  │
└───────────────────────────────┘
```

#### 5.3.5 조 방 화면

조 방의 핵심 목적: **조원 확인 → 간단 인사 → 카톡 단톡방으로 이동**

```
┌──────────────────────────────────┐
│ [<]  3조 · 경찰 모의면접    4/10명 │  ← 브랜드 컬러 헤더
├──────────────────────────────────┤
│                                   │
│  ┌─ 카카오톡으로 이동하세요! ───┐  │  ← 상단 고정 안내 배너
│  │ 조원 확인 후 카톡 단톡방을     │  │
│  │ 개설하여 본격적으로 소통하세요  │  │
│  │                              │  │
│  │ [카카오톡 오픈채팅 만들기]     │  │  ← 카톡 오픈채팅 링크
│  └────────────────────────────┘  │
│                                   │
│  ┌─ 조원 목록 ────────────────┐  │
│  │ 홍길동 (나) · 일반 · 대구 조장│  │
│  │  "열심히 하겠습니다!"         │  │  ← 한 줄 소개
│  │  010-1234-5678  [전화]       │  │  ← 공개 동의 시
│  │ ─────────────────────────── │  │
│  │ 김철수 · 경채 · 서울          │  │
│  │  "같이 열심히 해요"           │  │
│  │  연락처 비공개                │  │
│  │ ─────────────────────────── │  │
│  │ 이영희 · 일반 · 부산          │  │
│  │  010-3456-7890  [전화]       │  │
│  └────────────────────────────┘  │
│                                   │
│  ┌─ 초대 (모집중일 때만) ──────┐  │
│  │ 초대 코드: K3P9X2  [복사]    │  │
│  │ [초대 링크 공유하기]          │  │
│  │ 비밀번호: abc123  [복사]     │  │  ← 생성자/조장만
│  └────────────────────────────┘  │
│                                   │
│  ┌─ 게시판 ───────────────────┐  │
│  │ · 박민수님이 입장했습니다      │  │  ← 시스템 알림
│  │                              │  │
│  │ 홍길동 (조장) 10:30           │  │
│  │ 카톡 오픈채팅방 만들었습니다!   │  │
│  │ https://open.kakao.com/...   │  │  ← 링크 자동 감지
│  │                              │  │
│  │ 김철수 10:35                  │  │
│  │ 네 들어갔습니다!              │  │
│  └────────────────────────────┘  │
│                                   │
│  ┌─────────────────────┐ [전송]  │  ← 하단 고정
│  │ 메시지를 입력하세요...  │        │
│  └─────────────────────┘         │
│                                   │
│  [내 프로필 수정]  [조 탈퇴]       │
└──────────────────────────────────┘
```

**카톡 이동 안내:**
- 방 상단에 고정 배너로 "카카오톡으로 이동하세요!" 안내
- [카카오톡 오픈채팅 만들기] 버튼: `https://open.kakao.com/o/` 으로 이동 (카톡 앱 열림)
- 조장이 오픈채팅방 링크를 게시판에 올리면 → 다른 조원이 링크 터치하여 바로 입장
- 게시판에서 URL 자동 감지 → 클릭 가능한 링크로 렌더링

**조원 프로필 (목록에 인라인 표시):**
- 이름, 직렬, 지역, 역할(조장) 뱃지
- 한 줄 소개 (설정한 경우)
- **연락처 공개 동의**: 본인이 토글 ON → 연락처 + [전화] 버튼 표시
  - OFF: "연락처 비공개" 표시
  - ON: 연락처 + `tel:` 링크 (터치 시 바로 전화)
- 별도 프로필 카드 팝업 불필요 (목록에 바로 표시)

**비밀번호 표시 규칙:**
- 방 생성자/조장: 비밀번호 항상 표시 (복사 가능)
- 일반 멤버: 비밀번호 표시 안됨
- 관리자: 대시보드에서 모든 방 비밀번호 확인 가능

#### 5.3.6 게시판 (간소화된 채팅)

채팅이 아닌 **게시판/댓글 형태**의 간단한 소통 공간.
카톡 단톡방 개설 전까지의 임시 소통 목적.

- **Supabase Realtime** 사용 (새 글 실시간 반영)
- 메시지 최대 500자
- 텍스트만 (파일 업로드 없음)
- URL 자동 감지 → 클릭 가능 링크 변환 (카톡 오픈채팅 링크 공유용)
- 시스템 메시지: 입장/퇴장 알림
- 시간순 정렬, 최근 30건 표시

**Realtime 구독:**
```typescript
const channel = supabase
  .channel(`room:${roomId}`)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public',
    table: 'chat_messages', filter: `room_id=eq.${roomId}`
  }, (payload) => {
    setMessages(prev => [...prev, payload.new]);
  })
  .on('postgres_changes', {
    event: '*', schema: 'public',
    table: 'room_members', filter: `room_id=eq.${roomId}`
  }, () => {
    refetchMembers();
  })
  .subscribe();
```

#### 5.3.7 PWA 웹 푸시 알림

조 방에 새 멤버 입장, 새 게시글 등록 시 알림을 발송한다.

**구현 방식:**
- Next.js PWA (`next-pwa` 패키지)
- Service Worker + Web Push API
- Supabase Edge Function에서 푸시 발송

**알림 발송 조건:**
| 이벤트 | 알림 내용 |
|--------|----------|
| 새 멤버 입장 | "3조에 김철수님이 입장했습니다" |
| 새 게시글 | "3조 홍길동: 카톡 오픈채팅방 만들었습니다!" |
| 관리자 공지 | "[관리자] 면접 일정이 공지되었습니다" |
| 추가 인원 배정 | "3조에 새 조원이 배정되었습니다" |
| 투표 생성 | "3조에 새 투표가 생성되었습니다" |

**PWA 설정:**
```json
// manifest.json
{
  "name": "한국경찰학원 모의면접",
  "short_name": "모의면접",
  "display": "standalone",
  "start_url": "/",
  "theme_color": "#1A6DD4",
  "icons": [...]
}
```

**학생 알림 허용 플로우:**
1. 조 방 최초 입장 시 알림 허용 요청 배너 표시
2. "알림 받기" 클릭 → 브라우저 알림 권한 요청
3. 허용 시 push subscription → DB 저장
4. 아이폰: "홈 화면에 추가" 가이드 표시 (iOS 16.4+에서만 알림 지원)

**DB 테이블 추가:**
```sql
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,    -- { endpoint, keys: { p256dh, auth } }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id)
);
```

**플랫폼별 지원:**
| 플랫폼 | 알림 지원 | 조건 |
|--------|----------|------|
| Android Chrome | O | 알림 허용만 하면 됨 |
| iOS Safari 16.4+ | O | 홈 화면에 추가 필요 |
| iOS Safari 16.3 이하 | X | 게시판에서 직접 확인 |
| 데스크탑 Chrome/Edge | O | 알림 허용 |

#### 5.3.8 스터디 일정 투표

조장/생성자가 채팅 내에서 투표를 생성하여 스터디 일정을 조율한다.

**투표 생성:**
- 채팅 입력 옆 `+` 버튼 → "일정 투표 만들기"
- 제목 입력 (예: "첫 스터디 언제 할까요?")
- 날짜+시간 옵션 추가 (최소 2개, 최대 8개)
- 생성 → 채팅에 투표 카드 표시

**투표 참여:**
- 조원이 가능한 시간대 복수 선택 (체크박스)
- 실시간 결과 표시: 각 옵션별 참여자 수 + 이름
- 최다 겹침 시간 하이라이트

**투표 카드 UI (채팅 내 인라인):**
```
┌────────────────────────────┐
│  첫 스터디 언제 할까요?       │
│  by 홍길동 (조장)            │
│                            │
│  ☑ 4/1(화) 19:00    ████ 3명│  ← 최다 = 하이라이트
│    홍길동, 김철수, 이영희      │
│  ☐ 4/2(수) 19:00    ██  2명 │
│    홍길동, 박민수             │
│  ☐ 4/3(목) 14:00    █   1명 │
│    김철수                    │
│                            │
│  [투표하기 / 변경하기]        │
└────────────────────────────┘
```

- 마감 전 투표 변경 가능
- 조장/생성자가 투표 마감 가능

#### 5.3.8 조장 역할

각 조 방에는 반드시 **조장(leader)** 1명이 있어야 한다.

**조장 지정 방식:**
- **학생이 만든 방**: 생성자(creator)가 기본 조장. 생성자가 다른 멤버에게 조장 위임 가능.
- **관리자가 만든 방**: 관리자가 조장을 지정. 미지정 시 첫 번째 입장 멤버가 조장.
- 조장은 1명만 존재 (위임 시 기존 조장은 일반 멤버로 변경)

**조장 표시:**
- 조원 목록에서 이름 옆에 "조장" 뱃지 표시
- 채팅에서 조장 메시지에 "조장" 라벨 표시

**조장 권한 = 생성자 권한과 동일** (아래 권한표 참조)

#### 5.3.8 조 방 권한

| 행동 | 생성자 | 조장 | 일반 멤버 |
|------|--------|------|----------|
| 채팅 | O | O | O |
| 조원 목록 보기 | O | O | O (본인 조만) |
| 비밀번호 확인 | O | O | X |
| 초대 코드 복사 | O | O | O |
| 멤버 추가 (초대) | O | O | X |
| 멤버 강제 퇴장 | O | O | X |
| 조장 위임 | O | O | X |
| 본인 탈퇴 | O (역할 이전 후) | O (조장 위임 먼저) | O |
| 추가 인원 요청 | O | O | X |
| 방 해산 | X (관리자만) | X | X |

> 생성자와 조장은 동일인일 수도, 다른 사람일 수도 있음. 생성자는 방의 원래 만든 사람(관리 목적), 조장은 면접 시 조 대표 역할.

#### 5.3.10 조 탈퇴 → 대기자 전환

학생이 조가 맞지 않을 경우 자유롭게 탈퇴할 수 있다.

**탈퇴 플로우:**
1. 학생이 [조 탈퇴] 버튼 클릭
2. 확인 팝업: "탈퇴하면 대기자 명단으로 이동됩니다. 관리자가 다른 조에 편성해드립니다."
3. 확인 → `room_members.status = 'left'` + `waiting_pool`에 자동 등록
4. 시스템 메시지: "홍길동님이 퇴장했습니다"
5. 학생 화면: "대기자 명단에 등록되었습니다. 조 재편성 후 문자로 안내드립니다."

**관리자 처리:**
- 대기자 목록에서 "조 탈퇴 후 재배정 대기" 상태로 표시 (기존 대기자와 구분)
- 관리자가 다른 조 방에 수동 배정 또는 다음 조 편성 시 포함

#### 5.3.11 추가 인원 요청

조원이 부족하거나 추가 멤버가 필요할 때, 조장/생성자가 관리자에게 요청한다.

**요청 플로우:**
1. 조장/생성자가 방 설정에서 "추가 인원 요청" 클릭
2. 필요 인원수 입력 (예: 2명) + 사유 입력 (선택)
3. 요청 등록 → 방 상단에 배너 표시

**조 방 내 표시:**
```
┌──────────────────────────────────┐
│ ⚠ 추가 인원 2명 요청 중            │  ← 노란색 배너
│   관리자 확인 후 편성됩니다          │
└──────────────────────────────────┘
```

**관리자 확인:**
- 관리자 대시보드 "조 방 관리"에서 추가 인원 요청 방 목록 별도 필터
- 요청 방 카드에 "추가 인원 요청: 2명" 뱃지 표시
- 관리자가 대기자 중에서 해당 방에 멤버 추가 → 요청 자동 해소
- 또는 요청 거절/보류 가능

**요청 해소 조건:**
- 관리자가 해당 방에 멤버 추가 시 → 추가된 인원만큼 요청 수 감소
- 요청 인원 충족 시 → 배너 자동 제거
- 관리자가 수동으로 요청 닫기 가능

#### 5.3.12 지원 수정/삭제
- 마감 전: 모든 정보 수정 가능
- 마감 후: 수정 불가, 조 방 채팅만 가능 (읽기 전용이 아닌 채팅 유지)
- 삭제 시: 그룹 소속이면 자동 탈퇴 → 대기자 전환 후 삭제

### 5.4 기간 외 화면
- **시작 전**: "지원 시작: YYYY-MM-DD HH:mm" 안내
- **마감 후**: "지원 마감됨" + 조 방 접근은 가능 (채팅 소통 유지)

---

## 6. 메인 페이지

```
┌──────────────────────────────────┐
│     한국경찰학원 모의면접 시스템      │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │ 경찰 면접  │  │ 소방 면접  │     │  ← 파란색 / 빨간색 카드
│  │   예약    │  │   예약    │     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │ 경찰 조   │  │ 소방 조   │     │
│  │ 편성 지원  │  │ 편성 지원  │     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌──────────────────────────┐   │
│  │ 내 예약 조회               │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ 초대 코드로 조 방 입장      │   │  ← 코드 입력 필드 + 비밀번호
│  └──────────────────────────┘   │
└──────────────────────────────────┘
```

---

## 7. 프로젝트 구조

```
d:/앱 프로그램/면접/모의면접 예약/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  -- Pretendard 폰트, 전역 스타일
│   │   ├── page.tsx                    -- 메인 (직렬/기능 선택)
│   │   ├── reservation/
│   │   │   └── page.tsx                -- 예약 (캘린더 + 슬롯 + 폼)
│   │   ├── my-reservation/
│   │   │   └── page.tsx                -- 내 예약 조회/수정/취소
│   │   ├── apply/
│   │   │   └── page.tsx                -- 조 편성 지원 (본인확인 + 정보입력 + 조선택)
│   │   ├── join/
│   │   │   └── [code]/
│   │   │       └── page.tsx            -- 초대 링크 → 비밀번호 입력 → 입장
│   │   ├── room/
│   │   │   └── page.tsx                -- 조 방 (조원목록 + 초대 + 채팅)
│   │   ├── status/
│   │   │   └── page.tsx                -- 대기자 현황
│   │   ├── admin/
│   │   │   └── page.tsx                -- 관리자 대시보드 (탭 구성)
│   │   └── api/
│   │       ├── auth/
│   │       │   └── verify/route.ts     -- 연락처 검증 + 토큰 발급
│   │       ├── reservations/
│   │       │   ├── route.ts            -- 예약 CRUD
│   │       │   └── slots/route.ts      -- 슬롯 조회
│   │       ├── students/
│   │       │   └── route.ts            -- 지원 정보 CRUD
│   │       ├── rooms/
│   │       │   ├── route.ts            -- 방 생성
│   │       │   └── [roomId]/
│   │       │       ├── route.ts        -- 방 정보 조회
│   │       │       ├── join/route.ts   -- 입장 (비밀번호 검증)
│   │       │       ├── leave/route.ts  -- 탈퇴
│   │       │       └── messages/route.ts -- 메시지 전송
│   │       ├── waiting-pool/
│   │       │   └── route.ts
│   │       └── admin/
│   │           ├── sessions/route.ts
│   │           ├── roster/route.ts     -- 명단 업로드
│   │           ├── rooms/
│   │           │   ├── route.ts
│   │           │   └── bulk/route.ts   -- 일괄 방 생성
│   │           ├── export/route.ts     -- CSV 내보내기
│   │           ├── import/route.ts     -- 편성 결과 가져오기
│   │           └── sms/route.ts        -- SMS CSV 생성
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── browser.ts             -- 브라우저 클라이언트 (Realtime)
│   │   │   └── server.ts              -- 서버 클라이언트 (API Routes)
│   │   ├── auth.ts                    -- 토큰 검증 유틸
│   │   ├── invite.ts                  -- 초대 코드 생성 (nanoid)
│   │   ├── phone.ts                   -- 연락처 정규화
│   │   └── constants.ts               -- 직렬/지역 목록
│   └── components/
│       ├── Calendar.tsx                -- 네이버 스타일 캘린더
│       ├── TimeSlotGrid.tsx            -- 시간대 선택 그리드
│       ├── RoomBoard.tsx               -- 게시판 UI + Realtime
│       ├── KakaoGuide.tsx             -- 카톡 이동 안내 배너
│       ├── MemberList.tsx              -- 조원 목록 (인라인 프로필)
│       ├── ProfileEditForm.tsx         -- 프로필 편집 (소개, 연락처공개)
│       ├── StudyPoll.tsx               -- 스터디 일정 투표 카드
│       ├── StudyPollCreate.tsx         -- 투표 생성 폼
│       ├── InviteCard.tsx              -- 초대코드+비밀번호+공유
│       ├── ProfileForm.tsx             -- 지원 정보 입력 폼
│       ├── PhoneVerify.tsx             -- 연락처 확인 컴포넌트
│       ├── PasswordInput.tsx           -- 비밀번호 입력 (조 방 입장)
│       └── AdminDashboard/
│           ├── StatsOverview.tsx       -- 통계 대시보드 (지원율, 편성율, 차트)
│           ├── SessionManager.tsx
│           ├── RosterManager.tsx
│           ├── RoomManager.tsx         -- 방 목록 + 채팅 모니터링
│           ├── WaitingPoolManager.tsx
│           └── ReservationManager.tsx
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── package.json
├── next.config.mjs
├── tailwind.config.ts
└── .env.local                          -- SUPABASE_URL, SUPABASE_ANON_KEY,
                                        -- SUPABASE_SERVICE_ROLE_KEY, ADMIN_KEY
```

---

## 8. 엑셀 내보내기/가져오기 호환성

### 내보내기 (시스템 → 조 편성 프로그램)
기존 프로그램 파싱 로직(`면접 조 편성/src/lib/study-group/excel.ts`) 호환:
- **헤더**: `이름,연락처,성별,직렬,지역,나이,필기성적,조`
- **성별**: `남`/`여` (parseGender 호환)
- **조 컬럼**: 조 방 멤버 → 순차 번호(1,2,3...), 대기자 → 빈값
- **인코딩**: UTF-8 BOM (`\uFEFF`)

### 가져오기 (조 편성 프로그램 → 시스템)
- 프로그램 출력 CSV에서 `조` 컬럼으로 그룹 파싱
- 같은 조 번호 학생들 → 조 방 자동 생성
- 연락처로 학생 매칭 → `room_members` 생성
- 관리자가 비밀번호 일괄 설정 (랜덤 생성 또는 수동)

---

## 9. API 엔드포인트 요약

### 학생용 (access_token 인증)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/verify` | 연락처 검증 + 토큰 발급 |
| GET | `/api/reservations/slots?session_id=&date=` | 예약 가능 슬롯 조회 |
| POST | `/api/reservations` | 예약 생성 |
| GET | `/api/reservations?phone=` | 내 예약 조회 |
| PATCH | `/api/reservations` | 예약 변경 (슬롯 변경) |
| DELETE | `/api/reservations?id=` | 예약 취소 |
| POST | `/api/students` | 지원 정보 등록 |
| PATCH | `/api/students` | 지원 정보 수정 |
| POST | `/api/rooms` | 조 방 생성 (이름+비밀번호) |
| POST | `/api/rooms/[roomId]/join` | 방 입장 (비밀번호 필요) |
| POST | `/api/rooms/[roomId]/leave` | 방 퇴장 → 자동 대기자 등록 |
| POST | `/api/rooms/[roomId]/request-members` | 추가 인원 요청 (인원수+사유) |
| DELETE | `/api/rooms/[roomId]/request-members` | 추가 인원 요청 취소 |
| GET | `/api/rooms/[roomId]` | 방 정보+조원 목록 |
| POST | `/api/rooms/[roomId]/messages` | 채팅 전송 |
| GET | `/api/rooms/[roomId]/messages` | 채팅 이력 (페이지네이션) |
| PUT | `/api/students/profile` | 자기소개 카드 수정 (소개, 시간대, 장소, 연락처공개) |
| GET | `/api/students/profile?student_id=` | 프로필 카드 조회 |
| POST | `/api/rooms/[roomId]/polls` | 스터디 일정 투표 생성 |
| GET | `/api/rooms/[roomId]/polls` | 투표 목록 조회 |
| POST | `/api/rooms/[roomId]/polls/[pollId]/vote` | 투표 참여/변경 |
| PATCH | `/api/rooms/[roomId]/polls/[pollId]` | 투표 마감 |
| PATCH | `/api/rooms/[roomId]/leader` | 조장 위임 |

### 관리자용 (admin_key 인증)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/admin/academy` | 학원 설정 조회 |
| PATCH | `/api/admin/academy` | 학원 이름 변경 |
| POST | `/api/admin/sessions` | 새 면접반 생성 |
| PATCH | `/api/admin/sessions/[id]` | 면접반 수정 (이름, 기간 등) |
| POST | `/api/admin/sessions/[id]/archive` | 면접반 종료 (비활성화) |
| GET | `/api/admin/sessions` | 전체 면접반 목록 (active + archived) |
| POST | `/api/admin/roster` | 명단 CSV 업로드 |
| GET | `/api/admin/roster?session_id=` | 명단 조회 |
| POST | `/api/admin/reservations/slots` | 슬롯 일괄 생성 |
| GET | `/api/admin/reservations?session_id=` | 전체 예약 조회 |
| POST | `/api/admin/reservations/manual` | 대리 예약 |
| DELETE | `/api/admin/reservations/[id]` | 예약 취소 |
| GET | `/api/admin/rooms?session_id=` | 전체 방 목록 |
| PATCH | `/api/admin/rooms/[id]` | 방 상태/비밀번호 변경 |
| GET | `/api/admin/rooms/[id]/messages` | 방 채팅 내역 열람 (모니터링) |
| POST | `/api/admin/rooms/[id]/announce` | 특정 방에 관리자 공지 전송 |
| POST | `/api/admin/rooms/announce-all` | 전체 방에 관리자 공지 전송 |
| PATCH | `/api/admin/rooms/[id]/leader` | 조장 지정/변경 |
| POST | `/api/admin/rooms/bulk` | 편성 결과 → 방 일괄 생성 |
| GET | `/api/admin/stats?session_id=` | 통계 (지원율, 편성율, 대기자수, 방별 인원) |
| GET | `/api/admin/export?session_id=` | CSV 내보내기 |
| POST | `/api/admin/import` | CSV 가져오기 |
| GET | `/api/admin/sms?session_id=` | SMS 발송용 CSV 생성 |
| GET | `/api/admin/waiting-pool?session_id=` | 대기자 목록 |

---

## 10. 엣지 케이스 처리

| 상황 | 처리 |
|------|------|
| 학생이 2개 방에 동시 가입 시도 | DB 유니크 제약 + API에서 기존 멤버십 확인. "이미 [X조]에 소속되어 있습니다" |
| 방 정원 초과 | `member count >= max_members` 확인. "정원이 찼습니다 (10/10명)" |
| 마감 후 입장/수정 시도 | `apply_close_at` 확인. 입장/수정 차단, 채팅은 유지 |
| 비밀번호 오류 | 5회 연속 틀리면 5분 잠금 (rate limiting) |
| 생성자 퇴장 | 가장 먼저 입장한 멤버에게 생성자 역할 이전 |
| 대기자가 친구 방에 합류 | 대기자 명단에서 제거 → 방에 추가 |
| 방 멤버가 개인으로 전환 | 방 퇴장 → 대기자 명단 등록 ("조 탈퇴 후 재배정 대기" 상태 구분) |
| 추가 인원 요청 후 충족 | 관리자가 멤버 추가 시 요청 수 자동 감소, 0이면 배너 제거 |
| 조장이 탈퇴 | 조장 위임 먼저 → 위임 후 탈퇴 → 대기자 등록 |
| 초대코드 충돌 | UNIQUE 제약, 충돌 시 재생성 |
| SMS 링크 분실 | 연락처 재입력 → 동일 access_token 복구 |
| 동시 입장 초과 | PostgreSQL 트랜잭션 + FOR UPDATE |

---

## 11. 검증 방법

### 예약 시스템
1. 슬롯 일괄 생성 → 날짜별 목록 확인
2. 학생 예약 → 잔여 인원 감소 확인
3. 중복 예약 → 차단 확인
4. 정원 초과 → 차단 확인
5. 시간 변경 → 원자적 처리 확인
6. 대리 예약 → `booked_by='관리자'` 확인
7. 오픈 전/마감 후 → 안내 표시 확인

### 조 편성 & 조 방
1. 명단 업로드 → DB 저장 확인
2. 미등록 학생 지원 → 차단 확인
3. 조 방 생성 + 비밀번호 설정 → 입장 시 비밀번호 검증
4. 초대 링크 → 비밀번호 입력 → 입장 → 시스템 메시지 확인
5. 잘못된 비밀번호 → 입장 차단
6. 채팅 전송 → Realtime으로 즉시 수신 확인
7. 생성자 퇴장 → 역할 이전 확인
8. CSV 내보내기 → 기존 조 편성 프로그램에 업로드 → 정상 파싱 확인
9. 편성 결과 가져오기 → 방 자동 생성 + SMS CSV 확인
10. 마감 후 수정 차단 + 채팅 유지 확인
11. 조 탈퇴 → 대기자 명단 자동 등록 + "재배정 대기" 상태 확인
12. 추가 인원 요청 → 방 배너 표시 + 관리자 대시보드 필터 확인
13. 관리자 멤버 추가 → 요청 수 자동 감소 + 충족 시 배너 제거 확인
14. 스터디 일정 투표 → 생성/참여/결과 실시간 확인
15. 자기소개 카드 + 연락처 공개 토글 → 공개/비공개 전환 확인

---

## 12. 확인 모달 (Confirm Dialog)

사용자에게 되돌릴 수 없는 작업 전 반드시 확인 모달을 표시한다.

### 학생용

| 상황 | 모달 제목 | 모달 내용 | 버튼 |
|------|----------|----------|------|
| 예약 취소 | 예약을 취소하시겠습니까? | "{날짜} {시간} 예약이 취소됩니다." | [취소] / [예약 취소] (빨간) |
| 예약 시간 변경 | 예약을 변경하시겠습니까? | "기존 {시간} → 변경 {시간}" | [취소] / [변경 확인] |
| 조 방 탈퇴 | 조를 탈퇴하시겠습니까? | "탈퇴하면 대기자 명단으로 이동됩니다. 관리자가 다른 조에 편성해드립니다." | [취소] / [탈퇴] (빨간) |
| 지원 삭제 | 지원을 취소하시겠습니까? | "입력한 정보가 모두 삭제됩니다. 조에 소속된 경우 자동 탈퇴됩니다." | [취소] / [지원 취소] (빨간) |
| 조장 위임 | 조장을 위임하시겠습니까? | "{이름}님에게 조장을 위임합니다." | [취소] / [위임 확인] |
| 멤버 강제 퇴장 | 멤버를 퇴장시키겠습니까? | "{이름}님이 조에서 퇴장되며 대기자로 이동합니다." | [취소] / [퇴장] (빨간) |
| 투표 마감 | 투표를 마감하시겠습니까? | "마감 후 추가 투표가 불가합니다." | [취소] / [마감] |

### 관리자용

| 상황 | 모달 제목 | 모달 내용 | 버튼 |
|------|----------|----------|------|
| 슬롯 삭제 | 슬롯을 삭제하시겠습니까? | "예약 {N}건이 포함된 슬롯입니다." (예약 있을 때 경고) | [취소] / [삭제] (빨간) |
| 예약 취소 | 예약을 취소하시겠습니까? | "{이름}({연락처}) - {날짜} {시간}" + 취소 사유 입력 | [취소] / [예약 취소] (빨간) |
| 세션 종료 (비활성화) | 이 면접반을 종료하시겠습니까? | "'{면접반 이름}'의 모든 조 방이 비활성화되고 예약이 마감됩니다. 데이터는 보관됩니다." | [취소] / [면접반 종료] (빨간) |
| 멤버 강제 삭제 | 멤버를 삭제하시겠습니까? | "{이름}님이 {조이름}에서 제거됩니다." | [취소] / [삭제] (빨간) |
| 명단 전체 삭제 | 등록 명단을 초기화하시겠습니까? | "등록된 학생 {N}명이 전체 삭제됩니다." | [취소] / [전체 삭제] (빨간) |
| 방 해산 | 조 방을 해산하시겠습니까? | "'{조이름}'의 모든 멤버가 대기자로 이동됩니다." | [취소] / [해산] (빨간) |
| 전체 공지 전송 | 전체 방에 공지를 보내시겠습니까? | "총 {N}개 방에 공지가 전송됩니다." | [취소] / [전송] |

### 모달 디자인 규칙
- 배경 딤 처리 (`rgba(0,0,0,0.5)`)
- 카드형 모달 (`border-radius: 10px`, 최대 너비 `360px`, 중앙 정렬)
- 위험한 작업의 확인 버튼: 빨간색 (`#D93025`)
- 일반 확인 버튼: 브랜드 컬러
- 취소 버튼: 회색 아웃라인
- 모달 외부 터치 또는 [X] 버튼으로 닫기

---

## 13. 세션 라이프사이클 (면접반 운영 주기)

### 13.1 학원 설정
관리자가 최초 1회 설정, 이후 언제든 변경 가능:
- **학원 이름**: 헤더, 메인 페이지에 표시 (예: "한국경찰학원")
- `academy_settings` 테이블에 저장

### 13.2 세션(면접반) 생명주기

```
[생성] → [active: 운영 중] → [archived: 종료/비활성화]
```

**생성:**
- 관리자가 새 면접반 생성: 면접반 이름, 직렬(경찰/소방), 각종 기간 설정
- 예: "2026년 상반기 경찰 면접반", "2026년 하반기 소방 면접반"
- 한 track(경찰/소방)당 active 세션은 최대 1개

**운영 중 (active):**
- 학생 예약, 지원, 조 방 모두 활성
- 관리자 관리 기능 모두 사용 가능

**종료 (archived):**
- 관리자가 [면접반 종료] 클릭 → 확인 모달 → archived로 변경
- 모든 조 방 상태 → `closed`
- 예약 오픈/마감 → 강제 마감
- 학생이 접속 시: "이 면접반은 종료되었습니다" 안내
- **데이터 보관**: 삭제하지 않음 (관리자가 이전 데이터 열람 가능)
- 학생은 이전 조 방을 읽기 전용으로 확인 가능 (게시판 조회만, 글쓰기 불가)

### 13.3 새 시즌 시작 플로우
1. 관리자가 기존 세션 [면접반 종료] → archived
2. [새 면접반 만들기] → 이름·직렬·기간 설정
3. 새 등록 명단 업로드
4. 학생들에게 새 링크 안내
5. 기존 데이터는 관리자 대시보드 "이전 면접반" 탭에서 열람 가능

### 13.4 관리자 대시보드 세션 전환
```
┌──────────────────────────────────────┐
│  관리자 대시보드                        │
│                                       │
│  학원 설정: 한국경찰학원  [수정]         │
│                                       │
│  ┌─ 현재 운영 중인 면접반 ──────────┐  │
│  │ 2026 상반기 경찰 면접반  [관리]    │  │
│  │ 2026 상반기 소방 면접반  [관리]    │  │
│  └──────────────────────────────────┘  │
│                                       │
│  [+ 새 면접반 만들기]                   │
│                                       │
│  ┌─ 종료된 면접반 (이전 기록) ──────┐  │
│  │ 2025 하반기 경찰 면접반  [보기]    │  │  ← 읽기 전용
│  │ 2025 하반기 소방 면접반  [보기]    │  │
│  └──────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 13.5 학생 화면 세션 표시
- 메인 페이지 헤더: "{학원 이름} 모의면접 시스템"
- 각 페이지 헤더: "{면접반 이름}" 표시
- active 세션만 학생에게 표시
- archived 세션 접근 시: "이 면접반은 종료되었습니다"

---

## 14. 빈 상태 & 에러 화면

모든 화면에서 데이터가 없거나 에러인 경우 적절한 안내를 표시한다.

| 화면 | 빈 상태 메시지 |
|------|---------------|
| 예약 - 슬롯 없음 | "아직 등록된 면접 일정이 없습니다." |
| 예약 - 선택 날짜 슬롯 없음 | "이 날짜에는 예약 가능한 시간이 없습니다." |
| 내 예약 - 예약 없음 | "예약 내역이 없습니다." |
| 조 방 - 조원 0명 (본인만) | "아직 조원이 없습니다. 초대 링크를 공유해보세요!" |
| 게시판 - 글 없음 | "아직 게시글이 없습니다. 첫 인사를 남겨보세요!" |
| 대기자 현황 | "대기 중입니다. 조 편성 후 문자로 안내드립니다." |
| 관리자 - 명단 없음 | "등록된 학생이 없습니다. 명단을 업로드해주세요." |
| 관리자 - 방 없음 | "생성된 조 방이 없습니다." |
| 관리자 - 예약 없음 | "아직 예약이 없습니다." |

| 에러 상태 | 메시지 |
|-----------|--------|
| 네트워크 에러 | "네트워크 오류가 발생했습니다. 다시 시도해주세요." + [다시 시도] 버튼 |
| 세션 만료/없음 | "존재하지 않는 페이지입니다." |
| 권한 없음 (관리자) | "접근 권한이 없습니다." |
| 서버 에러 | "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |

---

## 15. 로딩 상태

| 상황 | 표시 방식 |
|------|----------|
| 페이지 최초 로드 | 화면 중앙 스피너 (브랜드 컬러) |
| 버튼 클릭 후 API 호출 | 버튼 내 스피너 + 버튼 비활성화 (중복 클릭 방지) |
| 목록 로드 | 스켈레톤 UI (카드 형태 회색 플레이스홀더) |
| 게시판 이전 글 로드 | 상단 작은 스피너 |
| 폼 제출 | 전체 폼 비활성화 + 제출 버튼 스피너 |

---

## 16. 참조 파일

| 파일 | 용도 |
|------|------|
| `./디자인_가이드.md` | **UI 구현의 최우선 기준** - 색상, 폰트, 컴포넌트, 레이아웃 |
| `./AGENTS.md` | Codex 개발 에이전트 지침서 - 개발 순서, 규칙, 환경 변수 |
| `../면접 조 편성/src/lib/study-group/types.ts` | Member 인터페이스, CSV 호환 |
| `../면접 조 편성/src/lib/study-group/excel.ts` | CSV 헤더/파싱 형식, 성별·나이·조 파싱 |
| `../면접 조 편성/src/lib/study-group/config.ts` | 경찰/소방 직렬 목록 |
