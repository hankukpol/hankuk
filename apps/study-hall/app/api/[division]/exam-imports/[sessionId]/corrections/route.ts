import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getExamCorrection, saveExamCorrection } from "@/lib/services/exam-correction.service";
export const runtime="nodejs";
type Context={params:{division:string;sessionId:string}};
async function handle(request:NextRequest,{params}:Context,save:boolean) {
  try {
    const auth=await requireApiAuth(params.division,["ADMIN","SUPER_ADMIN"]);
    if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
    const disabled=await getDivisionFeatureDisabledError(params.division,"examManagement");
    if(disabled) return NextResponse.json({error:disabled},{status:403});
    const data=save ? await saveExamCorrection(params.division,auth.session,params.sessionId,await request.json()) : await getExamCorrection(params.division,auth.session,params.sessionId);
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return toApiErrorResponse(error,"성적 정정을 처리하지 못했습니다."); }
}
export const GET=(request:NextRequest,context:Context)=>handle(request,context,false);
export const POST=(request:NextRequest,context:Context)=>handle(request,context,true);
