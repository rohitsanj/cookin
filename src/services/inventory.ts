import { getDb } from '../db/connection.js';

export interface InventoryItem {
  id: number;
  user_phone: string;
  item_name: string;
  category: string | null;
  quantity: string | null;
  is_staple: boolean;
  last_updated: string;
}

interface InventoryRow {
  id: number;
  user_phone: string;
  item_name: string;
  category: string | null;
  quantity: string | null;
  is_staple: number;
  last_updated: string;
}

function deserialize(row: InventoryRow): InventoryItem {
  return { ...row, is_staple: row.is_staple === 1 };
}

export function getInventory(userPhone: string): InventoryItem[] {
  const rows = getDb().prepare(
    'SELECT * FROM inventory_item WHERE user_phone = ? ORDER BY is_staple DESC, item_name ASC'
  ).all(userPhone) as InventoryRow[];
  return rows.map(deserialize);
}

export function addItem(userPhone: string, item: {
  item_name: string;
  category?: string;
  quantity?: string;
  is_staple?: boolean;
}): void {
  getDb().prepare(`
    INSERT INTO inventory_item (user_phone, item_name, category, quantity, is_staple)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_phone, item_name) DO UPDATE SET
      category = COALESCE(excluded.category, category),
      quantity = COALESCE(excluded.quantity, quantity),
      is_staple = excluded.is_staple,
      last_updated = datetime('now')
  `).run(
    userPhone,
    item.item_name.toLowerCase(),
    item.category ?? null,
    item.quantity ?? null,
    item.is_staple ? 1 : 0,
  );
}

export function addItems(userPhone: string, items: Array<{
  item_name: string;
  category?: string;
  quantity?: string;
  is_staple?: boolean;
}>): void {
  const db = getDb();
  const txn = db.transaction(() => {
    for (const item of items) {
      addItem(userPhone, item);
    }
  });
  txn();
}

export function removeItem(userPhone: string, itemName: string): void {
  getDb().prepare(
    'DELETE FROM inventory_item WHERE user_phone = ? AND item_name = ?'
  ).run(userPhone, itemName.toLowerCase());
}

export function removeItemsByIds(userPhone: string, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  getDb().prepare(
    `DELETE FROM inventory_item WHERE user_phone = ? AND id IN (${placeholders})`
  ).run(userPhone, ...ids);
}

export function keepOnlyIds(userPhone: string, idsToKeep: number[]): void {
  if (idsToKeep.length === 0) {
    getDb().prepare('DELETE FROM inventory_item WHERE user_phone = ?').run(userPhone);
    return;
  }
  const placeholders = idsToKeep.map(() => '?').join(',');
  getDb().prepare(
    `DELETE FROM inventory_item WHERE user_phone = ? AND id NOT IN (${placeholders})`
  ).run(userPhone, ...idsToKeep);
}

export function clearInventory(userPhone: string): void {
  getDb().prepare('DELETE FROM inventory_item WHERE user_phone = ?').run(userPhone);
}
