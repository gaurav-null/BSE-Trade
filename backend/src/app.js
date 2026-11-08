import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { config } from './config/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import eventRoutes from './routes/eventRoutes.js';
import routes from './routes/index.js';

const app = express();
app.disable('x-powered-by');

app.use('/api/events', eventRoutes);

app.use(compression());
app.use(routes);

if (fs.existsSync(path.join(config.frontendDist, 'index.html'))) {
  app.use(express.static(config.frontendDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
}

app.use(errorHandler);

export default app;
