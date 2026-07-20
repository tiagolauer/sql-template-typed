import { describe, expect, it } from 'vitest';
import { mssqlUrlToConfig } from '../src/cli/dialects/mssql.js';
import { detectDialect } from '../src/cli/generate.js';

describe('mssqlUrlToConfig', () => {
  it('translates a full mssql:// URL into a driver config', () => {
    expect(mssqlUrlToConfig('mssql://sa:S3cret@db.example.com:1433/app')).toEqual({
      server: 'db.example.com',
      user: 'sa',
      password: 'S3cret',
      database: 'app',
      port: 1433,
      options: { encrypt: true, trustServerCertificate: false },
    });
  });

  it('decodes percent-encoded credentials', () => {
    const config = mssqlUrlToConfig('sqlserver://u%40corp:p%23ss@host/db');
    expect(config.user).toBe('u@corp');
    expect(config.password).toBe('p#ss');
  });

  it('omits absent parts and honors query flags', () => {
    expect(mssqlUrlToConfig('mssql://host?encrypt=false&trustServerCertificate=true')).toEqual({
      server: 'host',
      options: { encrypt: false, trustServerCertificate: true },
    });
  });
});

describe('detectDialect for SQL Server inputs', () => {
  it('routes mssql:// and sqlserver:// URLs to mssql', () => {
    expect(detectDialect('mssql://host/db')).toBe('mssql');
    expect(detectDialect('sqlserver://host/db')).toBe('mssql');
  });

  it('routes ADO key=value strings to mssql instead of sqlite', () => {
    expect(detectDialect('Server=host;Database=db;User Id=u;Password=p')).toBe('mssql');
    expect(detectDialect('Data Source=host;Initial Catalog=db')).toBe('mssql');
  });

  it('still treats plain paths as sqlite', () => {
    expect(detectDialect('./app.db')).toBe('sqlite');
  });
});
