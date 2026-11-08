import { Router } from 'express';
import { getState, health } from '../controllers/statusController.js';

const router = Router();

router.get('/health', health);
router.get('/api/state', getState);

export default router;
