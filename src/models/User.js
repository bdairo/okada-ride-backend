import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    userType: {
        type: String,
        required: true,
        enum: ['ADMIN', 'NEMT', 'PATIENT', 'FACILITY', 'DRIVER'],
        default: 'PATIENT'
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    // Patient-specific fields
    specialRequirements: {
        type: [String],
        default: []
    },
    notes: {
        type: String,
        default: ''
    },
    // Facility-specific fields
    facilityName: {
        type: String
    },
    facilityType: {
        type: String,
        enum: ['HOSPITAL', 'CLINIC', 'NURSING_HOME', 'REHABILITATION_CENTER', 'OTHER']
    },
    // Profile image
    profileImage: {
        type: String,
        default: '/default-profile.png'
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to handle failed login attempts
userSchema.methods.handleFailedLogin = function() {
    this.loginAttempts += 1;
    
    // Lock account after 5 failed attempts
    if (this.loginAttempts >= 5) {
        this.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
    }
    
    return this.save();
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
    this.loginAttempts = 0;
    this.lockUntil = undefined;
    return this.save();
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Method to check if account is locked
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

export const User = mongoose.model('User', userSchema); 