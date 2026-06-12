const sql = require('mssql/msnodesqlv8');
const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=temp_db1;Trusted_Connection=yes;'
};
console.log('Connecting with Connection String...');
sql.connect(config).then(() => {
  console.log('Connected');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
