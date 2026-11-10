import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectLocalPath } from './reveal';

const execute = promisify(execFile);

// NSURL supplies the native file pasteboard formats that Finder accepts.
// Pass the path as an argument. Never insert it into the script source.
export const COPY_FILE_SCRIPT = `
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

export async function copyLocalFile(
  input: unknown,
  options: {
    platform?: NodeJS.Platform;
    launch?: (program: string, args: string[]) => Promise<unknown>;
  } = {},
): Promise<void> {
  const { path } = await inspectLocalPath(input, options.platform);
  const launch = options.launch ?? ((program, args) => execute(program, args, { timeout: 8000, maxBuffer: 16000 }));
  await launch('/usr/bin/osascript', ['-l', 'JavaScript', '-e', COPY_FILE_SCRIPT, '--', path]);
}
