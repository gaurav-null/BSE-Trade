import { config } from '../config/index.js';
import { eventBus } from './eventBus.js';
import { pullService } from './pullService.js';

const clients = new Set();

const frame = ({ id, type, data }) => `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`;

eventBus.on('event', (ev) => {
  const payload = frame(ev);
  for (const client of clients) client.res.write(payload);
});


function connect(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', 
  });
  res.socket?.setNoDelay(true);
  res.write(`retry: ${config.sseRetryMs}\n\n`);


  const raw = req.get('last-event-id') ?? req.query.lastEventId;
  const lastId = raw === undefined || raw === '' ? NaN : Number(raw);
  if (Number.isFinite(lastId)) {
    for (const ev of eventBus.since(lastId)) res.write(frame(ev));
  }

  res.write(`event: state\ndata: ${JSON.stringify(pullService.state())}\n\n`);

  const client = { res };
  clients.add(client);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), config.sseHeartbeatMs);
  const retire = setTimeout(() => {
    res.write('event: bye\ndata: {}\n\n'); 
    res.end();
  }, config.sseMaxAgeMs);

  res.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(retire);
    clients.delete(client);
  });
}

export const sseHub = {
  connect,
  size: () => clients.size,
  closeAll() {
    for (const { res } of clients) res.end();
  },
};
