import 'dotenv/config';
import { db } from "./index.js";
import bcrypt from 'bcryptjs';
import { transactions, users } from './schema.js';

async function seed() {
    console.log('seeding database....');

    // hapus data lama
    await db.delete(transactions);
    await db.delete(users);

    // hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // insert user dummy
    const user1 = await db
        .insert(users)
        .values({
            username: 'tester',  // diperbaiki dari 'taster'
            password: hashedPassword,
        })
        .returning();

    // insert transaction
    await db.insert(transactions).values([
        {
            nominal: 500000.00,
            transactionDate: '2025-10-01', 
            status: 'income',
            description: 'gaji bulanan',
            userId: user1[0].id
        },
        {
            nominal: 500000.00,
            transactionDate: '2025-10-01',
            status: 'income',
            description: 'gaji bulanan',
            userId: user1[0].id
        }
    ]);

    console.log('✅ Seeding completed!');
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
