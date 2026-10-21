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

---

## سجل تنفيذ الجلسة 3 (مكتمل)

### الـ commits (كلها مدفوعة + bundle نجاة بعد كل واحد)
| # | Hash | المحتوى |
|---|---|---|
| 0 | `5995560` | docs: سجل العمل |
| 1 | `c234cdf` | fix: onnxruntime 1.24.3 exact + verify-deps (الفئتان) + CI fail-fast |
| — | `4dfc469` | chore: prettier لسكربت الحارس (تصحيح انزلاق تنسيق من commit 1) |
| 2 | `42fb37f` | fix: Keychain storage + ترحيل idempotent + اختبارات عقد nonce |
| 3 | `fc92f8e` | fix: TS 5.9.3 + عائلة jest مثبتة 29.7.0 (ESLint يبقى 8) |
| 4 | `b1ee42a` | chore(store): سقالة store/model — المخازن الثلاثة + الفاصاد + facade.test |
| 5 | `a29e7cf` | chore(store): هجرة دفعة الفئة أ (4 ملفات) + @deprecated + قاعدة eslint |

ملاحظة تصحيح تاريخ: commit برسالة chore محتواه fix-2 كاملاً (`834e59f`) أُعيد بناؤه عبر reset soft + force-with-lease فوراً قبل أي عمل آخر — الفرع نسخة احتياطية خاصة، والتصحيح موثق هنا.

### مفاجآت موثقة وقراراتها
1. **googleNonce موجود أصلاً upstream**: `src/utils/nonce.ts` + `sha256.ts` بنفس التصميم الخامل (v16 nonce-free) وsha256 مختبر — لم يُكرر؛ أُضيفا اختباران لعقدNonce (`nonce.contract.test.ts`).
2. **commitlint يرفض refactor**: قائمة المستودع feat/fix/docs/chore فقط — استُخدم chore(store) وأصلح التزام المالك.
3. **ESLint severity**: لا يمكن خلط warn/error في قاعدة واحدة (ESLint 8) — قاعدة الفاصاد دخلت error ضمن القاعدة الجذرية القائمة؛ لا يمكنها إطلاقاً إطلاق على الفئتين المؤجلتين (صفر استيرادات store/model عندها).
4. **jest.mock factory لا يبلغ الوحدات المستوردة انتقالياً** عند وجود moduleNameMapper (4 م_validatorات مضبوطة) — اختبارات الهجرة تسخر واجهة الـ adapter بمسار نسبي (حتمي)، وسلوك الـ adapter الحقيقي مغطى في suiteه المباشر.
5. **تسريب mock عبر السقالة (أخطر اكتشاف)**: استيراد السقالة `'../ModelStore'` مباشرة يجاوز السخرية البرميلية لأي suite يسخر البرميل فقط → المفرد الحقيقي يُبنى (شبكة + DeviceInfo) → فشل IncreaseContextSheet حتمي. **الإصلاح**: السقالة تستورد `'../'` (البرميل) عمداً + `import type` للكلاس يبقي حارس Pick وقت الترجمة. موثق داخل الملفات الثلاثة.
6. **activeDownloads computed getter**: يبني مصفوفة جديدة كل وصول — هوية مرجعية مستحيلة تصميماً؛ عقد الفاصاد يفحص تطابق المحتوى.
7. **عداد المواضع**: الخام الكلي 2113 يشمل 145 داخل السقالة (delegations بالتصميم)؛ **خارج السقالة: 1968 سطراً / 82 ملفاً = 1974 − 6 بالضبط** (مع false positive المعلوم).
8. **فارق اختبارات +2 عن checkpoint**: 4989 بدل 4987 (اختباران لعقد nonce — القاعدة "نفس العدد أو أكثر" مستوفاة).

### نقاط التفتيش النهائية (محققة)
- بعد commit 4: **312 suites / 4989 passed / 310 snapshots** + lint + typecheck + verify:deps خضراء
- بعد commit 5: العداد 1974→1968 خارج السقالة + facade.test أخضر + **أمر CI الحقيقي `yarn test --coverage` EXIT=0** (312/4989/310، 231 ث، workers وضع CI الفعلي) + verify:deps/l10n/fonts/lint/typecheck كلها خضراء
- السلسلة الكاملة النهائية: verify:deps ✓ l10n ✓ fonts ✓ lint ✓ typecheck ✓ test --coverage ✓

### الخطوة التالية (مرحلة 3)
الهجرة المختلطة: 19 ملفاً إنتاجياً (236 موضعاً خارج جناحي المتجر الذاتيين) + مراجعة الانقسام المؤقت لعائلة projection.

## Phase 3 closing record (session 5 — head 1f2f1f6 + closing commit)

- Class C fully migrated: 19 files (13 production + 6 test suites), batches 1-8.
- Batch 6 re-applied from documented backup after environment reset #5 (BenchmarkRunnerScreen 21 events + ModelsHubScreen 25 events); cast-form remnant resolved by dropping provably-dead ErrorState.error access.
- Batch 8 test migration used LOCAL sub-store mocks only (zero central test-utils changes, zero assertion deletions): requireActual + Object.create(real) inheritance + jest.fn overrides replicating central mock defaults + defineProperty for accessor-shadowed state (activeModelId, downloadError, models get/set).
- @deprecated expansion: catalogStore/runtimeStore facade re-exports now carry the same facade-path deprecation as downloadStore (phase-2 pattern, phase-3 expansion). ESLint no-restricted-syntax facade rule unchanged (error severity, as-is).
- madge circular: 42 chains at d68ebb9 == 42 chains at closing head, identical set — zero new cycles.
- Final triple counter (recipe: official = rg 'modelStore\.[a-zA-Z]' lines outside src/store/model; real = official − FP(modelStore\.ts\b); raw = official + 145 scaffold delegation lines): raw 1878 / official 1733 / real 1732 — exact match with the approved plan table. FP=1 (BenchmarkRunnerScreen.test comment referencing __mocks__/stores/modelStore.ts).
- Real CI command (test --coverage): EXIT=0 — 312 suites / 4989 passed + 2 skipped / 310 snapshots.
- Untouched (verified byte-level per-file against d68ebb9): B-class (all surviving files' modelStore line counts identical), ModelStore.ts (2 lines incl. singleton export), ModelStore.test.ts (932 lines), ModelStore.localModelPath.test.ts (39 lines), scaffold (161 lines constant).
- Deferred to Phase 4: ModelStore.ts self-reference (line 3577), ModelStore.test.ts, localModelPath.test, initializeStore cross-member, canDelete internal runtime read documentation.

---

## الجلسة 6 — الاستعادة السادسة + إعادة بناء خطة المرحلة 4

### الحادثة (إعادة ضبط 6)
- الحاوية مُسحت بالكامل: لا مستودع، لا scripts، لا bundles، **ولا توكن** (upload/gh_token.txt فارغ).
- `git ls-remote` أثبت: فرع `fix/modelstore-dissolution` غير موجود على origin — مخطط `99a48bb` **لم يُدفع قط** وضاع.
- الاستعادة: استنساخ كامل (FULL-HISTORY — الخطوة 0.1 غير مطلوبة أصلاً)، الفرع أُعيد من `fix/audit-hardening` (`88a0257`).

### حالة الخطوة 0 (موثقة)
- شجرة `origin/main` (400e0ea) ≠ شجرة 88a0257: **PR المراحل 1-3 غير مدموج** (41 ملفاً +477/−2325) — حالة توثيق فقط، الفرع النهائي يغطي الكل.
- الدفع متوقف: **TOKEN_REQUIRED** — upload/ فارغ؛ أول push سيكون بوابة المصادقة.

### إعادة البناء (كلها مقاسة من الكود عند 88a0257، ليست من الذاكرة)
- **docs/extraction-plan.md** + **docs/phase4-members.json** أعيد بناؤهما بمحلل بنيوي حتمي (scripts داخل الحاوية؛ الخطة نفسها داخل المستودع).
- تحققات مطابقة: official=1733 / real=1732 يطابقان سجل إغلاق المرحلة 3 حرفياً؛ داخل السقالة 138 (المرجع 145 كان بنمط أوسع يشمل استيرادات/تعليقات — الوصفة المثبتة الآن `modelStore\.[a-zA-Z]`).
- الجرد: 145 عضواً = 138 مفوَّضاً (39 catalog + 23 download + 76 runtime) + 7 غير مغطاة + خاصون موزعون؛ ModelStore.test.ts = 6,350 سطراً بـ 282 it( عادية + 3 it.each (المرسى 100+78+104=282 يطابق).
- الفئة ب المقاسة: **60 ملفاً / 782 سطراً رسمياً / 781 حقيقياً** (رقم 802 القديم كان أحداثاً).
- **حسم الشرط 3**: بعد 4b — official 951 / real 950 / raw 951 (المدى 950..951 انحسم بمصير سطر FP الذي يعيش داخل مجموعة ب).
- حسم الشرط 1: الستة تتحول إلى bootstrap.test.ts → 4e = 4989+2 ثابتة، suites 312 ثابتة.
- حسم الشرط 4: R0 = سقالة bootstrap.ts + ربط بالحقن، صفر نقل أعضاء، صفر فرق عدادات.
- fp الفريد الآن في BenchmarkRunnerScreen.test.tsx:1715 (تعليق __mocks__/stores/modelStore.ts).
- المصدر الذاتي الوحيد `modelStore.` داخل ModelStore.ts سطر 3577 (`toJS(modelStore.activeModel?.stopWords)` في startImageCompletion) — يموت مع دفعة B6 → official بعد 4a = 1732.

### نقطة التوقف الحالية
commit docs + bundle نجاة، ثم **توقف عند بوابة الدفع** بانتظار توكن جديد في upload/gh_token.txt.

---

## الجلسة 7 — 4a دفعات B2..B7 + بوابتان كاملتان (مكتملة ومدفوعة)

### التسوية العدادية (التزام المالك)
- توقع R0 قال raw=1871 خطأً (استخدم داخل=138، عدد المفوضين فقط)؛ الوصفة المثبتة تعدّ
  **أسطر** `modelStore.x` داخل src/store/model = 145 عند R0 → الفعلي **1878** (قياس نفس
  الشجرة يطابق). زلة سطر توقع واحد؛ الوصفة ثابتة والسلّم سليم. سطر §7 صُحح إلى 1878/145.

### الدفعات (كل دفعة: tsc/eslint + 318 ثابتة + مستهلكوها + عدادات + madge + bundle+push)
| دفعة | commit | المحتوى | الأرقام (official/real/raw/inside) | madge | ملاحظات |
|---|---|---|---|---|---|
| docs | d2a32e3 | جدول دورة حياة bootstrap §8 + fileMode + التسوية | — | — | قبل B5: سجل موت الجسور (c1ffc6a) |
| B2 | 2207b91 | getEffective* الأربع + MIN_CONTEXT_SIZE (ثابت وحدوي) + max_threads (أول حالة حقيقية: box + زوج وصول) | 1733/1732/1856/123 | 44 | لا @computed بين الأعضاء؛ إثبات الحيوية = اختبارا max_threads الحقيقيان |
| B3 | a76f144 | سطح draft/capabilities (7 أعضاء incl. capabilityEnv الخاص ← دالة وحدة) | 1733/1732/1853/120 | 44 | **قاعدة mock-compat وُلدت هنا** (ثلاث صدمات): قراءة عبر البرميل لا requireHost؛ serverStore عبر البرميل؛ optional-chains + احتياط محمي بالـ host |
| B4 | dd35a25 | عائلة auto-release الكاملة | 1733/1732/1852/119 | 44 | **قيد §3-أ مقفول**: mobx-persist يتجاهل المحسوبات عند الحفظ → مفاتيح persist الثلاثة تبقى على الإله الكائن حتى جذور v2 (B22+)؛ انحراف −1 = صيغة cast بلا نقطة |
| B5 | 23d9cd0 | ثلاثية benchmark (box + أجسام حقيقية) | 1733/1732/1849/116 | 44 | إعادة تسليح: BenchmarkRunnerScreen.test يسخر وحدة runtimeStore نفسها → صفر تعديل؛ ChatView.test عبر المركزي → صفر تعديل؛ ج9 وُلد (مات في B7) |
| B6 | 3f8048c | أعلام الإكمال + startImageCompletion — **المرجع الذاتي مات** (official −1 → 1732، قيمة السلم) | 1732/1731/1843/111 | 44 | chatSessionRepository استيراد مباشر — الحافة أُعلنت (+1 متوقع) ولم تُحتسب (44 ثابت — موثق في ج10)؛ this.activeModel الحقيقي من B3 قلب المرجع الذاتي إلى صفر أثر |
| B7 | 05a709a | دورة الحياة 1: الموتكس + pendingModelId (حالة وحدة + ماصّات) + releaseContext/Internal/manual + modelLoadError | 1732/1731/1856/124 | 44 | ج9/ج11 **ماتا في موعدهما**؛ ج12/ج13/ج14 وُلدت (موت B8/B22)؛ انحراف +4 = إحصائي (كتلا الكتابة مكررة فرعين)؛ اختبارتان تمارسان الاسم الخاص _releaseContextInternal عبر as-any → **تفويض خاص عكسي (نمط B1)، صفر تعديل اختبار** |

### البوابتان الكاملتان (بعد B4 وبعد B7)
- 8 شرائح كل مرة: verify:deps/l10n/fonts/lint/typecheck EXIT=0 · suites **312** بالضبط ·
  `yarn test --coverage` EXIT=0: **312 suites / 4989 passed + 2 skipped / 310 snapshots** ·
  العدادات وmadge كما أعلاه · ModelStore.test.ts **بلا أي تعديل** (git diff فارغ).
- الكاشف الثانوي (rg -U 'modelStore\s*\.\s*[A-Za-z_]' --count-matches): 1869 إجمالاً؛
  داخل src/store/model = 124 يطابق الوصفة المجمّدة حرفياً؛ الفارق (+13) كله مواضع
  استدعاء متعددة الأسطر في ملفات الفئة ب — تُصاد عند هجرتها في 4b.

### الدروس المؤسسية المثبتة في extraction-plan
1. §3-أ: منع أزواج الوصول على مفاتيح persist قبل الجذرين v2 (حارس isComputedProp).
2. قاعدة mock-compat: القراءة عبر getters المتجر/ربط البرميل؛ requireHost للكتابة فقط؛
   optional-chains؛ الاحتياطات المحمية تموت قسرياً في 4e (سجل الجسور ج3/ج4).
3. method-shorthand إلزامي للأعضاء الحقيقية ذات this (arrow-property في كائن حرفي =
   this معجمي → انهيار وقت تشغيل — كشفه tsc في B6).
4. أزواج الوصول على ModelStore (max_threads/appState/benchmarkActive/inferencing/
   isStreaming/modelLoadError) تعمل مع makeAutoObservable كمحسوبات قابلة للكتابة،
   والتهيئة تستمر عبرها (اختبارات max_threads الحية هي الإثبات).

### نقطة التوقف الحالية
بوابة B7 خضراء ومدفوعة (05a709a). التالي: B8 (دورة الحياة 2 — initContext وعائلتها،
تنتقل فيها ج12/ج13/ج14) ثم B9 — ثم بوابة السلسلة الثالثة.

---

## الجلسة 8 — استرجاع بعد إعادة ضبط #7، دفعتا B8/B9، بوابة السلسلة الثالثة (مكتملة ومدفوعة)

### الاسترجاع (إعادة الضبط السابعة)
- الحاوية أُعيد ضبطها؛ HEAD المحلي كان 4890a41 (قبل B1). origin/fix/modelstore-dissolution
  احتفظ بالسلسلة كاملة حتى 3d42d17 (جلسة 7) — دمج سريع بلا أي خسارة. core.fileMode=false
  أُعيد (منع 1,999 artifact وهمياً)؛ التوكن أُعيد حقنه في URL بصمت.

### B8 — دورة الحياة 2 (b3c963d)
- النقل: initContext + proceedWithInitialization (دالتي وحدة) + resolveMultimodalConfig +
  resolveDraftConfig (دالة وحدة) + checkMemoryAndConfirm + reinitializeContext +
  **حالة الثمانية**: context/engine/activeModelId/isMultimodalActive/activeProjectionModelId/
  activeRemoteBinding/isContextLoading/loadingModel — صناديق + أزواج وصول على الإله الكائن
  (نمط B2/B7: محسوبات قابلة للكتابة).
- **موت الجسور المعلنة**: ج12 (الماصّات الأربع حُذفت — لا مستهلك خارجي)، ج13 (15 كتابة
  صارت s.* — ذيل activeContextSettings/availableMemoryCeiling بقي برميلاً حتى B22 كما
  هو معلن)، ج14 (الاستدعاء محلي).
- **ولادات معلنة (نفس الـ commit)**: ج15 (models → B10)، ج16 (getModelVisionPreference →
  B14)، ج17 (getModelFullPath ×3 → B18)، ج18 (updateModelStopTokens/updateModelThinking-
  Capabilities عبر cast ضيق — غير مرئية للعداد → B23/B14)، ج19 (activeContextSettings →
  B22)، ج20 (largestSuccessfulLoad → B22)، ج21 (lastUsedModelId → B10)، **ج22** (حارس
  قراءة الحالة الثمانية: runtimeHost ? box : برميل — نمط ج3؛ suites البرميلية تملك الحالة
  على الموك المركزي — موت 4e قسرياً + مبكر suite-by-suite من 4b/4c).
- **اكتشاف إعادة التسليح (التزام المالك 3)**: ChatEmptyPlaceholder.test فشل (2/4) — مكوّن
  مهاجر (phase-3) يقرأ runtimeStore.activeModelId/isContextLoading أثناء render داخل suite
  برميلية الموك؛ الصناديق الجديدة عمت الحالة. **الإصلاح = التنفيذ لا الاختبار** (صفر تعديل
  اختبار): حارس موحّد على القراءات الثماني. الاختبارات التي تستبدل modelStore.initContext
  (4 مواضع) أُبقيت صحيحة بتوجيه الاستدعاءين الداخليين عبر عضو الإله الكائن (جسر موت 4d).
- madge: **44 بالضبط** — حافة ModelStore→useMemoryCheck ماتت (hasEnoughMemory هاجرت) ووُلدت
  runtimeStore→useMemoryCheck مكانها (الحلقة المعدودة تبادلت ممثلها فقط — مقيس قبل/بعد).
- **الأرقام**: توقع نهائي 1732/1731/1850/118 → قياس **1732/1731/1852/120** — انحراف +2
  مُفسّر حرفياً: سطرا تعليق في ملاحظات mock-compat يحويان modelStore.initContext
  (العداد يحصي أسطر التعليقات — نفس فئة FP الموثق). official ثابت 1732 (قيمة السلم منذ B6).

### B9 — مُفرَّغة بحكم القيد المقفول (4ee10ab)
- availableMemoryCeiling + largestSuccessfulLoad **مفتاحا persist** — §3-أ (مقفول منذ B4)
  يمنع نقلهما قبل جذري v2. المحتوى أُعيد إسناده إلى B22؛ جدول الدفعات و§3-أ ودفتر madge
  حُدّثا. لا دفعة runtime متبقية بعد B8 — السلم منطقياً B8 → B10 (الكيتالوج).

### بوابة السلسلة الثالثة (بعد B8/B9)
- 8 شرائح: verify:deps/l10n/fonts EXIT=0 · lint EXIT=0 (صفر أخطاء، 34 تحذيراً قائماً) ·
  typecheck EXIT=0 · `jest --coverage` EXIT=0: **312 suites / 4989 passed + 2 skipped /
  310 snapshots** بالضبط · العدادات 1732/1731/1852/120 · madge **44** ·
  ModelStore.test.ts **بلا أي تعديل** منذ 3d42d17 (git diff فارغ) · شجرة نظيفة.
- الكاشف الثانوي: 1865 إجمالاً؛ داخل src/store/model = **120 يطابق الوصفة المجمّدة
  حرفياً**؛ الفارق (+1745 خارجياً) كله مواضع استدعاء متعددة الأسطر في الفئة ب — تُصاد
  عند 4b. (CI الحقيقي = سلسلة أوامر job الحقيقية محلياً EXIT=0؛ حكم GitHub Actions
  يأتي مع PR النهاية — ci.yml يعمل على main فقط.)

### نقطة التوقف الحالية
بوابة B8/B9 خضراء ومدفوعة (4ee10ab). التالي: B10 (حالة الكتالوج — أول حافة
ModelStore→catalogStore، madge متوقع 46، فيها تموت ج1/ج2/ج15/ج21) — إعلان ما قبل الدفعة
أولاً.

---

## الجلسة 9 — استرجاع بعد إعادة ضبط #8، دفعة B10 (حالة الكتالوج + جذر v2 الأول)

### الاسترجاع (إعادة الضبط الثامنة)
- الحاوية أُعيد ضبطها؛ HEAD المحلي 4890a41 (قبل R0) وnode_modules محو. origin/fix/
  modelstore-dissolution احتفظ بالسلسلة حتى d9a9c7c (جلسة 8) — دمج سريع بلا أي خسارة،
  تثبيت yarn 1.22.22 + install مجمد القفل (75 ثانية)، core.fileMode=false أُعيد، التوكن
  أُعيد حقنه في URL بصمت. القياسات قبلی الدفعة طابقت بوابة الجلسة 8 حرفياً:
  1732/1731/1852/120 — الكاشف الثانوي 1865/120 — madge 44.

### الإعلان ما قبل الدفعة (التزام المالك 3 — إعادة التسليح)
- B10 تحرك حالة كتالوجية يغلفها الاختبار من عالمين: **العالم غير المسخر** (unmock):
  ModelStore.test + localModelPath + register + facade — الكتابات تمر عبر أزواج
  الوصول العكسية إلى الصناديق (سلوك مطابق). **العالم البرميلي المسخر**: ستة suites
  مستوردة للكتالوج مباشرة (BenchmarkRunnerScreen 24 اختباراً، ProjectionModelSelector،
  ModelNotAvailable، useOnboardingHandlers، ModelFileCard، ModelCard) + كل suites
  المكونات المهاجرة — القراءات تسقط عبر جوالب ج23/ج24 إلى الموك المركزي (مصدر
  التغذية لم يتغير — 4989+2 و310 مثبتان).

### B10 — حالة الكتالوج تنتقل إلى منزلها (الالتزام بالمحتوى)
- **الجذر `catalogStore:v2` وُلد** (§3-جزء 1): makePersistable(catalogStore, name
  'catalogStore:v2'، الخصائص الخمس models/version/deviceTier/rulesVersion/
  lastUsedModelId) — يستدعى من سلسلة persist في constructor الإله بعد حقن
  catalogHost. المتجر كائن عادي فحارس isComputedProp لا يلتقط أزواج الوصول فوق
  الصناديق (التفصيل في §3-أ المحدث)؛ الترطيب يكتب عبر المحددات والحفظ يقرأ عبر
  الجوالب — الحقل القابل للكتابة هو الصندوق نفسه.
- **الاستيراد الإرثي نصف الكتالوجي** (§3-جزء 2): importLegacyCatalogState في
  catalogStore.ts يقرأ مفتاح 'ModelStore' الإرثي، يوزع الحمولات الخمس داخل
  runInAction، يفشل بأمان (صامت، إعادة محاولة لاحقة)، ولا يلمس المفتاح. **تنظيف
  المفتاح مؤجل** إلى B22/4e — المفتاح لا يزال يحمل حمولات runtime السبعة.
  الترتيب حاسم: ترطيب v2 ← بذر الإرث ← initializeModelSystem (بوابة version
  ترى القائمة المبذورة).
- **النقل**: 5 مفاتيح persist كصناديق وحدوية + 4 مشتقات كحسابات حقيقية
  (displayModels/availableModels/lastUsedModel/remoteModels) + createRemoteModel
  (خاص، انتقل حرفياً مع مستهلكه الوحيد). الإله الكائن: أزواج وصول عكسية قابلة
  للكتابة (نمط B2/B7/B8) — صفر تعديل على أي مستدعٍ خارجي.
- **جذر الإله انخفض إلى 7 مفاتيح**: السطر makePersistable للإله فقد الخمسة
  الكتالوجيين (تحذير computed-persist متفادى)؛ مفتاح 'ModelStore' الإرثي يواصل
  حفظ runtime فقط حتى runtimeStore:v2 (B22).

### موت الجسور (سجل §8 محدَّث في نفس الدفعة)
- **ج1 مات**: قراءتا القائمة في activeModel قُلبتا إلى catalogStore.models/
  remoteModels — استيراد مباشر './catalogStore' (حافة madge المعلنة).
- **ج15 مات**: القراءات الثلاث (resolveMultimodalConfig/resolveDraftConfig/
  reinitializeContext) قُلبت إلى المالك.
- **ج21 مات**: كتابة lastUsedModelId من proceedWithInitialization قُلبت إلى
  catalogStore.lastUsedModelId.
- **ج2 عُدّل موته إلى 4e** (خيار التفويض المعلن في سطره): effectiveDraftModeOf
  يحتاج مصدراً كاملاً (activeModel + contextInitParams غير كتالوجيين) — المصدر
  يقرأ models عبر زوج التفويض العكسي فيصل المالك في النهاية.
- **ولادات معلنة (نفس الـ commit)**: ج23 (حارس catalogHost على المفاتيح الخمسة —
  نمط ج22)، ج24 (الحارس على المشتقات الأربعة — الموك المركزي يحمل حساباته
  الخاصة وينقصه remoteModels فالسقوط يحافظ على سلوك suites حرفياً)، ج25
  (استدعاءا الجذر v2 والاستيراد الإرثي في constructor الإله — سلك تركيب يموت 4e).

### اكتشاف التصحيح (انحراف تم تصحيحه فوراً)
- المحاولة الأولى قلبت القراءات عبر إضافة catalogStore إلى استيراد البرميل '../'
  في runtimeStore — tsc أوقفها: البرميل الخارجي لا يصدّر catalogStore، وإضافته
  إليه كانت ستكسر suites البرميلية (مصنع الموك المركزي بلا مفتاح catalogStore —
  undefined). **التصحيح**: استيراد مباشر './catalogStore' (نمط موت ج1 المعلن
  «استيراد المالك بحافة madge معلنة») — الوحدة لا تُسخر أبداً فجوالبها تسقط إلى
  modelStore البرميلي (= الموك المركزي) في suites البرميل، وشرطية الحقن تقرأ
  الصناديق في العالم غير المسخر. قياس madge أثبت عدم تكلفة حلقة ثالثة (46 بالضبط).
- خطأ صياغي وُلد أثناء التحرير (`async finally`) وأصلح فوراً قبل أي قياس — سجل
  بروتوكول «التحقق بـ Read فور أي تحرير».

### الأرقام (توقع ← قياس)
- **المتوقعة قبل التنفيذ**: official 1732 / real 1731 (ثابتان — الدفعة تحرك حالة
  لا مواقع استدعاء)؛ madge 46 (سلّم معلن)؛ suites 312 / 4989+2 / 310 ثابتة؛
  داخل src/store/model: توقع أولي 123 كان **خاطئ الحساب** — التصحيح قبل القياس:
  قراءات الحالة التسع في catalogStore تحولت من pass-through إلى جوالب احتياطية
  وهي ما تزال أسطر modelStore.X (صافي صفر لملف الكتالوج)؛ الفارق الحقيقي = 6
  قلبات runtime فقط ← المتوقع 114.
- **المقيس**: official **1732** / real **1731** / داخل **114** / raw **1846** —
  تطابق حرفي. الكاشف الثانوي (الوصفة المجمدة): الإجمالي **1859** (1865−6) /
  داخل **114** (download 23 + facade 7 + catalog 39 + runtime 45).
- **madge: 46 بالضبط** (44 + حافتا ModelStore→catalogStore المعلنتان؛ استيراد
  runtimeStore→catalogStore المباشر لم يضف حلقة — العنقود المعدود نفسه).
- **B-class census ثابت**: 782/781 (لا أسطر فئة ب تحركت).

### بروتوكول الدفعة-8 (السباقات المتأثرة — 12 suite)
- facade.test (constructor الحقيقي + جذر v2 + استيراد إرثي + هوية live-state) ✓
- ModelStore.test (304 اختباراً مع facade — **بلا أي تعديل**) ✓
- localModelPath + registerOnboardingAssistantModel ✓
- BenchmarkRunnerScreen (24) + ChatEmptyPlaceholder (درس B8) ✓
- ProjectionModelSelector + ModelNotAvailable + useOnboardingHandlers +
  ModelFileCard + ModelCard + useChatSession ✓
- **المجموع: 12 suite / 532 اختباراً، كلها خضراء.**

### نقطة التوقف الحالية
B10 خضراء ومدفوعة (انظر commit). التالي: B11 (طفرات القائمة — addHFModel/
addLocalModel/resetModels/removeModelFromList/removeModelByFullPath/
registerOnboardingAssistantModel/mergeModelLists/reconcilePresets/resolvePresets
+ خاصو preset + draftRulesManager/DraftRulesManager) — إعلان ما قبل الدفعة أولاً.

---

## B11 (phase-4 4a) — طفرات القائمة + خط الأنابيب preset → catalogStore

**الإعلان قبل الدفعة**: الأعضاء التسعة العامون + resolvePresets/upgradeToFetchedRules/
candidateToPair/draftToStub (خاصة preset) + draftRulesManager/DraftRulesManager.
resolvePresetModels سافر مع المدير (مستدعوه الوحيد المدير نفسه + pass-through؛ إبقاؤه
يولّد حلقة catalog→god→catalog بلا موت معلن). **حل المدير**: كل استخدامات host تشاركت
الانتقال (كتابات deviceTier/rulesVersion → صناديق الكتالوج نفسها؛ استدعاءات
resolvePresetModels/reconcilePresets → أعضاء مُشارِكة) → الملف حُلّ داخل catalogStore.ts
كدوال وحدة (catalogResolvePresets/catalogUpgradeToFetchedRules مُصدَّرتان لمس initializeStore
حتى B23؛ catalogCandidateToPair/catalogDraftToStub خاصتان) وحُذف الملف — قتل حلقة #17
(ModelStore↔DraftRulesManager) فنزل madge 46→45 (انحراف معلن عن دفتر madge).

**التنفيذ**: الأجسام حرفية؛ this.* يصل أعضاء وصناديق catalogStore نفسها. الإله يحتفظ
بمفوضين عكسيين حرفيين (نمط B8) حتى 4d — منهم خاصّان (resolvePresets/
upgradeToFetchedRules) يستمر initializeStore في استخدامهما حتى B23. privates
candidateToPair/draftToStub انتهت مفوضاتها على الإله (مستهلكها الوحيد انتقل).

**الجسور المولودة** (سجلت في §8): ج26 download-status (→B16)؛ ج27 GGUF (→B13، الأخير
بعرض بنيوي ضيق نمط ج18 لأن loadMissingGGUFMetadata خاص)؛ **ج28** استدعاء داخل-كتالوجي
عبر الواجهة (resetModels→mergeModelLists عبر modelStore بدل this.، نمط ج2 →4d).

**المشكلة ومنحها (توثيق، بلا أي تعديل اختبار)**: أول بوابة كاملة فشلت بمجموعتين
(2 اختبار في ModelStore.test). التشخيص المقيس:
1. `resetting models › should reset models...`: الاختبار يركّب override على
   `modelStore.mergeModelLists` ويتوقع أن يستدعيه resetModels — pre-B11 كان
   `this.mergeModelLists` داخل جسم الإله يمر بالـ override (ظل المثيل)؛ post-B11
   الاستدعاء داخل-كتالوجي مباشر فتجاوز الـ override → 0 استدعاءات.
2. `mergeModelLists - repo inference`: يمر منفرداً ويفشل في الترتيب — أثر جانبي:
   فشل (1) جعل سلسلة resetModels الحقيقية كاملة تعمل داخل الاختبار الأول فتسرّب
   كتابات مؤجلة إلى الصندوق خلال tick الاختبار الثاني.
**العلاج المعلن**: ج28 — الاستدعاء داخل-كتالوجي يمر عبر الواجهة (سطح الإرسال الذي تعيش
عليه overrides الاختبار). بوابة كاملة بعدها: ModelStore.test 298/298 بلا تعديل.

**الأرقام المقيسة بعد الدفعة**: suites 312/4989+2/310 ✓؛ عدادات official/real/raw/inside
= 1732/1731/**1842**/**110** (التوقع 1841/109 — ج28 المعلنة +1 داخل؛ die 4d)؛ madge **45**؛
tsc EXIT=0؛ ModelStore.ts **2,805 → 2,400** (−405)؛ catalogStore.ts 406 → ~1,000؛
DraftRulesManager.ts حُذف (−125). Net src: −530 سطراً.

### نقطة التوقف الحالية
B11 خضراء ومدفوعة (انظر commit). التالي: B12 (محدّثات البيانات الوصفية —
updateModelName/resetModelName، updateModelChatTemplate/reset، updateModelStopWords/
reset، updateModelHash، isModelAvailable، fetchAndUpdateModelFileDetails).

## B13 (phase-4 4a) — عائلة GGUF → catalogStore؛ موت ج27 في موعدها

fetchAndPersistGGUFMetadata + loadMissingGGUFMetadata (خاص → دالة وحدة
catalogLoadMissingGGUFMetadata مُصدَّرة لمفوض initializeStore الخاص حتى B23) +
healDraftVisionClassification. **ج27 مات** (المعلن B11→B13): استدعاءا
resetModels/addLocalModel قلبا داخليين وطُرح عرض GodCatalogPrivates البنيوي.
**ج29 اكتسب عضواً**: fetchAndPersistGGUFMetadata→getModelFullPath (الموت B18).
**ج30 وُلد**: heal يقرأ/يكتب pendingProjectionCleanupIds عبر البرميل (مفتاح persist
مقيم على الإله حتى B22 وفق §3-أ؛ الجهة المنتجة لـ cleanupQueueBridge؛ الموت B22).
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/1834/102 (صافي صفر: −3 مولود +3 —
التنبؤ −2 كان خطأ عدّ أسطر pass-through متعددة الأسطر؛ المقيس متسق ذاتياً)؛ madge 45؛
tsc 0؛ ModelStore.ts → 2,174؛ ModelStore.test بلا تعديل ✓.

## B14 (phase-4 4a) — remote + vision/reasoning → catalogStore؛ ثلاثة جسور ماتت في موعدها

setRemoteModel/setModelVisionEnabled/getModelVisionPreference/setReasoningOverride/
recordReasoningObserved → catalogStore؛ updateModelThinkingCapabilities (خاص → دالة
وحدة مُصدَّرة)؛ reprobeRemoteCapsIfUnknown → runtimeStore (دالة وحدة — حالتها runtime).
**موتا ج5 وج16 ونصف ج18 في موعدهما** (كما أُعلن): reprobe أصبح داخلياً في runtimeStore؛
قراءة resolveMultimodalConfig انقلبت للمالك؛ cast updateModelThinkingCapabilities حل
باستيراد مباشر.
**مشكلتان قيستا وعولجتا إنتاجياً (بلا أي تعديل اختبار)**:
1. استيراد catalogStore→runtimeStore الثابت (للكتابات عبر سطح المالك) أغلق حلقة ترتيب
   تحميل كسرت مصانع requireActual في 6 suites مكونات → قُطع الإعلان، والحل ج32:
   الكتابات عبر الواجهة (نمط ج28) — بلا حافة madge جديدة (45 بقيت).
2. ج31 (وصول PM) كسر render في ChatAssistantModelPickerSheet (الموك المركزي بلا
   projectionManager) → قاعدة mock-compat (B2-B4): إنتاجاً العرض الضيق، واحتياطاً عضو
   البرميل — الاثنان يموتان B15.
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1830**/**98** (احتياطا ج31 +2 عن 1828/96
المؤقت — مصدره معلن)؛ madge **45** (إعادة تأسيس بعد قطع حافة B14 المعلنة؛ دفتر §7
أُعيد معايرته: 46 عند B15)؛ tsc 0؛ ModelStore.ts → **2,049**.

## B15 (phase-4 4a) — عائلة projection-كتالوج → catalogStore + إعادة إيواء المدير جزء 1

الأعضاء الخمسة (getCompatibleProjectionModels/getDefault+setDefaultProjectionModel/
getLLMsUsingProjectionModel/hasRequiredProjectionModel) + عائلا الرؤية أصبحا حقيقيين على
catalogStore. **الإعادة الإيواء جزء 1**: ProjectionModelManager — عقد host ضيق
(ProjectionHost: نماذج الكتالوج + قراءات runtimeBridge الأربع + استدعاءا
initContext/deleteModel) بدل نوع الإله الكامل؛ **مثال واحد** يبنيه ويصدّره catalogStore
(أسفل الوحدة) ويخدم حتى أعضاء B19/B20 المتبقين على الإله (انقلبت مفوضاتهم للمثال
المُعاد إيواؤه) وحقل الإله مات. **ج31 مات** (العرض الضيق + الاحتياط). **ج33 وُلد**:
قراءات runtimeBridge عبر الواجهة المحقونة (عائلة ج32؛ الموت 4e بحقن runtime مباشرة من
bootstrap). حافة النوع ModelStore↔ProjectionModelManager (الحلقة #18) ماتت مع تقاعد
الاستيرادين.
الأرقام: 312/4989+2/310 ✓ من أول بوابة؛ عدادات 1732/1731/**1829**/**97** (−7 مولود
+6 مضيف = −1 مطابق للتنبؤ)؛ madge **44** (45−1)؛ tsc 0؛ ModelStore.ts → 2,017.

## B16 (phase-4 4a) — حالة التنزيل + الطابور → downloadStore؛ ج26 حقق جوهره بتعديل معلن

الحالتان العابرتان (verifyingModelIds/downloadError — §2 #7/#5) صندوقان حقيقيان على
downloadStore مع أزواج وصول على الإله (نمط B10)؛ العائلة: activeDownloads/isDownloading
(الفخ المنحني محفوظ حرفياً)/getDownloadProgress/clearDownloadError/
refreshDownloadStatuses/initializeDownloadStatus أصبحت تنفيذاً حقيقياً على المالك.
**ج26 — الجوهر حقق والميكانيزم انضم لعائلة ج32**: الاستيراد الثابت
catalogStore→downloadStore كان سيغلق حلقة ترتيب التحميل (5 suites تسخر downloadStore
بمصانع requireActual) — فبقيت رحلة الكتالوج عبر الواجهة وموتها النهائي مع العائلة.
**ج34 وُلد** (checkFileExists + flushPendingLocalPathRecoveries — الأخير خاص بعرض ضيق
نمط ج18؛ الموت B18). **مدج 46 = انحراف معلن**: حافة ModelStore→downloadStore أغلقت
حلقتين (المباشرة + النوعية السابقة) — الدفتر توقع +1.
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1823**/**91**؛ tsc 0؛ ModelStore.ts → 2,012.

## B17 (phase-4 4a) — دورة التنزيل + جسر mutationSync → downloadStore

الأعضاء الخمسة (checkSpaceAndDownload/cancelDownload/pauseDownload/resumeDownload/
retryDownload) تنفيذاً حقيقياً على downloadStore؛ **كتلة setCallbacks انتقلت كتركيب**
(mutationSync() مُصدَّرة ويستدعيها constructor الإله — سلك ج25-عائلة، موته 4e) —
كتابات downloadError صارت على صندوق downloadStore نفسه؛ القراءات الكتالوجية واستدعاءا
verifyDownloadedModel (B19)/fetchAndPersistGGUFMetadata (الكتالوج) عبر الواجهة
(ج35b/ج26-tail — لا استيراد static: درس ج32). **ج35 وُلد**: ثنائيا B20
(_downloadProjectionModelIfNeeded/_downloadDraftModelIfNeeded) بعرض بنيوي ضيق — الموت B20.
**مشكلة قيست وعولجت (بلا تعديل اختبار)**: 12 فشلاً مرتبياً — اختبار retryDownload
يركّب override على god.checkSpaceAndDownload ويتوقع أن يمرر إليه retryDownload؛ فشله
سرّب الـ override إلى عائلة اختبارات B20 كلها (1ms، صفر startDownload) → العلاج:
retryDownload يرسل عبر الواجهة (شكل ج28، الموت 4d).
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1828**/**96**؛ madge 46؛ tsc 0.

## B18 (phase-4 4a) — عائلة الملفات/التخزين → downloadStore؛ ج17/ج29/ج34 تموت

الأعضاء الستة (getModelFullPath/resolveLocalModelPath/checkFileExists/
removeInvalidLocalModels + الخاصان pendingLocalPathRecoveries و
flushPendingLocalPathRecoveries) تنفيذاً حقيقياً على downloadStore —
**pendingLocalPathRecoveries صار Map على مستوى الموديول** وflush صار دالة
موديول-محلية (غير مرصودتين، غير محفوظتين — نفس دلالات الإله حرفياً؛ لا
حاجة لإعادة تسليح persist لأنهما خارج قائمة الحفظ أصلاً).
**ج34 مات موتاً كاملاً**: استدعاءا refreshDownloadStatuses (checkFileExists +
cast GodDownloadPrivates) صارا داخليين، والنوع المحذوف؛ وكذلك ذيل ج34 في
checkSpaceAndDownload (getModelFullPath داخلي).
**ج17 (3 قراءات في runtimeStore) وج29 (قراءتان في catalogStore)**: سببهما
مات — المالك هاجر — والخطوط أعيد وسمها إرسالاً عبر الواجهة (عائلة ج28، موتها
4e): صفر تغيير سلوكي حمايةً لتوبولوجيا الـmocks (11 suite تمزح الـbarrel؛
الوصول المباشر لـdownloadStore كان سيتجاوز الـmocks).
قراءة/كتابة الكتالوج في flush/removeInvalid تبقى عبر الواجهة (درس ج32 —
لا استيراد static من downloadStore نحو catalogStore).
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1824**/**92**؛ madge 46 (A/B
عبر stash: 46=46 — صفر حلقات جديدة)؛ tsc 0؛ ModelStore.ts 1,951 → **1,733**.

## B19 (phase-4 4a) — حذف/تحقق/مدخل HF → downloadStore؛ ج35b يموت

الثلاثية (deleteModel 117L / verifyDownloadedModel / downloadHFModel) تنفيذاً
حقيقياً على downloadStore. **ج35b مات**: dispatch القبّ في mutationSync صار
داخلياً (downloadStore.verifyDownloadedModel) — الصندوقان verifyingModelIds/
downloadError صندوقان الموديول مباشرة. **deleteModel**: الإرسالات العابرة
للنطاق بقيت عبر الواجهة (كتالوج: models/canDelete/cleanupOrphaned/
setModelVisionEnabled/addHFModel — ج32 و4e؛ runtime: activeModelId/
releaseContext/contextInitParams/setSelectedDraftModel — B22؛ ج28:
checkSpaceAndDownload — 4d) والداخلي getModelFullPath/refreshDownloadStatuses
صار ذاتيّاً. **downloadHFModel**: addHFModel/setModelVisionEnabled عبر الواجهة
(4e)، انطلاق التنزيل شكل ج28 (سطح الـoverrides — 4d).
نمو scaffold مؤقت معلن: 92 → **103** (+11: إرسالات deleteModel/downloadHFModel
حطّت على downloadStore حتى تدفقات B20/4d/4e — النمو يعكس هجرة الأعضاء لا
عودةً للوراء).
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1835**/**103**؛ madge 46=46 (A/B
عبر stash)؛ tsc 0؛ ModelStore.ts 1,733 → **1,502**.

## B20 (phase-4 4a) — عائلة projection-تنزيل → downloadStore؛ اكتمال cleanupQueueBridge؛ ج35 يموت

**الحالة الحقيقية هاجرت**: pendingProjectionCleanupIds (صندوق + إعادة ترطيب —
المفتاح محفوظ! جذر `downloadStore:v2` وُلد هنا مع الاستيراد الإرثي لمرة واحدة
نمط B10، بند إعادة الترطيب مُنَّذ: الترطيب أولاً ثم البذرة — تنظيف المفتاح
القديم B22/4e) + drainPendingProjectionCleanup (تنفيذ حقيقي: deleteModel
وgetDownloadedLLMs داخلي/عبر الواجهة) + الزوج الخاص
(_downloadProjectionModelIfNeeded/_downloadDraftModelIfNeeded دوال موديول-
محلية، موت ج35: cast GodDownloadB20 حُذف) + مندوبان خاصان عكسيان على الإله
(B1/B13 — ModelStore.test يقود الخاص عبر `as any` والسطح لازم يبقى).
**الرباعية + المفرد بقي إرسالاً عبر الواجهة** — محاولة جعلها حقيقية عبر
استيراد PM كسرت 4 suites: مصانع requireActual تُرجع كائنات مُضيّقة
(`{catalogStore: ...}`) تُسقط تصدير projectionManager، وحلقة
catalogStore↔PM-المستقبل تكسر المصانع نفسها (درس ج33 حرفياً: «حلقة الترتيب-
التحميل تكسر مصانع requireActual»). محاولة وسيطة (موديول محايد
projectionManager.ts) فشلت لسبب الجلسة ذاته — أُبطلت. موت الرباعية = 4e مع
عائلة الواجهة؛ محركها PM عبر الإله بلا تغيير.
**درس ج33 صار مقيّداً للحاوية**: ممنوع استيراد projectionManager (أو أي تصدير
غير المرصود في المصانع) من catalogStore داخل downloadStore.
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1847**/**115** (+12 معلنة:
إرسالات الرباعية على downloadStore حتى 4e)؛ madge 46=46 (A/B عبر stash)؛
tsc 0؛ ModelStore.ts 1,502 → **1,437**.

## B21 (phase-4 4a) — عائلة GPU → runtimeStore (شكل الكتابة عبر الـhost — عائلة B1)

الخماسية العامة (setNoGpuDevices/setDevices/setFlashAttnType/setKvUnified/
setNParallel) تنفيذاً حقيقياً على runtimeStore بنمط B1 حرفياً
(hostInitParams().contextInitParams = {...spread}) — كانت pass-throughs
معلنة في RUNTIME_MEMBERS منذ المقدمة. **initializeGpuSettings** (خاصة)
صارت دالة موديولية مُصدَّرة على runtimeStore + مندوب عكسي خاص على الإله
(B1/B13 — سطح as any ثابت؛ مستدعى initializeStore يستمر عبر المندوب حتى B23).
استيراد checkGpuSupport انتقل (ميت على الإله). الفلاش-أتِن يحفظ فخ إعادة
F16 عند الإيقاف حرفياً.
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1842**/**110** (−5: موت
pass-throughs الخمسة)؛ madge 46=46 (A/B)؛ tsc 0؛ ModelStore.ts 1,437 → **1,421**.

## B22 (phase-4 4a) — المفاتيح المحفوظة → runtimeStore؛ جذر runtimeStore:v2؛ تقاعد الـhost؛ initializeThreadCount → bootstrap

**الحالة الحقيقية**: contextInitParams (محفوظ) + availableMemoryCeiling +
largestSuccessfulLoad (إعادة إسناد B9) صناديقاً حقيقية على runtimeStore مع
أزواج كتابة؛ activeContextSettings صندوق عابر؛ قراءات البرميل الأربع ماتت
(ذيل ج19/ج13/ج20) — الكتّاب الداخليون (releaseContextInternal /
proceedWithInitialization) صاروا كتابة native. **جذر `runtimeStore:v2`
وُلد** (الخصائص الثلاث المحفوظة + importLegacyRuntimeState نمط B10 — الترطيب
أولاً ثم البذرة)؛ قائمة persist الإله → 3 مفاتيح (عائلة auto-release تبقى
حتى 4e). **تقاعد الـhost**: الواجهة RuntimeHost وinjectRuntimeHost
وrequireHost/hostInitParams حُذفت — الـ24 كاتب Host (16 من B1 + 5 من B21 +
initializeGpuSettings + الثنائي cache-type) صاروا كتابة native على الصناديق.
**الحراس ج22 بقوا** بإشارة حيوية markRuntimeLive (نفس موضع الحقن بالضبط؛
الكتابة لا تسألها) — محاولتَي قتلهم كسرتا مسارات القراءة المباشرة في 11
suite تمزح الـbarrel + حلقة MobX في activeModel (الدليل: ChatEmptyPlaceholder
+facade.test) — موتهم 4e كما هو مجدول. **initializeThreadCount** صار تصديراً
من bootstrap (كتابة native + قراءة catalogStore.version) — مندوب خاص B1/B13
على الإله لسطح الاختبار؛ wiring DI يمرر التصدير مباشرة. انحراف معلن: bootstrap
أضف استيرادين (runtimeStore/catalogStore) — وعد صفر-الاستيراد كان نطاق R0.
الأرقام: 312/4989+2/310 ✓؛ عدادات 1732/1731/**1838**/**106**؛ madge 46=46
(A/B عبر stash)؛ tsc 0؛ ModelStore.ts 1,396 → **1,418** (الأزواج+الوثائق
أضافت أكثر مما حذف الأعضاء).
