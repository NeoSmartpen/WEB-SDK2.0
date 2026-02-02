type ZlibLike = {
  deflate?: (
    input: Uint8Array,
    options: { level?: number },
    callback: (err: unknown, result: ArrayBufferLike | Uint8Array) => void
  ) => void;
  unzip?: (input: Uint8Array, callback: (err: unknown, result: ArrayBufferLike | Uint8Array) => void) => void;
};

function tryLoadNodeZlib(): ZlibLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zlib = require("zlib") as ZlibLike;
    if (zlib?.deflate && zlib?.unzip) return zlib;
    return null;
  } catch {
    return null;
  }
}

async function transformWithStream(
  data: Uint8Array,
  args: { mode: "compress" | "decompress"; format: "gzip" | "deflate" }
): Promise<Uint8Array> {
  const { mode, format } = args;

  const globalAny = globalThis as any;
  const StreamCtor = mode === "compress" ? globalAny.CompressionStream : globalAny.DecompressionStream;
  if (!StreamCtor) {
    throw new Error(`${mode === "compress" ? "CompressionStream" : "DecompressionStream"} is not available`);
  }

  const stream = new Blob([data]).stream().pipeThrough(new StreamCtor(format));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function unzipAsync(data: Uint8Array): Promise<Uint8Array> {
  const zlib = tryLoadNodeZlib();
  if (zlib) {
    return new Promise((resolve, reject) => {
      zlib.unzip!(data, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new Uint8Array(res as any));
      });
    });
  }

  const isGzip = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
  const format = isGzip ? "gzip" : "deflate";
  return transformWithStream(data, { mode: "decompress", format });
}

export async function deflateAsync(data: Uint8Array, level = 9): Promise<Uint8Array> {
  const zlib = tryLoadNodeZlib();
  if (zlib) {
    return new Promise((resolve, reject) => {
      zlib.deflate!(data, { level }, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new Uint8Array(res as any));
      });
    });
  }

  return transformWithStream(data, { mode: "compress", format: "deflate" });
}

