import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// In-memory user store for serverless (will migrate to hosted DB later)
// For production, switch to Vercel Postgres, Supabase, or PlanetScale
const users: Map<string, { id: string; name: string; email: string; password: string; role: string }> = new Map();

// Seed admin account
const ADMIN_HASH = "$2b$12$4d2xSvnM1d3VhbrZSPeXteHVdnB1S2WHki97eSTS6502akne6rgZG";
users.set("victorive", {
  id: "admin_001",
  name: "Victor",
  email: "victorive",
  password: ADMIN_HASH,
  role: "admin",
});

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    if (users.has(email)) {
      return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = `user_${Date.now()}`;

    users.set(email, { id, name, email, password: hashedPassword, role: "user" });

    return NextResponse.json({ id, name, email, role: "user" });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Login endpoint
export async function PUT(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const user = users.get(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
