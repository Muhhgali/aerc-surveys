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
  organizationId: z.uuid().optional(), meetingForm: z.enum(["in_person", "absentee", "mixed", "electronic"]).optional(),
  documentLanguage: z.enum(["ru", "kk", "bilingual"]).optional(),
}).refine((value) => value.closesAt > value.startsAt, { message: "closesAt must be after startsAt", path: ["closesAt"] });
const questionSchema = z.object({
  textRu: z.string().trim().min(1).max(5000), textKk: z.string().trim().min(1).max(5000), required: z.boolean().default(true),
  votingRule: z.object({ type: z.enum(["percentage_of_all_eligible", "percentage_of_participants", "two_thirds_of_all", "two_thirds_of_participants", "custom_percentage"]), thresholdPercent: z.number().positive().max(100) }).optional(),
});
const contactSchema = {
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(32).optional(),
  contactEmail: z.string().trim().max(200).optional(),
};
const organizationSchema = z.object({
  bin: z.string().trim().min(12).max(20), legalName: z.string().trim().min(2).max(300), displayName: z.string().trim().min(2).max(200),
  type: z.enum(["osi", "ksk", "management_company", "other"]), ...contactSchema,
});
const organizationUpdateSchema = z.object({
  legalName: z.string().trim().min(2).max(300), displayName: z.string().trim().min(2).max(200),
  type: z.enum(["osi", "ksk", "management_company", "other"]), status: z.enum(["active", "inactive"]), ...contactSchema,
});
const organizationUserSchema = z.object({
  displayName: z.string().trim().min(3).max(200), login: z.string().trim().min(3).max(64), password: z.string().min(10).max(128),
  email: z.string().trim().max(200).optional(), phone: z.string().trim().max(32).optional(), role: z.string().trim().max(64),
});
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
    if (path[0] === "dashboard") { const { app, principal } = await requireAdminPermission("admin.access"); const dashboard = await app.admin.dashboard(principal); return Response.json({ ...dashboard, attention: await app.admin.attention(principal.userId) }); }
    if (path[0] === "surveys" && path.length === 1) {
      const { app, principal } = await requireAdminPermission("survey.read"); const url = new URL(request.url); const status = url.searchParams.get("status") || undefined;
      return Response.json(await app.admin.surveys({ ...query(request), status: status as SurveyStatus | undefined, from: optionalDate(url.searchParams.get("from")), to: optionalDate(url.searchParams.get("to")) }, principal));
    }
    if (path[0] === "surveys" && path[1] && path[2] === "results" && path[3] === "export") {
      const { app, principal } = await requireAdminPermission("export.results", { surveyId: path[1] }); const csv = await app.admin.exportResults(z.uuid().parse(path[1]), principal, requestId); return csvResponse(csv, `survey-${path[1]}-results.csv`);
    }
    if (path[0] === "surveys" && path[1] && path[2] === "participants" && path[3] === "export") {
      const { app, principal } = await requireAdminPermission("export.participants", { surveyId: path[1] }); const pii = principal.permissions.includes("participant.pii.read"); const csv = await app.admin.exportParticipants(z.uuid().parse(path[1]), pii, principal.userId, requestId); return csvResponse(csv, `survey-${path[1]}-participants.csv`);
    }
    if (path[0] === "surveys" && path[1] && path[2] === "results") { const { app } = await requireAdminPermission("survey.progress.read", { surveyId: path[1] }); return Response.json(await required(app.admin.results(z.uuid().parse(path[1])))); }
    if (path[0] === "surveys" && path[1] && path[2] === "progress") { const { app } = await requireAdminPermission("survey.progress.read", { surveyId: path[1] }); return Response.json(await required(app.admin.progress(z.uuid().parse(path[1])))); }
    if (path[0] === "surveys" && path[1] && path[2] === "participants") { const { app, principal } = await requireAdminPermission("participant.read", { surveyId: path[1] }); const requestedPii=new URL(request.url).searchParams.get("pii")==="true"; return Response.json(await app.admin.participants(z.uuid().parse(path[1]), query(request), requestedPii&&principal.permissions.includes("participant.pii.read"))); }
    if (path[0] === "surveys" && path[1]) { const { app } = await requireAdminPermission("survey.read", { surveyId: path[1] }); return Response.json(await required(app.admin.survey(z.uuid().parse(path[1])))); }
    if (path[0] === "organizations" && path[1] && path[2] === "users") { const { app, principal } = await requireAdminPermission("user.invite", { organizationId: path[1] }); return Response.json({ items: await app.admin.organizationUsers(z.uuid().parse(path[1]), principal) }); }
    if (path[0] === "organizations" && path.length === 1) { const { app, principal } = await requireAdminPermission("survey.read"); return Response.json({ items: await app.admin.organizations(principal) }); }
    if (path[0] === "users" && path[1] === "search") { const { app, principal } = await requireAdminPermission("survey.read"); return Response.json({ items: await app.admin.searchUsers(new URL(request.url).searchParams.get("q") ?? "", principal) }); }
    if (path[0] === "attention") { const { app, principal } = await requireAdminPermission("admin.access"); return Response.json({ items: await app.admin.attention(principal.userId) }); }
    if (path[0] === "documents" && path[1]) { const { app, principal } = await requireAdminPermission("document.read"); return Response.json(await required(app.admin.document(z.uuid().parse(path[1]), principal))); }
    if (path[0] === "documents") { const { app, principal } = await requireAdminPermission("document.read"); return Response.json(await app.admin.documents({ ...query(request), status: new URL(request.url).searchParams.get("status") || undefined }, principal)); }
    if (path[0] === "audit") { const { app } = await requireAdminPermission("audit.read"); const url = new URL(request.url); return Response.json(await app.admin.audit({ ...query(request), eventType: boundedParam(url,"eventType"), requestId: boundedParam(url,"requestId"), subjectType: boundedParam(url,"subjectType"), subjectId: boundedParam(url,"subjectId"), from: optionalDate(url.searchParams.get("from")), to: optionalDate(url.searchParams.get("to")) })); }
    if (path[0] === "users") { const { app } = await requireAdminPermission("user.manage"); return Response.json(await app.admin.users(query(request))); }
    if (path[0] === "roles") { const { app } = await requireAdminPermission("role.manage"); return Response.json({ items: await app.admin.roles() }); }
    if (path[0] === "references") {
      const { app, principal } = await requireAdminPermission("survey.create");
      const allowedOrganizations = principal.platformWide ? null : principal.organizationGrants.map((grant) => grant.organizationId);
      const [organizations, properties, accounts] = await Promise.all([
        app.database`select id, display_name as name from organizations where status='active' and (${allowedOrganizations}::uuid[] is null or id = any(${allowedOrganizations}::uuid[])) order by display_name limit 100`,
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
    if(path[0]==="surveys"&&path.length===1){const body=draftSchema.parse(await request.json());const {app,principal}=await requireAdminPermission("survey.create",{organizationId:body.organizationId});return Response.json(await app.admin.create(body,principal,requestId),{status:201});}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]&&path[4]==="duplicate"){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});return Response.json(await app.admin.duplicateQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]&&path[4]==="move"){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});const body=z.object({direction:z.enum(["up","down"])}).parse(await request.json());return Response.json(await app.admin.moveQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body.direction,principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path.length===3){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});const body=questionSchema.parse(await request.json());return Response.json(await app.admin.addQuestion(z.uuid().parse(path[1]),body,principal.userId,requestId),{status:201});}
    if(path[0]==="surveys"&&path[1]&&path[2]==="publish"){const {app,principal}=await requireAdminPermission("survey.publish",{surveyId:path[1]});return Response.json(await app.admin.publish(z.uuid().parse(path[1]),principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="close"){const {app,principal}=await requireAdminPermission("survey.close",{surveyId:path[1]});return Response.json(await app.admin.transition(z.uuid().parse(path[1]),"closed",principal.userId,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="archive"){const {app,principal}=await requireAdminPermission("survey.archive",{surveyId:path[1]});return Response.json(await app.admin.transition(z.uuid().parse(path[1]),"archived",principal.userId,requestId));}
    if(path[0]==="users"&&path[1]&&path[2]==="roles"){const {app,principal}=await requireAdminPermission("role.manage");const body=z.object({role:z.string()}).parse(await request.json());await app.admin.assignRole(z.uuid().parse(path[1]),body.role,principal,requestId);return new Response(null,{status:204});}
    if(path[0]==="users"&&path[1]&&path[2]==="access"){const {app,principal}=await requireAdminPermission("user.manage");const body=z.object({disabled:z.boolean()}).parse(await request.json());await app.admin.setDisabled(z.uuid().parse(path[1]),body.disabled,principal.userId,requestId);return new Response(null,{status:204});}
    if(path[0]==="invitations"&&path.length===1){const {app,principal}=await requireAdminPermission("user.invite");const body=z.object({email:z.string().email(),displayName:z.string().trim().min(1).max(200),organizationId:z.uuid(),organizationRole:z.string(),permissions:z.array(z.string()).default([])}).parse(await request.json());return Response.json(await app.admin.invite(body,principal,requestId),{status:201});}
    if(path[0]==="organizations"&&path.length===1){const {app,principal}=await requireAdminPermission("org.manage");const body=organizationSchema.parse(await request.json());return Response.json(await app.admin.createOrganization(body,principal.userId,requestId),{status:201});}
    if(path[0]==="organizations"&&path[1]&&path[2]==="users"&&path.length===3){const {app,principal}=await requireAdminPermission("user.invite",{organizationId:path[1]});const body=organizationUserSchema.parse(await request.json());return Response.json(await app.admin.createOrganizationUser(z.uuid().parse(path[1]),body,principal,requestId),{status:201});}
    if(path[0]==="organizations"&&path[1]&&path[2]==="users"&&path[3]&&path[4]==="password"){const {app,principal}=await requireAdminPermission("user.invite",{organizationId:path[1]});const body=z.object({password:z.string().min(10).max(128)}).parse(await request.json());return Response.json(await app.admin.resetOrganizationUserPassword(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body.password,principal,requestId));}
    if(path[0]==="organizations"&&path[1]&&path[2]==="users"&&path[3]&&path[4]==="role"){const {app,principal}=await requireAdminPermission("user.invite",{organizationId:path[1]});const body=z.object({role:z.string().max(64)}).parse(await request.json());return Response.json(await app.admin.setOrganizationUserRole(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body.role,principal,requestId));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="protocol"){const {app,principal}=await requireAdminPermission("protocol.generate",{surveyId:path[1]});return Response.json(await app.admin.generateProtocol(z.uuid().parse(path[1]),principal.userId,requestId,new URL(request.url).origin));}
    if(path[0]==="surveys"&&path[1]&&path[2]==="signatures"){const {app,principal}=await requireAdminPermission("survey.sign",{surveyId:path[1]});const body=z.object({signatoryId:z.uuid(),dataUrl:z.string().max(700_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)}).parse(await request.json());const png=new Uint8Array(Buffer.from(body.dataUrl.slice(body.dataUrl.indexOf(",")+1),"base64"));return Response.json(await app.admin.signOfficial({surveyId:z.uuid().parse(path[1]),userId:principal.userId,signatoryId:body.signatoryId,png,verificationBaseUrl:new URL(request.url).origin},requestId));}
    if(path[0]==="imports"&&path[1]==="accounts"&&path[2]==="preview")return previewAccounts(request);
    return new Response(null,{status:404});
  } catch(error){return errorResponse(error,requestId);}
}

export async function PATCH(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="organizations"&&path[1]&&path.length===2){const {app,principal}=await requireAdminPermission("org.manage",{organizationId:path[1]});const body=organizationUpdateSchema.parse(await request.json());return Response.json(await app.admin.updateOrganization(z.uuid().parse(path[1]),body,principal,requestId));}
  if(path[0]==="surveys"&&path[1]&&path.length===2){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});const body=draftSchema.parse(await request.json());if(!body.expectedLockVersion)throw new ApplicationError("invalid_request","expectedLockVersion is required");return Response.json(await app.admin.update(z.uuid().parse(path[1]),body,body.expectedLockVersion,principal,requestId));}
  if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});const body=questionSchema.parse(await request.json());return Response.json(await app.admin.updateQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),body,principal.userId,requestId));}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

export async function PUT(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="surveys"&&path[1]&&path[2]==="targets"){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});const body=z.object({targets:z.array(targetSchema).min(1).max(5000)}).parse(await request.json());return Response.json(await app.admin.targets(z.uuid().parse(path[1]),body.targets,principal.userId,requestId));}
  if(path[0]==="surveys"&&path[1]&&path[2]==="signatories"){const {app,principal}=await requireAdminPermission("survey.signatory.manage",{surveyId:path[1]});const body=z.object({signatories:z.array(z.object({userId:z.uuid(),roleKey:z.string(),displayName:z.string().trim().min(3).max(200)})).max(50)}).parse(await request.json());return Response.json(await app.admin.signatories(z.uuid().parse(path[1]),body.signatories,principal.userId,requestId));}
  if(path[0]==="surveys"&&path[1]&&path[2]==="signature-policy"){const {app,principal}=await requireAdminPermission("survey.signatory.manage",{surveyId:path[1]});const body=z.object({policy:z.array(z.object({roleKey:z.string(),minRequired:z.number().int().min(0).max(20)})).max(20)}).parse(await request.json());return Response.json(await app.admin.signaturePolicy(z.uuid().parse(path[1]),body.policy,principal.userId,requestId));}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

export async function DELETE(request:Request,context:Context){const requestId=requestIdFrom(request);try{assertSameOrigin(request);const path=(await context.params).path??[];
  if(path[0]==="surveys"&&path[1]&&path[2]==="questions"&&path[3]){const {app,principal}=await requireAdminPermission("survey.update_draft",{surveyId:path[1]});return Response.json(await app.admin.deleteQuestion(z.uuid().parse(path[1]),z.uuid().parse(path[3]),principal.userId,requestId));}
  if(path[0]==="users"&&path[1]&&path[2]==="roles"&&path[3]){const {app,principal}=await requireAdminPermission("role.manage");await app.admin.revokeRole(z.uuid().parse(path[1]),path[3],principal,requestId);return new Response(null,{status:204});}
  return new Response(null,{status:404});}catch(error){return errorResponse(error,requestId);}}

async function required<T>(value:Promise<T|null>){const result=await value;if(!result)throw new ApplicationError("not_found","Resource was not found");return result;}
function optionalDate(value:string|null){return value?z.coerce.date().parse(value):undefined;}
function boundedParam(url:URL,name:string){const value=url.searchParams.get(name)?.trim();return value?value.slice(0,200):undefined;}
function csvResponse(csv:string,name:string){return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${name}"`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});}
async function previewAccounts(request:Request){const {app}=await requireAdminPermission("survey.create");const body=z.object({csv:z.string().max(262144)}).parse(await request.json());const lines=body.csv.replace(/^\uFEFF/,"").split(/\r?\n/);if(lines.length>5001)throw new ApplicationError("invalid_request","CSV row limit is 5000");const values=lines.map(line=>line.split(/[;,]/,1)[0].trim().replace(/^"|"$/g,"")).filter(Boolean);const duplicates=values.filter((value,index)=>values.indexOf(value)!==index);const unique=[...new Set(values)].filter(value=>value.length<=128);const resolved=unique.length?await app.database<{id:string;accountNumber:string}[]>`select id,account_number as "accountNumber" from personal_accounts where account_number in ${app.database(unique)} and status='active'`:[];const found=new Set(resolved.map(row=>row.accountNumber));return Response.json({total:values.length,valid:unique.length,invalid:values.length-unique.length,duplicate:new Set(duplicates).size,resolved:resolved.length,unresolved:unique.filter(value=>!found.has(value)),items:resolved});}
