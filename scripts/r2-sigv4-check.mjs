/* Verify src/lib/r2.ts SigV4 against AWS's own published presigned-URL vector.
 * Runs offline — proves the signing maths before any R2 account exists. */
import { buildPresignedUrl, rfc3986, amzStamp } from
  '../src/lib/r2.ts';

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        got:  ${got}`); console.log(`        want: ${want}`); }
};

/* AWS "Signature calculation for a presigned URL" worked example.
   GET https://examplebucket.s3.amazonaws.com/test.txt, 86400s expiry. */
const url = buildPresignedUrl({
  method: 'GET',
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
  amzDate: '20130524T000000Z',
  expiresIn: 86400,
});
const sig = new URL(url).searchParams.get('X-Amz-Signature');
check('AWS presigned-URL vector signature', sig,
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');

check('credential scope in query',
      new URL(url).searchParams.get('X-Amz-Credential'),
      'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
check('signed headers', new URL(url).searchParams.get('X-Amz-SignedHeaders'), 'host');

/* RFC3986: encodeURIComponent leaves !'()* alone, S3's canonical form does not. */
check('rfc3986 escapes !', rfc3986("a!b"), 'a%21b');
check('rfc3986 escapes ()*', rfc3986("a()*b"), 'a%28%29%2Ab');
check("rfc3986 escapes '", rfc3986("a'b"), 'a%27b');
check('rfc3986 escapes space', rfc3986('a b'), 'a%20b');

/* Path segments encode individually so the separators survive. */
const spaced = buildPresignedUrl({
  method: 'PUT', host: 'h.example', path: '/bucket/onboarding/42/gallery/a b(1).jpg',
  accessKeyId: 'AK', secretAccessKey: 'SK', region: 'auto', service: 's3',
  amzDate: '20260831T120000Z', expiresIn: 3600,
});
check('path keeps slashes, escapes space and parens',
      new URL(spaced).pathname, '/bucket/onboarding/42/gallery/a%20b%281%29.jpg');

/* amzStamp shape. */
check('amzStamp', amzStamp(new Date('2026-08-31T12:00:00.000Z')), '20260831T120000Z');

/* Signing content-type must appear in SignedHeaders, sorted, host first. */
const typed = buildPresignedUrl({
  method: 'PUT', host: 'h.example', path: '/b/k.jpg',
  signedHeaders: { 'content-type': 'image/jpeg' },
  accessKeyId: 'AK', secretAccessKey: 'SK', region: 'auto', service: 's3',
  amzDate: '20260831T120000Z', expiresIn: 3600,
});
check('content-type is signed', new URL(typed).searchParams.get('X-Amz-SignedHeaders'),
      'content-type;host');

/* Multipart UploadPart query params must survive into the signed URL. */
const part = buildPresignedUrl({
  method: 'PUT', host: 'h.example', path: '/b/k.mov',
  query: { partNumber: '7', uploadId: 'abc~123' },
  accessKeyId: 'AK', secretAccessKey: 'SK', region: 'auto', service: 's3',
  amzDate: '20260831T120000Z', expiresIn: 7200,
});
const pq = new URL(part).searchParams;
check('partNumber survives', pq.get('partNumber'), '7');
check('uploadId survives', pq.get('uploadId'), 'abc~123');

/* Determinism: same inputs must give the same signature. */
check('deterministic', buildPresignedUrl({
  method: 'PUT', host: 'h.example', path: '/b/k.jpg', accessKeyId: 'AK',
  secretAccessKey: 'SK', region: 'auto', service: 's3',
  amzDate: '20260831T120000Z', expiresIn: 3600,
}), buildPresignedUrl({
  method: 'PUT', host: 'h.example', path: '/b/k.jpg', accessKeyId: 'AK',
  secretAccessKey: 'SK', region: 'auto', service: 's3',
  amzDate: '20260831T120000Z', expiresIn: 3600,
}));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
