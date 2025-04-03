const User = require('../models/User');
const Location = require('../models/Location');

exports.updateProfile = async (req, res, next) => {
    try {
        const updates = Object.keys(req.body);
        const allowedUpdates = ['firstName', 'lastName', 'phone', 'driverDetails', 'facilityDetails'];
        const isValidOperation = updates.every(update => allowedUpdates.includes(update));

        if (!isValidOperation) {
            return res.status(400).json({ error: 'Invalid updates' });
        }

        updates.forEach(update => req.user[update] = req.body[update]);
        await req.user.save();
        res.json(req.user);
    } catch (error) {
        next(error);
    }
};

exports.updateLocation = async (req, res, next) => {
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

        // Emit location update through Socket.IO
        req.app.get('io').emit(`driver:${req.user._id}:location`, {
            driverId: req.user._id,
            location: coordinates
        });

        res.status(201).json({ location });
    } catch (error) {
        next(error);
    }
};

exports.getLocationHistory = async (req, res, next) => {
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
        next(error);
    }
};

exports.getNearbyDrivers = async (req, res, next) => {
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
        next(error);
    }
}; 