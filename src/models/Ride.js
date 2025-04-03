import mongoose from 'mongoose';

// Add this line at the top to configure Mongoose
mongoose.set('strictPopulate', false);

const rideSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    facility: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    pickup: {
        address: String,
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: [Number]
        }
    },
    dropoff: {
        address: String,
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: [Number]
        }
    },
    distance: {
        type: Number,
        required: true,
        min: 0
    },
    scheduledTime: Date,
    status: {
        type: String,
        enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    specialRequirements: {
        wheelchair: { type: Boolean, default: false },
        medicalEquipment: { type: Boolean, default: false },
        assistanceRequired: { type: Boolean, default: false }
    },
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    completedAt: Date,
    startTime: Date,
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancelledAt: Date,
    cancellationReason: String,
    rating: {
        score: {
            type: Number,
            min: 1,
            max: 5,
            required: false
        },
        comment: {
            type: String,
            maxlength: 500
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    fare: {
        total: {
            type: Number,
            required: true,
            min: 0
        },
        breakdown: {
            baseFare: {
                name: { type: String, default: 'Base Fare' },
                amount: { type: Number, required: true, min: 0 }
            },
            distance: {
                name: { type: String, default: 'Distance Charge' },
                amount: { type: Number, required: true, min: 0 },
                details: String
            },
            surge: {
                name: { type: String, default: 'Surge Pricing' },
                amount: { type: Number, min: 0 },
                multiplier: Number
            },
            additionalFees: [{
                name: String,
                amount: { type: Number, min: 0 }
            }]
        },
        subtotal: { type: Number, required: true, min: 0 },
        minimumFareApplied: { type: Boolean, default: false }
    },
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'],
        default: 'unpaid'
    },
    paymentDetails: {
        stripeSessionId: String,
        stripePaymentIntentId: String,
        paymentMethod: String,
        amountPaid: Number,
        paidAt: Date,
        patientName: String,
        refundedAt: Date,
        refundAmount: Number,
        refundReason: String,
        cardBrand: String,
        cardLast4: String,
        cardExpMonth: Number,
        cardExpYear: Number
    }
}, {
    timestamps: true
});

// Define all indexes in one place
rideSchema.index({ 'pickup.location': '2dsphere' });
rideSchema.index({ 'dropoff.location': '2dsphere' });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ patient: 1 });
rideSchema.index({ status: 1 }); // Add index for status queries
rideSchema.index({ scheduledTime: 1 }); // Add index for scheduled time queries
rideSchema.index({ createdAt: 1 }); // Add index for creation time queries

// Pre-find middleware to apply default filters
rideSchema.pre('find', function() {
    const query = this.getQuery();
    const options = this.getOptions();
    
    // Log the query for debugging
    console.log('Backend: Ride find operation:', {
        query: JSON.stringify(query),
        options: JSON.stringify(options),
        conditions: Object.keys(query),
        hasStatusFilter: query.hasOwnProperty('status'),
        statusValue: query.status,
        isPatientQuery: query.hasOwnProperty('patient'),
        patientId: query.patient,
        stack: new Error().stack // Add stack trace for debugging
    });

    // Skip filters for fare calculation script
    if (options.skipFilters) {
        return;
    }

    // If this is a patient or facility query, don't apply any default status filter
    if (query.patient || query.facility) {
        return;
    }

    // Check if this is an admin route by examining the stack trace
    const stackTrace = new Error().stack;
    const isAdminRoute = stackTrace.includes('adminController') || 
                         stackTrace.includes('/api/admin/') ||
                         (options && options.isAdminQuery);
    
    console.log('Is admin route check:', { 
        isAdminRoute, 
        stackContainsAdmin: stackTrace.includes('adminController'),
        stackContainsAdminApi: stackTrace.includes('/api/admin/'),
        hasAdminOption: options && options.isAdminQuery
    });
    
    if (isAdminRoute) {
        // Don't apply default filters for admin routes
        console.log('Admin route detected, skipping default filters');
        return;
    }

    // For NEMT drivers, apply default status filter if no other filters are present
    if (!query.status && !query._id && !query.driver) {
        query.status = { $in: ['accepted', 'in-progress'] };
        console.log('Applied default status filter for non-admin route');
    }
});

// Pre-findOne middleware to check patient existence
rideSchema.pre('findOne', async function() {
    const User = mongoose.model('User');
    const query = this.getQuery();
    
    // Log the findOne operation
    console.log('Backend: Ride findOne operation:', {
        query: JSON.stringify(query),
        conditions: Object.keys(query)
    });
    
    // Skip patient existence check if we're just looking up by ID
    // This prevents redundant queries when we just need the ride data
    if (query._id && Object.keys(query).length === 1) {
        return;
    }
    
    // Only perform patient existence check if we're not already populating patient
    const populateOptions = this.getPopulateOptions();
    if (!populateOptions || !populateOptions.some(opt => opt.path === 'patient')) {
        // Use the native MongoDB driver to avoid triggering middleware
        const db = mongoose.connection.db;
        const ride = await db.collection('rides').findOne(query, { projection: { patient: 1 } });
        
        if (ride) {
            // Check if the patient exists
            const patientExists = await User.exists({ _id: ride.patient });
            if (!patientExists) {
                // If patient doesn't exist, delete the ride using native MongoDB driver
                await db.collection('rides').deleteOne({ _id: ride._id });
                console.log('Deleted orphaned ride:', {
                    rideId: ride._id,
                    patientId: ride.patient
                });
                // Return null by setting an impossible condition
                this.where({ _id: null });
            }
        }
    }
});

// Cleanup function to remove all orphaned rides
rideSchema.statics.cleanupOrphanedRides = async function() {
    const User = mongoose.model('User');
    
    // Get all rides
    const rides = await this.find({}).lean();
    let deletedCount = 0;
    
    for (const ride of rides) {
        const patientExists = await User.exists({ _id: ride.patient });
        if (!patientExists) {
            await this.deleteOne({ _id: ride._id });
            deletedCount++;
            console.log('Deleted orphaned ride:', {
                rideId: ride._id,
                patientId: ride.patient
            });
        }
    }
    
    return deletedCount;
};

// Pre-save middleware to ensure patient exists
rideSchema.pre('save', async function(next) {
    if (this.isModified('patient')) {
        try {
            const User = mongoose.model('User');
            const patientExists = await User.exists({ _id: this.patient });
            if (!patientExists) {
                throw new Error('Cannot create ride: Patient does not exist');
            }
        } catch (error) {
            next(error);
            return;
        }
    }
    next();
});

// Pre-save middleware to calculate fare
rideSchema.pre('save', async function(next) {
    try {
        console.log('Pre-save middleware triggered');
        console.log('Current fare:', this.fare);
        console.log('Distance:', this.distance);

        if (this.distance > 0) {
            console.log('Calculating fare...');
            const PricingConfig = mongoose.model('PricingConfig');
            const config = await PricingConfig.getConfig();
            console.log('Retrieved pricing config:', config);
            
            // Calculate base components
            const baseFare = Number(config.baseFare) || 0;
            const perMileRate = Number(config.perMileRate) || 0;
            const distanceCharge = Number((this.distance * perMileRate).toFixed(2));
            console.log('Base components:', { baseFare, perMileRate, distanceCharge });

            // Initialize additional fees
            let additionalFees = [];

            // Check for night hours (10 PM - 6 AM)
            const hour = new Date(this.scheduledTime).getHours();
            if (hour >= 22 || hour < 6) {
                const nightCharge = Number(config.additionalFees.nightCharge) || 0;
                if (nightCharge > 0) {
                    additionalFees.push({
                        name: 'Night Hours Charge',
                        amount: nightCharge
                    });
                }
            }

            // Check for peak hours (7-9 AM and 4-7 PM on weekdays)
            const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
            const isWeekday = new Date(this.scheduledTime).getDay() >= 1 && new Date(this.scheduledTime).getDay() <= 5;
            if (isPeakHour && isWeekday) {
                const peakCharge = Number(config.additionalFees.peakHourCharge) || 0;
                if (peakCharge > 0) {
                    additionalFees.push({
                        name: 'Peak Hour Charge',
                        amount: peakCharge
                    });
                }
            }

            // Calculate total additional fees
            const totalAdditionalFees = additionalFees.reduce((sum, fee) => sum + Number(fee.amount), 0);
            console.log('Additional fees:', { additionalFees, totalAdditionalFees });

            // Calculate final fare
            const subtotal = Number((baseFare + distanceCharge + totalAdditionalFees).toFixed(2));
            const minimumFare = Number(config.minimumFare) || 0;
            const total = Math.max(subtotal, minimumFare);
            console.log('Final calculations:', { subtotal, minimumFare, total });

            this.fare = {
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
                        details: `${this.distance.toFixed(1)} miles at $${perMileRate}/mile`
                    },
                    additionalFees
                },
                minimumFareApplied: total > subtotal
            };
            console.log('Set fare:', this.fare);
        }
        next();
    } catch (error) {
        console.error('Error in pre-save middleware:', error);
        next(error);
    }
});

// Create the model
const Ride = mongoose.model('Ride', rideSchema);

// Export the model and createIndexes function
export { Ride };
export const createIndexes = async () => {
    try {
        await Ride.createIndexes();
        console.log('Ride indexes created successfully');
    } catch (error) {
        console.error('Error creating ride indexes:', error);
        throw error;
    }
}; 