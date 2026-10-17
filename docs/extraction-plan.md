# خطة الاستخلاص — المرحلة 4 (docs/extraction-plan.md)

> **الحالة**: مُعاد بناؤها في الجلسة 6 بعد إعادة الضبط رقم 6. النسخة الأصلية (commit `99a48bb`)
> ضاعت قبل دفعها — لم تكن موجودة على origin إطلاقاً (`git ls-remote` أثبت غياب فرع
> `fix/modelstore-dissolution`). هذا الملف والجرد المرافق `docs/phase4-members.json`
> أُعيدا بناءهما حتمياً من الكود عند `88a0257`، مع الحفاظ على كل مرساة معتمدة من المالك
> (البنية الطبقية، 9 حالات عابرة بملكية واحدة، الاستراتيجية الثلاثية، ذوبان
> initializeStore في bootstrap، تقسيم 100+78+104=282، ترتيب 4c قبل 4b، 24 دفعة، 950..951).
> كل رقم أدناه مقاس من الشجرة الحالية وليس منسوخاً من الذاكرة.

**الفرع**: `fix/modelstore-dissolution` من `fix/audit-hardening` (`88a0257`).
**خط الأساس المقدس**: 312 suites / 4989 passed + 2 skipped / 310 snapshots / CI EXIT=0 / madge 42 حلقة.

---

## 0) حالة الخطوة 0 (موثقة، ليست فشلاً)

1. `git fetch --unshallow` — **غير مطلوب**: الاستنساخ الجديد كامل التاريخ (FULL-HISTORY، لا `.git/shallow`).
2. مقارنة شجرة `origin/main` (`400e0ea`) بشجرة `88a0257`: **غير فارغة** (41 ملفاً، +477/−2325؛
   main يفتقد `src/store/model/` كاملاً واختبارات العقد وruntimeStore). **السبب**: PR المراحل 1-3
   لم يُدمج بعد. القرار وفق البروتوكول: توثيق فقط — الفرع من `fix/audit-hardening` مقبول،
   والـ PR النهائي يغطي الكل (13 commit فوق main).
3. دفع `99a48bb`: المستحيل — الضياع سبق الدفع. البديل المعتمد: إعادة البناء هذه + دفع فوري
   بأول توكن يعمل (بوابة المصادقة = أول push تجريبي).
4. الدرس المؤسسي المطبق: كل ما يلي يعيش داخل المستودع من اللحظة الأولى.

---

## 1) الجرد الكامل لأعضاء ModelStore (المصدر: docs/phase4-members.json)

`src/store/ModelStore.ts` = 3,716 سطراً؛ الكلاس `160..3714`؛ المفرد `export const modelStore = new ModelStore()` في سطر 3716.

**الإجمالي: 145 عضواً = 138 مفوَّضاً (عقود المرحلة 1 المعتمدة) + 7 غير مغطاة + 0 خارج العقود.**
التحقق الحتمي: 133 عضواً مُحللاً آلياً + 12 عضواً بتواقيع متعددة الأسطر أعاد إلحاقها مسح
التعريفات = 145؛ 138+7=145 ✓ بلا تكرار بين القوائم الثلاث (duplicates = ∅).

| المتجر | أعضاء العقد | الحالة المحفوظة | أمثلة كبرى (أسطر) |
|---|---|---|---|
| `catalogStore` | 39 | models, version, deviceTier, rulesVersion, lastUsedModelId | addHFModel 2837(104L)، fetchAndPersistGGUFMetadata 1862(115L)، deleteModel→القائمة (اعتماد مالك: `models.splice` خالص سطر 2968)، mergeModelLists 963(63L)، resetModels 3065(62L) |
| `downloadStore` | 23 | — (حالتها كلها عابرة) | deleteModel 1740(117L)، verifyDownloadedModel 1627(62L)، checkSpaceAndDownload 1543(46L)، getModelFullPath 1212(83L)، resolveLocalModelPath 1317(48L)، downloadHFModel 2768 |
| `runtimeStore` | 76 | useAutoRelease, contextInitParams, wasAutoReleased, lastAutoReleasedModelId, availableMemoryCeiling, largestSuccessfulLoad, pendingProjectionCleanupIds | initContext 2206(111L)، proceedWithInitialization 2321(289L حتى نهايتها الفعلية)، _releaseContextInternal 2476، startImageCompletion 3498(137L)، getEffectiveContextInitParams 539(120L)، handleAppStateChange 1096(44L) |

**السبعة غير المغطاة + الخاصون (قرارات §2)**: constructor(92L)، initializeStore(85L)،
initializeThreadCount(27L)، initializeGpuSettings(18L)، updateModelStopTokens(63L)،
registerCompletionPromise(3L)، clearCompletionPromise(3L)، + 25 عضواً خاصاً (`private`)
موّزعين حسب النطاق في `phase4-members.json` (مثل resolvePresets/draftRulesManager→catalog؛
proceedWithInitialization/_releaseContextInternal/contextOperationMutex→runtime؛
pendingLocalPathRecoveries/flushPendingLocalPathRecoveries→download)، + مديران تركيبيان:
`draftRulesManager` (DraftRulesManager، 125 سطراً) → catalog، `projectionManager`
(ProjectionModelManager، 369 سطراً) → **جذر التركيب** (يخدم أعضاءً في النطاقات الثلاثة).

### خريطة دفعات 4a (24 دفعة، ترتيب اعتماديات — كل دفعة: ModelStore.test.ts بلا تعديل + suites المتجر والمتأثرات خضراء → commit + bundle + push)

| دفعة | المحتوى (أعضاء بعقودهم) |
|---|---|
| R0 | سقالة bootstrap.ts + الربط بالحقن — §Condition-4 |
| B1 | 18 مُحدد معاملات runtime (setNThreads..setNParallel، 373-533) |
| B2 | عائلة getEffective* الأربع + MIN_CONTEXT_SIZE + max_threads |
| B3 | سطح draft/capabilities: effectiveDraftMode، effectiveDraftCacheDefaults، capabilityEnv، capsFor، activeModelCaps، activeModel، contextId |
| B4 | عائلة auto-release الكاملة (appState، useAutoRelease، wasAutoReleased، lastAutoReleasedModelId، autoReleaseDisabledReasons، enable/disable/update، markAutoReleased، clearAutoReleaseFlags، setupAppStateListener، handleAppStateChange، checkAndReloadAutoReleasedModel) — ملاحظة §3-أ: حالة مفاتيح persist الثلاثة تبقى على الإله الكائن حتى جذور v2 |
| B5 | benchmark: benchmarkActive، enterBenchmarkMode، exitBenchmarkMode |
| B6 | أعلام الإكمال: inferencing، isStreaming، setInferencing، setIsStreaming، registerCompletionPromise، clearCompletionPromise، activeCompletionPromise + **startImageCompletion (المرجع الذاتي 3577 يموت هنا — official −1)** |
| B7 | دورة الحياة 1: contextOperationMutex، pendingModelId، _releaseContextInternal، releaseContext، manualReleaseContext، modelLoadError، clearModelLoadError |
| B8 | دورة الحياة 2: initContext + proceedWithInitialization + resolveMultimodalConfig + resolveDraftConfig + checkMemoryAndConfirm + isContextLoading/loadingModel + activeProjectionModelId + isMultimodalActive + activeRemoteBinding + reinitializeContext |
| B9 | **أُفرغت لصالح §3-أ** (حُسم في B8): availableMemoryCeiling + largestSuccessfulLoad مفتاحا persist — حالتهما لا تنتقل قبل جذري v2؛ المحتوى أُعيد إسناده إلى B22 (يقرؤها runtimeStore عبر البرميل منذ Phase-1، ويكتبها عبره ج20/ذيل ج13 — كلها بمعاهش معلنة) |
| B10 | **منفَّذة (جلسة 9)**: حالة الكتالوج: models، version، deviceTier، rulesVersion، displayModels، availableModels، lastUsedModelId، lastUsedModel، remoteModels — **الجذر `catalogStore:v2` وُلد هنا** (§3-جزء 1) + الاستيراد الإرثي نصف الكتالوجي (§3-جزء 2، تنظيف المفتاح مؤجل إلى B22/4e)؛ ج1/ج15/ج21 ماتت بالقلب إلى المالك، ج2 بقيت عبر التفويض (موتها 4e)، وُلدت ج23/ج24/ج25 |
| B11 | طفرات القائمة: addHFModel، addLocalModel، resetModels، removeModelFromList، removeModelByFullPath، registerOnboardingAssistantModel، mergeModelLists، reconcilePresets، resolvePresets + خاصو preset + draftRulesManager/DraftRulesManager |
| B12 | محدّثات البيانات الوصفية: updateModelName/resetModelName، updateModelChatTemplate/reset، updateModelStopWords/reset، updateModelHash، isModelAvailable، fetchAndUpdateModelFileDetails |
| B13 | GGUF: fetchAndPersistGGUFMetadata + loadMissingGGUFMetadata + healDraftVisionClassification (منتج cleanupQueueBridge) |
| B14 | remote + vision/reasoning: setRemoteModel، setModelVisionEnabled، getModelVisionPreference، setReasoningOverride، recordReasoningObserved + updateModelThinkingCapabilities |
| B15 | عائلة projection-كتالوج: getCompatibleProjectionModels، getDefault/setDefaultProjectionModel، getLLMsUsingProjectionModel، hasRequiredProjectionModel + إعادة إيواء ProjectionModelManager جزء 1 (قراءات runtimeBridge موثقة) |
| B16 | حالة التنزيل + طابور: verifyingModelIds، downloadError، clearDownloadError، activeDownloads، isDownloading، getDownloadProgress، initializeDownloadStatus، refreshDownloadStatuses |
| B17 | دورة التنزيل: checkSpaceAndDownload، cancelDownload، pauseDownload، resumeDownload، retryDownload + **جسر mutationSync (كتل setCallbacks 288-342 تنتقل كتركيب downloadStore)** |
| B18 | ملفات: getModelFullPath، resolveLocalModelPath، checkFileExists، pendingLocalPathRecoveries، flushPendingLocalPathRecoveries، removeInvalidLocalModels |
| B19 | deleteModel (117L) + downloadHFModel + verifyDownloadedModel |
| B20 | عائلة projection-تنزيل: getProjectionModelStatus، canDeleteProjectionModel، getDownloadedLLMsUsingProjectionModel، _downloadProjectionModelIfNeeded، _downloadDraftModelIfNeeded، cleanupOrphanedProjectionModel(s)، drainPendingProjectionCleanup، pendingProjectionCleanupIds — اكتمال cleanupQueueBridge |
| B21 | GPU: initializeGpuSettings، setNoGpuDevices، setDevices، setFlashAttnType، setKvUnified، setNParallel |
| B22 | contextInitParams (محفوظ) + activeContextSettings + initializeThreadCount → تصدير bootstrap |
| B23 | **ذوبان initializeStore في bootstrap** (761-845) + updateModelStopTokens |
| B24 | الشكل النهائي لـ ModelStore.ts: مفرد + مفوضون عكسيون خالصون؛ مسح: صفر مرجع modelStore داخل src/store/model؛ عدادات: official 1732 / real 1731 / raw 1732؛ لقطة madge |

قاعدة الدفعات: الانكسار في ModelStore.test.ts أثناء 4a-4c = تبعية سلوكية حقيقية → توقف وتوثيق، ممنوع إصلاح عبر تعديل الاختبار.

---

## 2) خريطة الحالة عبر النطاقات — صفر تكرار صامت

قاعدة القرار لكل عضو: **move+import** (ينتقل جسده ويستوردَ من مالكه) / **composition-root**
(يعيش في bootstrap.ts) / **documented bridge** (وصول عابر للنطاقات عبر مالك واحد موثق).
ممنوع أي نسخ حالة. الحالات العابرة التسع (ملكية واحدة، إثبات سطري في phase4-members.json):

| # | الحالة | المالك | الوصول العابر الموثق |
|---|---|---|---|
| 1 | `context` | runtime | runtimeBridge: ProjectionModelManager L206/L324 يقرأ عبر مرجع runtime المحقون |
| 2 | `activeModelId` | runtime | runtimeBridge: PM L321 (isActiveModel) |
| 3 | `activeProjectionModelId` | runtime | runtimeBridge: PM L206؛ كتابة runtime فقط (2335/2404/2499) |
| 4 | `isMultimodalActive` | runtime | كتابة حصراً في خط التهيئة (2334/2397/2403/2498)؛ قراءة UI عبر runtimeStore |
| 5 | `downloadError` | download | mutationSync يكتب (L339) + تدفقات التنزيل (1582/1678) |
| 6 | `max_threads` | runtime | bootstrap يكتب عبر initializeThreadCount (349/368؛ يقرأ version الكتالوج للإطلاق الأول) |
| 7 | `verifyingModelIds` | download | verifyDownloadedModel (1630/1683)؛ settlement تنتظره تدفقات حالة التنزيل |
| 8 | `pendingLocalPathRecoveries` | download | resolveLocalModelPath يكتب (1362)؛ flush داخل تدفقات الحالة (1430) |
| 9 | `appState` | runtime | المستمع يكتب (1097-1106)؛ auto-release يستهلك |

حوكمة الصفر-تكرار: كل اسم يُعلن **مرة واحدة بالضبط** في `src/store/model/*.ts`؛ أي وصول
من نطاق آخر يمر عبر المتجر المالك أو جسر موثق بالاسم. **بوابة 4e**: `rg` لكل اسم من
التسعة = تعريف واحد بالضبط — أي تعريف ثانٍ يوقف التنفيذ.

### الجسور الثلاثة (قرارات 4a)

- **mutationSync**: كتل `downloadManager.setCallbacks` (constructor 288-342) تنتقل كتركيب
  داخل downloadStore؛ كتابات حقول catalog (progress/isDownloaded/downloadedAt) تمر عبر
  أعضاء catalogStore العامة — لا كتابة مباشرة لحالة غير مالك.
- **cleanupQueueBridge**: طابور `pendingProjectionCleanupIds` (محفوظ، kill-safe) — المنتج
  `healDraftVisionClassification` (catalog، L703-708)، المستهلك `drainPendingProjectionCleanup`
  (runtime، L726-759) يستدعي deleteModel (download). الملكية: runtimeStore؛ الجسر موثق بالاتجاه catalog→runtime→download.
- **runtimeBridge**: ProjectionModelManager يقرأ host.context/activeModelId/activeProjectionModelId
  (L206/208/321/324) لخدمة أعضاء catalog+download. القرار: المدير يُعاد إيواؤه ويستقبل مرجع
  runtime محقوناً (DI) — القراءة تبقى **موثقة بالاسم في ترويسة المدير**، ليست تكراراً ولا وصولاً صامتاً.

## 3) ملكية مفاتيح mobx-persist + إعادة الترطيب

12 مفتاحاً (makePersistable L263-283، name='ModelStore'، AsyncStorage) تنقسم 5/7:

- `catalogStore` (5): models، version، deviceTier، rulesVersion، lastUsedModelId
- `runtimeStore` (7): useAutoRelease، contextInitParams، wasAutoReleased، lastAutoReleasedModelId، availableMemoryCeiling، largestSuccessfulLoad، pendingProjectionCleanupIds

**الاستراتيجية الثلاثية** (تحقق بند REHYDRATION CLAUSE في العقود الثلاثة):
1. **جذور جديدة مُصدرة الإصدار**: makePersistable لكل متجر مالك (name: `catalogStore:v2` / `runtimeStore:v2`) بنفس الخصائص — ترقية v1.41.x لا تفقد ولا تنزل تفضيلات المستخدم.
2. **استيراد إرث لمرة واحدة**: bootstrap يقرأ مفتاح `ModelStore` الإرثي من AsyncStorage، يوزع الحمولات على الجذور الجديدة، يحترم stored version مقابل MODEL_LIST_VERSION (منطق 782-797 يبقى حرفياً)، ويفشل بأمان (يعيد المحاولة اللاحقة) عند أي خطأ قراءة — لا يُمس المفتاح الإرثي قبل نجاح الاستيراد.
3. **تنظيف المفتاح الإرثي** بعد أول استيراد ناجح كامل.

**§3-أ — قيد اكتشفه B4 (مقفول)**: mobx-persist-store يتجاهل الخصائص المحسوبة عند
الحفظ (حارس `isComputedProp` في startPersisting + تحذير console) — لذلك يُمنع تحويل
أي مفتاح persist إلى زوج وصول قبل إنشاء الجذرين v2: حالته تبقى حقل observable على
الإله الكائن، ومنطق runtimeStore يقرأه/يكتبه عبر ربط البرميل. يبدأ نشر الحالة المحفوظة
إلى runtimeStore مع إنشاء `runtimeStore:v2` (B22+)، لا قبل.
**تنفيذ الجذر الكتالوجي (B10، جلسة 9)**: الجذر الأول `catalogStore:v2` وُلد في B10 —
المتجر كائن عادي (بلا makeAutoObservable) فالحارس `isComputedProp` لا يلتقط أزواج
الوصول فوق الصناديق؛ الترطيب يمر عبر المحددات (كتابة الصندوق) والحفظ يقرأ عبر
الجوالب — الحقلان القابلان للكتابة هنا هما الصندوق نفسه. الجذر الآخر (`runtimeStore:v2`)
يبقى B22 (مفاتيح runtime السبعة لا تزال حقولاً على الإله الكائن).
**الأثر على الدفعات**: B9 أُفرغت بهذا القيد (availableMemoryCeiling + largestSuccessfulLoad
مفتاحا persist) — محتواهما أُعيد إسناده إلى B22؛ لا دفعة runtime متبقية بعد B8 إلا ما
عليه حافة B10 (الكتالوج) — سلّم الدفعات ينتقل B8 → B10 مباشرة منطقياً، وبوابة السلسلة
الثالثة تقام بعد نقطة B9 المفرغة.

**قاعدة mock-compat للأعضاء الحقيقية (مثبتة في B2-B4)**: عضو حقيقي يُستهلك أثناء render
من مكون مهاجر يقرأ حالته عبر getters المتجر نفسه/ربط البرميل (يُسخَّر في suites) —
ممنوع requireHost على مسارات القراءة (لا constructor يعمل في suites البرميل المسخرى؛
الـ host لمسارات الكتابة فقط حتى يُحل B22)؛ optional-chains للمتعاونين الذين قد تغيب
عن mocks جزئية؛ احتياط محمي بالـ host للأعضاء الذين تُعرَّف stub كقيم ثابتة
(الموت القسري 4e — انظر سجل موت الجسور ج3/ج4 في §8).

ترتيب التهيئة في bootstrap: استيراد الإرث → initializeThreadCount → initializeModelSystem —
بنفس ترتيب constructor الحالي (280-285) حرفياً.

## 4) مصير initializeStore والتوقيع الجديد

- اليوم: `initializeStore = async () => {}` (761-845، 85 سطراً) — **لا مستدعينا إنتاج خارجيين**
  (التحقق: الإشارة الوحيدة خارج الكلاس تعليق في useMemoryCheck.ts:101)؛ المستدعي الوحيد:
  persist.then في constructor (L282).
- **المصير**: الذوبان في `src/store/model/bootstrap.ts` باسم `initializeModelSystem` — دفعة B23.
- **التوقيع الجديد**:
  `initializeModelSystem(deps: {catalog: CatalogStore; download: DownloadStore; runtime: RuntimeStore}): Promise<void>`
  — يستقبل المتاجر الثلاثة صراحة (لا التقاط مفردات)؛ ترتيب الخطوات L762-845 محفوظ حرفياً:
  heal → syncWithActiveDownloads → drain → resolvePresets → بوابة version (merge/reconcile) →
  upgradeToFetchedRules بعد التفاعلات → initializeGpuSettings → سقف الذاكرة → loadMissingGGUFMetadata → checkAndReloadAutoReleasedModel.
- بعد 4e يصبح bootstrap جذر التركيب الوحيد: ينشئ/يوصل المفردات الثلاثة ويصدّر initializeModelSystem؛ نقطة دخول التطبيق تستدعيه مكان constructor المفرد القديم.

## 5) بنية الاختبار المركزية (jest.mock + test-utils)

- **اليوم**: `jest/setup.ts` L118 `jest.mock('../src/store', ...)` — سخرية برميلية عامة تبني
  كائناً من `__mocks__/stores/modelStore.ts` (371 سطراً، MockModelStore) + 11 mock مركزياً آخر.
  test-utils.ts **لا يُلمس إطلاقاً** في كل المرحلة 4.
- **4c (قبل 4b — الترتيب معتمد)**: إضافة بحتة — 3 ملفات `__mocks__/stores/{catalog,download,runtime}Store.ts`
  (نمط المركزي الحالي: requireActual + Object.create(real) + jest.fn overrides + defineProperty
  للحالة المظللة بالوصولات — نمط دفعة 8/8 المعتمد) + توسيع factory في setup.ts بثلاثة مفاتيح
  جديدة فقط. **شرط النجاح الفوري**: 5 suites حساسة خضراء (SettingsScreen، ChatScreen،
  IncreaseContextSheet، useChatSession، facade.test) + ModelStore.test.ts بلا تعديل.
- **mock الثلاثية الجديدة تُبنى فوق MockModelStore** (ترث مثيله) حتى تبقى suites الفئة ب
  المت هجرة على سلوك مألوف — لا mock paralel مستقل.
- **مصير `__mocks__/stores/modelStore.ts`**: يبقى طوال 4a-4d (ModelStore.test.ts يعيش عليه)،
  ويُحذف في 4e مع سطر الإخراج من factory (تنظيف كامل — لا مفاتيح ميتة).
- **قاعدة جديدة على الدفعات الجديدة**: AsyncStorage mock محلي داخل كل ملف اختبار جديد + بادئة
  mock للهوِيستنغ + صفر تسجيل بعد اكتمال suites (وروثية).

## 6) خطة تقسيم ModelStore.test.ts (توجيه تكافؤ فقط — صفر حذف assertions)

المصدر: `src/store/__tests__/ModelStore.test.ts` = 6,350 سطراً، 68 describe،
**282 it( عادية + 3 it.each** (المجموع الثابت المرسّى 282 يطابق 100+78+104).

| الجناح المقسم | it( عادية | النطاق |
|---|---|---|
| `src/store/model/__tests__/catalogStore.test.ts` | 100 | describes الخاصة بالكتالوج/البيانات الوصفية/preset/projection-كتالوج |
| `src/store/model/__tests__/downloadStore.test.ts` | 78 | describes الخاصة بالتنزيل/الملفات/الحذف/projection-تنزيل |
| `src/store/model/__tests__/runtimeStore.test.ts` | 104 | describes الخاصة بالسياق/المعاملات/auto-release/benchmark/الإكمال |

- **التكافؤ**: كل describe يُسند بنطاقه (جدول الإسناد يُبنى آلياً من أسماء describes قبل 4d
  ويُعلن رقمه)؛ `modelStore.X` يتحول إلى مرجع المتجر المالك `catalogStore.X` / `downloadStore.X` /
  `runtimeStore.X` — نفس التوقيعات (المفوضون العكسيون من 4a يضمنون التكافؤ السلوكي طوال الطريق).
- كتل it.each الثلاث تسافر مع describe الأم؛ عددها التوسيعي يقاس مباشرة عند 4d ويُعلن.
- **الجناحان الذاتيان يوجَّهان في 4d أيضاً**: localModelPath (38 مرجعاً modelStore) و
  register (10 مراجعات) — إعادة إيواء + تحويل المراجع للمتجر المالك؛ صفر حذف assertions.
- **ModelStore.test.ts الأصلي يُحذف فقط بعد خضوع الأجنحة الثلاثة** (وليس أثناء التقسيم).
- بوابة العدادات بعد 4d: official=1 (سطر FP وحده)، real=0، raw=1.

---

## 8) جدول دورة حياة bootstrap (الدرس المؤسسي — لا غموض معماري عند 4d/4e)

| المرحلة | bootstrap.ts | نقطة الاستدعاء | الـ host المحقون | الحالة/مفاتيح persist |
|---|---|---|---|---|
| **اليوم** (R0→B21) | `ModelSystemDeps` + `initializeModelSystem(deps)` — صفر استيراد؛ يستدعي المُهيئين المحقونين حرفياً | `ModelStore` constructor: `makeAutoObservable` ← `injectRuntimeHost(this)` ← `makePersistable(...).then(() => initializeModelSystem({catalog: this, download: this, runtime: this, initializeStore, initializeThreadCount}))` ← `setupAppStateListener()` ← `downloadManager.setCallbacks(...)` | الإله الكائن نفسه (`this` في الفتحات الثلاثة) — هو تنفيذ النطاقات الثلاثة حتى تنتهي 4a | الـ 12 مفتاحاً كلها على `ModelStore` (name='ModelStore') |
| **بعد B22** | نفس الدالة؛ `initializeThreadCount` تُصدَّر من bootstrap وتُستدعى بمتاجر حقيقية | `persist.then` يبقى قناة الاستدعاء حتى B23؛ الكتابات تمر عبر runtimeStore مباشرة | **الـ host يتقلص**: محددات B1 الـ 16 تكتب حالة runtimeStore الخاصة (بلا host)؛ `initializeThreadCount` المصدَّرة تكتب `runtimeStore.max_threads` و`contextInitParams.n_threads` وتقرأ `catalogStore.version` لبوهية الإطلاق الأول — `injectRuntimeHost` يُحذف | contextInitParams/activeContextSettings على runtimeStore — الجذر `runtimeStore:v2` يبدأ هنا |
| **النهاية** (4e) | جذر التركيب الوحيد: ينشئ المفردات الثلاثة، يوصل الجسور الثلاثة (mutationSync / cleanupQueueBridge / runtimeBridge)، يعلن مفتاحي persist (`catalogStore:v2` / `runtimeStore:v2`)، ينفذ استيراد الإرث لمرة واحدة، ويصدّر `initializeModelSystem` | `App.tsx` ← `initializeModelStores()` (نقطة دخول bootstrap تستدعي `initializeModelSystem`) — لا constructor مفرد، لا إله كائن | لا host — كل متجر يملك حالته؛ الوصول العابر فقط عبر الجسور الثلاثة الموثقة بالاسم | 5 مفاتيح catalog + 7 runtime على الجذرين الجديدین + تنظيف مفتاح `ModelStore` الإرثي بعد أول استيراد ناجح |

ترتيب التهيئة الثابت عبر المراحل الثلاث: استيراد الإرث ← initializeThreadCount ← initializeModelSystem
(بقية الخطوات بترتيب 762-845 حرفياً — انظر §4).

### سجل موت الجسور (لا جسر بلا موت معلن — يُحدَّث عند كل ولادة جسر)

| الجسر العابر | الولادة | الموت المتوقع | كيف يموت |
|---|---|---|---|
| ج1: قراءتا القائمة في activeModel (`modelStore.models/remoteModels` + optional-chains) | B3 | ✅ **B10** | قُلبت القراءتان إلى المالك (`catalogStore.models/remoteModels`) باستيراد مباشر — حافة madge المعلنة؛ الـ optional-chains بقيت (ج4 يموت 4e) |
| ج2: مصدر effectiveDraftMode (`effectiveDraftModeOf(modelStore)`) | B3 | **4e** (مُعدَّل من B10 — جلسة 9) | خيار البقاء عبر زوج التفويض المعلن في هذا السطر: المصدر يقرأ models عبر المفوِّض العكسي (الوصول نفسه يصل المالك)؛ الاستيراد المباشر يتطلب مصدراً كاملاً (activeModel + contextInitParams غير كتالوجيين) |
| ج3: الاحتياط المحمي في activeModel (فرع `modelStore.activeModel` بلا host) | B3 | **4e** (قسري) | آخر mock برميلي جزئي يموت مع 4e؛ وفاة مبكرة suite-by-suite خلال 4b مع هجرة كل suite إلى mock الفصاد |
| ج4: optional-chains على المتعاونين (activeModel/checkAndReload) | B3/B4 | **4e** (قسري) | نفس سبب ج3 — بلا أثر إنتاجياً (القوائم موجودة دائماً) |
| ج5: قراءة reprobe عبر cast من handleAppStateChange | B4 | **B14** | reprobeRemoteCapsIfUnknown تهاجر مع عائلة remote/vision — الاستدعاء يصبح داخلياً (this.) في runtimeStore |
| ج6: كتابات مفاتيح persist عبر ربط البرميل (mark/clear/update) | B4 | **B22** | الجذر `runtimeStore:v2` يستقبل الحالة — الكتابات تصبح this. (§3-أ) |
| ج7: injectRuntimeHost (كتابات contextInitParams في محددات B1) | R0/B1 | **B22** | §8 سطر «بعد B22»: الـ host يُحذف مع هجرة contextInitParams |
| ج8: زوج max_threads على الإله الكائن | B2 | **B22** | الكاتب (initializeThreadCount) يهاجر إلى bootstrap — الزوج يُحذف |
| ج9: ~~قراءات B7 الخاصة عبر cast من enterBenchmarkMode~~ **مات في B7** | B5 | ✅ B7 | الموتكس والإفلات الداخلي أصبحا حالة/دالة وحدة — الاستدعاء محلي مباشر |
| ج10: استيراد chatSessionRepository في runtimeStore (جسم startImageCompletion) | B6 | **4e** (قسري) | حذف ModelStore من البرميل يقطع أي حلقة عبر exportUtils؛ الاستيراد نفسه حقيقي (خدمة لا حالة) — madge لم يحتسبه حلقة جديدة عند القياس (44 ثابتة، انحراف عن إعلان +1 موثق) |
| ج11: ~~قراءة activeCompletionPromise عبر getActiveCompletionPromise~~ **مات في B7** | B6 | ✅ B7 | releaseContext/Internal هاجرتا — القراءة صارت محلية (الصندوق في نفس الوحدة) |
| ج12: قراءات الموتكس/pendingModelId من initContext عبر الماصّات المصدَّرة | B7 | ✅ B8 | initContext تهاجر مع حالتهما — الوصول مباشر (let وحدوي)؛ الماصّات الأربع حُذفت (لا مستهلك خارجي) |
| ج13: كتابات حالة runtime عبر ربط البرميل من releaseContextInternal (engine/activeRemoteBinding/activeModelId/isMultimodalActive/activeProjectionModelId/activeContextSettings/availableMemoryCeiling — 17 سطراً) | B7 | ✅ B8 (B22 لـ activeContextSettings/availableMemoryCeiling) | الحالة الثمانية هاجرت إلى صناديق runtimeStore — الكتابات صارت s.* عبر أزواج الوصول (15 سطراً)؛ سطرا activeContextSettings/availableMemoryCeiling بقيا برميلين (ذيل ج13، B22) |
| ج14: استدعاء الإفلات الداخلي من initContext عبر releaseContextInternal(this) المصدَّرة | B7 | ✅ B8 | initContext تهاجر — الاستدعاء محلي في نفس الوحدة |
| ج15: قراءات models عبر البرميل (resolveMultimodalConfig/resolveDraftConfig/reinitializeContext — 3 أسطر) | B8 | ✅ **B10** | القائمة هاجرت إلى catalogStore — القراءات الثلاث قُلبت إلى المالك باستيراد مباشر (حافة madge المعلنة) |
| ج16: قراءة getModelVisionPreference من resolveMultimodalConfig | B8 | **B14** | العضو يهاجر مع عائلة remote/vision |
| ج17: قراءات getModelFullPath (resolveMultimodalConfig/resolveDraftConfig/proceedWithInitialization — 3 أسطر) | B8 | **B18** | العضو يهاجر مع عائلة الملفات (download) |
| ج18: استدعاءا updateModelStopTokens/updateModelThinkingCapabilities من proceedWithInitialization (cast ضيق — ج5 نمط، غير مرئي للعداد) | B8 | **B23 / B14** | العضوان خاصّان على الإله الكائن؛ يهاجران مع B23/B14 فيصير الاستدعاء محلياً |
| ج19: كتابة activeContextSettings من proceedWithInitialization (برميل) | B8 | **B22** | §3-أ: تبقى على الإله الكائن حتى جذري v2 — الكتابة تنقلب this. |
| ج20: كتابة largestSuccessfulLoad من proceedWithInitialization (برميل) | B8 | **B22** | مفتاح persist — §3-أ: نفس مصير ج19 |
| ج21: كتابة lastUsedModelId من proceedWithInitialization (برميل) | B8 | ✅ **B10** | مفتاح persist كتالوجي — هاجر مع حالة القائمة؛ الكتابة قُلبت إلى `catalogStore.lastUsedModelId` |
| ج23: حارس catalogHost على مفاتيح persist الكتالوجية الخمسة المنقولة (الصندوق عند حقن الـ host، البرميل في suites البرميلية — نمط ج22) | B10 | **4e** (قسري) | suites البرميلية تملك الحالة على الموك المركزي (لا constructor ← لا حقن)؛ موت مبكر suite-by-suite من 4b/4c مع هجرة mock الفصاد |
| ج24: حارس catalogHost على المحتسبات المشتقة الأربعة (displayModels/availableModels/lastUsedModel/remoteModels) — الموك المركزي يحمل حساباته الخاصة وينقصه remoteModels | B10 | **4e** (قسري) | نفس موت ج23 — السقوط يحافظ على سلوك suites حرفياً |
| ج25: استدعاءا الجذر `catalogStore:v2` + الاستيراد الإرثي في constructor الإله (سلك تركيب) | B10 | **4e** | bootstrap يصبح جذر التركيب الوحيد — السلك ينتقل معه (§8 صف النهاية)؛ الدالة نفسها (importLegacyCatalogState) تبقى ملك كتالوجي |
| ج22: حارس قراءة الحالة الثمانية المنقولة (runtimeHost ? box : برميل — نمط ج3) | B8 | **4e** (قسري) | suites البرميلية تملك الحالة على الموك المركزي (لا constructor ← لا host)؛ موت مبكر suite-by-suite من 4b/4c مع هجرة mock الفصاد |

قاعدة السجل: أي جسر جديد يولد في دفعة = سطر جديد هنا في نفس الـ commit؛ جسر بلا موت
معلن = يوقف الدفعة.

## الشرط 1 — مصير اختبارات الفاصاد الستة (محسوم قبل 4d)

**القرار: التحول لا الموت.** الستة تتحول إلى `src/store/model/__tests__/bootstrap.test.ts`
(عقد التركيب + الجسور الثلاثة) بتوجيه تكافؤ assertion-by-assertion:

| اختبار الفاصاد اليوم | مصيره في bootstrap.test.ts |
|---|---|
| 1. سطح download كامل بأنواع أعضاء صحيحة | يبقى حرفياً على downloadStore الحقيقي (بعد 4a هو المالك) |
| 2. سطحا catalog+runtime كاملان | يبقى حرفياً على المالكين الحقيقيين |
| 3. live-state — نفس المراجع لا نسخ | يُعكس اتجاهه: المتاجر الآن مالكو الحالة — identity عبر أسلاك bootstrap (catalogStore.models === bootstrap.wired.models) |
| 4. فخ isDownloading المنحنية (getter يرجع دالة) | يبقى حرفياً على downloadStore |
| 5. نقاء النطاقات — لا تسرب عابر | يبقى حرفياً |
| 6. هوية البرميل — الفاصاد يعيد تصدير نفس المفردات | يتحول لعقد جذر التركيب: bootstrap يوصل نفس المفردات الثلاثة بالضبط (لا مفرد رابع، لا كائن إله) |

**أثر 4e النهائي المحسوم**: **4989 passed + 2 skipped ثابتان** (الستة محفوظون كتحولات) و
**312 suite ثابت** (facade.test.ts −1، bootstrap.test.ts +1). لا تقدير — رقم نهائي.

## الشرط 2 — خريطة تغطية الجسور (مالك اختباري مسمى لكل جسر قبل 4e)

| الجسر | التغطية الضمنية اليوم (ModelStore.test عبر المفرد الحقيقي) | المالك بعد التقسيم 4d | فحص الفجوة |
|---|---|---|---|
| mutationSync | describes التنزيل: مسار onComplete (تحقق/بيانات وصفية) + مسار onError (downloadError) | **download suite** | عند 4d: إذا لم توجد it( تمارس setCallbacks صراحة → suite صغيرة جديدة (اسم: bootstrap.test يغطي الأسلاك + download suite يغطي السلوك) وتُعلن أرقامها قبل التنفيذ |
| cleanupQueueBridge | L447/463 (drain يفرغ الطابور) + L494/505 (احتفاظ in-flight) | **runtime suite** (drain) + **catalog suite** (منتج heal) | نفس البروتوكول — الفجوة تُسد بـ it( في الجناح المالك لا suite مستقلة إن أمكن |
| runtimeBridge | اختبارات canDeleteProjectionModel (قراءة context/active) + مسار vision-change (PM L321-324) | **download suite** (canDelete) | يفحص وجود it( لقراءة السياق عند canDelete؛ فجوة → it( جديدة في download suite بأرقام معلنة |

قاعدة: جسر بلا مالك مسمى عند نهاية 4d = يوقف 4e حتى استيفائه.

## الشرط 3 — حسم رقم 4b قبل بدئها (محسوم)

من `docs/phase4-members.json` (bClass): **الفئة ب = 60 ملفاً / 782 سطراً رسمياً / 781 حقيقياً**
(33 إنتاجاً بـ 279 سطراً + 27 suite اختبار بـ 503؛ FP داخل المجموعة).
(رقم الجلسة 3 القديم 802 كان **أحداثاً** — العداد بالأسطر؛ سطر قد يحوي عدة أحداث.)

الرقم الوحيد المحسوم بعد آخر دفعة 4b — **الثلاثة معاً**:

- **official = 951** (1732 بعد 4a − 781 سطراً حقيقياً مهاجراً؛ يبقى FP التعليق + ModelStore.test 902 + localModelPath 38 + register 10)
- **real = 950** (official − 1 FP)
- **raw = 951** (داخل src/store/model = 0 بعد 4a — التنفيذات الحقيقية لا ترجع modelStore)

المدى القديم 950..951 كان حالة official/real قبل حسم مصير سطر FP — الآن كل رقم مقفول:
post-4a: official 1732 / real 1731 / raw 1732 → post-4b: **951/950/951** → post-4d: 1/0/1 → post-4e: **0/0/0**.

## الشرط 4 — تعريف R0 (محسوم قبل تنفيذها)

**R0 = سقالة + ربط بالحقن، دون نقل أي عضو** — تأكيد ما فهمته بلا زيادة:

1. إنشاء `src/store/model/bootstrap.ts` يحوي فقط: أنواع التركيب
   (`ModelSystemDeps = {catalog; download; runtime}`) + دالة
   `initializeModelSystem(deps)` التي **تستدعي مُهيئاً محقوناً بمعامل** — لا استيراد للمفرد،
   لا نقل جسد، لا سلوك جديد.
2. الربط: constructor في ModelStore.ts (كتلة persist.then 280-283) يستدعي
   `initializeModelSystem({catalog, download, runtime, initializeStore: this.initializeStore, initializeThreadCount: this.initializeThreadCount})` — سلوك مطابق حرفياً.
3. **الأثر المتوقع المقاس**: +1 ملف؛ suites 312 ثابتة؛ اختبارات 4989+2 ثابتة؛
   عدادات **صفر فرق** (official 1733 / real 1732 / raw 1871 — bootstrap بلا أي مرجع
   modelStore. بفضل الحقن)؛ madge: لا حلقات جديدة؛ ModelStore.test.ts بلا تعديل.
4. اختبارات عقد bootstrap تأتي لاحقاً من الستة المحولة (الشرط 1) عند 4d — R0 لا يضيف suite.

---

## 7) سلّم البوابات (الأرقام المتوقعة تُعلن قبل كل بوابة)

| البوابة | suites | passed | official | real | raw | داخل src/store/model | إضافي |
|---|---|---|---|---|---|---|---|
| الآن (بعد R0) | 312 | 4989+2 | 1733 | 1732 | **1878** | **145** | — |
| نهاية 4a (B24) | 312 | 4989+2 | **1732** | 1731 | **1732** | **0** | ModelStore.ts = مفرد + مفوضون عكسيون؛ madge لقطة |
| 4c | 312 | 4989+2 | 1732 | 1731 | 1732 | 0 | +3 mock files؛ 5 suites حساسة خضراء فوراً |
| كل 3 دفعات 4b + نهاية 4b | 312 | 4989+2 | **951** | **950** | **951** | 0 | بوابة سلسلة كاملة (8 شرائح) قبل 4d |
| 4d | 312−1+3؟* | 4989+2 | **1** | **0** | **1** | 0 | تقسيم 100+78+104 + توجيه 38/10 + الستة→bootstrap.test |
| 4e | حسب الشرط 1: **312** | **4989+2** | **0** | **0** | **0** | 0 | حذف الفاصاد+ModelStore+mock المركزي+سطر FP؛ برميل يصدر الثلاثة فقط؛ eslint يمنع modelStore؛ madge ≤42 صفر جديد؛ CI الحقيقي EXIT=0 |

\* إحصاء suites عند 4d: −ModelStore.test، −facade.test، −localModelPath(register يبقى مكان إعادة
إيواه)، +3 أجنحة + bootstrap.test — الرقم النهائي يُعلن قبل بوابة 4d من جدول الإسناد الفعلي
(المرسى: 4989+2 passed ثابتة؛ zero deleted assertions).

> **تسوية عدادية (جلسة 7)**: سطر R0 أعلاه أُعلن وقتها raw=1871/داخل=138 — توقعٌ استخدم عدد
> الأعضاء المفوضين (138) بينما الوصفة المثبتة تعدّ **أسطر** `modelStore.x` داخل `src/store/model`
> (145 عند R0 = 76 runtime + 23 download + 39 catalog + 7 facade.test) ← raw الحقيقي 1733+145=**1878**
> (قياس نفس الشجرة قبل B1 يطابق القياس الحالي). زلة سطر توقع واحد؛ الوصفة ثابتة والسلّم سليم:
> بعد B1 قياساً 1733/1732/**1862**/129 — وبعد B2 المتوقع 1733/1732/**1856**/**123**.
>
> **دفتر madge لـ 4a (السقف يُعلن مرة واحدة)**: 42 (R0) → 44 (B1، حلقتان عابرتان
> ModelStore↔runtimeStore: مباشرة عبر type-import + عبر برميل store/index — تفكك B24) →
> 44 ثابتة عبر B2..B9 (أعضاء runtime، لا حواف جديدة؛ B3 كله runtime حتى capabilityEnv الخاص؛
> B8: حافة ModelStore→useMemoryCheck ماتت مع هجرة hasEnoughMemory عبر checkMemoryAndConfirm،
> ووُلدت runtimeStore→useMemoryCheck مكانها — تبديل داخل نفس العنقود؛ الحلقة المعدودة تبادلت
> ممثلها فقط: 44 بالضبط قبل وبعد، مقيساً)
> → 46 عند B10 (**مقيس 46 بالضبط — جلسة 9**؛ أول حافة ModelStore→catalogStore:
> المباشر في ModelStore.ts + البرميل؛ استيراد runtimeStore→catalogStore المباشر
> (ج1/ج15/ج21) لم يضف حلقةً ثالثة — العنقود المعدود نفسه) → 47 عند B15 (برميل catalog
> يموت مع آخر مرجع pass-through) → **48 = السقف** عند B16 (أول حافة ModelStore→downloadStore)
> → 47 عند B20 (برميل download) → 46 عند B23 (برميل runtime) → **42 بالضبط** عند B24
> (حواف type-guard الثلاث تموت مع استبدال دروع الانجراف).

### بروتوكولات ثابتة (موروثة + مثبتة في هذا الملف)

- بعد كل commit: bundle نجاة `git bundle create` + verify، ثم push (فرع feature = نسخ احتياطي).
- commitlint: feat/fix/docs/chore فقط، ≤100 حرف، lowercase.
- التشغيل مجزأ في المقدمة فقط — ممنوع خلفي.
- التحقق بـ Read/od فقط؛ بعد أي فشل جزئي: git diff فوراً؛ أي مفاجأة = توقف وتوثيق.
- الأرقام: تُعلن قبل كل بوابة؛ أي انحراف يُشرح مصدره قبل إعلان الاكتمال.
- تهيئة البيئة بعد كل إعادة ضبط حاوية (الإعداد محلي ويموت مع الضبط):
  `git config core.fileMode=false` — يمنع 1,999 artifact وهمياً في git status
  (بقايا أنماط ملفات؛ صفر تغيير محتوى). المطبق فعلياً منذ جلسة step0-d.
- نهاية 4e بعد آخر push ناجح: الرد الحرفي `REVOKE` (استهلاك التوكن: حقن URL فقط، لا طباعة).
