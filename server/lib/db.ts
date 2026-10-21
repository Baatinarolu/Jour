// Public storage facade used by every server route.
// Uses Upstash/Vercel Redis when configured, otherwise the local file driver.
export {
  createUser,
  getJournal,
  getStorageDriver,
  getStorageInfo,
  getUserByEmail,
  getUserById,
  listUsersCount,
  saveJournal,
  storageSelfTest,
} from "./kv-store.ts";
export type { UserRecord, JournalRecord } from "./kv-store.ts";
export { mergeBackups } from "./db-file.ts";
