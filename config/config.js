require('dotenv').config();

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    process.exit(1);
}

module.exports = {
    JWT_SECRET: process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/careride',
    PORT: process.env.PORT || 5010,
    NODE_ENV: process.env.NODE_ENV || 'development'
};