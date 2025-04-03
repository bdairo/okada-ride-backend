import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user._id, userType: user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

export const auth = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'NO_TOKEN'
            });
        }

        const token = authHeader.replace('Bearer ', '');
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED',
                    message: 'Access token has expired'
                });
            }
            return res.status(401).json({ 
                error: 'Invalid token',
                code: 'INVALID_TOKEN',
                message: error.message
            });
        }

        // Support both 'id' and 'userId' in the token
        const userId = decoded.id || decoded.userId;
        
        if (!userId) {
            return res.status(401).json({ 
                error: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT',
                message: 'Token does not contain user ID'
            });
        }

        const user = await User.findOne({ _id: userId });
        if (!user) {
            return res.status(401).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Attach user and token to request
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ 
            error: 'Authentication failed',
            code: error.name,
            message: error.message 
        });
    }
};

export const refreshAuth = async (req, res) => {
    try {
        // Get refresh token from body or header
        let refreshToken = req.body.refreshToken;
        if (!refreshToken) {
            const authHeader = req.header('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                refreshToken = authHeader.replace('Bearer ', '');
            }
        }
        
        if (!refreshToken) {
            return res.status(401).json({ 
                error: 'Refresh token required',
                code: 'REFRESH_TOKEN_MISSING'
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(
                refreshToken,
                process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
            );
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Refresh token expired',
                    code: 'REFRESH_TOKEN_EXPIRED',
                    message: 'Your session has expired. Please login again.'
                });
            }
            return res.status(401).json({ 
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN',
                message: error.message
            });
        }

        // Support both 'id' and 'userId' in the token
        const userId = decoded.id || decoded.userId;
        
        if (!userId) {
            return res.status(401).json({ 
                error: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT',
                message: 'Token does not contain user ID'
            });
        }

        const user = await User.findOne({ _id: userId });
        if (!user) {
            return res.status(401).json({ 
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Generate new tokens
        const tokens = generateTokens(user);
        res.json(tokens);
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ 
            error: 'Token refresh failed',
            code: error.name,
            message: error.message
        });
    }
};

export const authorize = (roles) => {
    return (req, res, next) => {
        if (!Array.isArray(roles)) {
            roles = [roles];
        }
        if (!roles.includes(req.user.userType)) {
            return res.status(403).json({ 
                error: 'Not authorized',
                code: 'UNAUTHORIZED_ROLE',
                message: 'You do not have permission to access this resource'
            });
        }
        next();
    };
}; 