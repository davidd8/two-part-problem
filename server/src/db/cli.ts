import fs from 'node:fs'
import { env } from '../env.js'
import { createDatabase, openDatabase } from './index.js'
import { runMigrations } from './migrate.js'
import { seed } from './seed.js'

const command = process.argv[2]

switch (command) {
  case 'migrate': {
    const db = openDatabase()
    const ran = runMigrations(db)
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Already up to date')
    db.close()
    break
  }
  case 'seed': {
    const db = createDatabase()
    const inserted = seed(db)
    console.log(inserted ? `Seeded ${inserted} tasks` : 'Table not empty, nothing seeded')
    db.close()
    break
  }
  case 'reset': {
    if (env.databaseFile !== ':memory:') {
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${env.databaseFile}${suffix}`, { force: true })
      }
      console.log(`Deleted ${env.databaseFile}`)
    }
    const db = createDatabase()
    const inserted = seed(db)
    console.log(`Recreated schema and seeded ${inserted} tasks`)
    db.close()
    break
  }
  default:
    console.error('Usage: db:migrate | db:seed | db:reset')
    process.exit(1)
}
