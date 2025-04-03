import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    accuracy: {
        type: Number
    },
    speed: {
        type: Number
    },
    heading: {
        type: Number
    }
}, {
    timestamps: true
});

// Index for geospatial queries
locationSchema.index({ location: "2dsphere" });

export const Location = mongoose.model('Location', locationSchema); 