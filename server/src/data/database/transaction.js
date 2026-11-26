// DATA LAYER: runs several SQL statements as ONE all-or-nothing unit (a "transaction").
// If every statement works, they are all saved (COMMIT). If any statement throws an error, everything
// done so far is undone (ROLLBACK), so the database never keeps half of the work.
// "work" is an async function that receives the connection and runs its queries on it.
export async function withTransaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    connection.release(); // always give the connection back to the pool
  }
}
