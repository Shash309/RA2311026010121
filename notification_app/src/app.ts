import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { NotificationController } from './controllers/notification.controller';
import { requireAuth } from './middleware/auth.middleware';

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send("Server running"));
app.get('/priority', requireAuth, NotificationController.getPriorityInbox);

const PORT = process.env.NOTIFICATION_PORT || 3002;
app.listen(PORT, () => console.log(`Notification App running on port ${PORT}`));

export default app;
