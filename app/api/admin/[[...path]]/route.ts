import { z } from "zod";
import { ApplicationError } from "@/src/application/errors";
import type { SurveyStatus } from "@/src/domain/survey-management";
import { assertSameOrigin, errorResponse, requestIdFrom } from "@/src/infrastructure/http/responses";
import { requireAdminPermission } from "@/src/infrastructure/session/admin-authorization";

export const runtime = "nodejs";

type Context = { params: Promise<{ path?: string[] }> };
const pageSchema = z.coerce.number().int().min(1).default(1);
const sizeSchema = z.coerce.number().int().min(1).max(100).default(20);
const draftSchema = z.object({
  protocolNumber: z.string().trim().min(1).max(120), titleRu: z.string().trim().min(1).max(500), titleKk: z.string().trim().min(1).max(500),
  descriptionRu: z.string().trim().min(1).max(5000), descriptionKk: z.string().trim().min(1).max(5000),
  startsAt: z.coerce.date(), closesAt: z.coerce.date(), expectedLockVersion: z.number().int().positive().optional(),
}).refine((value) => value.closesAt > value.startsAt, { message: "closesAt must be after startsAt", path: ["closesAt"] });
const questionSchema = z.object({ textRu: z.string().trim().min(1).max(5000), textKk: z.string().trim().min(1).max(5000), required: z.boolean().default(true) });
const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("building"), city: z.string().trim().min(1).max(200), street: z.string().trim().min(1).max(300), building: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("property"), propertyId: z.uuid() }),
  z.object({ type: z.literal("personal_account"), personalAccountId: z.uuid() }),
  z.object({ type: z.literal("organization"), organizationId: z.uuid() }),
]);

function query(request: Request) {
  const params = new URL(request.url).searchParams;
  return { page: pageSchema.parse(params.get("page") ?? 1), pageSize: sizeSchema.parse(params.get("pageSize") ?? 20), search: (params.get("search") ?? "").slice(0, 200) };
}

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    const path = (await context.params).path ?? [];
    if (path[0] === "dashboard") { const { app } = await requireAdminPermission("admin.access"); return Response.json(await app.admin.dashboard()); }
    if (path[0] === "surveys" && path.length === 1) {
      const { app } = await requireAdminPermission("survey.read"); const url = new URL(request.url); const status = url.searchParams.get("status") || undefined;
      return Response.json(await app.admin.surveys({ ...query(request), status: status as SurveyStatus | undefined, from: optionalDate(url.searchParams.get("from")), to: optionalDate(url.searchParams.get("to")) }));
    }
    if (path[0] === "surveys" && path[1] && path[2] === "results" && path[3] === "export") {
      const { app, principal } = await requireAdminPermission("export.results"); const csv = await app.admin.exportResults(z.uuid().parse(path[1]), principal.userId, requestId); return csvResponse(csv, `survey-${path[1]}-results.csv`);
    }
    if (path[0] === "surveys" && path[1] && path[2] === "participants" && path[3] === "export") {
      const { app, principal } = await requireAdminPermission("export.participants"); const pii = principal.permissions.includes("participant.pii.read"); const csv = await app.admin.exportParticipants(z.uuid().parse(path[1]), pii, principal.userId, requestId); return csvResponse(csv, `survey-${path[1]}-participants.csv`);
    }
    if (path[0] === "surveys" && path[1] && path[2] === "results") { const { app } = await requireAdminPermission("survey.results.read"); return Response.json(await required(app.admin.results(z.uuid().parse(path[1])))); }
    if (path[0] === "surveys" && path[1] && path[2] === "participants") { const { app, principal } = await requireAdminPermission("participant.read"); const requestedPii=new URL(request.url).searchParams.get("pii")==="true"; return Response.json(await app.admin.participants(z.uuid().parse(path[1]), query(request), requestedPii&&principal.permissions.includes("participant.pii.read"))); }
    if (path[0] === "surveys" && path[1]) { const { app } = await requireAdminPermission("survey.read"); return Response.json(await required(app.admin.survey(z.uuid().parse(path[1])))); }
    if (path[0] === "documents" && path[1]) { const { app } = await requireAdminPermission("document.read"); return Response.json(await required(app.admin.document(z.uuid().parse(path[1])))); }
    if (path[0] === "documents") { const { app } = await requireAdminPermission("document.read"); return Response.json(await app.admin.documents({ ...query(request), status: new URL(request.url).searchParams.get("status") || undefined })); }
    if (path[0] === "audit") { const { app } = await requireAdminPermission("audit.read"); const url = new URL(request.url); return Response.json(await app.admin.audit({ ...query(request), eventType: boundedParam(url,"eventType"), requestId: boundedParam(url,"requestId"), subjectType: boundedParam(url,"subjectType"), subjectId: boundedParam(url,"subjectId"), from: optionalDate(url.searchParams.get("from")), to: optionalDate(url.searchParams.get("to")) })); }
    if (path[0] === "users") { const { app } = await requireAdminPermission("user.manage"); return Response.json(await app.admin.users(query(request))); }
    if (path[0] === "roles") { const { app } = await requireAdminPermission("role.manage"); return Response.json({ items: await app.admin.roles() }); }
    if (path[0] === "references") {
      const { app } = await requireAdminPermission("survey.update_draft");
      const [organizations, properties, accounts] = await Promise.all([
        app.database`select id, display_name as name from organizations where status='active' order by display_name limit 100`,
        app.database`select id, city, street, building, premise from properties where status='active' order by city,street,building,premise limit 500`,
        app.database`select pa.id, pa.account_number as "accountNumber", p.city, p.street, p.building, p.premise from personal_accounts pa join properties p on p.id=pa.property_id where pa.status='active' order by pa.account_number limit 500`,
      ]); return Response.json({ organizations, properties, accounts });
    }
    return new Response(null, { status: 404 });
  } catch (error) { return errorResponse(error, requestId); }
}

export async function POST(request: Request, context: Context) {
  const requestId=requestIdFrom(request);
  try {
    assertSameOrigin(request); const path=(await context.params).path??[];
    if(path[0]==="surveys"&&path.length===1){const {app,principal}=await requireAdminPermission("survey.create");const body=draftSchema.parse(await request.json());return Response.json(await app.admin.create(body,principal.userId,requestId),{status:201});}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]&&path[4]==="duplicate"){const {app,principal}=await requireAdminPermission("survey.update_draft");return Response.json(await app.admin.duplicateQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]&&path[4]==="move"){const {app,principal}=await requireAdminPermission("survey.update_draft");const body=z.object({direction:z.enum(["up","down"])}).parse(await request.json());return Response.json(await app.admin.moveQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body.direction,principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path.length===3){const {app,principal}=await requireAdminPermission("survey.update_draft");const body=questionSchema.parse(await request.json());return Response.json(await app.admin.addQuestion(z.uuid().parse(path[1]),body,principal.userId,requestId),{status:201});}
    if(path[0]==="surveys"&&path[1]&&path[2]==="publish"){const {app,principal}=await requireAdminPermission("survey.publish");return Response.json(await app.admin.publish(z.uuid().parse(path[1]),principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="close"){const {app,principal}=await requireAdminPermission("survey.close");return Response.json(await app.admin.transition(z.uuid().parse(path[1]),"closed",principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="archive"){const {app,principal}=await requireAdminPermission("survey.archive");return Response.json(await app.admin.transition(z.uuid().parse(path[1]),"archived",principal.userId,requestId));}
    if(path[0]==="users"&&path[1]&&path[2]==="roles"){const {app,principal}=await requireAdminPermission("role.manage");const body=z.object({role:z.string()}).parse(await request.json());await app.admin.assignRole(z.uuid().parse(path[1]),body.role,principal.userId,requestId);return new Response(null,{status:204});}
    if(path[0]==="users"&&path[1]&&path[2]==="access"){const {app,principal}=await requireAdminPermission("user.manage");const body=z.object({disabled:z.boolean()}).parse(await request.json());await app.admin.setDisabled(z.uuid().parse(path[1]),body.disabled,principal.userId,requestId);return new Response(null,{status:204});}
    if(path[0]==="imports"&&path[1]==="accounts"&&path[2]==="preview")return previewAccounts(request);
    return new Response(null,{status:404});
  } catch(error){return errorResponse(error,requestId);}
}

export async function PATCH(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="surveys"&&path[1]&&path.length===2){const {app,principal}=await requireAdminPermission("survey.update_draft");const body=draftSchema.parse(await request.json());if(!body.expectedLockVersion)throw new ApplicationError("invalid_request","expectedLockVersion is required");return Response.json(await app.admin.update(z.uuid().parse(path[1]),body,body.expectedLockVersion,principal.userId,requestId));}
  if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]){const {app,principal}=await requireAdminPermission("survey.update_draft");const body=questionSchema.parse(await request.json());return Response.json(await app.admin.updateQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body,principal.userId,requestId));}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

export async function PUT(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="surveys"&&path[1]&&path[2]==="targets"){const {app,principal}=await requireAdminPermission("survey.update_draft");const body=z.object({targets:z.array(targetSchema).min(1).max(5000)}).parse(await request.json());return Response.json(await app.admin.targets(z.uuid().parse(path[1]),body.targets,principal.userId,requestId));}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

export async function DELETE(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]){const {app,principal}=await requireAdminPermission("survey.update_draft");return Response.json(await app.admin.deleteQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),principal.userId,requestId));}
  if(path[0]==="users"&&path[1]&&path[2]==="roles"&&path[3]){const {app,principal}=await requireAdminPermission("role.manage");await app.admin.revokeRole(z.uuid().parse(path[1]),path[3],principal.userId,requestId);return new Response(null,{status:204});}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

async function required<T>(value:Promise<T|null>){const result=await value;if(!result)throw new ApplicationError("not_found","Resource was not found");return result;}
function optionalDate(value:string|null){return value?z.coerce.date().parse(value):undefined;}
function boundedParam(url:URL,name:string){const value=url.searchParams.get(name)?.trim();return value?value.slice(0,200):undefined;}
function csvResponse(csv:string,name:string){return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${name}"`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});}
async function previewAccounts(request:Request){const {app}=await requireAdminPermission("survey.update_draft");const body=z.object({csv:z.string().max(262144)}).parse(await request.json());const lines=body.csv.replace(/^\uFEFF/,"").split(/\r?\n/);if(lines.length>5001)throw new ApplicationError("invalid_request","CSV row limit is 5000");const values=lines.map(line=>line.split(/[;,]/,1)[0].trim().replace(/^"|"$/g,"")).filter(Boolean);const duplicates=values.filter((value,index)=>values.indexOf(value)!==index);const unique=[...new Set(values)].filter(value=>value.length<=128);const resolved=unique.length?await app.database<{id:string;accountNumber:string}[]>`select id,account_number as "accountNumber" from personal_accounts where account_number in ${app.database(unique)} and status='active'`:[];const found=new Set(resolved.map(row=>row.accountNumber));return Response.json({total:values.length,valid:unique.length,invalid:values.length-unique.length,duplicate:new Set(duplicates).size,resolved:resolved.length,unresolved:unique.filter(value=>!found.has(value)),items:resolved});}
