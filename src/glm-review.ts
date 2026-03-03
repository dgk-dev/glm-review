#!/usr/bin/env node
/**
 * glm-review — GLM-5 코드 리뷰 CLI
 * 런타임: Node.js v24 (--experimental-strip-types)
 * 의존성: ZERO (순수 Node.js 내장 API)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface CliOptions {
  mode: "uncommitted" | "staged" | "pr" | "commit";
  model: string;
  ref: string;
  base: string;
  thinking: boolean;
  health: boolean;
  help: boolean;
  customInstructions: string;
}

interface FileChange {
  status: "A" | "M" | "D" | string;
  path: string;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const DEFAULT_MODEL = "glm-4.7-flash";
const MAX_FILE_CHARS = 50_000;
const TIMEOUT_MS = 120_000;
const CHARS_PER_TOKEN = 3.5;
const MAX_INPUT_TOKENS = 190_000;

const SYSTEM_PROMPT = `당신은 10년 경력의 시니어 풀스택 엔지니어이자 코드 리뷰 전문가입니다.

아래 코드 변경사항을 단 한 줄도 빠짐없이 모두 검토하세요.
제대로 구현된 건지 디테일하면서도 총체적으로, 궁극적으로 살펴보세요.
특정 체크리스트에 한정하지 말고, 코드의 모든 측면을 깊이 있게 검토하세요.

## 리뷰 원칙
- 공식 문서 우선. 검증된 업계 모범사례와 커뮤니티 사례를 교차 검증하여 판단.
- 프로젝트 컨텍스트(CLAUDE.md, package.json 등)를 참고하여 기존 패턴·컨벤션과의 일관성 확인.
- 변경된 코드가 주변 코드, 다른 파일, 전체 아키텍처에 미치는 영향까지 고려.
- 문제를 지적할 때 반드시 근거(공식 문서, 스펙, 모범사례)를 함께 제시.

## 출력 형식
각 발견을 Severity로 분류:
- 🔴 CRITICAL: 즉시 수정 필수 (버그, 보안 취약점, 데이터 손실 위험)
- 🟡 WARNING: 수정 권장 (잠재적 문제, 성능 이슈, 패턴 위반)
- 🔵 SUGGESTION: 개선 제안 (가독성, 유지보수성, 더 나은 패턴)

파일별로 정리. 변경 부분 집중. 한국어로 작성.`;

// ─── 환경변수 로드 ─────────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const envPath = join(homedir(), ".claude", ".env.local");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      let key = trimmed.slice(0, eqIdx).trim();
      // `export VAR=value` 형식 지원
      if (key.startsWith("export ")) key = key.slice(7).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // 따옴표 제거
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // 무시
  }
}

// ─── CLI 파싱 ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    mode: "uncommitted",
    model: DEFAULT_MODEL,
    ref: "HEAD",
    base: "main",
    thinking: true,
    health: false,
    help: false,
    customInstructions: "",
  };

  const positionals: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--mode":
        opts.mode = argv[++i] as CliOptions["mode"];
        break;
      case "--ref":
        opts.ref = argv[++i];
        break;
      case "--base":
        opts.base = argv[++i];
        break;
      case "--model":
        opts.model = argv[++i];
        break;
      case "--no-thinking":
        opts.thinking = false;
        break;
      case "--health":
        opts.health = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (!arg.startsWith("--")) {
          positionals.push(arg);
        }
    }
    i++;
  }

  if (positionals.length > 0) {
    opts.customInstructions = positionals.join(" ");
  }

  // W2: 모드 값 검증
  const validModes = ["uncommitted", "staged", "pr", "commit"];
  if (!validModes.includes(opts.mode)) {
    console.error(`오류: 알 수 없는 모드 "${opts.mode}". 유효값: ${validModes.join(", ")}`);
    process.exit(1);
  }

  return opts;
}

function printHelp(): void {
  console.log(`
glm-review — Z.AI 코드 리뷰 CLI

사용법:
  glm-review [options] [custom-instructions]

옵션:
  --mode <mode>      리뷰 모드 (기본: uncommitted)
                       uncommitted  git diff HEAD
                       staged       git diff --cached
                       pr           git diff <base>...HEAD
                       commit       마지막 커밋 리뷰
  --model <name>     모델 선택 (기본: glm-4.7-flash)
                       glm-4.7-flash  무료, 200K context
                       glm-5          유료, 200K context, 더 깊은 리뷰
  --ref <hash>       특정 커밋 해시 (--mode commit과 함께)
  --base <branch>    base branch (기본: main)
  --no-thinking      thinking mode 비활성화
  --health           API 키 + 연결 확인
  --help, -h         이 도움말 출력

환경변수:
  ZAI_API_KEY        z.ai API 키 (필수)
                     없으면 ~/.claude/.env.local 자동 로드 시도

예시:
  glm-review
  glm-review --mode pr
  glm-review --mode commit --ref abc1234
  glm-review --mode staged "보안 취약점 집중 리뷰해줘"
  glm-review --health
`.trim());
}

// ─── git 유틸 ─────────────────────────────────────────────────────────────────

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err: any) {
    throw new Error(`git 실행 실패: git ${args.join(" ")}\n${err.message}`);
  }
}

function getDiff(opts: CliOptions): string {
  switch (opts.mode) {
    case "uncommitted":
      return runGit(["diff", "HEAD"]);
    case "staged":
      return runGit(["diff", "--cached"]);
    case "pr":
      return runGit(["diff", `${opts.base}...HEAD`]);
    case "commit":
      return runGit(["diff", `${opts.ref}~1..${opts.ref}`]);
    default:
      throw new Error(`알 수 없는 모드: ${opts.mode}`);
  }
}

function getFileChanges(opts: CliOptions): FileChange[] {
  let nameStatusArgs: string[];
  switch (opts.mode) {
    case "uncommitted":
      nameStatusArgs = ["diff", "--name-status", "HEAD"];
      break;
    case "staged":
      nameStatusArgs = ["diff", "--name-status", "--cached"];
      break;
    case "pr":
      nameStatusArgs = ["diff", "--name-status", `${opts.base}...HEAD`];
      break;
    case "commit":
      nameStatusArgs = ["diff", "--name-status", `${opts.ref}~1..${opts.ref}`];
      break;
    default:
      return [];
  }

  const output = runGit(nameStatusArgs);
  const changes: FileChange[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      // W3: Rename 상태(R100 등) 처리 — new name 사용
      const status = parts[0];
      const filePath = status.startsWith("R") && parts.length >= 3 ? parts[2] : parts[1];
      changes.push({ status: status.charAt(0), path: filePath });
    }
  }
  return changes;
}

function readFileContents(changes: FileChange[]): string {
  const parts: string[] = [];
  for (const change of changes) {
    if (change.status === "D") continue; // 삭제 파일 스킵
    if (!existsSync(change.path)) continue;
    try {
      let content = readFileSync(change.path, "utf-8");
      if (content.length > MAX_FILE_CHARS) {
        content = content.slice(0, MAX_FILE_CHARS) + "\n... (잘림: 50K 제한)";
      }
      const statusLabel = change.status === "A" ? "신규 파일" : "수정된 파일";
      parts.push(`### ${change.path} [${statusLabel}]\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      parts.push(`### ${change.path}\n(파일 읽기 실패)`);
    }
  }
  return parts.join("\n\n");
}

function readProjectContext(): string {
  const contextParts: string[] = [];

  for (const name of ["CLAUDE.md", "package.json"]) {
    if (existsSync(name)) {
      try {
        let content = readFileSync(name, "utf-8");
        if (content.length > 10_000) content = content.slice(0, 10_000) + "\n... (잘림)";
        contextParts.push(`### ${name}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        // 무시
      }
    }
  }

  return contextParts.join("\n\n");
}

// ─── 토큰 추정 + 청크 분할 ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function splitDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  const parts = diff.split(/^(?=diff --git )/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const match = part.match(/^diff --git a\/.+ b\/(.+)/);
    if (match) result.set(match[1], part);
  }
  return result;
}

// ─── SSE 스트리밍 파싱 ────────────────────────────────────────────────────────

async function streamReview(
  messages: { role: string; content: string }[],
  thinking: boolean,
  model: string,
): Promise<void> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.error("오류: ZAI_API_KEY 환경변수가 없습니다.");
    process.exit(1);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: 0.3,
  };
  if (thinking) {
    body.thinking = { type: "enabled" };
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("오류: API 요청 타임아웃 (120초)");
    } else {
      console.error(`오류: API 연결 실패 — ${err.message}`);
    }
    process.exit(1);
  }

  // W1: 타임아웃을 스트리밍 완료까지 유지 (clearTimeout은 함수 끝에서)

  if (!response.ok) {
    clearTimeout(timeoutId);
    const text = await response.text().catch(() => "");
    switch (response.status) {
      case 401:
        console.error("오류: API 키가 유효하지 않습니다 (401 Unauthorized)");
        break;
      case 429:
        console.error("오류: API 요청 한도 초과 (429 Too Many Requests)");
        break;
      case 500:
        console.error(`오류: GLM-5 서버 오류 (500) — ${text.slice(0, 200)}`);
        break;
      default:
        console.error(`오류: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }
    process.exit(1);
  }

  if (!response.body) {
    console.error("오류: 응답 body가 없습니다");
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as any) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta;
        if (!delta) continue;

        // reasoning_content (thinking) → stderr
        if (delta.reasoning_content) {
          process.stderr.write(delta.reasoning_content);
        }
        // 실제 리뷰 내용 → stdout
        if (delta.content) {
          process.stdout.write(delta.content);
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  }

  // 남은 버퍼 처리
  if (buffer.trim().startsWith("data:")) {
    const data = buffer.trim().slice(5).trim();
    if (data && data !== "[DONE]") {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta;
        if (delta?.content) process.stdout.write(delta.content);
      } catch {
        // 무시
      }
    }
  }

  clearTimeout(timeoutId);
}

// ─── --health 명령 ────────────────────────────────────────────────────────────

async function runHealth(model: string): Promise<void> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.error("❌ ZAI_API_KEY 없음");
    process.exit(1);
  }
  console.log(`✅ ZAI_API_KEY 존재 (길이: ${apiKey.length})`);
  console.log(`🔌 ${model} API 연결 테스트 중...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "say hi" }],
        stream: false,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`❌ 연결 실패: ${err.message}`);
    process.exit(1);
  }

  clearTimeout(timeoutId);

  if (response.ok) {
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content ?? "(응답 없음)";
    console.log(`✅ API 정상 — 응답: "${content}"`);
  } else {
    const text = await response.text().catch(() => "");
    console.error(`❌ HTTP ${response.status}: ${text.slice(0, 200)}`);
    process.exit(1);
  }
}

// ─── 청크 분할 리뷰 (토큰 초과 시) ──────────────────────────────────────────

async function reviewChunked(
  opts: CliOptions,
  diff: string,
  changes: FileChange[],
  projectContext: string,
): Promise<void> {
  const diffByFile = splitDiffByFile(diff);

  // 파일별 페이로드 구성
  const payloads: { path: string; diff: string; content: string; tokens: number }[] = [];

  for (const change of changes) {
    const fileDiff = diffByFile.get(change.path) ?? "";
    diffByFile.delete(change.path);
    let content = "";
    if (change.status !== "D" && existsSync(change.path)) {
      try {
        let raw = readFileSync(change.path, "utf-8");
        if (raw.length > MAX_FILE_CHARS) {
          raw = raw.slice(0, MAX_FILE_CHARS) + "\n... (잘림: 50K 제한)";
        }
        const label = change.status === "A" ? "신규 파일" : "수정된 파일";
        content = `### ${change.path} [${label}]\n\`\`\`\n${raw}\n\`\`\``;
      } catch {
        // 무시
      }
    }
    payloads.push({
      path: change.path,
      diff: fileDiff,
      content,
      tokens: estimateTokens(fileDiff + content),
    });
  }

  // changes에 없는 diff 파일 포함 (edge case)
  for (const [path, fileDiff] of diffByFile) {
    payloads.push({ path, diff: fileDiff, content: "", tokens: estimateTokens(fileDiff) });
  }

  // 토큰 예산 계산
  const baseTokens =
    estimateTokens(SYSTEM_PROMPT) +
    estimateTokens(projectContext) +
    estimateTokens(opts.customInstructions) +
    1000;
  const budget = MAX_INPUT_TOKENS - baseTokens;

  // 파일을 청크로 그룹핑
  const chunks: (typeof payloads)[] = [];
  let currentChunk: typeof payloads = [];
  let currentTokens = 0;

  for (const payload of payloads) {
    let p = payload;

    // 단일 파일이 예산 초과 시 — 파일 내용 제거, diff 자르기
    if (p.tokens > budget) {
      const maxChars = Math.floor(budget * CHARS_PER_TOKEN);
      if (p.diff.length > maxChars) {
        p = { ...p, diff: p.diff.slice(0, maxChars) + "\n... (diff 잘림)", content: "" };
      } else {
        p = { ...p, content: "" };
      }
      p.tokens = estimateTokens(p.diff + p.content);
    }

    if (currentTokens + p.tokens > budget && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(p);
    currentTokens += p.tokens;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  const modeLabels: Record<string, string> = {
    uncommitted: "스테이징되지 않은 변경사항 (git diff HEAD)",
    staged: "스테이징된 변경사항 (git diff --cached)",
    pr: `PR 변경사항 (git diff ${opts.base}...HEAD)`,
    commit: `커밋 리뷰 (${opts.ref})`,
  };

  console.error(`📦 ${chunks.length}개 청크로 분할 리뷰 시작\n`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fileList = chunk.map((p) => p.path);
    console.error(`━━━ 청크 ${i + 1}/${chunks.length} (${chunk.length}개 파일) ━━━`);
    for (const f of fileList) console.error(`  · ${f}`);

    let userContent = `## 리뷰 대상\n${modeLabels[opts.mode] ?? opts.mode}\n`;
    userContent += `\n**[청크 ${i + 1}/${chunks.length}]**\n파일: ${fileList.join(", ")}\n\n`;

    if (projectContext) {
      userContent += `## 프로젝트 컨텍스트\n${projectContext}\n\n`;
    }

    const chunkDiff = chunk
      .map((p) => p.diff)
      .filter(Boolean)
      .join("\n");
    if (chunkDiff) {
      userContent += `## git diff\n\`\`\`diff\n${chunkDiff}\n\`\`\`\n`;
    }

    const chunkContents = chunk
      .map((p) => p.content)
      .filter(Boolean)
      .join("\n\n");
    if (chunkContents) {
      userContent += `\n## 변경된 파일 전체 내용\n${chunkContents}\n`;
    }

    if (opts.customInstructions) {
      userContent += `\n## 추가 지시사항\n${opts.customInstructions}\n`;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    process.stdout.write(`\n## 청크 ${i + 1}/${chunks.length}\n\n`);
    await streamReview(messages, opts.thinking, opts.model);
    process.stdout.write("\n");
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ~/.claude/.env.local 로드 시도
  loadEnvLocal();

  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.health) {
    await runHealth(opts.model);
    return;
  }

  // git diff 수집
  let diff: string;
  try {
    diff = getDiff(opts);
  } catch (err: any) {
    console.error(`오류: ${err.message}`);
    process.exit(1);
  }

  if (!diff.trim()) {
    console.log("변경사항 없음 — 리뷰할 내용이 없습니다.");
    return;
  }

  // 변경 파일 수집
  let changes: FileChange[] = [];
  try {
    changes = getFileChanges(opts);
  } catch {
    // 파일 목록 실패해도 diff만으로 진행
  }

  const fileContents = readFileContents(changes);
  const projectContext = readProjectContext();

  // 유저 메시지 구성
  const modeLabels: Record<string, string> = {
    uncommitted: "스테이징되지 않은 변경사항 (git diff HEAD)",
    staged: "스테이징된 변경사항 (git diff --cached)",
    pr: `PR 변경사항 (git diff ${opts.base}...HEAD)`,
    commit: `커밋 리뷰 (${opts.ref})`,
  };

  let userContent = `## 리뷰 대상\n${modeLabels[opts.mode] ?? opts.mode}\n\n`;

  if (projectContext) {
    userContent += `## 프로젝트 컨텍스트\n${projectContext}\n\n`;
  }

  userContent += `## git diff\n\`\`\`diff\n${diff}\n\`\`\`\n`;

  if (fileContents) {
    userContent += `\n## 변경된 파일 전체 내용\n${fileContents}\n`;
  }

  if (opts.customInstructions) {
    userContent += `\n## 추가 지시사항\n${opts.customInstructions}\n`;
  }

  // 토큰 한계 확인 — 초과 시 파일별 청크 분할 리뷰
  const estimatedTokens = estimateTokens(SYSTEM_PROMPT + userContent);
  if (estimatedTokens > MAX_INPUT_TOKENS) {
    const modeLabel = modeLabels[opts.mode] ?? opts.mode;
    console.error(`\n🔍 ${opts.model} 코드 리뷰 시작 — ${modeLabel}`);
    if (changes.length > 0) {
      const added = changes.filter((c) => c.status === "A").length;
      const modified = changes.filter((c) => c.status === "M").length;
      const deleted = changes.filter((c) => c.status === "D").length;
      console.error(
        `📁 변경 파일: ${changes.length}개 (추가 ${added}, 수정 ${modified}, 삭제 ${deleted})`,
      );
    }
    console.error(`💭 Thinking: ${opts.thinking ? "활성화" : "비활성화"}`);
    console.error(
      `⚠️  토큰 초과 (~${Math.round(estimatedTokens / 1000)}K > ${MAX_INPUT_TOKENS / 1000}K) — 청크 분할 리뷰\n`,
    );
    await reviewChunked(opts, diff, changes, projectContext);
    process.stdout.write("\n");
    return;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  // 헤더 출력
  const modeLabel = modeLabels[opts.mode] ?? opts.mode;
  console.error(`\n🔍 ${opts.model} 코드 리뷰 시작 — ${modeLabel}`);
  if (changes.length > 0) {
    const added = changes.filter((c) => c.status === "A").length;
    const modified = changes.filter((c) => c.status === "M").length;
    const deleted = changes.filter((c) => c.status === "D").length;
    console.error(`📁 변경 파일: ${changes.length}개 (추가 ${added}, 수정 ${modified}, 삭제 ${deleted})`);
  }
  console.error(`💭 Thinking: ${opts.thinking ? "활성화" : "비활성화"}\n`);

  await streamReview(messages, opts.thinking, opts.model);

  // 마지막 줄바꿈
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error(`예상치 못한 오류: ${err.message}`);
  process.exit(1);
});
