import { Router } from 'express';
import { listTrades } from '../controllers/tradeController.js';

const router = Router();

router.get('/', listTrades);

export default router;
