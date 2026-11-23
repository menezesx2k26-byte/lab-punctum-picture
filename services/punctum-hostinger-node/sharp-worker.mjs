import sharp from 'sharp';

const imageLimits = { limitInputPixels: 40_000_000, failOn: 'warning' };

export async function readImageInfo(bytes, mark = () => {}) {
  const image = sharp(bytes, imageLimits);
  mark('media-metadata-start');
  const { width, height, format } = await image.metadata();
  mark('media-metadata-end');
  mark('media-decode-start');
  await image.stats();
  mark('media-decode-end');
  return { width, height, format, fileSize: bytes.length };
}

export async function transformImage(bytes, { resize, format, quality }) {
  return sharp(bytes, imageLimits).autoOrient().resize(resize).toFormat(format, { quality }).toBuffer();
}

if (process.argv[2] === '--qa-sharp') {
  // A managed host may expose more CPUs than the plan can use.
  sharp.concurrency(1);
  const [, , , action, encodedOptions] = process.argv;
  const chunks = [];
  let size = 0;
  let output;
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 26_214_400) throw new Error('Image input exceeds the upload limit');
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks, size);
    if (action === 'info') {
      output = Buffer.from(JSON.stringify(await readImageInfo(input)));
    } else if (action === 'transform') {
      output = await transformImage(input, JSON.parse(encodedOptions));
    } else {
      throw new Error('Unknown image operation');
    }
  } catch {
    process.exitCode = 2;
  }
  if (output) process.stdout.write(output);
}
