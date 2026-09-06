import { migrate } from './migrate';
import { db } from '../src/server/db';
await migrate();
console.log(
  'Database ready. Sample data is created in a private disposable session when you select Explore the sample.',
);
await db.destroy();
process.exit(0);
