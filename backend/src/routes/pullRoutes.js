import { Router } from 'express';
import { createPull, listPulls, resumePull } from '../controllers/pullController.js';

const router = Router();

router.get('/', listPulls);
router.post('/', createPull);
router.post('/:id/resume', resumePull);

export default router;
