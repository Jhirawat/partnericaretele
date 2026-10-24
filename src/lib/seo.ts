// Browser-safe head metadata helpers. Only verifiable facts; no certifications, outcomes or prices.
export const SITE_URL='https://partnericaretele.lovable.app';
export const SITE_NAME='iCareTele';
export const ORG_NAME='THAIKANYA PartnerCare';
/** The only routes that may be indexed or listed in the sitemap. Everything else is noindex. */
export const INDEXABLE_PATHS=['/','/partner-apply','/care-demo'] as const;
export const PRIVATE_PREFIXES=['/auth','/preview','/release-handoff','/mcp','/api','/.lovable','/dashboard','/admin-console','/superadmin-console','/release-readiness','/seo-readiness','/launch-qa','/publish-gate','/release-runbook','/backup-evidence','/protection-evidence','/content-review','/content-approval','/access-matrix','/verification-campaign','/verification-history','/production-test-readiness','/owner-action-queue','/golive-decision-pack','/test-session-workspace','/human-review-console','/launch-control','/integration-safety','/incident-console','/evidence-inspector','/validation-snapshot','/session-start-gate','/session-results','/golive-evidence-matrix','/human-review-packet','/final-review-handoff','/archive-integrity-snapshot','/owner-signoff-readiness'] as const;
type Meta=Record<string,string>;
export interface PageSeo{path:string;title:string;thTitle:string;description:string;thDescription:string;index:boolean;breadcrumb?:{name:string;path:string}[];jsonLd?:object[]}
export function canonical(path:string){return new URL(path,SITE_URL).href;}
export function breadcrumbLd(items:{name:string;path:string}[]){return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((x,i)=>({'@type':'ListItem',position:i+1,name:x.name,item:canonical(x.path)}))};}
export const organizationLd={'@context':'https://schema.org','@type':'Organization',name:ORG_NAME,alternateName:SITE_NAME,url:SITE_URL,logo:canonical('/favicon.svg')};
export const websiteLd={'@context':'https://schema.org','@type':'WebSite',name:SITE_NAME,url:SITE_URL,inLanguage:['th','en']};
/** Bilingual (Thai first, English) title/description; canonical + og:url self-reference; noindex for private pages. */
export function pageHead(p:PageSeo){
  const title=`${p.thTitle} | ${p.title} — ${SITE_NAME}`;const description=`${p.thDescription} ${p.description}`;const url=canonical(p.path);
  const meta:Meta[]=[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'website'},{property:'og:url',content:url},{property:'og:site_name',content:SITE_NAME},{property:'og:locale',content:'th_TH'},{property:'og:locale:alternate',content:'en_US'},{name:'twitter:card',content:'summary'},{name:'twitter:title',content:title},{name:'twitter:description',content:description},{name:'robots',content:p.index?'index, follow':'noindex, nofollow'}];
  const ld=[...(p.jsonLd??[]),...(p.breadcrumb?[breadcrumbLd(p.breadcrumb)]:[])];
  return {meta,links:p.index?[{rel:'canonical',href:url}]:[],scripts:ld.map(x=>({type:'application/ld+json',children:JSON.stringify(x)}))};
}
