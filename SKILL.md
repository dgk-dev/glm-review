---
name: rr
description: "코드 리뷰. 작업 후 변경사항을 Z.AI 모델로 깊이 있게 검토. /rr 또는 'GLM 리뷰' 요청 시 사용. (기본: glm-4.7-flash 무료)"
allowed-tools: [Bash, Read, Edit, Glob, Grep]
argument-hint: "review mode or custom instructions (예: 'pr', 'staged', '보안 집중')"
---

# /rr - Z.AI Code Review (무료)

Z.AI 모델로 현재 변경사항을 깊이 있게 코드 리뷰한다. (기본: glm-4.7-flash, GLM-5는 /rrr)

## 사용법

```
/rr                    # 기본 리뷰 (staged + unstaged 변경사항)
/rr staged             # staged 변경사항만
/rr pr                 # PR diff 리뷰
/rr 보안 집중           # 커스텀 인스트럭션 추가
```

---

## 실행 방법

`glm-review` CLI를 **반드시 `run_in_background=true` + `dangerouslyDisableSandbox=true`** 로 실행한다.

### 1. 사전 확인 (선택)

헬스 체크로 API 연결 확인:

```bash
glm-review --health
```

→ 정상이면 "API 정상" 출력.

### 2. 리뷰 실행

```bash
# 기본 리뷰 (uncommitted 변경사항)
glm-review

# 모드 지정
glm-review --mode staged
glm-review --mode pr

# 커스텀 인스트럭션 (positional 인자)
glm-review "보안 취약점과 SQL 인젝션 집중 검토"

# 조합
glm-review --mode staged "타입 안전성 집중"
```

**실행 파라미터 매핑** (사용자 인자 → CLI 플래그):
- `staged` → `--mode staged`
- `pr` → `--mode pr`
- 그 외 텍스트 → positional 인자로 전달 (따옴표로 감싸기)
- 빠른 리뷰 원할 시 → `--no-thinking` 추가 (thinking mode 비활성화, 속도 향상)
- 기본 모델: glm-4.7-flash (무료). GLM-5 원하면 `/rrr` 사용

### 3. 백그라운드 실행 패턴 (필수)

```
Bash tool 호출:
  command: "glm-review [args]"
  run_in_background: true
  dangerouslyDisableSandbox: true
```

⚠️ **절대 금지** (리뷰 실행 시):
- `TaskOutput`, `block`, `poll`, `wait`, `sleep` 사용 금지
- 완료를 기다리며 루프 금지
- 동기적 실행 금지 (`run_in_background: false`)

**예외**: `--health` 명령은 수 초 내 완료되므로 **foreground (동기) 실행** OK.

### 4. 실행 후 즉시 턴 종료

백그라운드 실행 직후 사용자에게 안내하고 **즉시 턴을 종료**한다:

> "GLM-5 리뷰가 백그라운드에서 진행 중입니다. 완료되면 알림을 통해 결과를 전달합니다."

자동 완료 알림이 오면 **검증 + 수정 단계**를 진행한다.

### 5. 검증 + 수정 (완료 알림 후 필수)

GLM-5 리뷰 결과를 받으면 **그대로 전달하지 않는다**. 다음 단계를 수행한다:

1. **오탐 필터링**: GLM-5가 지적한 각 이슈를 실제 코드(Read)와 대조하여 검증
   - 실제 문제인지 확인 (오탐이면 제외)
   - 이미 수정된 이슈인지 확인
2. **유효 이슈 정리**: 검증된 이슈만 사용자에게 Severity별로 보고
3. **수정 실행**: Critical/Warning 이슈는 사용자 확인 후 직접 Edit으로 수정
   - 수정 후 해당 파일 Read로 재확인
4. **결과 보고**: 수정 완료 후 최종 요약 제시

⚠️ **중요**: GLM-5 리뷰는 다른 AI의 시각이므로 100% 신뢰하지 않는다. 반드시 실제 코드와 대조 검증한다.

---

## 에러 대응

| 증상 | 원인 | 해결 |
|------|------|------|
| `ZAI_API_KEY not set` | 환경변수 미설정 | `secrets` 명령으로 키 추가 |
| `command not found: glm-review` | 설치 안 됨 | `cd ~/ws/glm-review && ./install.sh` |
| `GLM API error 401` | API 키 만료/오류 | `glm-review --health`로 진단 |
| 리뷰 결과 빈 값 | 변경사항 없음 | `git status`로 확인 |

---

## 버전

1.0.0
