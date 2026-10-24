"""Signed-out export permissions regression; no accounts, records or provider calls."""
import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
TARGETS=['access-matrix','backup-evidence','content-approval','content-review','evidence-inspector','incident-console','integration-safety','launch-control','protection-evidence','publish-gate','release-handoff','release-runbook','verification-campaign','validation-snapshot','owner-signoff-readiness','archive-integrity-snapshot','release-evidence-bundle','golive-evidence-matrix','human-review-packet','final-review-handoff','human-review-console','owner-action-closure','readiness-decision-ledger','session-results','session-start-gate','test-session-workspace','golive-decision-pack']
async def main():
 total=0; failures=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for device,size in [('desktop',{'width':1280,'height':1800}),('mobile',{'width':509,'height':473})]:
   context=await browser.new_context(viewport=size)
   for target in TARGETS:
    page=await context.new_page(); downloads=[]; requests=[]; errors=[]
    page.on('download',lambda d:downloads.append(d.suggested_filename))
    page.on('request',lambda r:requests.append(r.url))
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto('http://localhost:8080/'+target,wait_until='networkidle')
    exports=page.get_by_role('button',name=re.compile(r'export|download',re.I))
    try:
     assert await exports.count()>0,'Missing expected export control'
     for button in await exports.all():
      assert await button.is_disabled(),'Signed-out export enabled'
      # Bypass the visual disabled state to exercise the handler's authorization guard.
      await button.evaluate('(element)=>{element.disabled=false;element.click()}')
     await page.wait_for_timeout(100)
     assert not downloads,'Signed-out export handler downloaded a file'
     assert not [u for u in requests if re.search(r'/rest/v1/|/_serverFn/|/functions/v1/',u)],'Signed-out record read'
     assert not errors,'Export handler caused a runtime error'
     total+=1
    except AssertionError as e:failures.append({'device':device,'page':target,'failure':str(e)})
    await page.close()
   page=await context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080/launch-qa',wait_until='networkidle')
   if errors:failures.append({'device':device,'page':'launch-qa','failure':'Initial QA timestamp does not hydrate consistently'})
   else:total+=1
   await page.screenshot(path='/tmp/browser/system-verification/'+device+'_launch-qa.png')
   await context.close()
  await browser.close()
 print(json.dumps({'passed':total,'failed':len(failures),'failures':failures}))
 assert not failures
asyncio.run(main())
