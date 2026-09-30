import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { mongoose } from '../src/database/mongoose.js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from '../src/config/database.js';

/*
 * Real MongoDB integration test (downloads a mongod binary on first run, ~100 MB).
 * Set SKIP_DB_TESTS=1 only in environments that cannot download MongoDB binaries.
 */
describe.skipIf(process.env.SKIP_DB_TESTS === '1')('database connection', () => {
  const servers: { stop: () => Promise<boolean> }[] = [];

  afterEach(async () => {
    await disconnectDatabase();
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => server.stop()));
  });

  it('connects to a replica set and supports transactions', async () => {
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    servers.push(replSet);

    await connectDatabase(replSet.getUri('zyventa_test'));
    expect(isDatabaseConnected()).toBe(true);

    const Probe = mongoose.model('Probe', new mongoose.Schema({ email: String }));
    await Probe.createCollection();
    await mongoose.connection.transaction(async (session) => {
      await Probe.create([{ email: 'a@zyventa.test' }], { session });
    });
    expect(await Probe.countDocuments()).toBe(1);
  });

  it('refuses to start against a standalone mongod (no transactions)', async () => {
    const standalone = await MongoMemoryServer.create();
    servers.push(standalone);
    await expect(connectDatabase(standalone.getUri('zyventa_test'))).rejects.toThrow(/replica set/);
  });
});
