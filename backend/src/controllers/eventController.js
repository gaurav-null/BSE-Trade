import { sseHub } from '../services/sseHub.js';
export const streamEvents = (req, res) => sseHub.connect(req, res);
