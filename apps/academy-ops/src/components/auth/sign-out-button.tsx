import { signOutAction } from "@/app/login/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/40 hover:text-ember"
      >
        로그아웃
      </button>
    </form>
  );
}
