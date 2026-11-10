// service/server.ts
import { createServer } from "node:http";

// service/reveal.ts
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
var execute = promisify(execFile);

class ActionError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function inspectLocalPath(path, platform = process.platform) {
  if (platform !== "darwin") {
    throw new ActionError(501, "此操作仅适用于 macOS，请连接本机的 OpenChamber。");
  }
  if (typeof path !== "string" || !isAbsolute(path) || path.length > 32000 || path.includes("\x00")) {
    throw new ActionError(400, "请提供文件的绝对路径。");
  }
  let information;
  try {
    information = await stat(path);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR")
      throw new ActionError(404, "文件不存在，可能已被移动或删除。");
    if (code === "EACCES" || code === "EPERM")
      throw new ActionError(403, "无法访问此文件，请检查文件权限。");
    throw error;
  }
  if (!information.isFile() && !information.isDirectory()) {
    throw new ActionError(400, "请选择文件或文件夹。");
  }
  return { path, information };
}
async function revealLocalPath(input, options = {}) {
  const { path, information } = await inspectLocalPath(input, options.platform);
  const args = information.isDirectory() ? ["--", path] : ["-R", "--", path];
  const launch = options.launch ?? ((program, args2) => execute(program, args2, { timeout: 8000, maxBuffer: 16000 }));
  await launch("/usr/bin/open", args);
}

// service/copy-file.ts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var execute2 = promisify2(execFile2);
var COPY_FILE_SCRIPT = `
ObjC.import('AppKit');
ObjC.import('Foundation');
function run(argv) {
  var file = $.NSURL.fileURLWithPath($(argv[0]));
  var files = $.NSArray.arrayWithObject(file);
  var pasteboard = $.NSPasteboard.generalPasteboard;
  pasteboard.clearContents;
  if (!pasteboard.writeObjects(files)) throw new Error('File clipboard write failed');
  return 'copied';
}
`;
async function copyLocalFile(input, options = {}) {
  const { path } = await inspectLocalPath(input, options.platform);
  const launch = options.launch ?? ((program, args) => execute2(program, args, { timeout: 8000, maxBuffer: 16000 }));
  await launch("/usr/bin/osascript", ["-l", "JavaScript", "-e", COPY_FILE_SCRIPT, "--", path]);
}

// service/server.ts
function createFileLinkServer(token, reveal = revealLocalPath, copyFile = copyLocalFile) {
  if (!token)
    throw new Error("请从 OpenChamber 启动此扩展。");
  return createServer(async (request, response) => {
    const answer = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }).end(JSON.stringify(value));
    };
    if (request.headers.authorization !== `Bearer ${token}`) {
      answer(401, { message: "需要扩展授权。" });
      return;
    }
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/health" && request.method === "GET") {
      answer(200, { ok: true });
      return;
    }
    if (path !== "/reveal" && path !== "/copy-file") {
      answer(404, { message: "找不到此操作。" });
      return;
    }
    if (request.method !== "POST") {
      answer(405, { message: "此操作需要 POST 请求。" });
      return;
    }
    try {
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;
        let tooLarge = false;
        request.on("data", (chunk) => {
          if (tooLarge)
            return;
          bytes += chunk.length;
          if (bytes > 64000) {
            tooLarge = true;
            chunks.length = 0;
            reject(new ActionError(413, "文件地址过长。"));
            return;
          }
          chunks.push(chunk);
        });
        request.once("end", () => {
          if (!tooLarge)
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        request.once("error", reject);
      });
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        throw new ActionError(400, "文件地址格式无效。");
      }
      if (!input || typeof input !== "object" || !("path" in input)) {
        throw new ActionError(400, "请提供文件地址。");
      }
      await (path === "/copy-file" ? copyFile : reveal)(input.path);
      answer(200, { ok: true });
    } catch (error) {
      if (error instanceof ActionError)
        answer(error.status, { message: error.message });
      else
        answer(500, { message: path === "/copy-file" ? "无法复制文件，请确认剪贴板可用后重试。" : "无法在 Finder 中打开，请确认 Finder 可用后重试。" });
    }
  });
}

// service/main.ts
var token = process.env.OPENCHAMBER_SERVICE_TOKEN;
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
if (!token || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("请从 OpenChamber 启动此扩展。");
}
createFileLinkServer(token).listen(port, "127.0.0.1");
