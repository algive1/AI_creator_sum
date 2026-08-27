import fs from 'fs';
import type { Request, Response } from 'express';

interface ByteRange {
  start: number;
  end: number;
}

function parseRangeHeader(header: unknown, size: number): ByteRange | null {
  const value = String(header || '').trim();
  if (!value || !value.startsWith('bytes=') || size <= 0) return null;
  const firstRange = value.slice(6).split(',')[0].trim();
  const match = firstRange.match(/^(\d*)-(\d*)$/);
  if (!match) return null;

  let start = match[1] ? Number.parseInt(match[1], 10) : NaN;
  let end = match[2] ? Number.parseInt(match[2], 10) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;

  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else if (Number.isNaN(end) || end >= size) {
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end };
}

export function rangeRequestHeaders(req: Request): Record<string, string> | undefined {
  const range = String(req.headers.range || '').trim();
  return range ? { Range: range } : undefined;
}

export function streamLocalFileWithRange(
  req: Request,
  res: Response,
  filePath: string,
  mimeType: string,
  cacheControl: string,
): void {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const requestedRange = String(req.headers.range || '').trim();
  const range = parseRangeHeader(requestedRange, size);

  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', cacheControl);

  if (requestedRange && !range) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${size}`);
    res.end();
    return;
  }

  if (range) {
    const chunkSize = range.end - range.start + 1;
    res.status(206);
    res.setHeader('Content-Length', String(chunkSize));
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', String(size));
  fs.createReadStream(filePath).pipe(res);
}

export function pipeRemoteFileResponse(
  res: Response,
  response: any,
  mimeType: string,
  cacheControl: string,
): void {
  const status = Number(response.status || 200);
  if (status === 206) res.status(206);

  res.setHeader('Content-Type', mimeType || response.headers?.['content-type'] || 'application/octet-stream');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Accept-Ranges', response.headers?.['accept-ranges'] || 'bytes');

  const contentLength = response.headers?.['content-length'];
  if (typeof contentLength === 'string' || typeof contentLength === 'number') {
    res.setHeader('Content-Length', contentLength);
  }
  const contentRange = response.headers?.['content-range'];
  if (typeof contentRange === 'string') {
    res.setHeader('Content-Range', contentRange);
  }

  response.data.pipe(res);
}
