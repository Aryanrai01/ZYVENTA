/**
 * Creates (or promotes) an administrator. There is deliberately no API route for this.
 *
 *   pnpm --filter @zyventa/api create-admin --email admin@example.com --name "Jane Admin"
 *   pnpm --filter @zyventa/api create-admin --email existing@example.com --promote
 *
 * The password is read from a hidden prompt, or from ADMIN_PASSWORD when not on a TTY
 * (CI / containers). It is never accepted as a command-line argument (shell history).
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { adminPasswordSchema, emailSchema } from '@zyventa/shared';
import { z } from 'zod';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { hashPassword } from '../modules/auth/password.js';
import { User } from '../modules/users/user.model.js';
import { runScript } from './lib/run-script.js';

async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write(question);
  muted = true;
  const answer = await new Promise<string>((resolve) => {
    rl.question('', resolve);
  });
  muted = false;
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const fromEnv = process.env.ADMIN_PASSWORD;
    if (!fromEnv) throw new Error('Not a TTY: provide the password via ADMIN_PASSWORD');
    return fromEnv;
  }
  const password = await promptHidden('Admin password (min 12 chars): ');
  const confirm = await promptHidden('Confirm password: ');
  if (password !== confirm) throw new Error('Passwords do not match');
  return password;
}

runScript('create-admin', async (argv) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      promote: { type: 'boolean', default: false },
    },
    strict: true,
  });

  const email = emailSchema.parse(values.email);
  const existing = await User.findOne({ email });

  if (existing) {
    if (!values.promote) {
      throw new Error(`${email} already exists. Re-run with --promote to grant ADMIN.`);
    }
    if (existing.roles.includes('ADMIN')) {
      console.log(`${email} is already an admin — nothing to do.`);
      return;
    }
    existing.roles.push('ADMIN');
    await existing.save();
    await AuditLog.create({
      actorRole: 'SYSTEM',
      action: 'user.admin_granted',
      resource: 'USER',
      resourceId: existing._id.toString(),
      metadata: { via: 'cli' },
    });
    console.log(`Granted ADMIN to ${email}.`);
    return;
  }

  const name = z.string().trim().min(2).max(80).parse(values.name);
  const password = adminPasswordSchema.parse(await readPassword());

  const admin = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    roles: ['USER', 'ADMIN'],
    emailVerifiedAt: new Date(),
  });
  await AuditLog.create({
    actorRole: 'SYSTEM',
    action: 'user.admin_created',
    resource: 'USER',
    resourceId: admin._id.toString(),
    metadata: { via: 'cli' },
  });
  console.log(`Created admin ${email} (id ${admin._id.toString()}).`);
});
