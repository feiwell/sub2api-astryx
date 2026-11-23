# Third-party notices

This source release contains a React frontend and selected Sub2API modules. Its manifest and lockfile identify the JavaScript packages to install. The project notice identifies the upstream revision, dated modifications and LGPL-3.0-or-later license. [NOTICE](NOTICE) · [Package manifest](package.json) · [Lockfile](pnpm-lock.yaml)

## Templates and icons

| Material | Origin and terms | License text |
| --- | --- | --- |
| Astryx admin pages | `src/pages/admin/AdminAnnouncementsPage.tsx`, `AdminDashboardPage.tsx`, `AdminPluginsPage.tsx` and `AdminPromoCodesPage.tsx` retain Meta's copyright headers for adapted template code. Astryx 0.7.16 uses MIT. | [Astryx MIT](licenses/astryx-MIT.txt) · [Upstream version](https://github.com/meta/astryx/blob/v0.7.16/LICENSE) |
| Astryx code highlighting | `@astryxdesign/core` credits the authors of the syntax color palettes used by its code display components. The package lists the upstream themes and their MIT license. | [Astryx syntax theme credits](licenses/astryx-syntax-themes.md) · [Upstream version](https://github.com/meta/astryx/blob/v0.7.16/packages/core/src/theme/syntax/THIRD_PARTY_LICENSES.md) |
| Heroicons | The warning triangle in `src/pages/public/NotFoundPage.tsx` matches `ExclamationTriangleIcon` in `@heroicons/react` 2.2.0. The app also imports Heroicons components. Tailwind Labs, Inc. licenses them under MIT. | [Heroicons MIT](licenses/heroicons-MIT.txt) · [Upstream version](https://github.com/tailwindlabs/heroicons/blob/v2.2.0/LICENSE) |
| Lucide and Feather | `lucide-react` 1.73.0 uses ISC for Lucide icons. Its license lists the Feather-derived icons and credits Cole Bemis under MIT. Keep both parts when distributing the icons. | [Lucide and Feather licenses and icon list](licenses/lucide-feather.txt) · [Upstream version](https://github.com/lucide-icons/lucide/blob/1.73.0/LICENSE) |

## Provider names and artwork

The monitor and home pages use text or neutral graphics to identify providers. The standalone favicon is a neutral gateway drawing. The source release omits the old `providerMarkPaths.ts`, `providerMarks.tsx` and `antigravityPatches.ts` artwork, sponsor images under `assets/partners/`, and the payment-method SVGs under `frontend/src/assets/icons/`. Use artwork you have permission to distribute when configuring a site logo.

The original monitor vectors came through Sub2API's `frontend/src/components/user/monitor/ProviderIcon.vue`, `components/common/ModelIcon.vue` and `components/common/PlatformIcon.vue`. Six provider outlines and all eleven Antigravity color patches matched drawing data in `@lobehub/icons` 4.12.0. The OpenAI, Kimi, Zhipu and DeepSeek outlines differed from that package's corresponding monochrome path strings. LobeHub publishes the collection under MIT. Each provider controls its own marks. Before reintroducing artwork, check its source and the owner's usage terms. [LobeHub license at the published revision](https://github.com/lobehub/lobe-icons/blob/3d6c44584223c1b7d036a925f74cdb4ef84dabe8/LICENSE) · [OpenAI brand guidelines](https://openai.com/brand/)

The original OAuth controls embedded Google and GitHub drawings. Operators enabling Google Sign-In should use a button that satisfies Google's app verification requirements. Google provides a rendered button and pre-approved assets. [Google Sign-In branding guidelines](https://developers.google.com/identity/branding-guidelines) · [GitHub brand guidelines](https://brand.github.com/foundations/logo)

## Payment SDKs

**Stripe.** `@stripe/stripe-js` 9.17.0 is Stripe's MIT-licensed loading wrapper. Its notice identifies Stripe as the copyright holder. For PCI compliance, Stripe requires loading the payment runtime directly from `js.stripe.com`. [Wrapper license](licenses/stripe-js-MIT.txt) · [Stripe's distribution and hosting guidance](https://github.com/stripe/stripe-js/blob/v9.17.0/README.md#stripejs-as-a-commonjs-module-or-es-module)

**Airwallex.** When an Airwallex checkout is ready, `src/lib/airwallexSdk.ts` loads the payment SDK on demand from `https://static.airwallex.com/components/sdk/v1/index.js`. Airwallex serves the script directly to the browser. Switching to the CDN removed the npm wrapper and tracker from the release manifest and lockfile. [Airwallex CDN installation guide](https://www.airwallex.com/docs/js)

**Earlier Airwallex npm integration.** `@airwallex/components-sdk` 1.36.0 declared MIT, and its `@airwallex/airtracker` 3.2.0 dependency declared ISC. These license identifiers apply to those npm releases. Their archives omitted separate Airwallex copyright-and-permission notices. If a downstream build reintroduces either package, check the applicable attribution with the publisher and retain the notices accompanying the code, including Microsoft's helper notice when bundling the wrapper. [SDK manifest](https://registry.npmjs.org/@airwallex/components-sdk/1.36.0) · [Tracker manifest](https://registry.npmjs.org/@airwallex/airtracker/3.2.0) · [Microsoft helper notice from the earlier wrapper](licenses/airwallex-microsoft-helpers.txt)

## Additional direct dependencies

The versions below come from the standalone manifest. The versioned npm manifests and installed runtime packages supplied the license identifiers checked on November 23, 2026.

| Packages | Declared license |
| --- | --- |
| `@astryxdesign/core` 0.7.16, `@astryxdesign/theme-neutral` 0.7.16 | MIT. The theme package supplies the same notice as the tagged repository. [Astryx MIT](licenses/astryx-MIT.txt) |
| `@stylexjs/stylex` 0.19.2 | MIT. [StyleX MIT](licenses/stylex-MIT.txt) · [Publisher's release revision](https://github.com/facebook/stylex/blob/d7e6174c5384c64b87bc5fde1f57eedd7c11c5aa/LICENSE) |
| `react` 19.3.1, `react-dom` 19.3.1, `react-router` 7.18.5, `zustand` 5.1.0, `@vue/reactivity` 3.5.45 | MIT |
| `axios` 1.21.1, `chart.js` 4.6.1, `react-chartjs-2` 5.3.1, `marked` 18.2.0, `qrcode` 1.5.4 | MIT. `react-chartjs-2` includes both `LICENSE` and `LICENSE.md`. |
| `dompurify` 3.4.18 | MPL-2.0 **or** Apache-2.0, at the recipient's choice. [DOMPurify release license](https://github.com/cure53/DOMPurify/blob/37abc335c6a0aad2ac4f9dce6bd256d40c17acc4/LICENSE) |

The build and test packages in the manifest declare MIT except TypeScript 5.9.3, which declares Apache-2.0 and carries `ThirdPartyNoticeText.txt`. Each dependency retains its own license. [Build and test package versions](package.json)

## Distributing a build

When sharing source, keep the dated modification notice, original copyright notices, both GNU license texts and the third-party notices with it. [NOTICE](NOTICE) · [COPYING.LESSER](COPYING.LESSER) · [COPYING](COPYING)

For a downloadable bundle, container or JavaScript sent to browsers, give recipients access to the license texts and the corresponding source for that exact build, including its build inputs. A source archive next to the build is one way to provide these materials. Include the standalone frontend changes in that archive. Check the modules and transitive dependencies included in the build and carry their applicable notices. LGPL section 4 describes the conditions for a combined work, including how recipients can use a modified library. [GPL sections 5–6](COPYING) · [LGPL sections 3–4](COPYING.LESSER)
