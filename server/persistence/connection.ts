import type { PoolConfig } from "pg";

const SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

/**
 * node-postgres options for the game server's pool.
 *
 * With `caCert` (PEM text, e.g. Supabase's "SSL certificate" from Database settings) the server
 * verifies the database certificate against that CA. pg lets connection-string parameters override
 * the `ssl` option, so SSL parameters are removed from the URL in that case.
 * Without it, the URL's own sslmode applies (in pg 8, `require` means full verification).
 */
export function pgPoolConfig(databaseUrl: string, caCert?: string): PoolConfig {
  const base: PoolConfig = { connectionTimeoutMillis: 5_000, max: 5 };
  if (!caCert) return { ...base, connectionString: databaseUrl };

  const url = new URL(databaseUrl);
  for (const param of SSL_PARAMS) url.searchParams.delete(param);
  // Hosting dashboards often store multi-line values with literal "\n".
  const ca = caCert.replace(/\\n/g, "\n");
  return { ...base, connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
