import { Router } from 'express';
import { streamEvents } from '../controllers/eventController.js';

const router = Router();

router.get('/', streamEvents);

export default router;
