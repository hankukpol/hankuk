import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { examPointAutomationSchema } from "@/lib/exam-point-automation";
import { getExamPointSettings } from "@/lib/services/exam-point-settings.service";
export async function GET(_request:NextRequest,{params}:{params:{division:string}}) {
  const auth=await requireApiAuth(params.division,["ADMIN","SUPER_ADMIN"]);
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  try{return NextResponse.json(await getExamPointSettings(params.division),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return toApiErrorResponse(error,"자동 상벌점 설정을 불러오지 못했습니다.",400);}
}
export async function PATCH(request:NextRequest,{params}:{params:{division:string}}) {
  const auth=await requireApiAuth(params.division,["ADMIN","SUPER_ADMIN"]);
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const parsed=examPointAutomationSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  try{
    const { applyAcademySettingsPatch } = await import("@/lib/services/academy-template.service");
    await applyAcademySettingsPatch(params.division,"성적 자동 상벌점 변경",{examPointAutomation:parsed.data},auth.session);
    return NextResponse.json(await getExamPointSettings(params.division));
  }
  catch(error){return toApiErrorResponse(error,"자동 상벌점 설정을 저장하지 못했습니다.",400);}
}
