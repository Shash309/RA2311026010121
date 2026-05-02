import axios from 'axios';
import { Log } from 'logging_middleware';
import { getAccessToken } from '../../../shared/auth/auth.service';

export const apiClient = axios.create({
    baseURL: 'http://20.207.122.201/evaluation-service',
    timeout: 5000
});

apiClient.interceptors.request.use(async (config: any) => {
    config.metadata = { startTime: Date.now() };
    config.__retryCount = config.__retryCount || 0;
    
    const token = await getAccessToken();
    config.headers.Authorization = `Bearer ${token}`;
    
    return config;
});

apiClient.interceptors.response.use(
    async (res) => {
        // Validate API Response (Console log as requested for validation phase)
        if (process.env.NODE_ENV === 'development') {
            console.log('Scheduler API Response Validation:', res.data);
        }

        const duration = Date.now() - (res.config as any).metadata.startTime;
        await Log('backend', 'info', 'SchedulerApiClient', `API ${res.config.url} took ${duration}ms`);
        return res;
    },
    async (err) => {
        const config = err.config;
        if (!config || config.__retryCount >= 3) {
            await Log('backend', 'error', 'SchedulerApiClient', `Request failed permanently: ${err.message}`);
            return Promise.reject(err);
        }

        config.__retryCount += 1;
        await Log('backend', 'warn', 'SchedulerApiClient', `Retrying request to ${config.url}... attempt ${config.__retryCount}`);
        return apiClient(config);
    }
);
