const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
require('dotenv').config();

const seedRides = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Clear existing rides
        await Ride.deleteMany({});
        
        // Get a patient user for reference
        const patient = await User.findOne({ userType: 'Patient' });
        
        if (!patient) {
            throw new Error('No patient user found. Please run seedUsers.js first.');
        }

        // Create test rides
        const rides = await Ride.create([
            {
                patient: patient._id,
                status: 'pending',
                pickup: {
                    address: '123 Main St',
                    location: {
                        type: 'Point',
                        coordinates: [-73.935242, 40.730610]
                    }
                },
                dropoff: {
                    address: '456 Park Ave',
                    location: {
                        type: 'Point',
                        coordinates: [-73.935242, 40.730610]
                    }
                },
                scheduledTime: new Date(),
                specialRequirements: {
                    wheelchair: false,
                    assistance: true
                }
            },
            {
                patient: patient._id,
                status: 'pending',
                pickup: {
                    address: '789 Broadway',
                    location: {
                        type: 'Point',
                        coordinates: [-73.945242, 40.740610]
                    }
                },
                dropoff: {
                    address: '321 5th Ave',
                    location: {
                        type: 'Point',
                        coordinates: [-73.955242, 40.750610]
                    }
                },
                scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
                specialRequirements: {
                    wheelchair: true,
                    assistance: true
                }
            }
        ]);

        console.log('Test rides created:', rides.length);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding rides:', error);
        process.exit(1);
    }
};

seedRides(); 