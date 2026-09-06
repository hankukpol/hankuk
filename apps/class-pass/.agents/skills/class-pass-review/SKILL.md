---
name: class-pass-review
description: "Codex가 class-pass에 구현한 변경을 코드 품질·보안·테스트 관점에서 검토한다. 트리거: '검토해줘', '리뷰해줘', '구현 결과 확인', 'Codex가 짠 코드 점검', '배포 전 체크', 'PR 리뷰'. 후속: '검토 다시', '보안만 다시', '리뷰 결과 반영해서 또 봐줘'도 이 스킬로."
---

# Class-Pass Review 오케스트레이터

## 언제 사용하는가
**Codex가 class-pass 코드를 구현한 직후**, 머지/배포 전에 검토받고 싶을 때.

**트리거 예시**:
- "Codex가 결제 환불 구현했어, 검토해줘"
- "이번 출석 변경사항 리뷰 부탁"
- "배포 전 보안 체크"
- "현재 브랜치 PR 리뷰"
- "수강생 import 수정한 거 봐줘"

**사용 안 함**:
- 아직 코딩 안 함 → `class-pass-design` 먼저
- 한 줄 수정 → 그냥 Codex로 직행
- 모노레포 전체 리뷰 → 이 스킬은 class-pass 한정

## 3명 검토 팀 (병렬)

```
                  [구현된 git diff]
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
┌─────────────┐  ┌─────────────────┐  ┌─────────────┐
│code-reviewer│  │security-reviewer│  │ test-author │
└──────┬──────┘  └────────┬────────┘  └──────┬──────┘
       │ 04_review_code   │ 04_review_security│ 04_review_tests
       └──────────────────┼───────────────────┘
                          ▼
              [통합 결과 사용자에게]
```

**Fan-out/Fan-in 패턴**. 세 리뷰어는 서로 의존하지 않으므로 **병렬 실행**.

## 실행 단계

### Phase 1: 검토 범위 확인
1. `git status`, `git diff` 실행해 변경 사항 파악
2. 변경 파일이 0개이면 → 사용자에 "변경 사항 없음" 보고 후 중단
3. 변경 파일이 30개 초과이면 → 도메인별 분할 리뷰 제안
4. 새 마이그레이션 (`supabase/migrations/*.sql`) 포함 여부 확인 (security에 우선 신호)

### Phase 2: 설계 문서 존재 확인
- `_workspace/02_design.md`, `03_tasks.md` 존재 확인
- **없으면**: "설계 없이 진행된 변경입니까? (계속 / 중단)" 사용자에 확인
  - 계속 → "설계 일탈" 체크는 스킵, 코드 자체만 리뷰
  - 중단 → 사용자가 설계 먼저 만들도록 안내

### Phase 3: 3명 리뷰어 병렬 실행
- Agent 도구로 3명을 **동시 호출** (run_in_background 또는 단일 메시지 내 병렬)
- 각자 자기 영역만 보도록 명시:
  - code-reviewer: 품질·컨벤션·단순성
  - security-reviewer: RLS·인증·테넌트·결제·PII
  - test-author: 테스트 명세 (사용자가 "테스트 코드까지"라 했으면 실제 파일 생성)

### Phase 4: 결과 통합
- 세 파일 모두 작성 완료 대기
- 통합 보고서 작성: `_workspace/04_review_summary.md`
- 통합 보고서 구조:
  ```markdown
  # 검토 요약: {기능명}

  ## 🚫 Blocker (있으면 배포 금지)
  - {security_reviewer가 Blocker 분류한 항목}

  ## Critical (반드시 수정)
  - {code_reviewer Critical} + {security High}

  ## Should fix
  - ...

  ## 테스트 추가 필요
  - {test-author 필수 항목}

  ## Consider
  - ...

  ## 다음 단계
  - Critical/Blocker는 Codex로 수정: `codex` → "_workspace/04_review_summary.md의 Critical 항목을 수정해줘"
  - 수정 후 다시 이 스킬 실행 (`/class-pass-review`)
  ```

### Phase 5: 사용자에게 안내
- Blocker 있으면 강조 표시
- "수정 후 다시 실행" 명령어 제시
- 수정 항목이 적으면 Codex에서 직접 수정해도 됨 (사용자 선택)

## 후속 작업 처리

### "보안만 다시"
- `security-reviewer`만 재호출
- 다른 결과는 그대로 유지
- 통합 보고서만 다시 작성

### "검토 결과 반영해서 또 봐줘" (수정 후 재검토)
- 이전 `04_*` 파일들을 `_workspace/prev_review/`로 백업
- diff를 다시 보고 3명 재실행
- 이전 검토와 비교해 "해결됨" / "여전히 남음" 명시

### "특정 파일만 검토"
- 변경 사항 중 사용자가 지정한 파일만 대상으로
- 다른 파일은 무시

## 산출물 규약

```
apps/class-pass/_workspace/
├── 04_review_code.md       # code-reviewer
├── 04_review_security.md   # security-reviewer
├── 04_review_tests.md      # test-author
└── 04_review_summary.md    # 통합 보고서 (이 스킬이 직접 작성)
```

수정-재검토 사이클이 돌면:
```
_workspace/prev_review/{timestamp}/
├── 04_review_code.md
├── ...
```

## 작동 원칙 (Why)
- **3명 분리**: 한 리뷰어가 모든 관점 보면 깊이 ↓ + 누락 ↑. 각자 한 가지에 집중.
- **병렬 실행**: 서로 의존 없음. 순차 실행은 시간 낭비.
- **Blocker 분리**: 보안 Blocker는 코드 스타일 문제와 같은 우선순위가 아님. 명시적 격상.
- **칭찬 금지**: 리뷰어가 "잘했다"를 보고하면 노이즈. 문제만 보고하도록 에이전트 정의에 명시함.

## 에러 처리
- 한 리뷰어 실패 → 다른 둘 결과로 진행, 통합 보고서에 "X 리뷰 실패" 명시
- 세 명 모두 "지적 사항 없음" → 보고서 한 줄로: "검토 통과"
- diff가 너무 커서 한 리뷰어가 컨텍스트 초과 → 도메인별 분할 후 재시도

## 모델 설정
모든 에이전트는 `model: "opus"`.
