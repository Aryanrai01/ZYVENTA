import { mongoose } from '../database/mongoose.js';
import { logger } from './logger.js';

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
  mongoose.connection.on('error', (error: unknown) => {
    // Driver errors embed full topology dumps; the message is what an operator needs.
    logger.error(
      { reason: error instanceof Error ? error.message : String(error) },
      'MongoDB connection error',
    );
  });

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    retryWrites: true,
  });

  await assertTransactionsSupported();
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return connection;
}

/**
 * Checkout, inventory reservation and payment finalisation depend on multi-document
 * transactions, which MongoDB only supports on replica sets / sharded clusters. Fail fast
 * with a clear message instead of failing at the first checkout.
 */
async function assertTransactionsSupported(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection has no database handle');
  const hello = await db.admin().command({ hello: 1 });
  const isReplicaSet = typeof hello.setName === 'string';
  const isMongos = hello.msg === 'isdbgrid';
  if (!isReplicaSet && !isMongos) {
    throw new Error(
      'MongoDB must run as a replica set (transactions are required). ' +
        'Use the docker-compose "mongo" service, MongoDB Atlas, or start mongod with --replSet.',
    );
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
