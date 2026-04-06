require('dotenv').config();
const mongoose = require('mongoose');
const logger   = require('./logger');

mongoose.set('strictQuery', true);

const MONGO_OPTS = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
};

async function connect() {
    try {
        await mongoose.connect(process.env.MONGO_URL, MONGO_OPTS);
        logger.info('MongoDB connected');
    } catch (err) {
        logger.error('MongoDB connection failed', { error: err.message });
        setTimeout(connect, 5000);
    }
}

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — retrying in 5s');
    setTimeout(connect, 5000);
});

mongoose.connection.on('error', err => logger.error('MongoDB error', { error: err.message }));

connect();

module.exports = mongoose.connection;
