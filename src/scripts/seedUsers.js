const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const users = [
    {
        email: 'driver@example.com',
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+11234567890',
        userType: 'NEMT',
        profileComplete: true,
        driverDetails: {
            currentLocation: {
                type: 'Point',
                coordinates: [-73.935242, 40.730610]
            },
            vehicleType: 'Sedan',
            licensePlate: 'ABC123',
            isAvailable: true
        }
    },
    {
        email: 'patient@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+12345678901',
        userType: 'Patient',
        profileComplete: true
    },
    {
        email: 'facility@example.com',
        password: 'password123',
        firstName: 'Medical',
        lastName: 'Center',
        phone: '+13456789012',
        userType: 'Facility',
        profileComplete: true
    }
];

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Clear existing users
        await User.deleteMany({});
        console.log('Cleared existing users');

        // Create users
        const createdUsers = await User.create(users);
        console.log('Users seeded successfully:', createdUsers.map(user => ({
            email: user.email,
            hasPassword: !!user.password,
            userType: user.userType
        })));

        // Verify password works for patient@example.com
        const verifyUser = await User.findOne({ email: 'patient@example.com' }).select('+password');
        if (!verifyUser) {
            console.error('User patient@example.com not found after seeding');
        } else {
            const passwordWorks = await verifyUser.comparePassword('password123');
            console.log('Password verification for patient@example.com:', {
                works: passwordWorks,
                hashedLength: verifyUser.password.length
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding users:', error);
        process.exit(1);
    }
};

seedUsers(); 