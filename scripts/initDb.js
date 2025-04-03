const mongoose = require('mongoose');
require('dotenv').config();

const createIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Create collections and indexes
        await Promise.all([
            mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true }),
            mongoose.connection.collection('users').createIndex({ "driverDetails.currentLocation": "2dsphere" }),
            
            mongoose.connection.collection('rides').createIndex({ passenger: 1 }),
            mongoose.connection.collection('rides').createIndex({ driver: 1 }),
            mongoose.connection.collection('rides').createIndex({ facility: 1 }),
            mongoose.connection.collection('rides').createIndex({ status: 1 }),
            mongoose.connection.collection('rides').createIndex({ scheduledTime: 1 }),
            mongoose.connection.collection('rides').createIndex({ "pickup.location": "2dsphere" }),
            mongoose.connection.collection('rides').createIndex({ "dropoff.location": "2dsphere" }),
            
            mongoose.connection.collection('locations').createIndex({ user: 1 }),
            mongoose.connection.collection('locations').createIndex({ timestamp: 1 }),
            mongoose.connection.collection('locations').createIndex({ location: "2dsphere" })
        ]);

        console.log('Database initialized successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
};

createIndexes(); 