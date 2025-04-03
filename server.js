import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import { setupSocket } from './src/config/socket.js';
import { errorHandler } from './src/middleware/error.js';
import { securityMiddleware } from './src/middleware/security.js';
import { limiter, authLimiter } from './src/middleware/rateLimiter.js';
import { morganMiddleware, requestLogger, errorLogger } from './src/middleware/logger.js';
import { scheduleCleanup } from './src/tasks/scheduledCleanup.js';
import cron from 'node-cron';
import winston from 'winston';
import app from './app.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Configure dotenv
dotenv.config();

// Create a logger for cleanup tasks
const cleanupLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'cleanup.log' })
    ]
});

const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',  // Development
            'https://okada-ride-frontend.vercel.app'  // Production
        ];
        
        // Reject requests without origin header
        if (!origin) {
            return callback(new Error('Origin header is required'), false);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature'],
    optionsSuccessStatus: 200
};

// Setup socket server with authentication
const io = setupSocket(server, corsOptions);

// Add Socket.IO methods
io.newRide = (ride) => {
    if (!ride) return;
    console.log('Broadcasting new ride to drivers:', { rideId: ride._id });
    io.to('drivers').emit('newRide', ride);
};

io.rideUpdate = (rideId, update) => {
    if (!rideId || !update) return;
    console.log('Emitting ride update:', { rideId, update });
    io.to(`ride:${rideId}`).emit('rideUpdate', update);
    io.to('drivers').emit('rideUpdate', update);
};

io.rideStatusChange = (rideId, status, userId) => {
    if (!rideId || !status) return;
    console.log('Emitting ride status change:', { rideId, status, userId });
    io.to(`ride:${rideId}`).emit('rideStatusChange', { rideId, status });
    io.to('drivers').emit('rideStatusChange', { rideId, status });
    if (userId) {
        io.to(`user:${userId}`).emit('rideStatusChange', { rideId, status });
    }
};

// Attach io to app for use in routes
app.set('io', io);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('MongoDB connected');
    
    // Schedule daily cleanup at midnight
    cron.schedule('0 0 * * *', async () => {
        try {
            cleanupLogger.info('Starting scheduled cleanup task');
            const { cleanupOrphanedRides } = require('./tasks/scheduledCleanup');
            const result = await cleanupOrphanedRides();
            cleanupLogger.info('Scheduled cleanup completed', result);
        } catch (error) {
            cleanupLogger.error('Scheduled cleanup failed', {
                error: error.message,
                stack: error.stack
            });
        }
    });
    
    console.log('Scheduled cleanup task initialized');
})
.catch(err => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 5010;

// Start server with debug info
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Frontend URL:', process.env.FRONTEND_URL || "http://localhost:3000");
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! 💥 Shutting down...');
    console.log(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.log(err.name, err.message);
    process.exit(1);
}); 