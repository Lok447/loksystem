import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { ALL_MIGRATIONS, runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

let nativeModuleAvailable = true;
try {
  const d = new BetterSqlite3Driver(':memory:');
  d.close();
} catch (e) {
  if (e instanceof Error && e.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('migration v27: core task runtime records', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 26);
  });

  afterEach(() => {
    driver.close();
  });

  it('creates core_task_runtime_records table with runtime metadata columns', () => {
    runMigrations(driver, 26, 27);

    const cols = (driver.pragma('table_info(core_task_runtime_records)') as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('conversation_id');
    expect(cols).toContain('task_type');
    expect(cols).toContain('state');
    expect(cols).toContain('workspace');
    expect(cols).toContain('created_at');
    expect(cols).toContain('updated_at');
    expect(cols).toContain('last_activity_at');
    expect(cols).toContain('last_event');
    expect(cols).toContain('last_reason');
    expect(cols).toContain('metadata');
  });

  it('rollback drops the runtime record table', () => {
    runMigrations(driver, 26, 27);
    ALL_MIGRATIONS.find((m) => m.version === 27)!.down(driver);

    const tables = driver
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='core_task_runtime_records'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
  });
});
