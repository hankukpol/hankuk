import { StudentAnalysisPage } from '@/components/exams/analysis/StudentAnalysisPage';
import { requireDivisionAdminAccess } from '@/lib/auth';
import { redirectIfDivisionFeatureDisabled } from '@/lib/division-feature-guard';
import { listExamTypes } from '@/lib/services/exam.service';
export default async function Page({params,searchParams}:{params:{division:string;studentId:string};searchParams:Record<string,string|string[]|undefined>}) {
 await requireDivisionAdminAccess(params.division,['ADMIN','SUPER_ADMIN']);
 await redirectIfDivisionFeatureDisabled(params.division,'examManagement');
 const initial=Object.fromEntries(['kind','examTypeId','examDate','from','to'].flatMap(key=>typeof searchParams[key]==='string'?[[key,searchParams[key] as string]]:[]));
 const types=(await listExamTypes(params.division)).filter(type=>type.isActive);
 return <StudentAnalysisPage division={params.division} studentId={params.studentId} examTypes={types} initial={initial}/>;
}
