import Joi from 'joi';

const validationSchemas = {
    // User validation schemas
    userRegistration: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        phone: Joi.string().required(),
        userType: Joi.string().valid('PATIENT', 'NEMT', 'FACILITY').required(),
        driverDetails: Joi.when('userType', {
            is: 'NEMT',
            then: Joi.object({
                vehicleType: Joi.string().required(),
                licensePlate: Joi.string().required(),
                insuranceInfo: Joi.string().required(),
                isAvailable: Joi.boolean()
            })
        }),
        facilityDetails: Joi.when('userType', {
            is: 'FACILITY',
            then: Joi.object({
                facilityName: Joi.string().required(),
                facilityType: Joi.string().required(),
                address: Joi.string().required(),
                licenseNumber: Joi.string().required()
            })
        })
    }),

    // Ride validation schemas
    rideCreation: Joi.object({
        pickup: Joi.object({
            address: Joi.string().required(),
            location: Joi.object({
                coordinates: Joi.array().items(Joi.number()).length(2).required()
            }).required()
        }).required(),
        dropoff: Joi.object({
            address: Joi.string().required(),
            location: Joi.object({
                coordinates: Joi.array().items(Joi.number()).length(2).required()
            }).required()
        }).required(),
        scheduledTime: Joi.date().min('now').required(),
        specialRequirements: Joi.object({
            wheelchair: Joi.boolean(),
            medicalEquipment: Joi.boolean(),
            assistanceRequired: Joi.boolean()
        })
    })
};

export const validateRide = (data) => {
    const schema = Joi.object({
        pickup: Joi.object({
            address: Joi.string().required(),
            location: Joi.object({
                coordinates: Joi.array().items(Joi.number()).length(2).required()
            }).required()
        }).required(),
        dropoff: Joi.object({
            address: Joi.string().required(),
            location: Joi.object({
                coordinates: Joi.array().items(Joi.number()).length(2).required()
            }).required()
        }).required(),
        distance: Joi.number().min(0).required(),
        scheduledTime: Joi.date().required(),
        specialRequirements: Joi.object({
            wheelchair: Joi.boolean(),
            assistance: Joi.boolean(),
            medicalEquipment: Joi.boolean(),
            assistanceRequired: Joi.boolean()
        }),
        notes: Joi.string().allow('', null),
        patient: Joi.string().allow(null)
    });

    return schema.validate(data);
};

export const validateRideUpdate = (data) => {
    const schema = Joi.object({
        status: Joi.string().valid('accepted', 'in-progress', 'completed', 'cancelled').required(),
        reason: Joi.when('status', {
            is: 'cancelled',
            then: Joi.string().required(),
            otherwise: Joi.string().allow('', null)
        })
    });

    return schema.validate(data);
};

export default validationSchemas; 