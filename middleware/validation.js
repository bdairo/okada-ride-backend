import Joi from 'joi';

export const rideValidation = (data) => {
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
            medicalEquipment: Joi.boolean(),
            assistanceRequired: Joi.boolean()
        }),
        notes: Joi.string().allow('', null),
        patient: Joi.string(),
        facility: Joi.string()
    });

    return schema.validate(data);
};

export const registerValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string()
            .email()
            .required()
            .messages({
                'string.email': 'Please enter a valid email address',
                'any.required': 'Email is required'
            }),
        password: Joi.string()
            .min(6)
            .required()
            .messages({
                'string.min': 'Password must be at least 6 characters long',
                'any.required': 'Password is required'
            }),
        firstName: Joi.string()
            .required()
            .messages({
                'any.required': 'First name is required'
            }),
        lastName: Joi.string()
            .required()
            .messages({
                'any.required': 'Last name is required'
            }),
        phone: Joi.string()
            .required()
            .pattern(/^\+?1?\d{9,15}$/)
            .messages({
                'any.required': 'Phone number is required',
                'string.pattern.base': 'Please enter a valid phone number'
            }),
        userType: Joi.string()
            .valid('PATIENT', 'NEMT', 'FACILITY')
            .required()
            .messages({
                'any.required': 'User type is required',
                'any.only': 'Invalid user type'
            })
    });

    return schema.validate(data);
};

export const loginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string()
            .email()
            .required()
            .messages({
                'string.email': 'Please enter a valid email address',
                'any.required': 'Email is required'
            }),
        password: Joi.string()
            .required()
            .messages({
                'any.required': 'Password is required'
            })
    });

    return schema.validate(data);
};

export const facilityValidation = (data) => {
    const schema = Joi.object({
        facilityName: Joi.string()
            .required()
            .messages({
                'any.required': 'Facility name is required'
            }),
        address: Joi.string()
            .required()
            .messages({
                'any.required': 'Address is required'
            }),
        phone: Joi.string()
            .required()
            .pattern(/^\+?1?\d{9,15}$/)
            .messages({
                'any.required': 'Phone number is required',
                'string.pattern.base': 'Please enter a valid phone number'
            }),
        email: Joi.string()
            .email()
            .required()
            .messages({
                'string.email': 'Please enter a valid email address',
                'any.required': 'Email is required'
            })
    });

    return schema.validate(data);
}; 