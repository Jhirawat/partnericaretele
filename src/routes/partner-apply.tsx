import {pageHead} from "@/lib/seo";
import {createFileRoute,Link} from '@tanstack/react-router';
import {usePartnerCopy} from '@/lib/partner-onboarding.copy';
import {Button} from '@/components/ui/button';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';
import {BrandIdentity} from '@/components/BrandIdentity';
import {Breadcrumbs,PublicFaq,RelatedLinks} from '@/components/PublicContent';
import {PUBLIC_PAGES,faqLd} from '@/lib/public-content';
import {useCopy} from '@/i18n';
const P=PUBLIC_PAGES['/partner-apply'];
export const Route=createFileRoute('/partner-apply')({staticData:{sitemap:true},head:()=>pageHead({path:'/partner-apply',index:true,thTitle:'สมัครเป็นพาร์ทเนอร์',title:'Partner application',thDescription:'สมัครบัญชีองค์กรพาร์ทเนอร์และส่งเอกสารใบอนุญาตเพื่อตรวจสอบ',description:'Apply for a partner organization account and submit license documents for review.',breadcrumb:[{name:'iCareTele',path:'/'},{name:'Partner application',path:'/partner-apply'}],jsonLd:[faqLd(P.faq)]}),component:PartnerApply});
function PartnerApply(){const l=usePartnerCopy();const {c}=useCopy();return <div className="mx-auto max-w-4xl px-5 py-8"><header className="flex flex-wrap items-center justify-between gap-4"><Link to="/" aria-label="iCareTele"><BrandIdentity/></Link><LanguageSwitcher/></header><main className="space-y-6 py-12"><Breadcrumbs path="/partner-apply"/><h1 className="text-4xl font-semibold">{l('title')}</h1><section aria-labelledby="apply-steps" className="space-y-4"><h2 id="apply-steps" className="text-2xl font-semibold">{c(P.sections[0]!.th,P.sections[0]!.en)}</h2><ul className="space-y-3 text-lg">{(['CLINIC','HEALTH_ESTABLISHMENT','MEDICAL_SERVICE'] as const).map(t=><li key={t}>{l(t)}</li>)}</ul><p className="text-muted-foreground">{l('licenseRequired')}</p><div className="flex flex-wrap gap-3"><Button asChild className="min-h-11"><Link to="/auth" search={{next:'/partner-onboarding',signup:true}}>{l('createAccount')}</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/auth" search={{next:'/partner-onboarding'}}>{l('signIn')}</Link></Button></div></section><PublicFaq path="/partner-apply"/><RelatedLinks path="/partner-apply"/></main></div>;}
