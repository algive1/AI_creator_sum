// src/utils/response.ts
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, ErrorCodes } from '../types';

export function success<T>(res: Response, data?: T, message = 'success'): void {
  res.json({ code: ErrorCodes.SUCCESS, message, data, requestId: uuidv4() } as ApiResponse<T>);
}

export function paginated<T>(res: Response, list: T[], total: number, page: number, pageSize: number): void {
  res.json({
    code: ErrorCodes.SUCCESS,
    message: 'success',
    data: {
      list,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    },
    requestId: uuidv4(),
  });
}

function normalizeErrorCode(code: unknown): number {
  return typeof code === 'number' && Number.isFinite(code) ? code : ErrorCodes.SERVER_ERROR;
}

export function error(res: Response, code: unknown, message: string, httpStatus = 200, data: unknown = null): void {
  res.status(httpStatus).json({ code: normalizeErrorCode(code), message, data, requestId: uuidv4() } as ApiResponse);
}

export function deprecated(res: Response, message: string): void {
  res.status(410).json({
    code: 410,
    message,
    data: null,
    requestId: uuidv4(),
  } as ApiResponse);
}
