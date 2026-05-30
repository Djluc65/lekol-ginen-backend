import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { env } from './env.js';

// MongoDB
export async function connectDb() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed, using only SQLite');
  }
}

// Prisma with Better-SQLite3 Adapter
const adapter = new PrismaBetterSqlite3({ url: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
