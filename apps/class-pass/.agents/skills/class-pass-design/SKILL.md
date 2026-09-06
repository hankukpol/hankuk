---
name: class-pass-design
description: "class-pass 앱에서 새 기능·리팩토링·수정에 대한 설계서를 Codex CLI에 넘기기 위해 작성한다. 트리거: '설계해줘', '설계서 만들어', '기능 설계', 'Codex에게 넘길 명세', '수강생 import / 결제 / 출석 / 좌석' 도메인에서 새 기능 요청. 후속: '설계 다시 해줘', '명세 업데이트', '이 부분만 다시 풀어줘'도 이 스킬로."
---

# Class-Pass Design 오케스트레이터

## 언제 사용하는가
사용자가 class-pass에서 **코드를 새로 짜거나 크게 고치기 전에 설계를 받고 싶을 때**.
실제 코딩은 Codex CLI가 한다는 전제. 이 스킬의 산출물은 **Codex의 입력**이다.

**트리거 예시**:
- "수강생 일괄 import에 성별 자동 채움 기능 설계해줘"
- "결제 환불 흐름 다시 설계"
- "출석 기록 audit 로그 추가하는 명세 만들어줘"
- "디스플레이 세션 원자성 보장 리팩토링 설계"
- "{도메인} {변경} 설계서"

**사용 안 함**:
- 한두 줄 수정 (그냥 Codex로 직행)
- 단순 버그 수정 (영향이 1파일 안에 닫혀 있으면 Codex 직접)
- 코드 리뷰/검토 → `class-pass-review` 스킬

## 6명 팀 중 3명만 사용 (설계 페이즈)

```
[사용자 요청]
      │
      ▼
┌─────────────────────┐
│  domain-analyst     │ → _workspace/01_analysis.md
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  architect          │ → _workspace/02_design.md
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  task-decomposer    │ → _workspace/03_tasks.md
└──────────┬──────────┘
           ▼
    [Codex CLI 입력으로 사용자가 가져감]
```

**Pipeline 패턴**. 순차 의존. 각자 이전 단계 산출물 파일을 입력으로 받음.

## 실행 단계

### Phase 1: 컨텍스트 확인 (필수)
1. `apps/class-pass/_workspace/` 존재 확인
2. **존재한다면**:
   - 이전 산출물 백업: `_workspace` → `_workspace_prev` (rename)
   - 또는 사용자가 "이 부분만 다시"라고 했으면 해당 단계 파일만 새로 쓰기
3. 사용자 요청에서 **도메인 힌트** 추출 (수강생 import / 결제 / 출석 / 좌석 / 기타)

### Phase 2: domain-analyst 실행
- Agent 도구로 `domain-analyst` 호출
- 입력: 요청 내용, 도메인 힌트, 제약사항
- 산출: `_workspace/01_analysis.md`
- 완료 후 파일 존재·필수 섹션(7개) 검증

### Phase 3: architect 실행
- `01_analysis.md`가 비어있거나 "확인 불가" 항목이 많으면 사용자에 보강 요청
- 그렇지 않으면 `architect` 호출
- 산출: `_workspace/02_design.md`
- "트레이드오프"와 "검증 포인트" 섹션이 비어있지 않은지 확인

### Phase 4: task-decomposer 실행
- `task-decomposer` 호출
- 산출: `_workspace/03_tasks.md`
- 각 Task에 "파일 경로 + 완료 기준 체크리스트"가 있는지 검증

### Phase 5: 사용자에게 산출물 안내
다음 메시지를 출력:
```
설계 완료. Codex CLI로 이 파일들을 전달하세요:

1차 입력: apps/class-pass/_workspace/03_tasks.md
   (참고: 02_design.md, 01_analysis.md)

Codex 사용 예시:
  cd apps/class-pass
  codex
  > apps/class-pass/_workspace/03_tasks.md 의 Task 1부터 순서대로 구현해줘.
  > 설계 배경은 02_design.md, 영향도는 01_analysis.md에 있어.

구현 완료 후 검토는 Codex에서:
  > /class-pass-review (또는) "구현 결과 검토해줘"
```

## 후속 작업 처리

### "설계 다시 해줘" / "업데이트"
- `_workspace/` → `_workspace_prev/`로 백업
- 사용자 추가 입력을 받아 Phase 2부터 재실행
- architect/task-decomposer는 `_workspace_prev/`도 참고해 차이를 의식

### "이 부분만 다시 풀어줘"
- 특정 단계만 재실행 (예: task-decomposer만)
- 이전 단계 산출물은 그대로 유지

### "다른 도메인 추가"
- 기존 `_workspace/`를 보존하고 새 폴더로 분리 권장: `_workspace_payment/`, `_workspace_attendance/`
- 사용자에게 어느 폴더로 갈지 확인

## 산출물 디렉토리 규약

```
apps/class-pass/_workspace/
├── 01_analysis.md          # domain-analyst 결과
├── 02_design.md            # architect 결과
├── 03_tasks.md             # task-decomposer 결과 (Codex 입력)
└── _meta.md                # (선택) 이 회차 메타 정보
```

이전 회차가 있으면:
```
_workspace_prev/
├── 01_analysis.md
├── 02_design.md
└── 03_tasks.md
```

## 작동 원칙 (Why)
- **3단계 분리**: 분석/설계/분해를 한 명에게 시키면 추상적 결과물 또는 누락 발생. 분리해야 각 단계가 깊어짐.
- **파일 기반 핸드오프**: Codex가 메시지를 못 보므로 모든 산출은 파일.
- **이전 산출물 백업**: 후속 요청에서 변화 추적 필요. 덮어쓰기 금지.
- **검토와 분리**: 설계 후 Codex 코딩이 있어야 검토가 의미 있음. 두 스킬을 분리.

## 에러 처리
- domain-analyst가 "도메인 매핑 불명확" 보고 → 사용자에 확인 후 중단
- architect가 누락 정보 요청 → domain-analyst 재호출 1회까지 허용
- 어떤 단계든 실패 → 그 단계 파일 삭제 후 중단, 사용자에 보고

## 모델 설정
모든 에이전트는 `model: "opus"` (정의 파일에 명시됨). 변경 금지.
