import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { 
    getAllUsers, 
    updateUser, 
    deleteUser,
    getUserDetails,
    getUserRides,
    addUserCredit,
    getPricingConfig,
    updatePricingConfig,
    getDashboardStats,
    getAllRides,
    getRideDetails,
    getAvailableDrivers,
    updateUserStatus,
    addRideNote,
    assignDriverToRide,
    updateRideStatus
} from '../controllers/adminController.js';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { PricingConfig } from '../models/PricingConfig.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Ride } from '../models/Ride.js';

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to parse log lines
const parseLogLine = (line) => {
    try {
        return JSON.parse(line);
    } catch (error) {
        console.warn('Warning: Could not parse log line:', line);
        return null;
    }
};

// Helper function to initialize log files
const initializeLogs = async () => {
    const logsDir = path.join(__dirname, '..', 'logs');
    const cleanupLogPath = path.join(logsDir, 'cleanup.log');
    const errorLogPath = path.join(logsDir, 'cleanup-error.log');

    try {
        await fs.promises.mkdir(logsDir, { recursive: true });
        
        // Create files if they don't exist
        await fs.promises.access(cleanupLogPath).catch(() => fs.promises.writeFile(cleanupLogPath, ''));
        await fs.promises.access(errorLogPath).catch(() => fs.promises.writeFile(errorLogPath, ''));
    } catch (error) {
        console.error('Error initializing log files:', error);
        throw error;
    }
};

// Test endpoint
router.get('/test', (req, res) => {
    res.json({ message: 'Admin routes are working' });
});

// Test error endpoint
router.get('/test-error', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        await initializeLogs();
        
        const logsDir = path.join(__dirname, '..', 'logs');
        const errorLogPath = path.join(logsDir, 'cleanup-error.log');
        
        // Generate a test error
        const timestamp = new Date().toISOString();
        const errorLogEntry = JSON.stringify({
            timestamp,
            message: 'Test error for cleanup dashboard',
            error: 'This is a test error',
            stack: 'Test stack trace'
        }) + '\n';
        
        await fs.promises.appendFile(errorLogPath, errorLogEntry);
        
        res.json({ message: 'Test error logged successfully' });
    } catch (error) {
        console.error('Error creating test error log:', error);
        res.status(500).json({ error: 'Failed to create test error log' });
    }
});

// Dashboard Routes
router.get('/dashboard', auth, authorize(['ADMIN']), getDashboardStats);

// User Management Routes
router.get('/users', auth, authorize(['ADMIN']), getAllUsers);
router.get('/users/:id', auth, authorize(['ADMIN']), getUserDetails);
router.get('/users/:id/rides', auth, authorize(['ADMIN']), getUserRides);
router.post('/users/:id/credit', auth, authorize(['ADMIN']), addUserCredit);
router.put('/users/:id', auth, authorize(['ADMIN']), updateUser);
router.delete('/users/:id', auth, authorize(['ADMIN']), deleteUser);

// Ride Management Routes
router.get('/rides', auth, authorize(['ADMIN']), getAllRides);
router.get('/rides/:id', auth, authorize(['ADMIN']), getRideDetails);

// Pricing Configuration Routes
router.get('/pricing-config', auth, authorize(['ADMIN']), getPricingConfig);
router.put('/pricing-config', auth, authorize(['ADMIN']), updatePricingConfig);

// Get cleanup statistics
router.get('/cleanup-stats', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        console.log('Starting cleanup-stats endpoint');
        console.log('User authenticated:', req.user);
        console.log('User role:', req.user.userType);
        await initializeLogs();
        console.log('Logs initialized');

        const logsDir = path.join(__dirname, '..', 'logs');
        const cleanupLogPath = path.join(logsDir, 'cleanup.log');
        const errorLogPath = path.join(logsDir, 'cleanup-error.log');
        
        console.log('Log paths:', { logsDir, cleanupLogPath, errorLogPath });
        
        // Read log files
        let cleanupLogs = '';
        let errorLogs = '';
        
        try {
            console.log('Reading cleanup log');
            cleanupLogs = await fs.promises.readFile(cleanupLogPath, 'utf8');
            console.log('Cleanup log read successfully, length:', cleanupLogs.length);
        } catch (error) {
            console.warn('Warning: Could not read cleanup log:', error.message);
        }
        
        try {
            console.log('Reading error log');
            errorLogs = await fs.promises.readFile(errorLogPath, 'utf8');
            console.log('Error log read successfully, length:', errorLogs.length);
        } catch (error) {
            console.warn('Warning: Could not read error log:', error.message);
        }

        console.log('Parsing cleanup logs');
        // Parse logs into JSON objects
        const cleanupEntries = cleanupLogs
            .split(/\n(?={")/g)
            .filter(line => line.trim())
            .map(parseLogLine)
            .filter(entry => entry !== null);
        console.log('Cleanup entries parsed:', cleanupEntries.length);

        console.log('Parsing error logs');
        const errorEntries = errorLogs
            .split(/\n(?={")/g)
            .filter(line => line.trim())
            .map(parseLogLine)
            .filter(entry => entry !== null);
        console.log('Error entries parsed:', errorEntries.length);

        // Sort entries by timestamp (newest first)
        const sortByTimestamp = (a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
            const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
            return timeB - timeA;
        };
        
        console.log('Sorting entries');
        cleanupEntries.sort(sortByTimestamp);
        errorEntries.sort(sortByTimestamp);

        // Get completed cleanup operations
        console.log('Finding completed cleanups');
        const completedCleanups = cleanupEntries.filter(log => {
            return (
                (log.message && (
                    log.message.includes('Cleanup task completed') ||
                    log.message.includes('Cleanup operation completed') ||
                    log.message.includes('Manual cleanup completed')
                )) ||
                (log.type === 'cleanup_completed')
            );
        });
        console.log('Completed cleanups found:', completedCleanups.length);

        // Get orphaned rides that were deleted
        console.log('Finding orphaned rides');
        const orphanedRides = cleanupEntries
            .filter(log => log.message && log.message.includes('Deleted orphaned ride'))
            .map(log => {
                if (log.message && typeof log.message === 'object') {
                    return {
                        ...log.message,
                        deletedAt: log.timestamp
                    };
                }
                return {
                    rideId: log.rideId || 'Unknown',
                    patientEmail: log.patientEmail || 'N/A',
                    status: log.status || 'Unknown',
                    deletedAt: log.timestamp
                };
            })
            .slice(0, 10); // Get the 10 most recent
        console.log('Orphaned rides found:', orphanedRides.length);

        // Calculate success rate
        console.log('Calculating success rate');
        const totalCleanups = completedCleanups.length;
        const totalErrors = errorEntries.length;
        const successRate = totalCleanups > 0 
            ? ((totalCleanups - totalErrors) / totalCleanups * 100).toFixed(2) + '%' 
            : 'N/A';

        // Get total orphaned rides deleted
        console.log('Calculating total orphaned rides deleted');
        const totalOrphanedRidesDeleted = completedCleanups.reduce((total, cleanup) => {
            if (cleanup.message && typeof cleanup.message === 'object' && cleanup.message.orphanedRidesFound) {
                return total + cleanup.message.orphanedRidesFound;
            }
            return total;
        }, 0);

        // Get recent errors (last 10)
        console.log('Processing recent errors');
        const recentErrors = errorEntries
            .slice(0, 10)
            .map(error => ({
                timestamp: error.timestamp,
                error: error.message || error.error || 'Unknown error',
                stack: error.stack || ''
            }));
        console.log('Recent errors processed:', recentErrors.length);

        console.log('Preparing response');
        const response = {
            totalCleanupsRun: totalCleanups,
            successRate,
            totalOrphanedRidesDeleted,
            lastCleanupTime: completedCleanups.length > 0 ? completedCleanups[0].timestamp : null,
            recentOrphanedRides: orphanedRides,
            recentErrors
        };
        
        console.log('Sending response');
        res.json(response);
    } catch (error) {
        console.error('Error getting cleanup stats:', error);
        
        // Log the error to the cleanup-error.log file
        try {
            const timestamp = new Date().toISOString();
            const errorLogPath = path.join(__dirname, '..', 'logs', 'cleanup-error.log');
            const errorLogEntry = JSON.stringify({
                timestamp,
                message: 'Error in cleanup-stats endpoint',
                error: error.message,
                stack: error.stack
            }) + '\n';
            
            await fs.promises.appendFile(errorLogPath, errorLogEntry);
        } catch (logError) {
            console.error('Failed to write to error log:', logError);
        }
        
        res.status(500).json({ error: 'Failed to get cleanup statistics' });
    }
});

// Get current pricing configuration (admin only)
router.get('/pricing-config', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        const config = await PricingConfig.getConfig();
        res.json(config);
    } catch (error) {
        winston.error('Error fetching pricing config:', error);
        res.status(500).json({ error: 'Failed to fetch pricing configuration' });
    }
});

// Update pricing configuration (admin only)
router.put('/pricing-config', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        const updatedConfig = await PricingConfig.findOneAndUpdate(
            {}, // empty filter to match any document
            {
                ...req.body,
                updatedBy: req.user._id,
                lastUpdated: new Date()
            },
            {
                new: true, // return the updated document
                upsert: true, // create if doesn't exist
                runValidators: true // run schema validators
            }
        );

        res.json(updatedConfig);
    } catch (error) {
        winston.error('Error updating pricing config:', error);
        res.status(500).json({ error: 'Failed to update pricing configuration' });
    }
});

// Add admin-specific routes here
router.get('/dashboard', auth, authorize(['ADMIN']), (req, res) => {
    res.json({ message: 'Admin dashboard' });
});

// Add routes for admin actions
router.put('/users/:id/status', auth, authorize(['ADMIN']), updateUserStatus);
router.post('/rides/:id/notes', auth, authorize(['ADMIN']), addRideNote);
router.post('/rides/:id/assign-driver', auth, authorize(['ADMIN']), assignDriverToRide);
router.put('/rides/:id/status', auth, authorize(['ADMIN']), updateRideStatus);
router.get('/drivers/available', auth, authorize(['ADMIN']), getAvailableDrivers);

// Run manual cleanup
router.post('/run-cleanup', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        await initializeLogs();
        
        const logsDir = path.join(__dirname, '..', 'logs');
        const cleanupLogPath = path.join(logsDir, 'cleanup.log');
        const errorLogPath = path.join(logsDir, 'cleanup-error.log');
        
        // Find orphaned rides (rides with status 'pending' that are older than 24 hours)
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        
        const orphanedRides = await Ride.find({
            status: 'pending',
            createdAt: { $lt: twentyFourHoursAgo }
        });
        
        // Delete orphaned rides
        const deleteResults = await Ride.deleteMany({
            status: 'pending',
            createdAt: { $lt: twentyFourHoursAgo }
        });
        
        // Log the cleanup
        const timestamp = new Date().toISOString();
        const logEntry = JSON.stringify({
            timestamp,
            message: 'Manual cleanup executed',
            deletedCount: deleteResults.deletedCount,
            orphanedRides: orphanedRides.map(ride => ({
                id: ride._id,
                createdAt: ride.createdAt
            }))
        }) + '\n';
        
        await fs.promises.appendFile(cleanupLogPath, logEntry);
        
        return res.status(200).json({
            success: true,
            timestamp,
            deletedCount: deleteResults.deletedCount,
            message: `Successfully deleted ${deleteResults.deletedCount} orphaned rides`
        });
    } catch (error) {
        console.error('Error running manual cleanup:', error);
        
        // Log the error to the cleanup-error.log file
        const timestamp = new Date().toISOString();
        const errorLogEntry = JSON.stringify({
            timestamp,
            message: 'Error running manual cleanup',
            error: error.message,
            stack: error.stack
        }) + '\n';
        
        try {
            await fs.promises.appendFile(errorLogPath, errorLogEntry);
        } catch (logError) {
            console.error('Failed to write to error log:', logError);
        }
        
        return res.status(500).json({ error: 'Failed to run manual cleanup' });
    }
});

export default router; 