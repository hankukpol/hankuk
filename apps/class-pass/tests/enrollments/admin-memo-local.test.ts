import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

// Opt-in integration command only. Never load .env.local or allow a remote target.
process.loadEnvFile('.env.development.local')
const base = 'http://localhost:3002'
const db = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY!, {db:{schema:'class_pass'},auth:{persistSession:false,autoRefreshToken:false}})
const key = new TextEncoder().encode('class-pass-local-preview-only-20260905-secret')

test('admin memos persist per enrollment, preserve creation date and reject stale/cross-course/unauthorized writes', async () => {
  const stamp = `${Date.now()}`
  const {data:courseRows,error:courseError} = await db.from('courses').insert(['A','B'].map(s=>({name:`메모 회귀검증 ${s} ${stamp}`,slug:`memo-test-${s.toLowerCase()}-${stamp}`,division:'police',course_type:'general'}))).select('id')
  assert.ifError(courseError)
  const courseIds = courseRows!.map(r=>r.id)
  let studentId:number|undefined
  try {
    const {data:student,error:studentError} = await db.from('students').insert({division:'police',name:'메모 격리 검증',phone:'010-9999-9888',exam_number:`MEMO${stamp}`}).select('id').single()
    assert.ifError(studentError);studentId=student!.id
    const {data:rows,error} = await db.from('enrollments').insert(courseIds.map(course_id=>({course_id,student_id:studentId,name:'메모 격리 검증',phone:'010-9999-9888',exam_number:`MEMO${stamp}`}))).select('id,course_id')
    assert.ifError(error)
    const [a,b]=rows!
    const {data:config} = await db.from('app_config').select('value').eq('key','police::admin_session_version').maybeSingle()
    const token = await new SignJWT({role:'admin',division:'police',adminId:'memo-test',staffName:'검증 관리자',sessionVersion:Number(config?.value??1)}).setProtectedHeader({alg:'HS256'}).setSubject('memo-test').setIssuedAt().setExpirationTime('5m').sign(key)
    const request = (row:typeof a, method='GET', body?:unknown, options:{cookie?:string;origin?:string;courseId?:number}={}) => fetch(`${base}/police/api/enrollments/${row.id}/admin-memo?courseId=${options.courseId??row.course_id}`,{
      method,headers:{'Content-Type':'application/json',Origin:options.origin??base,Cookie:options.cookie??`cp_admin__police=${token}`},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',
    })
    const empty = await request(a)
    assert.equal(empty.status,200,'new authenticated endpoint must return the empty memo')
    assert.equal((await empty.json()).memo,null)
    assert.match(empty.headers.get('cache-control')??'',/no-store/)
    let createdAt:string|null=null
    const payload = (row:typeof a,body:string,expectedRevision:number|null=null)=>({courseId:row.course_id,body,expectedRevision,expectedCreatedAt:expectedRevision===null?null:createdAt})
    const saved = await request(a,'PUT',payload(a,'A 강좌 상담'))
    assert.equal(saved.status,200)
    const first = (await saved.json()).memo
    createdAt=first.created_at
    assert.equal(first.body,'A 강좌 상담');assert.equal(first.revision,1);assert.ok(Date.parse(first.created_at))
    assert.equal((await (await request(b)).json()).memo,null,'same student in B must not inherit A memo')
    assert.equal((await request(b,'PUT',payload(b,'B 강좌 상담'))).status,200)
    const changed = await request(a,'PUT',payload(a,'A 강좌 상담 수정',1))
    assert.equal(changed.status,200)
    const updated=(await changed.json()).memo
    assert.equal(updated.created_at,first.created_at);assert.equal(updated.revision,2)
    assert.ok(Date.parse(updated.updated_at)>=Date.parse(first.updated_at))
    assert.equal((await request(a,'PUT',payload(a,'오래된 수정',1))).status,409)
    assert.equal((await request(a,'PUT',payload(a,'중복 등록'))).status,409)
    assert.equal((await request(a,'PUT',payload(b,'다른 강좌 침범'),{courseId:b.course_id})).status,404)
    assert.equal((await request(a,'GET',undefined,{cookie:''})).status,401)
    assert.equal((await request(a,'PUT',payload(a,'잘못된 출처',2),{origin:'https://invalid.example'})).status,403)
    assert.equal((await request(a,'PUT',payload(a,'   ',2))).status,400)
    assert.equal((await request(a,'PUT',payload(a,'x'.repeat(2001),2))).status,400)
    const persisted = await db.from('enrollment_admin_memos').select('enrollment_id,body,revision').in('enrollment_id',[a.id,b.id]).order('enrollment_id')
    assert.ifError(persisted.error)
    assert.deepEqual(persisted.data,[{enrollment_id:a.id,body:'A 강좌 상담 수정',revision:2},{enrollment_id:b.id,body:'B 강좌 상담',revision:1}])
    const anon = createClient('http://127.0.0.1:54321',process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{db:{schema:'class_pass'},auth:{persistSession:false}})
    const denied=await anon.from('enrollment_admin_memos').select('*')
    assert.ok(denied.error || denied.data?.length===0,'anonymous Data API cannot read private notes')
    const deleteBody = {courseId:a.course_id,expectedRevision:2,expectedCreatedAt:first.created_at}
    assert.equal((await request(a,'DELETE',{...deleteBody,expectedRevision:1})).status,409,'stale delete cannot remove a newer memo')
    const removed=await request(a,'DELETE',deleteBody)
    assert.equal(removed.status,200)
    assert.equal((await (await request(a)).json()).memo,null)
    assert.equal((await (await request(b)).json()).memo.body,'B 강좌 상담','deleting A leaves B intact')
    const recreated=await request(a,'PUT',payload(a,'다시 작성한 메모'))
    assert.equal(recreated.status,200)
    assert.equal((await request(a,'DELETE',{...deleteBody,expectedRevision:1})).status,409,'deleted then recreated memo cannot be deleted by old revision 1')
    assert.equal((await request(a,'PUT',payload(a,'오래된 화면 덮어쓰기',1))).status,409,'recreated memo is also protected against an old update')
    const listUrl=`${base}/police/api/courses/${a.course_id}/admin-memos?ids=${a.id},${b.id}`
    const listed=await fetch(listUrl,{headers:{Cookie:`cp_admin__police=${token}`}})
    assert.equal(listed.status,200)
    const memos=(await listed.json()).memos
    assert.deepEqual(memos.map((memo:{enrollment_id:number})=>memo.enrollment_id),[a.id],'list only exposes requested course enrollments')
    assert.equal((await fetch(listUrl,{redirect:'manual'})).status,401)
    assert.equal((await request(a,'DELETE',{...deleteBody,courseId:b.course_id})).status,404)
    assert.equal((await request(a,'DELETE',deleteBody,{cookie:''})).status,401)
    const tooMany=await fetch(`${base}/police/api/courses/${a.course_id}/admin-memos?ids=${Array(101).fill(a.id).join(',')}`,{headers:{Cookie:`cp_admin__police=${token}`}})
    assert.equal(tooMany.status,400,'list read is bounded to one roster page')
    const otherDivision=await fetch(`${base}/fire/api/courses/${a.course_id}/admin-memos?ids=${a.id}`,{headers:{Cookie:`cp_admin__fire=${token}`}})
    assert.ok([401,403].includes(otherDivision.status),'police administrator cannot read fire-scoped memos')
  } finally {
    const deleted = await db.from('courses').delete().in('id',courseIds)
    assert.ifError(deleted.error)
    if(studentId){const deletedStudent=await db.from('students').delete().eq('id',studentId);assert.ifError(deletedStudent.error)}
  }
})
