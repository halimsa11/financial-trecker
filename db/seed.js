import 'dotenv/config';
import { db } from './index.js';
import bcrypt from 'bcryptjs';
import { transactions, users } from './schema.js';

async function seed() {
  console.log('Seeding database...');
  
  // Hapus data existing
  await db.delete(transactions);
  await db.delete(users);

  const hashedPassword = await bcrypt.hash('password123', 10);

  const user1 = await db
    .insert(users)
    .values({
      username: 'tester',
      password: hashedPassword,
    })
    .returning();

  console.log('Created user:', user1[0]);

  await db.insert(transactions).values([
    { 
      nominal: '5000000.00', 
      transactionDate: '2025-10-01 10:00:00', 
      status: 'income', 
      description: 'Gaji Bulanan', 
      userId: user1[0].id 
    },
    { 
      nominal: '500000.00', 
      transactionDate: '2025-10-05 15:30:00', 
      status: 'outcome', 
      description: 'Bayar Listrik', 
      userId: user1[0].id 
    },
  ]);

  console.log('✅ Seeding completed!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});