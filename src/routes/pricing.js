import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import { PricingConfig } from '../models/PricingConfig.js';
import winston from 'winston';

const router = express.Router();

// Get current pricing configuration (public)
router.get('/', async (req, res) => {
    try {
        const config = await PricingConfig.getConfig();
        res.json(config);
    } catch (error) {
        winston.error('Error fetching pricing config:', error);
        res.status(500).json({ error: 'Failed to fetch pricing configuration' });
    }
});

// Get current pricing configuration (admin only)
router.get('/admin', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        const config = await PricingConfig.getConfig();
        res.json(config);
    } catch (error) {
        winston.error('Error fetching pricing config:', error);
        res.status(500).json({ error: 'Failed to fetch pricing configuration' });
    }
});

// Update pricing configuration (admin only)
router.put('/admin', auth, authorize(['ADMIN']), async (req, res) => {
    try {
        // Get existing config first
        const existingConfig = await PricingConfig.findOne();
        
        const updateData = {
            ...req.body,
            updatedBy: req.user._id,
            lastUpdated: new Date()
        };

        let updatedConfig;
        if (existingConfig) {
            // Update existing config
            updatedConfig = await PricingConfig.findByIdAndUpdate(
                existingConfig._id,
                updateData,
                { new: true, runValidators: true }
            );
        } else {
            // Create new config
            const config = new PricingConfig(updateData);
            updatedConfig = await config.save();
        }

        res.json(updatedConfig);
    } catch (error) {
        winston.error('Error updating pricing config:', error);
        res.status(500).json({ error: 'Failed to update pricing configuration' });
    }
});

export default router; 