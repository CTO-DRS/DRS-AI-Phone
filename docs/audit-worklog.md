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
