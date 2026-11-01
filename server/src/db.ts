import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

/** 单个 SQLite 文件：LangGraph checkpoint 表 + 景点补充资料库表 */
export const DB_PATH = resolve(process.cwd(), process.env.DB_PATH || 'data/travel.db');
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
export const checkpointer = new SqliteSaver(db);
