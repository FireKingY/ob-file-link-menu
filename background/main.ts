import { connectHost } from '@openchamber/sdk';
import { sendFileToCurrentSession } from './send-to-session';

const host = connectHost();

host.onAction(async (item) => {
  if (item.kind !== 'file') throw new Error('请从文件的右键菜单执行此操作。');
  if (item.action === 'send-to-session') {
    if (item.isDirectory) throw new Error('请选择要发送的文件。');
    await sendFileToCurrentSession(item.path);
    await host.toast({ kind: 'success', message: '已添加到当前会话输入框' });
    return;
  }
  if (item.action === 'copy-path') {
    await host.writeClipboard(item.path);
    await host.toast({ kind: 'success', message: '已复制文件地址' });
    return;
  }
  const copyFile = item.action === 'copy-file';
  if (!copyFile && item.action !== 'reveal-file') throw new Error('找不到此操作。');
  const result = await host.serviceRequest({
    method: 'POST',
    path: copyFile ? '/copy-file' : '/reveal',
    body: JSON.stringify({ path: item.path }),
  });
  const answer: { message?: string } = JSON.parse(result.body);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(answer.message ?? (copyFile ? '无法复制文件，请重试。' : '无法在 Finder 中定位文件，请重试。'));
  }
  await host.toast({ kind: 'success', message: copyFile ? '已复制文件，可在 Finder 中粘贴' : '已在 Finder 中打开' });
});
