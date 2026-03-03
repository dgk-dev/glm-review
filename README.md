# glm-review

GLM-5 기반 코드 리뷰 CLI + [Claude Code](https://claude.ai/code) `/rr` 스킬.

커밋 전에 `/rr` 한 줄이면 GLM-5가 코드를 리뷰하고, Claude가 검증 후 수정까지 해줍니다.

## 설치

### Linux / macOS / WSL2

```bash
curl -fsSL https://raw.githubusercontent.com/dgk-dev/glm-review/main/install-remote.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/dgk-dev/glm-review/main/install.ps1 | iex
```

### 소스에서 설치 (개발용)

```bash
git clone https://github.com/dgk-dev/glm-review.git
cd glm-review
./install.sh           # 파일 복사
./install.sh --dev     # 심링크 (실시간 반영)
```

**필요 조건:**
- Node.js v22+ (`node --version`으로 확인)
- [Z.AI](https://z.ai) Coding Plan + API 키 (`ZAI_API_KEY` 환경변수)

### 플랫폼 지원

| 플랫폼 | 설치 | Claude Code /rr | CLI 직접 |
|--------|------|----------------|---------|
| Linux | `curl \| bash` | bash 래퍼 | bash 래퍼 |
| macOS (Intel/ARM) | `curl \| bash` | bash 래퍼 | bash 래퍼 |
| WSL2 | `curl \| bash` | bash 래퍼 | bash 래퍼 |
| Windows (PowerShell) | `irm \| iex` | bash 래퍼 | .cmd 래퍼 |
| Windows (Git Bash) | `./install.sh` | bash 래퍼 | .cmd 래퍼 |

## 사용법

### Claude Code에서 (추천)

```
/rr                    # uncommitted 변경사항 리뷰
/rr staged             # staged 변경사항만
/rr pr                 # PR diff 리뷰
/rr 보안 집중           # 커스텀 지시사항 추가
```

Claude가 GLM-5 리뷰를 백그라운드로 실행한 뒤, 결과를 검증하고 유효한 이슈를 직접 수정합니다.

### CLI 직접 실행

```bash
glm-review                          # uncommitted 변경사항
glm-review --mode staged            # staged만
glm-review --mode pr                # main 대비 PR
glm-review --mode commit --ref abc  # 특정 커밋
glm-review "보안 취약점 집중"         # 커스텀 지시
glm-review --no-thinking            # 빠른 리뷰 (thinking 비활성화)
glm-review --health                 # API 연결 확인
```

## 동작 원리

```
/rr 실행
  │
  ├─ glm-review CLI (백그라운드)
  │   ├─ git diff 수집
  │   ├─ 변경 파일 전체 읽기
  │   ├─ GLM-5 API 호출 (스트리밍, Thinking mode)
  │   └─ 한국어 리뷰 보고서 출력
  │
  └─ Claude (완료 후)
      ├─ GLM-5 리뷰 결과 검증 (오탐 필터링)
      ├─ 유효 이슈 보고 (Critical/Warning/Suggestion)
      └─ 수정 실행
```

## API 키 설정

[Z.AI](https://z.ai)에서 Coding Plan을 구독하고 API 키를 발급받으세요.

```bash
# ~/.claude/.env.local에 추가 (추천 — 전 플랫폼 공통, glm-review가 자동 로드)
echo "ZAI_API_KEY='your-api-key'" >> ~/.claude/.env.local

# 또는 셸 환경변수로 직접 설정
export ZAI_API_KEY='your-api-key'          # Linux/macOS/WSL2
$env:ZAI_API_KEY = 'your-api-key'          # Windows PowerShell
```

## 기술 스택

- **런타임**: Node.js v22+ (TypeScript 네이티브 실행 via `--experimental-strip-types`)
- **의존성**: ZERO (순수 Node.js 내장 API — fetch, fs, child_process)
- **모델**: GLM-5 (200K context, Thinking mode)
- **API**: Z.AI Coding Plan 전용 엔드포인트

## 리뷰 철학

- 변경된 코드 **단 한 줄도 빠짐없이** 전수 검토
- 공식 문서 우선, 업계 모범사례·커뮤니티 사례 교차 검증
- 특정 체크리스트에 한정하지 않고 코드의 모든 측면을 깊이 있게 검토
- 문제 지적 시 근거(공식 문서, 스펙, 모범사례) 함께 제시

## License

MIT
