import { rootCertificates } from 'node:tls';
import { writeFileSync } from 'node:fs';
// libpq needs a PEM file. Keep the trust roots aligned with Node's bundled public CA set.
writeFileSync(new URL('../dist/native-ca.pem', import.meta.url), rootCertificates.join('\n')+'\n');
