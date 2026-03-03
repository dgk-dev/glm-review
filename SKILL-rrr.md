---
name: rrr
description: "GLM-5 코드 리뷰 (유료). /rr의 상위 버전 — GLM-5 744B 모델로 더 깊은 리뷰. /rrr 또는 'GLM-5 리뷰' 요청 시 사용."
allowed-tools: [Bash, Read, Edit, Glob, Grep]
argument-hint: "review mode or custom instructions (예: 'pr', 'staged', '보안 집중')"
---

# /rrr - GLM-5 Code Review

GLM-5 (744B) 모델로 현재 변경사항을 깊이 있게 코드 리뷰한다.
`/rr` (glm-4.7-flash, 무료)의 상위 버전.

## 사용법

```
/rrr                   # GLM-5 리뷰 (staged + unstaged 변경사항)
/rrr staged            # staged 변경사항만
/rrr pr                # PR diff 리뷰
/rrr 보안 집중          # 커스텀 인스트럭션 추가
```

---

## 실행 방법

`glm-review --model glm-5` CLI를 **반드시 `run_in_background=true` + `dangerouslyDisableSandbox=true`** 로 실행한다.

### 1. 세션 컨텍스트 감지 (리뷰 실행 전 필수)

1. 이번 세션에서 수정/생성한 파일 목록을 정리
2. 해당 파일들이 이미 커밋되었는지 확인 (`git status`)
3. **untracked (신규) 파일 처리** — `glm-review`는 `git diff` 기반이므로 untracked 파일은 diff에 안 잡힘:
   ```bash
   # 신규 파일을 git diff에 노출시키기 (내용 staging 없이 추적만 등록)
   git add -N <untracked-session-files...>
   ```
   리뷰 완료 후 반드시 해제:
   ```bash
   git reset <untracked-session-files...>
   ```
4. 모드 자동 결정:
   - **커밋 완료** → `--mode commit --files file1 file2`
   - **미커밋 (다른 세션 파일도 uncommitted)** → `--files file1 file2` (이 세션 파일만 필터)
   - **미커밋 (이 세션만 작업 중)** → 기본 모드 그대로 (`--files` 불필요)

### 2. 사전 확인 (선택)

헬스 체크로 API 연결 확인:

```bash
glm-review --model glm-5 --health
```

### 3. 리뷰 실행

```bash
# 기본 리뷰 (uncommitted 변경사항)
glm-review --model glm-5

# 모드 지정
glm-review --model glm-5 --mode staged
glm-review --model glm-5 --mode pr

# 특정 파일만 리뷰
glm-review --model glm-5 --files src/a.tsx src/b.ts

# 커밋된 변경 + 특정 파일
glm-review --model glm-5 --mode commit --files src/a.tsx src/b.ts

# 커스텀 인스트럭션 (positional 인자)
glm-review --model glm-5 "보안 취약점과 SQL 인젝션 집중 검토"

# 조합
glm-review --model glm-5 --mode staged "타입 안전성 집중"
```

**실행 파라미터 매핑** (사용자 인자 → CLI 플래그):
- `staged` → `--mode staged`
- `pr` → `--mode pr`
- 그 외 텍스트 → positional 인자로 전달 (따옴표로 감싸기)
- 빠른 리뷰 원할 시 → `--no-thinking` 추가 (thinking mode 비활성화, 속도 향상)
- **모델 고정**: 항상 `--model glm-5` 포함

### 4. 백그라운드 실행 패턴 (필수)

```
Bash tool 호출:
  command: "glm-review --model glm-5 [args]"
  run_in_background: true
  dangerouslyDisableSandbox: true
```

### 5. 실행 후 즉시 턴 종료

백그라운드 실행 직후 사용자에게 안내하고 **즉시 턴을 종료**한다:

> "GLM-5 리뷰가 백그라운드에서 진행 중입니다. 완료되면 알림을 통해 결과를 전달합니다."

자동 완료 알림이 오면 **검증 + 수정 단계**를 진행한다.

### 6. 검증 + 수정 (완료 알림 후 필수)

/rr과 동일한 검증 + 수정 프로세스를 따른다:

1. **오탐 필터링**: 지적한 각 이슈를 실제 코드(Read)와 대조하여 검증
2. **유효 이슈 정리**: 검증된 이슈만 사용자에게 Severity별로 보고
3. **수정 실행**: Critical/Warning 이슈는 사용자 확인 후 직접 Edit으로 수정
4. **결과 보고**: 수정 완료 후 최종 요약 제시

---

## 버전

1.1.0
