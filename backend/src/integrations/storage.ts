// Private evidence storage. Files are never served statically; access goes through authorized API routes.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface EvidenceStorage { put(data: Buffer): Promise<{ id: string; sha256: string }>; get(id: string): Promise<Buffer | null>; delete(id: string): Promise<boolean> }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export class MemoryEvidenceStorage implements EvidenceStorage {
  files = new Map<string, Buffer>();
  async put(d: Buffer) { const id = randomUUID(); this.files.set(id, d); return { id, sha256: sha(d) }; }
  async get(id: string) { return this.files.get(id) ?? null; }
  async delete(id: string) { return this.files.delete(id); }
}
export class LocalEvidenceStorage implements EvidenceStorage {
  dir: string; constructor(dir: string) { this.dir = dir; }
  async put(d: Buffer) { await mkdir(this.dir, { recursive: true, mode: 0o700 }); const id = randomUUID(); await writeFile(join(this.dir, id), d, { mode: 0o600 }); return { id, sha256: sha(d) }; }
  async get(id: string) { if (!/^[0-9a-f-]{36}$/.test(id)) return null; try { return await readFile(join(this.dir, id)); } catch { return null; } }
  async delete(id: string) { if (!/^[0-9a-f-]{36}$/.test(id)) return false; try { await unlink(join(this.dir, id)); return true; } catch { return false; } }
}
