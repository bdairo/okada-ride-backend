import mongoose from 'mongoose';

const facilitySchema = new mongoose.Schema({
    facilityName: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        street: {
            type: String,
            required: true,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zipCode: {
            type: String,
            required: true,
            trim: true
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number],
                required: true
            }
        }
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    type: {
        type: String,
        required: true,
        enum: ['Hospital', 'Clinic', 'Nursing Home', 'Rehabilitation Center', 'Other'],
        default: 'Other'
    },
    operatingHours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
    },
    services: [{
        type: String,
        trim: true
    }],
    notes: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for geospatial queries
facilitySchema.index({ "address.location": "2dsphere" });

export const Facility = mongoose.model('Facility', facilitySchema);

// Create indexes
Facility.createIndexes().then(() => {
    console.log('Facility indexes created successfully');
}).catch(err => {
    console.error('Error creating facility indexes:', err);
}); 