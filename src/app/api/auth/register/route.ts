import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, setSessionCookie, type SessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const ADMIN_USERNAME = "victorive";
const ADMIN_HASH = "$2b$12$4d2xSvnM1d3VhbrZSPeXteHVdnB1S2WHki97eSTS6502akne6rgZG";

let seedAttempted = false;
async function ensureAdminSeeded() {
  if (seedAttempted) return;
  seedAttempted = true;
  try {
    await prisma.user.upsert({
      where: { email: ADMIN_USERNAME },
      update: {},
      create: {
        email: ADMIN_USERNAME,
        name: "Victor",
        password: ADMIN_HASH,
        role: "admin",
      },
    });
  } catch (err) {
    // Retry on next call if the DB wasn't reachable.
    seedAttempted = false;
    console.error("Admin seed failed:", err);
  }
}

function toSessionUser(user: { id: string; email: string; name: string | null; role: string }): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// Register
export async function POST(req: NextRequest) {
  try {
    await ensureAdminSeeded();
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, name: String(name), password: hashed, role: "user" },
      select: { id: true, email: true, name: true, role: true },
    });

    const sessionUser = toSessionUser(user);
    const token = signSession(sessionUser);
    const res = NextResponse.json(sessionUser);
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Login
export async function PUT(req: NextRequest) {
  try {
    await ensureAdminSeeded();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true, password: true },
    });
    if (!user || !user.password) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(String(password), user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const sessionUser = toSessionUser(user);
    const token = signSession(sessionUser);
    const res = NextResponse.json(sessionUser);
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
