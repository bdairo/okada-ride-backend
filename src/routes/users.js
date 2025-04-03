import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Location } from '../models/Location.js';

const router = express.Router();

// Get user profile (protected)
router.get('/me', auth, async (req, res) => {
    res.json(req.user);
});

// Update user profile (protected)
router.patch('/me', auth, async (req, res) => {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['firstName', 'lastName', 'phone', 'driverDetails', 'facilityDetails'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
        return res.status(400).json({ error: 'Invalid updates' });
    }

    try {
        updates.forEach(update => req.user[update] = req.body[update]);
        await req.user.save();
        res.json(req.user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update driver location
router.post('/location', auth, authorize('NEMT'), async (req, res) => {
    try {
        const { coordinates, accuracy, speed, heading } = req.body;

        // Update user's current location
        req.user.driverDetails.currentLocation = {
            type: 'Point',
            coordinates
        };
        await req.user.save();

        // Create location history entry
        const location = new Location({
            user: req.user._id,
            location: {
                type: 'Point',
                coordinates
            },
            accuracy,
            speed,
            heading
        });
        await location.save();

        res.status(201).json({ location });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get driver's location history
router.get('/location/history', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = { user: req.user._id };

        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const locations = await Location.find(query)
            .sort({ timestamp: -1 })
            .limit(100);

        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get nearby drivers
router.get('/drivers/nearby', auth, async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 5000 } = req.query;

        const nearbyDrivers = await User.find({
            userType: 'NEMT',
            'driverDetails.isAvailable': true,
            'driverDetails.currentLocation': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            }
        }).select('firstName lastName driverDetails.vehicleType driverDetails.currentLocation');

        res.json(nearbyDrivers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all drivers (protected, admin only)
router.get('/drivers', auth, authorize('ADMIN'), async (req, res) => {
    // ... route handler
});

export default router; 