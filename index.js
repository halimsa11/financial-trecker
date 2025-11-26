import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { setCookie, getCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db/index.js';
import { users, transactions, transactionType } from './db/schema.js';
import { eq, desc, sql, and } from 'drizzle-orm';

const app = new Hono();
const SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Middleware untuk error handling
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({ success: false, message: 'Internal Server Error' }, 500);
});

// Middleware untuk auth
const authMiddleware = async (c, next) => {
  const token = getCookie(c, 'token');
  if (!token) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  try {
    const user = jwt.verify(token, SECRET);
    c.set('user', user);
    await next();
  } catch (error) {
    return c.json({ success: false, message: 'Token tidak valid' }, 401);
  }
};

// --- API REGISTRASI ---
app.post('/api/register', async (c) => {
    try {
        const { username, password } = await c.req.json();
        
        if (!username || !password) {
            return c.json({ success: false, message: 'Username dan password harus diisi' }, 400);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await db.insert(users)
            .values({ username, password: hashedPassword })
            .returning({ id: users.id, username: users.username });
        
        return c.json({ success: true, data: newUser[0] }, 201);
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.message?.includes('unique') || error.code === '23505') {
            return c.json({ success: false, message: 'Username sudah digunakan' }, 400);
        }
        
        return c.json({ success: false, message: 'Registrasi gagal' }, 400);
    }
});

// --- API LOGIN ---
app.post('/api/login', async (c) => {
    try {
        const { username, password } = await c.req.json();

        if (!username || !password) {
            return c.json({ success: false, message: 'Username dan password harus diisi' }, 400);
        }

        const user = await db.query.users.findFirst({ 
            where: eq(users.username, username) 
        });

        if (!user) {
            return c.json({ success: false, message: 'Username atau password salah' }, 401);
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return c.json({ success: false, message: 'Username atau password salah' }, 401);
        }

        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            SECRET, 
            { expiresIn: '1d' }
        );
        
        setCookie(c, 'token', token, { 
            httpOnly: true, 
            sameSite: 'Lax', 
            maxAge: 86400,
            path: '/'
        });
        
        return c.json({ 
            success: true, 
            message: 'Login berhasil',
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Login error:', error);
        return c.json({ success: false, message: 'Terjadi kesalahan saat login' }, 500);
    }
});

// --- API LOGOUT ---
app.post('/api/logout', (c) => {
    setCookie(c, 'token', '', { 
        httpOnly: true, 
        sameSite: 'Lax', 
        maxAge: -1,
        path: '/' 
    });
    return c.json({ success: true, message: 'Logout berhasil' });
});

// --- API ME ---
app.get('/api/me', authMiddleware, (c) => {
    const user = c.get('user');
    return c.json({ success: true, data: user });
});

// --- API TRANSACTIONS ---

// Create transaction
app.post('/api/transactions', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const { nominal, transactionDate, status, description } = await c.req.json();

        if (!nominal || !transactionDate || !status) {
            return c.json({ success: false, message: 'Data tidak lengkap' }, 400);
        }

        const newTransaction = await db.insert(transactions)
            .values({
                userId: user.id,
                nominal,
                transactionDate,
                status,
                description
            })
            .returning();

        return c.json({ success: true, data: newTransaction[0] }, 201);
    } catch (error) {
        console.error('Transaction error:', error);
        return c.json({ success: false, message: 'Gagal membuat transaksi' }, 400);
    }
});

// Get all transactions for user
app.get('/api/transactions', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        
        const userTransactions = await db.query.transactions.findMany({
            where: eq(transactions.userId, user.id),
            orderBy: [desc(transactions.transactionDate)]
        });

        return c.json({ success: true, data: userTransactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        return c.json({ success: false, message: 'Gagal mengambil data transaksi' }, 500);
    }
});

// Health check endpoint
app.get('/health', (c) => {
    return c.json({ success: true, message: 'Server is running' });
});

// --- SERVER START ---
if (process.env.VERCEL) {
    globalThis.app = app;
} else {
    const port = process.env.PORT || 3000;
    
    serve({ 
        fetch: app.fetch, 
        port: port 
    }, (info) => {
        console.log(`🚀 Server is running on http://localhost:${info.port}`);
    });
}

export default app;