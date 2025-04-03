const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const PricingConfig = require('../models/PricingConfig');
require('dotenv').config();

const calculateFare = (ride, pricingConfig) => {
    try {
        // Validate required coordinates
        if (!ride.pickup?.location?.coordinates || !ride.dropoff?.location?.coordinates) {
            throw new Error('Missing coordinates for fare calculation');
        }

        // Calculate distance in miles
        const distance = calculateDistance(
            ride.pickup.location.coordinates,
            ride.dropoff.location.coordinates
        );

        // Ensure all numeric values are valid
        const baseFare = Number(pricingConfig.baseFare) || 0;
        const perMileRate = Number(pricingConfig.perMileRate) || 0;
        const distanceCharge = Number((distance * perMileRate).toFixed(2));

        // Initialize additional fees array
        let additionalFees = [];

        // Check for night hours (10 PM - 6 AM)
        const rideTime = new Date(ride.scheduledTime);
        const hour = rideTime.getHours();
        if (hour >= 22 || hour < 6) {
            const nightCharge = Number(pricingConfig.additionalFees.nightCharge) || 0;
            if (nightCharge > 0) {
                additionalFees.push({
                    name: 'Night Hours Charge',
                    amount: nightCharge
                });
            }
        }

        // Check for peak hours (7-9 AM and 4-7 PM on weekdays)
        const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
        const isWeekday = rideTime.getDay() >= 1 && rideTime.getDay() <= 5;
        if (isPeakHour && isWeekday) {
            const peakCharge = Number(pricingConfig.additionalFees.peakHourCharge) || 0;
            if (peakCharge > 0) {
                additionalFees.push({
                    name: 'Peak Hour Charge',
                    amount: peakCharge
                });
            }
        }

        // Check for holidays
        if (isPublicHoliday(rideTime)) {
            const holidayCharge = Number(pricingConfig.additionalFees.holidayCharge) || 0;
            if (holidayCharge > 0) {
                additionalFees.push({
                    name: 'Holiday Charge',
                    amount: holidayCharge
                });
            }
        }

        // Calculate total additional fees
        const totalAdditionalFees = additionalFees.reduce((sum, fee) => sum + Number(fee.amount), 0);

        // Calculate subtotal
        const subtotal = Number((baseFare + distanceCharge + totalAdditionalFees).toFixed(2));

        // Apply minimum fare if necessary
        const minimumFare = Number(pricingConfig.minimumFare) || 0;
        const total = Math.max(subtotal, minimumFare);

        return {
            total: total,
            subtotal: subtotal,
            breakdown: {
                baseFare: {
                    name: 'Base Fare',
                    amount: baseFare
                },
                distance: {
                    name: 'Distance Charge',
                    amount: distanceCharge,
                    details: `${distance.toFixed(1)} miles at $${perMileRate}/mile`
                },
                additionalFees
            },
            minimumFareApplied: total > subtotal
        };
    } catch (error) {
        console.error('Error calculating fare:', error);
        return null;
    }
};

const calculateDistance = (start, end) => {
    const R = 3959; // Earth's radius in miles
    const lat1 = toRadians(start[1]);
    const lat2 = toRadians(end[1]);
    const deltaLat = toRadians(end[1] - start[1]);
    const deltaLon = toRadians(end[0] - start[0]);

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const toRadians = (degrees) => {
    return degrees * Math.PI / 180;
};

const isPublicHoliday = (date) => {
    const month = date.getMonth();
    const day = date.getDate();
    
    // Major US holidays (simplified)
    const holidays = [
        { month: 0, day: 1 },    // New Year's Day
        { month: 6, day: 4 },    // Independence Day
        { month: 11, day: 25 },  // Christmas
    ];

    return holidays.some(holiday => 
        holiday.month === month && holiday.day === day
    );
};

const updateRidesWithFares = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB successfully');

        // Get pricing configuration
        const pricingConfig = await PricingConfig.getConfig();
        console.log('Retrieved pricing configuration:', pricingConfig);

        // Find all rides with explicit lean() and no conditions
        console.log('Querying all rides...');
        const rides = await Ride.find().setOptions({ skipFilters: true }).lean();
        console.log(`Found ${rides.length} total rides in database`);
        console.log('Ride IDs:', rides.map(ride => ride._id));

        let updatedCount = 0;
        let errorCount = 0;

        // Update each ride with calculated fare
        for (const ride of rides) {
            try {
                console.log(`\nProcessing ride ${ride._id}`);
                console.log('Ride status:', ride.status);
                console.log('Ride coordinates:', {
                    pickup: ride.pickup?.location?.coordinates,
                    dropoff: ride.dropoff?.location?.coordinates
                });

                if (!ride.pickup?.location?.coordinates || !ride.dropoff?.location?.coordinates) {
                    console.log(`Skipping ride ${ride._id} - Missing location coordinates`);
                    continue;
                }

                const fareDetails = calculateFare(ride, pricingConfig);
                console.log('Calculated fare:', fareDetails);
                
                if (fareDetails) {
                    await Ride.updateOne(
                        { _id: ride._id },
                        { $set: { fare: fareDetails } }
                    );
                    updatedCount++;
                    console.log(`Updated fare for ride ${ride._id}`);
                } else {
                    console.log(`Skipping ride ${ride._id} - Could not calculate fare`);
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
                console.error(`Error updating ride ${ride._id}:`, error);
            }
        }

        console.log('\nMigration Summary:');
        console.log(`Total rides in database: ${rides.length}`);
        console.log(`Successfully updated: ${updatedCount}`);
        console.log(`Errors encountered: ${errorCount}`);
        console.log(`Skipped rides: ${rides.length - updatedCount}`);

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

// Run the migration
updateRidesWithFares().then(() => {
    console.log('Migration completed');
    process.exit(0);
}).catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
}); 