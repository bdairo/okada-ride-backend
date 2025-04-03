import express from 'express';
import { registerValidation } from '../middleware/validation.js';
import { User } from '../models/User.js';
import { generateTokens, refreshAuth } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        console.log('Registration request:', req.body);

        // Validate request body
        const { error } = registerValidation(req.body);
        if (error) {
            console.log('Validation error details:', {
                message: error.details[0].message,
                path: error.details[0].path,
                type: error.details[0].type
            });
            return res.status(400).json({ error: error.details[0].message });
        }

        // Check if user already exists
        const emailExists = await User.findOne({ email: req.body.email });
        if (emailExists) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Create new user
        const user = new User({
            email: req.body.email,
            password: req.body.password,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            phone: req.body.phone,
            userType: req.body.userType,
            profileComplete: true
        });

        await user.save();
        console.log('User created successfully');

        // Generate tokens
        const tokens = generateTokens(user);

        // Remove password from response
        user.password = undefined;

        res.status(201).json({ 
            status: 'success',
            ...tokens,
            user
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        console.log('Login attempt:', {
            email: req.body.email,
            hasPassword: !!req.body.password,
            body: JSON.stringify(req.body)
        });

        // Check if email and password are provided
        if (!req.body.email || !req.body.password) {
            console.log('Missing credentials');
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }

        // Find user and explicitly select password field
        console.log('Attempting to find user with email:', {
            inputEmail: req.body.email,
            lowercaseEmail: req.body.email.toLowerCase(),
            query: { email: req.body.email.toLowerCase() }
        });

        const user = await User.findOne({ email: req.body.email.toLowerCase() })
            .select('+password')
            .lean();

        console.log('User lookup result:', {
            found: !!user,
            hasPassword: user ? !!user.password : false,
            passwordLength: user?.password?.length,
            userEmail: user?.email,
            userType: user?.userType,
            query: { email: req.body.email.toLowerCase() }
        });

        if (!user) {
            // Log all users in the database for debugging
            const allUsers = await User.find({}, 'email userType').lean();
            console.log('All users in database:', allUsers);
            
            return res.status(400).json({
                error: 'Invalid email or password'
            });
        }

        // Compare passwords
        console.log('Attempting password comparison:', {
            userId: user._id,
            email: user.email,
            userType: user.userType,
            inputPasswordLength: req.body.password.length,
            storedPasswordLength: user.password?.length,
            inputPassword: req.body.password,
            storedHash: user.password
        });

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        
        console.log('Password verification result:', {
            userId: user._id,
            email: user.email,
            isMatch,
            userType: user.userType
        });

        if (!isMatch) {
            return res.status(400).json({
                error: 'Invalid email or password'
            });
        }

        // Generate tokens
        const tokens = generateTokens(user);

        // Return user data without sensitive information
        const userData = {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            userType: user.userType
        };

        res.json({ ...tokens, user: userData });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Token refresh endpoint
router.post('/refresh', refreshAuth);

// Debug route - remove in production
router.get('/debug/users', async (req, res) => {
    try {
        const users = await User.find().select('+password');
        res.json(users.map(user => ({
            id: user._id,
            email: user.email,
            hasPassword: !!user.password,
            passwordLength: user.password?.length
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router; 