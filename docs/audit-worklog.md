# سجل عمل تدقيق وتقوية DRS-AI-Phone (audit-worklog)

> هذا الملف هو الذاكرة المؤسسية الرسمية لفرع `fix/audit-hardening`.
> الدرس المؤسس: ما خارج المستودع يضيع — لذلك يعيش السجل هنا ويبقى في PR النهائي.

---

## الجلسة 1 — التدقيق الشامل (v1.41.0)

- تدقيق كامل لمستودع `CTO-DRS/DRS-AI-Phone` (React Native 0.82.1، New Architecture/Fabric/Hermes، MobX 6، WatermelonDB، llama.rn، Supabase).
- النتيجة: تقريران (عربي 40 ص / إنجليزي 45 ص)، مجموع 8.1/10، مع قائمة نقاط ضعف أمنية وهندسية.
- الأساس المدقق: tag `v1.41.0` = commit `400e0ead` = `main`.

## الجلسة 2 — تنفيذ الإصلاحات (ضاعت محلياً)

نُفذت 4 مجموعات إصلاح على فرع محلي `fix/audit-hardening` (commits `debe822` → `c3eb262` → `8fca3a9` → `2902867`)، **لم تُدفع لـ GitHub** ثم ضاعت بإعادة ضبط الحاوية:

1. **fix 1** (`debe822`): تثبيت `onnxruntime-react-native` على `1.24.3` بدل `^1.23.2` (الـ lockfile كان يحسم 1.24.3 أصلاً — الانجراف كان بين الـ manifest والقفل) + سكربت حارس + ربطه كخطوة fail-fast في CI.
2. **fix 2** (`c3eb262`): تخزين جلسات Supabase في Keychain عبر `supabaseSecureStorage` (خدمة `drs.supabase.*`، iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`، حارس JSON على مفاتيح `*-auth-token` فقط، الـ verifier الخام يمر كما هو، الحالة غير الصالحة صامتة بلا console.warn) + `migrateLegacySession` بترتيب اكتب→تحقق→احذف (idempotent، لا يُحذف المفتاح القديم إلا بعد تطابق القراءة) + `googleNonce.ts` **خامل** (فحص 16.0.0 و16.1.5 عبر npm pack: صفر دعم nonce) + 22 اختباراً شاملاً ثابت "لا تفقد جلسة أبداً".
3. **fix 3** (`8fca3a9`): TypeScript `5.0.4 → 5.9.3` (صفر أخطاء typecheck) + محاذاة عائلة jest على 29.7.0 (محاولة jest-30 فشلت فعلياً: 21 suite ماتت تحت preset RN — أُعيدت للـ 29 وفق قاعدة التراجع) + **ESLint بقي على 8** (‏`@react-native/eslint-config` يسحب `eslint-plugin-ft-flow` الذي يستخدم `context.getAllComments` المزال في 9).
4. **fix 4 مرحلة 1** (`2902867`): سقالة `src/store/model/` — `catalogStore.ts` + `downloadStore.ts` + `runtimeStore.ts` بعقود هجرة موثقة داخل الملفات + `index.ts` فاصاد تمريري صفر-منطق + `facade.test.ts` اختبار عقد (هوية singleton + سطح النطاقات) + إصلاح flake teardown قائم مسبقاً (DraftRulesManager) عبر فلتر console محصور في jest setup.

خط الأساس المقدس بعد المرحلة 1 حينها: **312 suites / 4987 اختباراً / 310 لقطات / EXIT=0**.

## الجلسة 3 — الحالية (إعادة البناء + المرحلة 2)

### الحوادث
- **إعادة ضبط 1**: الحاوية مُسحت بين الجلسات؛ الاستنساخ والcommits المحلية كلها ضاعت. `git ls-remote` أثبت أن `fix/audit-hardening` لم يُدفع أبداً (فقط `main`). استُعيد الأساس من `v1.41.0` العام.
- **إعادة ضبط 2**: أثناء الجلسة نفسها (`uptime 5 دقائق`) — مُسح كل شيء حتى worklog/scripts المحلية. استُعيد الأساس مجدداً.
- **فشل مصادقة الدفع**: التوكن القديم أُلغي عمداً (قرار أمني صحيح) — توقف كامل حتى توكن جديد وفق البروتوكول المعتمد.

### خط الأساس المقدس للشجرة المستعادة (v1.41.0 نظيفة)
- **308 suites / 4961 passed + 2 skipped / 310 snapshots** — بتشغيل مجزأ أمامي (8 دفعات عبر قوائم ملفات صريحة، `--runInBand`، `NODE_OPTIONS=--max-old-space-size=1536`).
- الحاوية تقتل العمليات الخلفية بين استدعاءات الأدوات (setsid/nohup لا ينجيان) — **ممنوع أي تشغيل خلفي؛ التشغيل مجزأ في المقدمة فقط**.
- lint ✅ (25.3s) + typecheck ✅ (13.7s). تحذير "Jest did not exit" مُستنسخ على دفعة c2 — سلوك قائم في الأساس (open handles)، ليس تراجعاً.
- فارق الأرقام عن 312/4987 = بالضبط ما أضافته المرحلة 1 الضائعة (+4 suites من: facade.test.ts واختبارات fix 2، +26 اختباراً).

### الجرد والتصنيف (مواضع `modelStore.`)
- **1974 سطر استدعاء في 86 ملفاً** (1986 match خام؛ سطر واحد false positive: نص مسار `__mocks__/stores/modelStore.ts` داخل تعليق في `BenchmarkRunnerScreen.test.tsx:1659` — العداد الحقيقي 1973 سطر API).
- الفئات النهائية المعتمدة:
  - **أ (تنزيلات فقط)**: 4 ملفات / 6 أسطر — `DownloadOverlay.tsx`(1)، `VisionDownloadSheet.tsx`(1)، `DownloadConfirmDialog.tsx`(1)، `DownloadBanner.tsx`(3).
  - **ب (كتالوج/تشغيل فقط)**: 60 ملفاً / 802 — لا تُلمس في المرحلة 2.
  - **ج (مختلط)**: 21 ملفاً / 1176 — مؤجلة للمرحلة 3 (منها `ModelStore.test.ts` ذاته بـ 902 — يسافر مع الفاصاد حتى المرحلة 4).
- **`isDownloading` getter يُرجع دالة**: `get isDownloading() { return (modelId) => downloadManager.isDownloading(modelId); }` — شكل الاستدعاء `isDownloading(modelId)` يجب حفظه.
- **كل الاستيرادات عبر البرميل** `'.../store'` (73 استيراداً) وليس `'./ModelStore'` مباشرة.
- لا يوجد destructuring أو تمرير singleton في كود الإنتاج (فقط casts خاصة داخل `ModelStore.test.ts`).

### قرارات خريطة النطاقات (معتمدة من المالك)
- تخزين/ملفات → `downloadStore`: `getModelFullPath`(24)، `resolveLocalModelPath`(4)، `checkFileExists`، `deleteModel`(19)، `removeInvalidLocalModels`(4).
- `removeModelByFullPath` → **catalogStore** (أدلة الكود: `models.splice` خالص — سطر 2968).
- عائلة projection (مؤقت حتى مراجعة مرحلة 3): status/canDelete/getDownloadedLLMs → تنزيلات؛ compat/default/hasRequired/getLLMsUsing → كتالوج؛ cleanup/pending → تشغيل.
- `downloadHFModel` (سطر 2768) → تنزيلات (دالة تركيبية تستدعي addHFModel داخلياً — تركيبها شأن المتجر).

## بروتوكولات التشغيل المعتمدة

1. **الدفع بعد كل commit** — الدفع لفرع feature نسخ احتياطي وليس دمجاً.
2. **النجاة المزدوجة**: بعد كل commit وقبل الدفع — `git bundle create ../download/audit-fixes.bundle 400e0ead..fix/audit-hardening` + `git bundle verify`. مجلد `download/` ينجو من إعادة الضبط.
3. **استعادة إعادة الضبط الثالثة (المتوقعة)**: (1) افحص `../download/audit-fixes.bundle` → استنساخ ضحل + `git fetch` من الـ bundle = صفر إعادة عمل؛ (2) وإلا `git fetch origin fix/audit-hardening`؛ (3) وإلا إعادة بناء من هذا السجل. أي استعادة تُوثق هنا.
4. **commitlint**: بادئات lowercase فقط (feat/fix/docs/chore/refactor)، بلا uppercase.
5. **mocks للاختبارات الجديدة**: انسخ نمط `ModelStore.test.ts` (المُنشئ يطلق جلباً شبكياً) + mock محلي للـ AsyncStorage داخل كل ملف (المشترك مكسور دائرياً) + بادئة `mock` لمتغيرات الهوِيستنغ + صفر تسجيل بعد اكتمال suites.
6. **verify-deps.js بالفئتين من البداية**: `MUST_BE_PINNED` (onnxruntime-react-native = 1.24.3 تماماً) + `MUST_BE_ALIGNED` (jest/babel-jest/@types/jest نفس الـ major).

## خطة الست commits المعتمدة (هذه الجلسة)

| # | المحتوى |
|---|---|
| 0 | `docs/audit-worklog.md` — هذا الملف |
| 1 | fix 1: onnxruntime 1.24.3 exact + verify-deps.js (الفئتان) + ci.yml |
| 2 | fix 2: supabaseSecureStorage + migrateLegacySession + googleNonce خامل + اختبارات |
| 3 | fix 3: TS 5.9.3 + عائلة jest 29.7.0 (ESLint يبقى 8 — ft-flow يحجب 9) |
| 4 | fix 4-م1: سقالة src/store/model/ + العقود داخل الملفات + facade.test.ts |
| 5 | المرحلة 2: دفعة الفئة أ (4 ملفات) + @deprecated على دوال التنزيل في الفاصاد + قاعدة eslint تحذير |

نقاط التفتيش: بعد (4): 312/4987/310 + lint/typecheck/verify:deps خضراء. بعد (5): العداد 1974→1968 + facade.test.ts أخضر + أمر CI الحقيقي EXIT=0.
