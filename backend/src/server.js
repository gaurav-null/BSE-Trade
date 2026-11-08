import http from 'node:http';
import { enforceConnectionCap } from '@bse/shared/netcap';
import app from './app.js';
import db from './config/database.js';
import { config } from './config/index.js';
import { pullService } from './services/pullService.js';
import { sseHub } from './services/sseHub.js';

const server = http.createServer(app);
enforceConnectionCap(server, config.capMs, 'api');

server.listen(config.port, async () => {
  console.log(
    `[api] listening on :${config.port} (BSE at ${config.bseUrl}, ` +
      `connection cap ${config.capMs || 'off'} ms, SSE stream max ${config.sseMaxAgeMs} ms)`,
  );
  try {
    await pullService.reconcile(); 
    if (config.autoPullOnStart && !pullService.hasAnyPull()) {
      console.log('[api] empty database - starting the first pull');
      await pullService.start();
    }
  } catch (err) {
    console.error('[api] startup tasks failed', err);
  }
});

function shutdown() {
  sseHub.closeAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
