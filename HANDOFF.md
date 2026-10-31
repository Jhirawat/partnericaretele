# HANDOFF: iCareTele Android app (partnericaretele)

อัปเดตล่าสุด: 2026-10-30 (Claude ทำต่อจาก Codex)
เครื่องที่ใช้ build: Lenovo X260 (`C:\Users\Lenovo X260\Desktop\partnericaretele`)

## สถานะตอนนี้
- APK debug build ผ่าน: `android\app\build\outputs\apk\debug\app-debug.apk`
  ถูกคัดลอกไปที่ `Desktop\iCareTele-oauth-debug.apk`
- แอปโหลดเว็บจริง `https://partnericaretele.lovable.app` (ตั้งใน `capacitor.config.ts` -> `server.url`)
- ล็อกอินด้วยอีเมล/รหัสผ่าน: ใช้ในแอปได้
- ล็อกอินด้วย Google ในแอป: ยังไม่ได้ (เด้งไปหน้าเว็บ) ดูหัวข้อ "งานค้าง"

## วิธี build APK
ดับเบิลคลิก `build-apk.cmd` ในโฟลเดอร์โปรเจกต์ -> รอ `BUILD OK` -> กดปุ่มใดก็ได้
- log อยู่ที่ `build-apk-log.txt`
- สคริปต์ตั้งค่า env เฉพาะในหน้าต่างนั้น (ไม่กระทบ build เว็บปกติ):
  - รัน `npm run build:apk` (= `vite build` + `scripts/prepare-capacitor.mjs`) ส่วน `npm run build` ใช้สำหรับเว็บอย่างเดียว
  - `CAPACITOR_BUILD=1` ให้ `scripts/prepare-capacitor.mjs` สร้าง `index.html`
  - `CARE_LOCAL_REVIEW=1` ปิดปลั๊กอิน `@lovable.dev/mcp-js` ที่ทำให้ `vite build` พังบน Windows
  - `NODE_OPTIONS=--max-old-space-size=4096` กัน Node หน่วยความจำเต็ม
- ใช้ `npm.cmd`/`npx.cmd` เพราะ PowerShell บล็อก `npm.ps1` (Execution Policy)

## บทเรียนสำคัญ (อย่าทำซ้ำ)
- **ห้ามให้ APK ใช้ bundle ในเครื่องแทนเว็บจริง** แอปนี้พึ่ง TanStack Start server
  functions (`src/lib/*.functions.ts`) ที่ต้องมี server รันอยู่ เมื่อใช้ bundle ในเครื่อง
  จะได้จอขาว (ลองแล้ว 2026-10-30) ตัว config แบบนั้นเก็บไว้ที่
  `capacitor.config.ts.bak-local-bundle` เพื่ออ้างอิงเท่านั้น
- เชื่อม GitHub: `https://github.com/Jhirawat/partnericaretele` สาขา `master`
- ชุดรวมวันที่ 2026-10-31 เก็บ CMS, Animation, ดีไซน์ และการแก้ MFA จาก GitHub ไว้ แล้วเพิ่ม OAuth Android และ Android shell จาก Desktop โดยไม่ย้อนแบนเนอร์ทดสอบกลับมา

## งานค้าง: Google login ในแอป
โค้ดฝั่งแอปเขียนไว้แล้ว (Codex) ใน `src/routes/auth.tsx`:
- บน native เรียก `supabase.auth.signInWithOAuth({ provider: "google", redirectTo:
  "com.thaikanya.icaretele://auth/callback", skipBrowserRedirect: true })`
  แล้วเปิดด้วย `@capacitor/browser`
- รับ callback ผ่าน `App.addListener("appUrlOpen")` รองรับทั้ง `?code=` (PKCE)
  และ `#access_token=` (implicit)
- `AndroidManifest.xml` มี intent-filter scheme `com.thaikanya.icaretele` host `auth` path `/callback`
- test: `tests/auth-redirect.test.mjs`

ต้องทำนอกเครื่องให้ครบก่อนถึงจะใช้ได้ (**ต้องให้เจ้าของโปรเจกต์ตัดสินใจ**):
1. เอาโค้ดชุดในเครื่องขึ้นเว็บจริง (publish ผ่าน Lovable / push GitHub ที่ผูกกับ Lovable)
   **ระวัง:** การทำแบบนี้จะเอางานอื่นที่แก้ในเครื่องขึ้นไปด้วย ต้องตรวจทุกไฟล์ก่อน
2. Supabase / Lovable Cloud -> Authentication:
   - เพิ่ม Redirect URL: `com.thaikanya.icaretele://auth/callback`
   - เปิด Google provider ใน Supabase โดยตรง (ฝั่งเว็บใช้ระบบ Google ของ Lovable
     แต่ฝั่งแอปเรียก Supabase ตรง)
3. Build APK ใหม่ (`build-apk.cmd`) แล้วทดสอบ ถ้าจะใช้ emulator แนะนำ Android Studio Emulator
   (ดู log ผ่าน ADB ได้) บนเครื่องที่มี RAM >= 16GB

## ชุดไฟล์สำหรับ publish
โฟลเดอร์ `publish-patch/` มีเฉพาะไฟล์โค้ดเว็บที่ต่างจาก zip ของ Lovable (20 ต.ค.) พร้อม `README-PUBLISH.md`
วิธีเทียบ: ไฟล์จาก zip มีเวลาแก้ไข 20 ต.ค. ทั้งหมด ไฟล์ที่ใหม่กว่านั้นคือไฟล์ที่ถูกแก้

## ไฟล์ที่ Claude แก้/สร้าง (2026-10-30)
- `package.json`: `build` กลับเป็น `vite build` + เพิ่ม `build:apk`
- `publish-patch/`: ชุดไฟล์สำหรับ publish
- `capacitor.config.ts`: เพิ่ม `server.url` กลับไปที่เว็บจริง
- `capacitor.config.ts.bak-local-bundle`: สำรอง config เดิมของ Codex
- `build-apk.cmd`: สคริปต์ build APK แบบดับเบิลคลิก
- `HANDOFF.md`: ไฟล์นี้
