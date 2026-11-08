import { Router } from 'express';
import pullRoutes from './pullRoutes.js';
import statusRoutes from './statusRoutes.js';
import tradeRoutes from './tradeRoutes.js';
import webhookRoutes from './webhookRoutes.js';

const router = Router();

router.use(statusRoutes); 
router.use('/api/trades', tradeRoutes); 
router.use('/api/pulls', pullRoutes); 
router.use('/webhooks', webhookRoutes); 
export default router;
