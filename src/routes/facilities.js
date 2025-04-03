import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { facilityValidation } from '../middleware/validation.js';
import { Facility } from '../models/Facility.js';

const router = express.Router();

// Get all facilities (with optional filters)
router.get('/', auth, async (req, res) => {
    try {
        const { type, search, isActive } = req.query;
        let query = {};

        // Add filters if provided
        if (type) query.type = type;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        if (search) {
            query.$or = [
                { facilityName: new RegExp(search, 'i') },
                { 'address.city': new RegExp(search, 'i') },
                { 'address.state': new RegExp(search, 'i') }
            ];
        }

        const facilities = await Facility.find(query).sort({ facilityName: 1 });
        res.json(facilities);
    } catch (error) {
        console.error('Error fetching facilities:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get nearby facilities
router.get('/nearby', auth, async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 10000 } = req.query;

        if (!longitude || !latitude) {
            return res.status(400).json({ error: 'Longitude and latitude are required' });
        }

        const facilities = await Facility.find({
            isActive: true,
            'address.location': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            }
        });

        res.json(facilities);
    } catch (error) {
        console.error('Error fetching nearby facilities:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get facility by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const facility = await Facility.findById(req.params.id);
        if (!facility) {
            return res.status(404).json({ error: 'Facility not found' });
        }
        res.json(facility);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new facility (admin only)
router.post('/', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { error } = facilityValidation(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const facility = new Facility(req.body);
        await facility.save();

        res.status(201).json({
            message: 'Facility created successfully',
            facility
        });
    } catch (error) {
        console.error('Error creating facility:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update facility (admin only)
router.put('/:id', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { error } = facilityValidation(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const facility = await Facility.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!facility) {
            return res.status(404).json({ error: 'Facility not found' });
        }

        res.json({
            message: 'Facility updated successfully',
            facility
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete facility (admin only)
router.delete('/:id', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const facility = await Facility.findByIdAndDelete(req.params.id);
        if (!facility) {
            return res.status(404).json({ error: 'Facility not found' });
        }
        res.json({ message: 'Facility deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router; 