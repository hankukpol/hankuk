# AGENTS.md - Codex 개발 에이전트 지침서

> 이 프로젝트는 **한국경찰학원 모의면접 예약 & 조 편성 시스템**입니다.
> AI 코딩 에이전트(Codex)가 개발 시 반드시 따라야 할 규칙입니다.

---

## 1. 필수 참조 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| **PRD** | `./PRD.md` | 전체 기능 명세, DB 스키마, API, 유저 플로우 |
| **디자인 가이드** | `./디자인_가이드.md` | UI 컴포넌트, 색상, 타이포그래피, 레이아웃 규칙 |

**우선순위**: 디자인 충돌 시 `디자인_가이드.md` > `PRD.md`

---

## 2. 기술 스택

| 항목 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 14.x |
| 언어 | TypeScript | 5.x |
| 스타일링 | Tailwind CSS | 3.4+ |
| 아이콘 | Lucide React | - |
| 토스트 | Sonner | - |
| 애니메이션 | Framer Motion | - |
| 차트 | Recharts | - (관리자 통계용) |
| DB/Auth | Supabase | - |
| 실시간 | Supabase Realtime | - |
| 엑셀 파싱 | ExcelJS | - |
| 배포 | Vercel | - |

---

## 3. 디자인 규칙 (요약)

### 반드시 지켜야 할 것
- **`디자인_가이드.md` 기준으로 구현** (색상, 폰트, 간격, 그림자, 컴포넌트 패턴)
- 폰트: Pretendard Variable (로컬 woff2)
- 카드/인풋/뱃지: `rounded-[10px]`
- 버튼: `rounded-full` (pill형)
- 직렬 브랜드 색상: CSS 변수 `--division-color` 시스템 사용 (경찰=`#1B4FBB`, 소방=`#C55A11`)
- 그림자: `shadow-card` (커스텀 Tailwind)
- 모바일 퍼스트 (`min-width` 기반)

### 절대 금지
- 황금색, 연한 노란색 사용
- 그라데이션 배경
- AI 스타일 디자인 (과도한 장식, 글로우 효과 등)
- CDN 폰트 사용 (반드시 로컬 폰트)
- `border-radius` 값을 `10px` 외로 사용 (버튼 pill 제외)

---

## 4. 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx                  -- Pretendard 폰트, 전역 CSS 변수
│   ├── page.tsx                    -- 메인 (직렬/기능 선택)
│   ├── reservation/page.tsx        -- 예약 (캘린더 + 슬롯)
│   ├── my-reservation/page.tsx     -- 내 예약 조회
│   ├── apply/page.tsx              -- 조 편성 지원
│   ├── join/[code]/page.tsx        -- 초대 링크 입장
│   ├── room/page.tsx               -- 조 방
│   ├── status/page.tsx             -- 대기자 현황
│   ├── admin/page.tsx              -- 관리자 대시보드
│   └── api/                        -- API Routes (PRD 9장 참조)
├── lib/
│   ├── supabase/browser.ts         -- Supabase 브라우저 클라이언트
│   ├── supabase/server.ts          -- Supabase 서버 클라이언트 (service_role)
│   ├── auth.ts                     -- access_token 검증
│   ├── invite.ts                   -- 초대 코드 생성 (nanoid)
│   ├── phone.ts                    -- 연락처 정규화 (010-XXXX-XXXX)
│   └── constants.ts                -- 직렬/지역 목록
└── components/                     -- PRD 7장 참조
```

---

## 5. DB 접근 규칙

- **클라이언트(브라우저)**: `anon` key → Realtime 구독 전용 (SELECT만)
- **서버(API Routes)**: `service_role` key → 모든 CRUD
- 학생 인증: `x-access-token` 헤더로 `students.access_token` 검증
- 관리자 인증: `x-admin-key` 헤더로 환경변수 `ADMIN_KEY` 검증
- 동시성 제어: 예약/입장 시 `FOR UPDATE` + 트랜잭션

---

## 6. 연락처 정규화

모든 연락처 저장/조회 시 반드시 정규화:

```typescript
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('010')) {
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }
  return phone;
}
```

---

## 7. CSV 호환성

기존 조 편성 프로그램(`../면접 조 편성/`)과 호환되는 CSV 형식:

```
이름,연락처,성별,직렬,지역,나이,필기성적,조
홍길동,010-1234-5678,남,일반,서울,28,85.5,
```

- 성별: `남`/`여`
- 조: 숫자(사전편성) 또는 빈값(개인지원)
- 인코딩: UTF-8 BOM (`\uFEFF`)
- 파싱 로직 참조: `../면접 조 편성/src/lib/study-group/excel.ts`

---

## 8. 확인 모달 규칙

PRD 12장에 정의된 모든 위험 작업에 확인 모달 필수 배치.
- Framer Motion 애니메이션 (`디자인_가이드.md` 9장)
- 위험 버튼: `bg-rose-600` / 일반 확인: `bg-[var(--division-color)]`
- z-index: `90` (`디자인_가이드.md` 8장)

---

## 9. 개발 순서 (권장)

1. **프로젝트 초기화**: Next.js + Tailwind + Supabase 설정
2. **DB 마이그레이션**: PRD 3장 스키마 전체 적용
3. **공통**: layout.tsx (폰트, CSS 변수), 공통 컴포넌트 (PhoneVerify, 확인 모달)
4. **관리자 - 세션/학원 설정**: academy_settings, sessions CRUD
5. **관리자 - 등록 명단**: CSV 업로드, 명단 관리
6. **예약 시스템**: 슬롯 생성 → 캘린더+슬롯 UI → 예약 CRUD
7. **조 편성 지원**: 본인확인 → 지원폼 → 방 생성/입장
8. **조 방**: 조원 목록, 게시판, 카톡 이동 안내, 투표
9. **관리자 - 조 방 관리**: 모니터링, 조장 지정, 공지, 통계
10. **CSV 내보내기/가져오기**: 조 편성 프로그램 호환
11. **PWA 웹 푸시**: Service Worker, push subscription
12. **테스트 & 배포**: Vercel 배포, 엣지 케이스 검증

---

## 10. 성능 최적화 (필수)

> **병목 현상, 사이트 느려짐, 로딩 지연, 저장 속도 저하는 절대 허용하지 않는다.**

### 10.1 프론트엔드

| 항목 | 규칙 |
|------|------|
| 컴포넌트 분할 | 페이지 단위 `dynamic import` + `React.lazy` 적용 — 초기 번들 크기 최소화 |
| 이미지/폰트 | Next.js `next/font` 로컬 폰트 사용, 폰트 `display: swap` |
| 리렌더링 방지 | `React.memo`, `useMemo`, `useCallback` 적절히 사용. 불필요한 상태 리프팅 금지 |
| 목록 렌더링 | 조원 목록, 게시판, 예약 목록 등 `key` prop 올바르게 설정. 대량 목록 시 가상 스크롤 고려 |
| API 호출 | 중복 호출 방지 (`useEffect` 의존성 배열 정확히), 로딩 중 버튼 비활성화로 중복 요청 차단 |
| 캘린더 | 슬롯 데이터는 월 단위로 한 번만 fetch, 클라이언트에서 날짜별 필터링 |
| Realtime | 조 방 페이지에서만 구독, 페이지 이탈 시 반드시 `removeChannel()` |

### 10.2 백엔드 (API Routes + Supabase)

| 항목 | 규칙 |
|------|------|
| 쿼리 최적화 | `SELECT *` 금지 — 필요한 컬럼만 조회. 조인은 Supabase `.select('*, room_members(*)')` 패턴 사용 |
| 인덱스 활용 | PRD에 정의된 인덱스 반드시 적용 (`idx_slots_session_date`, `idx_chat_room`, `idx_rooms_invite`, `idx_students_token`) |
| 트랜잭션 | 예약 생성, 방 입장 등 동시성 이슈 있는 작업은 반드시 `FOR UPDATE` + 트랜잭션 |
| N+1 방지 | 목록 조회 시 관계 데이터를 한 번에 조인. 루프 안에서 개별 쿼리 금지 |
| 페이지네이션 | 게시판, 예약 목록, 관리자 테이블 등 모든 목록형 데이터에 페이지네이션 적용 (limit/offset) |
| 응답 크기 | 불필요한 데이터 전송 금지. 학생용 API에서 다른 학생의 연락처/개인정보 노출 금지 |

### 10.3 Vercel 배포 최적화

- API Route cold start 최소화: 가벼운 함수 유지, 불필요한 import 제거
- Edge Runtime 사용 가능한 단순 API는 `export const runtime = 'edge'` 적용 고려
- `next.config.mjs`에서 불필요한 리다이렉트/리라이트 최소화

---

## 11. 한글 깨짐 방지 (필수)

> **코드 작성, 수정 시 한글이 깨지면 반드시 즉시 복원한다.**

| 항목 | 규칙 |
|------|------|
| 파일 인코딩 | 모든 소스 파일 UTF-8 (BOM 없음) |
| CSV 내보내기 | UTF-8 BOM (`\uFEFF`) 포함 — 엑셀에서 한글 깨짐 방지 |
| API 응답 | `Content-Type: application/json; charset=utf-8` |
| HTML meta | `<meta charset="utf-8" />` |
| DB 저장 | Supabase PostgreSQL은 기본 UTF-8, 별도 설정 불필요 |
| 코드 수정 후 | 한글 문자열(에러 메시지, UI 텍스트, 상수)이 깨지지 않았는지 반드시 확인 |
| 문자열 상수 | 한글 문자열은 `constants.ts` 등에 한 곳에서 관리, 하드코딩 최소화 |

**깨진 한글 발견 시**: 즉시 원래 한글로 복원. 깨진 상태로 커밋하지 않는다.

---

## 12. 자체 테스트 & 품질 보증 (필수)

> **모든 기능을 직접 테스트하고, 오류가 있으면 수정→재테스트를 반복하여 완벽한 상태에서 보고한다.**

### 12.1 개발 루프

```
개발 → 빌드 → 테스트 → 오류 발견 → 수정 → 빌드 → 재테스트 → ... → 오류 없음 → 보고
```

- 한 기능 개발 완료 시 반드시 자체 테스트 후 다음 기능으로 진행
- 빌드 에러(`npm run build`)가 있으면 절대 다음 단계로 넘어가지 않는다
- 타입 에러(`tsc --noEmit`)도 0개여야 한다

### 12.2 테스트 체크리스트

각 단계에서 아래 항목을 반드시 확인:

**빌드 & 타입**
- [ ] `npm run build` 에러 없음
- [ ] TypeScript 타입 에러 없음
- [ ] 콘솔 경고/에러 없음

**기능 테스트 (PRD 11장 검증 방법 전체)**
- [ ] 예약: 생성, 조회, 변경, 취소, 중복 방지, 정원 초과 방지
- [ ] 조 편성: 명단 검증, 지원, 방 생성, 입장, 비밀번호, 탈퇴
- [ ] 게시판: 글 작성, Realtime 수신, URL 링크 변환
- [ ] 관리자: 세션 관리, 명단, 슬롯, 방 관리, 통계, CSV
- [ ] 확인 모달: 모든 위험 작업에 모달 표시

**성능 테스트**
- [ ] 페이지 초기 로드: 3초 이내
- [ ] API 응답: 1초 이내
- [ ] 캘린더/슬롯 전환: 즉시 반응 (지연 없음)
- [ ] 게시판 Realtime: 전송 후 1초 이내 표시
- [ ] 관리자 목록 로드: 스켈레톤 UI 표시 후 데이터 로드

**한글 테스트**
- [ ] 모든 UI 텍스트 한글 정상 표시
- [ ] CSV 내보내기 → 엑셀에서 한글 정상
- [ ] 에러 메시지 한글 정상

**모바일 테스트**
- [ ] 모든 페이지 모바일 뷰포트(375px, 390px) 정상 표시
- [ ] 터치 타겟 44px 이상
- [ ] 입력 필드 포커스 시 키보드에 가려지지 않음
- [ ] 하단 고정 입력바 정상 동작

### 12.3 보고 기준

- **모든 체크리스트 통과** 후에만 완료 보고
- 오류가 남아있으면 보고하지 말고 계속 수정
- "일부 기능이 안 됩니다" 상태로 보고 금지

---

## 13. 환경 변수

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_KEY=your-secret-admin-key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...      # PWA 웹 푸시용
VAPID_PRIVATE_KEY=...                  # PWA 웹 푸시용
```
