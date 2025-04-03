import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import morgan from 'morgan';
import connectDB from './src/config/db.js';
import { limiter, authLimiter } from './src/middleware/rateLimiter.js';
import authRoutes from './src/routes/auth.js';
import rideRoutes from './src/routes/rides.js';
import messageRoutes from './src/routes/messages.js';
import userRoutes from './src/routes/users.js';
import facilityRoutes from './src/routes/facilities.js';
import adminRoutes from './src/routes/admin.js';
import pricingRoutes from './src/routes/pricing.js';
import facilityPatientRoutes from './src/routes/facilityPatients.js';
import paymentRoutes from './src/routes/payments.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set frontend URL from environment variables
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();

// Connect to MongoDB
connectDB();

// CORS Configuration
const corsOptions = {
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));

// Special handling for Stripe webhook
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes
app.use(express.json());
app.use(morgan('dev'));

// Request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        query: req.query,
        params: req.params,
        body: req.body,
        headers: {
            authorization: req.headers.authorization ? 'present' : 'absent',
            origin: req.headers.origin
        }
    });
    next();
});

// Apply rate limiting
app.use(limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pricing-config', pricingRoutes);
app.use('/api/facility', facilityPatientRoutes);
app.use('/api/payments', paymentRoutes);

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ 
        message: 'API is working',
        mongoState: mongoose.connection.readyState
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        user: req.user?._id
    });

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            details: Object.values(err.errors).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID format'
        });
    }

    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler - must be last
app.use((req, res) => {
    console.log('404 Not Found:', {
        method: req.method,
        path: req.path,
        query: req.query
    });
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

export default app; 