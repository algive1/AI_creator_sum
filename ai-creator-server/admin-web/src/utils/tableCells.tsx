import type { ReactNode } from 'react';
import { Tooltip, Typography } from 'antd';

const { Text } = Typography;

interface EllipsisTextProps {
  value: unknown;
  maxWidth?: number | string;
  fallback?: ReactNode;
  strong?: boolean;
  code?: boolean;
  type?: 'secondary' | 'success' | 'warning' | 'danger';
}

export function formatTableTime(value: unknown): string {
  return String(value || '').replace('T', ' ').replace(/\.\d{3}Z?$/, '').replace(/Z$/, '');
}

export function EllipsisText({
  value,
  maxWidth = 180,
  fallback = '-',
  strong = false,
  code = false,
  type,
}: EllipsisTextProps) {
  const text = String(value ?? '').trim();
  if (!text) return <Text type="secondary">{fallback}</Text>;
  return (
    <Tooltip title={text}>
      <Text
        strong={strong}
        code={code}
        type={type}
        ellipsis
        style={{ display: 'block', maxWidth, minWidth: 0 }}
      >
        {text}
      </Text>
    </Tooltip>
  );
}

export function TimeText({ value }: { value: unknown }) {
  return <Text style={{ whiteSpace: 'nowrap' }}>{formatTableTime(value)}</Text>;
}

export const nowrapActionStyle = { whiteSpace: 'nowrap' } as const;
