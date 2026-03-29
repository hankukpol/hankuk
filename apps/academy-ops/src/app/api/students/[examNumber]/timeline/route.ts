import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentTimeline, parseTimelineDays } from "@/lib/students/timeline";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const days = parseTimelineDays(url.searchParams.get("days"));
    const data = await getStudentTimeline({ examNumber: params.examNumber, days });

    if (!data) {
      return NextResponse.json(
        { error: "\uD559\uC0DD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid timeline days parameter.") {
      return NextResponse.json(
        { error: "days \uD30C\uB77C\uBBF8\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." },
        { status: 400 },
      );
    }

    console.error("Failed to load student timeline", error);
    return NextResponse.json(
      { error: "\uD0C0\uC784\uB77C\uC778 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." },
      { status: 500 },
    );
  }
}
