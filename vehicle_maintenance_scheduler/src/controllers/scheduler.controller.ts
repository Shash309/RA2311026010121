import { Request, Response } from 'express';
import { KnapsackService } from '../services/knapsack.service';
import { Log } from 'logging_middleware';

export class SchedulerController {
    static async scheduleTasks(req: Request, res: Response) {
        try {
            const results = await KnapsackService.scheduleTasks();
            res.status(200).json({
                success: true,
                message: "Scheduler executed successfully",
                data: results
            });
        } catch (error: any) {
            await Log('backend', 'error', 'SchedulerController', `Failed to schedule tasks: ${error.message}`);
            res.status(500).json({
                success: false,
                message: "Internal Server Error",
                error: error.message
            });
        }
    }
}
