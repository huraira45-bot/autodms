const sql = require('mssql/msnodesqlv8');

const dbConfig = {
  connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=yes;`,
  // Default request timeout is 15s — bumped so heavier reports (inventory-on-hand
  // joining ~1.1k items across multiple lookups) don't hit the fallback timeout
  // when there's any contention.
  requestTimeout: 60000,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000
  }
};

// Singleton connection pool — created once, reused everywhere
let poolPromise = null;

const getPool = () => {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig).then(pool => {
      console.log('MSSQL Connection Pool created.');
      return pool;
    }).catch(err => {
      poolPromise = null; // Reset so next call retries
      throw err;
    });
  }
  return poolPromise;
};

const connectDB = async () => {
  try {
    await getPool();
    console.log('MSSQL Database Connected Successfully (Windows Authentication).');
  } catch (err) {
    console.error('Database Connection Failed!', err);
    process.exit(1);
  }
};

module.exports = {
  sql,
  connectDB,
  dbConfig,
  getPool
};
