import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/todos          → all todos
// GET /api/todos?count=1  → { count } of active (done=0) todos, for the nav badge
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  if (request.nextUrl.searchParams.get("count")) {
    const row = first(await db.execute("SELECT COUNT(*) AS count FROM todos WHERE done = 0"));
    return NextResponse.json({ count: Number(row?.count ?? 0) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const result = await db.execute("SELECT * FROM todos ORDER BY done ASC, created_at DESC");
  return NextResponse.json({ todos: all(result) }, {
    // Hot-write personal list — toggles happen often, so never serve stale.
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST /api/todos  body { text, priority?, detail? }
export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { text, priority, detail, category } = await request.json();

  if (!text || !text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const session = await getSession();
  const owner = session?.username || "";
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `INSERT INTO todos (text, detail, priority, category, owner, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [text.trim(), (detail || "").trim(), priority || "medium", category || "general", owner, now, now],
  });

  const todo = first(await db.execute({ sql: "SELECT * FROM todos WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(todo, { status: 201 });
}
