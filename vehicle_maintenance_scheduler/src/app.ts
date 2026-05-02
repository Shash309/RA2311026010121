import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { SchedulerController } from './controllers/scheduler.controller';

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send("Server running"));
app.get('/schedule', SchedulerController.scheduleTasks);
app.post('/schedule', SchedulerController.scheduleTasks);

const PORT = process.env.SCHEDULER_PORT || 3001;
app.listen(PORT, () => console.log(`Vehicle Maintenance Scheduler running on port ${PORT}`));

export default app;
