const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
require('dotenv').config();

const cleanupRides = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Run the cleanup
        const deletedCount = await Ride.cleanupOrphanedRides();
        
        console.log('Cleanup completed:', {
            deletedRides: deletedCount
        });

        process.exit(0);
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
};

cleanupRides(); 