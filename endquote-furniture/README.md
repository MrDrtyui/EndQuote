# EndQuote Furniture Library

Twelve furniture assets built, inspected, refined, and exported in Blender 5.3 through Blender MCP for the EndQuote cleaning configurator.

Project directory: `/Users/ila/dev/projects/renameme/endquote-furniture`.

## SaaS service

`/owner` is the business workspace; `/admin` is the separate subscription console. Registration creates an owner, onboarding creates a draft with a 14-day trial, and publication opens `/<slug>` to customers. `/chistodom` remains the browser-local demo. Orders are KZT estimates; a requested date is not a confirmed booking.

**Local setup:** use Node 24 LTS, PostgreSQL 17+, and a dedicated private S3-compatible bucket. Install with `npm ci` here and in `server/`. Export the settings in `server/.env.example` from a private environment file. Use the migration role only for schema management; the runtime role needs table DML, not ownership, superuser or schema creation. With `APP_ORIGIN=http://127.0.0.1:3000`:

```sh
npm run build
cd server
npm run generate
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate status
npm run build
node dist/src/grants.js   # grant table/column access to the pre-created runtime role
npm start
```

The Node service serves the compiled SPA and API on one origin. For Vite development, set the API server’s `APP_ORIGIN=http://127.0.0.1:5173` and run `npm run dev` in the frontend. Opening `http://localhost:5173` redirects the browser to that canonical address so login, cookies and callback URLs use the same host. To use localhost as the canonical name instead, export `APP_ORIGIN=http://localhost:5173` for both processes. Bootstrap the first administrator in a local terminal with `npm run admin:bootstrap` in `server/`; the password prompt is hidden. Subscription changes require a reason and are versioned and audited.

**Verification:** `npm test` runs the frontend domain tests. In `server/`, `npm run test:disposable` creates unique loopback-only PostgreSQL/MinIO containers, builds, runs API and desktop/mobile checkout tests, rehearses migration/restore to new targets, and removes its labeled containers and volumes. Requires an already running local Docker daemon, standalone `docker-compose`, `pg_dump`/`pg_restore`, Chrome (`CHROME_PATH` overrides the macOS default), and locally available `postgres:17` and MinIO images (`EQ_TEST_MINIO_IMAGE` selects the local tag). No shared DSN or bucket is used.

**Packaging:** `Dockerfile` builds both packages. `compose.yaml` includes a one-shot migration job, private DB/storage network and loopback-only app port. Set strong independent `MIGRATION_PASSWORD`, `RUNTIME_PASSWORD` (URL-safe), `STORAGE_ADMIN`, `STORAGE_PASSWORD`, `SESSION_SECRET`, HTTPS `APP_ORIGIN` and `S3_*` values outside source control. Provision the bucket and scoped storage identity before use. Terminate TLS at a proxy that preserves the approved Host, limits body size and upload time, and strips incoming forwarding headers. Set `TRUSTED_PROXY_IP` only for a known proxy address. Avoid access logs containing query strings, headers, files or contact details. `/healthz` is liveness and `/readyz` checks DB and bucket.

**Media and recovery:** staged photos expire after 24 hours; hourly cleanup retries failed object deletes. `npm run storage:reconcile` additionally scans the dedicated bucket with an operator listing grant. Orders and attached photos are retained until an operator-approved removal; review retention duration and customer consent before launch. Back up PostgreSQL and private objects at a consistent point with writes paused; restore to a new DB and bucket, compare line snapshots and SHA-256 of attachment bytes before switching traffic. Rotate DB/object credentials separately; rotating `SESSION_SECRET` invalidates checkout grants and CSRF challenges. Revoke owner/admin sessions in the database when invalidating logins.

### EndQuote Admin (internal console)

The administrator console is available at `/admin`, independently from the business owner account. Bootstrap the first admin using `npm run admin:bootstrap` in `endquote-furniture/server` after migrations and building. The bootstrap command requires a terminal and `MIGRATION_DATABASE_URL`; it asks for an administrator email and password. There is **no default password or preset 6-digit code**.

Set an independent `ADMIN_TOTP_KEY` (64 hexadecimal characters; generate with `openssl rand -hex 32`) in the **server** environment. It encrypts TOTP secrets at rest with AES-256-GCM and must be backed up separately. Losing the key locks admins out of their second factor. Rotating the key requires an intentional migration of encrypted secrets. Never commit the key, MFA secrets, or passwords to Git.

On first sign-in, the admin enrolls a 6-digit TOTP authenticator (Google Authenticator, 1Password, Microsoft Authenticator, etc.) using the setup key and enters a fresh code to activate MFA. Subsequent logins require an authenticator code. Subscription changes require recent confirmation by password and a new TOTP code. Codes are replay-protected and the admin API refuses to serve business data before successful MFA. Only administrative business metadata and subscription history are exposed; orders and private photos are excluded.

The admin API uses session cookie, CSRF/origin checks, server-side authorization and an audit log. **Before production**, add a private-network access control such as Tailscale or an equivalent trusted proxy for `/admin` and `/api/admin/*`; validate recovery and key backup procedures, test security controls with production-like TLS, and run the complete test suite. Development at localhost is not proof of production readiness.

## Files to integrate

- `public/models/<id>.glb`: the twelve runtime assets.
- `public/previews/<id>.webp`: matching 512 × 512 studio thumbnails.
- `public/manifest.json`: Russian names, categories, URL paths, measured dimensions, triangle counts, exact byte sizes, material counts, draw calls, seat metadata, and SHA-256 hashes.
- `manifest.json`: identical project-level manifest.
- `sources/<id>.blend`: twelve individual editable sources; original objects/materials and the optimized mobile version are stored in separate scenes.
- `previews/<id>.webp`: the twelve requested project previews, identical to their public copies.
- `endquote-library.blend`: the full working library checkpoint.

Copy the contents of `public/` into the application's public directory. Manifest URLs then resolve as `/models/<id>.glb` and `/previews/<id>.webp`. Total GLB payload is **1,802,392 bytes** for all twelve items.

## Approved two-seater preservation

The approved `sofa-2-seater` was not redesigned, reshaped, simplified, or recolored. Its public GLB is byte-for-byte identical to the previously approved file:

`178fb12be5cd6ed4d7c2431a9c4f3eb713dedbc9133db9d911c96bca9e38717f`

Its original vertices, faces, normals, UVs, transforms, and material settings also match the pre-work live signature. A complete backup and live Blender checkpoint were saved before modeling; the location is recorded in `preservation-baseline.json`. The original `endquote-sofas.blend` and root-level GLBs remain unchanged. Those root-level files are the earlier collection; the mobile integration files are in `public/models/`.

**Preservation exception:** the approved two-seater retains 10,908 triangles, four materials, and sixteen draw calls. This exceeds the new triangle/material targets because exact preservation was the critical requirement. Its 432,020-byte GLB is below the 500 KB practical ceiling. All other models are below 5,000 triangles and 300 KB.

## Measured runtime assets

Dimensions are width × depth × height in meters. KB below uses 1,000 bytes. GLB faces are triangles.

| ID | Dimensions, m | Triangles | KB | Materials / draws |
|---|---|---:|---:|---:|
| `sofa-2-seater` | 1.816 × 0.965 × 0.916 | 10,908 | 432.0 | 4 / 16 |
| `sofa-3-seater` | 2.453 × 0.964 × 0.916 | 3,324 | 169.3 | 2 / 2 |
| `sofa-4-seater` | 3.069 × 0.964 × 0.916 | 4,012 | 202.1 | 2 / 2 |
| `sofa-l-shaped` | 2.603 × 1.844 × 0.916 | 3,524 | 180.1 | 2 / 2 |
| `sofa-u-shaped` | 3.595 × 2.044 × 0.916 | 4,720 | 241.9 | 2 / 2 |
| `sofa-bed` | 1.817 × 2.278 × 0.916 | 3,952 | 195.0 | 2 / 2 |
| `armchair` | 1.111 × 0.964 × 0.915 | 1,832 | 96.6 | 2 / 2 |
| `dining-chair` | 0.480 × 0.559 × 0.945 | 1,080 | 57.8 | 2 / 2 |
| `ottoman` | 0.631 × 0.631 × 0.438 | 1,104 | 58.3 | 2 / 2 |
| `mattress-single` | 0.900 × 2.000 × 0.249 | 864 | 42.7 | 1 / 1 |
| `mattress-double` | 1.600 × 2.000 × 0.249 | 864 | 42.6 | 1 / 1 |
| `upholstered-headboard` | 1.700 × 0.170 × 1.180 | 1,728 | 84.0 | 1 / 1 |

The L sectional has three positions and a continuous right chaise when facing the sofa. The U sectional has five positions including both end chaises. The sofa-bed shows its deployed sleeping platform and three folding mattress panels. Mattresses are approximately 0.90 × 2.00 m and 1.60 × 2.00 m.

## Geometry and materials

New mobile assets are simplified copies of editable source geometry. The approved two-seater is excluded from that process. Cushion divisions, silhouettes, soft edge profiles, and relative dimensions are retained. Sub-millimeter welting tubes are preserved in source and omitted from the new mobile exports to avoid unnecessary geometry and seam artifacts.

Upholstery/frame color differences are stored as linear vertex colors with a white PBR base factor, allowing a single cloth draw call. Oak is the second material where needed. Mattresses and headboard use one material/draw. Keep the exported vertex colors enabled when reusing or replacing materials. Each asset embeds one shared-style 128 × 128 normal map; there are no external textures, transparency, displacement, animation, or procedural shader dependencies. No Draco or Meshopt compression/decoder is used.

Each GLB has one identity root and one or two material-group mesh children, except the untouched approved asset. All furniture transforms are baked. The separate source parts remain descriptively named and editable.

## Coordinates and loading

One unit equals one meter. GLBs use **Y up**, face **+Z**, and are centered across X/Z bounds with the floor at Y = 0. Blender sources use Z up and face −Y. Place the root on the floor at scale 1; no recentering or corrective rotation is required. Cameras, lights, and backgrounds are excluded from all GLBs and retained only in Blender preview scenes.

Use the WebP thumbnails for the furniture selection grid and load the selected GLB into the configurator. Ordinary Three.js GLTFLoader / React Three Fiber loading requires no compression decoder or custom cloth shader. PBR scene lighting is supplied by the application.

## Verification and repeatable checks

- All twelve mobile models were rendered and visually inspected at 512 × 512, including cushion counts, category silhouette, support/contact, and clipping.
- Every delivered GLB was imported back into Blender and rendered again. Triangle/material/component counts, vertex colors, dimensions, orientation, and floor centering matched the actual runtime assets.
- Every individual source `.blend` was read back through Blender's library reader. All WebP previews decoded at 512 × 512.
- `library-verification.json` records binary/accessor/index checks, nondegenerate triangles, normals, UVs, tangents, vertex colors, PBR factors, decoded embedded-PNG integrity, transform/origin checks, budgets, manifest consistency, and preservation hashes.
- `library-three-loader-verification.json` records Three.js 0.187 GLTFLoader geometry loading, including vertex-color material activation. This Node check omits texture bindings only in memory; it is not a browser render test.
- `reports/mobile-roundtrip.json` and `reports/roundtrip/` contain the Blender round-trip checks and renders.
- `reports/source-and-preservation-verification.json` records the twelve source readbacks and unchanged approved source/GLB signatures.

From this directory, run the independent asset checker with system Python 3; no third-party packages are needed:

```sh
python3 tools/verify_library.py public/models --manifest manifest.json
```

`tools/browser-check.html` is a self-contained optional browser check with all twelve GLBs and Three.js embedded. Open it in a WebGL-capable desktop browser; it reports original-byte hashes, embedded image decoding, rendered geometry, and pixel checks. No network or local HTTP server is required. The tool and packaging evidence are outside `public/`.

Browser execution was unavailable during the initial asset-generation pass. Later real-browser rendering checks are documented in `reports/showcase/` and `reports/booking/`; physical Android performance remains unmeasured. See `reports/browser/availability.json`. Test the final configurator on target phones before release; these geometry budgets are not a frame-rate guarantee. The acceptance checker is not the complete Khronos conformance suite. Assets are generic furniture classifications, not manufacturer-specific measurements.


## Local Furniture Lab showcase

This directory also contains an isolated React, TypeScript, Vite, Tailwind CSS, and React Three Fiber preview application. It is a test interface for browsing the furniture library and inspecting selected models. The editable Blender sources and asset documentation above remain independent of the application.

Use Node.js 22.12 or newer and npm. Run commands from `endquote-furniture/`:

```sh
npm install
npm run dev
```

Open the furniture inspection lab at **http://localhost:5173/lab**. The public storefront is at **http://localhost:5173/chistodom**. The development server uses a strict port; an existing process on 5173 must be stopped before starting another instance.

```sh
npm run build
npm run preview
```

`build` checks TypeScript and creates the application bundle in `dist/`. `preview` serves that build at **http://localhost:4173/chistodom** (or `/lab` for furniture inspection). These commands provide local previews; deployment is a separate operation.

The catalogue reads `public/manifest.json` dynamically, including model URLs, thumbnails, dimensions, and geometry statistics. Cards use lightweight WebP previews. The 3D engine is loaded when the viewer opens, and only the selected GLB is fetched. Changing selection aborts its previous download and releases resources owned by that viewer. Imported PBR materials and vertex colors are preserved.

Drag or use one finger to rotate; scroll or pinch to zoom. The focused canvas supports arrow keys, plus/minus, and Home. **Сбросить вид** restores the fitted front three-quarter camera. Rendering runs on demand with device pixel ratio capped at **1.5**. Loading failures and unavailable WebGL show the furniture preview with a retry action.

### Showcase checks

With the development server running, run:

```sh
npm run test:showcase
```

The browser checks use installed Chrome or Playwright Chromium and write screenshots and the current result to `reports/showcase/e2e-report.json`. Set `SHOWCASE_URL` for another server or `CHROME_EXECUTABLE_PATH` for a specific browser executable. Inspect the report's status before claiming acceptance. Desktop and emulated mobile checks complement testing on physical target phones.

The showcase acceptance run rendered all twelve models in desktop Chrome and passed search/filter, focus restoration, orbit/reset, 390 × 844 touch-emulation, DPR-cap, and unavailable-WebGL fallback checks. Physical-device performance remains unmeasured. The latest detailed evidence is in `reports/showcase/e2e-report.json`.


## Публичная витрина услуг

Основной клиентский интерфейс — постоянная витрина **http://localhost:5173/chistodom**. Старый адрес `/clean/chistodom` приводит к `/chistodom`. На `/` находится маркетинговая страница EndQuote. Каталог и стартовые цены доступны сразу, без приветственного экрана, анкеты или обязательного оформления заказа.

Витрина содержит профиль «ЧистоДом», описание, зону обслуживания, контакты и социальные ссылки. Это вымышленный бизнес: номер в карточке контактов — пример, социальные ссылки ведут на главные страницы сервисов. Реальные контакты задаются в `src/booking/company.ts`.

Клиент может открыть одну из 12 моделей, повернуть её, выбрать количество, ткань, загрязнение и дополнительные услуги. Предварительная цена рассчитывается сразу. Корзина поддерживает несколько предметов, редактирование и удаление. На мобильных устройствах её сумма закреплена внизу, когда добавлена хотя бы одна услуга.

### Модули

- `src/booking/BusinessProfile.tsx`: переиспользуемый профиль с контактами и соцссылками.
- `src/booking/company.ts`: типизированные демонстрационные данные бизнеса.
- `src/booking/pricing.ts`: тарифы в тенге и независимый расчёт. Цена за единицу = базовая цена + надбавка за ткань + надбавка за загрязнение + выбранные услуги; количество умножает всю стоимость. Надбавки округляются до 100 ₸.
- `src/booking/Configurator.tsx`: вертикальный 3D-конфигуратор с параметрами чистки.
- `src/booking/basket.ts`: локальный черновик корзины; ключ `endquote.demo.basket.chistodom.v1`.
- `src/booking/ContactForm.tsx`: проверка имени, номера Казахстана, адреса, даты и необязательных фотографий.
- `src/booking/orders.ts`: браузерное хранилище демо-заявок; ключ `endquote.demo.orders.v1`. Цена и состав фиксируются при сохранении, номер имеет вид `EQ-...`.

Корзина восстанавливается при обновлении. После демо-оформления ссылка с `?order=<id>` показывает сохранённое подтверждение в том же браузере. Фотографии (до трёх JPG/PNG/WebP) уменьшаются в браузере и сохраняются с заявкой. Ошибка заполненного или недоступного хранилища не выдаётся за успешное оформление.

Это клиентский прототип. Нет API, реального получения заявок компанией, авторизации, платежей, подписок, кабинета исполнителя или инфраструктуры нескольких компаний. На форме и подтверждении явно указано, что заявка демонстрационная и никуда не отправлена.

### Запуск и проверка

Требуется Node.js 22.12+ (проверено на Node.js 26).

```sh
npm install
npm run dev
npm test
npm run test:booking
npm run build
```

`npm test` проверяет тарифы, надбавки, количество, даты/телефоны, сохранение снимка заявки, повреждённые данные и отказ хранилища. `npm run test:booking` проходит реальный клиентский путь в Chrome на 360, 390 и 1440 px: профиль → услуги → 3D → конфигурация → корзина → контакты → демо-подтверждение → обновление страницы. Также проверяются все WebP и 12 GLB, вращение мышью/касанием, DPR до 1.5, отсутствие переполнения, фильтры, фото, сохранение корзины и режим без WebGL. Отчёт и снимки экрана находятся в `reports/booking/`.

Проверка браузера использует установленный Chrome на macOS. Настоящие устройства и встроенные браузеры Instagram/WhatsApp требуют отдельной проверки перед выпуском. Исходные GLB и Blender-файлы не изменяются приложением. Приложение работает локально; домен `endquote.kz` не публиковался.

## Маркетинговая страница EndQuote

**http://localhost:5173/** — лендинг для мастеров и сервисных компаний. Он объясняет постоянную витрину по ссылке из соцсетей: каталог → конфигурация → предварительная стоимость → заявка. Существующие `/chistodom`, `/clean/chistodom` и `/lab` сохранены.

- `src/marketing/MarketingApp.tsx`: главная страница, навигация, каналы размещения ссылки, преимущества, ранний доступ, FAQ и контакты.
- `src/marketing/StudioPreview.tsx`: три студийных предмета с реальными базовыми тарифами из `booking/pricing.ts`. Стрелки, клавиатура и свайп переключают предмет; кнопка **360°** открывает работающий конфигуратор именно этой модели.
- `src/marketing/Workflow.tsx` и `ClientDemo.tsx`: три шага создания витрины и интерактивный пример «ЧистоДом». На телефоне активное демо использует нативный масштаб интерфейса.
- `src/marketing/ui.tsx`: фирменный знак, рубрикация и нативные диалоги с возвратом клавиатурного фокуса.
- `src/marketing/content.ts`: контактные данные команды, ссылка WhatsApp с подготовленным текстом, описание раннего доступа и ответы FAQ. Email — `dryuicode@gmail.com`, WhatsApp — `+77088056548`. Кнопки только открывают почту или чат.
- `src/marketing/marketing.css`: графитовые и бумажные поверхности, цитроновый акцент, адаптивная сетка и поддержка уменьшенного движения. Кириллические и латинские начертания Manrope и IBM Plex Mono поставляются локально с лицензиями в `public/marketing/type/`.
- `public/marketing/study-*.webp`: студийные рендеры на основе геометрии каталога; `/marketing/configurator.webp` — снимок действующего приложения. Для повторного рендера нужен Blender и `cwebp`: `blender -b --factory-startup -P tools/render_marketing.py`. Для сборки и запуска сайта Blender не нужен. Студийные материалы и свет не записываются в GLB или исходники Blender.

Первый экран не загружает iframe, Three.js или GLB. Интерактивный блок монтирует реальное приложение после нажатия. Адрес `/chistodom?embed=marketing&stage=catalog|model|price|request` открывает соответствующее состояние существующих компонентов. Необязательный `model` выбирает предмет по ID из манифеста. Корзина превью изолирована в памяти и не изменяет черновик самостоятельной витрины. Явно отправленная демо-заявка сохраняется в том же браузере; серверных запросов сохранения нет.

Тарифы, самостоятельное создание страниц и кабинет обозначены как будущие возможности. Подписок, коммерческих цен и регистрации нет. Юридические ссылки открывают уведомление о готовящихся документах, а не выдают за них опубликованные условия. Основные SEO- и Open Graph-метаданные находятся в `index.html`; публичный домен и canonical нужно настроить при реальном развёртывании.

```sh
npm run dev
npm run test:marketing
npm run test:booking
npm test
npm run build
```

Проверка маркетинга на 360, 390, 768 и 1440 px проходит загрузку превью, отсутствие горизонтального переполнения и ранней загрузки 3D, реальное вращение в iframe, расчёт 9 000 → 18 000 ₸, изоляцию корзины, форму заявки, FAQ, юридические уведомления и переход в полный каталог. Контактные URL проверяются без отправки сообщений. Результаты и снимки находятся в `reports/marketing/`; SHA-256 исходных 24 GLB/Blender-файлов сравниваются с сохранённой базой. Полный клиентский путь отдельно проверяет `test:booking`.

## Почта и социальный вход

Конфигурацию читает сервер при запуске. Используйте отдельные ключи для каждого окружения. В Compose передайте значения через переменные процесса или закрытый файл окружения. В публичном клиенте ключи не используются.

| Сервис | Настройка |
| --- | --- |
| Resend | Добавьте домен отправителя в Resend, опубликуйте предложенные DNS-записи и дождитесь подтверждения. Создайте ключ с правом отправки для этого домена. Передайте его как `RESEND_API_KEY`, адрес отправителя как `MAIL_FROM`. Отключите отслеживание переходов для писем авторизации, чтобы сохранить фрагмент ссылки. |
| Google | В Google Auth Platform настройте аудиторию и экран согласия. Создайте OAuth-клиент типа «Веб-приложение». Добавьте точный URI возврата `{APP_ORIGIN}/api/auth/social/google/callback`. Задайте `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`. В тестовом режиме добавьте тестовые адреса в аудиторию. |
| Apple | В Apple Developer включите Sign in with Apple для основного App ID. Привяжите к нему Services ID, зарегистрируйте HTTPS-домен и точный Return URL `{APP_ORIGIN}/api/auth/social/apple/callback`. Services ID укажите в `APPLE_CLIENT_ID`. Создайте ключ Sign in with Apple для основного App ID. Передайте подписанный клиентский JWT в `APPLE_CLIENT_SECRET`. Для отправки писем пользователям Hide My Email зарегистрируйте отправителя в Apple Private Email Relay. |

Здесь `{APP_ORIGIN}` означает полный внешний origin без завершающего слеша. Для Apple нужен публичный HTTPS-домен. Обратный прокси должен передавать POST формы Apple и исходный Origin. Кнопка входа становится активной после настройки соответствующего провайдера.

Чтобы создать клиентский JWT для Apple, из каталога `server` задайте `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` и `APPLE_KEY_PATH` (путь к закрытому файлу .p8). Команда ниже помещает секрет в окружение текущего shell. Перенесите его в хранилище секретов приложения и обновите до истечения 90 дней.

```sh
export APPLE_CLIENT_SECRET="$(node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises'
import {importPKCS8, SignJWT} from 'jose'
const e = process.env
const key = await importPKCS8(await readFile(e.APPLE_KEY_PATH, 'utf8'), 'ES256')
const secret = await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:e.APPLE_KEY_ID})
  .setIssuer(e.APPLE_TEAM_ID).setSubject(e.APPLE_CLIENT_ID)
  .setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('90d').sign(key)
process.stdout.write(secret)
JS
)"
```

Миграция `202611200001_account_security` сохраняет владельцев и сессии. Ранее зарегистрированным владельцам нужно подтвердить адрес для публикации, изменения данных бизнеса и доступа к заявкам. Черновик витрины можно создать до подтверждения. После миграций выполните стандартный шаг выдачи прав `node dist/src/grants.js` от роли миграции. Compose выполняет этот шаг автоматически.

Ссылки подтверждения действуют час, восстановления — 30 минут. Для первичного подтверждения откройте ссылку после входа в соответствующий аккаунт. Смена адреса и восстановление пароля завершают все сеансы. Для управления связанными аккаунтами требуется вход в течение последних десяти минут. Если способ входа единственный, перед отключением настройте пароль через письмо или подключите другой доступный способ.

Для изолированной проверки используйте Node 24 и `cd server && npm run test:disposable` с локальными Docker-образами, указанными в `tests/disposable.mjs`. Тесты используют тестовый почтовый транспорт и локально подписанные ответы провайдеров. Для проверки реальной интеграции в отдельном тестовом окружении пройдите регистрацию, откройте письмо и выполните полный вход каждым настроенным провайдером.
