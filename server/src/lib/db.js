import mongoose from 'mongoose';
import { config } from '../config.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(url = config.mongoUrl) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongo reconnected'));
  await mongoose.connect(url, { serverSelectionTimeoutMS: 10000, maxPoolSize: 50 });
  logger.info('mongo connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
