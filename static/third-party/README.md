# Third-party runtime notices

These notices cover the client and Cloudflare server output built with the versions in `bun.lock`. The server output includes external package imports that the Cloudflare deployment bundles. Recheck the notices when dependencies or the build change.

| Component | Version | License | Runtime output |
| --- | --- | --- | --- |
| [Svelte](https://github.com/sveltejs/svelte) | 5.57.3 | [MIT](svelte.txt) | Client and server |
| [SvelteKit](https://github.com/sveltejs/kit) | 2.70.4 | [MIT](sveltekit.txt) | Client and server |
| [adapter-cloudflare](https://github.com/sveltejs/kit/tree/main/packages/adapter-cloudflare) | 7.2.10 | [MIT](adapter-cloudflare.txt) | Server worker |
| [Worktop](https://github.com/lukeed/worktop) | 0.8.0-next.18 | [MIT](worktop.txt) | Server worker cache modules |
| [devalue](https://github.com/sveltejs/devalue) | 5.9.4 | [MIT](devalue.txt) | Server |
| [cookie](https://github.com/jshttp/cookie) | 0.6.0 | [MIT](cookie.txt) | Server |
| [set-cookie-parser](https://github.com/nfriedly/set-cookie-parser) | 3.2.2 | [MIT](set-cookie-parser.txt) | Server |
| [clsx](https://github.com/lukeed/clsx) | 2.1.1 | [MIT](clsx.txt) | Server |
| [Inter](https://github.com/rsms/inter) | 4.66 | [SIL OFL 1.1](../fonts/Inter-OFL.txt) | Client font |

SvelteKit's server SHA-256 implementation is attributed to the [Stanford Javascript Crypto Library](https://github.com/bitwiseshiftleft/sjcl) and states that it is modified and redistributed under the BSD license. The [BSD-2-Clause notice](sjcl-bsd.txt) is from SJCL's [license file](https://github.com/bitwiseshiftleft/sjcl/blob/master/LICENSE.txt).

The installed Worktop package contains no license file. Its package metadata identifies version 0.8.0-next.18 and MIT; the notice is from the [matching upstream release](https://github.com/lukeed/worktop/blob/v0.8.0-next.18/license). The adapter's prebuilt worker identifies the bundled Worktop cache source paths and version.
