import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditEventEntity } from "@src/database/entities";
import { AuditStoreService, computeAuditHash } from "@src/audit/audit-store.service";
import {
  acquireRetentionLock,
  exportAuditRange,
  parseRetentionArgs,
  releaseRetentionLock,
  RetentionError,
  runRetention,
  verifyArchive,
} from "@src/scripts/audit-retention";
import { createTestApp } from "../app.testingModule";

const GENESIS = "0".repeat(64);

describe("Audit retention — export / verify / purge", () => {
  let app: INestApplication;
  let ds: DataSource;
  let auditRepo: Repository<AuditEventEntity>;
  const tmpDirs: string[] = [];

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    ds = result.moduleRef.get(DataSource);
    auditRepo = result.moduleRef.get(getRepositoryToken(AuditEventEntity));
  });

  afterAll(async () => {
    await app.close();
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  const tmpDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-retention-"));
    tmpDirs.push(dir);
    return dir;
  };

  // tests share one table: a clean store per test keeps chains and counts
  // deterministic (hashes are unique-constrained, cross-test rows would
  // interleave into one another's export ranges)
  beforeEach(async () => {
    await auditRepo.query("DELETE FROM audit_events");
  });

  /** A valid chain of `count` rows, one minute apart, starting at baseTime. */
  const seedChain = async (count: number, baseTime: Date): Promise<AuditEventEntity[]> => {
    const rows: AuditEventEntity[] = [];
    let prev = GENESIS;
    for (let i = 0; i < count; i++) {
      const ts = new Date(baseTime.getTime() + i * 60_000);
      const entry = { action: `test.entry.${i}`, outcome: "success", accountId: i + 1 };
      const row = await auditRepo.save(
        auditRepo.create({
          action: entry.action,
          outcome: "success",
          accountId: i + 1,
          createdAt: ts,
          prevHash: prev,
          hash: computeAuditHash(prev, ts, entry),
        }),
      );
      rows.push(row);
      prev = row.hash;
    }
    return rows;
  };

  it("parseRetentionArgs: flags, defaults and misuse", () => {
    const args = parseRetentionArgs([
      "--before",
      "2026-09-01T00:00:00Z",
      "--out",
      "/tmp/arch",
      "--purge-only",
      "--force",
      "--batch",
      "100",
    ]);
    expect(args.before?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(args.outDir).toBe("/tmp/arch");
    expect(args.purgeOnly).toBe(true);
    expect(args.force).toBe(true);
    expect(args.batch).toBe(100);

    expect(() => parseRetentionArgs([])).toThrow(RetentionError);
    expect(() => parseRetentionArgs(["--purge-only"])).toThrow(/--force/);
    expect(() => parseRetentionArgs(["--purge-only", "--export-only", "--force"])).toThrow(
      /mutually exclusive/,
    );
    expect(() => parseRetentionArgs(["--wat"])).toThrow(/unknown flag/);
    expect(() => parseRetentionArgs(["--before", "not-a-date"])).toThrow(/valid date/);
  });

  it("exports a range with a verified archive and a chain-base meta", async () => {
    const base = new Date("2026-09-01T00:00:00Z");
    const rows = await seedChain(6, base);
    const cutoff = new Date(base.getTime() + 4 * 60_000); // rows 0..3 are old

    const { archive, purgedRows } = await runRetention(ds, {
      before: cutoff,
      outDir: tmpDir(),
      exportOnly: true,
      purgeOnly: false,
      force: false,
      noVerify: false,
      batch: 2, // force multiple chunks
    });

    expect(purgedRows).toBe(0);
    expect(archive).not.toBeNull();
    expect(archive!.meta.rows).toBe(4);
    expect(archive!.meta.firstId).toBe(rows[0].id);
    expect(archive!.meta.lastId).toBe(rows[3].id);
    expect(archive!.meta.lastHash).toBe(rows[3].hash);
    expect(archive!.meta.verified).toBe(true);

    // uncompressed sha256 in the meta matches the actual file content
    const raw = zlib.gunzipSync(fs.readFileSync(archive!.file));
    expect(crypto.createHash("sha256").update(raw).digest("hex")).toBe(archive!.meta.sha256);

    // export-only touches nothing
    expect(await auditRepo.count()).toBe(6);
  });

  it("verifyArchive detects a tampered row", async () => {
    await seedChain(3, new Date("2026-09-01T00:00:00Z"));
    const dir = tmpDir();
    const { archive } = await runRetention(ds, {
      before: new Date("2026-09-02T00:00:00Z"),
      outDir: dir,
      exportOnly: true,
      purgeOnly: false,
      force: false,
      noVerify: false,
      batch: 5000,
    });

    const lines = zlib
      .gunzipSync(fs.readFileSync(archive!.file))
      .toString()
      .split("\n")
      .filter((line) => line.length > 0);
    const tampered = JSON.parse(lines[1]);
    tampered.action = "test.evil"; // content no longer matches its hash
    lines[1] = JSON.stringify(tampered);
    const badFile = path.join(dir, "bad.ndjson.gz");
    fs.writeFileSync(badFile, zlib.gzipSync(Buffer.from(lines.join("\n") + "\n")));

    const verdict = await verifyArchive(badFile);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAt).toBe(tampered.id);
  });

  it("full run: export → purge → audit.purged → chain still verifiable via baseHash", async () => {
    const base = new Date("2026-09-05T00:00:00Z");
    const rows = await seedChain(6, base);
    const cutoff = new Date(base.getTime() + 4 * 60_000);

    const { archive, purgedRows } = await runRetention(ds, {
      before: cutoff,
      outDir: tmpDir(),
      exportOnly: false,
      purgeOnly: false,
      force: false,
      noVerify: false,
      batch: 5000,
    });

    expect(purgedRows).toBe(4);
    const remaining = await auditRepo.find({ order: { id: "ASC" } });
    // the 2 surviving seeded rows + the audit.purged record
    expect(remaining.map((row) => row.action)).toEqual([
      "test.entry.4",
      "test.entry.5",
      "audit.purged",
    ]);

    const purgedRecord = remaining[remaining.length - 1];
    expect(purgedRecord.details).toMatchObject({
      purgedRows: 4,
      archive: path.basename(archive!.file),
    });

    const store = new AuditStoreService(auditRepo);
    const survivor = remaining[0];

    // verify(fromId) scans rows AFTER fromId trusting it — the operator
    // anchors at the purge boundary recorded in the meta (meta.lastId).
    // Blind (without the base hash) the chain honestly reports broken at
    // the first survivor.
    const blind = await store.verify(archive!.meta.lastId);
    expect(blind.valid).toBe(false);
    expect(blind.brokenAt).toBe(survivor.id);

    // with the chain base from the export meta the archive-backed window is provable
    const withBase = await store.verify(
      archive!.meta.lastId,
      undefined,
      archive!.meta.lastHash,
    );
    expect(withBase.valid).toBe(true);
    expect(withBase.checked).toBe(3);
  });

  it("advisory lock: a second run is rejected while one holds it", async () => {
    const first = await acquireRetentionLock(ds);
    expect(first).not.toBeNull();
    try {
      const second = await acquireRetentionLock(ds);
      expect(second).toBeNull();
    } finally {
      await releaseRetentionLock(first!);
    }
    const third = await acquireRetentionLock(ds);
    expect(third).not.toBeNull();
    await releaseRetentionLock(third!);
  });

  it("exportAuditRange writes parseable ndjson whose rows re-verify", async () => {
    await seedChain(4, new Date("2026-09-07T00:00:00Z"));
    const archive = await exportAuditRange(
      ds,
      { before: new Date("2026-09-08T00:00:00Z") },
      tmpDir(),
      3,
    );
    const verdict = await verifyArchive(archive.file);
    expect(verdict.valid).toBe(true);
    expect(verdict.checked).toBe(4);
  });
});
