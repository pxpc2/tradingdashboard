import { login } from "./actions";
import SubmitButton from "./SubmitButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params?.error === "invalid";

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <p className="mt-2 text-center text-sm text-[#444]">
            trading dashboard
          </p>
        </div>

        <form action={login} className="space-y-4">
          <div>
            <div>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="email"
                autoComplete="email"
                className="block w-full rounded-t-sm bg-[#111111] border border-[#1f1f1f] px-3 py-2 text-sm text-white placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
              />
            </div>
            <div className="-mt-px">
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="senha"
                autoComplete="current-password"
                className="block w-full rounded-b-sm bg-[#111111] border border-[#1f1f1f] px-3 py-2 text-sm text-white placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
              />
            </div>
          </div>

          {hasError && (
            <p className="text-xs text-[#f87171]">email ou senha incorretos</p>
          )}

          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
