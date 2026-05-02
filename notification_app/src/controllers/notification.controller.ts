import { Request, Response } from 'express';

export class NotificationController {
    static getPriorityInbox(req: Request, res: Response) {
        res.json({ success: true, message: "Top 10 notifications returned" });
    }
}
