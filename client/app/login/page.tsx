"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <div className="text-xs text-[#444] uppercase tracking-widest text-center mb-2">
          vovonacci
        </div>
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-3 py-2 text-sm text-white outline-none"
        />
        <input
          type="password"
          placeholder="senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-3 py-2 text-sm text-white outline-none"
        />
        {error && <div className="text-xs text-[#f87171]">{error}</div>}
        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="bg-white text-black text-sm font-medium py-2 px-6 rounded-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:cursor-pointer"
        >
          {loading ? "entrando..." : "entrar"}
        </button>
      </div>
    </main>
  );
}
