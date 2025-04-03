const mongoose = require('mongoose');
require('dotenv').config();

const checkRide = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Get the ride details
        const ride = await mongoose.connection.collection('rides').findOne({
            _id: new mongoose.Types.ObjectId('67b6b8c8cca6ad1f2a43a386')
        });

        if (!ride) {
            console.log('Ride not found');
            process.exit(1);
        }

        console.log('Ride details:', {
            id: ride._id,
            patientId: ride.patient,
            status: ride.status
        });
        
        // Get both users' details
        const ridePatient = await mongoose.connection.collection('users').findOne({
            _id: ride.patient
        });
        
        const currentUser = await mongoose.connection.collection('users').findOne({
            _id: new mongoose.Types.ObjectId('67b918956ecdd4804a4e0c32')
        });

        console.log('Ride Patient:', ridePatient ? {
            id: ridePatient._id,
            email: ridePatient.email,
            userType: ridePatient.userType
        } : 'Not found');

        console.log('Current User:', currentUser ? {
            id: currentUser._id,
            email: currentUser.email,
            userType: currentUser.userType
        } : 'Not found');

        process.exit(0);
    } catch (error) {
        console.error('Error checking users:', error);
        process.exit(1);
    }
};

checkRide(); 