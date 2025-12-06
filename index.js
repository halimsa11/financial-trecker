import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { setCookie, getCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db/index.js';
import { users, transactions } from './db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

const app = new Hono();
const SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Middleware untuk error handling
app.onError((err, c) => {
  console.error('Server Error:', err);
  return c.json({ success: false, message: 'Internal Server Error' }, 500);
});

// --- API REGISTRASI ---
app.post('/api/register', async (c) => {
    try {
        const { username, password } = await c.req.json();
        
        // Validasi input
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
        
        return c.json({ success: false, message: 'Registrasi gagal', error: error }, 400);
    }
});

// --- API LOGIN ---
app.post('/api/login', async (c) => {
    try {
        const { username, password } = await c.req.json();

        // Validasi input
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
app.get('/api/me', (c) => {
    try {
        const token = getCookie(c, 'token');
        if (!token) {
            return c.json({ success: false, message: 'Unauthorized' }, 401);
        }
        
        const user = jwt.verify(token, SECRET);
        return c.json({ success: true, data: user });
    } catch (error) {
        console.error('Me endpoint error:', error);
        return c.json({ success: false, message: 'Token tidak valid' }, 401);
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
    const port = process.env.PORT || 4000;
    
    serve({ 
        fetch: app.fetch, 
        port: port 
    }, (info) => {
        console.log(`🚀 Server is running on http://localhost:${info.port}`);
    });
}

const authMiddleware = async (c, next) => {
    const token = getCookie(c, 'token');
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);
    try {
        const user = jwt.verify(token, SECRET);
        c.set('user', user); // Menyimpan data user di context Hono
        await next();
    } catch (error) {
        return c.json({ success: false, message: 'Token tidak valid' }, 401);
    }
};
 
// --- API TAMBAH TRANSAKSI (POST) ---
app.post('/api/transactions', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const { nominal, transactionDate, status, description } = await c.req.json();
        const newTransaction = await db.insert(transactions)
            .values({
                userId: user.id,
                nominal: nominal.toString(), // Simpan nominal sebagai string
                transactionDate: transactionDate,
                status: status,
                description: description
            })
            .returning();
        return c.json({ success: true, data: newTransaction[0] }, 201);
    } catch (error) {
        console.error("error", error);
        return c.json({ success: false, message: 'Gagal menambah transaksi' }, 400);
    }
});
 
// --- API LIHAT TRANSAKSI PER BULAN (GET) ---
app.get('/api/transactions', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const { year, month } = c.req.query();

        if (!year || !month) {
            return c.json({ success: false, message: "Tahun dan bulan wajib diisi" }, 400);
        }

        // Convert ke number
        const y = Number(year);
        const m = Number(month);

        // Tanggal mulai & akhir bulan
        const startOfMonth = new Date(y, m - 1, 1);   // contoh: 2024-12-01
        const endOfMonth = new Date(y, m, 1);         // contoh: 2025-01-01

        const userTransactions = await db.query.transactions.findMany({
            where: (t, { eq, and, gte, lt }) => and(
                eq(t.userId, user.id),
                gte(t.transactionDate, startOfMonth),
                lt(t.transactionDate, endOfMonth)
            ),
            orderBy: (t, { desc }) => desc(t.transactionDate)
        });

        const totalIncome = userTransactions
            .filter(t => t.status === 'income')
            .reduce((sum, t) => sum + Number(t.nominal), 0);

        const totalOutcome = userTransactions
            .filter(t => t.status === 'outcome')
            .reduce((sum, t) => sum + Number(t.nominal), 0);

        const balance = totalIncome - totalOutcome;

        return c.json({
            success: true,
            data: userTransactions,
            summary: { totalIncome, totalOutcome, balance }
        });

    } catch (error) {
        console.error("Transaction fetch error:", error);
        return c.json({ success: false, message: "Gagal mengambil transaksi" }, 500);
    }
});

// --- ROOT URL dan SERVE STATIC FILES (untuk UI) ---
app.use('/*', serveStatic({ root: './public' })); 

export default app;