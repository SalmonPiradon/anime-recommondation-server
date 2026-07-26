import * as pg from "pg";

const { Pool } = pg.default;

const pool = new Pool({
  connectionString: process.env.CONNECTION_STRING,
});

export default pool;