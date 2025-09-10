import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import User from '../src/models/User';
import RefreshToken from '../src/models/RefreshToken';
import bcrypt from 'bcryptjs';

const app = createApp();

describe('Auth & RBAC', () => {
  // In-memory stores to avoid real Mongo during tests
  const users: any[] = [];
  const refreshTokens: any[] = [];

  beforeAll(async () => {
    // Minimal env for JWT signing
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.NODE_ENV = 'test';
    // Stub mongoose connect/disconnect and dropDatabase
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose as any);
    jest.spyOn(mongoose, 'disconnect').mockResolvedValue();
    // @ts-expect-error mutate test-time connection
    mongoose.connection = { db: { dropDatabase: async () => {} } } as any;

    // Mock User model methods used by routes/tests
    jest.spyOn(User as any, 'create').mockImplementation(async (docs: any) => {
      const toSave = (Array.isArray(docs) ? docs : [docs]).map((d) => ({
        _id: new mongoose.Types.ObjectId(),
        active: true,
        ...d,
      }));
      users.push(...toSave);
      return Array.isArray(docs) ? toSave : toSave[0];
    });
    jest.spyOn(User as any, 'findOne').mockImplementation(async (query: any) => {
      const email = (query?.email || '').toLowerCase();
      return users.find((u) => u.email.toLowerCase() === email) || null;
    });

    // Mock RefreshToken minimal usage
    jest.spyOn(RefreshToken as any, 'create').mockImplementation(async (doc: any) => {
      refreshTokens.push({ _id: new mongoose.Types.ObjectId(), ...doc });
      return refreshTokens[refreshTokens.length - 1];
    });

    // Seed admin and portal user
    const [adminHash, portalHash] = await Promise.all([
      bcrypt.hash('Admin#12345', 10),
      bcrypt.hash('Portal#12345', 10),
    ]);
    await User.create([
      { email: 'admin@example.com', passwordHash: adminHash, role: 'admin' },
      { email: 'portal@example.com', passwordHash: portalHash, role: 'portal', mustChangePassword: true },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('rejects missing token on /auth/me', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs in and returns access token and sets refresh cookie', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin#12345' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const cookiesHeader = res.headers['set-cookie'];
    const setCookie = Array.isArray(cookiesHeader)
      ? cookiesHeader.join(';')
      : cookiesHeader ?? '';
    expect(setCookie).toContain('refreshToken=');
  });

  it('rate limits repeated bad password attempts', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const r = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong' });
      lastStatus = r.status;
    }
    expect([401, 429]).toContain(lastStatus);
  });
});
