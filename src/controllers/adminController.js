import { User } from '../models/User.js';
import { Ride } from '../models/Ride.js';
import { PricingConfig } from '../models/PricingConfig.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

// Get all users
export const getAllUsers = async (req, res) => {
    try {
        console.log('Admin getAllUsers - Request received:', {
            userId: req.user?._id,
            userType: req.user?.userType
        });

        const users = await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });

        console.log('Admin getAllUsers - Users found:', {
            count: users.length,
            userTypes: users.map(user => user.userType)
        });

        res.json(users);
    } catch (error) {
        console.error('Admin getAllUsers - Error:', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

// Get single user details
export const getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Fetch rides based on user type
        let rides;
        if (user.userType === 'PATIENT') {
            rides = await Ride.find({ patient: user._id })
                .populate('driver', 'firstName lastName')
                .populate('facility', 'name address')
                .sort({ createdAt: -1 })
                .lean();
        } else if (user.userType === 'NEMT') {
            rides = await Ride.find({ driver: user._id })
                .populate('patient', 'firstName lastName')
                .populate('facility', 'name address')
                .sort({ createdAt: -1 })
                .lean();
        } else if (user.userType === 'FACILITY') {
            rides = await Ride.find({ facility: user._id })
                .populate('driver', 'firstName lastName')
                .populate('patient', 'firstName lastName')
                .sort({ createdAt: -1 })
                .lean();
        }

        res.json({
            ...user,
            rides: rides || []
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ message: 'Error fetching user details' });
    }
};

// Get user's rides
export const getUserRides = async (req, res) => {
    try {
        const rides = await Ride.find({ 
            $or: [
                { patient: req.params.id },
                { driver: req.params.id }
            ]
        })
        .populate('driver', 'firstName lastName')
        .populate('patient', 'firstName lastName')
        .populate('facility', 'name address')
        .sort({ createdAt: -1 })
        .lean();

        res.json(rides);
    } catch (error) {
        console.error('Error fetching user rides:', error);
        res.status(500).json({ message: 'Error fetching user rides' });
    }
};

// Add credit to user's account
export const addUserCredit = async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid credit amount' });
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.accountBalance = (user.accountBalance || 0) + amount;
        await user.save();

        res.json({ 
            message: 'Credit added successfully',
            newBalance: user.accountBalance
        });
    } catch (error) {
        console.error('Error adding user credit:', error);
        res.status(500).json({ message: 'Error adding user credit' });
    }
};

// Update user
export const updateUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const updates = req.body;

        // Prevent updating sensitive fields
        delete updates.password;
        delete updates.accountBalance; // Protect account balance from direct updates

        const user = await User.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
};

// Delete user
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndDelete(id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

// Get pricing configuration
export const getPricingConfig = async (req, res) => {
    try {
        let config = await PricingConfig.findOne();
        
        if (!config) {
            // Create default config if none exists
            config = new PricingConfig({
                baseFare: 5.0,
                perMileRate: 2.0,
                perMinuteRate: 0.5,
                bookingFee: 1.5,
                cancellationFee: 5.0,
                minimumFare: 7.0,
                surgeMultiplier: 1.0
            });
            await config.save();
        }
        
        res.json(config);
    } catch (error) {
        console.error('Error fetching pricing config:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update pricing configuration
export const updatePricingConfig = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { 
            baseFare, 
            perMileRate, 
            perMinuteRate, 
            bookingFee, 
            cancellationFee, 
            minimumFare, 
            surgeMultiplier 
        } = req.body;
        
        let config = await PricingConfig.findOne();
        
        if (!config) {
            config = new PricingConfig({
                baseFare,
                perMileRate,
                perMinuteRate,
                bookingFee,
                cancellationFee,
                minimumFare,
                surgeMultiplier
            });
        } else {
            config.baseFare = baseFare || config.baseFare;
            config.perMileRate = perMileRate || config.perMileRate;
            config.perMinuteRate = perMinuteRate || config.perMinuteRate;
            config.bookingFee = bookingFee || config.bookingFee;
            config.cancellationFee = cancellationFee || config.cancellationFee;
            config.minimumFare = minimumFare || config.minimumFare;
            config.surgeMultiplier = surgeMultiplier || config.surgeMultiplier;
        }
        
        await config.save();
        
        res.json(config);
    } catch (error) {
        console.error('Error updating pricing config:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
    try {
        // Get total users count
        const totalUsers = await User.countDocuments();
        
        // Get total rides count
        const totalRides = await Ride.countDocuments();
        
        // Get active rides count (rides in progress)
        const activeRides = await Ride.countDocuments({ status: 'in_progress' });
        
        // Calculate total revenue from completed rides
        const completedRides = await Ride.find({ status: 'completed' });
        const revenue = completedRides.reduce((total, ride) => {
            return total + (ride.fare?.total || 0);
        }, 0);
        
        res.json({
            totalUsers,
            totalRides,
            activeRides,
            revenue
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all rides with pagination and filtering
export const getAllRides = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Build filter object
        const filter = {};
        
        // Status filter
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        
        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            
            if (req.query.startDate) {
                filter.createdAt.$gte = new Date(req.query.startDate);
            }
            
            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDate;
            }
        }
        
        // Search filter (by ID, passenger name, or driver name)
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            
            // Check if search is a valid ObjectId
            let objectIdSearch = null;
            if (mongoose.Types.ObjectId.isValid(req.query.search)) {
                objectIdSearch = new mongoose.Types.ObjectId(req.query.search);
            }
            
            filter.$or = [
                { _id: objectIdSearch },
                { 'patient.name': searchRegex },
                { 'driver.name': searchRegex }
            ].filter(condition => condition._id !== null || condition['patient.name'] || condition['driver.name']);
        }
        
        // Get total count for pagination
        const total = await Ride.countDocuments(filter);
        
        // Get rides with pagination
        const rides = await Ride.find(filter, null, { 
            isAdminQuery: true,
            sort: { createdAt: -1 },
            skip: skip,
            limit: limit
        })
        .populate('patient', 'name email phone _id')
        .populate('driver', 'name email phone _id')
        .lean();
        
        console.log(`Found ${rides.length} rides. Sample ride:`, 
            rides.length > 0 ? {
                id: rides[0]._id,
                patientId: rides[0].patient?._id,
                patientName: rides[0].patient?.name,
                driverId: rides[0].driver?._id,
                driverName: rides[0].driver?.name
            } : 'No rides found');
        
        res.json({
            rides,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching rides:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get ride details
export const getRideDetails = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id)
            .populate('patient', 'firstName lastName email phone profileImage rating')
            .populate('passenger', 'firstName lastName email phone profileImage rating')
            .populate('driver', 'firstName lastName email phone profileImage rating');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }
        
        res.json(ride);
    } catch (error) {
        console.error('Error fetching ride details:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update user status (activate/suspend)
export const updateUserStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || !['activate', 'suspend'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isActive = status === 'activate';
        await user.save();

        res.json({ 
            message: `User ${status === 'activate' ? 'activated' : 'suspended'} successfully`,
            user: {
                _id: user._id,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ message: 'Error updating user status' });
    }
};

// Add admin note to ride
export const addRideNote = async (req, res) => {
    try {
        const { note } = req.body;
        
        if (!note || !note.trim()) {
            return res.status(400).json({ message: 'Note content is required' });
        }

        const ride = await Ride.findById(req.params.id);
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        const adminNote = {
            content: note.trim(),
            addedBy: req.user._id,
            createdAt: new Date()
        };

        if (!ride.adminNotes) {
            ride.adminNotes = [];
        }
        
        ride.adminNotes.push(adminNote);
        await ride.save();

        res.json({ 
            message: 'Note added successfully',
            note: adminNote
        });
    } catch (error) {
        console.error('Error adding note to ride:', error);
        res.status(500).json({ message: 'Error adding note to ride' });
    }
};

// Assign driver to ride
export const assignDriverToRide = async (req, res) => {
    try {
        const { driverId } = req.body;
        
        if (!driverId) {
            return res.status(400).json({ message: 'Driver ID is required' });
        }

        const ride = await Ride.findById(req.params.id);
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        const driver = await User.findById(driverId);
        
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        if (driver.userType !== 'NEMT') {
            return res.status(400).json({ message: 'Selected user is not a driver' });
        }

        if (!driver.isActive) {
            return res.status(400).json({ message: 'Driver account is not active' });
        }

        // Update ride with driver
        ride.driver = driverId;
        
        // If ride is in pending status, update to accepted
        if (ride.status === 'pending') {
            ride.status = 'accepted';
        }
        
        await ride.save();

        // Populate driver details for response
        await ride.populate('driver', 'firstName lastName phone');

        res.json({ 
            message: 'Driver assigned successfully',
            ride
        });
    } catch (error) {
        console.error('Error assigning driver to ride:', error);
        res.status(500).json({ message: 'Error assigning driver to ride' });
    }
};

// Update ride status
export const updateRideStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || !['pending', 'accepted', 'in_progress', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const ride = await Ride.findById(req.params.id);
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Add status-specific fields
        const updateObj = {
            status: status
        };

        switch (status) {
            case 'in_progress':
                updateObj.startTime = new Date();
                break;
            case 'completed':
                updateObj.completedBy = req.user._id;
                updateObj.completedAt = new Date();
                break;
            case 'cancelled':
                updateObj.cancelledBy = req.user._id;
                updateObj.cancelledAt = new Date();
                updateObj.cancellationReason = req.body.reason || 'Cancelled by admin';
                break;
        }

        // Update ride with new status
        Object.assign(ride, updateObj);
        await ride.save();

        // Populate ride details for response
        await ride.populate('driver', 'firstName lastName phone');
        await ride.populate('patient', 'firstName lastName phone');

        res.json({ 
            message: 'Ride status updated successfully',
            ride
        });
    } catch (error) {
        console.error('Error updating ride status:', error);
        res.status(500).json({ message: 'Error updating ride status' });
    }
};

// Get available drivers
export const getAvailableDrivers = async (req, res) => {
    try {
        const drivers = await User.find({
            userType: 'NEMT',
            isActive: true
        })
        .select('_id firstName lastName phone email rating')
        .sort({ firstName: 1 })
        .lean();

        res.json(drivers);
    } catch (error) {
        console.error('Error fetching available drivers:', error);
        res.status(500).json({ message: 'Error fetching available drivers' });
    }
}; 