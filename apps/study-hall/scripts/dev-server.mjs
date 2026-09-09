// 이 기계에서 개발 서버는 항상 한 대만 돈다.
//
// 예전에는 포트마다 빌드 폴더를 나눠 여러 대를 동시에 띄울 수 있게 했는데,
// 작업 세션마다 한 대씩 띄우면서 포트가 1631·2430·9898 처럼 제각각이 됐다.
// MOCK_MODE 에서는 mock 저장소가 프로세스 메모리에 있으므로 포트가 다르면
// 학생·출결·채팅 데이터가 서로 보이지 않는다. 그런데 쿠키는 포트를 구분하지
// 않아 로그인만 공유되니, "로그인은 됐는데 데이터가 없다" 로 보인다.
//
// 그래서 127.0.0.1 의 제어 포트를 자리 하나로 쓴다. 새로 뜬 서버가 그 자리에
// 앉아 있던 서버에게 비켜 달라고 하고, 비워지면 자기가 앉는다. 자리를 잡지
// 못하면 시작하지 않는다 — 두 대가 도는 것보다 안 도는 편이 낫다.
//
// 한 대만 도는 것이 보장되므로 빌드 폴더도 .next-dev 하나면 된다.
// next.config.mjs 는 distDir 을 NEXT_DIST_DIR 에서 읽는다. 직접 지정했으면 존중한다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsconfigPath = path.join(appRoot, "tsconfig.json");
const args = process.argv.slice(2);

/**
 * next dev 는 시작할 때 tsconfig.json 의 include 에 "<distDir>/types/**\/*.ts" 를 덧붙인다.
 * 커밋할 내용이 아닌데 git 이 매번 수정으로 잡으므로 다시 걷어낸다.
 * include 의 "**\/*.ts" 가 이미 같은 파일을 포함하므로 지워도 타입 검사에는 영향이 없다.
 */
function stripGeneratedIncludes() {
  try {
    const raw = fs.readFileSync(tsconfigPath, "utf8");
    const config = JSON.parse(raw);
    const include = config.include;

    if (!Array.isArray(include)) {
      return false;
    }

    const kept = include.filter((entry) => !String(entry).startsWith(".next-dev"));

    if (kept.length === include.length) {
      return false;
    }

    config.include = kept;
    // 원본 줄바꿈을 유지해야 git 이 내용 변경 없는 파일을 수정으로 잡지 않는다.
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const serialized = JSON.stringify(config, null, 2).replaceAll("\n", eol);
    fs.writeFileSync(tsconfigPath, `${serialized}${eol}`);
    return true;
  } catch {
    // tsconfig 를 읽지 못해도 개발 서버는 그대로 돌아가야 한다.
    return false;
  }
}

/**
 * 포트를 알아내고, next dev 로 넘길 인자만 남긴다.
 *
 * `npm run dev -- --port 3200` 은 셸과 npm 을 거치며 "--port" 가 사라지고 "3200" 만
 * 남는 경우가 있다(PowerShell + npm). 그대로 두면 next 가 이 숫자를 프로젝트 폴더로
 * 읽어 "Invalid project directory" 로 죽으므로, 홀로 남은 숫자는 포트로 해석하고
 * 인자에서 뺀다.
 */
function resolveInvocation() {
  const forwarded = [];
  let explicitPort = null;
  let inferredPort = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--port" || arg === "-p") {
      explicitPort = args[index + 1];
      forwarded.push(arg);
      if (args[index + 1] !== undefined) {
        forwarded.push(args[index + 1]);
        index += 1;
      }
      continue;
    }

    const inline = /^--port=(.+)$/.exec(arg);
    if (inline) {
      explicitPort = inline[1];
      forwarded.push(arg);
      continue;
    }

    if (inferredPort === null && /^\d{2,5}$/.test(arg)) {
      inferredPort = arg;
      continue;
    }

    forwarded.push(arg);
  }

  const port = explicitPort ?? inferredPort ?? process.env.PORT ?? "3000";
  return { port: String(port), forwarded, inferred: !explicitPort && inferredPort !== null };
}

const { port, forwarded: nextArgs, inferred } = resolveInvocation();
const distDir = process.env.NEXT_DIST_DIR || ".next-dev";

// npm 을 거치지 않고 `node scripts/dev-server.mjs` 로 직접 실행하면 node_modules/.bin 이
// PATH 에 없어 "next" 를 찾지 못한다. 경로를 직접 풀어 두면 실행 방식과 무관하게 동작한다.
const nextCli = createRequire(path.join(appRoot, "package.json")).resolve("next/dist/bin/next");

if (inferred) {
  console.log(
    `[dev-server] 인자에서 포트 번호만 전달돼 ${port} 번으로 해석했습니다. ` +
      `PowerShell 에서는 "$env:PORT=${port}; npm run dev" 형태를 권합니다.`,
  );
}

console.log(`[dev-server] 포트 ${port} · 빌드 폴더 ${distDir}`);

// next dev 가 죽어도 개발이 끊기지 않도록 되살린다. 다만 설정 오류처럼 뜨자마자
// 계속 죽는 상황에서 무한 재시작하면 원인을 못 보므로, 짧은 시간에 반복되면 멈춘다.
const RESTART_WINDOW_MS = 60_000;
const MAX_RESTARTS_IN_WINDOW = 5;
const RESTART_DELAY_MS = 1_000;

let child = null;
let stopping = false;
let restartTimestamps = [];

// 개발 서버 한 대만 앉을 수 있는 자리. 값 자체에 뜻은 없고, 흔히 쓰는 대역만 피하면 된다.
// 워크트리가 달라도 같은 기계면 같은 자리를 두고 다투므로 진짜로 한 대만 남는다.
const CONTROL_PORT = 39_431;
const LOOPBACK = "127.0.0.1";
const TAKEOVER_TIMEOUT_MS = 20_000;
const PORT_RELEASE_TIMEOUT_MS = 15_000;

let controlServer = null;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * next dev 는 렌더 워커를 따로 띄우고 그 워커가 실제로 포트를 쥔다.
 * 부모만 죽이면 워커가 남아 포트를 계속 잡고 있으므로 트리째 정리한다.
 */
function killChildTree(signal = "SIGTERM") {
  if (!child) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  child.kill(signal);
}

/** 자리를 넘겨주고 물러난다. 제어 포트는 프로세스가 끝나면서 함께 풀린다. */
function stepAside() {
  stopping = true;

  if (!child) {
    process.exit(0);
  }

  killChildTree();
}

/**
 * 자리에 앉아 있는 서버에게 묻는다.
 * "step-aside" 는 비켜 달라는 요청이고, 그 외에는 신원만 돌려받는다.
 */
function queryIncumbent(command) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: LOOPBACK, port: CONTROL_PORT });
    let answer = "";
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(answer.trim());
    };

    socket.setTimeout(3_000, finish);
    socket.on("data", (chunk) => {
      answer += chunk.toString("utf8");
    });
    socket.on("connect", () => socket.write(`${command}\n`));
    socket.on("error", finish);
    socket.on("close", finish);
  });
}

function listenOnControlPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on("error", () => {});
      socket.on("data", (chunk) => {
        const answer = `pid=${process.pid} port=${port} root=${appRoot}\n`;

        if (chunk.toString("utf8").trim() === "step-aside") {
          socket.end(answer);
          console.log("[dev-server] 새 개발 서버가 떠서 이 서버를 종료합니다.");
          stepAside();
          return;
        }

        socket.end(answer);
      });
    });

    server.once("error", reject);
    server.listen(CONTROL_PORT, LOOPBACK, () => {
      // 자식 프로세스가 이미 이벤트 루프를 붙잡고 있다. 이 서버까지 붙잡으면 종료가 늦어진다.
      server.unref();
      resolve(server);
    });
  });
}

function isPortBusy(target) {
  return new Promise((resolve) => {
    const probe = net.createConnection({ host: LOOPBACK, port: Number(target) });
    let settled = false;

    const finish = (busy) => {
      if (settled) {
        return;
      }
      settled = true;
      probe.destroy();
      resolve(busy);
    };

    probe.setTimeout(1_000, () => finish(false));
    probe.on("connect", () => finish(true));
    probe.on("error", () => finish(false));
  });
}

/**
 * 자리를 잡는다. 잡지 못하면 시작하지 않는다.
 *
 * 앞 서버가 물러나는 동안 HTTP 포트가 잠깐 남아 있을 수 있다. 그대로 next 를 띄우면
 * next 가 조용히 다음 포트로 옮겨 가 버려서 애초에 없애려던 포트 표류가 다시 생긴다.
 * 그래서 제어 포트뿐 아니라 실제 포트가 비는 것까지 확인하고 넘어간다.
 */
async function claimTheOnlySlot() {
  const deadline = Date.now() + TAKEOVER_TIMEOUT_MS;
  let asked = false;

  for (;;) {
    try {
      controlServer = await listenOnControlPort();
      break;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" || Date.now() > deadline) {
        console.error(
          `[dev-server] 제어 포트 ${CONTROL_PORT} 를 잡지 못해 시작하지 않습니다. ` +
            "개발 서버가 두 대 도는 것을 막기 위한 안전장치입니다.",
          error?.message ?? error,
        );
        process.exit(1);
      }

      if (!asked) {
        asked = true;

        // 다른 작업 폴더의 서버를 말없이 밀어내면, 사용자가 보고 있던 확인용 화면이
        // 조용히 다른 코드로 바뀐다. 워크트리와 메인 저장소를 오갈 때 실제로 겪은 일이라
        // 폴더가 다르면 멈추고 사람이 결정하게 한다.
        const incumbentRoot = /root=(.+)$/m.exec(await queryIncumbent("whoami"))?.[1]?.trim();
        const sameRoot =
          !incumbentRoot || path.resolve(incumbentRoot) === path.resolve(appRoot);

        if (!sameRoot && process.env.DEV_SERVER_TAKEOVER !== "1") {
          console.error(
            `[dev-server] 지금 ${port} 번은 다른 작업 폴더가 쓰고 있어 시작하지 않습니다.\n` +
              `  사용 중: ${incumbentRoot}\n` +
              `  요청함:  ${appRoot}\n` +
              "  화면이 말없이 다른 코드로 바뀌는 것을 막기 위한 안전장치입니다.\n" +
              '  그래도 넘겨받으려면 "$env:DEV_SERVER_TAKEOVER=1" 을 주고 다시 실행하세요.',
          );
          process.exit(1);
        }

        await queryIncumbent("step-aside");
        console.log(
          `[dev-server] 개발 서버를 넘겨받습니다: ${incumbentRoot ?? "(알 수 없음)"} → ${appRoot}`,
        );
      }

      await delay(300);
    }
  }

  const portDeadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;

  while (await isPortBusy(port)) {
    if (Date.now() > portDeadline) {
      console.error(
        `[dev-server] 포트 ${port} 를 다른 프로그램이 쓰고 있어 시작하지 않습니다. ` +
          `그 프로그램을 끄거나 "$env:PORT=<다른 포트>; npm run dev" 로 지정해 주세요.`,
      );
      process.exit(1);
    }

    await delay(200);
  }
}

function startNext() {
  child = spawn(process.execPath, [nextCli, "dev", ...nextArgs], {
    cwd: appRoot,
    stdio: "inherit",
    // 인자에서 포트를 빼냈을 수 있으므로 PORT 로도 넘긴다. --port 를 직접 준 경우 그쪽이 우선한다.
    env: { ...process.env, PORT: port, NEXT_DIST_DIR: distDir },
  });

  // next dev 가 tsconfig 를 건드리는 시점이 기동 직후라, 잠깐만 지켜보다가 되돌린다.
  const watchStartedAt = Date.now();
  const tsconfigWatcher = setInterval(() => {
    if (stripGeneratedIncludes() || Date.now() - watchStartedAt > 30_000) {
      clearInterval(tsconfigWatcher);
    }
  }, 500);
  tsconfigWatcher.unref?.();

  child.on("exit", (code, signal) => {
    clearInterval(tsconfigWatcher);
    stripGeneratedIncludes();

    if (stopping) {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    }

    const now = Date.now();
    restartTimestamps = restartTimestamps.filter((at) => now - at < RESTART_WINDOW_MS);

    if (restartTimestamps.length >= MAX_RESTARTS_IN_WINDOW) {
      console.error(
        `[dev-server] ${RESTART_WINDOW_MS / 1000}초 안에 ${MAX_RESTARTS_IN_WINDOW}번 종료되어 재시작을 멈춥니다. 위 오류를 확인해 주세요.`,
      );
      process.exit(code ?? 1);
    }

    restartTimestamps.push(now);
    console.warn(
      `[dev-server] 개발 서버가 종료됐습니다 (${signal ?? `code ${code}`}). ${RESTART_DELAY_MS}ms 후 다시 시작합니다.`,
    );
    setTimeout(startNext, RESTART_DELAY_MS);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    // 워커까지 함께 정리해야 포트가 바로 풀린다. child.kill 은 직속 자식만 죽인다.
    killChildTree(signal);
  });
}

await claimTheOnlySlot();
startNext();
