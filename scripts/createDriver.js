const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createDriver = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if driver already exists
        const existingDriver = await User.findOne({ email: 'driver@example.com' });
        if (existingDriver) {
            console.log('Driver user already exists:', existingDriver.email);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create driver user
        const driverUser = new User({
            email: 'driver@example.com',
            password: 'password123',
            firstName: 'John',
            lastName: 'Driver',
            phone: '+1234567890',
            userType: 'NEMT',
            profileComplete: true,
            driverDetails: {
                vehicleType: 'Sedan',
                licensePlate: 'ABC123',
                insuranceInfo: 'INS123456',
                isAvailable: true,
                currentLocation: {
                    type: 'Point',
                    coordinates: [-73.935242, 40.730610] // Default location
                }
            }
        });

        await driverUser.save();
        console.log('Driver user created successfully:', {
            email: driverUser.email,
            userType: driverUser.userType
        });

        // Verify the driver user was created
        const createdDriver = await User.findOne({ email: 'driver@example.com' })
            .select('+password')
            .lean();

        console.log('Driver user verification:', {
            found: !!createdDriver,
            email: createdDriver?.email,
            hasPassword: !!createdDriver?.password,
            passwordLength: createdDriver?.password?.length
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error creating driver user:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

createDriver(); 