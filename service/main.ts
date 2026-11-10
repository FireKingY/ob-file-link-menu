import { createFileLinkServer } from './server';

const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
if (!token || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('请从 OpenChamber 启动此扩展。');
}
createFileLinkServer(token).listen(port, '127.0.0.1');
