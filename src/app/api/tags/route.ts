import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tags = await db.select().from(schema.tags).all();
  return NextResponse.json({ tags });
}
