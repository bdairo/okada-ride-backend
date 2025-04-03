import rateLimit from 'express-rate-limit';

// Create a limiter with memory store (default)
export const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increase limit for development
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Specific limiter for auth routes - very lenient for development
export const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes window
    max: 500, // Allow 500 requests per 5 minutes for development
    skipSuccessfulRequests: true, // Don't count successful logins
    message: 'Too many login attempts, please wait 5 minutes before trying again.',
    standardHeaders: true,
    legacyHeaders: false
});

// Add specific limiter for rides endpoint - very lenient for development
export const ridesLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute for development
    message: 'Too many ride requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful requests
}); 