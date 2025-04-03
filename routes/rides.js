import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { 
    createRide, 
    getRides, 
    getDriverRides, 
    getNearbyRides, 
    updateRideStatus,
    getRideById,
    acceptRide,
    startRide,
    completeRide,
    cancelRide,
    rateRide
} from '../controllers/rideController.js';
import { RIDE_STATUSES } from '../constants/rideConstants.js';
import { Ride } from '../models/Ride.js';
import mongoose from 'mongoose';
import { PricingConfig } from '../models/PricingConfig.js';

const router = express.Router();

// Add this middleware at the top of your routes file
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Driver-specific routes - must be before general routes
router.get('/driver/assigned', auth, authorize(['NEMT']), getDriverRides);
router.get('/driver/nearby', auth, authorize(['NEMT']), getNearbyRides);

// Special route for facility users to book rides for patients
router.post('/facility-book', auth, authorize(['FACILITY']), async (req, res, next) => {
    try {
        console.log('Facility booking ride for patient:', {
            facilityId: req.user._id,
            patientId: req.body.patient,
            pickup: req.body.pickup,
            dropoff: req.body.dropoff
        });

        // Validate required fields
        if (!req.body.patient || !req.body.pickup || !req.body.dropoff || !req.body.distance || !req.body.scheduledTime) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get pricing configuration
        const pricingConfig = await PricingConfig.getConfig();

        // Calculate fare
        const baseFare = Number(pricingConfig.baseFare) || 0;
        const perMileRate = Number(pricingConfig.perMileRate) || 0;
        const distanceCharge = Number((req.body.distance * perMileRate).toFixed(2));
        const subtotal = Number((baseFare + distanceCharge).toFixed(2));
        const minimumFare = Number(pricingConfig.minimumFare) || 0;
        const total = Math.max(subtotal, minimumFare);

        // Create ride data
        const rideData = {
            patient: req.body.patient,
            facility: req.user._id,
            pickup: req.body.pickup,
            dropoff: req.body.dropoff,
            distance: req.body.distance,
            scheduledTime: req.body.scheduledTime,
            specialRequirements: req.body.specialRequirements || {},
            notes: req.body.notes || '',
            status: RIDE_STATUSES.PENDING,
            fare: {
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
                        details: `${req.body.distance.toFixed(1)} miles at $${perMileRate}/mile`
                    },
                    additionalFees: []
                },
                minimumFareApplied: total > subtotal
            }
        };

        // Create and save the ride
        const ride = new Ride(rideData);
        await ride.save();

        // Notify drivers
        req.app.get('io').newRide(ride);

        res.status(201).json(ride);
    } catch (error) {
        console.error('Error creating ride for facility:', error);
        res.status(500).json({ error: error.message });
    }
});

// General routes
router.post('/', auth, createRide);
router.get('/', auth, getRides);

// Specific routes
router.post('/:rideId/rate', auth, authorize(['PATIENT', 'FACILITY']), rateRide);
router.get('/:rideId', auth, getRideById);

// Status update routes
router.patch('/:rideId/accept', auth, authorize(['NEMT']), async (req, res, next) => {
    req.body.status = RIDE_STATUSES.ACCEPTED;
    updateRideStatus(req, res, next);
});

router.patch('/:rideId/start', auth, authorize(['NEMT']), async (req, res, next) => {
    // Use status from request body if provided, otherwise default to IN_PROGRESS
    if (!req.body.status) {
        req.body.status = RIDE_STATUSES.IN_PROGRESS;
    }
    updateRideStatus(req, res, next);
});

router.patch('/:rideId/complete', auth, authorize(['NEMT']), async (req, res, next) => {
    req.body.status = RIDE_STATUSES.COMPLETED;
    updateRideStatus(req, res, next);
});

router.patch('/:rideId/cancel', auth, async (req, res, next) => {
    req.body.status = RIDE_STATUSES.CANCELLED;
    updateRideStatus(req, res, next);
});

router.patch('/:rideId/unassign', auth, authorize(['NEMT']), async (req, res, next) => {
    // First set status back to pending
    req.body.status = RIDE_STATUSES.PENDING;
    await updateRideStatus(req, res, next);
    
    // Then remove driver assignment
    const ride = await Ride.findById(req.params.rideId);
    if (ride) {
        ride.driver = null;
        await ride.save();
    }
});

// Create a reusable populate configuration
const populateOptions = [
    { 
        path: 'patient',
        select: 'firstName lastName phone',
        options: { strictPopulate: false }
    },
    {
        path: 'driver',
        select: 'firstName lastName phone',
        options: { strictPopulate: false }
    },
    {
        path: 'facility',
        select: 'facilityName phone address',
        options: { strictPopulate: false }
    }
];

// Get nearby rides (for drivers)
router.get('/nearby', auth, authorize('NEMT'), async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 10000 } = req.query;

        // Add validation for coordinates
        if (!longitude || !latitude) {
            return res.status(400).json({ 
                error: 'Longitude and latitude are required' 
            });
        }

        // Convert string parameters to numbers
        const coords = [parseFloat(longitude), parseFloat(latitude)];
        const distance = parseInt(maxDistance);

        console.log('Backend: Query parameters:', { coords, distance });

        try {
            // First try to get the rides without population
            const unpopulatedRides = await Ride.find({
                status: 'pending',
                'pickup.location': {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: coords
                        },
                        $maxDistance: distance
                    }
                }
            });
            console.log('Backend: Found unpopulated rides:', unpopulatedRides.length);

            // Then populate one at a time
            const nearbyRides = await Ride.find({
                status: 'pending',
                'pickup.location': {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: coords
                        },
                        $maxDistance: distance
                    }
                }
            })
            .populate('patient', 'firstName lastName phone')
            .populate('driver', 'firstName lastName phone')
            .sort({ scheduledTime: 1 });

            console.log('Found nearby rides:', nearbyRides.length);
            res.json(nearbyRides);
        } catch (populateError) {
            console.error('Backend: Population error:', populateError);
            // Try sending unpopulated rides as fallback
            const fallbackRides = await Ride.find({
                status: 'pending',
                'pickup.location': {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: coords
                        },
                        $maxDistance: distance
                    }
                }
            }).sort({ scheduledTime: 1 });
            res.json(fallbackRides);
        }
    } catch (error) {
        console.error('Backend: Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ 
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Debug route - remove in production
router.get('/debug/all', auth, async (req, res) => {
    try {
        const rides = await Ride.find()
            .populate('patient', 'firstName lastName phone')
            .populate('driver', 'firstName lastName phone');
        
        console.log('All rides in system:', rides.length);
        res.json({
            total: rides.length,
            rides: rides.map(ride => ({
                id: ride._id,
                status: ride.status,
                patient: ride.patient ? `${ride.patient.firstName} ${ride.patient.lastName}` : 'No patient',
                driver: ride.driver ? `${ride.driver.firstName} ${ride.driver.lastName}` : 'No driver',
                pickup: ride.pickup.address,
                dropoff: ride.dropoff.address
            }))
        });
    } catch (error) {
        console.error('Debug route error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Driver routes
router.post('/:rideId/accept', auth, acceptRide);
router.post('/:rideId/start', auth, startRide);
router.post('/:rideId/complete', auth, completeRide);

// Patient routes
router.post('/:rideId/cancel', auth, cancelRide);

export default router; 