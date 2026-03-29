import { POST as login } from "@/app/api/student/auth/login/route";
import { POST as logout } from "@/app/api/student/auth/logout/route";

export async function POST(request: Request) {
  return login(request);
}

export async function DELETE() {
  return logout();
}
