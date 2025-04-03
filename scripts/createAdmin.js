const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdmin = async () => {
    try {
        // Connect to MongoDB using environment variable
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Error: MONGODB_URI must be set in .env file');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ userType: 'ADMIN' });
        if (existingAdmin) {
            console.log('Admin user already exists:', existingAdmin.email);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Validate required environment variables
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file');
            await mongoose.disconnect();
            process.exit(1);
        }

        console.log('Creating admin user:', {
            email: adminEmail,
            passwordLength: adminPassword.length
        });

        // Create admin user - let the User model handle password hashing
        const adminUser = new User({
            email: adminEmail,
            password: adminPassword, // Will be hashed by the pre-save middleware
            firstName: 'Admin',
            lastName: 'User',
            phone: '+1234567890',
            userType: 'ADMIN',
            profileComplete: true
        });

        await adminUser.save();
        console.log('Admin user created successfully:', {
            email: adminUser.email,
            userType: adminUser.userType
        });

        // Verify the admin user was created
        const createdAdmin = await User.findOne({ email: adminEmail })
            .select('+password')
            .lean();

        console.log('Admin user verification:', {
            found: !!createdAdmin,
            email: createdAdmin?.email,
            hasPassword: !!createdAdmin?.password,
            passwordLength: createdAdmin?.password?.length
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin user:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

createAdmin(); 