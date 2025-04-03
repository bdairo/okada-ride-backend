import { Ride } from '../models/Ride.js';
import { rideValidation } from '../middleware/validation.js';
import {
  RIDE_STATUSES,
  RIDE_STATUS_TRANSITIONS,
  POPULATE_OPTIONS,
} from '../constants/rideConstants.js';
import { PricingConfig } from '../models/PricingConfig.js';
import mongoose from 'mongoose';

// Helper function to populate ride with standard options
const populateRide = (query) => {
  console.log('Populating ride with options');
  return query
    .select(
      [
        'pickup',
        'dropoff',
        'scheduledTime',
        'status',
        'specialRequirements',
        'notes',
        'createdAt',
        'completedBy',
        'completedAt',
        'startTime',
        'cancelledBy',
        'cancelledAt',
        'cancellationReason',
        'fare',
        'rating'
      ].join(' '),
    )
    .populate('patient', 'firstName lastName phone email medicalId insuranceProvider profileImage')
    .populate('driver', 'firstName lastName phone email profileImage')
    .populate('facility', 'facilityName firstName lastName phoneNumber address')
    .lean();
};

export const createRide = async (req, res, next) => {
  try {
    console.log('Creating new ride:', {
      userId: req.user._id,
      userType: req.user.userType,
      body: req.body,
    });

    console.log('Creating new ride with data:', req.body);
    
    // Validate the ride data
    const { error } = rideValidation(req.body);
    if (error) {
      console.log('Validation error:', error.details[0].message);
      return res.status(400).json({ error: error.details[0].message });
    }

    // Get pricing configuration
    const pricingConfig = await PricingConfig.getConfig();

    // Calculate base components
    const baseFare = Number(pricingConfig.baseFare) || 0;
    const perMileRate = Number(pricingConfig.perMileRate) || 0;
    const distanceCharge = Number((req.body.distance * perMileRate).toFixed(2));

    // Initialize additional fees
    let additionalFees = [];

    // Check for night hours (10 PM - 6 AM)
    const hour = new Date(req.body.scheduledTime).getHours();
    if (hour >= 22 || hour < 6) {
      const nightCharge = Number(pricingConfig.additionalFees.nightCharge) || 0;
      if (nightCharge > 0) {
        additionalFees.push({
          name: 'Night Hours Charge',
          amount: nightCharge,
        });
      }
    }

    // Check for peak hours (7-9 AM and 4-7 PM on weekdays)
    const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
    const isWeekday =
      new Date(req.body.scheduledTime).getDay() >= 1 &&
      new Date(req.body.scheduledTime).getDay() <= 5;
    if (isPeakHour && isWeekday) {
      const peakCharge =
        Number(pricingConfig.additionalFees.peakHourCharge) || 0;
      if (peakCharge > 0) {
        additionalFees.push({
          name: 'Peak Hour Charge',
          amount: peakCharge,
        });
      }
    }

    // Calculate total additional fees
    const totalAdditionalFees = additionalFees.reduce(
      (sum, fee) => sum + Number(fee.amount),
      0,
    );

    // Calculate final fare
    const subtotal = Number(
      (baseFare + distanceCharge + totalAdditionalFees).toFixed(2),
    );
    const minimumFare = Number(pricingConfig.minimumFare) || 0;
    const total = Math.max(subtotal, minimumFare);

    // Create the ride data object
    const rideData = {
      pickup: req.body.pickup,
      dropoff: req.body.dropoff,
      distance: req.body.distance,
      scheduledTime: req.body.scheduledTime,
      specialRequirements: req.body.specialRequirements || {},
      notes: req.body.notes || '',
      status: RIDE_STATUSES.PENDING,
      fare: {
        total: total,
        subtotal: subtotal,
        breakdown: {
          baseFare: {
            name: 'Base Fare',
            amount: baseFare,
          },
          distance: {
            name: 'Distance Charge',
            amount: distanceCharge,
            details: `${req.body.distance.toFixed(
              1,
            )} miles at $${perMileRate}/mile`,
          },
          additionalFees,
        },
        minimumFareApplied: total > subtotal,
      },
    };

    // Handle patient ID
    if (req.user.userType.toUpperCase() === 'FACILITY' && req.body.patient) {
      // If a facility is booking for a patient, use the provided patient ID
      console.log('Facility booking for patient:', req.body.patient);
      rideData.patient = req.body.patient;
      // Also associate the ride with the facility
      rideData.facility = req.user._id;
    } else {
      // Otherwise, use the authenticated user's ID as the patient
      rideData.patient = req.user._id;
    }

    console.log('Final ride data before saving:', rideData);

    // Create and save the ride
    const ride = new Ride(rideData);

    console.log('New ride object:', {
      id: ride._id,
      patientId: ride.patient,
      facilityId: ride.facility,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      status: ride.status,
      distance: ride.distance,
      fare: ride.fare,
    });

    await ride.save();

    // Verify the ride was saved
    const savedRide = await Ride.findById(ride._id);
    console.log('Saved ride verification:', {
      found: !!savedRide,
      id: savedRide?._id,
      patientId: savedRide?.patient,
      facilityId: savedRide?.facility,
      status: savedRide?.status,
      distance: savedRide?.distance,
      fare: savedRide?.fare,
    });

    // Notify all drivers about the new ride
    req.app.get('io').newRide(ride);

    res.status(201).json(ride);
  } catch (error) {
    console.error('Error creating ride:', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
    });
    next(error);
  }
};

export const getRides = async (req, res, next) => {
  try {
    // Get the query parameters first
    const requestedStatuses = req.query.status
      ? req.query.status.split(',').map((s) => s.trim())
      : null;
    const unassignedOnly = req.query.unassigned === 'true';

    console.log('Get rides request:', {
      userType: req.user.userType,
      userId: req.user._id,
      queryParams: req.query,
      requestedStatuses,
      unassignedOnly,
      timestamp: new Date().toISOString(),
    });

    // First, let's count all rides in the system
    const totalSystemRides = await Ride.countDocuments({});
    const totalUserRides = await Ride.countDocuments({ patient: req.user._id });

    console.log('Initial ride counts:', {
      totalInSystem: totalSystemRides,
      totalForUser: totalUserRides,
      userId: req.user._id,
      timestamp: new Date().toISOString(),
    });

    let query = {};
    // Get the limit parameter from the request, default to no limit (0)
    const limit = req.query.limit ? parseInt(req.query.limit) : 0;

    console.log('Requested limit:', limit);

    switch (req.user.userType.toUpperCase()) {
      case 'PATIENT':
        // Ensure we're using a valid ObjectId for the patient query
        query = { patient: new mongoose.Types.ObjectId(req.user._id) };

        // Add status filter only if specific statuses are requested
        if (requestedStatuses) {
          query.status = { $in: requestedStatuses };
        }

        // Log the complete patient query
        console.log('Patient query:', {
          query: JSON.stringify(query, null, 2),
          patientId: req.user._id,
          hasStatusFilter: !!requestedStatuses,
          requestedStatuses,
          timestamp: new Date().toISOString(),
        });
        break;
      case 'NEMT':
      case 'DRIVER':
        if (unassignedOnly) {
          query = {
            driver: null,
            status: 'pending',
          };
        } else {
          query = { driver: new mongoose.Types.ObjectId(req.user._id) };
          if (requestedStatuses) {
            query.status = { $in: requestedStatuses };
          }
        }
        break;
      case 'FACILITY':
        query = { facility: new mongoose.Types.ObjectId(req.user._id) };
        if (requestedStatuses) {
          query.status = { $in: requestedStatuses };
        }
        break;
    }

    // Log the raw MongoDB query
    console.log('MongoDB query:', {
      query: JSON.stringify(query, null, 2),
      userType: req.user.userType,
      timestamp: new Date().toISOString(),
    });

    // First try without population to verify query
    const unpopulatedCount = await Ride.countDocuments(query);
    console.log('Unpopulated query count:', {
      count: unpopulatedCount,
      query: JSON.stringify(query, null, 2),
      timestamp: new Date().toISOString(),
    });

    // Now get the populated rides - Apply limit only if specified and greater than 0
    let rideQuery = Ride.find(query).sort({ scheduledTime: -1 });
    
    // Don't apply a limit if limit is 0 or not specified
    if (limit > 0) {
      console.log(`Applying limit of ${limit} to query`);
      rideQuery = rideQuery.limit(limit);
    } else {
      console.log('No limit applied to query - returning all rides');
    }
    
    const rides = await populateRide(rideQuery);

    console.log('Final query results:', {
      totalInSystem: totalSystemRides,
      totalForUser: totalUserRides,
      foundInQuery: rides.length,
      foundStatuses: rides.map((r) => r.status),
      query: JSON.stringify(query, null, 2),
      timestamp: new Date().toISOString(),
    });

    res.json(rides);
  } catch (error) {
    console.error('Error in getRides:', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      userType: req.user.userType,
      timestamp: new Date().toISOString(),
    });
    next(error);
  }
};

export const getDriverRides = async (req, res, next) => {
  try {
    if (req.user.userType !== 'NEMT') {
      return res
        .status(403)
        .json({ error: 'Only NEMT drivers can access this endpoint' });
    }

    console.log('Raw request query:', {
      query: req.query,
      status: req.query.status,
      url: req.url,
      originalUrl: req.originalUrl,
      method: req.method,
      headers: req.headers,
    });

    // Parse the requested statuses
    const requestedStatuses = req.query.status
      ? req.query.status.split(',').map((s) => s.trim().toLowerCase())
      : null;

    console.log('Parsed status:', {
      requestedStatuses,
      rawStatus: req.query.status,
      hasStatus: !!req.query.status,
      statusLength: requestedStatuses?.length,
    });

    // Convert user ID to ObjectId
    const driverId = new mongoose.Types.ObjectId(req.user._id);

    // Build the match condition based on status
    let matchCondition = {
      driver: driverId,
    };

    // Add status filter if provided
    if (requestedStatuses && requestedStatuses.length > 0) {
      matchCondition.status = { $in: requestedStatuses };
    } else {
      // Default to active rides
      matchCondition.status = { $in: ['accepted', 'in-progress'] };
    }

    console.log('Match condition:', JSON.stringify(matchCondition, null, 2));

    // Execute the query
    const rides = await Ride.aggregate([
      {
        $match: matchCondition,
      },
      {
        $lookup: {
          from: 'users',
          localField: 'patient',
          foreignField: '_id',
          as: 'patient',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'driver',
          foreignField: '_id',
          as: 'driver',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'completedBy',
          foreignField: '_id',
          as: 'completedByUser',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'cancelledBy',
          foreignField: '_id',
          as: 'cancelledByUser',
        },
      },
      {
        $lookup: {
          from: 'facilities',
          localField: 'facility',
          foreignField: '_id',
          as: 'facility',
        },
      },
      {
        $unwind: {
          path: '$patient',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: '$driver',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: '$completedByUser',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: '$cancelledByUser',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: '$facility',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          completedByDetails: '$completedByUser',
          cancelledByDetails: '$cancelledByUser',
        },
      },
      {
        $project: {
          completedByUser: 0,
          cancelledByUser: 0,
        },
      },
      {
        $sort: { scheduledTime: -1 },
      },
    ]);

    // Log the results
    console.log('Driver rides results:', {
      count: rides.length,
      statuses: rides.map((r) => r.status),
      matchCondition: JSON.stringify(matchCondition, null, 2),
      allRides: rides.map((r) => ({
        id: r._id,
        status: r.status,
        scheduledTime: r.scheduledTime,
        completedAt: r.completedAt,
        completedBy: r.completedBy,
        completedByDetails: r.completedByDetails?._id,
        driver: r.driver?._id,
      })),
    });

    res.json(rides);
  } catch (error) {
    console.error('Error in getDriverRides:', error);
    next(error);
  }
};

export const updateRideStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const rideId = req.params.rideId || req.params.id; // Support both parameter names

    console.log('Updating ride status:', {
      rideId,
      newStatus: status,
      userId: req.user._id,
      userType: req.user.userType,
      body: req.body,
    });

    // For accepting rides, we need to ensure atomicity
    if (status === RIDE_STATUSES.ACCEPTED) {
      // Use findOneAndUpdate to atomically update the ride
      // This ensures only one driver can accept a pending ride
      const updatedRide = await Ride.findOneAndUpdate(
        {
          _id: rideId,
          status: RIDE_STATUSES.PENDING, // Must be pending
          driver: null, // Must not have a driver
        },
        {
          $set: {
            status: RIDE_STATUSES.ACCEPTED,
            driver: req.user._id,
          },
        },
        { new: true },
      );

      if (!updatedRide) {
        return res.status(400).json({
          error:
            'Ride cannot be accepted. It may have already been accepted by another driver or is no longer pending.',
        });
      }

      // Populate and return the updated ride
      const populatedRide = await populateRide(Ride.findById(updatedRide._id));

      // Notify about the status change
      const io = req.app.get('io');
      io.rideStatusChange(populatedRide._id, status, populatedRide.patient._id);
      io.rideUpdate(populatedRide._id, {
        type: 'status_change',
        oldStatus: RIDE_STATUSES.PENDING,
        newStatus: status,
        ride: populatedRide,
      });

      return res.json({
        message: 'Ride accepted successfully',
        ride: populatedRide,
      });
    }

    // For other status updates, proceed with the existing logic
    const ride = await populateRide(Ride.findById(rideId));

    if (!ride) {
      console.log('Ride not found:', rideId);
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Add validation for driver-specific actions
    if (['in-progress', 'completed'].includes(status)) {
      // Convert to strings for comparison
      const driverId = ride.driver?._id?.toString() || ride.driver?.toString();
      const userId = req.user._id.toString();

      if (driverId !== userId) {
        return res.status(403).json({
          error: 'Only the assigned driver can update this ride status',
        });
      }
    }

    console.log('Current ride state:', {
      rideId: ride._id,
      currentStatus: ride.status,
      driverId: ride.driver?._id,
      userId: req.user._id,
    });

    // Check if the status transition is valid
    const allowedTransitions = RIDE_STATUS_TRANSITIONS[ride.status];
    if (!allowedTransitions?.includes(status)) {
      console.log('Invalid status transition:', {
        fromStatus: ride.status,
        toStatus: status,
        allowedTransitions,
        rideId,
      });
      return res.status(400).json({
        error: `Invalid status transition from ${ride.status} to ${status}`,
        allowedTransitions,
      });
    }

    const oldStatus = ride.status;

    // Prepare update object
    const updateObj = {
      status: status,
    };

    // Add status-specific fields
    switch (status) {
      case RIDE_STATUSES.IN_PROGRESS:
        updateObj.startTime = new Date();
        break;
      case RIDE_STATUSES.COMPLETED:
        updateObj.completedBy = req.user._id;
        updateObj.completedAt = new Date();
        break;
      case RIDE_STATUSES.CANCELLED:
        updateObj.cancelledBy = req.user._id;
        updateObj.cancelledAt = new Date();
        updateObj.cancellationReason = req.body.reason || 'No reason provided';
        break;
    }

    // Update the ride
    const updatedRide = await Ride.findByIdAndUpdate(
      rideId,
      { $set: updateObj },
      { new: true },
    )
      .populate('patient', 'firstName lastName phone')
      .populate('driver', 'firstName lastName phone')
      .populate('facility', 'facilityName phone address');

    if (!updatedRide) {
      return res.status(404).json({ error: 'Ride not found after update' });
    }

    console.log('Ride status updated successfully:', {
      rideId,
      oldStatus,
      newStatus: status,
      driverId: updatedRide.driver?._id,
    });

    // Notify relevant parties about the status change
    const io = req.app.get('io');

    // Notify the ride room about the status change
    io.rideStatusChange(updatedRide._id, status, updatedRide.patient._id);

    // Send specific updates based on status change
    io.rideUpdate(updatedRide._id, {
      type: 'status_change',
      oldStatus,
      newStatus: status,
      ride: updatedRide,
    });

    res.json({
      message: 'Ride status updated successfully',
      ride: updatedRide,
    });
  } catch (error) {
    console.error('Error updating ride status:', {
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

export const getNearbyRides = async (req, res, next) => {
  try {
    const { longitude, latitude, maxDistance = 10000 } = req.query;

    const nearbyRides = await populateRide(
      Ride.find({
        status: RIDE_STATUSES.PENDING,
        'pickup.location': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            $maxDistance: parseInt(maxDistance),
          },
        },
      }),
    );

    res.json(nearbyRides);
  } catch (error) {
    next(error);
  }
};

export const getRideById = async (req, res, next) => {
  try {
    const { rideId } = req.params;

    console.log('GetRideById request:', {
      rideId,
      userId: req.user._id,
      userType: req.user.userType,
    });

    if (!mongoose.Types.ObjectId.isValid(rideId)) {
      return res.status(400).json({ error: 'Invalid ride ID format' });
    }

    // Update field selection to avoid path collision
    const ride = await Ride.findById(rideId)
      .select(
        [
          'pickup',
          'dropoff',
          'scheduledTime',
          'status',
          'specialRequirements',
          'notes',
          'createdAt',
          'completedBy',
          'completedAt',
          'startTime',
          'cancelledBy',
          'cancelledAt',
          'cancellationReason',
          'fare',
          'rating'
        ].join(' '),
      )
      .populate('patient', 'firstName lastName phone email medicalId insuranceProvider profileImage')
      .populate('driver', 'firstName lastName phone email profileImage')
      .populate('facility', 'facilityName firstName lastName phoneNumber address')
      .lean();

    if (!ride) {
      console.log('Ride not found:', rideId);
      return res.status(404).json({ error: 'Ride not found' });
    }

    console.log('Found ride:', {
      id: ride._id,
      patientId: ride.patient?._id,
      driverId: ride.driver?._id,
      facilityId: ride.facility?._id,
      facilityName: ride.facility?.facilityName,
      facilityFirstName: ride.facility?.firstName,
      facilityLastName: ride.facility?.lastName,
      facilityPhoneNumber: ride.facility?.phoneNumber,
      status: ride.status,
      fare: ride.fare,
      isPatientPopulated: !!ride.patient,
      isDriverPopulated: !!ride.driver,
      isFacilityPopulated: !!ride.facility,
      hasPatient: !!ride.patient,
      hasDriver: !!ride.driver,
      hasFacility: !!ride.facility,
      facilityFields: ride.facility ? Object.keys(ride.facility) : [],
      patientFields: ride.patient ? Object.keys(ride.patient) : []
    });

    // Check if user is authorized to view the ride
    let isAuthorized = false;
    const userType = req.user.userType.toUpperCase();

    if (userType === 'ADMIN') {
      isAuthorized = true;
    } else if (
      userType === 'PATIENT' &&
      ride.patient?._id.toString() === req.user._id.toString()
    ) {
      isAuthorized = true;
    } else if (
      userType === 'NEMT' &&
      ride.driver?._id.toString() === req.user._id.toString()
    ) {
      isAuthorized = true;
    } else if (
      userType === 'FACILITY' &&
      ride.facility?._id.toString() === req.user._id.toString()
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      console.log('Unauthorized access attempt:', {
        userId: req.user._id,
        userType: userType,
        rideId,
      });
      return res
        .status(403)
        .json({ error: 'Not authorized to view this ride' });
    }

    res.json(ride);
  } catch (error) {
    console.error('Error in getRideById:', error);
    next(error);
  }
};

// Add this new function to handle ride ratings
export const rateRide = async (req, res, next) => {
    try {
        console.log('Rating ride - Request details:', {
            params: req.params,
            body: req.body,
            userId: req.user._id,
            userType: req.user.userType
        });

        const { rideId } = req.params;
        const { rating, comment } = req.body;

        if (!rideId) {
            console.log('Missing rideId in request');
            return res.status(400).json({ error: 'Ride ID is required' });
        }

        // Validate input
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Find the ride
        const ride = await Ride.findOne({ _id: rideId });
        if (!ride) {
            console.log('Ride not found:', rideId);
            return res.status(404).json({ error: 'Ride not found' });
        }

        console.log('Found ride:', {
            rideId: ride._id,
            status: ride.status,
            patientId: ride.patient,
            facilityId: ride.facility,
            userId: req.user._id,
            userType: req.user.userType
        });

        // Verify that the user is either the patient who took the ride or the facility that booked it
        const isPatient = ride.patient && ride.patient.toString() === req.user._id.toString();
        const isFacility = ride.facility && ride.facility.toString() === req.user._id.toString();
        
        console.log('Authorization check:', {
            isPatient,
            isFacility,
            userType: req.user.userType,
            patientId: ride.patient?.toString(),
            facilityId: ride.facility?.toString(),
            userId: req.user._id.toString()
        });
        
        if (!isPatient && !isFacility) {
            return res.status(403).json({ error: 'Not authorized to rate this ride' });
        }

        // Verify that the ride is completed
        if (ride.status !== 'completed') {
            return res.status(400).json({ error: 'Can only rate completed rides' });
        }

        // Create the rating object
        const ratingData = {
            score: rating,
            comment: comment || '',
            createdAt: new Date()
        };

        // Use findByIdAndUpdate with runValidators: false to avoid validation errors
        const updatedRide = await Ride.findByIdAndUpdate(
            rideId,
            {
                $set: {
                    'rating': ratingData
                }
            },
            { 
                new: true, 
                runValidators: false
            }
        )
        .populate('patient', 'firstName lastName phone')
        .populate('driver', 'firstName lastName phone')
        .populate('facility', 'facilityName phone address');

        if (!updatedRide) {
            return res.status(404).json({ error: 'Failed to update ride with rating' });
        }

        console.log('Successfully rated ride:', {
            rideId,
            rating: updatedRide.rating,
            patientId: updatedRide.patient._id
        });

        // Emit socket event for the rating
        const io = req.app.get('io');
        if (io && io.rideRated) {
            io.rideRated(
                rideId, 
                ride.driver.toString(), 
                rating, 
                comment
            );
            console.log('Emitted ride-rated socket event');
        } else {
            console.log('Socket IO not available or rideRated method not found');
        }

        // Return the updated ride
        res.json(updatedRide);
    } catch (error) {
        console.error('Error rating ride:', {
            error: error.message,
            stack: error.stack,
            userId: req.user._id
        });
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                error: 'Validation error', 
                details: Object.values(error.errors).map(err => err.message) 
            });
        }
        
        next(error);
    }
};

export const acceptRide = async (req, res, next) => {
  try {
    const { rideId } = req.params;
    // ... rest of the function
  } catch (error) {
    next(error);
  }
};

export const startRide = async (req, res, next) => {
  try {
    const { rideId } = req.params;
    // ... rest of the function
  } catch (error) {
    next(error);
  }
};

export const completeRide = async (req, res, next) => {
  try {
    const { rideId } = req.params;
    // ... rest of the function
  } catch (error) {
    next(error);
  }
};

export const cancelRide = async (req, res, next) => {
  try {
    const { rideId } = req.params;
    // ... rest of the function
  } catch (error) {
    next(error);
  }
};
