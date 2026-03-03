#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# glm-review install.sh
# GLM-5 코드 리뷰 CLI + Claude Code /rr 스킬 설치
# ─────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/rr"
BIN_DIR="$HOME/.local/bin"
SCRIPTS_DIR="$SKILL_DIR/scripts"

DEV_MODE=false
if [[ "${1:-}" == "--dev" ]]; then
  DEV_MODE=true
fi

# ── 색상 ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[glm-review]${NC} $*"; }
success() { echo -e "${GREEN}[glm-review]${NC} ✓ $*"; }
warn()    { echo -e "${YELLOW}[glm-review]${NC} ⚠ $*"; }
error()   { echo -e "${RED}[glm-review]${NC} ✗ $*" >&2; }

# ── 1. Node.js v22+ 확인 ─────────────────────
info "Node.js 버전 확인 중..."

if ! command -v node &>/dev/null; then
  error "Node.js가 설치되어 있지 않습니다."
  error "fnm으로 설치: fnm install 22 && fnm use 22"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js v22 이상이 필요합니다. 현재: v${NODE_VERSION}"
  error "fnm으로 업그레이드: fnm install 22 && fnm use 22"
  exit 1
fi

success "Node.js v${NODE_VERSION} 확인됨 (--experimental-strip-types 지원)"

# ── 2. 디렉토리 생성 ─────────────────────────
info "디렉토리 생성 중..."
mkdir -p "$SKILL_DIR"
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$BIN_DIR"
success "디렉토리 준비 완료"

# ── 3. SKILL.md 설치 ─────────────────────────
info "SKILL.md 설치 중..."
if [[ "$DEV_MODE" == true ]]; then
  ln -sf "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
  success "SKILL.md 심링크 생성 (dev 모드): $SKILL_DIR/SKILL.md -> $SCRIPT_DIR/SKILL.md"
else
  cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
  success "SKILL.md 복사 완료: $SKILL_DIR/SKILL.md"
fi

# ── 4. glm-review.ts 설치 ────────────────────
info "glm-review.ts 설치 중..."
SRC_TS="$SCRIPT_DIR/src/glm-review.ts"

if [[ ! -f "$SRC_TS" ]]; then
  error "src/glm-review.ts 파일이 없습니다: $SRC_TS"
  exit 1
fi

if [[ "$DEV_MODE" == true ]]; then
  ln -sf "$SRC_TS" "$SCRIPTS_DIR/glm-review.ts"
  success "glm-review.ts 심링크 생성 (dev 모드): $SCRIPTS_DIR/glm-review.ts -> $SRC_TS"
else
  cp "$SRC_TS" "$SCRIPTS_DIR/glm-review.ts"
  success "glm-review.ts 복사 완료: $SCRIPTS_DIR/glm-review.ts"
fi

# ── 5. 실행 래퍼 스크립트 생성 ───────────────
info "실행 래퍼 스크립트 생성 중..."
WRAPPER="$SCRIPTS_DIR/glm-review"

cat > "$WRAPPER" << 'WRAPPER_EOF'
#!/usr/bin/env bash
# glm-review wrapper — POSIX-compatible symlink resolution (macOS/Linux/Git Bash)
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
exec node --no-warnings --experimental-strip-types "$SCRIPT_DIR/glm-review.ts" "$@"
WRAPPER_EOF

chmod +x "$WRAPPER"
success "래퍼 스크립트 생성 완료: $WRAPPER"

# Windows (Git Bash / MSYS2) 감지 시 .cmd 래퍼 추가 생성
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    CMD_WRAPPER="$SCRIPTS_DIR/glm-review.cmd"
    cat > "$CMD_WRAPPER" << 'CMD_EOF'
@echo off
node --no-warnings --experimental-strip-types "%~dp0glm-review.ts" %*
CMD_EOF
    cp "$CMD_WRAPPER" "$BIN_DIR/glm-review.cmd" 2>/dev/null || true
    success ".cmd 래퍼 생성 완료 (Windows CLI용)"
    ;;
esac

# ── 6. ~/.local/bin 심링크 ───────────────────
info "~/.local/bin 심링크 생성 중..."
SYMLINK="$BIN_DIR/glm-review"

if [[ -L "$SYMLINK" ]]; then
  rm "$SYMLINK"
fi
ln -sf "$WRAPPER" "$SYMLINK"
success "심링크 생성: $SYMLINK -> $WRAPPER"

# ── 7. PATH 확인 ─────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
  warn "$BIN_DIR 가 PATH에 없습니다."
  warn "~/.zshrc 또는 ~/.bashrc에 추가하세요:"
  warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── 8. ZAI_API_KEY 확인 ──────────────────────
info "API 키 확인 중..."

if [[ -z "${ZAI_API_KEY:-}" ]]; then
  # .env.local에서 시도
  ENV_LOCAL="$HOME/.claude/.env.local"
  if [[ -f "$ENV_LOCAL" ]] && grep -q "ZAI_API_KEY" "$ENV_LOCAL"; then
    warn "ZAI_API_KEY가 환경변수에 없습니다. ~/.claude/.env.local에는 있습니다."
    warn "현재 셸에서 로드하려면: source $ENV_LOCAL"
  else
    warn "ZAI_API_KEY가 설정되어 있지 않습니다."
    warn "설정 방법:"
    warn "  1. 'secrets' 명령으로 ~/.claude/.env.local에 추가"
    warn "  2. export ZAI_API_KEY='your-api-key'"
  fi
else
  success "ZAI_API_KEY 확인됨"
fi

# ── 9. 헬스 체크 ─────────────────────────────
echo ""
info "헬스 체크 실행 중..."

if command -v glm-review &>/dev/null; then
  if glm-review --health 2>&1; then
    success "GLM-5 API 연결 확인됨"
  else
    warn "헬스 체크 실패. ZAI_API_KEY를 확인하세요."
  fi
else
  warn "glm-review 명령을 찾을 수 없습니다. 새 셸을 열거나 PATH를 확인하세요."
fi

# ── 완료 ─────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  glm-review 설치 완료!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Claude Code에서 /rr 로 사용"
echo "  CLI 직접 실행: glm-review"
echo ""
if [[ "$DEV_MODE" == true ]]; then
  echo -e "${YELLOW}  [DEV 모드] 소스 파일이 심링크로 연결됨${NC}"
  echo -e "${YELLOW}  파일 수정이 즉시 반영됩니다.${NC}"
  echo ""
fi
