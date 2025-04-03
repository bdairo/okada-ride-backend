import mongoose from 'mongoose';
import { Ride } from '../models/Ride.js';
import { User } from '../models/User.js';
import winston from 'winston';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Configure dotenv
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const initializeLogs = async () => {
    const logsDir = path.join(__dirname, '../logs');
    const cleanupLogPath = path.join(logsDir, 'cleanup.log');
    const errorLogPath = path.join(logsDir, 'cleanup-error.log');

    try {
        await fs.mkdir(logsDir, { recursive: true });
        await fs.access(cleanupLogPath).catch(() => fs.writeFile(cleanupLogPath, ''));
        await fs.access(errorLogPath).catch(() => fs.writeFile(errorLogPath, ''));
    } catch (error) {
        console.error('Error initializing log files:', error);
    }
};

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/cleanup-error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/cleanup.log')
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

export const cleanupOrphanedRides = async () => {
    try {
        await initializeLogs();
        
        if (!mongoose.connection.readyState) {
            await mongoose.connect(process.env.MONGODB_URI);
            logger.info('Connected to MongoDB for cleanup task');
        }

        // Get all rides with their associated users
        const rides = await Ride.find({})
            .populate('patient', '_id email')
            .lean();

        logger.info('Found rides for cleanup check', {
            totalRides: rides.length
        });

        let deletedCount = 0;
        let orphanedRides = [];

        for (const ride of rides) {
            try {
                const patientExists = ride.patient && await User.exists({ _id: ride.patient._id });

                if (!patientExists) {
                    const orphanedRide = {
                        rideId: ride._id,
                        status: ride.status,
                        patientId: ride.patient?._id,
                        patientEmail: ride.patient?.email,
                        createdAt: ride.createdAt,
                        scheduledTime: ride.scheduledTime
                    };

                    orphanedRides.push(orphanedRide);
                    await Ride.deleteOne({ _id: ride._id });
                    deletedCount++;

                    logger.info('Deleted orphaned ride', orphanedRide);
                }
            } catch (err) {
                logger.error('Error processing ride', {
                    rideId: ride._id,
                    error: err.message,
                    stack: err.stack
                });
            }
        }

        const summary = {
            timestamp: new Date(),
            totalRidesChecked: rides.length,
            orphanedRidesFound: deletedCount,
            orphanedRides
        };

        logger.info('Cleanup task completed', summary);
        return summary;
    } catch (error) {
        logger.error('Cleanup task failed', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

export const scheduleCleanup = () => {
    const runCleanup = async () => {
        try {
            logger.info('Starting scheduled cleanup task');
            const result = await cleanupOrphanedRides();
            logger.info('Scheduled cleanup completed', result);
        } catch (error) {
            logger.error('Scheduled cleanup failed', {
                error: error.message,
                stack: error.stack
            });
        }
    };

    // Calculate time until next midnight
    const now = new Date();
    const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0
    );
    const timeUntilMidnight = nextMidnight - now;

    // Schedule first run at next midnight
    setTimeout(() => {
        runCleanup();
        // Then run every 24 hours
        setInterval(runCleanup, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);

    logger.info('Cleanup task scheduled', {
        nextRun: nextMidnight,
        timeUntilNextRun: timeUntilMidnight
    });
}; 