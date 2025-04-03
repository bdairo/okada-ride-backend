import mongoose from 'mongoose';

const facilityPatientSchema = new mongoose.Schema({
    facility: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Create a compound index to ensure a patient can only be associated with a facility once
facilityPatientSchema.index({ facility: 1, patient: 1 }, { unique: true });

export const FacilityPatient = mongoose.model('FacilityPatient', facilityPatientSchema); 