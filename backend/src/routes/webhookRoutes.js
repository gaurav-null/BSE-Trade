import express, { Router } from 'express';
import { receiveBseWebhook } from '../controllers/webhookController.js';

const router = Router();

router.post('/bse', express.raw({ type: '*/*', limit: '64kb' }), receiveBseWebhook);

export default router;
