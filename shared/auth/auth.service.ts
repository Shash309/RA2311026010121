import axios from 'axios';
import { Log } from 'logging_middleware';

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

export const getAccessToken = async (): Promise<string> => {
    // Implement safe expiry buffer
    const BUFFER = 60 * 1000;
    
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - BUFFER) {
        await Log('backend', 'debug', 'AuthService', 'Token is valid, reusing cached token');
        return cachedToken;
    }

    // Add environment variable validation
    const requiredEnv = ['EMAIL', 'NAME', 'ROLL_NO', 'ACCESS_CODE', 'CLIENT_ID', 'CLIENT_SECRET'];
    for (const env of requiredEnv) {
        if (!process.env[env]) {
            throw new Error(`Missing required environment variable: ${env}`);
        }
    }

    try {
        await Log('backend', 'info', 'AuthService', 'Fetching new access token from evaluation service');
        
        const response = await axios.post('http://20.207.122.201/evaluation-service/auth', {
            email: process.env.EMAIL,
            name: process.env.NAME,
            rollNo: process.env.ROLL_NO,
            accessCode: process.env.ACCESS_CODE,
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET
        }, { timeout: 5000 });

        // Correct API response parsing
        const token = response.data.access_token;
        const expiresInMs = response.data.expires_in * 1000;

        if (!token) {
            throw new Error('API returned successfully but access_token was not found.');
        }

        cachedToken = token;
        tokenExpiry = Date.now() + expiresInMs;

        await Log('backend', 'info', 'AuthService', 'Successfully fetched and cached new token');
        return cachedToken!;
    } catch (error: any) {
        // Improve error handling
        const details = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        await Log('backend', 'error', 'AuthService', `Authentication failed: ${details}`);
        throw new Error(`Authentication failed: ${details}`);
    }
};
