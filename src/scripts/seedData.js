const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Ride = require('../models/Ride');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Clear existing data
        await Promise.all([
            User.deleteMany({}),
            Ride.deleteMany({})
        ]);

        // Create sample users
        const hashedPassword = await bcrypt.hash('password123', 8);

        const users = await User.create([
            {
                email: 'patient@example.com',
                password: hashedPassword,
                firstName: 'John',
                lastName: 'Doe',
                phone: '1234567890',
                userType: 'PATIENT',
                profileComplete: true
            },
            {
                email: 'driver@example.com',
                password: hashedPassword,
                firstName: 'Jane',
                lastName: 'Smith',
                phone: '0987654321',
                userType: 'NEMT',
                profileComplete: true,
                driverDetails: {
                    vehicleType: 'Wheelchair Van',
                    licensePlate: 'ABC123',
                    insuranceInfo: 'INS123456',
                    isAvailable: true,
                    currentLocation: {
                        type: 'Point',
                        coordinates: [-87.6298, 41.8781] // Chicago coordinates
                    }
                }
            },
            {
                email: 'facility@example.com',
                password: hashedPassword,
                firstName: 'Medical',
                lastName: 'Center',
                phone: '5555555555',
                userType: 'FACILITY',
                profileComplete: true,
                facilityDetails: {
                    facilityName: 'Chicago Medical Center',
                    facilityType: 'Hospital',
                    address: '123 Medical Dr, Chicago, IL',
                    licenseNumber: 'MED789012'
                }
            }
        ]);

        // Create sample rides
        const rides = await Ride.create([
            {
                passenger: users[0]._id,
                driver: users[1]._id,
                facility: users[2]._id,
                pickup: {
                    address: '456 Main St, Chicago, IL',
                    location: {
                        type: 'Point',
                        coordinates: [-87.6298, 41.8781]
                    }
                },
                dropoff: {
                    address: '123 Medical Dr, Chicago, IL',
                    location: {
                        type: 'Point',
                        coordinates: [-87.6298, 41.8781]
                    }
                },
                status: 'completed',
                scheduledTime: new Date(),
                price: 45.00,
                distance: 5.2,
                duration: 15,
                paymentStatus: 'completed',
                specialRequirements: {
                    wheelchair: true,
                    medicalEquipment: false,
                    assistanceRequired: true
                }
            },
            {
                passenger: users[0]._id,
                pickup: {
                    address: '789 Oak St, Chicago, IL',
                    location: {
                        type: 'Point',
                        coordinates: [-87.6298, 41.8781]
                    }
                },
                dropoff: {
                    address: '123 Medical Dr, Chicago, IL',
                    location: {
                        type: 'Point',
                        coordinates: [-87.6298, 41.8781]
                    }
                },
                status: 'pending',
                scheduledTime: new Date(Date.now() + 86400000), // Tomorrow
                price: 35.00,
                distance: 3.8,
                duration: 12,
                paymentStatus: 'pending',
                specialRequirements: {
                    wheelchair: false,
                    medicalEquipment: true,
                    assistanceRequired: false
                }
            }
        ]);

        console.log('Sample data created successfully');
        console.log('Sample Users:', users.map(u => ({ email: u.email, type: u.userType })));
        console.log('Sample Rides:', rides.map(r => ({ status: r.status, price: r.price })));
        
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData(); 