const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        // Create indexes for geospatial queries
        await Promise.all([
            mongoose.connection.collection('users').createIndex({ "driverDetails.currentLocation": "2dsphere" }),
            mongoose.connection.collection('rides').createIndex({ "pickup.location": "2dsphere" }),
            mongoose.connection.collection('rides').createIndex({ "dropoff.location": "2dsphere" }),
            mongoose.connection.collection('locations').createIndex({ "location": "2dsphere" })
        ]);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB; 