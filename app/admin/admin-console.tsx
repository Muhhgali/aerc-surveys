"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Admin rows use native anchors for explicit, bookmarkable routes. */

import {
  Activity, Archive, ArrowDown, ArrowLeft, ArrowUp, BarChart3, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Copy, Download, Eye, FileCheck2, FileText, Gauge, LayoutDashboard, LockKeyhole, LogOut, Menu,
  Pencil, PenLine, Plus, Search, Settings, ShieldCheck, Trash2, Upload, Users, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SignaturePad } from "@/app/signature-pad";
import type { AdminPrincipal } from "@/src/domain/admin-rbac";

type Json = Record<string, unknown>;
type PageData = { items: Json[]; total: number; page: number; pageSize: number };
type Survey = Json & { id: string; titleRu: string; titleKk?: string; protocolNumber: string; status: string; version: number; lockVersion: number; startsAt: string; closesAt: string; descriptionRu?: string; descriptionKk?: string; meetingForm?: string; documentLanguage?: string; signingState?: string; questions?: Question[]; targets?: Json[]; signatories?: Json[]; signaturePolicy?: Json[]; questionCount?: number; eligibleCount?: number; completedCount?: number; protocolPublicId?: string | null };
type Question = { id: string; position: number; textRu: string; textKk: string; required: boolean; votingRule?: { type: string; thresholdPercent: number } };

const navigation = [
  ["", "Обзор", LayoutDashboard, "admin.access"], ["surveys", "Опросы", ClipboardList, "survey.read"],
  ["users", "Пользователи", Users, "user.invite"], ["organizations", "Организации", Building2, "org.manage"],
  ["documents", "Документы", FileCheck2, "document.read"], ["audit", "Журнал", Activity, "audit.read"],
  ["settings", "Настройки", Settings, "admin.access"],
] as const;
const statusNames: Record<string,string>={draft:"Черновик",scheduled:"Запланирован",active:"Активен",closed:"Закрыт",archived:"Архив"};
const meetingFormNames: Record<string,string>={electronic:"Электронное",in_person:"Очное",absentee:"Заочное",mixed:"Смешанное"};
const signatoryRoleNames: Record<string,string>={meeting_chairman:"Председатель собрания",secretary:"Секретарь",responsible_person:"Ответственное лицо",council_member:"Член совета дома"};

async function api<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`/api/admin${path}`,{cache:"no-store",...init,headers:{...(init?.body?{"content-type":"application/json"}:{}),...init?.headers}});if(!response.ok){const body=await response.json().catch(()=>null) as {error?:{message?:string;code?:string}}|null;throw new Error(body?.error?.message||body?.error?.code||`HTTP ${response.status}`);}if(response.status===204)return undefined as T;return response.json() as Promise<T>;}
const formatDate=(value:unknown)=>value?new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium",timeStyle:"short"}).format(new Date(String(value))):"—";
const percent=(value:unknown)=>`${Number(value||0).toLocaleString("ru-RU",{maximumFractionDigits:2})}%`;

export function AdminConsole({initialPath,principal}:{initialPath:string[];principal:AdminPrincipal}){
  const router=useRouter();
  const [mobileNav,setMobileNav]=useState(false);const [toast,setToast]=useState("");
  const section=initialPath[0]??"";const title=section==="surveys"?"Опросы":section==="documents"?"Документы":section==="audit"?"Журнал":section==="users"?"Пользователи":section==="organizations"?"Организации":section==="settings"?"Настройки":"Обзор";
  const can=(permission:string)=>principal.permissions.includes(permission as never)||principal.roles.includes("super_admin");
  async function logout(){await fetch("/api/session",{method:"DELETE"});router.push("/admin/login");router.refresh();}
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(""),3200);return()=>clearTimeout(id);},[toast]);
  return <div className="admin-app"><aside className={`admin-sidebar ${mobileNav?"open":""}`}><div className="admin-brand"><span><Building2 size={22}/></span><div><strong>Астана-ЕРЦ</strong><small>ОПРОСЫ · ADMIN</small></div><button onClick={()=>setMobileNav(false)} aria-label="Закрыть меню"><X size={20}/></button></div><nav>{navigation.filter(([, , , permission])=>permission==="admin.access"||can(permission)||(permission==="user.invite"&&can("user.manage"))||(permission==="org.manage"&&can("survey.read"))).map(([path,label,Icon])=><Link className={section===path?"active":""} href={`/admin${path?`/${path}`:""}`} key={path}><Icon size={18}/>{label}</Link>)}</nav><div className="admin-sidebar-foot"><ShieldCheck size={17}/><span><strong>{principal.displayName}</strong><small>{principal.roles.join(", ")||principal.organizationGrants.map(g=>g.role).join(", ")}</small></span></div></aside>
    <div className="admin-main"><header className="admin-header"><button className="admin-menu" onClick={()=>setMobileNav(true)} aria-label="Открыть меню"><Menu/></button><div><small>Администрирование / {title}</small><h1>{title}</h1></div><div className="admin-user"><span>{principal.displayName.slice(0,2).toUpperCase()}</span><button onClick={logout} title="Выйти"><LogOut size={18}/></button></div></header><main className="admin-content"><RouteView path={initialPath} principal={principal} notify={setToast}/></main></div>{toast?<div className="admin-toast"><CheckCircle2 size={18}/>{toast}</div>:null}</div>;
}

function RouteView({path,principal,notify}:{path:string[];principal:AdminPrincipal;notify:(value:string)=>void}){
  if(!path.length)return <Dashboard/>;
  if(path[0]==="surveys"){
    if(path[1]==="new")return <SurveyEditor notify={notify}/>;
    if(path[1]&&path[2]==="edit")return <SurveyEditor id={path[1]} notify={notify}/>;
    if(path[1]&&path[2]==="results")return <Results id={path[1]}/>;
    if(path[1]&&path[2]==="participants")return <Participants id={path[1]}/>;
    if(path[1])return <SurveyDetail id={path[1]} notify={notify} principal={principal}/>;
    return <SurveyList/>;
  }
  if(path[0]==="documents")return path[1]?<DocumentDetail id={path[1]} principal={principal}/>:<Documents/>;
  if(path[0]==="audit")return <Audit/>;
  if(path[0]==="users")return <AdminUsers notify={notify} principal={principal}/>;
  if(path[0]==="organizations")return <Organizations principal={principal} notify={notify}/>;
  if(path[0]==="settings")return <SettingsPage principal={principal}/>;
  return <Empty title="Раздел не найден"/>;
}

function useDebounced<T>(value:T,delay=250){const [debounced,setDebounced]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(timer);},[value,delay]);return debounced;}
function useLoad<T>(loader:()=>Promise<T>,deps:readonly unknown[]){const [data,setData]=useState<T>();const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  // This utility deliberately exposes caller-owned primitive dependencies, equivalent to a query key.
  // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  const load=useCallback(()=>{setLoading(true);setError("");return loader().then(setData).catch((e:Error)=>setError(e.message)).finally(()=>setLoading(false));},deps);
  useEffect(()=>{void load();},[load]);return{data,error,loading,reload:load};}
function Loading(){return <div className="admin-skeleton"><span/><span/><span/><span/></div>}
function ErrorBox({message}:{message:string}){return <div className="admin-alert danger">{message}</div>}
function Empty({title,copy="Данных по выбранным условиям пока нет."}:{title:string;copy?:string}){return <div className="admin-empty"><FileText size={32}/><h3>{title}</h3><p>{copy}</p></div>}
function Badge({status}:{status:string}){return <span className={`admin-badge ${status}`}>{statusNames[status]??status}</span>}

function Dashboard(){const state=useLoad(()=>api<Json>("/dashboard"),[]);if(state.loading)return <Loading/>;if(state.error)return <ErrorBox message={state.error}/>;const d=state.data??{};const surveys=(d.surveys??{}) as Json;const participants=(d.participants??{})as Json;const documents=(d.documents??{})as Json;const activity=(d.activity??[])as Json[];const attention=(d.attention??[])as Json[];return <><section className="admin-hero"><div><span className="admin-kicker">CONTROL CENTER</span><h2>Состояние платформы</h2><p>Только фактические данные PostgreSQL на текущий момент.</p></div><Gauge size={42}/></section>{attention.length?<Panel title="Требует внимания"><DataTable headers={["Опрос","Протокол","Роль","ФИО","Статус"]}>{attention.map(row=><tr key={`${row.id}-${row.signatoryId??row.roleKey}`}><td><a href={`/admin/surveys/${String(row.id)}`}><strong>{String(row.title)}</strong></a></td><td>№{String(row.protocol)}</td><td>{signatoryRoleNames[String(row.roleKey)]??String(row.roleKey)}</td><td>{String(row.displayName??"—")}</td><td><Badge status={String(row.status)}/></td></tr>)}</DataTable></Panel>:<Panel title="Требует внимания"><p className="admin-muted">Нет задач на подпись.</p></Panel>}<div className="admin-metric-grid"><Metric label="Активные опросы" value={surveys.active}/><Metric label="Запланировано" value={surveys.scheduled}/><Metric label="Черновики" value={surveys.draft}/><Metric label="Закрыто" value={surveys.closed}/><Metric label="Eligible" value={participants.eligible}/><Metric label="Started" value={participants.started}/><Metric label="Completed" value={participants.completed}/><Metric label="Участие" value={percent(d.participationPercent)}/><Metric label="Финальные документы" value={documents.finalized}/></div><Panel title="Последняя активность" action={<a href="/admin/audit">Весь журнал</a>}><DataTable headers={["Событие","Исполнитель","Результат","Дата"]}>{activity.map(row=><tr key={String(row.id)}><td><strong>{String(row.eventType)}</strong></td><td>{String(row.actor??"Система")}</td><td><span className="admin-dot success"/> {String(row.outcome)}</td><td>{formatDate(row.occurredAt)}</td></tr>)}</DataTable></Panel></>}
function Metric({label,value}:{label:string;value:unknown}){return <article className="admin-metric"><small>{label}</small><strong>{String(value??0)}</strong><span>Актуально сейчас</span></article>}

function SurveyList(){const [search,setSearch]=useState("");const [status,setStatus]=useState("");const [from,setFrom]=useState("");const [to,setTo]=useState("");const [page,setPage]=useState(1);const deferredSearch=useDebounced(search);const url=`/surveys?page=${page}&pageSize=15&search=${encodeURIComponent(deferredSearch)}&status=${status}&from=${from}&to=${to}`;const state=useLoad(()=>api<PageData>(url),[url]);return <><div className="admin-toolbar"><div className="admin-search"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Название или протокол"/></div><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Все статусы</option>{Object.entries(statusNames).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input aria-label="Период от" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}}/><input aria-label="Период до" type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1)}}/><a className="admin-button primary" href="/admin/surveys/new"><Plus size={17}/>Новый опрос</a></div>{state.loading&&!state.data?<Loading/>:state.error?<ErrorBox message={state.error}/>:!state.data?.items.length?<Empty title="Опросы не найдены"/>:<Panel title={`Опросы · ${state.data.total}`}><DataTable headers={["Опрос","Протокол","Статус","Версия","Период","Вопросы","Eligible","Completed",""]}>{state.data.items.map(raw=>{const row=raw as Survey;return <tr key={row.id}><td><strong>{row.titleRu}</strong><small>{row.titleKk||"KZ не задан"}</small></td><td>№{row.protocolNumber}</td><td><Badge status={row.status}/></td><td>v{row.version}</td><td>{formatDate(row.startsAt)}<small>до {formatDate(row.closesAt)}</small></td><td>{row.questionCount}</td><td>{row.eligibleCount}</td><td>{row.completedCount}</td><td><a className="admin-icon-link" href={`/admin/surveys/${row.id}`} aria-label="Открыть"><ChevronRight size={18}/></a></td></tr>})}</DataTable><Pagination current={page} total={state.data.total} size={state.data.pageSize} onChange={setPage}/></Panel>}</>}

function SurveyEditor({id,notify}:{id?:string;notify:(value:string)=>void}){const router=useRouter();const state=useLoad(()=>id?api<Survey>(`/surveys/${id}`):Promise.resolve(undefined as unknown as Survey),[id]);const survey=state.data;const [form,setForm]=useState({protocolNumber:"",titleRu:"",titleKk:"",descriptionRu:"",descriptionKk:"",startsAt:"",closesAt:"",meetingForm:"electronic",documentLanguage:"ru"});const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  // Loaded server data is the authoritative reset point for this controlled draft form.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(!survey)return;setForm({protocolNumber:survey.protocolNumber,titleRu:survey.titleRu,titleKk:survey.titleKk??"",descriptionRu:survey.descriptionRu??"",descriptionKk:survey.descriptionKk??"",startsAt:toLocal(survey.startsAt),closesAt:toLocal(survey.closesAt),meetingForm:survey.meetingForm??"electronic",documentLanguage:survey.documentLanguage??"ru"});},[survey]);
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{const body={...form,startsAt:new Date(form.startsAt).toISOString(),closesAt:new Date(form.closesAt).toISOString(),...(survey?{expectedLockVersion:survey.lockVersion}:{})};const result=await api<Survey>(survey?`/surveys/${survey.id}`:"/surveys",{method:survey?"PATCH":"POST",body:JSON.stringify(body)});notify(survey?"Черновик сохранён":"Опрос создан");if(!survey){router.push(`/admin/surveys/${result.id}/edit`);router.refresh();}else await state.reload();}catch(e){setError((e as Error).message.includes("lock version")?"Опрос был изменён другим пользователем. Обновите страницу перед сохранением.":(e as Error).message);}finally{setBusy(false)}}
  if(id&&state.loading)return <Loading/>;if(state.error)return <ErrorBox message={state.error}/>;if(survey&&survey.status!=="draft")return <ErrorBox message="Опубликованный опрос нельзя свободно редактировать."/>;
  return <><Back href={id?`/admin/surveys/${id}`:"/admin/surveys"}/><div className="admin-builder"><section><form className="admin-form-card" onSubmit={save}><div className="admin-section-title"><div><span className="admin-kicker">ШАГ 1</span><h2>Основные сведения</h2></div><Badge status="draft"/></div>{error?<ErrorBox message={error}/>:null}<div className="admin-form-grid"><Field label="Номер протокола"><input required maxLength={120} value={form.protocolNumber} onChange={e=>setForm({...form,protocolNumber:e.target.value})}/></Field><Field label="Начало"><input required type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></Field><Field label="Завершение"><input required type="datetime-local" value={form.closesAt} onChange={e=>setForm({...form,closesAt:e.target.value})}/></Field><Field label="Форма собрания"><select value={form.meetingForm} onChange={e=>setForm({...form,meetingForm:e.target.value})}>{Object.entries(meetingFormNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="Язык документов"><select value={form.documentLanguage} onChange={e=>setForm({...form,documentLanguage:e.target.value})}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="bilingual">RU + KK</option></select></Field><Field label="Название · RU"><input required value={form.titleRu} onChange={e=>setForm({...form,titleRu:e.target.value})}/></Field><Field label="Название · KZ"><input required value={form.titleKk} onChange={e=>setForm({...form,titleKk:e.target.value})}/></Field><Field label="Описание · RU"><textarea required value={form.descriptionRu} onChange={e=>setForm({...form,descriptionRu:e.target.value})}/></Field><Field label="Описание · KZ"><textarea required value={form.descriptionKk} onChange={e=>setForm({...form,descriptionKk:e.target.value})}/></Field></div><button className="admin-button primary" disabled={busy}>{busy?"Сохраняем…":"Сохранить черновик"}</button></form>{survey?<><QuestionBuilder survey={survey} reload={state.reload} notify={notify}/><TargetBuilder survey={survey} reload={state.reload} notify={notify}/><SignatoryBuilder survey={survey} reload={state.reload} notify={notify}/><PolicyBuilder survey={survey} reload={state.reload} notify={notify}/></>:null}</section><PhonePreview survey={survey} form={form}/></div></>}

function QuestionBuilder({survey,reload,notify}:{survey:Survey;reload:()=>Promise<void>;notify:(v:string)=>void}){const [draft,setDraft]=useState({textRu:"",textKk:"",required:true,threshold:51});const [error,setError]=useState("");async function add(){try{await api(`/surveys/${survey.id}/questions`,{method:"POST",body:JSON.stringify({textRu:draft.textRu,textKk:draft.textKk,required:draft.required,votingRule:{type:"percentage_of_all_eligible",thresholdPercent:draft.threshold}})});setDraft({textRu:"",textKk:"",required:true,threshold:51});notify("Вопрос добавлен");await reload();}catch(e){setError((e as Error).message)}}async function action(question:Question,kind:"up"|"down"|"duplicate"|"delete"){try{const path=`/surveys/${survey.id}/questions/${question.id}`;if(kind==="delete")await api(path,{method:"DELETE"});else await api(`${path}/${kind==="duplicate"?"duplicate":"move"}`,{method:"POST",body:kind==="duplicate"?undefined:JSON.stringify({direction:kind})});notify("Порядок вопросов обновлён");await reload();}catch(e){setError((e as Error).message)}}return <section className="admin-form-card"><div className="admin-section-title"><div><span className="admin-kicker">ШАГ 2</span><h2>Вопросы · {survey.questions?.length??0}</h2></div></div>{error?<ErrorBox message={error}/>:null}<div className="admin-question-list">{survey.questions?.map(q=><article key={q.id}><span>{q.position}</span><div><strong>{q.textRu}</strong><small>{q.textKk}</small><em>{q.required?"Обязательный":"Необязательный"} · {q.votingRule?.thresholdPercent??51}% всех eligible</em></div><div><button onClick={()=>action(q,"up")} aria-label="Выше"><ArrowUp size={16}/></button><button onClick={()=>action(q,"down")} aria-label="Ниже"><ArrowDown size={16}/></button><button onClick={()=>action(q,"duplicate")} aria-label="Дублировать"><Copy size={16}/></button><button onClick={()=>action(q,"delete")} aria-label="Удалить"><Trash2 size={16}/></button></div></article>)}</div><div className="admin-inline-form"><input placeholder="Текст вопроса RU" value={draft.textRu} onChange={e=>setDraft({...draft,textRu:e.target.value})}/><input placeholder="Сұрақ мәтіні KZ" value={draft.textKk} onChange={e=>setDraft({...draft,textKk:e.target.value})}/><label><input type="checkbox" checked={draft.required} onChange={e=>setDraft({...draft,required:e.target.checked})}/> Обязательный</label><label>Порог % <input type="number" min={1} max={100} value={draft.threshold} onChange={e=>setDraft({...draft,threshold:Number(e.target.value)||51})}/></label><button className="admin-button secondary" disabled={!draft.textRu||!draft.textKk} onClick={add}><Plus size={16}/>Добавить</button></div></section>}

function TargetBuilder({survey,reload,notify}:{survey:Survey;reload:()=>Promise<void>;notify:(v:string)=>void}){
  const references=useLoad(()=>api<{organizations:Json[];properties:Json[];accounts:Json[]}>("/references"),[]);
  const [building,setBuilding]=useState({city:"Астана",street:"Геодезическая",building:"12"});const [propertyIds,setPropertyIds]=useState<string[]>([]);const [organizationId,setOrganizationId]=useState("");
  const [csv,setCsv]=useState("");const [preview,setPreview]=useState<Json>();const [error,setError]=useState("");
  async function save(targets:Json[]){try{await api(`/surveys/${survey.id}/targets`,{method:"PUT",body:JSON.stringify({targets})});notify("Аудитория сохранена");await reload();}catch(e){setError((e as Error).message)}}
  async function previewCsv(){try{setPreview(await api("/imports/accounts/preview",{method:"POST",body:JSON.stringify({csv})}));}catch(e){setError((e as Error).message)}}
  async function confirmCsv(){const items=(preview?.items??[])as {id:string}[];if(items.length)await save(items.map(item=>({type:"personal_account",personalAccountId:item.id})));}
  return <section className="admin-form-card"><div className="admin-section-title"><div><span className="admin-kicker">ШАГ 3</span><h2>Аудитория</h2></div><span>{survey.targets?.length??0} targets</span></div>{error?<ErrorBox message={error}/>:null}<div className="admin-target-grid">
    <div><h3><Building2 size={18}/>Дом</h3><Field label="Город"><input value={building.city} onChange={e=>setBuilding({...building,city:e.target.value})}/></Field><Field label="Улица"><input value={building.street} onChange={e=>setBuilding({...building,street:e.target.value})}/></Field><Field label="Дом"><input value={building.building} onChange={e=>setBuilding({...building,building:e.target.value})}/></Field><button className="admin-button secondary" onClick={()=>save([{type:"building",...building}])}>Назначить дому</button></div>
    <div><h3><Building2 size={18}/>Объекты</h3><Field label="Несколько помещений"><select multiple value={propertyIds} onChange={e=>setPropertyIds([...e.currentTarget.selectedOptions].map(option=>option.value))}>{references.data?.properties.map(property=><option key={String(property.id)} value={String(property.id)}>{property.city as string}, {property.street as string} {property.building as string}, {property.premise as string}</option>)}</select></Field><button className="admin-button secondary" disabled={!propertyIds.length} onClick={()=>save(propertyIds.map(propertyId=>({type:"property",propertyId})))}>Назначить объекты</button></div>
    <div><h3><Users size={18}/>Организация</h3><Field label="Организация"><select value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">Выберите…</option>{references.data?.organizations.map(org=><option key={String(org.id)} value={String(org.id)}>{String(org.name)}</option>)}</select></Field><button className="admin-button secondary" disabled={!organizationId} onClick={()=>save([{type:"organization",organizationId}])}>Назначить организацию</button></div>
    <div><h3><Upload size={18}/>CSV лицевых счетов</h3><textarea value={csv} onChange={e=>setCsv(e.target.value)} placeholder={'account_number\n1911'}/><button className="admin-button secondary" onClick={previewCsv}>Проверить CSV</button>{preview?<div className="admin-import-summary"><span>Строк: {String(preview.total)}</span><span>Resolved: {String(preview.resolved)}</span><span>Duplicate: {String(preview.duplicate)}</span><span>Unresolved: {String((preview.unresolved as unknown[])?.length??0)}</span><button className="admin-button primary" onClick={confirmCsv}>Подтвердить import</button></div>:null}</div>
  </div></section>}

function SignatoryBuilder({survey,reload,notify}:{survey:Survey;reload:()=>Promise<void>;notify:(v:string)=>void}){
  const [query,setQuery]=useState("");const [roleKey,setRoleKey]=useState("meeting_chairman");const [picked,setPicked]=useState("");const [fullName,setFullName]=useState("");
  const users=useLoad(()=>query.trim().length<2?Promise.resolve({items:[] as Json[]}):api<{items:Json[]}>(`/users/search?q=${encodeURIComponent(query)}`),[query]);
  const [error,setError]=useState("");
  async function save(next:Json[]){try{await api(`/surveys/${survey.id}/signatories`,{method:"PUT",body:JSON.stringify({signatories:next})});notify("Подписанты сохранены");await reload();}catch(e){setError((e as Error).message)}}
  const current=(survey.signatories??[]) as {id?:string;userId:string;roleKey:string;displayName:string}[];
  const selectedName=String(users.data?.items.find(user=>String(user.id)===picked)?.displayName??"");
  return <section className="admin-form-card"><div className="admin-section-title"><div><span className="admin-kicker">ШАГ 4</span><h2>Подписанты</h2></div></div>{error?<ErrorBox message={error}/>:null}<p className="admin-muted" style={{padding:"0 19px"}}>ФИО попадает в лист и протокол. Аккаунт — кто может поставить visual signature за это лицо. Для теста один аккаунт можно назначить на несколько ролей.</p><div className="admin-question-list">{current.map((row,index)=><article key={row.id??`${row.userId}-${row.roleKey}-${index}`}><span>•</span><div><strong>{row.displayName}</strong><small>{signatoryRoleNames[row.roleKey]??row.roleKey}</small></div><button aria-label="Удалить" onClick={()=>void save(current.filter((_,itemIndex)=>itemIndex!==index).map(item=>({userId:item.userId,roleKey:item.roleKey,displayName:item.displayName})))}><Trash2 size={16}/></button></article>)}</div><div className="admin-inline-form signatories"><input placeholder="Поиск аккаунта для подписи" value={query} onChange={e=>setQuery(e.target.value)}/><select value={picked} onChange={e=>setPicked(e.target.value)}><option value="">Аккаунт…</option>{users.data?.items.map(user=><option key={String(user.id)} value={String(user.id)}>{String(user.displayName)}</option>)}</select><select value={roleKey} onChange={e=>setRoleKey(e.target.value)}>{Object.entries(signatoryRoleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input placeholder="ФИО подписанта" value={fullName} onChange={e=>setFullName(e.target.value)}/><button className="admin-button secondary" disabled={!picked||!(fullName.trim()||selectedName)} onClick={()=>{void save([...current.map(item=>({userId:item.userId,roleKey:item.roleKey,displayName:item.displayName})),{userId:picked,roleKey,displayName:(fullName.trim()||selectedName)}]);setFullName("");}}><Plus size={16}/>Добавить</button></div></section>}

function PolicyBuilder({survey,reload,notify}:{survey:Survey;reload:()=>Promise<void>;notify:(v:string)=>void}){
  const assigned=new Map<string,number>();
  for(const row of (survey.signatories??[]) as {roleKey:string}[]) assigned.set(row.roleKey,(assigned.get(row.roleKey)??0)+1);
  const [policy,setPolicy]=useState<{roleKey:string;minRequired:number}[]>(()=>((survey.signaturePolicy??[]) as {roleKey:string;minRequired:number}[]).length? (survey.signaturePolicy as {roleKey:string;minRequired:number}[]).map(row=>({roleKey:row.roleKey,minRequired:row.minRequired})):Object.keys(signatoryRoleNames).map(roleKey=>({roleKey,minRequired:roleKey==="responsible_person"?0:1})));
  const [error,setError]=useState("");
  async function save(){try{await api(`/surveys/${survey.id}/signature-policy`,{method:"PUT",body:JSON.stringify({policy})});notify("Политика подписей сохранена");await reload();}catch(e){setError((e as Error).message)}}
  return <section className="admin-form-card"><div className="admin-section-title"><div><span className="admin-kicker">ШАГ 5</span><h2>Политика подписей</h2></div></div>{error?<ErrorBox message={error}/>:null}<p className="admin-muted">Для электронного голосования подпись ответственного лица не требуется.</p>{policy.map(row=><label className="admin-field" key={row.roleKey}><span>{signatoryRoleNames[row.roleKey]??row.roleKey} · назначено {assigned.get(row.roleKey)??0}</span><input type="number" min={0} max={20} value={row.minRequired} onChange={e=>setPolicy(policy.map(item=>item.roleKey===row.roleKey?{...item,minRequired:Number(e.target.value)||0}:item))}/></label>)}<button className="admin-button secondary" onClick={()=>void save()}>Сохранить политику</button></section>}

function PhonePreview({survey,form}:{survey?:Survey;form:Json}){const questions=survey?.questions??[];return <aside className="admin-preview"><div className="admin-preview-head"><Eye size={17}/>Предпросмотр · RU / KZ</div><div className="admin-phone"><span>ПРОТОКОЛ №{String(form.protocolNumber||"—")}</span><h3>{String(form.titleRu||"Название опроса")}</h3><p>{String(form.descriptionRu||"Описание появится здесь")}</p><small>{questions.length} вопросов · {meetingFormNames[String(form.meetingForm||"electronic")]??"Электронное"}</small>{questions.slice(0,3).map(q=><article key={q.id}><b>{q.position}</b><div><strong>{q.textRu}</strong><small>{q.textKk}</small></div></article>)}</div></aside>}

function SurveyDetail({id,notify,principal}:{id:string;notify:(v:string)=>void;principal:AdminPrincipal}){
  const state=useLoad(()=>api<Survey>(`/surveys/${id}`),[id]);
  const [busy,setBusy]=useState(false);
  async function transition(action:"publish"|"close"|"archive"|"protocol"){
    const warning=action==="publish"?"После публикации вопросы текущей версии нельзя будет свободно изменить. Продолжить?":`Подтвердить действие «${action}»?`;
    if(!confirm(warning))return;
    setBusy(true);
    try{await api(`/surveys/${id}/${action}`,{method:"POST"});notify("Статус опроса обновлён");await state.reload();}
    catch(e){notify((e as Error).message)}
    finally{setBusy(false)}
  }
  if(state.loading)return <Loading/>;
  if(state.error||!state.data)return <ErrorBox message={state.error||"Опрос не найден"}/>;
  const s=state.data;
  const closed=s.status==="closed"||s.status==="archived";
  const resultsLabel=closed?"Перейти к результатам":"Прогресс";
  return <>
    <Back href="/admin/surveys"/>
    <section className="admin-detail-head">
      <div><Badge status={s.status}/>{s.signingState&&s.signingState!=="none"?<Badge status={s.signingState}/>:null}<h2>{s.titleRu}</h2><p>{s.titleKk}</p></div>
      <div className="admin-actions">
        <a className="admin-button secondary" href={`/admin/surveys/${id}/results`}><BarChart3 size={17}/>{resultsLabel}</a>
        <a className="admin-button secondary" href={`/admin/surveys/${id}/participants`}><Users size={17}/>Участники</a>
        {s.status==="draft"?<><a className="admin-button secondary" href={`/admin/surveys/${id}/edit`}><Pencil size={17}/>Редактировать</a><button className="admin-button primary" disabled={busy} onClick={()=>void transition("publish")}><Upload size={17}/>Опубликовать</button></>:null}
        {s.status==="active"?<button className="admin-button danger" onClick={()=>void transition("close")}>Закрыть</button>:null}
        {s.status==="closed"?<>
          {s.protocolPublicId?<a className="admin-button primary" href={`/api/documents/${s.protocolPublicId}/pdf`} target="_blank" rel="noreferrer"><Download size={17}/>Протокол PDF</a>:s.signingState==="signed"?<button className="admin-button secondary" disabled={busy} onClick={()=>void transition("protocol")}>Сформировать протокол</button>:null}
          <button className="admin-button secondary" onClick={()=>void transition("archive")}><Archive size={17}/>Архивировать</button>
        </>:null}
      </div>
    </section>
    <div className="admin-summary-grid">
      <Summary label="Протокол" value={`№${s.protocolNumber}`}/>
      <Summary label="Форма" value={meetingFormNames[s.meetingForm??"electronic"]??s.meetingForm??"—"}/>
      <Summary label="Период" value={`${formatDate(s.startsAt)} — ${formatDate(s.closesAt)}`}/>
      <Summary label="Аудитория" value={`${s.eligibleCount} eligible`}/>
    </div>
    <Panel title={`Вопросы · ${s.questions?.length??0}`}><div className="admin-read-questions">{s.questions?.map(q=><article key={q.id}><span>{q.position}</span><div><strong>{q.textRu}</strong><small>{q.textKk}</small></div></article>)}</div></Panel>
    {s.status==="closed"?<OfficialSigning survey={s} principal={principal} notify={notify} reload={state.reload}/>:null}
  </>;
}

function OfficialSigning({survey,principal,notify,reload}:{survey:Survey;principal:AdminPrincipal;notify:(value:string)=>void;reload:()=>Promise<void>}){
  const signatories=(survey.signatories??[]) as {id:string;userId:string;roleKey:string;displayName:string;signedAt?:string|null}[];
  const [signingId,setSigningId]=useState("");
  const [busy,setBusy]=useState(false);
  async function save(dataUrl:string){
    setBusy(true);
    try{
      await api(`/surveys/${survey.id}/signatures`,{method:"POST",body:JSON.stringify({signatoryId:signingId,dataUrl})});
      notify("Подпись сохранена");
      setSigningId("");
      await reload();
    }catch(e){notify((e as Error).message)}
    finally{setBusy(false)}
  }
  const selected=signatories.find(row=>row.id===signingId);
  return <Panel title="Подписание итоговых документов">
    {survey.status!=="closed"?<p className="admin-muted">Финальные подписи доступны после закрытия опроса.</p>:null}
    <p className="admin-muted">Visual signature — изображение подписи, не ЭЦП. Для теста один аккаунт может подписать за все указанные лица.</p>
    <DataTable headers={["Роль","ФИО","Статус",""]}>
      {signatories.map(row=>{
        const signed=Boolean(row.signedAt);
        const canSign=row.userId===principal.userId||principal.roles.includes("super_admin");
        return <tr key={row.id}>
          <td>{signatoryRoleNames[row.roleKey]??row.roleKey}</td>
          <td><strong>{row.displayName}</strong></td>
          <td><Badge status={signed?"signed":"pending"}/>{signed?<small>{formatDate(row.signedAt)}</small>:null}</td>
          <td>{signed?null:<button className="admin-button secondary" disabled={!canSign||busy} onClick={()=>setSigningId(row.id)}><PenLine size={16}/>Подписать</button>}</td>
        </tr>;
      })}
    </DataTable>
    {selected?<SignaturePad caption={`Подпись: ${selected.displayName}`} onCancel={()=>setSigningId("")} onSave={(value)=>void save(value)}/>:null}
  </Panel>;
}

function Results({id}:{id:string}){
  const state=useLoad(()=>api<Json>(`/surveys/${id}/results`),[id]);
  if(state.loading)return <Loading/>;
  if(state.error||!state.data)return <ErrorBox message={state.error||"Нет данных"}/>;
  const participation=(state.data.participation??{}) as Json;
  const questions=(state.data.questions??[]) as Json[];
  const sealed=Array.isArray(state.data.questions);
  return <>
    <Back href={`/admin/surveys/${id}`}/>
    <div className="admin-metric-grid compact">
      <Metric label="Eligible" value={participation.eligible}/>
      <Metric label="Started" value={participation.started??participation.completed}/>
      <Metric label="Completed" value={participation.completed}/>
      <Metric label="Participation" value={percent(participation.percent)}/>
    </div>
    {sealed?<Panel title="Итоги по вопросам" action={<a className="admin-button secondary" href={`/api/admin/surveys/${id}/results/export`}><Download size={16}/>CSV</a>}>
      <DataTable headers={["№","Вопрос","За","%","Против","%","Воздержался","%","Всего","Итог"]}>
        {questions.map(q=>{
          const decision=(q.decision??{}) as Json;
          return <tr key={String(q.questionId)}>
            <td>{String(q.position)}</td>
            <td><strong>{String(q.textRu)}</strong><small>{String(q.textKk??"")}</small></td>
            <td className="result-for">{String(q.for)}</td>
            <td>{percent(q.percentFor)}</td>
            <td className="result-against">{String(q.against)}</td>
            <td>{percent(q.percentAgainst)}</td>
            <td>{String(q.abstain)}</td>
            <td>{percent(q.percentAbstain)}</td>
            <td>{String(q.total??(Number(q.for||0)+Number(q.against||0)+Number(q.abstain||0)))}</td>
            <td><strong>{decision.accepted?"ПРИНЯТО":"НЕ ПРИНЯТО"}</strong><small>{String(decision.explanationRu??"")}</small></td>
          </tr>;
        })}
      </DataTable>
    </Panel>:<Panel title="Итоги скрыты"><p>Разбивка ЗА / ПРОТИВ / ВОЗДЕРЖАЛИСЬ доступна после закрытия опроса. Сейчас виден только прогресс участия.</p></Panel>}
  </>;
}
function Participants({id}:{id:string}){const [page,setPage]=useState(1);const [search,setSearch]=useState("");const deferredSearch=useDebounced(search);const state=useLoad(()=>api<PageData>(`/surveys/${id}/participants?page=${page}&pageSize=20&search=${encodeURIComponent(deferredSearch)}`),[id,page,deferredSearch]);return <><Back href={`/admin/surveys/${id}`}/><div className="admin-toolbar"><div className="admin-search"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="ФИО, объект или последние 4 цифры счёта"/></div></div>{state.loading?<Loading/>:state.error?<ErrorBox message={state.error}/>:<Panel title={`Участники · ${state.data?.total??0}`} action={<a className="admin-button secondary" href={`/api/admin/surveys/${id}/participants/export`}><Download size={16}/>CSV</a>}><DataTable headers={["ФИО","Reference","Объект","Счёт","Eligibility","Vote state","Started","Submitted","Document ID"]}>{state.data?.items.map(r=><tr key={String(r.participantReference)}><td><strong>{String(r.fullName??"—")}</strong></td><td className="mono">{String(r.participantReference).slice(0,8)}…</td><td>{String(r.property)}</td><td className="mono">{String(r.account)}</td><td>{String(r.eligibility)}</td><td><Badge status={String(r.voteState)}/></td><td>{formatDate(r.startedAt)}</td><td>{formatDate(r.submittedAt)}</td><td className="mono">{r.documentId?String(r.documentId).slice(0,8)+"…":"—"}</td></tr>)}</DataTable><Pagination current={page} total={state.data?.total??0} size={20} onChange={setPage}/></Panel>}</>}

function Documents(){const [search,setSearch]=useState("");const [status,setStatus]=useState("");const [page,setPage]=useState(1);const deferredSearch=useDebounced(search);const state=useLoad(()=>api<PageData>(`/documents?page=${page}&pageSize=20&search=${encodeURIComponent(deferredSearch)}&status=${status}`),[page,deferredSearch,status]);return <><div className="admin-toolbar"><div className="admin-search"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Document ID, протокол, опрос"/></div><select aria-label="Статус подписи" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Все статусы подписи</option>{["created","pending","verified","finalized","failed","expired","cancelled"].map(value=><option key={value}>{value}</option>)}</select></div>{state.loading?<Loading/>:state.error?<ErrorBox message={state.error}/>:<Panel title={`Реестр · ${state.data?.total??0}`}><DataTable headers={["Document ID","Опрос","Протокол","Версия","Создан","Provider","Signature","Integrity",""]}>{state.data?.items.map(r=><tr key={String(r.documentId)}><td className="mono">{String(r.documentId)}</td><td>{String(r.survey)}</td><td>№{String(r.protocol)}</td><td>v{String(r.version)}</td><td>{formatDate(r.createdAt)}</td><td>{String(r.signingProvider)}</td><td><Badge status={String(r.signingStatus)}/></td><td><span className="admin-dot success"/> {String(r.integrityStatus)}</td><td><a className="admin-icon-link" href={`/admin/documents/${String(r.documentId)}`}><ChevronRight size={18}/></a></td></tr>)}</DataTable><Pagination current={page} total={state.data?.total??0} size={20} onChange={setPage}/></Panel>}</>}
function DocumentDetail({id,principal}:{id:string;principal:AdminPrincipal}){const state=useLoad(()=>api<Json>(`/documents/${id}`),[id]);if(state.loading)return <Loading/>;if(state.error||!state.data)return <ErrorBox message={state.error||"Документ не найден"}/>;const d=state.data;return <><Back href="/admin/documents"/><section className="admin-detail-head"><div><span className="admin-kicker">IMMUTABLE DOCUMENT</span><h2 className="mono">{id}</h2><p>{String(d.survey)} · Протокол №{String(d.protocol)}</p></div>{principal.permissions.includes("document.pdf.read")?<a className="admin-button primary" href={`/api/documents/${id}/pdf`} target="_blank"><Download size={17}/>Открыть PDF</a>:null}</section><div className="admin-detail-card">{Object.entries(d).map(([key,value])=><div key={key}><small>{key}</small><strong className={key.toLowerCase().includes("sha")?"mono break":""}>{String(value??"—")}</strong></div>)}</div></>}
function Audit(){const [filters,setFilters]=useState({search:"",eventType:"",subjectType:"",subjectId:"",requestId:"",from:"",to:""});const [page,setPage]=useState(1);const deferredSearch=useDebounced(filters.search);const params=new URLSearchParams({page:String(page),pageSize:"25",...filters,search:deferredSearch});const url=`/audit?${params}`;const state=useLoad(()=>api<PageData>(url),[url]);function change(key:keyof typeof filters,value:string){setFilters(current=>({...current,[key]:value}));setPage(1)}return <><div className="admin-toolbar audit-filters"><div className="admin-search"><Search size={17}/><input value={filters.search} onChange={e=>change("search",e.target.value)} placeholder="Событие или actor"/></div><input value={filters.eventType} onChange={e=>change("eventType",e.target.value)} placeholder="Тип события"/><select aria-label="Тип subject" value={filters.subjectType} onChange={e=>change("subjectType",e.target.value)}><option value="">Все объекты</option><option value="survey">Опрос</option><option value="document">Документ</option><option value="user">Пользователь</option><option value="vote">Голос</option></select><input value={filters.subjectId} onChange={e=>change("subjectId",e.target.value)} placeholder="Survey / Document ID"/><input value={filters.requestId} onChange={e=>change("requestId",e.target.value)} placeholder="Request ID"/><input aria-label="Аудит от" type="date" value={filters.from} onChange={e=>change("from",e.target.value)}/><input aria-label="Аудит до" type="date" value={filters.to} onChange={e=>change("to",e.target.value)}/><span className="admin-readonly"><LockKeyhole size={15}/>Только чтение</span></div>{state.loading?<Loading/>:state.error?<ErrorBox message={state.error}/>:<Panel title={`События · ${state.data?.total??0}`}><DataTable headers={["Дата","Событие","Actor","Subject","Request ID","Outcome"]}>{state.data?.items.map(r=><tr key={String(r.id)}><td>{formatDate(r.occurredAt)}</td><td><strong>{String(r.eventType)}</strong></td><td>{String(r.actor??"Система")}</td><td>{String(r.subjectType??"—")}<small className="mono">{String(r.subjectId??"").slice(0,12)}</small></td><td className="mono">{String(r.requestId)}</td><td>{String(r.outcome)}</td></tr>)}</DataTable><Pagination current={page} total={state.data?.total??0} size={25} onChange={setPage}/></Panel>}</>}

function AdminUsers({notify,principal}:{notify:(v:string)=>void;principal:AdminPrincipal}){const [page,setPage]=useState(1);const canManage=principal.permissions.includes("user.manage")||principal.roles.includes("super_admin");const canInvite=principal.permissions.includes("user.invite")||principal.roles.includes("super_admin");const users=useLoad(()=>canManage?api<PageData>(`/users?page=${page}&pageSize=20`):Promise.resolve({items:[],page:1,pageSize:20,total:0}),[page,canManage]);const roles=useLoad(()=>canManage?api<{items:Json[]}>("/roles"):Promise.resolve({items:[]}),[canManage]);const orgs=useLoad(()=>canInvite?api<{items:Json[]}>("/organizations"):Promise.resolve({items:[]}),[canInvite]);const [invite,setInvite]=useState({email:"",displayName:"",organizationId:"",organizationRole:"chairman"});
  async function assign(id:string,role:string){try{await api(`/users/${id}/roles`,{method:"POST",body:JSON.stringify({role})});notify("Роль назначена");await users.reload()}catch(e){notify((e as Error).message)}}
  async function revoke(id:string,role:string){try{await api(`/users/${id}/roles/${role}`,{method:"DELETE"});notify("Роль отозвана");await users.reload()}catch(e){notify((e as Error).message)}}
  async function toggle(id:string,disabled:boolean){try{await api(`/users/${id}/access`,{method:"POST",body:JSON.stringify({disabled})});notify("Административный доступ обновлён");await users.reload()}catch(e){notify((e as Error).message)}}
  async function sendInvite(event:FormEvent){event.preventDefault();try{await api("/invitations",{method:"POST",body:JSON.stringify({...invite,permissions:[]})});notify("Приглашение создано");setInvite({...invite,email:"",displayName:""})}catch(e){notify((e as Error).message)}}
  if(users.loading||roles.loading)return <Loading/>;if(users.error||roles.error)return <ErrorBox message={users.error||roles.error}/>;
  return <>{canInvite?<Panel title="Пригласить в организацию"><form className="admin-inline-form" onSubmit={sendInvite}><input required type="email" placeholder="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/><input required placeholder="ФИО" value={invite.displayName} onChange={e=>setInvite({...invite,displayName:e.target.value})}/><select required value={invite.organizationId} onChange={e=>setInvite({...invite,organizationId:e.target.value})}><option value="">Организация…</option>{orgs.data?.items.map(org=><option key={String(org.id)} value={String(org.id)}>{String(org.name)}</option>)}</select><select value={invite.organizationRole} onChange={e=>setInvite({...invite,organizationRole:e.target.value})}><option value="chairman">Председатель</option><option value="organization_director">Директор</option><option value="osi_manager">Менеджер ОСИ</option><option value="ksk_manager">Менеджер КСК</option><option value="survey_manager">Организатор</option></select><button className="admin-button primary">Отправить</button></form></Panel>:null}{canManage?<Panel title={`Пользователи · ${users.data?.total??0}`}><DataTable headers={["Пользователь","Статус","Platform roles","Активность","Управление"]}>{users.data?.items.map(u=>{const current=(u.roles??[])as string[];return <tr key={String(u.id)}><td><strong>{String(u.displayName)}</strong><small className="mono">{String(u.id).slice(0,13)}…</small></td><td>{u.adminDisabledAt?<Badge status="disabled"/>:<Badge status={String(u.status)}/>}</td><td><div className="admin-role-list">{current.map(role=><button key={role} title="Отозвать роль" onClick={()=>revoke(String(u.id),role)}>{role}<X size={12}/></button>)}</div></td><td>{formatDate(u.lastActivity)}</td><td><select defaultValue="" onChange={e=>{if(e.target.value)void assign(String(u.id),e.target.value);e.target.value=""}}><option value="">Назначить роль…</option>{roles.data?.items.filter(r=>String(r.key)!=="super_admin"||principal.roles.includes("super_admin")).map(r=><option key={String(r.key)} value={String(r.key)}>{String(r.name)}</option>)}</select><button className="admin-button ghost" onClick={()=>toggle(String(u.id),!u.adminDisabledAt)}>{u.adminDisabledAt?"Включить":"Отключить"}</button></td></tr>})}</DataTable><Pagination current={page} total={users.data?.total??0} size={20} onChange={setPage}/></Panel>:null}</>}
const organizationTypeNames: Record<string,string>={osi:"ОСИ",ksk:"КСК",management_company:"Управляющая компания",other:"Иное"};
const organizationRoleNames: Record<string,string>={organization_admin:"Администратор организации",chairman:"Председатель",organization_director:"Директор обслуживающей компании",osi_manager:"Менеджер ОСИ",ksk_manager:"Менеджер КСК",survey_manager:"Организатор голосования",viewer:"Наблюдатель (только просмотр)"};
const emptyOrganizationForm={displayName:"",legalName:"",bin:"",type:"osi",contactName:"",contactPhone:"",contactEmail:""};

function Organizations({principal,notify}:{principal:AdminPrincipal;notify:(value:string)=>void}){
  const state=useLoad(()=>api<{items:Json[]}>("/organizations"),[]);
  const canCreate=principal.permissions.includes("org.manage")||principal.roles.includes("super_admin");
  const canManageUsers=principal.permissions.includes("user.invite")||principal.roles.includes("super_admin");
  const [form,setForm]=useState(emptyOrganizationForm);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState("");
  async function create(event:FormEvent){event.preventDefault();setBusy(true);try{await api("/organizations",{method:"POST",body:JSON.stringify(form)});notify("Организация создана");setForm(emptyOrganizationForm);await state.reload();}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
  if(state.loading)return <Loading/>;if(state.error)return <ErrorBox message={state.error}/>;
  return <>
    {canCreate?<Panel title="Новая организация"><form className="admin-form-card" onSubmit={create}><div className="admin-form-grid">
      <Field label="Краткое название"><input required minLength={2} maxLength={200} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="ОСИ-КСК"/></Field>
      <Field label="Юридическое наименование"><input required minLength={2} maxLength={300} value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})} placeholder="ТОО «ОСИ-КСК»"/></Field>
      <Field label="БИН (12 цифр)"><input required inputMode="numeric" pattern="\d{12}" maxLength={12} value={form.bin} onChange={e=>setForm({...form,bin:e.target.value.replace(/\D/g,"").slice(0,12)})} placeholder="123456789012"/></Field>
      <Field label="Тип"><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{Object.entries(organizationTypeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Контактное лицо"><input maxLength={200} value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="Иванов И. И."/></Field>
      <Field label="Телефон"><input type="tel" maxLength={32} value={form.contactPhone} onChange={e=>setForm({...form,contactPhone:e.target.value})} placeholder="+7 701 000 00 00"/></Field>
      <Field label="Email"><input type="email" maxLength={200} value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})} placeholder="office@osi.kz"/></Field>
    </div><button className="admin-button primary" disabled={busy}>{busy?"Сохраняем…":"Добавить организацию"}</button></form></Panel>:null}
    <Panel title="Организации"><DataTable headers={["Название","БИН","Тип","Контакты","Статус","Доступ",""]}>{state.data?.items.map(org=><tr key={String(org.id)}>
      <td><strong>{String(org.name)}</strong><small>{String(org.legalName??"")}</small></td>
      <td className="mono">{String(org.bin??"—")}</td>
      <td>{organizationTypeNames[String(org.type)]??String(org.type)}</td>
      <td>{org.contactName?<strong>{String(org.contactName)}</strong>:null}<small>{[org.contactPhone,org.contactEmail].filter(Boolean).map(String).join(" · ")||"—"}</small></td>
      <td><Badge status={String(org.status)}/></td>
      <td>{principal.platformWide?"Платформа":principal.organizationGrants.some(g=>g.organizationId===org.id)?"Ваша организация":"—"}</td>
      <td>{canManageUsers?<button className="admin-button ghost" onClick={()=>setSelected(selected===String(org.id)?"":String(org.id))}>{selected===String(org.id)?"Скрыть":"Пользователи"}</button>:null}</td>
    </tr>)}</DataTable></Panel>
    {selected?<OrganizationUsers organizationId={selected} organizationName={String(state.data?.items.find(org=>org.id===selected)?.name??"")} notify={notify}/>:null}
  </>;
}

const emptyUserForm={displayName:"",login:"",password:"",email:"",phone:"",role:"organization_admin"};

function OrganizationUsers({organizationId,organizationName,notify}:{organizationId:string;organizationName:string;notify:(value:string)=>void}){
  const state=useLoad(()=>api<{items:Json[]}>(`/organizations/${organizationId}/users`),[organizationId]);
  const [form,setForm]=useState(emptyUserForm);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [issued,setIssued]=useState<{login:string;password:string}>();
  async function create(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{
      await api(`/organizations/${organizationId}/users`,{method:"POST",body:JSON.stringify(form)});
      setIssued({login:form.login.trim().toLowerCase(),password:form.password});
      notify("Пользователь организации создан");
      setForm(emptyUserForm);
      await state.reload();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function changeRole(userId:string,role:string){try{await api(`/organizations/${organizationId}/users/${userId}/role`,{method:"POST",body:JSON.stringify({role})});notify("Роль обновлена");await state.reload();}catch(e){notify((e as Error).message)}}
  async function resetPassword(userId:string){
    const password=prompt("Новый временный пароль (минимум 10 символов, буквы и цифры)");
    if(!password)return;
    try{await api(`/organizations/${organizationId}/users/${userId}/password`,{method:"POST",body:JSON.stringify({password})});notify("Пароль сброшен, потребуется смена при входе");await state.reload();}catch(e){notify((e as Error).message)}
  }
  return <Panel title={`Пользователи организации · ${organizationName}`}>
    {error?<ErrorBox message={error}/>:null}
    {issued?<div className="admin-alert"><strong>Передайте доступ пользователю:</strong> логин <span className="mono">{issued.login}</span>, временный пароль <span className="mono">{issued.password}</span>. Пароль показывается один раз и будет заменён при первом входе.</div>:null}
    <form className="admin-form-card" onSubmit={create}><div className="admin-form-grid">
      <Field label="ФИО"><input required minLength={3} maxLength={200} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Иванов Иван Иванович"/></Field>
      <Field label="Логин"><input required minLength={3} maxLength={64} value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="ivanov@osi.kz" autoComplete="off"/></Field>
      <Field label="Временный пароль"><input required minLength={10} maxLength={128} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="минимум 10 символов" autoComplete="new-password"/></Field>
      <Field label="Роль в организации"><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries(organizationRoleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Email"><input type="email" maxLength={200} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
      <Field label="Телефон"><input type="tel" maxLength={32} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
    </div><button className="admin-button primary" disabled={busy}>{busy?"Создаём…":"Добавить пользователя"}</button></form>
    {state.loading?<Loading/>:state.error?<ErrorBox message={state.error}/>:<DataTable headers={["Пользователь","Логин","Роль","Пароль","Последний вход",""]}>{state.data?.items.map(user=><tr key={String(user.id)}>
      <td><strong>{String(user.displayName)}</strong><small>{[user.email,user.phone].filter(Boolean).map(String).join(" · ")||"—"}</small></td>
      <td className="mono">{String(user.login??"—")}</td>
      <td><select value={String(user.role)} onChange={e=>void changeRole(String(user.id),e.target.value)}>{Object.entries(organizationRoleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
      <td>{user.mustChangePassword?"Временный":"Постоянный"}</td>
      <td>{formatDate(user.lastLoginAt)}</td>
      <td>{user.login?<button className="admin-button ghost" onClick={()=>void resetPassword(String(user.id))}>Сбросить пароль</button>:null}</td>
    </tr>)}</DataTable>}
  </Panel>;
}
function SettingsPage({principal}:{principal:AdminPrincipal}){return <><section className="admin-hero"><div><span className="admin-kicker">SECURITY BOUNDARY</span><h2>Конфигурация контура голосования</h2><p>Provider settings управляются только environment variables. Mock OTP и eGov недоступны в production. live-результаты выключены по умолчанию.</p></div><ShieldCheck size={42}/></section><Panel title="Ваши capabilities"><div className="admin-capabilities">{principal.permissions.map(p=><span key={p}>{p}</span>)}</div></Panel><Panel title="Организационные гранты">{principal.organizationGrants.length?principal.organizationGrants.map(grant=><p key={grant.organizationId}>{grant.role} · {grant.organizationId.slice(0,8)}…</p>):<p className="admin-muted">Нет org-scope грантов.</p>}</Panel></>}

function Panel({title,action,children}:{title:string;action?:ReactNode;children:ReactNode}){return <section className="admin-panel"><header><h2>{title}</h2>{action}</header>{children}</section>}
function DataTable({headers,children}:{headers:string[];children:ReactNode}){return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
function Pagination({current,total,size,onChange}:{current:number;total:number;size:number;onChange:(p:number)=>void}){const pages=Math.max(1,Math.ceil(total/size));return <div className="admin-pagination"><span>Страница {current} из {pages} · {total} записей</span><div><button disabled={current<=1} onClick={()=>onChange(current-1)}><ChevronLeft/></button><button disabled={current>=pages} onClick={()=>onChange(current+1)}><ChevronRight/></button></div></div>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="admin-field"><span>{label}</span>{children}</label>}
function Back({href}:{href:string}){return <a className="admin-back" href={href}><ArrowLeft size={17}/>Назад</a>}
function Summary({label,value}:{label:string;value:string}){return <article><small>{label}</small><strong>{value}</strong></article>}
function toLocal(value:string){if(!value)return"";const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
