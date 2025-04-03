import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('MongoDB Connected:', {
            host: conn.connection.host,
            name: conn.connection.name,
            readyState: conn.connection.readyState,
            collections: Object.keys(conn.connection.collections)
        });

        // Test the connection by listing collections
        const collections = await conn.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));

        return conn;
    } catch (error) {
        console.error('MongoDB connection error:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        process.exit(1);
    }
};

export default connectDB; 