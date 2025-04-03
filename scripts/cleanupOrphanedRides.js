const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

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
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

const cleanupOrphanedRides = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Starting cleanup operation', {
            type: 'cleanup_start',
            timestamp: new Date().toISOString()
        });

        const rides = await mongoose.connection.collection('rides').find({}).toArray();
        
        logger.info('Scanning rides', {
            type: 'cleanup_progress',
            totalRides: rides.length,
            timestamp: new Date().toISOString()
        });

        const orphanedRides = [];
        const deletedRides = [];
        let errorCount = 0;

        for (const ride of rides) {
            try {
                if (!ride.patient) {
                    const orphanedRide = {
                        rideId: ride._id.toString(),
                        status: ride.status,
                        patientId: null,
                        createdAt: ride.createdAt,
                        scheduledTime: ride.scheduledTime
                    };
                    
                    logger.info('Found ride with missing patient ID', {
                        type: 'orphaned_ride_found',
                        ride: orphanedRide,
                        timestamp: new Date().toISOString()
                    });

                    orphanedRides.push(orphanedRide);
                    await mongoose.connection.collection('rides').deleteOne({ _id: ride._id });
                    deletedRides.push(ride._id.toString());
                    continue;
                }

                const patientExists = await mongoose.connection.collection('users').findOne({ _id: ride.patient });
                
                if (!patientExists) {
                    const orphanedRide = {
                        rideId: ride._id.toString(),
                        status: ride.status,
                        patientId: ride.patient.toString(),
                        createdAt: ride.createdAt,
                        scheduledTime: ride.scheduledTime
                    };

                    logger.info('Found ride with non-existent patient', {
                        type: 'orphaned_ride_found',
                        ride: orphanedRide,
                        timestamp: new Date().toISOString()
                    });

                    orphanedRides.push(orphanedRide);
                    await mongoose.connection.collection('rides').deleteOne({ _id: ride._id });
                    deletedRides.push(ride._id.toString());
                }
            } catch (err) {
                errorCount++;
                logger.error('Error processing ride', {
                    type: 'cleanup_error',
                    rideId: ride._id.toString(),
                    error: err.message,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                });
            }
        }

        const summary = {
            type: 'cleanup_completed',
            timestamp: new Date().toISOString(),
            totalRidesChecked: rides.length,
            orphanedRidesFound: orphanedRides.length,
            deletedRides: deletedRides.length,
            errorCount,
            orphanedRides: orphanedRides.map(ride => ({
                rideId: ride.rideId,
                status: ride.status,
                patientId: ride.patientId,
                createdAt: new Date(ride.createdAt).toISOString(),
                scheduledTime: ride.scheduledTime ? new Date(ride.scheduledTime).toISOString() : null
            }))
        };

        logger.info('Cleanup operation completed', summary);

        // Print summary to console
        console.log('\nCleanup Summary:');
        console.log('----------------');
        console.log(`Total rides checked: ${rides.length}`);
        console.log(`Orphaned rides found: ${orphanedRides.length}`);
        console.log(`Rides deleted: ${deletedRides.length}`);
        console.log(`Errors encountered: ${errorCount}`);

        if (orphanedRides.length > 0) {
            console.log('\nOrphaned Rides Details:');
            console.log('----------------------');
            orphanedRides.forEach(ride => {
                console.log(`
Ride ID: ${ride.rideId}
Status: ${ride.status}
Patient ID: ${ride.patientId || 'Not found'}
Created: ${new Date(ride.createdAt).toLocaleString()}
Scheduled: ${ride.scheduledTime ? new Date(ride.scheduledTime).toLocaleString() : 'Not scheduled'}
------------------------`);
            });
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        logger.error('Cleanup operation failed', {
            type: 'cleanup_failed',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        console.error('Error during cleanup:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

cleanupOrphanedRides(); 