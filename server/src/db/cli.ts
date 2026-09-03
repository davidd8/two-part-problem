import { openDatabase } from './index.js'
import { resetSchema, runMigrations } from './migrate.js'
import { seed } from './seed.js'

const command = process.argv[2]
const db = openDatabase()

switch (command) {
  case 'migrate': {
    const ran = runMigrations(db)
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Already up to date')
    break
  }
  case 'seed': {
    runMigrations(db)
    const inserted = seed(db)
    console.log(inserted ? `Seeded ${inserted} tasks` : 'Table not empty, nothing seeded')
    break
  }
  case 'reset': {
    resetSchema(db)
    runMigrations(db)
    const inserted = seed(db)
    console.log(`Dropped all tables, re-ran migrations, seeded ${inserted} tasks`)
    break
  }
  case 'checkpoint': {
    // Folds the -wal file back into the main database file so external
    // viewers that read only app.sqlite see the latest writes.
    db.pragma('wal_checkpoint(TRUNCATE)')
    console.log('WAL checkpointed into the main database file')
    break
  }
  default:
    console.error('Usage: db:migrate | db:seed | db:reset | db:checkpoint')
    process.exit(1)
}

db.close()
