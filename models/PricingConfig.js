import mongoose from 'mongoose';

const pricingConfigSchema = new mongoose.Schema({
    baseFare: {
        type: Number,
        required: true,
        min: 0
    },
    perMileRate: {
        type: Number,
        required: true,
        min: 0
    },
    minimumFare: {
        type: Number,
        required: true,
        min: 0
    },
    cancellationFee: {
        type: Number,
        required: true,
        min: 0
    },
    surgeMultiplierMin: {
        type: Number,
        required: true,
        min: 1.0,
        default: 1.0
    },
    surgeMultiplierMax: {
        type: Number,
        required: true,
        min: 1.0,
        default: 3.0
    },
    additionalFees: {
        nightCharge: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },
        peakHourCharge: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },
        holidayCharge: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    }
});

// Default configuration
const defaultConfig = {
    baseFare: 5.00,
    perMileRate: 2.50,
    minimumFare: 10.00,
    cancellationFee: 5.00,
    surgeMultiplierMin: 1.0,
    surgeMultiplierMax: 3.0,
    additionalFees: {
        nightCharge: 0,
        peakHourCharge: 0,
        holidayCharge: 0
    },
    lastUpdated: new Date()
};

// Ensure there's only one pricing configuration document
pricingConfigSchema.statics.getConfig = async function() {
    let config = await this.findOne().sort({ lastUpdated: -1 });
    
    if (!config) {
        // Create default configuration if none exists
        try {
            config = new this(defaultConfig);
            await config.save();
            console.log('Created default pricing configuration');
        } catch (error) {
            console.error('Error creating default pricing config:', error);
            // Return default config even if save fails
            return defaultConfig;
        }
    }
    
    return config;
};

const PricingConfig = mongoose.model('PricingConfig', pricingConfigSchema);

export { PricingConfig }; 