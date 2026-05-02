import { apiClient } from '../api/client';
import { Log } from 'logging_middleware';
import fs from 'fs';
import path from 'path';

interface Task {
    taskId: string;
    duration: number;
    impact: number;
}

interface Depot {
    depotId: string;
    capacity: number;
}

export class KnapsackService {
    static async scheduleTasks() {
        try {
            await Log('backend', 'info', 'KnapsackService', 'Starting task scheduling process');
            
            // 1. Fetch data
            const depotsResponse = await apiClient.get('/depots');
            const vehiclesResponse = await apiClient.get('/vehicles');
            
            // Map the API data structure safely based on actual inspection
            const rawDepots = depotsResponse.data.depots || depotsResponse.data;
            const depots: Depot[] = Array.isArray(rawDepots) ? rawDepots.map((d: any) => ({
                depotId: d.ID?.toString() || d.DepotID || d.id || `depot-${Math.random()}`,
                capacity: Number(d.MechanicHours || d.Capacity || d.capacity || 0)
            })) : [];

            // Extract tasks from the vehicles payload
            let taskList: Task[] = [];
            const rawVehicles = vehiclesResponse.data.vehicles || vehiclesResponse.data;
            if (Array.isArray(rawVehicles)) {
                taskList = rawVehicles.map((v: any) => ({
                    taskId: v.TaskID || v.taskId || v.id || `task-${Math.random()}`,
                    duration: Number(v.Duration || v.duration || 0),
                    impact: Number(v.Impact || v.impact || 0)
                }));
            }
            
            await Log('backend', 'info', 'KnapsackService', `Fetched ${depots.length} depots and ${taskList.length} tasks`);

            // 2 & 3. Process data & Apply 0/1 Knapsack
            const results = [];
            
            for (const depot of depots) {
                const capacity = Math.floor(depot.capacity);
                const n = taskList.length;
                
                // DP array storing max impact for a given capacity
                const dp = new Array(capacity + 1).fill(0);
                const itemSelected = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(false));
                
                for (let i = 0; i < n; i++) {
                    const task = taskList[i];
                    // Make sure weight is integer for index array bounds
                    const w = Math.ceil(task.duration);
                    const v = task.impact;
                    
                    for (let j = capacity; j >= w; j--) {
                        if (dp[j - w] + v > dp[j]) {
                            dp[j] = dp[j - w] + v;
                            itemSelected[i + 1][j] = true;
                        }
                    }
                }
                
                let currentCapacity = capacity;
                const selectedTasks = [];
                let totalDuration = 0;
                
                for (let i = n; i > 0; i--) {
                    if (itemSelected[i][currentCapacity]) {
                        const task = taskList[i - 1];
                        selectedTasks.push(task.taskId);
                        totalDuration += task.duration; // Use actual duration for the result sum
                        currentCapacity -= Math.ceil(task.duration);
                    }
                }
                
                results.push({
                    depotId: depot.depotId,
                    selectedTasks,
                    totalDuration,
                    totalImpact: dp[capacity]
                });
            }
            
            // 4. Save output
            const outputDir = path.resolve(__dirname, '../../outputs');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const outputPath = path.join(outputDir, 'scheduler-results.json');
            fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
            
            await Log('backend', 'info', 'KnapsackService', `Successfully saved results to ${outputPath}`);
            
            return results;
        } catch (error: any) {
            await Log('backend', 'error', 'KnapsackService', `Scheduling failed: ${error.message}`);
            throw error;
        }
    }
}
